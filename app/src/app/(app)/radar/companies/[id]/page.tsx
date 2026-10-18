import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canWrite, requireUser } from '@/lib/auth';
import { createClient } from '@/lib/db/server';
import { getMessages } from '@/i18n/server';
import { radarMsg } from '@/i18n/messages/radar';
import { COMPANY_CARD_COLUMNS } from '@/modules/radar/queries';
import { CompanyDetail } from '@/components/radar/CompanyDetail';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(radarMsg)).tabs.companies };
}

export default async function CompanyPage({ params }: PageProps<'/radar/companies/[id]'>) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createClient();
  const [{ data: company }, { data: signals }, { data: contacts }, { data: queue }, { data: lead }, { data: evaluations }] = await Promise.all([
    db.from('companies').select(`${COMPANY_CARD_COLUMNS}, state, enrichment, kvk, first_seen, last_seen, domain`).eq('id', id).maybeSingle(),
    db.from('company_signals').select('type, text, url').eq('company_id', id),
    db.from('contacts').select('id, name, role, email, phone, source_url, linkedin_search_url, is_primary').eq('company_id', id).order('rank'),
    db.from('review_queue').select('state, reason').eq('company_id', id).maybeSingle(),
    db.from('leads').select('id').eq('company_id', id).maybeSingle(),
    db.from('evaluations').select('agent, model, prompt_version, fit_score, kans, cost_usd, created_at').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  if (!company) notFound();
  const t = await getMessages(radarMsg);
  return (
    <>
      <nav className="mb-2 text-sm text-soft">
        <Link href="/radar?tab=companies" className="hover:text-ink">← {t.tabs.companies}</Link>
      </nav>
      <CompanyDetail
        company={company as never}
        signals={signals ?? []}
        contacts={contacts ?? []}
        queueState={queue?.state ?? null}
        leadId={lead?.id ?? null}
        evaluations={evaluations ?? []}
        canEdit={canWrite(user)}
      />
    </>
  );
}
