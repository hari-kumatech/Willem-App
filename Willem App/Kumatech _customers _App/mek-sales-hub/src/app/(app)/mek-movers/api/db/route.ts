import { createClient } from '@/lib/db/server';
import { authorize, json, text } from '@/modules/movers/http';
import { loadAll } from '@/modules/movers/store';

export const dynamic = 'force-dynamic';

// GET /mek-movers/api/db — whole database { collection: { id: document } }
export async function GET() {
  const auth = await authorize('read');
  if ('response' in auth) return auth.response;
  try {
    return json(await loadAll(await createClient()));
  } catch (error) {
    console.error('[mek-movers] load failed', error);
    return text(500, 'Database niet bereikbaar');
  }
}
