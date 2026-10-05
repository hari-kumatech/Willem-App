// MEK Sales Hub — n8n workflow definitions (spec B.7 + B.10).
// `npm run n8n:setup` imports these into the local n8n container; `npm run n8n:export` writes them to n8n/*.json
// for a manual import (n8n → Workflows → Import from File).
//
// Split of responsibilities: n8n only runs Apify actors and schedules. The app does prefiltering, dedup,
// scoring, the Claude agents and all data rules.

export const IDS = {
  apifyRun: 'mekApifyRun00001',
  discovery: 'mekDiscovery0001',
  enrich: 'mekEnrich0000001',
  scheduler: 'mekScheduler0001',
  sendEmail: 'mekSendEmail0001',
};

export const CREDENTIALS = {
  inbound: { id: 'mekInboundAuth01', name: 'MEK app → n8n (x-mek-secret)' },
  outbound: { id: 'mekOutboundAuth1', name: 'n8n → MEK app (Bearer)' },
  apify: { id: 'mekApifyToken001', name: 'Apify API token' },
  gmail: { id: 'mekGmailOAuth001', name: 'Gmail (afzender)' },
};

const cred = (key) => ({ httpHeaderAuth: { id: CREDENTIALS[key].id, name: CREDENTIALS[key].name } });

let counter = 0;
const uid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

function node(name, type, typeVersion, parameters, position, extra = {}) {
  return { id: uid(), name, type, typeVersion, position, parameters, ...extra };
}

// Code node: the function body is taken from a real JS function so it stays readable and lintable here
const code = (name, fn, position) =>
  node(name, 'n8n-nodes-base.code', 2, { mode: 'runOnceForAllItems', jsCode: fn.toString().replace(/^[^{]*{\n?/, '').replace(/}\s*$/, '').trim() }, position);

function http(name, { method = 'GET', url, body, credential, timeout = 30000, onError, retry = false, alwaysOutput = false }, position) {
  return node(
    name,
    'n8n-nodes-base.httpRequest',
    4.2,
    {
      method,
      url,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}),
      options: { timeout },
    },
    position,
    {
      credentials: cred(credential),
      ...(onError ? { onError } : {}),
      ...(retry ? { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 } : {}),
      ...(alwaysOutput ? { alwaysOutputData: true } : {}),
    },
  );
}

function boolIf(name, expression, position) {
  return node(
    name,
    'n8n-nodes-base.if',
    2,
    {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ id: uid(), leftValue: expression, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and',
      },
      options: {},
    },
    position,
  );
}

function webhook(name, path, position) {
  return node(
    name,
    'n8n-nodes-base.webhook',
    2,
    { httpMethod: 'POST', path, authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
    position,
    { webhookId: uid(), credentials: cred('inbound') },
  );
}

const respondAccepted = (position) =>
  node('Respond: accepted', 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify({ executionId: $execution.id }) }}', options: { responseCode: 202 } }, position);

function connect(pairs) {
  // pairs: [from, to, outputIndex = 0]
  const connections = {};
  for (const [from, to, output = 0] of pairs) {
    connections[from] ??= { main: [] };
    while (connections[from].main.length <= output) connections[from].main.push([]);
    connections[from].main[output].push({ node: to, type: 'main', index: 0 });
  }
  return connections;
}

const note = (content, position, width = 420, height = 300) =>
  node(`Note ${uid().slice(-4)}`, 'n8n-nodes-base.stickyNote', 1, { content, width, height }, position);

