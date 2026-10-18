import type { Segment } from '@/lib/constants';
import { stripDiacritics } from '@/lib/text';
import type { KansSettings, WeightSettings, HomeSettings } from '@/modules/settings/types';
import { kansFromScore } from '@/modules/settings/types';
import type { ContactsOutput, QualifierOutput } from './agents';

// Everything the system knows about one company, used by both the agent and the rules
export interface Evidence {
  name: string;
  segment: Segment;
  categories: string[];
  description: string;
  address: string;
  city: string;
  province: string;
  phone: string;
  website: string;
  reviews: number;
  rating: number | null;
  distanceHomeKm: number | null;
  familie: string;
  pages: { url: string; title: string; text: string }[];
  search: { query: string; title: string; url: string; description: string }[];
  emails: string[];
  phones: string[];
  linkedIns: string[];
  people: { name: string; role: string; email: string; source: string }[];
  kvk: { nummer: string; sbi: string[]; employees: string } | null;
}

type CriterionKey = keyof QualifierOutput['criteria'];

// English labels for the texts the rules write (texts_en)
const SEGMENT_EN: Record<Segment, string> = {
  'Crossdock / hub': 'Crossdock / hub',
  Distributiecentrum: 'Distribution centre',
  'Warehouse / opslag': 'Warehouse / storage',
  'Logistiek dienstverlener': 'Logistics service provider',
  Transport: 'Transport',
  Overig: 'Other',
};
const SIGNAL_EN: Record<string, string> = { vacature: 'vacancy', nieuw_dc: 'new DC', uitbreiding: 'expansion', crossdock: 'crossdock', overname: 'acquisition', investering: 'investment', overig: 'other' };

const lower = (text: string) => stripDiacritics(text).toLowerCase();

// Searches the lowercased text, but quotes the original text (same length: only diacritics are stripped)
function findSnippet(text: string, pattern: RegExp, raw?: string): string | null {
  const match = pattern.exec(text);
  if (!match) return null;
  const source = raw && raw.length === text.length ? raw : text;
  const start = Math.max(0, match.index - 60);
  return source.slice(start, match.index + match[0].length + 60).replace(/\s+/g, ' ').trim();
}

