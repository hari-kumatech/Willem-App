#!/usr/bin/env node
/*
 * MEK Movers - lokale server
 *
 * - Serveert de apps uit ./public
 * - Bewaart alle gegevens in ./data/db.json (bij de eerste start gevuld vanuit ./data/seed.json)
 * - Stuurt wijzigingen live naar alle geopende tabbladen (Server-Sent Events)
 * - Maakt elke dag automatisch een back-up in ./data/backups (de laatste 30 blijven bewaard)
 *
 * Geen externe pakketten nodig: alleen Node.js 18 of nieuwer.
 *   node server.js                 -> http://localhost:3000
 *   PORT=8080 node server.js       -> andere poort
 *   HOST=0.0.0.0 node server.js    -> ook bereikbaar voor andere apparaten in je netwerk
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const SEED_FILE = path.join(DATA, 'seed.json');
const BACKUPS = path.join(DATA, 'backups');
const KEEP_BACKUPS = 30;
const MAX_BODY = 5 * 1024 * 1024;
const NAME_RE = /^[A-Za-z0-9_.\-:@+~]{1,200}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8'
};

// ---------- database ----------
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function loadDb() {
  fs.mkdirSync(DATA, { recursive: true });
  if (fs.existsSync(DB_FILE)) return readJson(DB_FILE);
  if (fs.existsSync(SEED_FILE)) {
    console.log('Eerste start: gegevens worden overgenomen uit data/seed.json');
    const seed = readJson(SEED_FILE);
    fs.writeFileSync(DB_FILE, JSON.stringify(seed));
    return seed;
  }
  return {};
}

let db = loadDb();
let saveTimer = null;

function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE); // atomisch: nooit een half geschreven bestand
}
function scheduleSave() { if (!saveTimer) saveTimer = setTimeout(saveNow, 300); }

function backup() {
  try {
    fs.mkdirSync(BACKUPS, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(BACKUPS, `db-${day}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(db));
    const all = fs.readdirSync(BACKUPS).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    all.slice(0, Math.max(0, all.length - KEEP_BACKUPS)).forEach(f => fs.unlinkSync(path.join(BACKUPS, f)));
  } catch (e) { console.error('Back-up mislukt:', e.message); }
}

// ---------- live updates ----------
const clients = new Set();
function broadcast(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(line);
}

// ---------- helpers ----------
function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('Te groot')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new Error('Ongeldige JSON')); }
    });
    req.on('error', reject);
  });
}

function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

// ---------- API ----------
async function api(req, res, parts) {
  // GET /api/db
  if (parts.length === 1 && parts[0] === 'db' && req.method === 'GET') return send(res, 200, db);

  // GET /api/events
  if (parts.length === 1 && parts[0] === 'events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  // GET /api/export  -> back-up downloaden
  if (parts.length === 1 && parts[0] === 'export' && req.method === 'GET') {
    const day = new Date().toISOString().slice(0, 10);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="mek-movers-backup-${day}.json"` });
    return res.end(JSON.stringify(db, null, 1));
  }

  // POST /api/import -> volledige database vervangen (bijv. een back-up terugzetten)
  if (parts.length === 1 && parts[0] === 'import' && req.method === 'POST') {
    const body = await readBody(req);
    if (!isPlainObject(body) || !Object.values(body).every(isPlainObject)) return send(res, 400, 'Verwacht { collectie: { id: document } }', 'text/plain; charset=utf-8');
    backup();
    db = body; saveNow();
    broadcast({ op: 'reload' });
    return send(res, 200, { ok: true, collections: Object.keys(db).length });
  }

  // /api/db/:collectie/:id
  if (parts.length === 3 && parts[0] === 'db') {
    const col = decodeURIComponent(parts[1]), id = decodeURIComponent(parts[2]);
    if (!NAME_RE.test(col) || !NAME_RE.test(id)) return send(res, 400, 'Ongeldige collectie of id', 'text/plain; charset=utf-8');
    const client = req.headers['x-client'] || '';
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await readBody(req);
      if (!isPlainObject(body)) return send(res, 400, 'Een document moet een object zijn', 'text/plain; charset=utf-8');
      if (!db[col]) db[col] = {};
      if (req.method === 'PATCH') {
        if (!db[col][id]) return send(res, 404, 'Document bestaat niet', 'text/plain; charset=utf-8');
        db[col][id] = Object.assign({}, db[col][id], body);
      } else db[col][id] = body;
      scheduleSave();
      broadcast({ op: req.method === 'PUT' ? 'set' : 'update', col, id, data: body, client });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (db[col]) delete db[col][id];
      scheduleSave();
      broadcast({ op: 'delete', col, id, client });
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8');
}

// ---------- statische bestanden ----------
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Geen toegang', 'text/plain; charset=utf-8');
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) return send(res, 404, 'Niet gevonden', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') return await api(req, res, parts.slice(1));
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Niet toegestaan', 'text/plain; charset=utf-8');
    serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Serverfout: ' + e.message, 'text/plain; charset=utf-8');
  }
});

backup();
setInterval(backup, 60 * 60 * 1000);

function shutdown() { if (saveTimer) saveNow(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  const counts = Object.entries(db).map(([k, v]) => `${k}: ${Object.keys(v).length}`).join(', ');
  console.log(`MEK Movers draait op http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Gegevens: ${counts || 'leeg'}`);
  console.log('Stoppen: Ctrl+C');
});
