import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { DemoClient, type DemoLead, type DemoTab } from '@/components/demo/DemoClient';
import { canWrite, requireUser } from '@/lib/auth';
import { createClient } from '@/lib/db/server';
import { getMessages } from '@/i18n/server';
import { demo } from '@/i18n/messages/demo';
import { loadSettings } from '@/modules/settings/load';
import { parseHall } from '@/modules/crossdock/hall';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(demo);
  return { title: t.title };
}

const TABS: readonly DemoTab[] = ['2d', 'product', 'race'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DemoPage(props: PageProps<'/demo'>) {
  const user = await requireUser();
  const [sp, settings, t, db] = await Promise.all([props.searchParams, loadSettings(), getMessages(demo), createClient()]);

  const tabParam = first(sp.tab);
  const tab: DemoTab = TABS.includes(tabParam as DemoTab) ? (tabParam as DemoTab) : '2d';
  const leadParam = first(sp.lead);
  const leadId = leadParam && UUID.test(leadParam) ? leadParam : null;

  const [leadsRes, leadRes] = await Promise.all([
    db.from('leads').select('id, bedrijf').order('bedrijf', { ascending: true }).limit(200),
    leadId ? db.from('leads').select('id, bedrijf, hall').eq('id', leadId).maybeSingle() : Promise.resolve(null),
  ]);
  if (leadsRes.error) console.error('[demo] leads load failed', leadsRes.error.message);

  const leadRow = leadRes?.data as { id: string; bedrijf: string; hall: unknown } | null | undefined;
  const lead: DemoLead | null = leadRow ? { id: leadRow.id, bedrijf: leadRow.bedrijf } : null;
  const leadHall = leadRow ? parseHall(leadRow.hall) : null;
  const leads = (leadsRes.data ?? []) as DemoLead[];

  const p = settings.product;
  const product = {
    name: p.name,
    forkRetractedMm: p.forkRetractedMm,
    forkExtendedMm: p.forkExtendedMm,
    extendSeconds: p.extendSeconds,
    retractSeconds: p.retractSeconds,
    widthMm: p.widthMm,
    capacityKg: p.capacityKg,
    palletsPerTrip: p.palletsPerTrip,
    speedEmptyKmh: p.speedEmptyKmh,
    speedLoadedKmh: p.speedLoadedKmh,
  };

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <DemoClient
        // Remount when the linked lead changes so the calculator picks up that lead's hall
        key={lead?.id ?? 'none'}
        initialTab={tab}
        product={product}
        shiftHours={p.shiftHours}
        lead={lead}
        leadHall={leadHall}
        leadMissing={Boolean(leadParam) && !lead}
        leads={leads}
        canWrite={canWrite(user)}
      />
    </>
  );
}
