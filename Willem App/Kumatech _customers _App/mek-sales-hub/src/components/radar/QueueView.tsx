'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, Clock, Globe, MapPin, Phone, RefreshCw, X } from 'lucide-react';
import { Button, Card, Empty, ExtLink, KansBadge, Notice, Pill, cx } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { radarMsg } from '@/i18n/messages/radar';
import { num } from '@/lib/format';
import { approveAllA, approveCompany, rejectCompany, requalifyCompany, snoozeCompany } from '@/modules/radar/actions';
import { Assessment, ContactList, type CompanyAssessmentData, type ContactData, type SignalData } from './Assessment';

type QueueCompany = CompanyAssessmentData & {
  segment: string;
  address: string;
  postcode: string;
  city: string;
  province: string;
  phone: string;
  website: string;
  maps_url: string;
  reviews: number;
  rating: number | null;
  distance_km: number | null;
  categories: string[];
  source: string;
};

interface QueueItem {
  id: string;
  company: unknown;
  signals: SignalData[];
  contacts: ContactData[];
}

export function QueueView({ items, kans, canEdit }: { items: QueueItem[]; kans: string[]; canEdit: boolean }) {
  const t = useMessages(radarMsg);
  const tc = useMessages(common);
  const lang = useLang();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'positive' | 'accent' | 'info'; text: string } | null>(null);

  const act = (id: string, fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, success: (r: Record<string, unknown>) => string) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await fn();
      setBusyId(null);
      setMessage(result.ok ? { tone: 'positive', text: success(result) } : { tone: 'accent', text: result.error ?? tc.genericError });
      router.refresh();
    });
  };

  const toggleKans = (k: string) => {
    const set = new Set(kans);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    const value = [...set].sort().join(',');
    router.replace(`${pathname}?tab=queue${value ? `&kans=${value}` : ''}`);
  };

  const countA = items.filter((i) => (i.company as QueueCompany).kans === 'A').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-soft">{t.filterKans}:</span>
        {['A', 'B', 'C'].map((k) => (
          <button
            key={k}
            onClick={() => toggleKans(k)}
            aria-pressed={kans.includes(k)}
            className={cx('rounded-lg border px-3 py-1 text-sm font-bold', kans.includes(k) ? 'border-accent bg-accent text-accent-ink' : 'border-line text-soft')}
          >
            {k}
          </button>
        ))}
        <span className="text-sm text-soft">{t.newCount(items.length)}</span>
        <div className="flex-1" />
        {canEdit && countA > 0 && (
          <Button variant="secondary" disabled={pending} onClick={() => act('all', approveAllA, (r) => `${r.count} ✓`)}>
            <Check size={16} /> {t.bulkApproveA} ({countA})
          </Button>
        )}
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {items.length === 0 ? (
        <Empty title={t.queueEmpty}>{t.queueEmptyHint}</Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => {
            const c = item.company as QueueCompany;
            const busy = busyId === c.id && pending;
            return (
              <Card key={item.id} className={cx('flex flex-col', busy && 'opacity-60')}>
                <div className="flex items-start gap-3 border-b border-line p-4">
                  <KansBadge kans={c.kans} className="h-10 w-10 text-lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight">{c.name}</h2>
                    <p className="text-xs text-soft">
                      {tc.segments[c.segment as keyof typeof tc.segments] ?? c.segment} · {[c.postcode, c.city].filter(Boolean).join(' ')}
                      {c.province ? ` · ${c.province}` : ''}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Pill>{t.reviews(c.reviews)}{c.rating ? ` · ${num(Number(c.rating), 1, lang)}★` : ''}</Pill>
                      {c.distance_km !== null && <Pill>{t.km(num(Number(c.distance_km), 1, lang))}</Pill>}
                      {c.source === 'demo' || c.website?.endsWith('.example/') ? <Pill tone="warning">demo</Pill> : null}
                      {c.source === 'linkedin' ? <Pill tone="info">LinkedIn</Pill> : c.source === 'news' ? <Pill tone="info">Nieuws</Pill> : null}
                      {(c.categories ?? []).slice(0, 2).map((cat) => (
                        <Pill key={cat}>{cat}</Pill>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {c.website && <ExtLink href={c.website} className="inline-flex items-center gap-1"><Globe size={12} />{c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</ExtLink>}
                      {c.phone && <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-soft hover:text-ink"><Phone size={12} />{c.phone}</a>}
                      {c.maps_url && <ExtLink href={c.maps_url} className="inline-flex items-center gap-1"><MapPin size={12} />Maps</ExtLink>}
                    </div>
                  </div>
                </div>
                <div className="grid flex-1 gap-4 p-4 md:grid-cols-[1.3fr_1fr]">
                  <Assessment company={c} signals={item.signals} />
                  <ContactList contacts={item.contacts} companyName={c.name} />
                </div>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
                    {rejecting === c.id ? (
                      <>
                        <span className="text-sm text-soft">{t.rejectReason}:</span>
                        {t.rejectReasons.map((reason) => (
                          <Button key={reason} variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setRejecting(null); act(c.id, () => rejectCompany(c.id, reason), () => t.rejected); }}>
                            {reason}
                          </Button>
                        ))}
                        <Button variant="ghost" onClick={() => setRejecting(null)}>{tc.cancel}</Button>
                      </>
                    ) : (
                      <>
                        <Button disabled={busy} onClick={() => act(c.id, () => approveCompany(c.id), () => t.approved(c.name))}>
                          <Check size={16} /> {t.approve}
                        </Button>
                        <Button variant="danger" disabled={busy} onClick={() => setRejecting(c.id)}>
                          <X size={16} /> {t.reject}
                        </Button>
                        <Button variant="ghost" disabled={busy} onClick={() => act(c.id, () => snoozeCompany(c.id, 30), () => t.snoozed)}>
                          <Clock size={16} /> {t.snooze} ({t.snoozeDays(30)})
                        </Button>
                        <div className="flex-1" />
                        <Button variant="ghost" disabled={busy} onClick={() => act(c.id, () => requalifyCompany(c.id), () => t.requalified)} title={t.requalify}>
                          <RefreshCw size={14} />
                        </Button>
                        <Link href={`/radar/companies/${c.id}`} className="text-xs text-soft hover:text-ink">→</Link>
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
