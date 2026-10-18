import 'server-only';
import type { DbClient } from '@/lib/db';
import { hashInput } from '@/lib/ai/claude';
import { env, features } from '@/lib/env';
import { haversineKm } from '@/lib/geo';
import { LEAD_ROLES, type Segment } from '@/lib/constants';
import { linkedinSearchUrl, safeUrl, truncate } from '@/lib/text';
import type { AppSettings } from '@/modules/settings/types';
import { PROMPT_VERSIONS, runContactPicker, runQualifier, type ContactsOutput, type QualifierOutput } from './agents';
import type { SearchFilters } from './filters';
import { distanceFactor, extractPeople, rulesContacts, rulesQualifier, totalScore, verdictKans, type Evidence } from './rules';
import { lookupKvk } from './kvk';

export interface EnrichmentData {
  pages?: { url: string; title?: string; text?: string }[];
  search?: { query?: string; title?: string; url?: string; description?: string }[];
  emails?: string[];
  phones?: string[];
  linkedIns?: string[];
  people?: { name?: string; role?: string; email?: string; source?: string }[];
}

interface CompanyRow {
  id: string;
  name: string;
  segment: Segment;
  categories: string[];
  description: string;
  address: string;
  city: string;
  province: string;
  phone: string;
  website: string;
  domain: string | null;
  reviews: number;
  rating: number | null;
  lat: number | null;
  lng: number | null;
  familie: string;
  state: string;
  enrichment: EnrichmentData;
  kvk: { nummer: string; sbi: string[]; employees: string } | null;
  kvk_nummer: string | null;
}

export interface QualifyContext {
  admin: DbClient;
  settings: AppSettings;
  filters: SearchFilters;
  runId: string | null;
  profileId: string | null;
}

export interface QualifyResult {
  queued: boolean;
  aiCost: number;
  kans: 'A' | 'B' | 'C';
  score: number;
}

const KANS_RANK = { A: 0, B: 1, C: 2 } as const;

// Most informative pages first: home, about, services/warehouse/logistics, vacancies, contact (deep runs collect up to 15)
const PAGE_PRIORITY: [RegExp, number][] = [
  [/^[a-z]+:\/\/[^/]+\/?$/i, 0],
  [/over-?ons|about|wie-zijn|bedrijf|organisatie|historie|geschiedenis/i, 1],
  [/diensten|services|logistiek|logistics|warehous|opslag|distributie|crossdock|fulfil|transport/i, 2],
  [/vacature|werken-bij|careers|jobs/i, 3],
  [/contact|team|locatie|vestiging/i, 4],
  [/nieuws|news|blog/i, 5],
];
function rankPages<T extends { url: string }>(pages: T[]): T[] {
  const rank = (url: string) => PAGE_PRIORITY.find(([re]) => re.test(url))?.[1] ?? 9;
  return [...pages].sort((a, b) => rank(a.url) - rank(b.url));
}

export function buildEvidence(company: CompanyRow, settings: AppSettings): Evidence {
  const e = company.enrichment ?? {};
  const distanceHomeKm =
    company.lat !== null && company.lng !== null ? Math.round(haversineKm(settings.home, { lat: company.lat, lng: company.lng })) : null;
  return {
    name: company.name,
    segment: company.segment,
    categories: company.categories ?? [],
    description: company.description ?? '',
    address: company.address,
    city: company.city,
    province: company.province,
    phone: company.phone,
    website: company.website,
    reviews: company.reviews,
    rating: company.rating,
    distanceHomeKm,
    familie: company.familie,
    pages: rankPages(e.pages ?? []).slice(0, 8).map((p) => ({ url: safeUrl(p.url) || p.url, title: p.title ?? '', text: p.text ?? '' })),
    search: (e.search ?? []).slice(0, 24).map((s) => ({ query: s.query ?? '', title: s.title ?? '', url: s.url ?? '', description: s.description ?? '' })),
    emails: e.emails ?? [],
    phones: e.phones ?? [],
    linkedIns: e.linkedIns ?? [],
    people: (e.people ?? []).filter((p) => p.name).map((p) => ({ name: p.name ?? '', role: p.role ?? '', email: p.email ?? '', source: p.source ?? '' })),
    kvk: company.kvk,
  };
}

