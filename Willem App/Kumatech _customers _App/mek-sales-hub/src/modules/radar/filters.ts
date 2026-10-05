import { z } from 'zod';
import { DEFAULT_EXCLUSIONS, SEARCH_TERMS, SEGMENTS } from '@/lib/constants';
import { DEFAULT_NEWS_SITES } from './web';

// The filters of one search profile (spec B.5). Stored as jsonb in search_profiles.filters.
export const filtersSchema = z.object({
  areaMode: z.enum(['radius', 'provinces', 'nl']).default('radius'),
  postcode: z.string().trim().default('5705'),
  radiusKm: z.number().int().min(1).max(100).default(10),
  provinces: z.array(z.string()).default(['Noord-Brabant']),
  terms: z.array(z.string().trim().min(2).max(60)).default(SEARCH_TERMS.slice(0, 6) as unknown as string[]),
  segments: z.array(z.enum(SEGMENTS)).default(SEGMENTS.filter((s) => s !== 'Overig') as unknown as (typeof SEGMENTS)[number][]),
  exclusions: z.array(z.string().trim().min(2)).default(DEFAULT_EXCLUSIONS),
  minReviews: z.number().int().min(0).default(0),
  openOnly: z.boolean().default(true),
  mustHaveWebsite: z.boolean().default(true),
  mustHavePhone: z.boolean().default(false),
  familie: z.enum(['any', 'ja', 'groot', 'nee']).default('any'),
  minKans: z.enum(['A', 'B', 'C']).default('B'),
  sbiCodes: z.array(z.string()).default([]),
  skipInPipeline: z.boolean().default(true),
  skipRejected: z.boolean().default(true),
  skipSeenDays: z.number().int().min(0).max(365).default(30),
  // Places per (term × area) search; the run total is capped by max_companies
  perSearch: z.number().int().min(5).max(200).default(40),
  // Coverage tiles per run for province / whole-country profiles
  tilesPerRun: z.number().int().min(1).max(40).default(6),
  enrich: z.boolean().default(true),
  // deep = Maps detail pages, ~15 website pages and 6 signal searches per company (slower, more Apify credit)
  depth: z.enum(['standard', 'deep']).default('standard'),
  // Extra sources via Google Search (web.ts): public LinkedIn company pages and logistics news / PR sites.
  // Names found there are looked up in Google Maps and then handled like any other place.
  webLinkedin: z.boolean().default(true),
  webNews: z.boolean().default(true),
  newsSites: z.array(z.string().trim().min(3).max(80)).default(DEFAULT_NEWS_SITES),
  // Google result pages (10 results each) per LinkedIn / news query
  webPages: z.number().int().min(1).max(5).default(2),
  // Companies from LinkedIn / news looked up in Google Maps per run
  maxWebLeads: z.number().int().min(0).max(300).default(60),
  // How long one Apify actor may run before it is stopped (minutes)
  runMinutes: z.number().int().min(5).max(80).default(30),
});

export type SearchFilters = z.infer<typeof filtersSchema>;

export const scheduleSchema = z.object({
  mode: z.enum(['off', 'daily', 'weekly', 'hours']).default('off'),
  hour: z.number().int().min(0).max(23).default(2),
  weekday: z.number().int().min(0).max(6).default(1),
  everyHours: z.number().int().min(1).max(168).default(6),
  // Only start between these hours (inclusive start, exclusive end); null = any time
  windowStart: z.number().int().min(0).max(23).nullable().default(null),
  windowEnd: z.number().int().min(0).max(24).nullable().default(null),
});

export type Schedule = z.infer<typeof scheduleSchema>;

export function parseFilters(value: unknown): SearchFilters {
  const parsed = filtersSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : filtersSchema.parse({});
}

export function parseSchedule(value: unknown): Schedule {
  const parsed = scheduleSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : scheduleSchema.parse({});
}

// Hour and weekday in Amsterdam
function amsterdamParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? 'Mon');
  return { hour, weekday };
}

// Next start time after `from`, in whole hours. null = not scheduled.
export function nextRunAt(schedule: Schedule, from = new Date()): Date | null {
  if (schedule.mode === 'off') return null;
  const inWindow = (d: Date) => {
    if (schedule.windowStart === null || schedule.windowEnd === null) return true;
    const { hour } = amsterdamParts(d);
    return schedule.windowStart <= schedule.windowEnd
      ? hour >= schedule.windowStart && hour < schedule.windowEnd
      : hour >= schedule.windowStart || hour < schedule.windowEnd;
  };
  const candidate = new Date(from);
  candidate.setUTCMinutes(0, 0, 0);
  if (schedule.mode === 'hours') {
    candidate.setUTCHours(candidate.getUTCHours() + schedule.everyHours);
    for (let i = 0; i < 48 && !inWindow(candidate); i++) candidate.setUTCHours(candidate.getUTCHours() + 1);
    return candidate;
  }
  // daily / weekly: walk forward hour by hour until the Amsterdam hour (and weekday) match
  for (let i = 1; i <= 24 * 8; i++) {
    candidate.setUTCHours(candidate.getUTCHours() + 1);
    const { hour, weekday } = amsterdamParts(candidate);
    if (hour !== schedule.hour) continue;
    if (schedule.mode === 'weekly' && weekday !== schedule.weekday) continue;
    return candidate;
  }
  return null;
}

export function describeSchedule(schedule: Schedule): string {
  const days = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  switch (schedule.mode) {
    case 'daily':
      return `Dagelijks om ${hh(schedule.hour)}`;
    case 'weekly':
      return `Elke ${days[schedule.weekday]} om ${hh(schedule.hour)}`;
    case 'hours':
      return `Elke ${schedule.everyHours} uur`;
    default:
      return 'Handmatig';
  }
}
