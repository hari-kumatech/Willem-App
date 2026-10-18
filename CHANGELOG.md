# Changelog – incremental changes

Every change to the project gets a numbered entry here (`INC-001`, `INC-002`, …), newest first.

- **New folder in `features/`** → the entry is written automatically by `tools/track-features.mjs`
  (runs before every commit, or live with `node tools/track-features.mjs --watch`).
- **Change to an existing app** (code, database, docs) → add an entry by hand at the top, with the next free number.
  Use the format below and, when the change affects a requirement, tick or add it in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) too.

```
### INC-0NN · YYYY-MM-DD · Short title
- **Type:** feature | change | fix | infrastructure | docs | feature folder
- **Where:** path(s) of what changed
- **What:** what changed and why, in one to three lines
- **How to use / migrate:** commands or steps, if any
```

<!-- new entries go below this line (newest first) -->

### INC-009 · 2026-10-18 · Project restructured; one checked requirements file; tool for new HTML files

- **Type:** infrastructure | docs
- **Where:** whole project; new [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), [docs/ADDING-FEATURES.md](docs/ADDING-FEATURES.md),
  [tools/install-html.mjs](tools/install-html.mjs), `Start MEK Sales Hub.cmd`, `app/start.ps1`, `.gitignore`, `.gitattributes`
- **What:** New layout. Earlier entries name the old paths; they map as follows:

  | Old path | New path |
  |---|---|
  | `Willem App/Kumatech _customers _App/mek-sales-hub/` | `app/` |
  | `incremental_features/` | `features/` |
  | `Willem App/MEK-Movers-Sales/MEK-Movers-Sales/`, `mek-rider-3d/mek-rider-3d/`, `mek-rider-leads-nederland/mek-rider-leads-nederland/` | `reference/<name>/` |
  | `Willem App/*.docx`, `Willem app requirements.xlsx` | `docs/specification/` |
  | `REQUIREMENTS.md` + `mek-sales-hub/REQUIREMENTS_STATUS.md` | `docs/REQUIREMENTS.md` (one file) |

  `docs/REQUIREMENTS.md` was checked against the code: every function of the Sales Hub and of the MEK Movers apps
  is listed with `[x]` / `[ ]`. Corrections: stale runs close after 90 minutes (not 30), 51 unit tests (not 46),
  sorting on every leads column except Contact, MEK Movers backup download for everyone with read access. Newly
  listed as not built: 7 of the lead fields from *Willem app requirements.xlsx* (pallet movements, ROI, revenue,
  employees, locations, crossdock yes/no as lead columns), invoice PDF, VAT on MEK Movers quotes, calculator prices
  from Basisgegevens. `tools/install-html.mjs` installs a new or updated HTML file from `features/` into
  `app/public/mek-movers/` with the changes it needs, and reports what still needs code. One-click start: double-click
  `Start MEK Sales Hub.cmd` (browser opens; builds only when something changed).
- **How to use / migrate:** nothing for the data (Docker volumes are unchanged). Close VS Code terminals that were
  open in the old folder; the empty folder `Willem App/` can be deleted after a VS Code restart.

### INC-008 · 2026-10-18 · One leads list for the Sales Hub and MEK Movers

- **Type:** change
- **Where:** `mek-sales-hub/`: `src/modules/movers/leads.ts` + `sync.ts` (new), `store.ts`, `sections.ts`, `MoversWorkspace.tsx`,
  lead / radar / ROI actions, `db/migrations/20261020090000_unified_leads.sql`, `scripts/merge-leads.mts`, `docker-compose.yml`
- **What:** The Sales Hub and the MEK Movers dashboard each had their own leads (57 and 1,640, of which 54 were the same
  companies). Now there is one list, the Sales Hub `leads` table: **1,643 leads**. The MEK Movers dashboard reads and
  writes it through a translation layer (same document ids and fields, so its Start, Klanten and Offertes keep working);
  fields only MEK Movers uses are kept in `leads.extra`. Changes on either side appear live on the other, and status
  changes from MEK Movers are logged in the lead's activity history. The second "Leads" item is gone from the menu;
  the dashboard's Leads link opens the Sales Hub Leads page. Also fixed: the database API returned at most 1,000 rows,
  so lead statistics stopped counting at 1,000 (limit raised to 50,000).
