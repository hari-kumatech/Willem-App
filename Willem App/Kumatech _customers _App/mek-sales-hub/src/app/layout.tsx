import type { Metadata, Viewport } from 'next';
import { Oswald } from 'next/font/google';
import { cookies } from 'next/headers';
import { Providers } from './providers';
import { getLang } from '@/i18n/server';
import './globals.css';

const oswald = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-oswald', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'MEK Sales Hub', template: '%s · MEK Sales Hub' },
  description: 'Leads, prospecting, ROI en demo voor de Mek-Rider in één app.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0e2038',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const presentation = (await cookies()).get('mek-presentation')?.value === 'on' ? 'on' : 'off';
  const lang = await getLang();
  return (
    <html lang={lang} className={oswald.variable} data-presentation={presentation} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
