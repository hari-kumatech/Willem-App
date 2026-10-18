import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/db/server';
import { getSessionUserId } from '@/lib/session';

export type Role = 'admin' | 'sales' | 'viewer';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

// The logged-in user with their role, or null. Cached per request.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const db = await createClient();
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, name, role')
    .eq('id', userId)
    .maybeSingle();
  if (!profile) return null;
  return profile as SessionUser;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}

export const canWrite = (user: SessionUser | null) => user?.role === 'admin' || user?.role === 'sales';
export const isAdmin = (user: SessionUser | null) => user?.role === 'admin';

export class ForbiddenError extends Error {
  constructor(message = 'Je hebt geen rechten voor deze actie.') {
    super(message);
  }
}

export async function requireWriter(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canWrite(user)) throw new ForbiddenError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) throw new ForbiddenError('Alleen een admin mag dit.');
  return user;
}
