'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Pencil, Play } from 'lucide-react';
import { Button, Card, Empty, Notice, Pill } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { radarMsg } from '@/i18n/messages/radar';
import { dateTimeNl, relativeNl, usd } from '@/lib/format';
import { runProfileNow } from '@/modules/radar/actions';
import { parseFilters, parseSchedule, type Schedule } from '@/modules/radar/filters';
import { tilesFor } from '@/modules/radar/tiles';

interface ProfileRow {
  id: string;
  name: string;
  filters: unknown;
  schedule: unknown;
  budget_run: number;
  budget_month: number;
  max_companies: number;
  coverage_cursor: number;
  coverage_round: number;
  active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  monthSpend: number;
}

export function ProfilesView({ profiles, canEdit }: { profiles: ProfileRow[]; canEdit: boolean }) {
  const t = useMessages(radarMsg);
  const lang = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'positive' | 'accent'; text: string } | null>(null);

  const scheduleText = (s: Schedule) => {
    const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
    if (s.mode === 'daily') return `${t.form.scheduleModes.daily} ${hh(s.hour)}`;
    if (s.mode === 'weekly') return `${t.form.weekdays[s.weekday]} ${hh(s.hour)}`;
    if (s.mode === 'hours') return `${t.form.scheduleModes.hours.replace('N', String(s.everyHours))}`;
    return t.form.scheduleModes.off;
  };

  const run = (id: string) => {
    setBusy(id);
    startTransition(async () => {
      const result = await runProfileNow(id);
      setBusy(null);
      if (!result.ok) return setMessage({ tone: 'accent', text: result.error });
      setMessage({ tone: 'positive', text: t.runStarted });
      router.push(`/radar/runs/${result.runId}`);
    });
  };

  if (!profiles.length) {
    return (
      <Empty title={t.noProfiles}>
        <p>{t.noProfilesHint}</p>
        {canEdit && (
          <Link href="/radar/profiles/new" className="mt-3 inline-block font-semibold text-accent">
            {t.newProfile} →
          </Link>
        )}
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {profiles.map((p) => {
          const f = parseFilters(p.filters);
          const s = parseSchedule(p.schedule);
          const area =
            f.areaMode === 'radius' ? `${f.postcode} · ${f.radiusKm} km` : f.areaMode === 'provinces' ? f.provinces.join(', ') : t.form.areaModes.nl;
          return (
            <Card key={p.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <Pill tone={p.active ? 'positive' : 'soft'}>{p.active ? t.active : t.inactive}</Pill>
              </div>
              <p className="mt-1 text-sm text-soft">{t.form.areaModes[f.areaMode]}: {area}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {f.terms.slice(0, 6).map((term) => (
                  <Pill key={term}>{term}</Pill>
                ))}
                {f.terms.length > 6 && <Pill>+{f.terms.length - 6}</Pill>}
              </div>
              <dl className="mt-3 space-y-1 text-xs text-soft">
                <div>{t.form.schedule}: {scheduleText(s)}</div>
                <div>{t.lastRun}: {p.last_run_at ? relativeNl(p.last_run_at, lang) : t.never}</div>
                {p.active && p.next_run_at && <div>{t.nextRun}: {dateTimeNl(p.next_run_at, lang)}</div>}
                {f.areaMode !== 'radius' && <div>{t.coverage(p.coverage_cursor, tilesFor(f).length, p.coverage_round)}</div>}
                <div className="internal-only">{t.budgetLine(usd(p.budget_run, lang), usd(p.budget_month, lang), usd(p.monthSpend, lang))}</div>
                <div>{t.form.minKans}: {f.minKans} · {t.form.enrich.split(' (')[0]}: {f.enrich ? '✓' : '–'}</div>
              </dl>
              {canEdit && (
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => run(p.id)} disabled={pending}>
                    <Play size={16} /> {busy === p.id ? t.running : t.runNow}
                  </Button>
                  <Link href={`/radar/profiles/${p.id}`} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-soft hover:bg-card-2 hover:text-ink">
                    <Pencil size={14} /> {t.edit}
                  </Link>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
