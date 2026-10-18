// Extra discovery sources besides Google Maps: LinkedIn company pages and Dutch logistics news / PR sites.
// Both are found through the Google Search actor (apify/google-search-scraper) with site: queries, so the app
// reads Google's index only; LinkedIn itself is never scraped and no personal profiles are collected.
// Every company name found here is then looked up through the Google Maps actor ("resolve"), so it goes through
// the same prefilter, dedup, enrichment and qualification as a normal Maps result.

import { cleanCompanyName, normaliseName, stripDiacritics } from '@/lib/text';

export type WebSource = 'linkedin' | 'news';

// Logistics trade press and Dutch press-release platforms. Editable per profile (filters.newsSites).
export const DEFAULT_NEWS_SITES = [
  'logistiek.nl',
  'nieuwsbladtransport.nl',
  'tlonline.nl',
  'transportenlogistiek.nl',
  'perssupport.nl',
  'persberichten.com',
];

// News phrases that point at pallet volume growing: new DC, extra warehouse, crossdock, expansion
const NEWS_PHRASES = ['"nieuw distributiecentrum"', '"nieuw magazijn"', 'crossdock', 'uitbreiding', '"opent distributiecentrum"', 'warehouse'];

export interface WebQueryArea {
  label: string;
  postcode: string;
  lat: number;
  lng: number;
  radiusKm: number;
  province?: string;
}

export interface WebQuery {
  source: WebSource;
  query: string;
  area: WebQueryArea;
}

export interface WebResult {
  source?: WebSource | null;
  query?: string | null;
  title?: string | null;
  url?: string | null;
  description?: string | null;
}

export interface WebCandidate {
  source: WebSource;
  name: string;
  nameNorm: string;
  city: string;
  url: string;
  title: string;
  snippet: string;
  query: string;
  area: WebQueryArea | null;
}

