'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Download, Mail, MapPin, Phone, Globe, Plus, Upload, UserSearch, ArrowUpDown } from 'lucide-react';
import { Button, Card, Empty, ExtLink, KansBadge, Notice, Pill, cx } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { leadsMsg } from '@/i18n/messages/leads';
import { dateNl, euro, todayIso } from '@/lib/format';
import { PROVINCES, STATUSES } from '@/lib/constants';
import { googleLinkedinUrl, linkedinSearchUrl } from '@/lib/text';
import { changeStatus, importLeadsFile } from '@/modules/leads/actions';
import type { LeadKpis } from '@/modules/leads/queries';
import type { Lead, LeadFilters } from '@/modules/leads/types';
import { LeadForm } from './LeadForm';

const STATUS_COLORS: Record<string, string> = {
  prospect: 'var(--soft)',
  benaderd: 'var(--info)',
  interesse: 'var(--warning)',
  offerte: '#c58cf0',
  gewonnen: 'var(--positive)',
  verloren: 'var(--accent)',
};

export function LeadsView({
  leads,
  count,
  pages,
  kpis,
  filters,
  canEdit,
  price,
}: {
  leads: Lead[];
  count: number;
  pages: number;
  kpis: LeadKpis;
  filters: LeadFilters;
  canEdit: boolean;
  price: number;
}) {
  const t = useMessages(leadsMsg);
  const tc = useMessages(common);
  const lang = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Lead | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [q, setQ] = useState(filters.q);
  const [banner, setBanner] = useState<{ tone: 'positive' | 'accent' | 'info'; text: string } | null>(null);
  const [lostFor, setLostFor] = useState<Lead | null>(null);
  const [lostReason, setLostReason] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (resetPage) next.delete('page');
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // Live search with a short debounce
  useEffect(() => {
    if (q === filters.q) return;
    const id = setTimeout(() => update({ q: q.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const anyFilter = filters.status || filters.kans.length || filters.familie || filters.plaats || filters.q;
  const toggleKans = (k: string) => {
    const set = new Set(filters.kans);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    update({ kans: [...set].sort().join(',') || null });
  };
  const sortBy = (col: LeadFilters['sort']) => {
    const dir = filters.sort === col ? (filters.dir === 'asc' ? 'desc' : 'asc') : col === 'datum' || col === 'waarde' ? 'desc' : 'asc';
    update({ sort: col, dir }, false);
  };

  const onStatus = (lead: Lead, status: string) => {
    if (status === 'verloren') {
      setLostFor(lead);
      setLostReason(lead.reden);
      return;
    }
    startTransition(async () => {
      const result = await changeStatus(lead.id, lead.version, status);
      setBanner(result.ok ? { tone: 'positive', text: t.statusSaved } : { tone: 'accent', text: result.error });
      router.refresh();
    });
  };

  const confirmLost = () => {
    if (!lostFor) return;
    if (!lostReason.trim()) return setBanner({ tone: 'accent', text: t.errors.reden });
    const lead = lostFor;
    setLostFor(null);
    startTransition(async () => {
      const result = await changeStatus(lead.id, lead.version, 'verloren', lostReason.trim());
      setBanner(result.ok ? { tone: 'positive', text: t.statusSaved } : { tone: 'accent', text: result.error });
      router.refresh();
    });
  };

  const onImport = (file: File) => {
    const form = new FormData();
    form.set('file', file);
    setBanner({ tone: 'info', text: t.import.busy(0, 1) });
    startTransition(async () => {
      const result = await importLeadsFile(form);
      if (!result.ok) return setBanner({ tone: 'accent', text: result.error });
      const spread = Object.entries(result.provinces)
        .map(([p, n]) => `${p} ${n}`)
        .join(' · ');
      setBanner({ tone: 'positive', text: `${t.import.done(result.inserted, result.skipped, file.name)} ${t.import.provinces} ${spread}` });
      router.refresh();
    });
  };

  const exportHref = (format: string) => `/api/export/leads?format=${format}${filters.provincie ? `&provincie=${filters.provincie}` : ''}`;
  const moneyTotal = ['interesse', 'offerte', 'gewonnen', 'verloren'].reduce((s, k) => s + kpis.byStatus[k].sum, 0);
  const today = todayIso();

  const SortTh = ({ col, children, className }: { col: LeadFilters['sort']; children: React.ReactNode; className?: string }) => (
    <th className={className} aria-sort={filters.sort === col ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="inline-flex items-center gap-1 uppercase hover:text-ink" onClick={() => sortBy(col)}>
        {children}
        <ArrowUpDown size={12} className={filters.sort === col ? 'text-accent' : 'opacity-40'} />
      </button>
    </th>
  );

  return (
    <div className={cx('space-y-4', pending && 'opacity-80 transition-opacity')}>
      {/* KPI tiles per status; click toggles the status filter (A.1) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {STATUSES.map((s) => {
          const k = kpis.byStatus[s.code];
          const active = filters.status === s.code;
          return (
            <button
              key={s.code}
              onClick={() => update({ status: active ? null : s.code })}
              aria-pressed={active}
              className={cx(
                'rounded-xl border bg-card p-3 text-left shadow-card transition hover:border-soft',
                active ? 'border-accent ring-1 ring-accent' : 'border-line',
              )}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-soft">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[s.code] }} />
                {tc.statuses[s.code]}
              </div>
              <div className="mek-heading mt-1 text-2xl">{k.count}</div>
              <div className="text-xs text-soft">{s.money ? euro(k.sum, 0, lang) : `A ${k.A} · B ${k.B} · C ${k.C}`}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-soft">{t.valueSplit}</div>
          <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-card-2" role="img" aria-label={t.valueSplit}>
            {moneyTotal > 0 &&
              ['interesse', 'offerte', 'gewonnen', 'verloren'].map((k) => (
                <div key={k} style={{ width: `${(kpis.byStatus[k].sum / moneyTotal) * 100}%`, background: STATUS_COLORS[k] }} title={`${tc.statuses[k as 'offerte']}: ${euro(kpis.byStatus[k].sum, 0, lang)}`} />
              ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
            {['interesse', 'offerte', 'gewonnen', 'verloren'].map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[k] }} />
                {tc.statuses[k as 'offerte']} {euro(kpis.byStatus[k].sum, 0, lang)}
              </span>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-soft">{t.openPipeline}</div>
          <div className="mek-heading mt-1 text-2xl text-warning">{euro(kpis.openPipeline, 0, lang)}</div>
          <div className="text-xs text-soft">{t.openPipelineHint}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-soft">{t.winRatio}</div>
          <div className="mek-heading mt-1 text-2xl text-positive">{kpis.winRatio === null ? '–' : `${kpis.winRatio}%`}</div>
          <div className="text-xs text-soft">{t.winRatioHint}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <input
          type="search"
          className="field min-w-[15rem] max-w-sm flex-1"
          placeholder={t.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={tc.search}
        />
        <div className="flex gap-1" role="group" aria-label={tc.kans}>
          {['A', 'B', 'C'].map((k) => (
            <button
              key={k}
              onClick={() => toggleKans(k)}
              aria-pressed={filters.kans.includes(k)}
              className={cx('rounded-lg border px-3 py-1.5 text-sm font-bold', filters.kans.includes(k) ? 'border-accent bg-accent text-accent-ink' : 'border-line text-soft hover:text-ink')}
            >
              {k}
            </button>
          ))}
        </div>
        <button
          onClick={() => update({ familie: filters.familie ? null : '1' })}
          aria-pressed={filters.familie}
          className={cx('rounded-lg border px-3 py-1.5 text-sm', filters.familie ? 'border-warning bg-warning/20 text-warning' : 'border-line text-soft hover:text-ink')}
        >
          {t.family}
        </button>
        <select className="field w-auto" value={filters.plaats} onChange={(e) => update({ plaats: e.target.value || null })} aria-label={t.allPlaces}>
          <option value="">{t.allPlaces}</option>
          {kpis.plaatsen.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select className="field w-auto" value={filters.provincie} onChange={(e) => update({ provincie: e.target.value || null, plaats: null })} aria-label={t.allProvinces}>
          <option value="">{t.allProvinces}</option>
          {PROVINCES.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name}</option>
          ))}
          <option value="geen">{t.noProvince}</option>
        </select>
        {anyFilter ? (
          <Button variant="ghost" onClick={() => { setQ(''); update({ status: null, kans: null, familie: null, plaats: null, q: null }); }}>
            {tc.clearFilters}
          </Button>
        ) : null}
        <div className="flex-1" />
        {canEdit && (
          <>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onImport(f); }} />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={pending}>
              <Upload size={16} /> {t.importExcel}
            </Button>
          </>
        )}
        <details className="relative">
          <summary className="list-none">
            <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-card-2 px-3.5 py-2 text-sm font-semibold">
              <Download size={16} /> {t.export}
            </span>
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-line bg-card p-1 shadow-card">
            <a className="block rounded px-3 py-2 text-sm hover:bg-card-2" href={exportHref('xlsx')}>{t.exportXlsx}</a>
            <a className="block rounded px-3 py-2 text-sm hover:bg-card-2" href={exportHref('csv')}>{t.exportCsv}</a>
            <a className="block rounded px-3 py-2 text-sm hover:bg-card-2" href={exportHref('json')}>{t.exportJson}</a>
          </div>
        </details>
        {canEdit && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus size={16} /> {t.newLead}
          </Button>
        )}
      </Card>

      {banner && <Notice tone={banner.tone}>{banner.text}</Notice>}

      {/* Table */}
      {leads.length === 0 ? (
        anyFilter || filters.provincie ? (
          <Empty title={t.empty}>{t.emptyHint}</Empty>
        ) : (
          <Empty title={t.noLeads}>{t.noLeadsHint}</Empty>
        )
      ) : (
        <Card className="overflow-hidden">
          <div className="table-wrap">
            <table className="data min-w-[1000px]">
              <thead>
                <tr>
                  <SortTh col="kans">{t.cols.kans}</SortTh>
                  <SortTh col="bedrijf">{t.cols.bedrijf}</SortTh>
                  <SortTh col="status">{t.cols.status}</SortTh>
                  <th>{t.cols.contact}</th>
                  <SortTh col="volgende">{t.cols.volgende}</SortTh>
                  <SortTh col="waarde" className="text-right">{t.cols.waarde}</SortTh>
                  <SortTh col="datum">{t.cols.datum}</SortTh>
                  {canEdit && <th className="sr-only">{t.cols.edit}</th>}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} title={lead.waarom || undefined}>
                    <td>
                      <KansBadge kans={lead.kans} />
                      {lead.fit_score !== null && <div className="internal-only mt-1 text-center text-[10px] text-soft">{lead.fit_score}</div>}
                    </td>
                    <td className="max-w-72">
                      <Link href={`/leads/${lead.id}`} className="font-semibold hover:text-accent">{lead.bedrijf}</Link>
                      {(lead.familie === 'ja' || lead.familie === 'groot') && <Pill tone="warning" className="ml-2">{t.familyTag}</Pill>}
                      <div className="text-xs text-soft">{[lead.segment, [lead.postcode, lead.plaats].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</div>
                      {lead.status === 'verloren' && lead.reden && <div className="text-xs text-accent">{lead.reden}</div>}
                    </td>
                    <td>
                      <select
                        className="field w-auto min-w-[10.5rem] py-1 text-xs"
                        value={lead.status}
                        disabled={!canEdit || pending}
                        onChange={(e) => onStatus(lead, e.target.value)}
                        aria-label={t.cols.status}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.code} value={s.code}>{tc.statuses[s.code]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="text-xs">
                      {lead.contact && <div className="font-medium text-ink">{lead.contact}{lead.functie ? ` · ${lead.functie}` : ''}</div>}
                      <div className="mt-1 flex flex-wrap gap-2 text-soft">
                        {lead.tel && <a href={`tel:${lead.tel.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone size={12} />{lead.tel}</a>}
                        {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-ink"><Mail size={12} />{lead.email}</a>}
                        {lead.web && <ExtLink href={lead.web} className="inline-flex items-center gap-1"><Globe size={12} />{t.website}</ExtLink>}
                        {lead.maps && <ExtLink href={lead.maps} className="inline-flex items-center gap-1"><MapPin size={12} />{t.maps}</ExtLink>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.roles.map((role) => (
                          <ExtLink key={role} href={linkedinSearchUrl(lead.bedrijf, role)} className="rounded border border-line px-1.5 py-0.5 text-[11px] !text-soft hover:!text-ink">
                            <UserSearch size={10} className="mr-1 inline" />{role}
                          </ExtLink>
                        ))}
                        <ExtLink href={googleLinkedinUrl(lead.bedrijf)} className="rounded border border-line px-1.5 py-0.5 text-[11px] !text-soft hover:!text-ink">{t.googleLinkedin}</ExtLink>
                      </div>
                    </td>
                    <td className="text-xs">
                      {lead.volgende || '–'}
                      {lead.due_date && (
                        <div className={cx('mt-0.5', lead.due_date < today ? 'text-accent' : 'text-soft')}>
                          {lead.due_date < today ? t.overdue : t.due} {dateNl(lead.due_date)}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-semibold tabular-nums">{lead.waarde ? euro(lead.waarde, 0, lang) : '–'}</td>
                    <td className="whitespace-nowrap text-xs text-soft">{dateNl(lead.datum)}</td>
                    {canEdit && (
                      <td>
                        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setEditing(lead); setFormOpen(true); }}>
                          {tc.edit}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm text-soft">
            <span>{count} · {t.page(filters.page, pages)}</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={filters.page <= 1} onClick={() => update({ page: String(filters.page - 1) }, false)}>{t.prev}</Button>
              <Button variant="secondary" disabled={filters.page >= pages} onClick={() => update({ page: String(filters.page + 1) }, false)}>{t.next}</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Reason dialog for an inline change to "verloren" */}
      {lostFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <Card className="w-full max-w-md p-5">
            <h2 className="mek-heading mb-3 text-lg">{t.lostReasonPrompt}: {lostFor.bedrijf}</h2>
            <input autoFocus className="field" value={lostReason} placeholder={t.lostReasonPlaceholder} onChange={(e) => setLostReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmLost()} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setLostFor(null)}>{tc.cancel}</Button>
              <Button onClick={confirmLost}>{tc.save}</Button>
            </div>
          </Card>
        </div>
      )}

      <LeadForm
        open={formOpen}
        lead={editing}
        price={price}
        defaults={!editing && filters.status ? { status: filters.status } : undefined}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
