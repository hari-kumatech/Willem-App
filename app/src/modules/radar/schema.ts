import { z } from 'zod';

// Contract for POST /api/n8n/results (spec B.10). Lenient on item fields: scrapers return messy data,
// the ingest normalises it. Unknown fields are ignored.

const place = z
  .object({
    placeId: z.string().nullish(),
    name: z.string().min(1),
    address: z.string().nullish(),
    postcode: z.string().nullish(),
    city: z.string().nullish(),
    phone: z.string().nullish(),
    website: z.string().nullish(),
    mapsUrl: z.string().nullish(),
    categories: z.array(z.string()).nullish(),
    reviews: z.coerce.number().nullish(),
    rating: z.coerce.number().nullish(),
    location: z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).nullish(),
    closed: z.boolean().nullish(),
    description: z.string().nullish(),
    searchTerm: z.string().nullish(),
    emails: z.array(z.string()).nullish(),
  })
  .passthrough();

const enrichment = z
  .object({
    companyId: z.string().uuid(),
    pages: z.array(z.object({ url: z.string(), title: z.string().nullish(), text: z.string().nullish() }).passthrough()).nullish(),
    search: z
      .array(z.object({ query: z.string().nullish(), title: z.string().nullish(), url: z.string().nullish(), description: z.string().nullish() }).passthrough())
      .nullish(),
    emails: z.array(z.string()).nullish(),
    phones: z.array(z.string()).nullish(),
    linkedIns: z.array(z.string()).nullish(),
    people: z
      .array(z.object({ name: z.string().nullish(), role: z.string().nullish(), email: z.string().nullish(), source: z.string().nullish() }).passthrough())
      .nullish(),
    error: z.string().nullish(),
  })
  .passthrough();

// LinkedIn company page / news result from the Google Search actor (web discovery)
const web = z
  .object({
    source: z.enum(['linkedin', 'news']).nullish(),
    query: z.string().nullish(),
    title: z.string().nullish(),
    url: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();

export const envelopeSchema = z.object({
  runId: z.string().uuid(),
  batchId: z.string().min(1).max(120),
  kind: z.enum(['places', 'enrichment', 'web', 'error', 'done']),
  items: z.array(z.unknown()).default([]),
  cost: z.object({ apifyUsd: z.coerce.number().min(0).default(0) }).partial().nullish(),
  done: z.boolean().nullish(),
  error: z.string().nullish(),
  executionId: z.string().nullish(),
  // For kind "error" on an enrichment batch: the companies that were in it
  companyIds: z.array(z.string().uuid()).nullish(),
});

export type Envelope = z.infer<typeof envelopeSchema>;
export type PlacePayload = z.infer<typeof place>;
export type EnrichmentPayload = z.infer<typeof enrichment>;
export type WebPayload = z.infer<typeof web>;

// Items are validated one by one so a single broken record does not reject the batch
export function parseItems<T>(kind: 'places' | 'enrichment' | 'web', items: unknown[]): { items: T[]; rejected: number } {
  const schema = kind === 'places' ? place : kind === 'web' ? web : enrichment;
  const ok: T[] = [];
  let rejected = 0;
  for (const item of items) {
    const parsed = schema.safeParse(item);
    if (parsed.success) ok.push(parsed.data as T);
    else rejected++;
  }
  return { items: ok, rejected };
}