// Rule-based verdict with the same shape as the Qualifier agent ("regelmodus", B.8)
export function rulesQualifier(ev: Evidence): QualifierOutput {
  const pageText = ev.pages.map((p) => `${p.title}\n${p.text}`).join('\n');
  const rawAll = stripDiacritics(`${ev.name}\n${ev.categories.join(' ')}\n${ev.description}\n${pageText}`);
  const all = rawAll.toLowerCase();
  const snip = (pattern: RegExp) => findSnippet(all, pattern, rawAll);
  const firstPage = ev.pages[0]?.url ?? ev.website ?? 'vermelding';
  const reasons: QualifierOutput['reasons'] = [];
  const reasonsEn: string[] = [];
  // Every reason in Dutch (stored) and English (texts_en), same order
  const reason = (nl: string, en: string, evidence: string, source: string) => {
    reasons.push({ text: nl, evidence, source });
    reasonsEn.push(en);
  };
  const crit = {} as QualifierOutput['criteria'];

  const set = (key: CriterionKey, score: number, evidence: string, source: string) => {
    crit[key] = { score: Math.max(0, Math.min(1, score)), evidence, source };
  };

  // Pallet flows between docks
  const flowWord = snip(/cross-?dock|overslag|distributiecentrum|distributie|warehous|opslag en distributie|magazijn|fulfilment|koelhuis/);
  const segmentFlow: Record<Segment, number> = {
    'Crossdock / hub': 1,
    Distributiecentrum: 0.9,
    'Warehouse / opslag': 0.8,
    'Logistiek dienstverlener': 0.7,
    Transport: 0.4,
    Overig: 0.1,
  };
  let flow = segmentFlow[ev.segment];
  if (flowWord && flow < 0.9) flow += 0.15;
  set('palletFlows', flow, flowWord ?? `Segment ${ev.segment} (Google-categorie)`, flowWord ? firstPage : 'vermelding');
  if (flow >= 0.7) reason(`${ev.segment}: verplaatst pallets tussen docks`, `${SEGMENT_EN[ev.segment]}: moves pallets between docks`, flowWord ?? ev.categories.join(', '), flowWord ? firstPage : 'vermelding');

  // Volume and scale
  const sizeHit = snip(/\d[\d.]*\s?(m2|m²|vierkante meter|palletplaatsen|dockdeuren|docks|vrachtwagens|trucks|medewerkers)/);
  let volume = ev.reviews >= 100 ? 0.7 : ev.reviews >= 50 ? 0.5 : ev.reviews >= 20 ? 0.35 : 0.15;
  if (sizeHit) volume = Math.min(1, volume + 0.3);
  set('volume', volume, sizeHit ?? `${ev.reviews} Google-reviews`, sizeHit ? firstPage : 'vermelding');
  if (volume >= 0.6) reason('Schaal wijst op flink palletvolume', 'Scale points to a large pallet volume', sizeHit ?? `${ev.reviews} reviews`, sizeHit ? firstPage : 'vermelding');

  // Multiple unload spots per trip
  const multi = snip(/groupage|sorteer|sortering|pakket|parcel|meerdere klanten|winkels beleveren|retail distributie|e-?commerce|fulfilment|stukgoed/);
  set('multiDrop', multi ? 0.8 : ev.segment === 'Crossdock / hub' ? 0.6 : 0, multi ?? 'onbekend', multi ? firstPage : 'vermelding');
  if (multi) reason('Meerdere losplekken per rit waarschijnlijk (sorteren/groupage)', 'Several drop spots per trip likely (sorting / groupage)', multi, firstPage);

  // Growth signals from the search snippets
  const signals: QualifierOutput['signals'] = [];
  for (const hit of ev.search) {
    const text = lower(`${hit.title} ${hit.description}`);
    if (!text.includes(lower(ev.name).split(' ')[0] ?? '')) continue;
    if (/vacature|orderpicker|heftruck|magazijnmedewerker|reachtruck/.test(text)) signals.push({ type: 'vacature', text: hit.title, url: hit.url });
    else if (/nieuw (distributiecentrum|dc|magazijn)|opent|opening/.test(text)) signals.push({ type: 'nieuw_dc', text: hit.title, url: hit.url });
    else if (/uitbreid|uitbreiding|groei|nieuwbouw|investeert/.test(text)) signals.push({ type: 'uitbreiding', text: hit.title, url: hit.url });
  }
  const pageVacancy = snip(/vacature[s]?.{0,40}(magazijn|orderpick|heftruck|logistiek)/);
  if (pageVacancy && !signals.some((s) => s.type === 'vacature')) signals.push({ type: 'vacature', text: pageVacancy, url: firstPage });
  const growth = signals.length >= 2 ? 1 : signals.length === 1 ? 0.7 : 0;
  set('growth', growth, signals[0]?.text ?? 'onbekend', signals[0]?.url ?? 'vermelding');
  if (signals[0]) reason(`Groeisignaal: ${signals[0].type.replace('_', ' ')}`, `Growth signal: ${SIGNAL_EN[signals[0].type] ?? signals[0].type}`, signals[0].text, signals[0].url);

  // Family business
  const fam = snip(/familiebedrijf|familie-?onderneming|(\d|twee|drie|vier|vijf)(e|de)? generatie|sinds 19\d\d/);
  const familie: QualifierOutput['familie'] = ev.familie === 'ja' || ev.familie === 'groot' ? (ev.familie as 'ja' | 'groot') : fam ? 'ja' : 'onbekend';
  set('family', familie === 'ja' ? 1 : familie === 'groot' ? 0.7 : 0, fam ?? (familie !== 'onbekend' ? `familie: ${familie}` : 'onbekend'), fam ? firstPage : 'vermelding');
  if (fam) reason('Familiebedrijf: korte beslislijn', 'Family business: short decision line', fam, firstPage);

  // Data quality
  const hasContact = ev.people.length > 0 || ev.emails.length > 0;
  const dq = [Boolean(ev.website), Boolean(ev.phone || ev.phones.length), hasContact].filter(Boolean).length / 3;
  set('dataQuality', dq, [ev.website && 'website', (ev.phone || ev.phones.length) && 'telefoon', hasContact && 'contact'].filter(Boolean).join(', ') || 'onbekend', 'vermelding');

  const isLogistics = ev.segment !== 'Overig' || Boolean(flowWord);
  if (ev.distanceHomeKm !== null && ev.distanceHomeKm <= 60)
    reason(`Dichtbij MEK (${Math.round(ev.distanceHomeKm)} km)`, `Close to MEK (${Math.round(ev.distanceHomeKm)} km)`, `${ev.city}`, 'vermelding');

  const topReasons = reasons.slice(0, 5);
  const topReasonsEn = reasonsEn.slice(0, 5);
  const rating = ev.rating ? `, ${ev.rating.toFixed(1)}★` : '';
  const place = `${ev.city || ev.address}${ev.province ? `, ${ev.province}` : ''}`;
  while (topReasons.length < 3) {
    if (topReasons.length === 0) {
      topReasons.push({ text: `Segment: ${ev.segment}`, evidence: ev.categories.join(', ') || ev.name, source: 'vermelding' });
      topReasonsEn.push(`Segment: ${SEGMENT_EN[ev.segment]}`);
    } else if (topReasons.length === 1) {
      topReasons.push({ text: `${ev.reviews} Google-reviews${rating}`, evidence: `${ev.reviews} reviews`, source: 'vermelding' });
      topReasonsEn.push(`${ev.reviews} Google reviews${rating}`);
    } else {
      topReasons.push({ text: `Locatie: ${place}`, evidence: ev.address, source: 'vermelding' });
      topReasonsEn.push(`Location: ${place}`);
    }
  }
  const risks = [
    ...(ev.website ? [] : [['Geen website gevonden', 'No website found']]),
    ...(ev.segment === 'Transport' ? [['Mogelijk vooral wegtransport zonder eigen dockstromen', 'Possibly mainly road transport without its own dock flows']] : []),
  ];
  const where = ev.city || ev.province;

  return {
    segment: ev.segment,
    is_logistics: isLogistics,
    familie,
    criteria: crit,
    signals,
    reasons: topReasons,
    waarom: isLogistics
      ? `${ev.segment} in ${where}${multi ? ' met sorteer-/groupagestromen' : ''}; de Mek-Rider bespaart ritten tussen docks.`
      : 'Weinig aanwijzingen voor palletstromen tussen docks.',
    aanpak:
      flow >= 0.8
        ? 'Bel de warehouse- of operations manager; stuur de crossdock-one-pager en bied een demo met de crossdock-calculator op hun eigen hal.'
        : 'Eerst onderzoeken (website/LinkedIn), daarna benaderen met de one-pager.',
    risks: risks.map(([nl]) => nl),
    estimated_trucks: flow >= 0.9 && volume >= 0.7 ? 2 : flow >= 0.7 ? 1 : 0,
    en: {
      waarom: isLogistics
        ? `${SEGMENT_EN[ev.segment]} in ${where}${multi ? ' with sorting / groupage flows' : ''}; the Mek-Rider saves trips between docks.`
        : 'Little evidence of pallet flows between docks.',
      aanpak:
        flow >= 0.8
          ? 'Call the warehouse or operations manager; send the crossdock one-pager and offer a demo with the crossdock calculator on their own hall.'
          : 'Research first (website / LinkedIn), then approach them with the one-pager.',
      reasons: topReasonsEn,
      risks: risks.map(([, en]) => en),
    },
  };
}

