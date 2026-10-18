import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { ProfileForm, type ProfileFormValue } from '@/components/radar/ProfileForm';
import { canWrite, requireUser } from '@/lib/auth';
import { env, features } from '@/lib/env';
import { createClient } from '@/lib/db/server';
import { getMessages } from '@/i18n/server';
import { radarMsg } from '@/i18n/messages/radar';
import { parseFilters, parseSchedule } from '@/modules/radar/filters';
import { loadSettings } from '@/modules/settings/load';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(radarMsg)).form.title };
}

// /radar/profiles/new creates a profile; /radar/profiles/<uuid> edits one
export default async function ProfilePage({ params }: PageProps<'/radar/profiles/[id]'>) {
  const user = await requireUser();
  if (!canWrite(user)) redirect('/radar?tab=profiles');
  const { id } = await params;
  const t = await getMessages(radarMsg);
  let initial: ProfileFormValue;

  if (id === 'new') {
    const home = (await loadSettings()).home;
    initial = {
      name: '',
      filters: { ...parseFilters({}), postcode: home.postcode },
      schedule: parseSchedule({ mode: 'off' }),
      budget_run: 2,
      budget_month: 50,
      max_companies: 200,
      active: true,
    };
  } else {
    if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
    const db = await createClient();
    const { data } = await db.from('search_profiles').select('*').eq('id', id).maybeSingle();
    if (!data) notFound();
    initial = {
      id: data.id,
      name: data.name,
      filters: parseFilters(data.filters),
      schedule: parseSchedule(data.schedule),
      budget_run: Number(data.budget_run),
      budget_month: Number(data.budget_month),
      max_companies: data.max_companies,
      active: data.active,
    };
  }

  return (
    <>
      <PageHeader title={id === 'new' ? t.newProfile : initial.name} />
      <ProfileForm initial={initial} kvk={Boolean(env.kvkApiKey)} ai={features.ai} />
    </>
  );
}
