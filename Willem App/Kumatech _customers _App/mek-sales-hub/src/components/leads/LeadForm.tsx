'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Notice } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { leadsMsg } from '@/i18n/messages/leads';
import { euro, todayIso } from '@/lib/format';
import { SEGMENTS, STATUSES } from '@/lib/constants';
import { deleteLead, saveLead, type LeadInput } from '@/modules/leads/actions';
import type { Lead } from '@/modules/leads/types';

type FormState = Record<keyof LeadInput, string>;

function toForm(lead: Partial<Lead> | null, defaults: Partial<FormState>): FormState {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    bedrijf: s(lead?.bedrijf),
    kans: s(lead?.kans ?? (lead ? '' : 'B')),
    segment: s(lead?.segment),
    familie: s(lead?.familie),
    adres: s(lead?.adres),
    postcode: s(lead?.postcode),
    plaats: s(lead?.plaats),
    contact: s(lead?.contact),
    functie: s(lead?.functie),
    tel: s(lead?.tel),
    email: s(lead?.email),
    web: s(lead?.web),
    maps: s(lead?.maps),
    status: s(lead?.status ?? 'prospect'),
    datum: s(lead?.datum ?? (lead ? '' : todayIso())),
    volgende: s(lead?.volgende),
    due_date: s(lead?.due_date),
    aantal: s(lead?.aantal ?? 0),
    waarde: s(lead?.waarde ?? 0),
    reden: s(lead?.reden),
    waarom: s(lead?.waarom),
    aanpak: s(lead?.aanpak),
    notitie: s(lead?.notitie),
    ...defaults,
  };
}

export function LeadForm({
  open,
  lead,
  defaults,
  price,
  onClose,
}: {
  open: boolean;
  lead: Lead | null;
  defaults?: Partial<FormState>;
  price: number;
  onClose: () => void;
}) {
  const t = useMessages(leadsMsg);
  const tc = useMessages(common);
  const lang = useLang();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>(() => toForm(lead, defaults ?? {}));
  const [initial, setInitial] = useState<FormState>(form);
  const [waardeTouched, setWaardeTouched] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const next = toForm(lead, defaults ?? {});
    setForm(next);
    setInitial(next);
    setWaardeTouched(Boolean(lead && Number(lead.waarde) > 0 && Number(lead.waarde) !== Number(lead.aantal) * price));
    setError('');
    setNotice('');
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, open]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  const set = (key: keyof FormState, value: string) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Offertewaarde auto-fills as aantal × price until the user types an amount (A.1)
      if (key === 'aantal' && !waardeTouched) next.waarde = String((Number(value) || 0) * price);
      return next;
    });
    if (key === 'waarde') setWaardeTouched(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.bedrijf.trim()) return setError(t.errors.bedrijf);
    if (form.status === 'verloren' && !form.reden.trim()) return setError(t.errors.reden);
    const fields: Partial<LeadInput> = {};
    for (const key of Object.keys(form) as (keyof FormState)[]) {
      if (!lead || form[key] !== initial[key]) (fields as Record<string, string>)[key] = form[key];
    }
    if (lead && Object.keys(fields).length === 0) return onClose();
    startTransition(async () => {
      const result = await saveLead({ id: lead?.id, version: lead?.version, fields });
      if (!result.ok) return setError(result.error);
      if (result.previousProvincie && result.provincie) {
        setNotice(t.provinceMoved(result.previousProvincie, result.provincie));
        setTimeout(onClose, 1800);
      } else onClose();
      router.refresh();
    });
  };

  const remove = () => {
    if (!lead) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const result = await deleteLead(lead.id);
      if (!result.ok) return setError(result.error);
      onClose();
      router.push('/leads');
      router.refresh();
    });
  };

  const field = (key: keyof FormState, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`f-${key}`}>{label}</label>
      <input id={`f-${key}`} className="field" value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(760px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-line bg-card p-0 text-ink shadow-card"
    >
      <form onSubmit={submit}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-5 py-3">
          <h2 className="mek-heading text-lg">{lead ? t.formEdit(lead.bedrijf) : t.formNew}</h2>
          <button type="button" onClick={onClose} className="text-soft hover:text-ink" aria-label={tc.close}>✕</button>
        </div>
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field('bedrijf', `${t.f.bedrijf} *`, { required: true, maxLength: 200 })}</div>
          <div>
            <label className="label" htmlFor="f-kans">{t.f.kans}</label>
            <select id="f-kans" className="field" value={form.kans} onChange={(e) => set('kans', e.target.value)}>
              <option value="">–</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-segment">{t.f.segment}</label>
            <input id="f-segment" className="field" list="segments" value={form.segment} onChange={(e) => set('segment', e.target.value)} />
            <datalist id="segments">
              {SEGMENTS.map((s) => (
                <option key={s} value={s}>{tc.segments[s]}</option>
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="f-familie">{t.f.familie}</label>
            <select id="f-familie" className="field" value={form.familie} onChange={(e) => set('familie', e.target.value)}>
              <option value="">–</option>
              <option value="ja">{tc.familie.ja}</option>
              <option value="groot">{tc.familie.groot}</option>
              <option value="nee">{tc.familie.nee}</option>
            </select>
          </div>
          {field('adres', t.f.adres)}
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            {field('postcode', t.f.postcode, { placeholder: '5705 AB' })}
            {field('plaats', t.f.plaats)}
          </div>
          <p className="self-end pb-2 text-xs text-soft">{t.f.provincie}: {lead?.provincie || '–'} · {t.f.provincieAuto}</p>
          {field('contact', t.f.contact)}
          {field('functie', t.f.functie)}
          {field('tel', t.f.tel, { type: 'tel' })}
          {field('email', t.f.email, { type: 'email' })}
          {field('web', t.f.web, { placeholder: 'https://' })}
          {field('maps', t.f.maps, { placeholder: 'https://maps.google.com/…' })}
          <div>
            <label className="label" htmlFor="f-status">{t.f.status}</label>
            <select id="f-status" className="field" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.code} value={s.code}>{tc.statuses[s.code]}</option>
              ))}
            </select>
          </div>
          {field('datum', t.f.datum, { type: 'date' })}
          {field('volgende', t.f.volgende)}
          {field('due_date', t.f.dueDate, { type: 'date' })}
          {field('aantal', t.f.aantal, { type: 'number', min: 0, max: 500 })}
          <div>
            {field('waarde', t.f.waarde, { type: 'number', min: 0, step: 100 })}
            {!waardeTouched && <p className="mt-1 text-xs text-soft">{t.f.waardeAuto(euro(price, 0, lang))}</p>}
          </div>
          {form.status === 'verloren' && <div className="sm:col-span-2">{field('reden', `${t.f.reden} *`)}</div>}
          {(['waarom', 'aanpak', 'notitie'] as const).map((key) => (
            <div key={key} className="sm:col-span-2">
              <label className="label" htmlFor={`f-${key}`}>{t.f[key]}</label>
              <textarea id={`f-${key}`} className="field min-h-20" value={form[key]} onChange={(e) => set(key, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-card px-5 py-3">
          {error && <p className="w-full text-sm text-accent" role="alert">{error}</p>}
          {notice && <div className="w-full"><Notice tone="warning">{notice}</Notice></div>}
          {lead && (
            <Button type="button" variant="danger" onClick={remove} disabled={pending}>
              {confirmDelete ? tc.deleteConfirm : tc.delete}
            </Button>
          )}
          <div className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>{tc.cancel}</Button>
          <Button type="submit" disabled={pending}>{pending ? tc.saving : tc.save}</Button>
        </div>
      </form>
    </dialog>
  );
}
