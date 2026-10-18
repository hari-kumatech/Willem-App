'use client';

import Link from 'next/link';
import { Card, CardHeader, KansBadge, Notice, PageHeader, Pill, Stat } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { radarMsg } from '@/i18n/messages/radar';
import { dateTimeNl, usd } from '@/lib/format';
import { ACTIVE_STATUSES, duration, statusTone, useAutoRefresh } from './RunsView';

interface Run {
  id: string;
  profile_name: string;
  trigger: string;
  status: string;
  plan: { term: string; area: { postcode: string; label: string; radiusKm: number } }[];
  found: number;
  new_count: number;
  prefiltered: number;
  enriched: number;
  qualified: number;
  queued_count: number;
  web_found?: number;
  web_resolved?: number;
  apify_cost: number;
  ai_cost: number;
  budget_usd: number;
  budget_hit: boolean;
  dropped: Record<string, number>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export function RunDetail({
  run,
  batches,
  companies,
}: {
  run: Run;
  batches: { batch_id: string; kind: string; item_count: number; cost_usd: number; error: string | null; received_at: string }[];
  companies: { id: string; name: string; kans: string | null; fit_score: number | null; state: string; city: string; segment: string }[];
}) {
  const t = useMessages(radarMsg);
  const lang = useLang();
  const active = ACTIVE_STATUSES.includes(run.status);
  useAutoRefresh(active, 3000);

  const areas = [...new Map(run.plan.map((p) => [`${p.area.postcode}-${p.area.radiusKm}`, p.area])).values()];
  const terms = [...new Set(run.plan.map((p) => p.term))];

  return (
    <div className="space-y-4">
      <PageHeader title={`${t.run}: ${run.profile_name}`} subtitle={`${dateTimeNl(run.started_at, lang)} · ${t.trigger[run.trigger as keyof typeof t.trigger] ?? run.trigger} · ${duration(run.started_at, run.finished_at)}`}>
        <Pill tone={statusTone(run.status)}>{t.status[run.status as keyof typeof t.status] ?? run.status}</Pill>
      </PageHeader>
      {active && <Notice tone="info">{t.autoRefresh}</Notice>}
      {run.error && <Notice tone="accent">{t.error}: {run.error}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t.cols.found} value={run.found} />
        <Stat label={t.cols.new} value={run.new_count} />
        <Stat label="Prefilter ✓" value={run.prefiltered} />
        <Stat label={t.form.enrich.split(' (')[0]} value={run.enriched} />
        <Stat label={t.cols.qualified} value={run.qualified} />
        <Stat label={t.cols.queued} value={run.queued_count} tone="positive" />
      </div>
      {(run.web_found ?? 0) > 0 && (
        <p className="text-sm text-soft">
          {lang === 'nl'
            ? `LinkedIn en nieuws: ${run.web_found} bedrijfsnamen gevonden, ${run.web_resolved ?? 0} teruggevonden in Google Maps en meegenomen in deze run.`
            : `LinkedIn and news: ${run.web_found} company names found, ${run.web_resolved ?? 0} matched in Google Maps and included in this run.`}
        </p>
      )}
      <div className="internal-only grid gap-3 sm:grid-cols-2">
        <Stat label={t.apify} value={usd(Number(run.apify_cost), lang)} hint={`${t.of} ${usd(Number(run.budget_usd), lang)}${run.budget_hit ? ` · ${t.status.budget_reached}` : ''}`} tone={run.budget_hit ? 'warning' : undefined} />
        <Stat label={t.claude} value={usd(Number(run.ai_cost), lang)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.plan} />
          <div className="space-y-2 p-4 text-sm">
            <div className="flex flex-wrap gap-1">{terms.map((term) => <Pill key={term}>{term}</Pill>)}</div>
            <div className="flex flex-wrap gap-1">{areas.map((a) => <Pill key={`${a.postcode}-${a.label}`} tone="info">{a.label || a.postcode} · {a.radiusKm} km</Pill>)}</div>
          </div>
        </Card>
        <Card>
          <CardHeader title={t.dropped} />
          <div className="flex flex-wrap gap-1.5 p-4">
            {Object.keys(run.dropped ?? {}).length === 0 ? (
              <span className="text-sm text-soft">–</span>
            ) : (
              Object.entries(run.dropped).map(([reason, n]) => (
                <Pill key={reason}>{t.droppedReasons[reason as keyof typeof t.droppedReasons] ?? reason}: {n}</Pill>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={t.batches} />
        <div className="table-wrap">
          <table className="data">
            <tbody>
              {batches.map((b) => (
                <tr key={b.batch_id}>
                  <td className="font-mono text-xs">{b.batch_id}</td>
                  <td>{b.kind}</td>
                  <td className="text-right tabular-nums">{b.item_count}</td>
                  <td className="internal-only text-right text-xs tabular-nums">{usd(Number(b.cost_usd), lang)}</td>
                  <td className="text-xs text-accent">{b.error}</td>
                  <td className="text-xs text-soft">{dateTimeNl(b.received_at, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {companies.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader title={t.tabs.companies} />
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td><KansBadge kans={c.kans} /></td>
                    <td><Link href={`/radar/companies/${c.id}`} className="font-semibold hover:text-accent">{c.name}</Link><div className="text-xs text-soft">{c.segment} · {c.city}</div></td>
                    <td className="internal-only text-right tabular-nums">{c.fit_score ?? '–'}</td>
                    <td><Pill>{t.stateLabels[c.state as keyof typeof t.stateLabels] ?? c.state}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
