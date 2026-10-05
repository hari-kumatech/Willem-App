import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-110 shadow-card',
  secondary: 'bg-card-2 text-ink border border-line hover:border-soft',
  ghost: 'text-soft hover:text-ink hover:bg-card-2',
  danger: 'bg-transparent text-accent border border-accent/60 hover:bg-accent hover:text-accent-ink',
};
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';

export function Button({ variant = 'primary', className, ...props }: ComponentProps<'button'> & { variant?: Variant }) {
  return <button className={cx(BASE, VARIANTS[variant], className)} {...props} />;
}

export function ButtonLink({ variant = 'primary', className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(BASE, VARIANTS[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cx('rounded-xl border border-line bg-card shadow-card', className)} {...props} />;
}

export function CardHeader({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <h2 className="mek-heading text-base">{title}</h2>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="mek-heading text-2xl sm:text-3xl">
          <span className="mek-skew">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 text-sm text-soft">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function KansBadge({ kans, className }: { kans?: string | null; className?: string }) {
  const styles: Record<string, string> = {
    A: 'bg-positive/20 text-positive border-positive/40',
    B: 'bg-warning/20 text-warning border-warning/40',
    C: 'bg-soft/15 text-soft border-soft/30',
  };
  return (
    <span
      className={cx(
        'inline-flex h-7 w-7 items-center justify-center rounded-md border text-sm font-bold',
        styles[kans ?? ''] ?? 'border-line text-soft',
        className,
      )}
      title={kans ? `Kans ${kans}` : 'Geen kans'}
    >
      {kans || '–'}
    </span>
  );
}

export function Pill({ children, tone = 'soft', className }: { children: ReactNode; tone?: 'soft' | 'positive' | 'warning' | 'accent' | 'info'; className?: string }) {
  const tones = {
    soft: 'bg-card-2 text-soft border-line',
    positive: 'bg-positive/15 text-positive border-positive/30',
    warning: 'bg-warning/15 text-warning border-warning/30',
    accent: 'bg-accent/15 text-accent border-accent/30',
    info: 'bg-info/15 text-info border-info/30',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'positive' | 'warning' | 'accent' }) {
  const color = tone === 'positive' ? 'text-positive' : tone === 'warning' ? 'text-warning' : tone === 'accent' ? 'text-accent' : 'text-ink';
  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-soft">{label}</div>
      <div className={cx('mek-heading mt-1 text-2xl', color)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-soft">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="mek-heading text-lg text-soft">{title}</p>
      {children && <div className="mt-2 text-sm text-soft">{children}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'accent' | 'positive'; children: ReactNode }) {
  const tones = {
    info: 'border-info/40 bg-info/10',
    warning: 'border-warning/40 bg-warning/10',
    accent: 'border-accent/40 bg-accent/10',
    positive: 'border-positive/40 bg-positive/10',
  };
  return <div className={cx('rounded-lg border px-4 py-3 text-sm', tones[tone])}>{children}</div>;
}

// External link: always http(s), new tab, no referrer (A.8 XSS finding)
export function ExtLink({ href, children, className, title }: { href: string; children: ReactNode; className?: string; title?: string }) {
  if (!/^https?:\/\//i.test(href)) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cx('text-info hover:underline', className)} title={title}>
      {children}
    </a>
  );
}
