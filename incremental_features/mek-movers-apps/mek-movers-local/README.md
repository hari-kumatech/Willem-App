# MEK Movers – local version

Everything from the MEK Movers dashboard on claude.ai, running on your own computer:

- **Dashboard** – leads, customers (with ROI tab and history), quotes (quote generator + PDF), orders, planning (week view), machines, service, stock, invoices, base settings and goals.
- **Besparingscalculator** – the customer-facing savings calculator with 3D simulation.
- **Besparingsvideo** – the savings video generator (animation + video download).

Your data is included: `data/seed.json` is a snapshot of the online dashboard database taken on **16 October 2026** (1,640 leads, 2 customers, 1 quote, 1 order, 11 machines, planning, demo, follow-up, base settings and goals for 2026 and 2027).

---

## 1. Requirements

- **Node.js 18 or newer** – download from <https://nodejs.org> (choose "LTS").
- An internet connection (the pages load fonts and the libraries jsPDF, SheetJS and three.js from public CDNs).

No `npm install` is needed: the server uses only Node's built-in modules.

## 2. Start

```bash
cd mek-movers-local
npm start
```

Then open **http://localhost:3000** in your browser and choose an app.

- Stop the server with `Ctrl + C`.
- Other port: `PORT=8080 npm start` (Windows PowerShell: `$env:PORT=8080; npm start`).
- Use it from other devices in your network (phone, tablet, a colleague's laptop): `npm run start:lan`, then open `http://<ip-address-of-this-computer>:3000`.

> ⚠️ There is **no login**. Only use `start:lan` on a trusted network and never expose the server directly to the internet.

## 3. Where your data is stored

| File | What it is |
|---|---|
| `data/seed.json` | Starting data. Used **only on the very first start**, when `data/db.json` does not exist yet. |
| `data/db.json` | The live database. Every change in the apps is written here (atomically, so the file is never half-written). |
| `data/backups/db-YYYY-MM-DD.json` | Automatic daily backup. The last 30 days are kept. |

Changes appear **live in all open tabs and devices** (Server-Sent Events), just like on claude.ai.

### Backup and restore

On the start page (http://localhost:3000):

- **Back-up downloaden** – downloads the complete database as one JSON file.
- **Back-up terugzetten** – replaces all data with a backup file (a backup of the current state is made first).

Or manually: stop the server, replace `data/db.json` with a backup file, start again.

To start completely fresh from the snapshot: stop the server, delete `data/db.json`, start again.

## 4. Project structure

```
mek-movers-local/
├── server.js                      Node server: static files + JSON database + live updates + backups
├── package.json
├── public/
│   ├── index.html                 Start page (choose an app, backup/restore)
│   ├── dashboard.html             MEK Movers dashboard (complete app, single file)
│   ├── besparingscalculator.html  Savings calculator (single file)
│   ├── besparingsvideo.html       Savings video generator (single file)
│   └── js/claude-local.js         Local replacement for the claude.ai runtime
└── data/
    └── seed.json                  Data snapshot (16 Oct 2026)
```

### How it works

The apps were built as claude.ai artifacts. On claude.ai they get their database and downloads from the platform via `await claude.use('db')` and `await claude.use('downloads')`.

`public/js/claude-local.js` provides exactly those two functions locally:

- **db** – the Firestore-style API the apps use: `collection(name).onSnapshot(cb)`, `.doc(id).set() / .update() / .delete()`, `.add()`. Reads and writes go to the local server (`/api/db/...`); changes from other tabs arrive through `/api/events`. If a page is opened without the server (double-clicking the HTML file), it falls back to browser storage (`localStorage`) for that browser only.
- **downloads** – `save({ filename, data })` triggers a normal browser download (quote PDF, afleverbon PDF, savings video).

The app HTML files are otherwise identical to the published versions; each has one extra line at the top of `<head>`:

```html
<script src="js/claude-local.js"></script>
```

### Server API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/db` | Whole database `{ collection: { id: document } }` |
| PUT | `/api/db/:collection/:id` | Create or replace a document |
| PATCH | `/api/db/:collection/:id` | Merge fields into a document |
| DELETE | `/api/db/:collection/:id` | Delete a document |
| GET | `/api/events` | Live change stream (Server-Sent Events) |
| GET | `/api/export` | Download a full backup |
| POST | `/api/import` | Replace the whole database with a backup |

Collections: `leads`, `offertes`, `opvolging`, `klanten`, `orders`, `planning`, `demos`, `machines`, `service`, `artikelen`, `facturen`, `instellingen` (documents `basis`, `doelen-2026`, `doelen-2027`).

## 5. Differences from the claude.ai version

- The local version and the online dashboard **do not sync**. Changes you make locally stay local, and vice versa. Pick one as your working copy.
- The "MEK Movers Sales" link in the dashboard menu still points to the hub on claude.ai.
- Opening an HTML file directly (file://) works, but data is then only kept in that browser and starts empty. Use `npm start` for the real setup.
