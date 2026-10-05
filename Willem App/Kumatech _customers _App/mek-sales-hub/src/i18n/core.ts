// Bilingual UI: Dutch (default) and English (spec B.12).
// Each module keeps its own message file in src/i18n/messages/<module>.ts:
//
//   export const roi = defineMessages({
//     nl: { title: 'ROI & Offertes', saved: (n: string) => `Offerte ${n} opgeslagen` },
//     en: { title: 'ROI & Quotes',   saved: (n: string) => `Quote ${n} saved` },
//   });
//
// Server components: const t = await getMessages(roi)   (from '@/i18n/server')
// Client components: const t = useMessages(roi)          (from '@/i18n/client')
// The English object must have exactly the same keys as the Dutch one (checked by TypeScript).

export const LANGS = ['nl', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'nl';
export const LANG_COOKIE = 'mek-lang';

export const isLang = (value: unknown): value is Lang => value === 'nl' || value === 'en';

type Widen<T> = T extends string ? string : T extends (...args: infer A) => infer R ? (...args: A) => Widen<R> : T extends object ? { [K in keyof T]: Widen<T[K]> } : T;

export interface MessageSet<T> {
  nl: T;
  en: Widen<T>;
}

export function defineMessages<const T extends Record<string, unknown>>(set: { nl: T; en: Widen<T> }): MessageSet<T> {
  return set;
}

export function pick<T>(set: MessageSet<T>, lang: Lang): Widen<T> {
  return (lang === 'en' ? set.en : set.nl) as Widen<T>;
}

// Locale for Intl formatting
export const localeOf = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'nl-NL');
