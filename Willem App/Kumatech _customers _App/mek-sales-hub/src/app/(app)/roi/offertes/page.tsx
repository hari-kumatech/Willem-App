import type { Metadata } from 'next';
import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { ButtonLink, Card, Empty, Notice, PageHeader, Pill } from '@/components/ui';
import { ReprintButton } from '@/components/roi/ReprintButton';
import { getLang, getMessages } from '@/i18n/server';
import { roi } from '@/i18n/messages/roi';
import { requireUser } from '@/lib/auth';
import { dateTimeNl, euro } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { QUOTE_MODELS, type QuoteModel } from '@/modules/roi/calc';
import { loadSettings } from '@/modules/settings/load';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(roi);
  return { title: t.listTitle };
}

interface QuoteRow {
  id: string;
  number: string;
  created_at: string;
  model: string;
  trucks: number;
  total_excl: number | string;
  customer: Record<string, unknown> | null;
  inputs: unknown;
  results: Record<string, unknown> | null;
  lead_id: string | null;
  created_by: string | null;
  leads: { bedrijf: string } | { bedrijf: string }[] | null;
}

// Viewers see the list and can re-create PDFs; saving new quotes is for admin + sales (action + RLS).
export default async function QuotesPage() {
  await requireUser();
  const [t, lang, settings, supabase] = await Promise.all([getMessages(roi), getLang(), loadSettings(), createClient()]);

  const { data, error } = await supabase
    .from('quotes')
    .select('id, number, created_at, model, trucks, total_excl, customer, inputs, results, lead_id, created_by, leads(bedrijf)')
    .order('created_at', { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as QuoteRow[];

  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (creatorIds.length) {
    const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', creatorIds);
    for (const p of (profiles ?? []) as { id: string; name: string; email: string }[]) names.set(p.id, p.name || p.email);
  }

  const modelLabel = (m: string) => (QUOTE_MODELS.includes(m as QuoteModel) ? t.models[m as QuoteModel] : m);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const numOr = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t.listTitle} subtitle={t.listSubtitle}>
        <ButtonLink href="/roi" variant="secondary">
          <Calculator className="h-4 w-4" aria-hidden /> {t.toCalculator}
        </ButtonLink>
      </PageHeader>

      {error ? (
        <Notice tone="warning">{t.loadFailed}</Notice>
      ) : rows.length === 0 ? (
        <Empty title={t.empty}>{t.emptyHint}</Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="table-wrap">
            <table className="data min-w-[860px]">
              <thead>
                <tr>
                  <th>{t.colNumber}</th>
                  <th>{t.colDate}</th>
                  <th>{t.colCustomer}</th>
                  <th>{t.colModel}</th>
                  <th className="text-right">{t.colTrucks}</th>
                  <th className="text-right">{t.colTotal}</th>
                  <th>{t.colBy}</th>
                  <th>{t.colLead}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => {
                  const c = q.customer ?? {};
                  const lead = Array.isArray(q.leads) ? q.leads[0] : q.leads;
                  const company = str(c.bedrijf) || lead?.bedrijf || '';
                  const contactLine = [str(c.naam), str(c.email)].filter(Boolean).join(' · ');
                  return (
                    <tr key={q.id}>
                      <td className="whitespace-nowrap font-semibold">{q.number}</td>
                      <td className="whitespace-nowrap">{dateTimeNl(q.created_at, lang)}</td>
                      <td>
                        <div>{company || '–'}</div>
                        {contactLine && <div className="text-xs text-soft">{contactLine}</div>}
                      </td>
                      <td>
                        <Pill tone={q.model === 'alle' ? 'info' : 'soft'}>{modelLabel(q.model)}</Pill>
                      </td>
                      <td className="text-right">{q.trucks}</td>
                      <td className="whitespace-nowrap text-right">{euro(Number(q.total_excl), 0, lang)}</td>
                      <td className="whitespace-nowrap">{(q.created_by && names.get(q.created_by)) || '–'}</td>
                      <td>
                        {q.lead_id ? (
                          <Link href={`/leads/${q.lead_id}`} className="text-info hover:underline">
                            {lead?.bedrijf || t.colLead}
                          </Link>
                        ) : (
                          '–'
                        )}
                      </td>
                      <td>
                        <ReprintButton
                          contactEmail={settings.product.contactEmail}
                          quote={{
                            number: q.number,
                            createdAt: q.created_at,
                            model: q.model,
                            trucks: q.trucks,
                            inputs: q.inputs,
                            customer: c,
                            vatPct: numOr(q.results?.vatPct, settings.product.vat),
                            validDays: numOr(q.results?.validDays, settings.product.quoteValidDays),
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
