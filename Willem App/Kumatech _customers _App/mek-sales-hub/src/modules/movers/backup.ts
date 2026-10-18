// Automatic daily backup of the MEK Movers data, as the stand-alone server.js did: one file per day in
// backups/mek-movers/db-YYYY-MM-DD.json, the last 30 are kept. Started from src/instrumentation.ts.
// No server-only imports: instrumentation runs outside the React server layer.
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDbClient, serviceToken } from '@/lib/db';
import { loadAll } from './store';

export const BACKUP_DIR = join(process.cwd(), 'backups', 'mek-movers');
const KEEP = 30;
const FILE_RE = /^db-\d{4}-\d{2}-\d{2}\.json$/;

// Writes today's backup if it does not exist yet. Returns the file name, or null when nothing was written.
export async function dailyBackup(): Promise<string | null> {
  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (!secret) return null;
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
  const file = join(BACKUP_DIR, `db-${day}.json`);
  if (existsSync(file)) return null;
  const db = createDbClient((process.env.POSTGREST_URL ?? 'http://127.0.0.1:54331').replace(/\/+$/, ''), serviceToken(secret));
  const all = await loadAll(db);
  if (!Object.keys(all).length) return null;
  await mkdir(BACKUP_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(all));
  const files = (await readdir(BACKUP_DIR)).filter((f) => FILE_RE.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP))) await unlink(join(BACKUP_DIR, old));
  return file;
}
