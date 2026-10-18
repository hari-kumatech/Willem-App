import { createClient } from '@/lib/db/server';
import { authorize, text } from '@/modules/movers/http';
import { loadAll } from '@/modules/movers/store';

export const dynamic = 'force-dynamic';

// GET /mek-movers/api/export — download a full backup
export async function GET() {
  const auth = await authorize('read');
  if ('response' in auth) return auth.response;
  try {
    const all = await loadAll(await createClient());
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
    return new Response(JSON.stringify(all, null, 1), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="mek-movers-backup-${day}.json"`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[mek-movers] export failed', error);
    return text(500, 'Database niet bereikbaar');
  }
}
