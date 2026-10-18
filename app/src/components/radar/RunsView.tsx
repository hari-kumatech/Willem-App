'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card, Empty, Pill } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { radarMsg } from '@/i18n/messages/radar';
import { dateTimeNl, usd } from '@/lib/format';

export interface RunRowView {
  id: string;
  profile_name: string;
  trigger: string;
  status: string;
  found: number;
  new_count: number;
  qualified: number;
  queued_count: number;
  apify_cost: number;
  ai_cost: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export const ACTIVE_STATUSES = ['queued', 'discovering', 'enriching', 'qualifying'];

export function statusTone(status: string): 'positive' | 'accent' | 'warning' | 'info' {
  if (status === 'done') return 'positive';
  if (status === 'failed') return 'accent';
  if (status === 'budget_reached') return 'warning';
  return 'info';
}

export function duration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Polls while a run is active (B.12 run monitoring)
export function useAutoRefresh(active: boolean, ms = 4000) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [active, ms, router]);
}

export function RunsView({ runs }: { runs: RunRowView[] }) {
  const t = useMessages(radarMsg);
  const lang = useLang();
  const anyActive = runs.some((r) => ACTIVE_STATUSES.includes(r.status));
  useAutoRefresh(anyActive);

  if (!runs.length) return <Empty title={t.runsEmpty} />;
  return (
    <Card className="overflow-hidden">
      {anyActive && <p className="border-b border-line px-4 py-2 text-xs text-soft">{t.autoRefresh}</p>}
      <div className="table-wrap">
        <table className="data min-w-[860px]">
          <thead>
            <tr>
              <th>{t.cols.started}</th>
              <th>{t.cols.profile}</th>
              <th>{t.cols.status}</th>
              <th className="text-right">{t.cols.found}</th>
              <th className="text-right">{t.cols.new}</th>
              <th className="text-right">{t.cols.qualified}</th>
              <th className="text-right">{t.cols.queued}</th>
              <th className="internal-only text-right">{t.cols.cost}</th>
              <th className="text-right">{t.cols.duration}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">
                  <Link href={`/radar/runs/${r.id}`} className="hover:text-accent">{dateTimeNl(r.started_at, lang)}</Link>
                  <div className="text-xs text-soft">{t.trigger[r.trigger as keyof typeof t.trigger] ?? r.trigger}</div>
                </td>
                <td>{r.profile_name}</td>
                <td>
                  <Pill tone={statusTone(r.status)}>{t.status[r.status as keyof typeof t.status] ?? r.status}</Pill>
                  {r.error && <div className="mt-1 max-w-64 truncate text-xs text-accent" title={r.error}>{r.error}</div>}
                </td>
                <td className="text-right tabular-nums">{r.found}</td>
                <td className="text-right tabular-nums">{r.new_count}</td>
                <td className="text-right tabular-nums">{r.qualified}</td>
                <td className="text-right font-semibold tabular-nums">{r.queued_count}</td>
                <td className="internal-only whitespace-nowrap text-right text-xs tabular-nums">
                  {usd(Number(r.apify_cost), lang)} + {usd(Number(r.ai_cost), lang)}
                </td>
                <td className="text-right text-xs text-soft">{duration(r.started_at, r.finished_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
