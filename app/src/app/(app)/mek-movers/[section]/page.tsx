import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMessages } from '@/i18n/server';
import { common } from '@/i18n/messages/common';
import { sectionBySlug } from '@/modules/movers/sections';

// /mek-movers/<section>: one URL per menu item. The frame itself is rendered by the layout (MoversWorkspace).
export async function generateMetadata(props: PageProps<'/mek-movers/[section]'>): Promise<Metadata> {
  const { section } = await props.params;
  const s = sectionBySlug(section);
  const t = await getMessages(common);
  return { title: s ? `${t.nav[s.navKey as keyof typeof t.nav]} · MEK Movers` : 'MEK Movers' };
}

export default async function MekMoversSectionPage(props: PageProps<'/mek-movers/[section]'>) {
  const { section } = await props.params;
  if (!sectionBySlug(section)) notFound();
  return null;
}
