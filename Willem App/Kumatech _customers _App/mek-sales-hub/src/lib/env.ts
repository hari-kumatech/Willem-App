import 'server-only';

// Server-side configuration. Only Supabase is required:
// without n8n webhooks the app runs in demo mode, without an Anthropic key the agents use rules ("regelmodus").
function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export type AiProvider = 'anthropic' | 'ollama';

// AI_PROVIDER=ollama forces the local model; otherwise Claude when a key is set; else rules mode
function aiProvider(): AiProvider | null {
  const forced = optional('AI_PROVIDER')?.toLowerCase();
  if (forced === 'ollama') return 'ollama';
  if (forced === 'rules' || forced === 'none') return null;
  if (optional('ANTHROPIC_API_KEY')) return 'anthropic';
  return null;
}

export const env = {
  supabaseUrl: optional('SUPABASE_URL') ?? optional('NEXT_PUBLIC_SUPABASE_URL'),
  supabasePublishableKey: optional('SUPABASE_PUBLISHABLE_KEY') ?? optional('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  supabaseSecretKey: optional('SUPABASE_SECRET_KEY'),
  // URL n8n uses for callbacks (n8n in Docker reaches the laptop at host.docker.internal)
  appUrl: optional('APP_URL')?.replace(/\/+$/, ''),
  n8nDiscoveryWebhookUrl: optional('N8N_DISCOVERY_WEBHOOK_URL'),
  n8nEnrichWebhookUrl: optional('N8N_ENRICH_WEBHOOK_URL'),
  n8nSendEmailWebhookUrl: optional('N8N_SEND_EMAIL_WEBHOOK_URL'),
  n8nSecret: optional('N8N_SECRET'),
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
  models: {
    qualifier: optional('AI_MODEL_QUALIFIER') ?? 'claude-opus-5-5',
    contacts: optional('AI_MODEL_CONTACTS') ?? 'claude-sonnet-5-5',
    prefilter: optional('AI_MODEL_PREFILTER') ?? 'claude-haiku-4-5-20251001',
    outreach: optional('AI_MODEL_OUTREACH') ?? 'claude-opus-5-5',
    planner: optional('AI_MODEL_PLANNER') ?? 'claude-haiku-4-5-20251001',
  },
  // Local, free models via Ollama (AI_PROVIDER=ollama). One model for all agents.
  ollamaUrl: (optional('OLLAMA_URL') ?? 'http://localhost:11434').replace(/\/+$/, ''),
  ollamaModel: optional('OLLAMA_MODEL') ?? 'qwen2.5:7b',
  ollamaContext: Number(optional('OLLAMA_NUM_CTX') ?? 16384),
  ollamaTimeoutMs: Number(optional('OLLAMA_TIMEOUT_SECONDS') ?? 600) * 1000,
  aiProvider: aiProvider(),
  kvkApiKey: optional('KVK_API_KEY'),
  timezone: optional('DEFAULT_TIMEZONE') ?? 'Europe/Amsterdam',
};

export const features = {
  // Without a discovery webhook the app generates sample companies so the whole flow can be tested
  demoMode: !env.n8nDiscoveryWebhookUrl,
  enrich: Boolean(env.n8nEnrichWebhookUrl),
  canSendEmail: Boolean(env.n8nSendEmailWebhookUrl),
  ai: env.aiProvider !== null,
  // Short label for the UI, e.g. "Claude" or "Ollama · qwen2.5:7b"
  aiLabel: env.aiProvider === 'ollama' ? `Ollama · ${env.ollamaModel}` : env.aiProvider === 'anthropic' ? 'Claude' : null,
};
