'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isLang, LANG_COOKIE } from './core';

export async function setLanguage(lang: string) {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}
