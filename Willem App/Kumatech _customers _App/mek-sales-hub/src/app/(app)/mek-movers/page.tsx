import type { Metadata } from 'next';
import { getMessages } from '@/i18n/server';
import { common } from '@/i18n/messages/common';

// /mek-movers = MEK Movers dashboard start. The frame itself is rendered by the layout (MoversWorkspace).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages(common);
  return { title: `${t.nav.mmStart} · MEK Movers` };
}

export default function MekMoversStartPage() {
  return null;
}
