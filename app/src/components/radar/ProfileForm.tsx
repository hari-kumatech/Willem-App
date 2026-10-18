'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Sparkles, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader, Notice, Pill, cx } from '@/components/ui';
import { useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { radarMsg } from '@/i18n/messages/radar';
import { PROVINCES, RADIUS_MAX_KM, RADIUS_OPTIONS, SEARCH_TERMS, SEGMENTS } from '@/lib/constants';
import { deleteProfile, saveProfile, suggestTerms } from '@/modules/radar/actions';
import type { Schedule, SearchFilters } from '@/modules/radar/filters';
import { radiusUsesTiles, tilesFor } from '@/modules/radar/tiles';

export interface ProfileFormValue {
  id?: string;
  name: string;
  filters: SearchFilters;
  schedule: Schedule;
  budget_run: number;
  budget_month: number;
  max_companies: number;
  active: boolean;
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-soft">{hint}</span>}
      </span>
    </label>
  );
}

export function ProfileForm({ initial, kvk, ai }: { initial: ProfileFormValue; kvk: boolean; ai: boolean }) {
  const t = useMessages(radarMsg);
  const tf = t.form;
  const tc = useMessages(common);
  const router = useRouter();
  const [v, setV] = useState<ProfileFormValue>(initial);
  const [custom, setCustom] = useState('');
  const [exclusion, setExclusion] = useState('');
  const [newsSite, setNewsSite] = useState('');
  const [suggestions, setSuggestions] = useState<{ term: string; why: string }[]>([]);
  const [message, setMessage] = useState<{ tone: 'positive' | 'accent'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const f = v.filters;
  const setF = (patch: Partial<SearchFilters>) => setV((prev) => ({ ...prev, filters: { ...prev.filters, ...patch } }));
  const setS = (patch: Partial<Schedule>) => setV((prev) => ({ ...prev, schedule: { ...prev.schedule, ...patch } }));
  const toggleIn = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const allTerms = useMemo(() => [...new Set([...SEARCH_TERMS, ...f.terms])], [f.terms]);
  const areas = f.areaMode === 'radius' ? (radiusUsesTiles(f) ? f.tilesPerRun : 1) : Math.min(f.tilesPerRun, tilesFor(f).length || 1);
  const searches = f.terms.length * areas;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveProfile(v);
      if (!result.ok) return setMessage({ tone: 'accent', text: result.error });
      setMessage({ tone: 'positive', text: tf.saved });
      router.push('/radar?tab=profiles');
      router.refresh();
    });
  };

  const remove = () => {
    if (!v.id) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      await deleteProfile(v.id!);
      router.push('/radar?tab=profiles');
      router.refresh();
    });
  };

  const suggest = () =>
    startTransition(async () => {
      const result = await suggestTerms(f.terms);
      if (!result.ok) return setMessage({ tone: 'accent', text: result.error });
      setSuggestions(result.terms);
    });

  const num = (key: 'budget_run' | 'budget_month' | 'max_companies', label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label className="label" htmlFor={`p-${key}`}>{label}</label>
      <input id={`p-${key}`} type="number" className="field" value={v[key]} onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card>
        <CardHeader title={tf.title} />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label" htmlFor="p-name">{tf.name}</label>
            <input id="p-name" className="field" required minLength={2} maxLength={100} placeholder={tf.namePh} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>

          <fieldset className="md:col-span-2">
            <legend className="label">{tf.area}</legend>
            <div className="flex flex-wrap gap-2">
              {(['radius', 'provinces', 'nl'] as const).map((mode) => (
                <button
                  type="button"
                  key={mode}
                  onClick={() => setF({ areaMode: mode })}
                  aria-pressed={f.areaMode === mode}
                  className={cx('rounded-lg border px-3 py-1.5 text-sm', f.areaMode === mode ? 'border-accent bg-accent text-accent-ink' : 'border-line text-soft')}
                >
                  {tf.areaModes[mode]}
                </button>
              ))}
            </div>
          </fieldset>

          {f.areaMode === 'radius' && (
            <>
              <div>
                <label className="label" htmlFor="p-pc">{tf.postcode}</label>
                <input id="p-pc" className="field" pattern="^\d{4}\s?[a-zA-Z]{0,2}$" value={f.postcode} onChange={(e) => setF({ postcode: e.target.value })} />
              </div>
              <div>
                <span className="label">{tf.radius}</span>
                <div className="flex flex-wrap gap-1">
                  {RADIUS_OPTIONS.map((r) => (
                    <button type="button" key={r} onClick={() => setF({ radiusKm: r })} aria-pressed={f.radiusKm === r} className={cx('rounded-lg border px-3 py-1.5 text-sm', f.radiusKm === r ? 'border-accent bg-accent text-accent-ink' : 'border-line text-soft')}>
                      {r} km
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-soft" htmlFor="p-radius-custom">
                  {tf.radiusCustom}
                  <input
                    id="p-radius-custom"
                    type="number"
                    min={1}
                    max={RADIUS_MAX_KM}
                    className="field w-24 py-1"
                    value={f.radiusKm}
                    onChange={(e) => setF({ radiusKm: Math.max(1, Math.min(RADIUS_MAX_KM, Math.round(Number(e.target.value) || 1))) })}
                  />
                </label>
              </div>
            </>
          )}

          {f.areaMode === 'provinces' && (
            <fieldset className="md:col-span-2">
              <legend className="label">{tf.provinces}</legend>
              <div className="flex flex-wrap gap-1.5">
                {PROVINCES.map((p) => (
                  <button type="button" key={p.slug} onClick={() => setF({ provinces: toggleIn(f.provinces, p.name) })} aria-pressed={f.provinces.includes(p.name)} className={cx('rounded-lg border px-3 py-1 text-sm', f.provinces.includes(p.name) ? 'border-accent bg-accent text-accent-ink' : 'border-line text-soft')}>
                    {p.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {(f.areaMode !== 'radius' || radiusUsesTiles(f)) && (
            <div className="md:col-span-2">
              <label className="label" htmlFor="p-tiles">
                {tf.tilesPerRun}: {f.tilesPerRun}
                {f.areaMode !== 'radius' ? ` (${tilesFor(f).length} tiles)` : ''}
              </label>
              <input id="p-tiles" type="range" min={1} max={40} value={f.tilesPerRun} onChange={(e) => setF({ tilesPerRun: Number(e.target.value) })} className="w-full" />
              <p className="text-xs text-soft">{f.areaMode === 'radius' ? tf.radiusTilesHint : tf.tilesHint}</p>
            </div>
          )}

          <fieldset className="md:col-span-2">
            <legend className="label">{tf.terms}</legend>
            <div className="flex flex-wrap gap-1.5">
              {allTerms.map((term) => (
                <button type="button" key={term} onClick={() => setF({ terms: toggleIn(f.terms, term) })} aria-pressed={f.terms.includes(term)} className={cx('rounded-full border px-3 py-1 text-sm', f.terms.includes(term) ? 'border-accent bg-accent/15 text-ink' : 'border-line text-soft')}>
                  {term}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <input className="field max-w-xs" placeholder={tf.customTerm} value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (custom.trim().length > 1) { setF({ terms: [...new Set([...f.terms, custom.trim().toLowerCase()])] }); setCustom(''); } } }} />
              <Button type="button" variant="secondary" onClick={() => { if (custom.trim().length > 1) { setF({ terms: [...new Set([...f.terms, custom.trim().toLowerCase()])] }); setCustom(''); } }}>{tf.add}</Button>
              {ai && (
                <Button type="button" variant="ghost" onClick={suggest} disabled={pending}>
                  <Sparkles size={14} /> {tf.suggest}
                </Button>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button type="button" key={s.term} title={s.why} onClick={() => { setF({ terms: [...new Set([...f.terms, s.term.toLowerCase()])] }); setSuggestions(suggestions.filter((x) => x !== s)); }}>
                    <Pill tone="info">+ {s.term}</Pill>
                  </button>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="md:col-span-2">
            <legend className="label">{tf.segments}</legend>
            <div className="flex flex-wrap gap-1.5">
              {SEGMENTS.map((s) => (
                <button type="button" key={s} onClick={() => setF({ segments: toggleIn(f.segments, s) })} aria-pressed={f.segments.includes(s)} className={cx('rounded-lg border px-3 py-1 text-sm', f.segments.includes(s) ? 'border-accent bg-accent/15 text-ink' : 'border-line text-soft')}>
                  {tc.segments[s]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="md:col-span-2">
            <legend className="label">{tf.exclusions}</legend>
            <div className="flex flex-wrap gap-1.5">
              {f.exclusions.map((x) => (
                <button type="button" key={x} onClick={() => setF({ exclusions: f.exclusions.filter((e) => e !== x) })} title={tc.delete}>
                  <Pill>{x} ✕</Pill>
                </button>
              ))}
              <input className="field w-48 py-1" value={exclusion} onChange={(e) => setExclusion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (exclusion.trim().length > 1) { setF({ exclusions: [...new Set([...f.exclusions, exclusion.trim().toLowerCase()])] }); setExclusion(''); } } }} placeholder="+" aria-label={tf.exclusions} />
            </div>
          </fieldset>

          <div>
            <label className="label" htmlFor="p-minrev">{tf.minReviews}</label>
            <input id="p-minrev" type="number" min={0} className="field" value={f.minReviews} onChange={(e) => setF({ minReviews: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label" htmlFor="p-per">{tf.perSearch}</label>
            <input id="p-per" type="number" min={5} max={200} className="field" value={f.perSearch} onChange={(e) => setF({ perSearch: Number(e.target.value) })} />
          </div>
          <fieldset className="md:col-span-2">
            <legend className="label">{tf.depth}</legend>
            <div className="flex flex-wrap gap-2">
              {(['standard', 'deep'] as const).map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setF({ depth: d, ...(d === 'deep' && f.perSearch < 40 ? { perSearch: 60 } : {}) })}
                  aria-pressed={f.depth === d}
                  className={cx('rounded-lg border px-3 py-1.5 text-sm', f.depth === d ? 'border-accent bg-accent text-accent-ink' : 'border-line text-soft')}
                >
                  {d === 'deep' ? tf.depthDeep : tf.depthStandard}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-soft">{tf.depthHint}</p>
          </fieldset>
          <fieldset className="md:col-span-2 space-y-3 rounded-lg border border-line p-3">
            <legend className="label px-1">{tf.sources}</legend>
            <p className="text-xs text-soft">{tf.sourcesHint}</p>
            <div className="flex flex-wrap gap-6">
              <Toggle checked={f.webLinkedin} onChange={(x) => setF({ webLinkedin: x })} label={tf.webLinkedin} />
              <Toggle checked={f.webNews} onChange={(x) => setF({ webNews: x })} label={tf.webNews} />
            </div>
            {f.webNews && (
              <div>
                <span className="label">{tf.newsSites}</span>
                <div className="flex flex-wrap gap-1.5">
                  {f.newsSites.map((site) => (
                    <button type="button" key={site} onClick={() => setF({ newsSites: f.newsSites.filter((x) => x !== site) })} title={tc.delete}>
                      <Pill>{site} ✕</Pill>
                    </button>
                  ))}
                  <input
                    className="field w-48 py-1"
                    value={newsSite}
                    onChange={(e) => setNewsSite(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const site = newsSite.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
                      if (site.includes('.')) {
                        setF({ newsSites: [...new Set([...f.newsSites, site])] });
                        setNewsSite('');
                      }
                    }}
                    placeholder="+ nieuwssite.nl"
                    aria-label={tf.newsSites}
                  />
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="label" htmlFor="p-webpages">{tf.webPages}</label>
                <input id="p-webpages" type="number" min={1} max={5} className="field" value={f.webPages} onChange={(e) => setF({ webPages: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="p-webleads">{tf.maxWebLeads}</label>
                <input id="p-webleads" type="number" min={0} max={300} className="field" value={f.maxWebLeads} onChange={(e) => setF({ maxWebLeads: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label" htmlFor="p-runmin">{tf.runMinutes}</label>
                <input id="p-runmin" type="number" min={5} max={80} className="field" value={f.runMinutes} onChange={(e) => setF({ runMinutes: Number(e.target.value) })} />
              </div>
            </div>
            <p className="text-xs text-soft">{tf.runMinutesHint}</p>
          </fieldset>
          <div>
            <label className="label" htmlFor="p-fam">{tf.familie}</label>
            <select id="p-fam" className="field" value={f.familie} onChange={(e) => setF({ familie: e.target.value as SearchFilters['familie'] })}>
              <option value="any">{tf.familieAny}</option>
              <option value="ja">{tc.familie.ja}</option>
              <option value="groot">{tc.familie.groot}</option>
              <option value="nee">{tc.familie.nee}</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="p-kans">{tf.minKans}</label>
            <select id="p-kans" className="field" value={f.minKans} onChange={(e) => setF({ minKans: e.target.value as 'A' | 'B' | 'C' })}>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
          <div className="space-y-2">
            <Toggle checked={f.openOnly} onChange={(x) => setF({ openOnly: x })} label={tf.openOnly} />
            <Toggle checked={f.mustHaveWebsite} onChange={(x) => setF({ mustHaveWebsite: x })} label={tf.mustWebsite} />
            <Toggle checked={f.mustHavePhone} onChange={(x) => setF({ mustHavePhone: x })} label={tf.mustPhone} />
            <Toggle checked={f.enrich} onChange={(x) => setF({ enrich: x })} label={tf.enrich} hint={tf.enrichHint} />
          </div>
          <div className="space-y-2">
            <Toggle checked={f.skipInPipeline} onChange={(x) => setF({ skipInPipeline: x })} label={tf.skipPipeline} />
            <Toggle checked={f.skipRejected} onChange={(x) => setF({ skipRejected: x })} label={tf.skipRejected} />
            <div>
              <label className="label" htmlFor="p-seen">{tf.skipSeenDays}</label>
              <input id="p-seen" type="number" min={0} max={365} className="field w-28" value={f.skipSeenDays} onChange={(e) => setF({ skipSeenDays: Number(e.target.value) })} />
            </div>
          </div>
          {kvk && (
            <div className="md:col-span-2">
              <label className="label" htmlFor="p-sbi">{tf.sbi}</label>
              <input id="p-sbi" className="field" placeholder="52.10, 52.29, 49.41" value={f.sbiCodes.join(', ')} onChange={(e) => setF({ sbiCodes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`${tf.schedule} & budget`} />
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="p-sched">{tf.schedule}</label>
            <select id="p-sched" className="field" value={v.schedule.mode} onChange={(e) => setS({ mode: e.target.value as Schedule['mode'] })}>
              {(['off', 'daily', 'weekly', 'hours'] as const).map((m) => (
                <option key={m} value={m}>{tf.scheduleModes[m]}</option>
              ))}
            </select>
          </div>
          {(v.schedule.mode === 'daily' || v.schedule.mode === 'weekly') && (
            <div>
              <label className="label" htmlFor="p-hour">{tf.hour}</label>
              <select id="p-hour" className="field" value={v.schedule.hour} onChange={(e) => setS({ hour: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
          )}
          {v.schedule.mode === 'weekly' && (
            <div>
              <label className="label" htmlFor="p-day">{tf.weekday}</label>
              <select id="p-day" className="field" value={v.schedule.weekday} onChange={(e) => setS({ weekday: Number(e.target.value) })}>
                {tf.weekdays.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}
          {v.schedule.mode === 'hours' && (
            <>
              <div>
                <label className="label" htmlFor="p-every">{tf.everyHours}</label>
                <input id="p-every" type="number" min={1} max={168} className="field" value={v.schedule.everyHours} onChange={(e) => setS({ everyHours: Number(e.target.value) })} />
              </div>
              <div>
                <span className="label">{tf.window}</span>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={23} className="field w-20" value={v.schedule.windowStart ?? ''} onChange={(e) => setS({ windowStart: e.target.value === '' ? null : Number(e.target.value) })} aria-label={`${tf.window} start`} />
                  –
                  <input type="number" min={0} max={24} className="field w-20" value={v.schedule.windowEnd ?? ''} onChange={(e) => setS({ windowEnd: e.target.value === '' ? null : Number(e.target.value) })} aria-label={`${tf.window} end`} />
                </div>
              </div>
            </>
          )}
          <div className="md:col-span-3 grid gap-4 md:grid-cols-3">
            {num('budget_run', tf.budgetRun, { min: 0.1, max: 100, step: 0.1 })}
            {num('budget_month', tf.budgetMonth, { min: 0.5, max: 2000, step: 0.5 })}
            {num('max_companies', tf.maxCompanies, { min: 1, max: 2000 })}
          </div>
          <p className="text-xs text-soft md:col-span-3">{tf.estimate(searches, Math.min(v.max_companies, searches * f.perSearch))}</p>
          <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label={tf.active} />
        </div>
      </Card>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? tc.saving : tf.save}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>{tc.cancel}</Button>
        <div className="flex-1" />
        {v.id && (
          <Button type="button" variant="danger" onClick={remove} disabled={pending}>
            <Trash2 size={14} /> {confirmDelete ? tc.deleteConfirm : tf.delete}
          </Button>
        )}
      </div>
    </form>
  );
}
