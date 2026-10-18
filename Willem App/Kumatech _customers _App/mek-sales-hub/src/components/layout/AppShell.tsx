'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState, useTransition } from 'react';
import { BarChart3, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { Logo } from './Logo';
import { SideNav } from './SideNav';
import { cx } from '@/components/ui';
import { logout } from '@/modules/auth/actions';
import { setPresentationMode } from '@/modules/auth/preferences';
import type { SessionUser } from '@/lib/auth';
import { useLang, useMessages } from '@/i18n/client';
import { setLanguage } from '@/i18n/actions';
import { common } from '@/i18n/messages/common';

export function AppShell({
  user,
  presentation,
  queueCount,
  mode,
  children,
}: {
  user: SessionUser;
  presentation: boolean;
  queueCount: number;
  mode: { demo: boolean; ai: boolean; aiLabel?: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const t = useMessages(common);
  const lang = useLang();
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);

  const nav = <SideNav pathname={pathname} queueCount={queueCount} />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col gap-5 border-r border-line bg-card px-3 py-5 lg:flex">
        <Link href="/overzicht" className="flex items-center gap-3 px-2">
          <Logo className="h-7 w-auto" />
          <span className="mek-heading text-sm text-soft">Sales Hub</span>
        </Link>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{nav}</div>
        <div className="mt-auto space-y-2 px-2 text-xs text-soft">
          <div className="flex flex-wrap gap-1">
            <span className={cx('rounded px-1.5 py-0.5', mode.demo ? 'bg-warning/20 text-warning' : 'bg-positive/20 text-positive')}>
              {mode.demo ? t.modeDemo : t.modeN8n}
            </span>
            <span className={cx('rounded px-1.5 py-0.5', mode.ai ? 'bg-positive/20 text-positive' : 'bg-warning/20 text-warning')}>
              {mode.ai ? mode.aiLabel ?? t.modeAi : t.modeRules}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar */}
        <header className="no-print sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur">
          <button className="rounded-lg p-2 text-soft hover:bg-card-2 lg:hidden" onClick={() => setOpen(true)} aria-label={t.menuOpen}>
            <Menu size={20} />
          </button>
          <Link href="/overzicht" className="lg:hidden">
            <Logo className="h-6 w-auto" />
          </Link>
          <div className="flex-1" />
          <button
            onClick={() => startTransition(() => setPresentationMode(!presentation))}
            disabled={pending}
            aria-pressed={presentation}
            className={cx(
              'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
              presentation ? 'border-accent bg-accent text-accent-ink' : 'border-line text-soft hover:text-ink',
            )}
            title={t.presentationHint}
          >
            <BarChart3 size={14} aria-hidden />
            <span className="hidden sm:inline">{t.presentation}</span>
            <span>{presentation ? t.on : t.off}</span>
          </button>
          <div className="flex overflow-hidden rounded-lg border border-line text-xs font-semibold" role="group" aria-label={t.language}>
            {(['nl', 'en'] as const).map((code) => (
              <button
                key={code}
                onClick={() => startTransition(() => setLanguage(code))}
                aria-pressed={lang === code}
                className={cx('px-2 py-1.5 uppercase', lang === code ? 'bg-card-2 text-ink' : 'text-soft hover:text-ink')}
              >
                {code}
              </button>
            ))}
          </div>
          <button
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg p-2 text-soft hover:bg-card-2 hover:text-ink"
            aria-label={t.theme}
          >
            {mounted && resolvedTheme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <div className="hidden text-right text-xs leading-tight sm:block">
            <div className="font-semibold">{user.name || user.email}</div>
            <div className="text-soft">{t.roles[user.role]}</div>
          </div>
          <form action={logout}>
            <button className="rounded-lg p-2 text-soft hover:bg-card-2 hover:text-ink" aria-label={t.logout} title={t.logout}>
              <LogOut size={18} />
            </button>
          </form>
        </header>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 overflow-y-auto bg-card p-4">
              <div className="flex items-center justify-between">
                <Logo className="h-7 w-auto" />
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-soft" aria-label={t.menuClose}>
                  <X size={20} />
                </button>
              </div>
              {nav}
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
