# MEK Sales Hub

One app for MEK sales of the Mek-Rider: leads pipeline, province overview, an agentic **Prospect Radar**
(n8n + Apify + Claude), ROI calculator with numbered quotes and PDFs, and the crossdock 2D / 3D demos.
Built from *MEK Sales Hub – Requirements and System Specification* (v0.1, 2 Oct 2026). Dutch and English UI.

Everything runs on this laptop: Next.js app, Supabase (Postgres + Auth) in Docker, n8n in Docker.
Only Apify (scraping) and the Claude API run in the cloud.

## Daily use

```powershell
.\start.ps1          # Docker, Supabase, n8n, then the app in production mode
.\start.ps1 -Dev     # same, with hot reload for development
```

Open http://localhost:3000. The first visit creates the **admin** account. Add colleagues under
**Instellingen → Gebruikers** with a role (Admin, Sales, Viewer) and a temporary password.

### Colleagues on the office network

Colleagues open `http://<laptop-ip>:3000` (the exact addresses are listed under **Instellingen → Systeem**).
The laptop must be on, on the same network, with the app running. Windows Firewall blocks this by default;
open the port once in an **administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "MEK Sales Hub" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain
```

Only the app port is needed: the browser never talks to Supabase or n8n directly.

## Turning on real prospecting

1. **Apify** – create an account, copy the API token (Apify Console → Settings → Integrations), then:
   ```powershell
   $env:APIFY_TOKEN="apify_api_..."; npm run n8n:setup
   ```
   This starts n8n in Docker, imports the credentials and five workflows, publishes them and writes the
   webhook URLs into `.env.local`. The n8n login is saved in `.n8n-owner.local`. The token lives only in n8n.
2. **Claude** (optional but recommended) – put `ANTHROPIC_API_KEY=` in `.env.local`. Without it the app runs in
   *regelmodus*: the same rubric scored by rules.
3. Restart the app (`.\start.ps1`). **Instellingen → Systeem** should show *n8n gekoppeld* and *Claude-agents*.
4. **Prospect Radar → Zoekprofielen → Nieuw zoekprofiel**: start small (one postcode, 10 km, 2 terms, $0.50),
   press **Nu zoeken**, follow the run on its page and in n8n → Executions.

Set a schedule on a profile to let it run by itself; n8n calls the app every 30 minutes.

## How a run works (spec B.7)

1. The app turns the profile into searches (term × area). Province and whole-country profiles walk 265
   coverage tiles (±13 km) with a cursor, a few tiles per run.
2. n8n runs `compass/crawler-google-places` per area and posts the places back in batches.
3. The app drops closed businesses, exclusion terms (self-storage, removals …), places outside the area and
   known companies; deduplicates on place id → domain → KvK → name + postcode; geocodes with PDOK.
4. n8n enriches the remaining companies: `apify/website-content-crawler`, `vdrmota/contact-info-scraper`
   and `apify/google-search-scraper` (vacancy / new DC / expansion signals).
5. The Qualifier (Claude Opus 5.5) scores the B.8 rubric with evidence; the weights and the A/B/C thresholds
   are in Instellingen and can be tuned from approve/reject feedback. The Contact picker (Sonnet 5.5) chooses
   the best contact. Every verdict is stored with model, prompt version, tokens and cost.
6. Good companies land in the **review queue**: approve (→ lead), reject with a reason, or snooze.

Budgets: per run and per month per profile, plus global monthly caps for Apify and Claude. n8n asks the
app before every Apify call; real Apify cost is recorded per run.

## Testing without spending credit

| Command | What it does |
|---|---|
| no webhooks in `.env.local` | Demo mode: runs produce sample companies (`.example`) |
| `npm run mock:n8n` | Fake n8n on :5679 (set the 3 webhook URLs to it) |
| `npm run mock:apify` + `npm run n8n:setup -- --apify-base=http://host.docker.internal:5680` | Real n8n, fake Apify |
| `npm test` | Unit tests (formulas, scoring, dedup, URL/CSV safety, n8n contract) |
| `npm run test:e2e` | Browser test: run → review → approve → lead → quote PDF |

Switch back to the real Apify API with `$env:APIFY_TOKEN="…"; npm run n8n:setup` (no `--apify-base`).

## Useful commands

| Command | |
|---|---|
| `npx supabase start` / `stop` | Database on/off (Studio: http://localhost:54323) |
| `npm run db:reset` then `npm run seed` | Wipe the database and re-import the 55 original leads |
| `npm run n8n:export` | Write the workflows to `n8n/*.json` for a manual import |
| `npm run build` / `npm start` | Production build / server (`-H 0.0.0.0`, port 3000) |

## Project map

```
src/app/(app)/        overzicht, leads, radar, roi, demo, instellingen
src/app/api/n8n/      results, scheduler, budget  (n8n → app, Bearer N8N_SECRET)
src/modules/radar/    plan, prefilter, ingest, agents, rules, qualify, budget, startRun
src/modules/leads/    queries, actions (import/export/restore), mapping, persist
src/modules/roi/      efficiency + ROI calculation (one module for screen, comparison and PDF)
src/i18n/messages/    Dutch + English texts per module
supabase/migrations/  schema with Row Level Security, settings, run functions
n8n/workflows.mjs     the 5 n8n workflows (source of truth)
```

## Privacy and limits

- Contact names and e-mails are personal data: do a legitimate-interest assessment before go-live.
  Raw scraper data is purged after 30 days, contacts of unapproved companies after 12 months
  (scheduler, or Instellingen → Data). A do-not-contact list is checked before any e-mail.
- No LinkedIn scraping; the app generates LinkedIn search links only.
- E-mail sending through n8n + Gmail is imported switched off. Enable it only after the legal check.
- Cloud deployment (spec B.14) works with the same code and different environment values.
