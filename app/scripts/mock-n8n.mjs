// Local stand-in for n8n, to test the app's callback flow without n8n or Apify (spec B.13 step 7).
// Accepts the discovery, enrich and send-email webhooks exactly like the real workflows:
// replies { executionId } at once, then posts places / enrichment back to the app with the shared secret.
//
// Usage (second terminal, next to `npm run dev`):  npm run mock:n8n
// and in .env.local (then restart the dev server):
//   N8N_DISCOVERY_WEBHOOK_URL=http://localhost:5679/webhook/mek-discovery
//   N8N_ENRICH_WEBHOOK_URL=http://localhost:5679/webhook/mek-enrich
//   N8N_SEND_EMAIL_WEBHOOK_URL=http://localhost:5679/webhook/mek-send-email
//   APP_URL=http://localhost:3000
// Failure paths: MOCK_N8N_FAIL=discovery | enrich | email

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { contactItems, mapsItems, pageItems, searchItems, toAppPlace } from './mock-data.mjs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const PORT = Number(process.env.MOCK_N8N_PORT ?? 5679);
const SECRET = process.env.N8N_SECRET ?? '';
const FAIL = process.env.MOCK_N8N_FAIL ?? '';
let executions = 0;

async function post(url, payload) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}` }, body: JSON.stringify(payload) });
  console.log(`  → ${payload.kind} ${payload.batchId} (${payload.items.length} items): ${res.status}`);
}

async function discovery(body) {
  const areas = new Map();
  for (const entry of body.plan ?? []) areas.set(`${entry.area.lat},${entry.area.lng}`, { area: entry.area, terms: [...(areas.get(`${entry.area.lat},${entry.area.lng}`)?.terms ?? []), entry.term] });
  let i = 0;
  for (const { area, terms } of areas.values()) {
    i++;
    if (FAIL === 'discovery') {
      await post(body.callbackUrl, { runId: body.runId, batchId: `maps-${i}`, kind: 'error', items: [], error: 'Apify Google Maps failed: mock failure (MOCK_N8N_FAIL=discovery)' });
      continue;
    }
    const items = mapsItems(area, terms).map(toAppPlace);
    await post(body.callbackUrl, { runId: body.runId, batchId: `maps-${i}-1`, kind: 'places', items, cost: { apifyUsd: 0.05 } });
  }
  await post(body.callbackUrl, { runId: body.runId, batchId: 'discovery-done', kind: 'done', items: [] });
}

async function enrich(body) {
  const companies = body.companies ?? [];
  if (FAIL === 'enrich') {
    await post(body.callbackUrl, { runId: body.runId, batchId: body.batchId, kind: 'error', items: [], companyIds: companies.map((c) => c.companyId), error: 'mock failure (MOCK_N8N_FAIL=enrich)' });
    return;
  }
  const sites = companies.map((c) => ({ url: c.website }));
  const pages = pageItems(sites);
  const contacts = contactItems(sites);
  const search = searchItems(companies.flatMap((c) => [`"${c.name}" vacature magazijn`, `"${c.name}" distributiecentrum`]).join('\n'));
  const host = (u) => new URL(u).hostname.replace(/^www\./, '');
  const items = companies.map((c) => {
    const h = host(c.website);
    const contact = contacts.find((x) => x.domain === h);
    return {
      companyId: c.companyId,
      pages: pages.filter((p) => host(p.url) === h).map((p) => ({ url: p.url, title: p.metadata.title, text: p.text })),
      emails: contact?.emails ?? [],
      phones: contact?.phones ?? [],
      linkedIns: contact?.linkedIns ?? [],
      search: search.filter((s) => s.searchQuery.term.includes(c.name)).flatMap((s) => s.organicResults.map((o) => ({ query: s.searchQuery.term, ...o }))),
    };
  });
  await post(body.callbackUrl, { runId: body.runId, batchId: body.batchId, kind: 'enrichment', items, companyIds: companies.map((c) => c.companyId), cost: { apifyUsd: 0.03 } });
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve(null);
      }
    });
  });
}

createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.headers['x-mek-secret'] !== SECRET) return send(403, { message: 'Authorization data is wrong!' });
  const body = await readJson(req);
  if (!body) return send(400, { error: 'invalid json' });
  const path = new URL(req.url, 'http://x').pathname;
  console.log(`${req.method} ${path} run ${body.runId ?? body.draftId ?? ''}`);

  if (path === '/webhook/mek-discovery' || path === '/webhook/mek-enrich') {
    send(202, { executionId: String(++executions) });
    setTimeout(() => (path.endsWith('discovery') ? discovery(body) : enrich(body)).catch((e) => console.error('callback failed', e)), 500);
    return;
  }
  if (path === '/webhook/mek-send-email') {
    if (FAIL === 'email') return send(500, { ok: false, error: 'mock failure (MOCK_N8N_FAIL=email)' });
    console.log(`  ✉ (not sent) to ${body.to}: ${body.subject}`);
    return send(200, { ok: true, messageId: `mock-${Date.now()}` });
  }
  send(404, { message: 'webhook not registered' });
}).listen(PORT, () => console.log(`mock n8n on http://localhost:${PORT} (secret ${SECRET ? 'set' : 'MISSING'})`));