- **How to use / migrate:** `npm run db:migrate`, `npm run db:start` (applies the new row limit), then once
  `npm run leads:merge`. Done on this laptop: all 1,640 MEK Movers leads present with identical fields, the 3 Sales
  Hub-only leads kept, 1,632 leads linked to a company (Prospect Radar recognises them); backups in
  `backups/mek-2026-10-18-2219.sql` and `backups/merge-leads-….json`.

### INC-007 · 2026-10-18 · Main menu reorganised: every MEK Movers section is its own menu item

- **Type:** change
- **Where:** `mek-sales-hub/src/components/layout/SideNav.tsx` (new), `AppShell.tsx`, `src/modules/movers/sections.ts`,
  `src/components/movers/MoversWorkspace.tsx`, `src/app/(app)/mek-movers/layout.tsx` + `[section]/page.tsx`, `common.ts`
- **What:** The tabs inside the MEK Movers page and the dashboard's own side menu are replaced by the Sales Hub main
  menu, grouped as: **Sales Hub** (Overzicht, Leads, Prospect Radar, ROI & Offertes) · **MEK Movers**, collapsible
  (Dashboard, Basisgegevens; Verkoop: Leads, Klanten, Offertes, Demo's; Uitvoering: Orders, Planning; Service:
  Machines, Service, Voorraad; Financieel: Facturen) · **Klantpresentatie** (Demo, Besparingscalculator,
  Besparingsvideo) · **Beheer** (Back-up & herstel, Instellingen). Each item has its own URL (`/mek-movers/klanten` …)
  and a breadcrumb. The apps stay loaded while switching (fast, state kept); clicks inside the dashboard update the
  URL and the menu, and the back button works. The HTML files are still unchanged (the menu is hidden with injected CSS).
- **How to use / migrate:** nothing to do; restart the app.

### INC-006 · 2026-10-18 · All of INC-002 in the Sales Hub: automatic daily backup of MEK Movers data

- **Type:** feature
- **Where:** `mek-sales-hub/src/instrumentation.ts`, `mek-sales-hub/src/modules/movers/backup.ts`
- **What:** Checked every part of [features/mek-movers-apps](features/mek-movers-apps/) against the
  Sales Hub. The pages, data, live updates, export and import were already in (INC-005); the one thing missing was
  the stand-alone server's automatic daily backup. The Sales Hub now writes `backups/mek-movers/db-YYYY-MM-DD.json`
  at start-up and checks every hour, keeping the last 30 days, exactly like `server.js` did.
- **How to use / migrate:** nothing to do; restore a backup from the MEK Movers tab *Start & back-up* (admins).

### INC-005 · 2026-10-18 · MEK Movers apps (dashboard, besparingscalculator, besparingsvideo) in the Sales Hub

- **Type:** feature
- **Where:** `mek-sales-hub/`: `public/mek-movers/` (the HTML apps), `src/app/(app)/mek-movers/` (page + API),
  `src/modules/movers/`, `db/migrations/20261019090000_mek_movers_documents.sql`, `scripts/mek-movers-seed.mts`,
  menu item in `src/components/layout/AppShell.tsx`
- **What:** The apps from [features/mek-movers-apps](features/mek-movers-apps/) (INC-002) now run
  inside the Sales Hub under the new menu item **MEK Movers**, with tabs Dashboard, Besparingscalculator,
  Besparingsvideo and Start & back-up, plus "open in full window". The HTML files are unchanged except the
  dashboard's hub link (now the Sales Hub). Their database moved from `db.json` to the table `mm_documents`, with the
  same API (live updates between tabs, export, import) behind the Sales Hub login and roles.
