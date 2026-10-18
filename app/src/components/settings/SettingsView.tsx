'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button, Card, CardHeader, ExtLink, Notice, Pill } from '@/components/ui';
import { useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { radarMsg } from '@/i18n/messages/radar';
import { settingsMsg } from '@/i18n/messages/settings';
import type { SessionUser } from '@/lib/auth';
import { restoreLeadsJson } from '@/modules/leads/actions';
import { addDoNotContact, addUser, purgeNow, removeDoNotContact, saveSetting, setUserPassword, setUserRole, type SettingsKey } from '@/modules/settings/actions';
import type { AppSettings, WeightSettings } from '@/modules/settings/types';

type Msg = { tone: 'positive' | 'accent'; text: string } | null;

function NumberGrid<T extends Record<string, unknown>>({
  value,
  labels,
  onChange,
  disabled,
}: {
  value: T;
  labels: Record<string, string>;
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.keys(labels).map((key) => (
        <div key={key}>
          <label className="label" htmlFor={`s-${key}`}>{labels[key]}</label>
          <input
            id={`s-${key}`}
            className="field"
            type={typeof value[key] === 'number' ? 'number' : 'text'}
            step="any"
            disabled={disabled}
            value={String(value[key] ?? '')}
            onChange={(e) => onChange({ ...value, [key]: typeof value[key] === 'number' ? Number(e.target.value) : e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

export function SettingsView({
  settings,
  users,
  dnc,
  me,
  admin,
  writer,
  feedback,
  system,
}: {
  settings: AppSettings;
  users: { id: string; name: string; email: string; role: 'admin' | 'sales' | 'viewer' }[];
  dnc: { id: number; value: string }[];
  me: SessionUser;
  admin: boolean;
  writer: boolean;
  feedback: { approved: number; rejected: number; suggestion: WeightSettings | null };
  system: { demo: boolean; ai: boolean; aiLabel?: string | null; models: Record<string, string>; webhooks: Record<string, boolean>; kvk: boolean; urls: string[] };
}) {
  const t = useMessages(settingsMsg);
  const tc = useMessages(common);
  const tr = useMessages(radarMsg);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [messages, setMessages] = useState<Record<string, Msg>>({});
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'sales' as 'admin' | 'sales' | 'viewer', password: '' });
  const [dncValue, setDncValue] = useState('');
  const restoreInput = useRef<HTMLInputElement>(null);

  const say = (section: string, msg: Msg) => setMessages((m) => ({ ...m, [section]: msg }));
  const save = (section: string, keys: SettingsKey[]) =>
    startTransition(async () => {
      for (const key of keys) {
        const result = await saveSetting(key, draft[key]);
        if (!result.ok) return say(section, { tone: 'accent', text: result.error });
      }
      say(section, { tone: 'positive', text: t.saved });
      router.refresh();
    });

  const weightTotal = Object.values(draft.weights).reduce((s, v) => s + Number(v), 0);
  const SaveBar = ({ section, keys }: { section: string; keys: SettingsKey[] }) => (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
      {admin ? <Button onClick={() => save(section, keys)} disabled={pending}>{pending ? tc.saving : tc.save}</Button> : <span className="text-xs text-soft">{t.readOnly}</span>}
      {messages[section] && <span className={messages[section]!.tone === 'positive' ? 'text-sm text-positive' : 'text-sm text-accent'}>{messages[section]!.text}</span>}
    </div>
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={t.sections.product} />
        <div className="p-4">
          <NumberGrid value={draft.product as unknown as Record<string, unknown>} labels={t.product} disabled={!admin} onChange={(v) => setDraft({ ...draft, product: v as unknown as AppSettings['product'] })} />
        </div>
        <SaveBar section="product" keys={['product']} />
      </Card>

      <Card>
        <CardHeader title={t.sections.scoring} />
        <div className="grid gap-5 p-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="k-a">{t.kansA}</label>
                <input id="k-a" type="number" className="field" disabled={!admin} value={draft.kans.A} onChange={(e) => setDraft({ ...draft, kans: { ...draft.kans, A: Number(e.target.value) } })} />
              </div>
              <div>
                <label className="label" htmlFor="k-b">{t.kansB}</label>
                <input id="k-b" type="number" className="field" disabled={!admin} value={draft.kans.B} onChange={(e) => setDraft({ ...draft, kans: { ...draft.kans, B: Number(e.target.value) } })} />
              </div>
            </div>
            <p className="text-xs text-soft">{t.kansHint}</p>
            <div className="rounded-lg border border-line p-3">
              <h3 className="text-sm font-semibold">{t.feedback}</h3>
              {feedback.suggestion ? (
                <>
                  <p className="mt-1 text-xs text-soft">{t.feedbackBasis(feedback.approved, feedback.rejected)}</p>
                  <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    {(Object.keys(feedback.suggestion) as (keyof WeightSettings)[]).map((k) => (
                      <li key={k}>{tr.criteria[k]}: {draft.weights[k]} → <strong>{feedback.suggestion![k]}</strong></li>
                    ))}
                  </ul>
                  {admin && <Button variant="secondary" className="mt-2" onClick={() => setDraft({ ...draft, weights: feedback.suggestion! })}>{t.feedbackApply}</Button>}
                </>
              ) : (
                <p className="mt-1 text-xs text-soft">{t.feedbackNone(feedback.approved + feedback.rejected)}</p>
              )}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t.weights}</h3>
            <div className="space-y-2">
              {(Object.keys(draft.weights) as (keyof WeightSettings)[]).map((k) => (
                <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <label htmlFor={`w-${k}`} className="text-sm">{tr.criteria[k]}</label>
                  <div className="flex items-center gap-2">
                    <input id={`w-${k}`} type="range" min={0} max={50} disabled={!admin} value={draft.weights[k]} onChange={(e) => setDraft({ ...draft, weights: { ...draft.weights, [k]: Number(e.target.value) } })} />
                    <output className="w-8 text-right text-sm tabular-nums">{draft.weights[k]}</output>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-soft">{t.weightsTotal(weightTotal)}</p>
          </div>
        </div>
        <SaveBar section="scoring" keys={['kans', 'weights']} />
      </Card>

      <Card>
        <CardHeader title={t.sections.home} />
        <div className="space-y-4 p-4">
          <NumberGrid value={draft.home as unknown as Record<string, unknown>} labels={t.home} disabled={!admin} onChange={(v) => setDraft({ ...draft, home: { ...draft.home, ...(v as object) } })} />
          <NumberGrid value={draft.caps as unknown as Record<string, unknown>} labels={t.caps} disabled={!admin} onChange={(v) => setDraft({ ...draft, caps: v as unknown as AppSettings['caps'] })} />
          <NumberGrid value={draft.requalify as unknown as Record<string, unknown>} labels={t.requalify} disabled={!admin} onChange={(v) => setDraft({ ...draft, requalify: v as unknown as AppSettings['requalify'] })} />
        </div>
        <SaveBar section="home" keys={['home', 'caps', 'requalify']} />
      </Card>

      <Card>
        <CardHeader title={t.sections.users} />
        <div className="space-y-3 p-4">
          <p className="text-xs text-soft">{t.users.roleHelp}</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t.users.name}</th>
                  <th>{t.users.email}</th>
                  <th>{t.users.role}</th>
                  {admin && <th>{t.users.resetPassword}</th>}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name} {u.id === me.id && <Pill>{t.users.you}</Pill>}</td>
                    <td className="text-soft">{u.email}</td>
                    <td>
                      <select
                        className="field w-auto py-1"
                        value={u.role}
                        disabled={!admin || pending}
                        onChange={(e) =>
                          startTransition(async () => {
                            const r = await setUserRole(u.id, e.target.value as 'admin' | 'sales' | 'viewer');
                            say('users', r.ok ? { tone: 'positive', text: t.users.roleSaved } : { tone: 'accent', text: r.error });
                            router.refresh();
                          })
                        }
                        aria-label={t.users.role}
                      >
                        <option value="admin">{tc.roles.admin}</option>
                        <option value="sales">{tc.roles.sales}</option>
                        <option value="viewer">{tc.roles.viewer}</option>
                      </select>
                    </td>
                    {admin && (
                      <td>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-xs"
                          onClick={() => {
                            const pw = window.prompt(`${t.users.resetPassword}: ${u.email}`);
                            if (pw)
                              startTransition(async () => {
                                const r = await setUserPassword(u.id, pw);
                                say('users', r.ok ? { tone: 'positive', text: t.users.passwordSet } : { tone: 'accent', text: r.error });
                              });
                          }}
                        >
                          {t.users.resetPassword}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin && (
            <form
              className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_auto_1fr_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const r = await addUser(newUser);
                  say('users', r.ok ? { tone: 'positive', text: t.users.added(newUser.email) } : { tone: 'accent', text: r.error });
                  if (r.ok) setNewUser({ name: '', email: '', role: 'sales', password: '' });
                  router.refresh();
                });
              }}
            >
              <input className="field" placeholder={t.users.name} required minLength={2} value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} aria-label={t.users.name} />
              <input className="field" type="email" placeholder={t.users.email} required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} aria-label={t.users.email} />
              <select className="field" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'sales' })} aria-label={t.users.role}>
                <option value="sales">{tc.roles.sales}</option>
                <option value="viewer">{tc.roles.viewer}</option>
                <option value="admin">{tc.roles.admin}</option>
              </select>
              <input className="field" type="text" placeholder={t.users.password} required minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} aria-label={t.users.password} />
              <Button type="submit" disabled={pending}>{t.users.add}</Button>
            </form>
          )}
          {messages.users && <Notice tone={messages.users.tone}>{messages.users.text}</Notice>}
        </div>
      </Card>

      <Card>
        <CardHeader title={t.sections.system} />
        <dl className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div><dt className="label">{t.system.mode}</dt><dd><Pill tone={system.demo ? 'warning' : 'positive'}>{system.demo ? t.system.demo : t.system.n8n}</Pill></dd></div>
          <div><dt className="label">{t.system.ai}</dt><dd><Pill tone={system.ai ? 'positive' : 'warning'}>{system.ai ? `${t.system.aiOn} · ${system.aiLabel ?? ''}` : t.system.aiOff}</Pill></dd></div>
          <div>
            <dt className="label">{t.system.webhooks}</dt>
            <dd className="flex flex-wrap gap-1">{Object.entries(system.webhooks).map(([k, v]) => <Pill key={k} tone={v ? 'positive' : 'soft'}>{k}: {v ? t.system.on : t.system.off}</Pill>)}</dd>
          </div>
          <div><dt className="label">{t.system.kvk}</dt><dd><Pill tone={system.kvk ? 'positive' : 'soft'}>{system.kvk ? t.system.on : t.system.off}</Pill></dd></div>
          <div className="sm:col-span-2">
            <dt className="label">{t.system.models}</dt>
            <dd className="flex flex-wrap gap-1 font-mono text-xs">{Object.entries(system.models).map(([k, v]) => <Pill key={k}>{k}: {v}</Pill>)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="label">{t.system.urls}</dt>
            <dd className="flex flex-wrap gap-2">{system.urls.map((u) => <ExtLink key={u} href={u} className="font-mono">{u}</ExtLink>)}</dd>
            <p className="mt-1 text-xs text-soft">{t.system.urlsHint}</p>
          </div>
          <div><a className="text-xs text-info hover:underline" href="/api/health" target="_blank" rel="noopener noreferrer">{t.system.health}</a></div>
        </dl>
      </Card>

      {writer && (
        <Card>
          <CardHeader title={t.sections.data} />
          <div className="grid gap-5 p-4 lg:grid-cols-3">
            {admin && (
              <div>
                <h3 className="text-sm font-semibold">{t.data.restore}</h3>
                <p className="mb-2 text-xs text-soft">{t.data.restoreHint}</p>
                <input
                  ref={restoreInput}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const form = new FormData();
                    form.set('file', f);
                    startTransition(async () => {
                      const r = await restoreLeadsJson(form);
                      say('data', r.ok ? { tone: 'positive', text: t.data.restored(r.inserted, r.updated, r.errors) } : { tone: 'accent', text: r.error });
                    });
                  }}
                />
                <Button variant="secondary" onClick={() => restoreInput.current?.click()} disabled={pending}>JSON…</Button>
              </div>
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t.data.dnc}</h3>
              <div className="flex gap-2">
                <input className="field" placeholder={t.data.dncPlaceholder} value={dncValue} onChange={(e) => setDncValue(e.target.value)} aria-label={t.data.dnc} />
                <Button variant="secondary" disabled={pending || !dncValue.trim()} onClick={() => startTransition(async () => { const r = await addDoNotContact(dncValue); if (r.ok) setDncValue(''); else say('data', { tone: 'accent', text: r.error }); router.refresh(); })}>{t.data.dncAdd}</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {dnc.map((d) => (
                  <button key={d.id} onClick={() => startTransition(async () => { await removeDoNotContact(d.id); router.refresh(); })} title={tc.delete}>
                    <Pill>{d.value} ✕</Pill>
                  </button>
                ))}
              </div>
            </div>
            {admin && (
              <div>
                <h3 className="text-sm font-semibold">{t.data.purge}</h3>
                <p className="mb-2 text-xs text-soft">{t.data.purgeHint}</p>
                <Button variant="secondary" disabled={pending} onClick={() => startTransition(async () => { const r = await purgeNow(); say('data', r.ok ? { tone: 'positive', text: t.data.purged(r.raw, r.contacts) } : { tone: 'accent', text: r.error }); })}>{t.data.purge}</Button>
              </div>
            )}
          </div>
          {messages.data && <div className="px-4 pb-4"><Notice tone={messages.data.tone}>{messages.data.text}</Notice></div>}
        </Card>
      )}
    </div>
  );
}