function workflow(id, name, nodes, connections, active = true) {
  return { id, name, active, nodes, connections, settings: { executionOrder: 'v1', saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all', timezone: 'Europe/Amsterdam' }, pinData: {} };
}

// ---------------------------------------------------------------------------
// 1. Sub-workflow: run one Apify actor (budget check → start → poll → dataset → cost)
// ---------------------------------------------------------------------------
function apifyRunWorkflow(apifyBase) {
  const nodes = [
    node('Start', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, { inputSource: 'passthrough' }, [0, 300]),
    http('Budget check', { url: '={{ $json.budgetUrl }}', credential: 'outbound', timeout: 20000, onError: 'continueErrorOutput', retry: true }, [220, 300]),
    boolIf('Budget OK?', '={{ $json.allowed === true }}', [440, 300]),
    http(
      'Start actor',
      {
        method: 'POST',
        url: `={{ '${apifyBase}/v2/acts/' + $('Start').first().json.actorId + '/runs?waitForFinish=60' }}`,
        body: "={{ JSON.stringify($('Start').first().json.input) }}",
        credential: 'apify',
        timeout: 90000,
        onError: 'continueErrorOutput',
      },
      [660, 200],
    ),
    code(
      'Track run',
      function () {
        // Works for the start response and every poll: { data: { id, status, defaultDatasetId, usageTotalUsd } }
        const d = $input.first().json.data || {};
        return [{ json: { apifyRunId: d.id, status: d.status, datasetId: d.defaultDatasetId, costUsd: Number(d.usageTotalUsd || 0), polls: $runIndex } }];
      },
      [880, 200],
    ),
    boolIf('Finished?', "={{ !['READY', 'RUNNING'].includes($json.status) || $json.polls >= ($('Start').first().json.maxPolls || 40) }}", [1100, 200]),
    node('Wait 15 s', 'n8n-nodes-base.wait', 1.1, { amount: 15, unit: 'seconds' }, [1100, 420], { webhookId: uid() }),
    http('Poll run', { url: `={{ '${apifyBase}/v2/actor-runs/' + $('Track run').last().json.apifyRunId }}`, credential: 'apify', timeout: 30000, onError: 'continueErrorOutput', retry: true }, [880, 420]),
    boolIf('Still running?', "={{ ['READY', 'RUNNING'].includes($json.status) }}", [1320, 200]),
    http('Abort run', { method: 'POST', url: `={{ '${apifyBase}/v2/actor-runs/' + $json.apifyRunId + '/abort' }}`, credential: 'apify', onError: 'continueRegularOutput' }, [1540, 100]),
    http(
      'Get items',
      {
        url: `={{ '${apifyBase}/v2/datasets/' + $('Track run').last().json.datasetId + '/items?clean=true&format=json&limit=' + ($('Start').first().json.maxItems || 1000) }}`,
        credential: 'apify',
        timeout: 120000,
        onError: 'continueErrorOutput',
        alwaysOutput: true,
      },
      [1760, 200],
    ),
    code(
      'Return result',
      function () {
        const run = $('Track run').last().json;
        const items = $input.all().map((i) => i.json).filter((j) => j && Object.keys(j).length > 0);
        const ok = run.status === 'SUCCEEDED';
        return [{ json: { status: run.status, items, costUsd: run.costUsd, apifyRunId: run.apifyRunId, error: ok ? null : `Apify run ${run.status}` } }];
      },
      [1980, 200],
    ),
    code(
      'Return error',
      function () {
        const j = $input.first().json || {};
        const e = j.error;
        const msg = String(typeof e === 'string' ? e : (e && (e.message || e.description)) || JSON.stringify(e || j)).slice(0, 500);
        let cost = 0;
        try {
          cost = $('Track run').last().json.costUsd || 0;
        } catch {}
        return [{ json: { status: 'ERROR', items: [], costUsd: cost, error: msg } }];
      },
      [1980, 520],
    ),
    code(
      'Return budget stop',
      function () {
        const j = $input.first().json || {};
        return [{ json: { status: 'BUDGET', items: [], costUsd: 0, error: `budget: ${j.reason || 'reached'}` } }];
      },
      [660, 420],
    ),
    note(
      '## Apify actor run (sub-workflow)\nCalled by Discovery and Enrich, once per actor.\n1. Asks the app how much budget is left (GET budgetUrl).\n2. Starts the actor asynchronously (Apify sync calls stop after 300 s).\n3. Polls every 15 s until it finishes (max `maxPolls`, then aborts).\n4. Fetches the dataset and returns `{ status, items, costUsd }` with the real cost from Apify.',
      [0, -40],
      520,
      260,
    ),
  ];
  const connections = connect([
    ['Start', 'Budget check'],
    ['Budget check', 'Budget OK?'],
    ['Budget check', 'Return error', 1],
    ['Budget OK?', 'Start actor'],
    ['Budget OK?', 'Return budget stop', 1],
    ['Start actor', 'Track run'],
    ['Start actor', 'Return error', 1],
    ['Track run', 'Finished?'],
    ['Finished?', 'Still running?'],
    ['Finished?', 'Wait 15 s', 1],
    ['Wait 15 s', 'Poll run'],
    ['Poll run', 'Track run'],
    ['Poll run', 'Return error', 1],
    ['Still running?', 'Abort run'],
    ['Still running?', 'Get items', 1],
    ['Abort run', 'Get items'],
    ['Get items', 'Return result'],
    ['Get items', 'Return error', 1],
  ]);
  return workflow(IDS.apifyRun, 'MEK · Apify actor run (sub)', nodes, connections);
}

const runActorNode = (position) =>
  node(
    'Run Apify actor',
    'n8n-nodes-base.executeWorkflow',
    1.2,
    { source: 'database', workflowId: { __rl: true, value: IDS.apifyRun, mode: 'id' }, mode: 'each', options: { waitForSubWorkflow: true } },
    position,
    { onError: 'continueRegularOutput' },
  );

// ---------------------------------------------------------------------------
// 2. Discovery: Google Maps places per area (compass/crawler-google-places)
// ---------------------------------------------------------------------------
function discoveryWorkflow() {
  const nodes = [
    webhook('Webhook: discovery', 'mek-discovery', [0, 300]),
    respondAccepted([220, 300]),
    code(
      'Build area searches',
      function () {
        // App plan [{ term, area: { postcode, label, lat, lng, radiusKm } }] → one Google Maps run per area
        const body = $('Webhook: discovery').first().json.body;
        const groups = new Map();
        for (const entry of body.plan || []) {
          const a = entry.area;
          const key = `${a.lat},${a.lng},${a.radiusKm}`;
          if (!groups.has(key)) groups.set(key, { area: a, terms: [] });
          groups.get(key).terms.push(entry.term);
        }
        // mode "resolve": look up company names found on LinkedIn / in the news (1 place per name)
        const resolve = body.mode === 'resolve';
        const perSearch = Math.max(resolve ? 1 : 5, Math.min(200, Number(body.perSearch) || 40));
        // How long one actor may run: polls every 15 s, so minutes × 4 (the app sends maxRunMinutes)
        const maxPolls = Math.max(20, Math.min(320, Math.round((Number(body.maxRunMinutes) || 30) * 4)));
        const jobs = [...groups.values()].map((g, i) => ({
          json: {
            actorId: 'compass~crawler-google-places',
            kind: 'places',
            mode: resolve ? 'resolve' : 'discovery',
            label: `${resolve ? 'resolve' : 'maps'}-${i + 1}`,
            runId: body.runId,
            callbackUrl: body.callbackUrl,
            budgetUrl: body.budgetUrl,
            maxItems: perSearch * g.terms.length,
            maxPolls,
            area: g.area,
            input: {
              searchStringsArray: [...new Set(g.terms)],
              customGeolocation: { type: 'Point', coordinates: [g.area.lng, g.area.lat], radiusKm: g.area.radiusKm },
              maxCrawledPlacesPerSearch: perSearch,
              language: 'nl',
              countryCode: 'nl',
              skipClosedPlaces: body.skipClosed !== false,
              searchMatching: 'all',
              website: 'allPlaces',
              // Deep search: open every place's detail page (exact closed status, all categories, extra info)
              scrapePlaceDetailPage: body.deep === true,
              scrapeContacts: false,
              scrapeDirectories: false,
              includeWebResults: false,
              maxReviews: 0,
              maxImages: 0,
              maxQuestions: 0,
            },
          },
        }));
        // Extra sources: public LinkedIn company pages and logistics news / PR sites, through Google Search.
        // LinkedIn itself is never called; the app turns the names into Google Maps lookups (mode "resolve").
        const web = body.web && Array.isArray(body.web.queries) ? body.web.queries.filter((q) => q && q.query) : [];
        if (!resolve && web.length) {
          const pages = Math.max(1, Math.min(5, Number(body.web.pages) || 2));
          jobs.push({
            json: {
              actorId: 'apify~google-search-scraper',
              kind: 'web',
              mode: 'discovery',
              label: 'web-1',
              runId: body.runId,
              callbackUrl: body.callbackUrl,
              budgetUrl: body.budgetUrl,
              maxItems: web.length * pages,
              maxPolls,
              webQueries: web,
              input: {
                queries: web.map((q) => q.query).join('\n'),
                countryCode: 'nl',
                languageCode: 'nl',
                maxPagesPerQuery: pages,
                resultsPerPage: 10,
                mobileResults: false,
                saveHtml: false,
                saveHtmlToKeyValueStore: false,
              },
            },
          });
        }
        return jobs;
      },
      [440, 300],
    ),
    runActorNode([660, 300]),
    code(
      'Map places to batches',
      function () {
        // Apify Google Maps output → the app's place format (spec B.10), max 100 places per callback
        const requests = $('Build area searches').all().map((i) => i.json);
        const out = [];
        $input.all().forEach((item, index) => {
          const r = item.json || {};
          const q = requests[index] || requests[0];
          const cost = { apifyUsd: Number(r.costUsd || 0) };
          const base = { runId: q.runId, callbackUrl: q.callbackUrl };
          if (r.status === 'BUDGET' || (r.status === 'ERROR' && !(r.items || []).length)) {
            out.push({ json: { ...base, batchId: q.label, kind: 'error', items: [], cost, error: r.error || 'Apify step failed' } });
            return;
          }
          if (q.kind === 'web') {
            // Google Search pages → one result per organic hit, tagged with its source (linkedin / news)
            const sourceOf = new Map((q.webQueries || []).map((w) => [String(w.query).trim().toLowerCase(), w.source]));
            const results = [];
            for (const page of r.items || []) {
              const term = (page.searchQuery && page.searchQuery.term) || '';
              for (const o of page.organicResults || []) {
                results.push({ source: sourceOf.get(term.trim().toLowerCase()) || null, query: term, title: o.title || '', url: o.url || '', description: o.description || '' });
              }
            }
            for (let i = 0; i < Math.max(1, results.length); i += 200) {
              out.push({ json: { ...base, batchId: `${q.label}-${i / 200 + 1}`, kind: 'web', items: results.slice(i, i + 200), cost: i === 0 ? cost : { apifyUsd: 0 } } });
            }
            return;
          }
          const places = (r.items || [])
            .map((p) => ({
              placeId: p.placeId || null,
              name: p.title || p.name || '',
              address: p.address || [p.street, p.postalCode, p.city].filter(Boolean).join(', '),
              postcode: p.postalCode || null,
              city: p.city || null,
              phone: p.phone || p.phoneUnformatted || null,
              website: p.website || null,
              mapsUrl: p.url || null,
              categories: Array.isArray(p.categories) && p.categories.length ? p.categories : p.categoryName ? [p.categoryName] : [],
              reviews: Number(p.reviewsCount || 0),
              rating: p.totalScore == null ? null : Number(p.totalScore),
              location: p.location && p.location.lat ? { lat: p.location.lat, lng: p.location.lng } : null,
              closed: Boolean(p.permanentlyClosed),
              description: p.description || p.subTitle || null,
              searchTerm: p.searchString || null,
              emails: Array.isArray(p.emails) ? p.emails : [],
            }))
            .filter((p) => p.name);
          for (let i = 0; i < Math.max(1, places.length); i += 100) {
            out.push({ json: { ...base, batchId: `${q.label}-${i / 100 + 1}`, kind: 'places', items: places.slice(i, i + 100), cost: i === 0 ? cost : { apifyUsd: 0 } } });
          }
        });
        return out;
      },
      [880, 300],
    ),
    http(
      'Send batch to app',
      {
        method: 'POST',
        url: '={{ $json.callbackUrl }}',
        body: '={{ JSON.stringify({ runId: $json.runId, batchId: $json.batchId, kind: $json.kind, items: $json.items, cost: $json.cost, error: $json.error || null, executionId: $execution.id }) }}',
        credential: 'outbound',
        timeout: 60000,
        retry: true,
      },
      [1100, 300],
    ),
    code(
      'Discovery finished',
      function () {
        const q = $('Build area searches').first().json;
        return [{ json: { runId: q.runId, callbackUrl: q.callbackUrl, batchId: q.mode === 'resolve' ? 'resolve-done' : 'discovery-done' } }];
      },
      [1320, 300],
    ),
    http(
      'Send done to app',
      { method: 'POST', url: '={{ $json.callbackUrl }}', body: "={{ JSON.stringify({ runId: $json.runId, batchId: $json.batchId, kind: 'done', items: [] }) }}", credential: 'outbound', retry: true },
      [1540, 300],
    ),
    note('## Discovery (Google Maps + LinkedIn / news)\nApp → this webhook with `{ runId, callbackUrl, budgetUrl, plan[], perSearch, maxRunMinutes, web }`.\nOne `compass/crawler-google-places` run per area (all terms together), plus one `apify/google-search-scraper` run for public LinkedIn company pages and news / PR sites (`web.queries`). Results go back to the app in batches, then `kind: done`.\n**mode = resolve**: the app sends company names found on LinkedIn / in the news; each is looked up in Google Maps (1 place per name) and the run ends with `resolve-done`.\nThe app prefilters, deduplicates, enriches and scores.', [0, 0], 560, 300),
  ];
  const connections = connect([
    ['Webhook: discovery', 'Respond: accepted'],
    ['Respond: accepted', 'Build area searches'],
    ['Build area searches', 'Run Apify actor'],
    ['Run Apify actor', 'Map places to batches'],
    ['Map places to batches', 'Send batch to app'],
    ['Send batch to app', 'Discovery finished'],
    ['Discovery finished', 'Send done to app'],
  ]);
  return workflow(IDS.discovery, 'MEK · Discovery (Google Maps)', nodes, connections);
}

// ---------------------------------------------------------------------------
// 3. Enrich: website text + contact details + growth signals per company
// ---------------------------------------------------------------------------
function enrichWorkflow() {
  const nodes = [
    webhook('Webhook: enrich', 'mek-enrich', [0, 300]),
    respondAccepted([220, 300]),
    code(
      'Build enrich jobs',
      function () {
        const body = $('Webhook: enrich').first().json.body;
        const companies = (body.companies || []).filter((c) => c.website);
        if (!companies.length) return [];
        const sites = companies.map((c) => ({ url: c.website }));
        // Company name without quotes and legal form: "De Vries Warehousing B.V." → De Vries Warehousing
        const clean = (s) => String(s).replace(/["]/g, '').replace(/\b(b\.?\s?v\.?|n\.?\s?v\.?|v\.?o\.?f\.?|holding)(?=\s|$)/gi, '').replace(/\s+/g, ' ').trim();
        const deep = (body.options && body.options.depth) === 'deep';
        const pagesPerSite = deep ? 15 : 6;
        const minutes = Number(body.options && body.options.maxRunMinutes) || (deep ? 20 : 10);
        const common = { runId: body.runId, budgetUrl: body.budgetUrl, maxPolls: Math.max(20, Math.min(320, Math.round(minutes * 4))) };
        // Signal searches per company. Deep adds news, warehouse size and public LinkedIn job/post snippets
        // that Google has indexed (LinkedIn itself is never scraped: terms of use + privacy, spec B.1).
        const signalQueries = (name) =>
          [
            `"${name}" vacature magazijn OR orderpicker OR heftruck`,
            `"${name}" distributiecentrum OR uitbreiding OR nieuwbouw OR crossdock`,
            ...(deep
              ? [
                  `"${name}" m2 OR dockdeuren OR palletplaatsen OR vrachtwagens`,
                  `"${name}" nieuws logistiek OR overname OR investering`,
                  `site:linkedin.com/jobs "${name}" magazijn OR logistiek`,
                  `site:linkedin.com/posts "${name}" warehouse OR distributiecentrum OR uitbreiding`,
                ]
              : []),
          ];
        return [
          {
            ...common,
            label: 'pages',
            actorId: 'apify~website-content-crawler',
            maxItems: companies.length * pagesPerSite,
            input: {
              startUrls: sites,
              crawlerType: 'cheerio',
              maxCrawlDepth: deep ? 2 : 1,
              maxCrawlPages: companies.length * pagesPerSite,
              maxConcurrency: 10,
              removeCookieWarnings: true,
              htmlTransformer: 'readableText',
              saveMarkdown: false,
              saveHtml: false,
              saveFiles: false,
              saveScreenshots: false,
              proxyConfiguration: { useApifyProxy: true },
            },
          },
          {
            ...common,
            label: 'contacts',
            actorId: 'vdrmota~contact-info-scraper',
            maxItems: companies.length * 3,
            input: { startUrls: sites, maxRequestsPerStartUrl: 5, maxDepth: 1, sameDomain: true, considerChildFrames: false, mergeContacts: true, proxyConfig: { useApifyProxy: true } },
          },
          {
            ...common,
            label: 'signals',
            actorId: 'apify~google-search-scraper',
            maxItems: companies.length * 6,
            input: {
              queries: companies.flatMap((c) => signalQueries(clean(c.name))).join('\n'),
              countryCode: 'nl',
              languageCode: 'nl',
              maxPagesPerQuery: 1,
              resultsPerPage: 10,
              mobileResults: false,
              saveHtml: false,
              saveHtmlToKeyValueStore: false,
            },
          },
        ].map((json) => ({ json }));
      },
      [440, 300],
    ),
    runActorNode([660, 300]),
    code(
      'Merge evidence per company',
      function () {
        const body = $('Webhook: enrich').first().json.body;
        const companies = body.companies || [];
        const labels = $('Build enrich jobs').all().map((i) => i.json.label);
        const results = {};
        let cost = 0;
        const errors = [];
        $input.all().forEach((it, idx) => {
          results[labels[idx]] = it.json;
          cost += Number(it.json.costUsd || 0);
          if (it.json.status !== 'SUCCEEDED' && it.json.error) errors.push(`${labels[idx]}: ${it.json.error}`);
        });
        // No URL class in the n8n code sandbox: parse the host with a regex
        const host = (u) => {
          const m = String(u || '').toLowerCase().match(/^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/);
          return m ? m[1].replace(/^www\./, '') : '';
        };
        const byDomain = new Map(companies.map((c) => [c.domain || host(c.website), c]));
        const find = (u) => {
          const h = host(u);
          if (!h) return null;
          if (byDomain.has(h)) return byDomain.get(h);
          for (const [d, c] of byDomain) if (d && (h.endsWith(`.${d}`) || d.endsWith(`.${h}`))) return c;
          return null;
        };
        const ev = new Map(companies.map((c) => [c.companyId, { companyId: c.companyId, pages: [], search: [], emails: [], phones: [], linkedIns: [] }]));
        for (const p of (results.pages && results.pages.items) || []) {
          const c = find(p.url || p.loadedUrl);
          if (!c) continue;
          const e = ev.get(c.companyId);
          if (e.pages.length < 15) e.pages.push({ url: p.url, title: (p.metadata && p.metadata.title) || '', text: String(p.text || p.markdown || '').slice(0, 6000) });
        }
        for (const r of (results.contacts && results.contacts.items) || []) {
          const c = find(r.originalStartUrl || r.url || (r.domain ? `https://${r.domain}` : ''));
          if (!c) continue;
          const e = ev.get(c.companyId);
          e.emails.push(...(r.emails || []));
          e.phones.push(...(r.phones || []), ...(r.phonesUncertain || []).slice(0, 2));
          e.linkedIns.push(...(r.linkedIns || []));
        }
        const strip = (s) =>
          String(s || '')
            .replace(/["]/g, '')
            .replace(/\b(b\.?\s?v\.?|n\.?\s?v\.?|v\.?o\.?f\.?|holding)(?=\s|$)/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        for (const page of (results.signals && results.signals.items) || []) {
          const term = (page.searchQuery && page.searchQuery.term) || '';
          const c = companies.find((x) => strip(term).includes(strip(x.name)));
          if (!c) continue;
          const e = ev.get(c.companyId);
          for (const o of (page.organicResults || []).slice(0, 6)) e.search.push({ query: term, title: o.title || '', url: o.url || '', description: o.description || '' });
        }
        for (const e of ev.values()) {
          e.emails = [...new Set(e.emails.map((x) => String(x).toLowerCase()))];
          e.phones = [...new Set(e.phones)];
          e.linkedIns = [...new Set(e.linkedIns)];
        }
        const allFailed = ['pages', 'contacts', 'signals'].every((l) => !results[l] || ['ERROR', 'BUDGET'].includes(results[l].status));
        return [
          {
            json: {
              runId: body.runId,
              batchId: body.batchId,
              callbackUrl: body.callbackUrl,
              kind: allFailed ? 'error' : 'enrichment',
              items: allFailed ? [] : [...ev.values()],
              companyIds: companies.map((c) => c.companyId),
              cost: { apifyUsd: Math.round(cost * 10000) / 10000 },
              error: errors.join(' | ').slice(0, 480) || null,
            },
          },
        ];
      },
      [880, 300],
    ),
    http(
      'Send evidence to app',
      {
        method: 'POST',
        url: '={{ $json.callbackUrl }}',
        body: '={{ JSON.stringify({ runId: $json.runId, batchId: $json.batchId, kind: $json.kind, items: $json.items, companyIds: $json.companyIds, cost: $json.cost, error: $json.error }) }}',
        credential: 'outbound',
        timeout: 60000,
        retry: true,
      },
      [1100, 300],
    ),
    note('## Enrich\nApp → this webhook with up to 8 companies.\nRuns three actors: `apify/website-content-crawler` (max ±6 pages per site), `vdrmota/contact-info-scraper` (e-mails, phones, social links) and `apify/google-search-scraper` (2 signal queries per company).\nThe evidence goes back per company; the Claude Qualifier scores it in the app.', [0, 0], 560, 240),
  ];
  const connections = connect([
    ['Webhook: enrich', 'Respond: accepted'],
    ['Respond: accepted', 'Build enrich jobs'],
    ['Build enrich jobs', 'Run Apify actor'],
    ['Run Apify actor', 'Merge evidence per company'],
    ['Merge evidence per company', 'Send evidence to app'],
  ]);
  return workflow(IDS.enrich, 'MEK · Enrich (website, contacts, signals)', nodes, connections);
}

// ---------------------------------------------------------------------------
// 4. Scheduler: every 30 minutes the app starts due profiles
// ---------------------------------------------------------------------------
function schedulerWorkflow(appUrl) {
  const nodes = [
    node('Every 30 minutes', 'n8n-nodes-base.scheduleTrigger', 1.2, { rule: { interval: [{ field: 'minutes', minutesInterval: 30 }] } }, [0, 300]),
    http('Run due profiles', { method: 'POST', url: `${appUrl}/api/n8n/scheduler`, credential: 'outbound', timeout: 280000, retry: true }, [240, 300]),
    note('## Scheduler\nEvery 30 min: the app starts every active profile that is due and has budget left, closes runs without callback for 30 min, and purges old data.', [0, 60], 420, 180),
  ];
  return workflow(IDS.scheduler, 'MEK · Scheduler (every 30 min)', nodes, connect([['Every 30 minutes', 'Run due profiles']]));
}

// ---------------------------------------------------------------------------
// 5. Send an approved e-mail through Gmail (inactive until Gmail is connected and the legal check is done)
// ---------------------------------------------------------------------------
function sendEmailWorkflow() {
  const nodes = [
    webhook('Webhook: send email', 'mek-send-email', [0, 300]),
    node(
      'Gmail: send',
      'n8n-nodes-base.gmail',
      2.1,
      {
        sendTo: '={{ $json.body.to }}',
        subject: '={{ $json.body.subject }}',
        emailType: 'text',
        message: '={{ $json.body.body }}',
        options: { replyTo: '={{ $json.body.replyTo || "" }}', appendAttribution: false },
      },
      [240, 300],
      { credentials: { gmailOAuth2: { id: CREDENTIALS.gmail.id, name: CREDENTIALS.gmail.name } }, onError: 'continueErrorOutput' },
    ),
    node('Respond: sent', 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true, messageId: $json.id }) }}', options: {} }, [480, 220]),
    node('Respond: failed', 'n8n-nodes-base.respondToWebhook', 1.1, { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: false, error: String($json.error?.message || $json.error || "send failed") }) }}', options: { responseCode: 500 } }, [480, 400]),
    note('## Send e-mail (optional)\nOnly for e-mails a salesperson approved in the app. Connect a Gmail OAuth2 credential to **Gmail: send**, then publish this workflow and set `N8N_SEND_EMAIL_WEBHOOK_URL` in the app.\nSwitch it on only after the legal check (AVG / cold e-mail, spec B.12).', [0, 0], 520, 220),
  ];
  return workflow(
    IDS.sendEmail,
    'MEK · Send e-mail (Gmail)',
    nodes,
    connect([
      ['Webhook: send email', 'Gmail: send'],
      ['Gmail: send', 'Respond: sent'],
      ['Gmail: send', 'Respond: failed', 1],
    ]),
    false,
  );
}

export function buildWorkflows({ appUrl, apifyBase = 'https://api.apify.com' }) {
  counter = 0;
  return [apifyRunWorkflow(apifyBase), discoveryWorkflow(), enrichWorkflow(), schedulerWorkflow(appUrl), sendEmailWorkflow()];
}

export function buildCredentials({ secret, apifyToken }) {
  return [
    { id: CREDENTIALS.inbound.id, name: CREDENTIALS.inbound.name, type: 'httpHeaderAuth', data: { name: 'x-mek-secret', value: secret } },
    { id: CREDENTIALS.outbound.id, name: CREDENTIALS.outbound.name, type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${secret}` } },
    { id: CREDENTIALS.apify.id, name: CREDENTIALS.apify.name, type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${apifyToken || 'PASTE_APIFY_TOKEN'}` } },
  ];
}
