import 'server-only';
import { NextResponse } from 'next/server';
import { canWrite, getSessionUser, isAdmin, type SessionUser } from '@/lib/auth';
import { MAX_BODY_BYTES } from './store';

// Helpers for the /mek-movers/api/* route handlers (the API the stand-alone server.js offered).

export const text = (status: number, body: string) =>
  new NextResponse(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

type Need = 'read' | 'write' | 'admin';

// The logged-in user with enough rights, or an error response (401 / 403)
export async function authorize(need: Need): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { response: text(401, 'Niet ingelogd') };
  if (need === 'write' && !canWrite(user)) return { response: text(403, 'Alleen-lezen: je rol is viewer') };
  if (need === 'admin' && !isAdmin(user)) return { response: text(403, 'Alleen een admin mag dit') };
  return { user };
}

export async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return { ok: false, response: text(413, 'Te groot') };
  if (!raw) return { ok: true, body: undefined };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, response: text(400, 'Ongeldige JSON') };
  }
}
