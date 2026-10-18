import 'server-only';

// Server-side configuration. Only the database (PostgREST URL + AUTH_JWT_SECRET, from npm run db:start) is required:
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
  // PostgREST in front of PostgreSQL (docker-compose.yml)
  postgrestUrl: (optional('POSTGREST_URL') ?? 'http://127.0.0.1:54331').replace(/\/+$/, ''),
  // Signs login sessions and database tokens; PostgREST verifies them with the same secret. Server only.
  authJwtSecret: optional('AUTH_JWT_SECRET'),
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
  ollamaTimeoutMs: Number(optional('OLLAMA_TIMEOUT_SECONDS') ?? 900) * 1000,
  // Characters of website text per company for the local model (Claude gets 14,000)
  ollamaEvidenceChars: Number(optional('OLLAMA_EVIDENCE_CHARS') ?? 7000),
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
