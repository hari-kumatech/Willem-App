import type { Segment } from '@/lib/constants';
import { domainOf, extractPostcode, nameKey, normaliseName, safeUrl, stripDiacritics } from '@/lib/text';
import { haversineKm, type GeoPoint } from '@/lib/geo';
import type { SearchFilters } from './filters';

// One place as it comes back from the Google Maps scraper (normalised by the n8n workflow, spec B.10)
export interface PlaceItem {
  placeId?: string | null;
  name: string;
  address?: string | null;
  postcode?: string | null;
  city?: string | null;
  phone?: string | null;
  website?: string | null;
  mapsUrl?: string | null;
  categories?: string[] | null;
  reviews?: number | null;
  rating?: number | null;
  location?: { lat: number; lng: number } | null;
  closed?: boolean | null;
  description?: string | null;
  searchTerm?: string | null;
  emails?: string[] | null;
}

// Segment rules from the Prospect zoeker (A.2), first match wins, extended with Google category names
const SEGMENT_RULES: { segment: Segment; points: number; pattern: RegExp }[] = [
  { segment: 'Crossdock / hub', points: 2, pattern: /cross-?dock|\bhub\b|overslag|pakketsorteer|sorteercentrum|parcel/ },
  { segment: 'Distributiecentrum', points: 2, pattern: /distributie|distribution|\bdc\b|distributiecentrum/ },
  { segment: 'Warehouse / opslag', points: 2, pattern: /warehous|opslag|storage|fulfil|magazijn|koelhuis|vrieshuis|cold store|entrepot/ },
  { segment: 'Logistiek dienstverlener', points: 2, pattern: /logist|3pl|supply chain/ },
  { segment: 'Transport', points: 1, pattern: /transport|expeditie|cargo|freight|trucking|vracht|forwarding|koerier|courier|shipping|verhuur van vrachtwagens/ },
];

export function classifySegment(name: string, categories: string[] = []): { segment: Segment; points: number } {
  const nameText = stripDiacritics(name).toLowerCase();
  for (const rule of SEGMENT_RULES) if (rule.pattern.test(nameText)) return { segment: rule.segment, points: rule.points };
  // Google categories second: "Logistiekdienst", "Opslagruimte", "Transportbedrijf", "Distributiedienst"
  const catText = stripDiacritics(categories.join(' | ')).toLowerCase();
  for (const rule of SEGMENT_RULES) if (rule.pattern.test(catText)) return { segment: rule.segment, points: rule.points };
  return { segment: 'Overig', points: 0 };
}

// Rule score (A.2): segment points + reviews (100+ → +2, 20+ → +1). 4+ = A, 2+ = B, else C.
export function ruleScore(points: number, reviews: number): number {
  return points + (reviews >= 100 ? 2 : reviews >= 20 ? 1 : 0);
}

export const ruleTier = (score: number): 'A' | 'B' | 'C' => (score >= 4 ? 'A' : score >= 2 ? 'B' : 'C');

// Exclusion terms match on name and categories, accent- and case-insensitive
export function matchesExclusion(place: PlaceItem, exclusions: string[]): string | null {
  const haystack = stripDiacritics(`${place.name} ${(place.categories ?? []).join(' ')}`).toLowerCase();
  for (const term of exclusions) {
    const needle = stripDiacritics(term).toLowerCase().trim();
    if (needle && haystack.includes(needle)) return term;
  }
  // Always out: self-storage chains and consumer moving, even if the user removed the terms
  if (/self.?storage|shurgard|city ?box|boxenverhuur|opslagbox/.test(haystack)) return 'self-storage';
  return null;
}

export interface NormalisedPlace {
  placeId: string | null;
  domain: string | null;
  nameKey: string | null;
  name: string;
  address: string;
  postcode: string;
  city: string;
  phone: string;
  website: string;
  mapsUrl: string;
  categories: string[];
  reviews: number;
  rating: number | null;
  lat: number | null;
  lng: number | null;
  closed: boolean;
  description: string;
  segment: Segment;
  ruleScore: number;
  distanceKm: number | null;
  emails: string[];
  // The Google Maps search string that found this place (links LinkedIn / news lookups back to their source)
  searchTerm: string;
}

