'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calculator, Save } from 'lucide-react';
import { Button, ButtonLink, Notice, cx } from '@/components/ui';
import { useMessages } from '@/i18n/client';
import { demo } from '@/i18n/messages/demo';
import { saveHall } from '@/modules/crossdock/actions';
import { DEFAULT_HALL, type Hall } from '@/modules/crossdock/hall';
import { Crossdock2D } from './crossdock2d/Crossdock2D';
import { ThreeStage } from './ThreeStage';
import type { ProductDims } from './three/dims';

export type DemoTab = '2d' | 'product' | 'race';

export interface DemoLead {
  id: string;
  bedrijf: string;
}

export function DemoClient({
  initialTab,
  product,
  shiftHours,
  lead,
  leadHall,
  leadMissing,
  leads,
  canWrite,
}: {
  initialTab: DemoTab;
  product: ProductDims;
  shiftHours: number;
  lead: DemoLead | null;
  leadHall: Hall | null;
  leadMissing: boolean;
  leads: DemoLead[];
  canWrite: boolean;
}) {
  const t = useMessages(demo);
  const router = useRouter();
  const baseId = useId();
  const [tab, setTab] = useState<DemoTab>(initialTab);
  const [hall, setHall] = useState<Hall>(leadHall ?? DEFAULT_HALL);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const query = (next: { tab?: DemoTab; lead?: string | null }) => {
    const p = new URLSearchParams();
    const leadId = next.lead === undefined ? lead?.id : next.lead;
    if (leadId) p.set('lead', leadId);
    p.set('tab', next.tab ?? tab);
    return `/demo?${p.toString()}`;
  };

  // Tab state lives in the URL (?tab=2d|product|race) so a salesperson can bookmark it.
  // history.replaceState keeps Next's router in sync without a server round trip.
  const selectTab = (next: DemoTab) => {
    setTab(next);
    window.history.replaceState(null, '', query({ tab: next }));
  };

  const onPickLead = (id: string) => router.push(query({ lead: id || null }));

  const onSave = () => {
    if (!lead) return;
    setMsg(null);
    startTransition(async () => {
      const res = await saveHall(lead.id, hall);
      setMsg(res.ok ? { ok: true, text: t.saved } : { ok: false, text: res.error ?? t.errInvalidHall });
    });
  };

  const tabs: { key: DemoTab; label: string }[] = [
    { key: '2d', label: t.tab2d },
    { key: 'product', label: t.tabProduct },
    { key: 'race', label: t.tabRace },
  ];

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].key;
    selectTab(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  };

  const hallTitle = lead && (leadHall || msg?.ok) ? (
    <span className="mek-skew">{t.hallOf(lead.bedrijf)}</span>
  ) : (
    <span className="mek-skew">{t.calcTitle}</span>
  );

  const actions =
    lead && canWrite ? (
      <Button variant="secondary" onClick={onSave} disabled={pending}>
        <Save size={16} aria-hidden />
        {pending ? t.saving : t.saveToLead}
      </Button>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label={t.tabsLabel} className="flex gap-1 rounded-xl border border-line bg-card p-1">
          {tabs.map((x, i) => (
            <button
              key={x.key}
              id={`${baseId}-tab-${x.key}`}
              type="button"
              role="tab"
              aria-selected={tab === x.key}
              aria-controls={`${baseId}-panel`}
              tabIndex={tab === x.key ? 0 : -1}
              onClick={() => selectTab(x.key)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cx(
                'rounded-lg px-3.5 py-2 text-sm font-semibold transition',
                tab === x.key ? 'bg-accent text-accent-ink' : 'text-soft hover:text-ink',
              )}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div className="min-w-[220px]">
            <label htmlFor={`${baseId}-lead`} className="label">
              {t.leadLabel}
            </label>
            <select id={`${baseId}-lead`} className="field" value={lead?.id ?? ''} onChange={(e) => onPickLead(e.target.value)}>
              <option value="">{t.leadNone}</option>
              {lead && !leads.some((l) => l.id === lead.id) && <option value={lead.id}>{lead.bedrijf}</option>}
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.bedrijf}
                </option>
              ))}
            </select>
          </div>
          {lead && (
            <ButtonLink variant="secondary" href={`/roi?lead=${encodeURIComponent(lead.id)}`}>
              <Calculator size={16} aria-hidden />
              {t.openRoi}
            </ButtonLink>
          )}
        </div>
      </div>

      {leadMissing && <Notice tone="warning">{t.leadNotFound}</Notice>}
      {lead && !leadHall && tab === '2d' && <Notice tone="info">{t.noHallYet(lead.bedrijf)}</Notice>}
      {msg && (
        <div role="status">
          <Notice tone={msg.ok ? 'positive' : 'warning'}>{msg.text}</Notice>
        </div>
      )}

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`}>
        {tab === '2d' && (
          <Crossdock2D hall={hall} onHallChange={setHall} shiftHours={shiftHours} mekName={product.name} hallTitle={hallTitle} actions={actions} />
        )}
        {tab !== '2d' && <ThreeStage key={tab} mode={tab} product={product} />}
      </div>
    </div>
  );
}
