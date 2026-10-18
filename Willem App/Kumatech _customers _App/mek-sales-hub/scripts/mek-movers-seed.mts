// Loads the MEK Movers data snapshot (dashboard, besparingscalculator, besparingsvideo) into mm_documents;
// its leads are merged into the Sales Hub leads table (one leads list).
// Usage: npm run mek-movers:seed                     (db/seed-data/mek-movers-seed.json, only when the table is empty)
//        npm run mek-movers:seed -- path/to/backup.json --force   (replace everything, e.g. with a db.json backup)
import { existsSync, readFileSync } from 'node:fs';
import { createDbClient, serviceToken } from '../src/lib/db';
import { isValidBackup, loadAll, replaceAll } from '../src/modules/movers/store';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const secret = process.env.AUTH_JWT_SECRET;
if (!secret) {
  console.error('AUTH_JWT_SECRET must be set in .env.local (npm run db:start generates it)');
  process.exit(1);
}
const args = process.argv.slice(2);
const force = args.includes('--force');
const file = args.find((a) => !a.startsWith('--')) ?? 'db/seed-data/mek-movers-seed.json';

const db = createDbClient(process.env.POSTGREST_URL ?? 'http://127.0.0.1:54331', serviceToken(secret));
const current = await loadAll(db);
// Leads live in the Sales Hub leads table (shared with the Sales Hub); only the other collections decide "empty"
const count = (all: Record<string, Record<string, unknown>>) =>
  Object.entries(all)
    .filter(([c]) => c !== 'leads')
    .reduce((n, [, docs]) => n + Object.keys(docs).length, 0);
// No process.exit() after network calls: on Windows that can crash Node while sockets are closing
if (count(current) && !force) {
  console.log(`mm_documents already has ${count(current)} documents; nothing changed (use --force to replace them).`);
} else {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isValidBackup(data)) {
    console.error(`${file} is not a MEK Movers backup ({ collection: { id: document } }).`);
    process.exitCode = 1;
  } else {
    const inserted = await replaceAll(db, data, {
      userId: null,
      onProgress: (done, total) => process.stdout.write(`\r  leads ${done}/${total}`),
    });
    process.stdout.write('\n');
    console.log(`Loaded ${inserted} documents from ${file}:`);
    for (const [col, docs] of Object.entries(data)) console.log(`  ${col.padEnd(14)} ${Object.keys(docs).length}`);
  }
}
