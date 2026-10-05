'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button, Card, Empty, KansBadge, Pill } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { radarMsg } from '@/i18n/messages/radar';
import { relativeNl } from '@/lib/format';

interface CompanyRow {
  id: string;
  name: string;
  kans: string | null;
  fit_score: number | null;
  rule_score: number;
  segment: string;
  city: string;
  province: string;
  reviews: number;
  state: string;
  last_seen: string;
}

export function CompaniesView({ companies, count, page, q, state }: { companies: CompanyRow[]; count: number; page: number; q: string; state: string }) {
  const t = useMessages(radarMsg);
  const tc = useMessages(common);
  const lang = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(q);
  const pages = Math.max(1, Math.ceil(count / 50));

  const go = (patch: Record<string, string>) => {
    const params = new URLSearchParams({ tab: 'companies', q, state, page: String(page), ...patch });
    for (const [k, v] of [...params.entries()]) if (!v) params.delete(k);
    router.replace(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    if (query === q) return;
    const id = setTimeout(() => go({ q: query, page: '1' }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <input type="search" className="field min-w-[15rem] max-w-sm flex-1" placeholder={t.companiesSearch} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tc.search} />
        <select className="field w-auto" value={state} onChange={(e) => go({ state: e.target.value, page: '1' })} aria-label={t.allStates}>
          <option value="">{t.allStates}</option>
          {Object.entries(t.stateLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <div className="flex-1" />
        <a href={`/api/export/companies?state=${state}&q=${encodeURIComponent(q)}`} className="inline-flex items-center gap-2 rounded-lg border border-line bg-card-2 px-3.5 py-2 text-sm font-semibold">
          <Download size={16} /> {t.exportCsv}
        </a>
      </Card>
      {companies.length === 0 ? (
        <Empty title={tc.none} />
      ) : (
        <Card className="overflow-hidden">
          <div className="table-wrap">
            <table className="data min-w-[800px]">
              <thead>
                <tr>
                  <th>{t.companyCols.kans}</th>
                  <th>{t.companyCols.name}</th>
                  <th>{t.companyCols.segment}</th>
                  <th>{t.companyCols.place}</th>
                  <th className="text-right">{t.companyCols.reviews}</th>
                  <th className="internal-only text-right">{t.companyCols.score}</th>
                  <th>{t.companyCols.state}</th>
                  <th>{t.companyCols.seen}</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td><KansBadge kans={c.kans} /></td>
                    <td><Link href={`/radar/companies/${c.id}`} className="font-semibold hover:text-accent">{c.name}</Link></td>
                    <td className="text-xs">{tc.segments[c.segment as keyof typeof tc.segments] ?? c.segment}</td>
                    <td className="text-xs">{c.city}{c.province ? ` · ${c.province}` : ''}</td>
                    <td className="text-right tabular-nums">{c.reviews}</td>
                    <td className="internal-only text-right tabular-nums">{c.fit_score ?? `(${c.rule_score})`}</td>
                    <td><Pill tone={c.state === 'lead' ? 'positive' : c.state === 'queued' ? 'info' : c.state === 'rejected' || c.state === 'excluded' ? 'accent' : 'soft'}>{t.stateLabels[c.state as keyof typeof t.stateLabels] ?? c.state}</Pill></td>
                    <td className="text-xs text-soft">{relativeNl(c.last_seen, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-sm text-soft">
            <span>{count}</span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })}>‹</Button>
              <span className="px-2 py-2">{page}/{pages}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => go({ page: String(page + 1) })}>›</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
