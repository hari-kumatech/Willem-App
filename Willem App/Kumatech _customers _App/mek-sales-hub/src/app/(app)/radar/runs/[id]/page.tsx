import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getMessages } from '@/i18n/server';
import { radarMsg } from '@/i18n/messages/radar';
import { RunDetail } from '@/components/radar/RunDetail';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(radarMsg)).runDetail };
}

export default async function RunPage({ params }: PageProps<'/radar/runs/[id]'>) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: run }, { data: batches }, { data: companies }] = await Promise.all([
    supabase.from('search_runs').select('*').eq('id', id).maybeSingle(),
    supabase.from('run_batches').select('batch_id, kind, item_count, cost_usd, error, received_at').eq('run_id', id).order('received_at'),
    supabase.from('companies').select('id, name, kans, fit_score, state, city, segment').eq('last_run_id', id).order('fit_score', { ascending: false, nullsFirst: false }).limit(200),
  ]);
  if (!run) notFound();
  const t = await getMessages(radarMsg);
  return (
    <>
      <nav className="mb-2 text-sm text-soft">
        <Link href="/radar?tab=runs" className="hover:text-ink">← {t.tabs.runs}</Link>
      </nav>
      <RunDetail run={run} batches={batches ?? []} companies={companies ?? []} />
    </>
  );
}
