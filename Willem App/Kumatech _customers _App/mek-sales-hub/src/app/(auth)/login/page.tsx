import type { Metadata } from 'next';
import { hasUsers } from '@/modules/auth/actions';
import { LoginForm } from './LoginForm';
import { Logo } from '@/components/layout/Logo';
import { getLang, getMessages } from '@/i18n/server';
import { common } from '@/i18n/messages/common';
import { LangSwitch } from '@/components/layout/LangSwitch';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(common)).login.title };
}
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const firstRun = !(await hasUsers().catch(() => true));
  const t = await getMessages(common);
  const lang = await getLang();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo className="h-12 w-auto" />
          <h1 className="mek-heading text-2xl">
            <span className="mek-skew">{t.appName}</span>
          </h1>
          <p className="text-sm text-soft">{t.tagline}</p>
          <LangSwitch lang={lang} />
        </div>
        <LoginForm firstRun={firstRun} />
      </div>
    </main>
  );
}
