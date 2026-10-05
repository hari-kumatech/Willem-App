import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardHeader, KansBadge, PageHeader, Pill, Stat } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { PROVINCES, STATUS_CODES } from '@/lib/constants';
import { dateNl, euro, relativeNl, todayIso } from '@/lib/format';
import { getLang, getMessages } from '@/i18n/server';
import { overviewMsg } from '@/i18n/messages/overview';
import { common } from '@/i18n/messages/common';
import { radarMsg } from '@/i18n/messages/radar';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(common)).nav.overzicht };
}

const STATUS_COLORS: Record<string, string> = {
  prospect: 'var(--soft)',
  benaderd: 'var(--info)',
  interesse: 'var(--warning)',
  offerte: '#c58cf0',
  gewonnen: 'var(--positive)',
  verloren: 'var(--accent)',
};

interface Bucket {
  count: number;
  byStatus: Record<string, number>;
  pipeline: number;
  quotes: number;
  won: number;
  quotesWon: number;
  lost: number;
  openA: number;
  updated: string | null;
}

const empty = (): Bucket => ({ count: 0, byStatus: {}, pipeline: 0, quotes: 0, won: 0, quotesWon: 0, lost: 0, openA: 0, updated: null });

function add(b: Bucket, l: { status: string; kans: string | null; waarde: number; updated_at: string }) {
  b.count++;
  b.byStatus[l.status] = (b.byStatus[l.status] ?? 0) + 1;
  const w = Number(l.waarde) || 0;
  if (l.status === 'interesse' || l.status === 'offerte') b.pipeline += w;
  if (l.status === 'offerte') b.quotes += w;
  if (l.status === 'gewonnen') {
    b.won++;
    b.quotesWon += w;
  }
  if (l.status === 'verloren') b.lost++;
  if (l.kans === 'A' && !['gewonnen', 'verloren'].includes(l.status)) b.openA++;
  if (!b.updated || l.updated_at > b.updated) b.updated = l.updated_at;
}

export default async function OverviewPage() {
  await requireUser();
  const supabase = await createClient();
  const lang = await getLang();
  const [t, tc, tr] = await Promise.all([getMessages(overviewMsg), getMessages(common), getMessages(radarMsg)]);

  const [{ data: leads }, { count: queueCount }, { data: finds }, { data: runs }, { data: due }] = await Promise.all([
    supabase.from('leads').select('status, kans, waarde, provincie, updated_at').limit(20000),
    supabase.from('review_queue').select('id', { count: 'exact', head: true }).eq('state', 'new'),
    supabase
      .from('review_queue')
      .select('created_at, companies!inner(id, name, kans, fit_score, city, segment)')
      .eq('state', 'new')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('search_runs').select('id, profile_name, status, queued_count, started_at').order('started_at', { ascending: false }).limit(5),
    supabase
      .from('leads')
      .select('id, bedrijf, volgende, due_date')
      .lte('due_date', todayIso())
      .not('status', 'in', '(gewonnen,verloren)')
      .order('due_date')
      .limit(8),
  ]);

  const national = empty();
  const byProvince = new Map<string, Bucket>();
  for (const l of leads ?? []) {
    add(national, l);
    const key = l.provincie || '';
    if (!byProvince.has(key)) byProvince.set(key, empty());
    add(byProvince.get(key)!, l);
  }
  const ratio = (b: Bucket) => (b.won + b.lost > 0 ? `${Math.round((b.won / (b.won + b.lost)) * 100)}%` : '–');
  const tiles = [...PROVINCES.map((p) => ({ slug: p.slug, name: p.name, b: byProvince.get(p.name) ?? empty() })), { slug: 'geen', name: t.noProvince, b: byProvince.get('') ?? empty() }];

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={t.totalLeads} value={national.count} hint={t.openA(national.openA)} />
        <Stat label={t.openPipeline} value={euro(national.pipeline, 0, lang)} tone="warning" />
        <Stat label={t.quotesOut} value={euro(national.quotes, 0, lang)} />
        <Stat label={t.won} value={euro(national.quotesWon, 0, lang)} hint={`${national.won}×`} tone="positive" />
        <Stat label={t.winRatio} value={ratio(national)} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tiles.map(({ slug, name, b }) =>
          slug === 'geen' && b.count === 0 ? null : (
            <Link key={slug} href={`/leads?provincie=${slug}`} className="rounded-xl border border-line bg-card p-4 shadow-card transition hover:border-soft">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="mek-heading text-base">{name}</h2>
                <span className="text-sm text-soft">{t.leads(b.count)}</span>
              </div>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-card-2" aria-hidden>
                {b.count > 0 &&
                  STATUS_CODES.map((s) => (b.byStatus[s] ? <div key={s} style={{ width: `${(b.byStatus[s] / b.count) * 100}%`, background: STATUS_COLORS[s] }} /> : null))}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-soft">
                <div>{t.pipeline}: <span className="text-ink">{euro(b.pipeline, 0, lang)}</span></div>
                <div>{t.quotes}: <span className="text-ink">{euro(b.quotes, 0, lang)}</span></div>
                <div>{t.wonShort}: <span className="text-ink">{b.won}</span> · {ratio(b)}</div>
                <div>{t.openALeads}: <span className="text-ink">{b.openA}</span></div>
              </dl>
              {b.updated && <div className="mt-1 text-[11px] text-soft">{t.updated} {relativeNl(b.updated, lang)}</div>}
            </Link>
          ),
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t.newestFinds}>
            <Link href="/radar" className="text-xs text-info hover:underline">{t.queueOpen(queueCount ?? 0)}</Link>
          </CardHeader>
          <ul className="divide-y divide-line">
            {(finds ?? []).length === 0 && <li className="p-4 text-sm text-soft">{t.noFinds}</li>}
            {(finds ?? []).map((f) => {
              const c = f.companies as unknown as { id: string; name: string; kans: string | null; fit_score: number | null; city: string; segment: string };
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2">
                  <KansBadge kans={c.kans} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/radar/companies/${c.id}`} className="block truncate font-medium hover:text-accent">{c.name}</Link>
                    <div className="truncate text-xs text-soft">{tc.segments[c.segment as keyof typeof tc.segments] ?? c.segment} · {c.city}</div>
                  </div>
                  <span className="internal-only text-sm tabular-nums text-soft">{c.fit_score}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t.runs}>
            <Link href="/radar?tab=runs" className="text-xs text-info hover:underline">{t.toRadar}</Link>
          </CardHeader>
          <ul className="divide-y divide-line">
            {(runs ?? []).length === 0 && <li className="p-4 text-sm text-soft">{t.noRuns}</li>}
            {(runs ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                <Link href={`/radar/runs/${r.id}`} className="truncate hover:text-accent">{r.profile_name}</Link>
                <span className="flex items-center gap-2 text-xs text-soft">
                  <Pill tone={r.status === 'done' ? 'positive' : r.status === 'failed' ? 'accent' : 'info'}>{tr.status[r.status as keyof typeof tr.status] ?? r.status}</Pill>
                  +{r.queued_count} · {relativeNl(r.started_at, lang)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t.dueToday} />
          <ul className="divide-y divide-line">
            {(due ?? []).length === 0 && <li className="p-4 text-sm text-soft">{t.noDue}</li>}
            {(due ?? []).map((d) => (
              <li key={d.id} className="px-4 py-2 text-sm">
                <Link href={`/leads/${d.id}`} className="font-medium hover:text-accent">{d.bedrijf}</Link>
                <div className="text-xs text-soft">{dateNl(d.due_date)} · {d.volgende}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
