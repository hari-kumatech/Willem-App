// Text, URL and key helpers shared by import, prefilter, dedup and the UI.

// Only http(s) URLs are allowed (fixes the stored-XSS finding from A.8). Returns '' for anything else.
export function safeUrl(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : /^www\.|^[\w-]+(\.[\w-]+)+(\/|$)/i.test(raw) ? `https://${raw}` : raw;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

// "https://www.chain-logistics.nl/over-ons" → "chain-logistics.nl"
export function domainOf(value: string | null | undefined): string | null {
  const url = safeUrl(value);
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('.')) return null;
    // Shared platforms are not a company's own domain
    if (/(^|\.)(facebook|instagram|linkedin|google|goo\.gl|business\.site|wixsite|jimdo|youtube|twitter|x)\.(com|nl|gl|site)$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Company name without legal form and noise, for matching and searching (A.1 LinkedIn search cleanup)
export function cleanCompanyName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(b\.?\s?v\.?|n\.?\s?v\.?|v\.?o\.?f\.?|holding|nederland|the netherlands|netherlands|group|groep)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseName(name: string): string {
  return stripDiacritics(cleanCompanyName(name))
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Dutch postcode "5405 BW" (or PC4 "5405") from free text
export function extractPostcode(text: string | null | undefined): string {
  const match = (text ?? '').match(/\b(\d{4})\s?([A-Za-z]{2})\b/);
  if (match) return `${match[1]} ${match[2].toUpperCase()}`;
  const pc4 = (text ?? '').match(/\b(\d{4})\b/);
  return pc4 ? pc4[1] : '';
}

export const pc4Of = (postcode: string) => postcode.replace(/\s/g, '').slice(0, 4);

// Normalised name + PC4: the last-resort dedup key (B.7 step 3), also used for leads
export function nameKey(name: string, postcode: string): string | null {
  const n = normaliseName(name);
  const pc = pc4Of(postcode);
  if (!n) return null;
  return pc ? `${n}|${pc}` : n;
}

export function slugify(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

// LinkedIn people-search links per role + one Google site: search (A.1). No scraping of LinkedIn itself.
export function linkedinSearchUrl(company: string, role?: string): string {
  const keywords = [role, cleanCompanyName(company)].filter(Boolean).join(' ');
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

export function googleLinkedinUrl(company: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${cleanCompanyName(company)}"`)}`;
}

export function mapsSearchUrl(name: string, place: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${place}`.trim())}`;
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
