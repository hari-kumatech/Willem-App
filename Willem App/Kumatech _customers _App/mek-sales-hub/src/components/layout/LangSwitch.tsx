'use client';

import { useTransition } from 'react';
import { setLanguage } from '@/i18n/actions';
import type { Lang } from '@/i18n/core';
import { cx } from '@/components/ui';

// NL / EN switch (used on the login page; the app header has its own copy)
export function LangSwitch({ lang }: { lang: Lang }) {
  const [, startTransition] = useTransition();
  return (
    <div className="flex overflow-hidden rounded-lg border border-line text-xs font-semibold" role="group" aria-label="Taal / Language">
      {(['nl', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => startTransition(() => setLanguage(code))}
          aria-pressed={lang === code}
          className={cx('px-2.5 py-1 uppercase', lang === code ? 'bg-card-2 text-ink' : 'text-soft hover:text-ink')}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
