import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { DEFAULT_LANG, isLang, LANG_COOKIE, pick, type Lang, type MessageSet } from './core';

// Language of the current request: cookie set by the NL/EN switch, Dutch by default
export const getLang = cache(async (): Promise<Lang> => {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
});

export async function getMessages<T>(set: MessageSet<T>) {
  return pick(set, await getLang());
}
