// Local stand-in for the Apify API, to test the real n8n workflows without spending Apify credit.
// Implements the 4 endpoints the "MEK · Apify actor run" sub-workflow uses:
//   POST /v2/acts/:actor/runs   GET /v2/actor-runs/:id   POST /v2/actor-runs/:id/abort   GET /v2/datasets/:id/items
// Runs report RUNNING for ~20 s (so n8n's polling loop is exercised) and a fake cost.
//
// Usage:  npm run mock:apify            (port 5680)
//         npm run n8n:setup -- --apify-base=http://host.docker.internal:5680
// Back to the real Apify API: npm run n8n:setup  (without --apify-base)

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { contactItems, mapsItems, pageItems, resolveItems, searchItems } from './mock-data.mjs';

const PORT = Number(process.env.MOCK_APIFY_PORT ?? 5680);
const RUN_MS = Number(process.env.MOCK_APIFY_RUN_MS ?? 20000);
const runs = new Map();

function itemsFor(actor, input) {
  if (actor.includes('google-places')) {
    const geo = input.customGeolocation ?? { coordinates: [5.66, 51.48], radiusKm: 10 };
    // Resolve mode: one place per company name found on LinkedIn / in the news
    if (input.maxCrawledPlacesPerSearch === 1) return resolveItems({ lat: Number(geo.coordinates[1]), lng: Number(geo.coordinates[0]) }, input.searchStringsArray ?? []);
    return mapsItems({ lat: Number(geo.coordinates[1]), lng: Number(geo.coordinates[0]), radiusKm: geo.radiusKm }, input.searchStringsArray ?? []);
  }
  if (actor.includes('website-content-crawler')) return pageItems(input.startUrls ?? []);
  if (actor.includes('contact-info-scraper')) return contactItems(input.startUrls ?? []);
  if (actor.includes('google-search-scraper')) return searchItems(input.queries ?? '');
  return [];
}

function runView(run) {
  const done = Date.now() - run.started > RUN_MS || run.aborted;
  return {
    data: {
      id: run.id,
      actId: run.actor,
      status: run.aborted ? 'ABORTED' : done ? 'SUCCEEDED' : 'RUNNING',
      defaultDatasetId: run.datasetId,
      usageTotalUsd: done ? Math.round(run.items.length * 0.004 * 1000) / 1000 : 0,
      startedAt: new Date(run.started).toISOString(),
    },
  };
}

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (!/^Bearer \S+/.test(req.headers.authorization ?? '')) return json(res, 401, { error: { type: 'token-not-provided' } });
  const url = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const start = url.pathname.match(/^\/v2\/acts\/([^/]+)\/runs$/);
    if (req.method === 'POST' && start) {
      const input = body ? JSON.parse(body) : {};
      const run = { id: randomUUID().slice(0, 17), actor: decodeURIComponent(start[1]), started: Date.now(), datasetId: randomUUID().slice(0, 17), items: [] };
      run.items = itemsFor(run.actor, input);
      runs.set(run.id, run);
      console.log(`start ${run.actor} → run ${run.id} (${run.items.length} items)`);
      return json(res, 201, runView(run));
    }
    const get = url.pathname.match(/^\/v2\/actor-runs\/([^/]+)$/);
    if (req.method === 'GET' && get && runs.has(get[1])) return json(res, 200, runView(runs.get(get[1])));
    const abort = url.pathname.match(/^\/v2\/actor-runs\/([^/]+)\/abort$/);
    if (req.method === 'POST' && abort && runs.has(abort[1])) {
      runs.get(abort[1]).aborted = true;
      return json(res, 200, runView(runs.get(abort[1])));
    }
    const items = url.pathname.match(/^\/v2\/datasets\/([^/]+)\/items$/);
    if (req.method === 'GET' && items) {
      const run = [...runs.values()].find((r) => r.datasetId === items[1]);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      return json(res, 200, (run?.items ?? []).slice(0, limit));
    }
    json(res, 404, { error: { type: 'record-not-found' } });
  });
}).listen(PORT, () => console.log(`mock Apify on http://localhost:${PORT} (n8n reaches it at http://host.docker.internal:${PORT})`));