- **How to use / migrate:** `npm run db:migrate`, then once `npm run mek-movers:seed` (loads the 16 Oct snapshot when
  the table is empty; done on this laptop: 1,662 documents, identical to `seed.json`). Checked in a browser: all
  three apps render, writes reach the database and other open tabs, export works, viewers cannot write or import,
  logged-out access is redirected to the login.

### INC-004 · 2026-10-18 · Project structure, requirements overview and change tracking

- **Type:** docs | infrastructure
- **Where:** [README.md](README.md), REQUIREMENTS.md (now [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)), this file, [features/](features/),
  [tools/track-features.mjs](tools/track-features.mjs), [.githooks/pre-commit](.githooks/pre-commit), [CLAUDE.md](CLAUDE.md)
- **What:** One place for the requirements and functions of every app, a numbered change log, and the
  `incremental_features/` folder (renamed from `incrmental_fetaures`), where each new sub-folder is registered
  automatically with an INC number, a log entry and an index row.
- **How to use / migrate:** once per clone `git config core.hooksPath .githooks`; live registration with
  `node tools/track-features.mjs --watch`.

### INC-003 · 2026-10-18 · MEK Sales Hub runs on plain PostgreSQL + PostgREST (no Supabase)

- **Type:** infrastructure
- **Where:** `Willem App/Kumatech _customers _App/mek-sales-hub/`: `docker-compose.yml`, `scripts/db.mjs`,
  `db/migrations/` (was `supabase/migrations/`), `src/lib/db/`, `src/lib/session.ts`, `src/lib/jwt.ts`, `src/proxy.ts`
- **What:** Supabase (CLI, Auth, supabase-js) removed. The database is PostgreSQL 17 + PostgREST 12 in Docker,
  both free and open source. Login is built in: bcrypt passwords in `auth.users` (pgcrypto) and a signed,
  httpOnly session cookie. Row Level Security, all tables and all queries are unchanged (same PostgREST query builder).
  New migrations `20261001000000_postgres_bootstrap.sql` (roles, `auth.uid()`) and `20261018090000_local_auth.sql`
  (account functions). Ports 54331 (API) and 54332 (PostgreSQL), localhost only.
- **How to use / migrate:** `npm install`, then `npm run db:start` (generates the secrets in `.env.local` and applies
  the migrations), then once `npm run db:import-supabase` to copy users (passwords keep working) and data from the
  old Supabase database. Done on this laptop on 18 Oct: 1 user, 57 leads, 211 companies, 5 runs, all row counts
  identical. Backups: `npm run db:backup` / `npm run db:restore -- <file>`. Checked: typecheck, 51 unit tests,
  a smoke test of RLS / accounts / pages, and a browser login test.

### INC-002 · 2026-10-18 · Feature folder added: MEK Movers – local version

- **Type:** feature folder (registered automatically)
- **Folder:** [features/mek-movers-apps](features/mek-movers-apps/)
- **Summary:** Everything from the MEK Movers dashboard on claude.ai, running on your own computer: Dashboard, Besparingscalculator, Besparingsvideo.

### INC-001 · 2026-10-05 · Baseline: MEK Sales Hub v0.1 and the original apps

- **Type:** baseline
- **Where:** [app/](app/) and [reference/](reference/) (then `Willem App/`)
- **What:** Starting point of this log. MEK Sales Hub (Next.js + Supabase + n8n + Apify + AI agents) built from
  *MEK Sales Hub – Requirements and System Specification* v0.1 (2 Oct 2026); status per requirement in
  REQUIREMENTS_STATUS.md (now merged into [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)).
  Original stand-alone apps kept for reference: MEK-Movers-Sales, mek-rider-3d, mek-rider-leads-nederland.
  Changes of 5 Oct: search depth, web sources (LinkedIn / news), maximum run time, Ollama provider, English
  assessment texts, per-area coverage cursors.
