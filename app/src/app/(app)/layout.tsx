import { cookies } from 'next/headers';
import { AppShell } from '@/components/layout/AppShell';
import { requireUser } from '@/lib/auth';
import { features } from '@/lib/env';
import { createClient } from '@/lib/db/server';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireUser();
  const db = await createClient();
  const [{ count }, cookieStore] = await Promise.all([
    db.from('review_queue').select('id', { count: 'exact', head: true }).eq('state', 'new'),
    cookies(),
  ]);
  const presentation = cookieStore.get('mek-presentation')?.value === 'on';
  return (
    <AppShell user={user} presentation={presentation} queueCount={count ?? 0} mode={{ demo: features.demoMode, ai: features.ai, aiLabel: features.aiLabel }}>
      {children}
    </AppShell>
  );
}
