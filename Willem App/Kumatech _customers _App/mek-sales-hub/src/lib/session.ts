import 'server-only';
import { cookies, headers } from 'next/headers';
import { env } from '@/lib/env';
import { signJwt, verifyJwt } from '@/lib/jwt';
import { SESSION_COOKIE, SESSION_DAYS } from '@/lib/session-cookie';
import { createAdminClient } from '@/lib/db/admin';

// Login sessions without Supabase Auth: the session cookie holds a signed JWT (role authenticated, sub = user id).
// The same token is sent to PostgREST, so Row Level Security sees the user through auth.uid().

export async function getSessionToken(): Promise<string | undefined> {
  if (!env.authJwtSecret) return undefined;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifyJwt(token, env.authJwtSecret) ? token : undefined;
}

export async function getSessionUserId(): Promise<string | null> {
  if (!env.authJwtSecret) return null;
  const claims = verifyJwt((await cookies()).get(SESSION_COOKIE)?.value, env.authJwtSecret);
  return claims?.role === 'authenticated' && claims.sub ? claims.sub : null;
}

// Only in server actions and route handlers (server components cannot set cookies)
async function startSession(userId: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ role: 'authenticated', sub: userId, email, iat: now, exp: now + SESSION_DAYS * 86400 }, env.authJwtSecret!);
  const secure = (await headers()).get('x-forwarded-proto') === 'https';
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: SESSION_DAYS * 86400 });
}

// true when e-mail and password match; starts the session
export async function signInWithPassword(email: string, password: string): Promise<boolean> {
  const { data: userId, error } = await createAdminClient().rpc('auth_verify_password', { p_email: email, p_password: password });
  if (error || !userId) return false;
  await startSession(userId as string, email.trim().toLowerCase());
  return true;
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
}

// Accounts (admin work only; callers check the role first)
export async function createUser(input: { email: string; password: string; meta?: Record<string, unknown> }) {
  const { data, error } = await createAdminClient().rpc('auth_create_user', {
    p_email: input.email,
    p_password: input.password,
    p_meta: input.meta ?? {},
  });
  return { id: (data as string | null) ?? null, error: error ? { message: error.message } : null };
}

export async function setPassword(userId: string, password: string) {
  const { data, error } = await createAdminClient().rpc('auth_set_password', { p_user: userId, p_password: password });
  if (error) return { error: { message: error.message } };
  return { error: data ? null : { message: 'User not found' } };
}
