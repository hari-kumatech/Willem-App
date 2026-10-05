// Sets up n8n for MEK Sales Hub in Docker, end to end:
//   1. starts the container "mek-n8n" (port 5678, data in volume "mek_n8n_data")
//   2. creates the n8n owner account (login saved in .n8n-owner.local, not committed)
//   3. imports the credentials and the 5 workflows from n8n/workflows.mjs and publishes them
//   4. writes the webhook URLs into .env.local
//
// Usage (PowerShell):  $env:APIFY_TOKEN="apify_api_..."; npm run n8n:setup
//        (Git Bash):   APIFY_TOKEN=apify_api_... npm run n8n:setup
// Re-running is safe: workflows and credentials are updated in place.
// The Apify token is only stored as an n8n credential, never in the app (spec B.13).
//
// Options: --apify-base=http://host.docker.internal:5680  (use scripts/mock-apify.mjs instead of the real Apify API)
//          --export                                        (only write n8n/*.json for a manual import)

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCredentials, buildWorkflows, IDS } from '../n8n/workflows.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const CONTAINER = 'mek-n8n';
const IMAGE = 'docker.n8n.io/n8nio/n8n:latest';
const N8N = 'http://localhost:5678';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const secret = process.env.N8N_SECRET;
const appUrl = (process.env.APP_URL || 'http://host.docker.internal:3000').replace(/\/+$/, '');
const apifyBase = typeof args['apify-base'] === 'string' ? args['apify-base'] : 'https://api.apify.com';

const log = (msg) => console.log(`\x1b[36m[n8n-setup]\x1b[0m ${msg}`);
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --export: static JSON files for a manual import (placeholders instead of secrets)
if (args.export) {
  mkdirSync('n8n', { recursive: true });
  for (const wf of buildWorkflows({ appUrl: 'http://host.docker.internal:3000', apifyBase })) {
    const file = `n8n/${wf.name.replace(/^MEK · /, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').toLowerCase()}.json`;
    writeFileSync(file, JSON.stringify(wf, null, 2));
    log(`wrote ${file}`);
  }
  process.exit(0);
}

if (!secret) {
  console.error('N8N_SECRET is missing in .env.local');
  process.exit(1);
}

// 1. Container
function containerState() {
  try {
    return docker('inspect', '-f', '{{.State.Status}}', CONTAINER);
  } catch {
    return null;
  }
}

const state = containerState();
if (!state) {
  log('starting n8n container…');
  docker(
    'run', '-d', '--name', CONTAINER, '--restart', 'unless-stopped',
    '-p', '5678:5678',
    '-v', 'mek_n8n_data:/home/node/.n8n',
    '--add-host', 'host.docker.internal:host-gateway',
    '-e', 'GENERIC_TIMEZONE=Europe/Amsterdam',
    '-e', 'TZ=Europe/Amsterdam',
    // n8n blocks private addresses (SSRF protection); allow only the laptop itself for app callbacks
    '-e', 'N8N_SSRF_ALLOWED_HOSTNAMES=host.docker.internal',
    '-e', 'N8N_SECURE_COOKIE=false',
    '-e', 'N8N_DIAGNOSTICS_ENABLED=false',
    '-e', 'N8N_PERSONALIZATION_ENABLED=false',
    '-e', 'N8N_HIDE_USAGE_PAGE=true',
    '-e', 'EXECUTIONS_DATA_PRUNE=true',
    '-e', 'EXECUTIONS_DATA_MAX_AGE=336',
    IMAGE,
  );
} else if (state !== 'running') {
  log(`container is ${state}, starting…`);
  docker('start', CONTAINER);
}

