import type { Metadata } from 'next';
import { networkInterfaces } from 'node:os';
import { PageHeader } from '@/components/ui';
import { SettingsView } from '@/components/settings/SettingsView';
import { canWrite, isAdmin, requireUser } from '@/lib/auth';
import { env, features } from '@/lib/env';
import { createClient } from '@/lib/db/server';
import { getMessages } from '@/i18n/server';
import { settingsMsg } from '@/i18n/messages/settings';
import { loadSettings } from '@/modules/settings/load';
import { suggestWeights } from '@/modules/settings/feedback';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getMessages(settingsMsg)).title };
}

// LAN addresses of this laptop, so colleagues know which URL to open
function lanUrls(port = Number(process.env.PORT ?? 3000)): string[] {
  const urls: string[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    // Skip Docker / WSL / VPN-style virtual adapters
    if (/vEthernet|WSL|Docker|VirtualBox|VMware|Loopback/i.test(name)) continue;
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) urls.push(`http://${net.address}:${port}`);
    }
  }
  return urls;
}

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getMessages(settingsMsg);
  const db = await createClient();
  const settings = await loadSettings();
  const [{ data: users }, { data: dnc }, feedback] = await Promise.all([
    db.from('profiles').select('id, name, email, role, created_at').order('created_at'),
    canWrite(user) ? db.from('do_not_contact').select('id, value, created_at').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    suggestWeights(settings.weights),
  ]);

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <SettingsView
        settings={settings}
        users={users ?? []}
        dnc={dnc ?? []}
        me={user}
        admin={isAdmin(user)}
        writer={canWrite(user)}
        feedback={feedback}
        system={{
          demo: features.demoMode,
          ai: features.ai,
          models: env.aiProvider === 'ollama' ? { ollama: `${env.ollamaModel} (${env.ollamaUrl})` } : env.models,
          aiLabel: features.aiLabel,
          webhooks: { discovery: Boolean(env.n8nDiscoveryWebhookUrl), enrich: Boolean(env.n8nEnrichWebhookUrl), sendEmail: Boolean(env.n8nSendEmailWebhookUrl) },
          kvk: Boolean(env.kvkApiKey),
          urls: lanUrls(),
        }}
      />
    </>
  );
}
