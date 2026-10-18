'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Calculator, Copy, Globe, Mail, MapPin, Monitor, Pencil, Phone, RefreshCw, Send, Sparkles } from 'lucide-react';
import { Button, ButtonLink, Card, CardHeader, ExtLink, KansBadge, Notice, Pill, cx } from '@/components/ui';
import { Assessment, ContactList, type CompanyAssessmentData, type ContactData, type SignalData } from '@/components/radar/Assessment';
import { useLang, useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { leadsMsg } from '@/i18n/messages/leads';
import { outreachMsg } from '@/i18n/messages/outreach';
import { dateNl, dateTimeNl, euro } from '@/lib/format';
import { addActivity } from '@/modules/leads/actions';
import { requalifyCompany } from '@/modules/radar/actions';
import { draftOutreach, saveOutreach } from '@/modules/outreach/actions';
import type { Lead } from '@/modules/leads/types';
import { LeadForm } from './LeadForm';

interface Activity {
  id: number;
  type: string;
  text: string;
  created_at: string;
  user: string;
}

interface Draft {
  id: string;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  mode: string;
  created_at: string;
}

export function LeadDetail({
  lead,
  company,
  signals,
  contacts,
  activities,
  quotes,
  drafts,
  canEdit,
  canSend,
  price,
}: {
  lead: Lead;
  company: (CompanyAssessmentData & { reviews: number; rating: number | null; segment: string; distance_km: number | null }) | null;
  signals: SignalData[];
  contacts: ContactData[];
  activities: Activity[];
  quotes: { id: string; number: string; model: string; trucks: number; total_excl: number; created_at: string }[];
  drafts: Draft[];
  canEdit: boolean;
  canSend: boolean;
  price: number;
}) {
  const t = useMessages(leadsMsg);
  const tc = useMessages(common);
  const to = useMessages(outreachMsg);
  const lang = useLang();
  // Texts copied from the assessment (not edited since) follow the UI language; text typed by a user stays as typed
  const english = lang === 'en' ? company?.texts_en ?? null : null;
  const leadWaarom = english?.waarom && lead.waarom === company?.waarom ? english.waarom : lead.waarom;
  const leadAanpak = english?.aanpak && lead.aanpak === company?.aanpak ? english.aanpak : lead.aanpak;
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [activityType, setActivityType] = useState<'note' | 'call' | 'mail' | 'meeting'>('note');
  const [activityText, setActivityText] = useState('');
  const [message, setMessage] = useState<{ tone: 'positive' | 'accent'; text: string } | null>(null);
  const latest = drafts[0];
  const [draft, setDraft] = useState<Draft | null>(latest ?? null);
  const [copied, setCopied] = useState(false);

  const describeActivity = (a: Activity) => {
    if (a.type === 'status') {
      const [codes, reason] = a.text.split('|');
      const [from, toCode] = codes.split('>');
      const label = (c: string) => tc.statuses[c as keyof typeof tc.statuses] ?? c;
      return `${label(from)} → ${label(toCode)}${reason ? ` (${reason})` : ''}`;
    }
    if (a.type === 'agent') {
      const [kans, score] = a.text.split('|');
      return `${tc.kans} ${kans || '–'} · ${score || '–'}/100`;
    }
    return a.text;
  };

  const submitActivity = () => {
    if (!activityText.trim()) return;
    startTransition(async () => {
      const result = await addActivity({ leadId: lead.id, type: activityType, text: activityText });
      if (result.ok) setActivityText('');
      else setMessage({ tone: 'accent', text: result.error });
      router.refresh();
    });
  };

  const makeDraft = () =>
    startTransition(async () => {
      const result = await draftOutreach(lead.id);
      if (!result.ok) return setMessage({ tone: 'accent', text: result.error });
      setDraft({ id: result.id, to_email: result.to, subject: result.subject, body: result.body, status: 'draft', mode: result.mode, created_at: new Date().toISOString() });
      router.refresh();
    });

  const send = (sendIt: boolean) => {
    if (!draft) return;
    if (!draft.to_email) return setMessage({ tone: 'accent', text: to.noEmail });
    startTransition(async () => {
      const result = await saveOutreach({ id: draft.id, to: draft.to_email, subject: draft.subject, body: draft.body, send: sendIt });
      if (!result.ok) return setMessage({ tone: 'accent', text: result.error });
      setMessage({ tone: 'positive', text: sendIt ? to.queued : tc.savedOk });
      setDraft({ ...draft, status: result.status });
      router.refresh();
    });
  };

  const requalify = () =>
    startTransition(async () => {
      if (!company) return;
      const result = await requalifyCompany(company.id);
      setMessage(result.ok ? { tone: 'positive', text: t.detail.requalify } : { tone: 'accent', text: result.error });
      router.refresh();
    });

  const mailto = draft ? `mailto:${encodeURIComponent(draft.to_email)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}` : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <KansBadge kans={lead.kans} className="h-10 w-10 text-lg" />
          <div>
            <h1 className="mek-heading text-2xl sm:text-3xl"><span className="mek-skew">{lead.bedrijf}</span></h1>
            <p className="text-sm text-soft">
              {[lead.segment, [lead.postcode, lead.plaats].filter(Boolean).join(' '), lead.provincie].filter(Boolean).join(' · ')}
              {(lead.familie === 'ja' || lead.familie === 'groot') && <Pill tone="warning" className="ml-2">{tc.familie[lead.familie]}</Pill>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={16} /> {tc.edit}
            </Button>
          )}
          <ButtonLink variant="secondary" href={`/demo?lead=${lead.id}`}>
            <Monitor size={16} /> {t.detail.openDemo}
          </ButtonLink>
          <ButtonLink href={`/roi?lead=${lead.id}`}>
            <Calculator size={16} /> {t.detail.makeQuote}
          </ButtonLink>
        </div>
      </div>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t.detail.pipeline} />
            <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2">
              <div><dt className="label">{t.f.status}</dt><dd>{tc.statuses[lead.status]}{lead.status === 'verloren' && lead.reden ? ` · ${lead.reden}` : ''}</dd></div>
              <div><dt className="label">{t.f.datum}</dt><dd>{dateNl(lead.datum)}</dd></div>
              <div><dt className="label">{t.f.volgende}</dt><dd>{lead.volgende || '–'}{lead.due_date ? ` (${dateNl(lead.due_date)})` : ''}</dd></div>
              <div><dt className="label">{t.f.waarde}</dt><dd>{lead.waarde ? euro(lead.waarde, 0, lang) : '–'}{lead.aantal ? ` · ${lead.aantal}×` : ''}</dd></div>
              <div><dt className="label">{t.f.contact}</dt><dd>{lead.contact || '–'}{lead.functie ? `, ${lead.functie}` : ''}</dd></div>
              <div className="flex flex-wrap gap-3 text-soft">
                {lead.tel && <a href={`tel:${lead.tel.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 hover:text-ink"><Phone size={14} />{lead.tel}</a>}
                {lead.email && <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-ink"><Mail size={14} />{lead.email}</a>}
                {lead.web && <ExtLink href={lead.web} className="inline-flex items-center gap-1"><Globe size={14} />{t.website}</ExtLink>}
                {lead.maps && <ExtLink href={lead.maps} className="inline-flex items-center gap-1"><MapPin size={14} />{t.maps}</ExtLink>}
              </div>
              {leadWaarom && <div className="sm:col-span-2"><dt className="label">{t.f.waarom}</dt><dd>{leadWaarom}</dd></div>}
              {leadAanpak && <div className="internal-only sm:col-span-2"><dt className="label">{t.f.aanpak}</dt><dd>{leadAanpak}</dd></div>}
              {lead.notitie && <div className="internal-only sm:col-span-2"><dt className="label">{t.f.notitie}</dt><dd className="whitespace-pre-wrap">{lead.notitie}</dd></div>}
            </dl>
          </Card>

          <Card className="internal-only">
            <CardHeader title={t.detail.agent}>
              {company && canEdit && (
                <Button variant="ghost" onClick={requalify} disabled={pending}>
                  <RefreshCw size={14} /> {t.detail.requalify}
                </Button>
              )}
            </CardHeader>
            <div className="p-4">{company ? <Assessment company={company} signals={signals} /> : <p className="text-sm text-soft">{t.detail.noAgent}</p>}</div>
          </Card>

          {/* Outreach (B.7 step 8): agent drafts, the user edits and approves */}
          {canEdit && (
            <Card className="internal-only">
              <CardHeader title={to.title}>
                <Button variant="secondary" onClick={makeDraft} disabled={pending}>
                  <Sparkles size={14} /> {draft ? to.remake : to.make}
                </Button>
              </CardHeader>
              {draft && (
                <div className="space-y-3 p-4">
                  <p className="text-xs text-soft">
                    {draft.mode === 'agent' ? to.modeAgent : to.modeRules} · {dateTimeNl(draft.created_at, lang)} · <Pill tone={draft.status === 'sent' ? 'positive' : draft.status === 'failed' ? 'accent' : 'soft'}>{to.status[draft.status as keyof typeof to.status]}</Pill>
                  </p>
                  <div>
                    <label className="label" htmlFor="o-to">{to.to}</label>
                    <input id="o-to" className="field" value={draft.to_email} onChange={(e) => setDraft({ ...draft, to_email: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="o-subject">{to.subject}</label>
                    <input id="o-subject" className="field" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" htmlFor="o-body">{to.body}</label>
                    <textarea id="o-body" className="field min-h-56 font-mono text-xs" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => send(false)} disabled={pending}>{to.saveDraft}</Button>
                    <a className={cx('inline-flex items-center gap-2 rounded-lg border border-line bg-card-2 px-3.5 py-2 text-sm font-semibold')} href={mailto}>
                      <Mail size={14} /> {to.openMail}
                    </a>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard?.writeText(`${draft.subject}\n\n${draft.body}`);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                    >
                      <Copy size={14} /> {copied ? to.copied : to.copy}
                    </Button>
                    {canSend && (
                      <Button onClick={() => send(true)} disabled={pending || draft.status === 'sent'}>
                        <Send size={14} /> {to.approveSend}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-soft">{canSend ? to.legal : to.sendingOff}</p>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {company && (
            <Card>
              <div className="p-4">
                <ContactList contacts={contacts} companyName={lead.bedrijf} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title={t.detail.activity} />
            <div className="space-y-3 p-4">
              {canEdit && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <select className="field w-auto" value={activityType} onChange={(e) => setActivityType(e.target.value as typeof activityType)} aria-label={t.detail.addActivity}>
                      {(['note', 'call', 'mail', 'meeting'] as const).map((k) => (
                        <option key={k} value={k}>{t.detail.activityTypes[k]}</option>
                      ))}
                    </select>
                    <Button onClick={submitActivity} disabled={pending || !activityText.trim()}>{t.detail.add}</Button>
                  </div>
                  <textarea className="field min-h-16" placeholder={t.detail.activityPlaceholder} value={activityText} onChange={(e) => setActivityText(e.target.value)} />
                </div>
              )}
              {activities.length === 0 ? (
                <p className="text-sm text-soft">{t.detail.noActivity}</p>
              ) : (
                <ol className="space-y-2 border-l border-line pl-4">
                  {activities.map((a) => (
                    <li key={a.id} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                      <div className="text-xs text-soft">
                        {t.detail.activityTypes[a.type as keyof typeof t.detail.activityTypes] ?? a.type} · {dateTimeNl(a.created_at, lang)}
                        {a.user ? ` · ${a.user}` : ''}
                      </div>
                      <div className="whitespace-pre-wrap">{describeActivity(a)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.detail.quotes} />
            <div className="p-4">
              {quotes.length === 0 ? (
                <p className="text-sm text-soft">{t.detail.noQuotes}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {quotes.map((q) => (
                    <li key={q.id} className="flex justify-between gap-2">
                      <Link href="/roi/offertes" className="font-medium hover:text-accent">{q.number}</Link>
                      <span className="text-soft">{dateNl(q.created_at)} · {q.trucks}× · {euro(Number(q.total_excl), 0, lang)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>

      <LeadForm open={editOpen} lead={lead} price={price} onClose={() => setEditOpen(false)} />
    </div>
  );
}
