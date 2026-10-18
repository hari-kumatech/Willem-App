import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink, Notice, PageHeader, cx } from '@/components/ui';
import { canWrite, requireUser } from '@/lib/auth';
import { features } from '@/lib/env';
import { getMessages } from '@/i18n/server';
import { radarMsg } from '@/i18n/messages/radar';
import { listCompanies, listProfiles, listRuns, queueItems, usageThisMonth } from '@/modules/radar/queries';
import { loadSettings } from '@/modules/settings/load';
import { QueueView } from '@/components/radar/QueueView';
import { ProfilesView } from '@/components/radar/ProfilesView';
import { RunsView } from '@/components/radar/RunsView';
import { CompaniesView } from '@/components/radar/CompaniesView';
import { UsageView } from '@/components/radar/UsageView';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(radarMsg)).title };
}

const TABS = ['queue', 'profiles', 'runs', 'companies', 'usage'] as const;
type Tab = (typeof TABS)[number];

export default async function RadarPage({ searchParams }: PageProps<'/radar'>) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? '';
  const tab: Tab = (TABS as readonly string[]).includes(one('tab')) ? (one('tab') as Tab) : 'queue';
  const t = await getMessages(radarMsg);
  const editable = canWrite(user);

  let content: React.ReactNode = null;
  if (tab === 'queue') {
    const kans = one('kans').split(',').filter((k) => ['A', 'B', 'C'].includes(k));
    content = <QueueView items={await queueItems(kans)} kans={kans} canEdit={editable} />;
  } else if (tab === 'profiles') {
    content = <ProfilesView profiles={await listProfiles()} canEdit={editable} />;
  } else if (tab === 'runs') {
    content = <RunsView runs={await listRuns()} />;
  } else if (tab === 'companies') {
    const page = Math.max(1, Number(one('page')) || 1);
    const { companies, count } = await listCompanies(one('q'), one('state'), page);
    content = <CompaniesView companies={companies} count={count} page={page} q={one('q')} state={one('state')} />;
  } else {
    content = <UsageView usage={await usageThisMonth()} caps={(await loadSettings()).caps} />;
  }

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle}>
        {editable && tab === 'profiles' && <ButtonLink href="/radar/profiles/new">{t.newProfile}</ButtonLink>}
      </PageHeader>
      <div className="mb-4 space-y-2">
        {features.demoMode && <Notice tone="warning">{t.demoMode}</Notice>}
        {!features.ai && <Notice tone="info">{t.rulesMode}</Notice>}
      </div>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label={t.title}>
        {TABS.map((key) => (
          <Link
            key={key}
            href={`/radar?tab=${key}`}
            className={cx(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold',
              tab === key ? 'border-accent text-ink' : 'border-transparent text-soft hover:text-ink',
            )}
            aria-current={tab === key ? 'page' : undefined}
          >
            {t.tabs[key]}
          </Link>
        ))}
      </nav>
      {content}
    </>
  );
}