// Distance factor for the "distance to MEK / service area" criterion (computed by the app, not the agent)
export function distanceFactor(km: number | null, serviceRadiusKm: number): number {
  if (km === null) return 0.5;
  if (km <= serviceRadiusKm * 0.33) return 1;
  if (km <= serviceRadiusKm * 0.66) return 0.75;
  if (km <= serviceRadiusKm) return 0.5;
  return 0.15;
}

// Weighted total 0-100 from the criterion scores (weights are editable in Instellingen)
export function totalScore(criteria: QualifierOutput['criteria'], distance: number, weights: WeightSettings): number {
  const parts: [number, number][] = [
    [criteria.palletFlows.score, weights.palletFlows],
    [criteria.volume.score, weights.volume],
    [criteria.multiDrop.score, weights.multiDrop],
    [criteria.growth.score, weights.growth],
    [distance, weights.distance],
    [criteria.family.score, weights.family],
    [criteria.dataQuality.score, weights.dataQuality],
  ];
  const sumWeights = parts.reduce((s, [, w]) => s + w, 0) || 1;
  const sum = parts.reduce((s, [v, w]) => s + Math.max(0, Math.min(1, Number(v) || 0)) * w, 0);
  return Math.round((sum / sumWeights) * 100);
}

export function verdictKans(score: number, isLogistics: boolean, kans: KansSettings): 'A' | 'B' | 'C' {
  return isLogistics ? kansFromScore(score, kans) : 'C';
}

