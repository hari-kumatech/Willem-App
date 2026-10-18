// One-off (INC-008): merge the MEK Movers leads (mm_documents, collection 'leads') into the Sales Hub leads table,
// so both apps use one leads list. Safe to run again: it does nothing once the MEK Movers lead documents are gone.
// For a lead that exists in both, the newer version wins; Sales Hub-only data (company, activities, quotes, hall,
// fit score, due date) is always kept. A backup of both lists is written to backups/ first.
// Usage: npm run leads:merge
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createDbClient, serviceToken } from '../src/lib/db';
import { loadLeadDocs, upsertLeadDocs } from '../src/modules/movers/leads';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const secret = process.env.AUTH_JWT_SECRET;
if (!secret) throw new Error('AUTH_JWT_SECRET must be set in .env.local (npm run db:start generates it)');
const db = createDbClient(process.env.POSTGREST_URL ?? 'http://127.0.0.1:54331', serviceToken(secret));

const docs: Record<string, Record<string, unknown>> = {};
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('mm_documents').select('id, data').eq('collection', 'leads').order('id').range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const row of data as { id: string; data: Record<string, unknown> }[]) docs[row.id] = row.data;
  if (data.length < 1000) break;
}

if (!Object.keys(docs).length) {
  console.log('Nothing to merge: the MEK Movers dashboard already uses the Sales Hub leads.');
} else {
  mkdirSync('backups', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `backups/merge-leads-${stamp}.json`;
  writeFileSync(file, JSON.stringify({ mekMoversLeads: docs, salesHubLeads: await loadLeadDocs(db) }));
  console.log(`Backup of both lead lists: ${file}`);
  const before = Object.keys(await loadLeadDocs(db)).length;
  const r = await upsertLeadDocs(db, docs, { userId: null, overwrite: false, onProgress: (d, t) => process.stdout.write(`\r  ${d}/${t}`) });
  process.stdout.write('\n');
  const after = Object.keys(await loadLeadDocs(db)).length;
  console.log(`Sales Hub leads: ${before} → ${after}  (added ${r.inserted}, updated from MEK Movers ${r.updated}, kept Sales Hub version ${r.unchanged})`);
  if (r.errors.length) {
    console.error(`${r.errors.length} error(s); MEK Movers lead documents are kept so you can run this again:`);
    for (const e of r.errors.slice(0, 20)) console.error(' -', e);
    process.exitCode = 1;
  } else {
    const { error } = await db.from('mm_documents').delete().eq('collection', 'leads');
    if (error) throw new Error(error.message);
    console.log('Done: the MEK Movers dashboard now reads and writes the Sales Hub leads.');
  }
}
