import { createClient } from '@/lib/db/server';
import { broadcast } from '@/modules/movers/events';
import { authorize, json, readJson, text } from '@/modules/movers/http';
import { deleteDoc, isPlainObject, NAME_RE, patchDoc, setDoc } from '@/modules/movers/store';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ col: string; id: string }> };

const decode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

async function target(ctx: Ctx) {
  const p = await ctx.params;
  const col = decode(p.col);
  const id = decode(p.id);
  return NAME_RE.test(col) && NAME_RE.test(id) ? { col, id } : null;
}

async function write(request: Request, ctx: Ctx, op: 'set' | 'update') {
  const auth = await authorize('write');
  if ('response' in auth) return auth.response;
  const t = await target(ctx);
  if (!t) return text(400, 'Ongeldige collectie of id');
  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  if (!isPlainObject(parsed.body)) return text(400, 'Een document moet een object zijn');
  const db = await createClient();
  try {
    if (op === 'set') await setDoc(db, t.col, t.id, parsed.body, auth.user.id);
    else if (!(await patchDoc(db, t.col, t.id, parsed.body, auth.user.id))) return text(404, 'Document bestaat niet');
  } catch (error) {
    console.error('[mek-movers] write failed', error);
    return text(500, 'Opslaan mislukt');
  }
  broadcast({ op, col: t.col, id: t.id, data: parsed.body, client: request.headers.get('x-client') ?? '' });
  return json({ ok: true });
}

// PUT = create or replace, PATCH = merge fields, DELETE = remove (same as the stand-alone server)
export const PUT = (request: Request, ctx: Ctx) => write(request, ctx, 'set');
export const PATCH = (request: Request, ctx: Ctx) => write(request, ctx, 'update');

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await authorize('write');
  if ('response' in auth) return auth.response;
  const t = await target(ctx);
  if (!t) return text(400, 'Ongeldige collectie of id');
  try {
    await deleteDoc(await createClient(), t.col, t.id);
  } catch (error) {
    console.error('[mek-movers] delete failed', error);
    return text(500, 'Verwijderen mislukt');
  }
  broadcast({ op: 'delete', col: t.col, id: t.id, client: request.headers.get('x-client') ?? '' });
  return json({ ok: true });
}
