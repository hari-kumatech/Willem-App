'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMessages } from '@/i18n/server';
import { common } from '@/i18n/messages/common';

export interface AuthState {
  error?: string;
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = (await getMessages(common)).login;
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email(t.invalidEmail), password: z.string().min(1, t.noPassword) })
    .safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: t.wrong };
  redirect('/overzicht');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function hasUsers(): Promise<boolean> {
  const { count } = await createAdminClient().from('profiles').select('id', { count: 'exact', head: true });
  return (count ?? 0) > 0;
}

// First run only: create the first account, which becomes admin (trigger in the migration).
export async function setupFirstAdmin(_prev: AuthState, form: FormData): Promise<AuthState> {
  const t = (await getMessages(common)).login;
  if (await hasUsers()) return { error: t.alreadySetup };
  const parsed = z
    .object({
      name: z.string().trim().min(2, t.nameRequired).max(80),
      email: z.string().trim().toLowerCase().email(t.invalidEmail),
      password: z.string().min(8, t.passwordShort),
    })
    .safeParse({ name: form.get('name'), email: form.get('email'), password: form.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { name: parsed.data.name },
  });
  if (error) return { error: t.createFailed(error.message) };
  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  redirect('/overzicht');
}
