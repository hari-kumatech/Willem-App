import type { Metadata } from 'next';
import { ListChecks } from 'lucide-react';
import { ButtonLink, PageHeader } from '@/components/ui';
import { RoiWizard, type LeadOption } from '@/components/roi/RoiWizard';
import { getMessages } from '@/i18n/server';
import { roi } from '@/i18n/messages/roi';
import { canWrite, requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { RoiSettings } from '@/modules/roi/calc';
import { loadSettings } from '@/modules/settings/load';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(roi);
  return { title: t.title };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LeadRow {
  id: string;
  bedrijf: string;
  contact: string | null;
  email: string | null;
  tel: string | null;
  hall: unknown;
}

function toOption(row: LeadRow): LeadOption {
  const hall = row.hall && typeof row.hall === 'object' ? (row.hall as Record<string, unknown>) : null;
  const n = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : undefined);
  return {
    id: row.id,
    bedrijf: row.bedrijf,
    contact: row.contact ?? '',
    email: row.email ?? '',
    tel: row.tel ?? '',
    hall: hall ? { lengthM: n(hall.lengthM), widthM: n(hall.widthM) } : null,
  };
}

export default async function RoiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [user, settings, t, params, supabase] = await Promise.all([requireUser(), loadSettings(), getMessages(roi), searchParams, createClient()]);
  const writer = canWrite(user);
  const leadParam = typeof params.lead === 'string' ? params.lead : null;

  let initialLead: LeadOption | null = null;
  let leadNotFound = false;
  let leads: LeadOption[] = [];
  const columns = 'id, bedrijf, contact, email, tel, hall';

  if (leadParam) {
    const { data } = UUID.test(leadParam) ? await supabase.from('leads').select(columns).eq('id', leadParam).maybeSingle() : { data: null };
    if (data) initialLead = toOption(data as LeadRow);
    else leadNotFound = true;
  }
  if (!initialLead && writer) {
    const { data } = await supabase.from('leads').select(columns).order('bedrijf', { ascending: true }).limit(200);
    leads = ((data ?? []) as LeadRow[]).map(toOption);
  }

  // Constants come from the settings table (never hard-coded in the client)
  const p = settings.product;
  const roiSettings: RoiSettings = {
    productName: p.name,
    price: p.price,
    competitorPrice: p.competitorPrice,
    vat: p.vat,
    shiftHours: p.shiftHours,
    workDaysPerYear: p.workDaysPerYear,
    quoteValidDays: p.quoteValidDays,
    contactEmail: p.contactEmail,
    palletsPerTrip: p.palletsPerTrip,
    speedKmh: p.speedEmptyKmh,
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t.title} subtitle={t.subtitle}>
        <ButtonLink href="/roi/offertes" variant="secondary">
          <ListChecks className="h-4 w-4" aria-hidden /> {t.quotesLink}
        </ButtonLink>
      </PageHeader>
      <RoiWizard
        key={initialLead?.id ?? 'none'}
        settings={roiSettings}
        canSave={writer}
        showMargin={writer}
        initialLead={initialLead}
        leadNotFound={leadNotFound}
        leads={leads}
      />
    </div>
  );
}
