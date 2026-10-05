'use client';

import { ThemeProvider } from 'next-themes';
import { LangProvider } from '@/i18n/client';
import type { Lang } from '@/i18n/core';

// Dark is the MEK default; light is available from the header (B.12)
export function Providers({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} themes={['dark', 'light']}>
      <LangProvider lang={lang}>{children}</LangProvider>
    </ThemeProvider>
  );
}