// ---------------------------------------------------------------------------
// Contacts (rules): pick by role keywords and e-mail prefix
// ---------------------------------------------------------------------------
const ROLE_PATTERNS: { rank: number; pattern: RegExp; role: string }[] = [
  { rank: 1, pattern: /warehouse|magazijn|dc[- ]?manager|distributiecentrum/, role: 'Warehouse manager' },
  { rank: 2, pattern: /supply chain|logistiek manager|logistics manager|logistiek/, role: 'Supply chain manager' },
  { rank: 3, pattern: /crossdock|operations|operationeel|planning/, role: 'Operations / crossdock manager' },
  { rank: 4, pattern: /eigenaar|directeur|owner|ceo|algemeen directeur|managing director|dga/, role: 'Eigenaar / directeur' },
];

const EMAIL_PREFIX_RANK: [RegExp, number][] = [
  [/^(warehouse|magazijn|dc)\b/, 1],
  [/^(logistiek|logistics|supplychain|scm)\b/, 2],
  [/^(operations|ops|planning|crossdock)\b/, 3],
  [/^(directie|management|directeur)\b/, 4],
  [/^(verkoop|sales|info|contact|office|kantoor|algemeen)\b/, 6],
];

const BAD_EMAIL = /(noreply|no-reply|privacy|gdpr|avg@|webmaster|wix|sentry|@example\.(com|org|net)$|jobs@|vacature|sollicit|hr@|career|recruit|facturen|invoice|administratie|boekhouding)/;

const GENERIC_LOCAL = /^(info|contact|verkoop|sales|office|kantoor|algemeen|mail|post|receptie|service|klantenservice|hallo|hello)$/;
const NAME = "([A-Z][a-zà-ÿ'’-]+(?:\\s(?:van|de|der|den|ter|ten|van der|van den|van de|el|al))?(?:\\s[A-Z][a-zà-ÿ'’-]+){1,2})";
const ROLE_WORDS = /(warehouse ?manager|magazijnmanager|magazijn ?chef|hoofd magazijn|dc[- ]?manager|logistiek(?:s)? manager|logistics manager|supply chain manager|operations ?manager|operationeel manager|crossdock ?manager|planner|directeur|eigenaar|owner|ceo|managing director|algemeen directeur|bedrijfsleider|vestigingsmanager|teamleider)/i;

// People named on the website: "Jan de Vries (Warehouse manager, j.devries@…)" or "Warehouse manager: Jan de Vries"
export function extractPeople(pages: Evidence['pages'], emails: string[]): Evidence['people'] {
  const found = new Map<string, Evidence['people'][number]>();
  for (const page of pages) {
    const text = page.text.replace(/\s+/g, ' ');
    const patterns = [
      new RegExp(`${NAME}\\s*[(,–-]\\s*${ROLE_WORDS.source}`, 'gi'),
      new RegExp(`${ROLE_WORDS.source}\\s*[:,–-]\\s*${NAME}`, 'gi'),
    ];
    for (const [i, re] of patterns.entries()) {
      for (const m of text.matchAll(re)) {
        const name = (i === 0 ? m[1] : m[2]).trim();
        const role = (i === 0 ? m[2] : m[1]).trim();
        if (name.split(' ').length < 2 || found.has(name)) continue;
        // E-mail next to the name, or one whose local part matches the surname
        const near = text.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 80).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]?.toLowerCase() ?? '';
        const surname = name.split(' ').pop()!.toLowerCase();
        const byName = emails.find((e) => e.split('@')[0].includes(surname)) ?? '';
        found.set(name, { name, role, email: near || byName, source: page.url });
      }
    }
  }
  return [...found.values()].slice(0, 10);
}