// Adds people named on the website (name + role + e-mail) to the evidence, for the agents and the rules
export function withPeople(ev: Evidence): Evidence {
  const extra = extractPeople(ev.pages, ev.emails).filter((p) => !ev.people.some((q) => q.name === p.name));
  return extra.length ? { ...ev, people: [...ev.people, ...extra] } : ev;
}

// The text the agents read. Website pages are capped so one company stays well under ~10k tokens.
function evidenceText(ev: Evidence): string {
  const listing = {
    naam: ev.name,
    segment_regels: ev.segment,
    google_categorieen: ev.categories,
    beschrijving: ev.description,
    adres: ev.address,
    plaats: ev.city,
    provincie: ev.province,
    telefoon: ev.phone,
    website: ev.website,
    google_reviews: ev.reviews,
    rating: ev.rating,
    afstand_tot_mek_km: ev.distanceHomeKm,
    kvk: ev.kvk,
  };
  // A local model on a laptop CPU reads ~40 tokens/s: give it the best pages only (~2k tokens instead of ~4k)
  const local = env.aiProvider === 'ollama';
  let budget = local ? env.ollamaEvidenceChars : 14000;
  const perPage = local ? 2500 : 4000;
  const pages = ev.pages
    .map((p) => {
      const text = truncate(p.text.replace(/\s+/g, ' '), Math.max(0, Math.min(perPage, budget)));
      budget -= text.length;
      return text ? `### ${p.title || p.url}\nURL: ${p.url}\n${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
  const search = ev.search.map((s) => `- [${s.query}] ${s.title} — ${s.description} (${s.url})`).join('\n');
  const contacts = {
    emails: ev.emails.slice(0, 15),
    telefoons: ev.phones.slice(0, 8),
    linkedin: ev.linkedIns.slice(0, 5),
    personen: ev.people.slice(0, 10),
  };
  return [
    '## Vermelding (Google Maps)',
    JSON.stringify(listing, null, 1),
    '## Websitepagina’s',
    pages || '(geen website-tekst gevonden)',
    '## Zoekresultaten (signalen)',
    search || '(geen zoekresultaten)',
    '## Gevonden contactgegevens',
    JSON.stringify(contacts, null, 1),
  ].join('\n\n');
}

function sanitiseVerdict(v: QualifierOutput): QualifierOutput {
  const clampCrit = (c: QualifierOutput['criteria'][keyof QualifierOutput['criteria']]) => ({
    score: Math.max(0, Math.min(1, Number(c.score) || 0)),
    evidence: truncate(c.evidence ?? '', 400),
    source: c.source === 'vermelding' ? 'vermelding' : safeUrl(c.source) || 'vermelding',
  });
  return {
    ...v,
    criteria: {
      palletFlows: clampCrit(v.criteria.palletFlows),
      volume: clampCrit(v.criteria.volume),
      multiDrop: clampCrit(v.criteria.multiDrop),
      growth: clampCrit(v.criteria.growth),
      family: clampCrit(v.criteria.family),
      dataQuality: clampCrit(v.criteria.dataQuality),
    },
    signals: v.signals.filter((s) => s.text && safeUrl(s.url)).slice(0, 8).map((s) => ({ ...s, url: safeUrl(s.url), text: truncate(s.text, 300) })),
    reasons: v.reasons.slice(0, 5).map((r) => ({
      text: truncate(r.text, 200),
      evidence: truncate(r.evidence, 300),
      source: r.source === 'vermelding' ? 'vermelding' : safeUrl(r.source) || 'vermelding',
    })),
    waarom: truncate(v.waarom, 600),
    aanpak: truncate(v.aanpak, 600),
    risks: v.risks.slice(0, 5).map((r) => truncate(r, 200)),
    estimated_trucks: Math.max(0, Math.min(20, Math.round(Number(v.estimated_trucks) || 0))),
    // English texts for English-language users (texts_en); a small local model may leave them out
    en: {
      waarom: truncate(v.en?.waarom ?? '', 600),
      aanpak: truncate(v.en?.aanpak ?? '', 600),
      reasons: (v.en?.reasons ?? []).slice(0, 5).map((r) => truncate(String(r), 200)),
      risks: (v.en?.risks ?? []).slice(0, 5).map((r) => truncate(String(r), 200)),
    },
  };
}

async function logUsage(ctx: QualifyContext, agent: string, model: string, tokens: number, cost: number) {
  if (cost <= 0) return;
  await ctx.admin.from('usage_log').insert({
    run_id: ctx.runId,
    profile_id: ctx.profileId,
    provider: 'claude',
    agent,
    units: tokens,
    cost_usd: cost,
    meta: { model },
  });
}

// Qualify one company (B.7 steps 5-6): verdict, score, kans, contacts, review queue.
export async function qualifyCompany(companyId: string, ctx: QualifyContext): Promise<QualifyResult | null> {
  const { admin, settings, filters } = ctx;
  const { data: company } = await admin.from('companies').select('*').eq('id', companyId).maybeSingle<CompanyRow>();
  if (!company) return null;

  // Optional KvK enrichment (only once per company)
  if (env.kvkApiKey && !company.kvk) {
    const kvk = await lookupKvk(company.name, company.city);
    if (kvk) {
      company.kvk = { nummer: kvk.nummer, sbi: kvk.sbi, employees: kvk.employees };
      const { error } = await admin.from('companies').update({ kvk: company.kvk, kvk_nummer: kvk.nummer }).eq('id', company.id);
      if (error) await admin.from('companies').update({ kvk: company.kvk }).eq('id', company.id); // KvK number already on another row
    }
  }

  const ev = withPeople(buildEvidence(company, settings));
  // The LinkedIn company page / news article that led to this company (web discovery) is evidence too
  const { data: webFinds } = await admin.from('web_leads').select('source, title, url, snippet').eq('company_id', company.id).order('created_at', { ascending: false }).limit(4);
  for (const w of webFinds ?? []) {
    if (!ev.search.some((s) => s.url === w.url)) ev.search.unshift({ query: w.source === 'linkedin' ? 'LinkedIn-bedrijfspagina' : 'nieuws / persbericht', title: w.title, url: w.url, description: w.snippet });
  }
  const text = evidenceText(ev);
  let aiCost = 0;

  // 1. Qualifier
  const ai = features.ai ? await runQualifier(settings.product, settings.weights, text) : null;
  const verdict = sanitiseVerdict(ai?.output ?? rulesQualifier(ev));
  const mode = ai ? 'agent' : 'regels';
  aiCost += ai?.costUsd ?? 0;

  const dist = distanceFactor(ev.distanceHomeKm, settings.home.serviceRadiusKm);
  const score = totalScore(verdict.criteria, dist, settings.weights);
  const kans = verdictKans(score, verdict.is_logistics, settings.kans);

  await admin.from('evaluations').insert({
    company_id: company.id,
    run_id: ctx.runId,
    agent: 'qualifier',
    model: ai?.model ?? 'regels',
    prompt_version: PROMPT_VERSIONS.qualifier,
    input_hash: hashInput(text),
    fit_score: score,
    kans,
    output: { ...verdict, distanceFactor: dist, weights: settings.weights },
    input_tokens: ai?.inputTokens ?? 0,
    output_tokens: ai?.outputTokens ?? 0,
    cost_usd: ai?.costUsd ?? 0,
  });
  if (ai) await logUsage(ctx, 'qualifier', ai.model, ai.inputTokens + ai.outputTokens, ai.costUsd);

  for (const signal of verdict.signals) {
    await admin.from('company_signals').upsert(
      { company_id: company.id, type: signal.type, text: signal.text, url: signal.url },
      { onConflict: 'company_id,type,text', ignoreDuplicates: true },
    );
  }

  // 2. Contacts
  let contacts: ContactsOutput;
  const hasContactData = ev.emails.length + ev.people.length + ev.phones.length > 0;
  // Local models: the rules contact picker (named people + roles from the website) is good and saves minutes per company
  const contactAi = features.ai && env.aiProvider !== 'ollama' && hasContactData ? await runContactPicker(text) : null;
  if (contactAi) {
    contacts = contactAi.output;
    aiCost += contactAi.costUsd;
    await admin.from('evaluations').insert({
      company_id: company.id,
      run_id: ctx.runId,
      agent: 'contacts',
      model: contactAi.model,
      prompt_version: PROMPT_VERSIONS.contacts,
      input_hash: hashInput(text),
      output: contacts,
      input_tokens: contactAi.inputTokens,
      output_tokens: contactAi.outputTokens,
      cost_usd: contactAi.costUsd,
    });
    await logUsage(ctx, 'contacts', contactAi.model, contactAi.inputTokens + contactAi.outputTokens, contactAi.costUsd);
  } else {
    contacts = rulesContacts(ev, company.domain);
  }

  // Only keep contact data that actually appears in the evidence (no invented addresses)
  const knownEmails = new Set(ev.emails.map((e) => e.toLowerCase()).concat(ev.people.map((p) => p.email.toLowerCase())));
  const clean = (email: string) => (email && knownEmails.has(email.toLowerCase()) ? email.toLowerCase() : '');
  const rows = [
    ...(contacts.primary ? [{ ...contacts.primary, primary: true, rank: 1 }] : []),
    ...contacts.backups.map((c, i) => ({ ...c, primary: false, rank: i + 2 })),
    ...(contacts.general_email && contacts.general_email !== contacts.primary?.email
      ? [{ name: '', role: 'Algemeen', email: contacts.general_email, phone: company.phone, source_url: company.website, primary: !contacts.primary, rank: 9 }]
      : []),
  ];
  await admin.from('contacts').delete().eq('company_id', company.id);
  const contactRows = rows
    .map((c) => ({
      company_id: company.id,
      name: truncate(c.name ?? '', 120),
      role: truncate(c.role ?? '', 120),
      email: clean(c.email ?? ''),
      phone: (c.phone ?? '').slice(0, 40),
      source_url: safeUrl(c.source_url) || company.website,
      linkedin_search_url: c.name ? linkedinSearchUrl(company.name, c.name) : linkedinSearchUrl(company.name, c.role || LEAD_ROLES[0]),
      is_primary: c.primary,
      rank: c.rank,
    }))
    .filter((c) => c.name || c.email || c.phone);
  // Unique (company, email, name)
  const seen = new Set<string>();
  const unique = contactRows.filter((c) => {
    const key = `${c.email}|${c.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (unique.length) await admin.from('contacts').insert(unique);

  // 3. Queue decision
  const famMismatch =
    filters.familie !== 'any' && verdict.familie !== 'onbekend' && verdict.familie !== filters.familie;
  const { data: queueRow } = await admin.from('review_queue').select('state').eq('company_id', company.id).maybeSingle();
  const alreadyDecided = queueRow?.state === 'approved' || (queueRow?.state === 'rejected' && filters.skipRejected);
  const meetsKans = KANS_RANK[kans] <= KANS_RANK[filters.minKans];
  const queue = company.state !== 'lead' && !alreadyDecided && meetsKans && verdict.is_logistics && !famMismatch;

  await admin
    .from('companies')
    .update({
      segment: verdict.segment,
      familie: verdict.familie,
      fit_score: score,
      kans,
      criteria: verdict.criteria,
      score_reasons: verdict.reasons,
      risks: verdict.risks,
      waarom: verdict.waarom,
      aanpak: verdict.aanpak,
      texts_en: verdict.en.waarom ? verdict.en : null,
      qualified_at: new Date().toISOString(),
      qualified_mode: mode,
      state: company.state === 'lead' ? 'lead' : queue ? 'queued' : company.state === 'queued' ? 'queued' : 'seen',
      updated_at: new Date().toISOString(),
    })
    .eq('id', company.id);

  if (queue) {
    await admin.from('review_queue').upsert(
      { company_id: company.id, profile_id: ctx.profileId, run_id: ctx.runId, state: 'new', reason: '', created_at: new Date().toISOString() },
      { onConflict: 'company_id' },
    );
  }

  return { queued: queue, aiCost, kans, score };
}

