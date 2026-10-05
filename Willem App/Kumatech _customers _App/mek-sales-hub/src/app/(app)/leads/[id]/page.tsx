import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canWrite, requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { features } from '@/lib/env';
import { getLead } from '@/modules/leads/queries';
import { loadSettings } from '@/modules/settings/load';
import { getMessages } from '@/i18n/server';
import { leadsMsg } from '@/i18n/messages/leads';
import { LeadDetail } from '@/components/leads/LeadDetail';

export async function generateMetadata({ params }: PageProps<'/leads/[id]'>): Promise<Metadata> {
  const lead = await getLead((await params).id);
  return { title: lead?.bedrijf ?? (await getMessages(leadsMsg)).title };
}

export default async function LeadPage({ params }: PageProps<'/leads/[id]'>) {
  const user = await requireUser();
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const supabase = await createClient();
  const t = await getMessages(leadsMsg);

  const [company, signals, contacts, activities, quotes, drafts, settings] = await Promise.all([
    lead.company_id
      ? supabase
          .from('companies')
          .select('id, name, kans, fit_score, criteria, score_reasons, risks, waarom, aanpak, qualified_at, qualified_mode, reviews, rating, categories, segment, website, distance_km')
          .eq('id', lead.company_id)
          .maybeSingle()
          .then((r) => r.data)
      : Promise.resolve(null),
    lead.company_id ? supabase.from('company_signals').select('type, text, url').eq('company_id', lead.company_id).order('found_at', { ascending: false }).limit(10).then((r) => r.data ?? []) : Promise.resolve([]),
    lead.company_id
      ? supabase.from('contacts').select('id, name, role, email, phone, source_url, linkedin_search_url, is_primary').eq('company_id', lead.company_id).order('rank').then((r) => r.data ?? [])
      : Promise.resolve([]),
    supabase.from('activities').select('id, type, text, created_at, user_id, profiles(name)').eq('lead_id', id).order('created_at', { ascending: false }).limit(100).then((r) => r.data ?? []),
    supabase.from('quotes').select('id, number, model, trucks, total_excl, created_at').eq('lead_id', id).order('created_at', { ascending: false }).then((r) => r.data ?? []),
    supabase.from('outreach_drafts').select('id, to_email, subject, body, status, mode, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(5).then((r) => r.data ?? []),
    loadSettings(),
  ]);

  return (
    <>
      <nav className="mb-2 text-sm text-soft">
        <Link href="/leads" className="hover:text-ink">← {t.detail.back}</Link>
      </nav>
      <LeadDetail
        lead={lead}
        company={company}
        signals={signals}
        contacts={contacts}
        activities={activities.map((a) => ({
          id: a.id,
          type: a.type,
          text: a.text,
          created_at: a.created_at,
          user: (a.profiles as unknown as { name: string } | null)?.name ?? '',
        }))}
        quotes={quotes}
        drafts={drafts}
        canEdit={canWrite(user)}
        canSend={features.canSendEmail}
        price={settings.product.price}
      />
    </>
  );
}
