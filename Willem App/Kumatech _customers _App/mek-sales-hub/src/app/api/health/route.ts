import { NextResponse } from 'next/server';
import { env, features } from '@/lib/env';
import { createAdminClient } from '@/lib/db/admin';

export const dynamic = 'force-dynamic';

// GET /api/health — what is connected? Only yes/no and statuses, never secrets.
export async function GET() {
  let database: 'ok' | 'missing-migrations' | 'error' | 'not-configured' = 'not-configured';
  if (env.authJwtSecret) {
    try {
      const { error } = await createAdminClient().from('search_runs').select('id').limit(0);
      database = !error ? 'ok' : ['42P01', 'PGRST205'].includes(error.code) ? 'missing-migrations' : 'error';
    } catch {
      database = 'error';
    }
  }

  const warnings: string[] = [];
  if (database === 'not-configured') warnings.push('AUTH_JWT_SECRET ontbreekt in .env.local: draai npm run db:start.');
  if (database === 'missing-migrations') warnings.push('Draai de migraties: npm run db:migrate.');
  if (database === 'error') warnings.push('Database niet bereikbaar: draai npm run db:start (Docker moet aan staan).');
  const usesN8n = Boolean(env.n8nDiscoveryWebhookUrl || env.n8nEnrichWebhookUrl || env.n8nSendEmailWebhookUrl);
  if (usesN8n && !env.n8nSecret) warnings.push('N8N_SECRET is leeg: n8n kan zich niet aanmelden.');
  if (env.n8nDiscoveryWebhookUrl && !env.n8nEnrichWebhookUrl) warnings.push('Geen N8N_ENRICH_WEBHOOK_URL: bedrijven worden alleen op hun vermelding beoordeeld.');
  if (env.n8nDiscoveryWebhookUrl && !env.appUrl) warnings.push('APP_URL is leeg: n8n krijgt de request-origin als callback-URL.');

  return NextResponse.json(
    {
      ok: database === 'ok',
      mode: features.demoMode ? 'demo' : 'n8n',
      ai:
        env.aiProvider === 'ollama'
          ? { provider: 'ollama', model: env.ollamaModel, url: env.ollamaUrl }
          : env.aiProvider === 'anthropic'
            ? { provider: 'anthropic', models: env.models }
            : 'regelmodus (geen ANTHROPIC_API_KEY of AI_PROVIDER=ollama)',
      appUrl: env.appUrl ?? null,
      database,
      n8n: {
        discoveryWebhook: Boolean(env.n8nDiscoveryWebhookUrl),
        enrichWebhook: Boolean(env.n8nEnrichWebhookUrl),
        sendEmailWebhook: Boolean(env.n8nSendEmailWebhookUrl),
        secret: Boolean(env.n8nSecret),
      },
      kvk: Boolean(env.kvkApiKey),
      warnings,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
