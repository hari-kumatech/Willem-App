import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'sales' | 'viewer';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

// The logged-in user with their role, or null. Cached per request.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, role')
    .eq('id', data.user.id)
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
