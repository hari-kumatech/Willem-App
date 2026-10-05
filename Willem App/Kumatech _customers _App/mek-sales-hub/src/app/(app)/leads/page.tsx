import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { LeadsView } from '@/components/leads/LeadsView';
import { canWrite, requireUser } from '@/lib/auth';
import { provinceBySlug } from '@/lib/constants';
import { getMessages } from '@/i18n/server';
import { leadsMsg } from '@/i18n/messages/leads';
import { common } from '@/i18n/messages/common';
import { leadKpis, listLeads } from '@/modules/leads/queries';
import { parseLeadFilters } from '@/modules/leads/types';
import { loadSettings } from '@/modules/settings/load';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(leadsMsg)).title };
}

export default async function LeadsPage({ searchParams }: PageProps<'/leads'>) {
  const user = await requireUser();
  const filters = parseLeadFilters(await searchParams);
  const [t, tc, { leads, count, pages }, kpis, settings] = await Promise.all([
    getMessages(leadsMsg),
    getMessages(common),
    listLeads(filters),
    leadKpis(filters.provincie),
    loadSettings(),
  ]);
  const province = provinceBySlug(filters.provincie);
  return (
    <>
      {province && (
        <nav className="mb-2 text-sm text-soft" aria-label="breadcrumb">
          <Link href="/overzicht" className="hover:text-ink">{tc.nav.overzicht}</Link> / <span className="text-ink">{province.name}</span>
        </nav>
      )}
      <PageHeader title={province ? `${t.title} · ${province.name}` : t.title} subtitle={t.subtitle(kpis.total)} />
      <LeadsView
        leads={leads}
        count={count}
        pages={pages}
        kpis={kpis}
        filters={filters}
        canEdit={canWrite(user)}
        price={settings.product.price}
      />
    </>
  );
}