async function waitHealthy() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${N8N}/healthz`);
      if (r.ok) return;
    } catch {}
    await sleep(2000);
  }
  throw new Error('n8n did not become healthy on http://localhost:5678');
}
await waitHealthy();
log('n8n is up');

// 2. Owner account (only the first time)
const ownerFile = '.n8n-owner.local';
const settings = await (await fetch(`${N8N}/rest/settings`)).json().catch(() => ({}));
const needsSetup = settings?.data?.userManagement?.showSetupOnFirstLoad;
if (needsSetup) {
  const email = process.env.N8N_OWNER_EMAIL || 'admin@mek.local';
  const password = process.env.N8N_OWNER_PASSWORD || `Mek-${randomBytes(9).toString('base64url')}9`;
  const res = await fetch(`${N8N}/rest/owner/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, firstName: 'MEK', lastName: 'Admin', password }),
  });
  if (!res.ok) throw new Error(`owner setup failed: ${res.status} ${await res.text()}`);
  writeFileSync(ownerFile, `n8n login (http://localhost:5678)\nemail: ${email}\npassword: ${password}\n`);
  log(`owner account created → login saved in ${ownerFile}`);
} else {
  log('owner account already exists');
}

// 3. Credentials + workflows
const work = join(tmpdir(), `mek-n8n-${Date.now()}`);
mkdirSync(join(work, 'workflows'), { recursive: true });
const apifyToken = process.env.APIFY_TOKEN?.trim();
let credentials = buildCredentials({ secret, apifyToken });
if (!apifyToken) {
  // Keep an existing Apify credential: only (re)write the two app credentials
  let hasApify = false;
  try {
    hasApify = docker('exec', CONTAINER, 'n8n', 'export:credentials', '--id=mekApifyToken001').includes('mekApifyToken001');
  } catch {}
  if (hasApify) credentials = credentials.filter((c) => c.id !== 'mekApifyToken001');
  log(hasApify ? 'APIFY_TOKEN not given: keeping the existing Apify credential' : 'APIFY_TOKEN not given: Apify credential gets a placeholder (set it in n8n → Credentials, or re-run with APIFY_TOKEN)');
}
writeFileSync(join(work, 'credentials.json'), JSON.stringify(credentials, null, 2));
const workflows = buildWorkflows({ appUrl, apifyBase });
for (const wf of workflows) writeFileSync(join(work, 'workflows', `${wf.id}.json`), JSON.stringify(wf, null, 2));

docker('exec', '-u', 'root', CONTAINER, 'rm', '-rf', '/tmp/mek');
docker('cp', work, `${CONTAINER}:/tmp/mek`);
log(docker('exec', CONTAINER, 'n8n', 'import:credentials', '--input=/tmp/mek/credentials.json').split('\n').pop());
log(docker('exec', CONTAINER, 'n8n', 'import:workflow', '--separate', '--input=/tmp/mek/workflows').split('\n').pop());
for (const id of [IDS.apifyRun, IDS.discovery, IDS.enrich, IDS.scheduler]) {
  log(docker('exec', CONTAINER, 'n8n', 'publish:workflow', `--id=${id}`).split('\n').pop());
}
docker('exec', '-u', 'root', CONTAINER, 'rm', '-rf', '/tmp/mek');

log('restarting n8n so the published workflows are live…');
docker('restart', CONTAINER);
await waitHealthy();

// 4. Webhook URLs into .env.local
const envPath = '.env.local';
let envText = readFileSync(envPath, 'utf8');
const set = (key, value) => {
  envText = new RegExp(`^${key}=.*$`, 'm').test(envText) ? envText.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`) : `${envText.trimEnd()}\n${key}=${value}\n`;
};
set('N8N_DISCOVERY_WEBHOOK_URL', `${N8N}/webhook/mek-discovery`);
set('N8N_ENRICH_WEBHOOK_URL', `${N8N}/webhook/mek-enrich`);
writeFileSync(envPath, envText);

// Check that the webhooks answer (401 without the secret = registered)
for (const path of ['mek-discovery', 'mek-enrich']) {
  // Webhooks register a few seconds after n8n reports healthy
  let status = 0;
  for (let i = 0; i < 20; i++) {
    status = (await fetch(`${N8N}/webhook/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status;
    if (status === 401 || status === 403) break;
    await sleep(3000);
  }
  log(`webhook ${path}: ${status === 401 || status === 403 ? 'live (secret required)' : `status ${status}`}`);
}

log('done. Restart the app (npm run dev / npm start) so it picks up the webhook URLs.');
log(`n8n UI: ${N8N}  ·  app callbacks go to ${appUrl}  ·  Apify API: ${apifyBase}`);
