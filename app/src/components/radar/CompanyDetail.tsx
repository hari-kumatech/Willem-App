'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, Globe, MapPin, Phone, RefreshCw } from 'lucide-react';
import { Button, ButtonLink, Card, CardHeader, ExtLink, KansBadge, Notice, Pill } from '@/components/ui';
import { useLang, useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';
import { radarMsg } from '@/i18n/messages/radar';
import { dateTimeNl, usd } from '@/lib/format';
import { approveCompany, requalifyCompany } from '@/modules/radar/actions';
import { Assessment, ContactList, type CompanyAssessmentData, type ContactData, type SignalData } from './Assessment';

type Company = CompanyAssessmentData & {
  segment: string;
  address: string;
  city: string;
  province: string;
  phone: string;
  website: string;
  maps_url: string;
  reviews: number;
  rating: number | null;
  categories: string[];
  state: string;
  enrichment: { pages?: { url: string; title?: string }[]; search?: { title?: string; url?: string }[] };
  kvk: { nummer: string; sbi: string[]; employees: string } | null;
  first_seen: string;
  last_seen: string;
};

export function CompanyDetail({
  company,
  signals,
  contacts,
  queueState,
  leadId,
  evaluations,
  canEdit,
}: {
  company: Company;
  signals: SignalData[];
  contacts: ContactData[];
  queueState: string | null;
  leadId: string | null;
  evaluations: { agent: string; model: string; prompt_version: string; fit_score: number | null; kans: string | null; cost_usd: number; created_at: string }[];
  canEdit: boolean;
}) {
  const t = useMessages(radarMsg);
  const tc = useMessages(common);
  const lang = useLang();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'positive' | 'accent'; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const result = await fn();
      setMessage(result.ok ? { tone: 'positive', text: ok } : { tone: 'accent', text: result.error ?? tc.genericError });
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <KansBadge kans={company.kans} className="h-10 w-10 text-lg" />
          <div>
            <h1 className="mek-heading text-2xl"><span className="mek-skew">{company.name}</span></h1>
            <p className="text-sm text-soft">{tc.segments[company.segment as keyof typeof tc.segments] ?? company.segment} · {company.address}{company.province ? ` · ${company.province}` : ''}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
              {company.website && <ExtLink href={company.website} className="inline-flex items-center gap-1"><Globe size={12} />{company.website}</ExtLink>}
              {company.phone && <span className="inline-flex items-center gap-1 text-soft"><Phone size={12} />{company.phone}</span>}
              {company.maps_url && <ExtLink href={company.maps_url} className="inline-flex items-center gap-1"><MapPin size={12} />Maps</ExtLink>}
              <Pill>{t.stateLabels[company.state as keyof typeof t.stateLabels] ?? company.state}</Pill>
              {queueState && <Pill tone="info">queue: {queueState}</Pill>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {leadId ? (
            <ButtonLink href={`/leads/${leadId}`}>→ Lead</ButtonLink>
          ) : (
            canEdit && (
              <Button onClick={() => run(() => approveCompany(company.id), t.approved(company.name))} disabled={pending}>
                <Check size={16} /> {t.approve}
              </Button>
            )
          )}
          {canEdit && (
            <Button variant="secondary" onClick={() => run(() => requalifyCompany(company.id), t.requalified)} disabled={pending}>
              <RefreshCw size={14} /> {t.requalify}
            </Button>
          )}
        </div>
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="p-4"><Assessment company={company} signals={signals} /></div>
        </Card>
        <div className="space-y-4">
          <Card><div className="p-4"><ContactList contacts={contacts} companyName={company.name} /></div></Card>
          <Card>
            <CardHeader title={lang === "en" ? "Sources" : "Bronnen"} />
            <ul className="space-y-1 p-4 text-xs">
              {(company.enrichment?.pages ?? []).map((p) => (
                <li key={p.url}><ExtLink href={p.url}>{p.title || p.url}</ExtLink></li>
              ))}
              {(company.enrichment?.search ?? []).slice(0, 8).map((s, i) => (
                <li key={`${s.url}-${i}`} className="text-soft">🔎 {s.url ? <ExtLink href={s.url}>{s.title || s.url}</ExtLink> : s.title}</li>
              ))}
              {company.kvk && <li>KvK {company.kvk.nummer} · {company.kvk.sbi.join(', ')} {company.kvk.employees ? `· ${company.kvk.employees} fte` : ''}</li>}
              <li className="pt-2 text-soft">{dateTimeNl(company.first_seen, lang)} → {dateTimeNl(company.last_seen, lang)}</li>
            </ul>
          </Card>
          <Card className="internal-only">
            <CardHeader title="Audit" />
            <table className="data text-xs">
              <tbody>
                {evaluations.map((e, i) => (
                  <tr key={i}>
                    <td>{e.agent}</td>
                    <td className="font-mono">{e.model}</td>
                    <td>{e.prompt_version}</td>
                    <td className="text-right">{e.fit_score ?? ''} {e.kans ?? ''}</td>
                    <td className="text-right">{usd(Number(e.cost_usd), lang)}</td>
                    <td className="text-soft">{dateTimeNl(e.created_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
      {leadId && <p className="text-sm"><Link className="text-info hover:underline" href={`/leads/${leadId}`}>→ Lead</Link></p>}
    </div>
  );
}