// One LinkedIn query per (term × area) and one news query per area. Capped so a run stays predictable.
export function buildWebQueries(
  terms: string[],
  areas: WebQueryArea[],
  opts: { linkedin: boolean; news: boolean; newsSites: string[]; maxQueries?: number },
): WebQuery[] {
  const max = opts.maxQueries ?? 40;
  const out: WebQuery[] = [];
  const place = (a: WebQueryArea) => `"${a.label}"`;
  if (opts.linkedin) {
    for (const area of areas) for (const term of terms) out.push({ source: 'linkedin', query: `site:linkedin.com/company ${term} ${place(area)}`, area });
  }
  if (opts.news) {
    const sites = opts.newsSites.map((s) => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
    for (const area of areas) {
      if (sites.length) out.push({ source: 'news', query: `(${sites.map((s) => `site:${s}`).join(' OR ')}) (${NEWS_PHRASES.join(' OR ')}) ${place(area)}`, area });
      // Regional news and company press pages outside the trade press
      out.push({ source: 'news', query: `("nieuw distributiecentrum" OR "opent distributiecentrum" OR "nieuw crossdock") ${place(area)}`, area });
    }
  }
  // Interleave sources so the cap does not cut off news entirely
  const linkedin = out.filter((q) => q.source === 'linkedin');
  const news = out.filter((q) => q.source === 'news');
  const mixed: WebQuery[] = [];
  for (let i = 0; mixed.length < max && (i < linkedin.length || i < news.length); i++) {
    if (i < news.length) mixed.push(news[i]);
    if (i < linkedin.length && mixed.length < max) mixed.push(linkedin[i]);
  }
  return mixed;
}

const LINKEDIN_COMPANY = /^https?:\/\/([a-z]{2,3}\.)?(www\.)?linkedin\.com\/company\/([^/?#]+)/i;

function titleCase(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// "Chain Logistics BV | LinkedIn", "Chain Logistics: Overzicht | LinkedIn" → "Chain Logistics BV"
export function parseLinkedInResult(r: WebResult): { name: string; city: string; employees: string } | null {
  const url = r.url ?? '';
  const match = url.match(LINKEDIN_COMPANY);
  if (!match) return null;
  let name = (r.title ?? '')
    .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, '')
    .replace(/:\s*(overzicht|overview|over ons|about|vacatures|jobs|werknemers|people|posts|berichten)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || /^linkedin$/i.test(name) || name.length > 80) name = titleCase(match[3]);
  const text = `${r.title ?? ''} ${r.description ?? ''}`;
  const employees = text.match(/(\d[\d.]*\s?[-–]\s?\d[\d.]*|\d[\d.]*\+?)\s+(werknemers|medewerkers|employees)/i)?.[1]?.replace(/\s/g, '') ?? '';
  // Snippets often end with "… · Helmond" or "Hoofdkantoor: Uden"
  const city =
    (r.description ?? '').match(/(?:[Hh]oofdkantoor|[Hh]eadquarters|[Vv]estiging|[Ll]ocatie)[:\s]+([A-Z][\p{L}' -]{2,30}?)(?:[,.;·|]|\s+(?:Noord|Zuid|Gelderland|Brabant|Limburg|Utrecht|Nederland)|$)/u)?.[1]?.trim() ?? '';
  return { name, city, employees };
}

// Words that start a headline but are not a company name
const NOT_A_COMPANY = new Set(
  [
    'nieuw', 'nieuwe', 'het', 'de', 'een', 'deze', 'dit', 'gemeente', 'provincie', 'logistiek', 'transport', 'bouw', 'eerste', 'grootste',
    'nederland', 'brabant', 'video', 'interview', 'column', 'update', 'nieuws', 'week', 'vacature', 'ook', 'waarom', 'hoe', 'wat', 'wie',
    'meer', 'steeds', 'bedrijf', 'bedrijven', 'distributiecentrum', 'magazijn', 'crossdock', 'warehouse', 'logistieke',
  ].map((w) => w.toLowerCase()),
);

const NEWS_VERBS =
  'opent|opende|bouwt|bouwde|start|startte|breidt|verhuist|investeert|huurt|kiest|koos|betrekt|realiseert|verdubbelt|neemt|nam|koopt|kocht|lanceert|vestigt|opent|gaat|wint|zet|stopt|sluit|verhuisde|ontwikkelt|krijgt|bundelt|groeit|opende|in gebruik';
const HEADLINE = new RegExp(`^\\s*([A-Z0-9][\\p{L}\\p{N}&.'’+\\- ]{1,60}?)\\s+(?:${NEWS_VERBS})\\b`, 'u');

// Rules extraction for news headlines: "Bakker Logistiek opent nieuw distributiecentrum in Tilburg" → "Bakker Logistiek"
export function extractNewsCompany(r: WebResult): { name: string; city: string } | null {
  const title = (r.title ?? '').replace(/\s*[|\-–—]\s*[^|\-–—]{2,40}$/, '').trim(); // drop " | Logistiek.nl"
  const match = title.match(HEADLINE);
  if (!match) return null;
  let name = match[1].replace(/[:'’]+$/, '').trim();
  name = name.replace(/^(logistiek dienstverlener|logistieke dienstverlener|transportbedrijf|webwinkel|e-commercebedrijf|retailer|groothandel|vervoerder)\s+/i, '');
  const words = name.split(/\s+/);
  if (!words.length || words.length > 6) return null;
  if (NOT_A_COMPANY.has(stripDiacritics(words[0]).toLowerCase())) return null;
  if (normaliseName(name).length < 3) return null;
  const city = (title.match(/\b(?:in|te|naar|bij)\s+([A-Z][\p{L}'-]{2,25}(?:\s[A-Z][\p{L}'-]{2,25})?)/u)?.[1] ?? '').trim();
  return { name, city };
}

// All candidates of one web batch, deduplicated by normalised name (first hit wins), exclusions applied
export function webCandidates(results: WebResult[], queries: WebQuery[], exclusions: string[]): WebCandidate[] {
  const byQuery = new Map(queries.map((q) => [q.query.trim().toLowerCase(), q]));
  const out = new Map<string, WebCandidate>();
  const excluded = (name: string) => {
    const hay = stripDiacritics(name).toLowerCase();
    return exclusions.some((x) => x && hay.includes(stripDiacritics(x).toLowerCase())) || /self.?storage|uitzend|verhuis/.test(hay);
  };
  for (const r of results) {
    const q = byQuery.get((r.query ?? '').trim().toLowerCase()) ?? null;
    const source: WebSource = r.source ?? q?.source ?? (LINKEDIN_COMPANY.test(r.url ?? '') ? 'linkedin' : 'news');
    const parsed = source === 'linkedin' ? parseLinkedInResult(r) : extractNewsCompany(r);
    if (!parsed) continue;
    const name = cleanCompanyName(parsed.name) || parsed.name;
    const nameNorm = normaliseName(name);
    if (nameNorm.length < 3 || excluded(name) || out.has(nameNorm)) continue;
    out.set(nameNorm, {
      source,
      name,
      nameNorm,
      city: parsed.city,
      url: r.url ?? '',
      title: (r.title ?? '').slice(0, 300),
      snippet: (r.description ?? '').slice(0, 500),
      query: r.query ?? '',
      area: q?.area ?? null,
    });
  }
  return [...out.values()];
}

// The Google Maps search string used to resolve a candidate; also the key to match the place back to it
export function resolveTerm(c: Pick<WebCandidate, 'name' | 'city' | 'area'>): string {
  return `${c.name} ${c.city || c.area?.label || ''}`.replace(/\s+/g, ' ').trim();
}

export const resolveKey = (term: string | null | undefined) => normaliseName(term ?? '');
