import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@/lib/db/server';
import { broadcast } from '@/modules/movers/events';
import { authorize, json, readJson, text } from '@/modules/movers/http';
import { isValidBackup, loadAll, replaceAll } from '@/modules/movers/store';

export const dynamic = 'force-dynamic';

// POST /mek-movers/api/import — replace the whole database with a backup (admins only).
// The current state is saved first to backups/mek-movers-before-import-<time>.json, like the stand-alone server did.
export async function POST(request: Request) {
  const auth = await authorize('admin');
  if ('response' in auth) return auth.response;
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  if (!isValidBackup(parsed.body)) return text(400, 'Verwacht { collectie: { id: document } }');
  const db = await createClient();
  try {
    const before = await loadAll(db);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await mkdir(join(process.cwd(), 'backups'), { recursive: true });
    await writeFile(join(process.cwd(), 'backups', `mek-movers-before-import-${stamp}.json`), JSON.stringify(before));
    console.info(`[mek-movers] import by ${auth.user.email}; previous state saved in backups/`);
    const count = await replaceAll(db, parsed.body, { userId: auth.user.id });
    broadcast({ op: 'reload' });
    return json({ ok: true, collections: Object.keys(parsed.body).length, documents: count });
  } catch (error) {
    console.error('[mek-movers] import failed', error);
    return text(500, error instanceof Error ? error.message : 'Terugzetten mislukt');
  }
}