export function normalisePlace(item: PlaceItem, origin: GeoPoint | null): NormalisedPlace {
  const name = (item.name ?? '').replace(/\s+/g, ' ').trim();
  const address = (item.address ?? '').replace(/\s+/g, ' ').replace(/,\s*(Nederland|Netherlands)$/i, '').trim();
  const postcode = item.postcode?.trim() ? extractPostcode(item.postcode) : extractPostcode(address);
  const city = (item.city ?? '').trim() || address.replace(/.*\d{4}\s?[A-Z]{2}\s+/i, '').split(',')[0]?.trim() || '';
  const website = safeUrl(item.website);
  const categories = (item.categories ?? []).filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim());
  const reviews = Math.max(0, Math.round(Number(item.reviews) || 0));
  const { segment, points } = classifySegment(name, categories);
  const location = item.location && Number.isFinite(item.location.lat) && Number.isFinite(item.location.lng) ? item.location : null;
  return {
    placeId: item.placeId?.trim() || null,
    domain: domainOf(website),
    nameKey: nameKey(name, postcode),
    name,
    address,
    postcode,
    city,
    phone: (item.phone ?? '').trim(),
    website,
    mapsUrl: safeUrl(item.mapsUrl),
    categories,
    reviews,
    rating: item.rating ? Number(item.rating) : null,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
    closed: Boolean(item.closed),
    description: (item.description ?? '').trim().slice(0, 1000),
    segment,
    ruleScore: ruleScore(points, reviews),
    distanceKm: origin && location ? Math.round(haversineKm(origin, location) * 10) / 10 : null,
    emails: (item.emails ?? []).filter((e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)).map((e) => e.toLowerCase()),
    searchTerm: (item.searchTerm ?? '').trim(),
  };
}

export type DropReason = 'closed' | 'excluded' | 'outside-area' | 'no-website' | 'no-phone' | 'few-reviews' | 'segment' | 'no-name';

// Cheap first pass before anything costs money (B.7 step 3). Province filtering happens after geocoding.
export function prefilter(place: NormalisedPlace, filters: SearchFilters, maxDistanceKm: number | null): DropReason | null {
  if (!place.name || normaliseName(place.name).length < 2) return 'no-name';
  if (filters.openOnly && place.closed) return 'closed';
  if (matchesExclusion({ name: place.name, categories: place.categories }, filters.exclusions)) return 'excluded';
  if (maxDistanceKm !== null && place.distanceKm !== null && place.distanceKm > maxDistanceKm) return 'outside-area';
  if (filters.mustHaveWebsite && !place.website) return 'no-website';
  if (filters.mustHavePhone && !place.phone) return 'no-phone';
  if (place.reviews < filters.minReviews) return 'few-reviews';
  // "Overig" gets a second chance from the prefilter classifier agent, so it is not dropped here
  if (place.segment !== 'Overig' && !filters.segments.includes(place.segment)) return 'segment';
  return null;
}

// Sorting uses a tuple (kans, score, reviews) instead of tier*1000 + reviews (A.8 sort bug)
export function compareProspects(
  a: { kans?: string | null; fit_score?: number | null; rule_score?: number; reviews?: number },
  b: { kans?: string | null; fit_score?: number | null; rule_score?: number; reviews?: number },
): number {
  const k = (x?: string | null) => (x === 'A' ? 0 : x === 'B' ? 1 : x === 'C' ? 2 : 3);
  return (
    k(a.kans) - k(b.kans) ||
    (b.fit_score ?? -1) - (a.fit_score ?? -1) ||
    (b.rule_score ?? 0) - (a.rule_score ?? 0) ||
    (b.reviews ?? 0) - (a.reviews ?? 0)
  );
}