export function rulesContacts(ev: Evidence, domain: string | null): ContactsOutput {
  const ownDomain = (email: string) => (domain ? email.endsWith(`@${domain}`) || email.endsWith(`.${domain}`) : true);
  const peopleFromPages = extractPeople(ev.pages, ev.emails);
  const people = [...ev.people, ...peopleFromPages.filter((p) => !ev.people.some((q) => q.name === p.name))]
    .map((p) => {
      const role = lower(p.role);
      const match = ROLE_PATTERNS.find((r) => r.pattern.test(role));
      return { ...p, rank: match?.rank ?? 5, roleLabel: p.role || match?.role || '' };
    })
    .filter((p) => p.name)
    .sort((a, b) => a.rank - b.rank);

  const emails = [...new Set(ev.emails.map((e) => e.toLowerCase()))].filter((e) => !BAD_EMAIL.test(e));
  const rankedEmails = emails
    .map((email) => {
      const local = email.split('@')[0];
      const rank = EMAIL_PREFIX_RANK.find(([re]) => re.test(local))?.[1] ?? 5;
      return { email, rank: rank + (ownDomain(email) ? 0 : 10) };
    })
    .sort((a, b) => a.rank - b.rank);

  // General address: only generic mailboxes (info@, verkoop@ …), never a personal one
  const general = rankedEmails.find((e) => GENERIC_LOCAL.test(e.email.split('@')[0]))?.email ?? '';
  const personEmails = new Set(people.map((p) => p.email).filter(Boolean));
  const department = rankedEmails.find((e) => e.rank <= 4 && !personEmails.has(e.email));
  const primaryPerson = people[0];
  const phone = ev.phone || ev.phones[0] || '';
  const primary = primaryPerson
    ? { name: primaryPerson.name, role: primaryPerson.roleLabel, email: primaryPerson.email, phone, source_url: primaryPerson.source }
    : department
      ? { name: '', role: `Afdeling (${department.email.split('@')[0]})`, email: department.email, phone, source_url: ev.website }
      : general
        ? { name: '', role: 'Algemeen', email: general, phone, source_url: ev.website }
        : null;

  // Personal addresses on the own domain (cor.noorlander@…) without a known role: keep them as named backups
  const used = new Set([primary?.email, general, department?.email, ...people.map((p) => p.email)].filter(Boolean));
  const personal = rankedEmails
    .filter((e) => ownDomain(e.email) && !used.has(e.email))
    .map((e) => ({ email: e.email, local: e.email.split('@')[0] }))
    .filter(({ local }) => /^[a-z]+([._-][a-z]+)+$/.test(local) && !GENERIC_LOCAL.test(local) && !EMAIL_PREFIX_RANK.some(([re]) => re.test(local)))
    .slice(0, 4)
    .map(({ email, local }) => ({
      name: local
        .split(/[._-]/)
        .map((part) => (['van', 'de', 'der', 'den', 'ter', 'ten'].includes(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join(' '),
      role: '',
      email,
      phone: '',
      source_url: ev.website,
    }));

  const backups = [
    ...people.slice(1, 4).map((p) => ({ name: p.name, role: p.roleLabel, email: p.email, phone: '', source_url: p.source })),
    ...(primaryPerson && department ? [{ name: '', role: `Afdeling (${department.email.split('@')[0]})`, email: department.email, phone: '', source_url: ev.website }] : []),
    ...personal,
  ];

  return { primary, backups, general_email: general };
}
