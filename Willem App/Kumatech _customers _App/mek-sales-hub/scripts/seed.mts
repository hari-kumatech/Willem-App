// One-off seed: imports the 55 leads from leads.json as companies + leads (spec B.9).
// Usage: npm run seed            (uses supabase/seed-data/leads.json)
//        npm run seed -- path/to/leads.json
// Safe to run twice: existing leads (same legacy id or name + postcode) are skipped.
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { legacyToRow, type LegacyLead } from '../src/modules/leads/mapping';
import { upsertLeads } from '../src/modules/leads/persist';
import { geocodePostcode } from '../src/lib/geo';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local');
  process.exit(1);
}

const file = process.argv[2] ?? 'supabase/seed-data/leads.json';
const legacy = JSON.parse(readFileSync(file, 'utf8')) as LegacyLead[];
const db = createClient(url, key, { auth: { persistSession: false } });

const rows = [];
for (const lead of legacy) {
  const row = legacyToRow(lead);
  if (!row) continue;
  // Real province from PDOK where possible (the offline table is the fallback)
  if (row.postcode) {
    const geo = await geocodePostcode(row.postcode);
    if (geo?.province) row.provincie = geo.province;
  }
  rows.push(row);
}

const result = await upsertLeads(db, rows, {
  mode: 'skip-existing',
  userId: null,
  source: file.split(/[\\/]/).pop() ?? 'leads.json',
  onProgress: (n) => process.stdout.write(`\r${n}/${rows.length}`),
});
console.log(`\nSeed klaar: ${result.inserted} nieuw, ${result.skipped} al aanwezig, ${result.errors.length} fouten.`);
for (const error of result.errors) console.error(' -', error);
process.exit(result.errors.length ? 1 : 0);
