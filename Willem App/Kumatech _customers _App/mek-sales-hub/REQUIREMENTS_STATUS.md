# MEK Sales Hub – Requirements status

Based on *MEK Sales Hub – Requirements and System Specification* v0.1 (2 Oct 2026), Part B.
Status as of 18 October 2026.

- `[x]` = built and working on the laptop. A note in *italics* says how it was checked when that matters.
- `[ ]` = not done yet, or waiting on a decision or an outside step.

---

## B.1 Goals

- [x] One application: Leads, Leads Nederland, Prospect zoeker, ROI calculator, Crossdock visualisatie and Mek-Rider 3D are modules of one app with one login, one database and one house style
- [x] Continuous prospecting: saved search profiles run on a schedule, find new companies, refresh known ones, never add duplicates
- [x] Good customers, not just many: every company gets a fit score 0–100, a kans A/B/C, reasons and an approach
- [x] Human in control: new prospects land in a review queue; nothing is e-mailed without approval
- [x] Local first: the whole system runs on one Windows laptop
- [ ] Same code deployed to the cloud *(B.14, not started)*

## B.2 Users and roles

- [x] Admin: everything, including settings, product constants, budgets, users and the internal AaS margin
- [x] Sales: leads, review queue, search profiles, runs, ROI and quotes
- [x] Viewer: read-only
- [x] Presentation mode: one switch hides margins, scores and notes on the ROI, crossdock and 3D screens
- [x] First account becomes admin; admins add colleagues with a role and a temporary password

## B.3 Modules

### Overzicht
- [x] National KPI cards (leads total, open A-leads, open pipeline, quotes outstanding, won, win ratio)
- [x] 12 province tiles plus "Zonder provincie", with real province from PDOK
- [x] Newest agent finds, latest runs, open review count
- [x] Actions due today or earlier

### Leads
- [x] Six statuses in pipeline order, KPI tile per status (count, € sum or A/B/C split), tile click filters
- [x] Value split bar, open pipeline, win ratio
- [x] Filters: status, kans A/B/C, family business, city, province, live search (also searches notes, "waarom", "aanpak")
- [x] Sort on every column; server-side filtering and pagination
- [x] Inline status change with activity log; reason required for "verloren"
- [x] Contact cell: phone, e-mail, website, Maps, LinkedIn search links for 4 roles + Google site:linkedin search
- [x] Lead form with all fields, quote value auto = number × list price until typed
- [x] Two-click delete
- [x] Lead detail page: agent assessment, contacts, activity log, quotes, e-mail draft
- [x] Due dates on next action; overdue shown in red
- [x] Excel / CSV / JSON import (server-side, 5 MB limit, hyperlinks preferred, Dutch status mapping, dedup on name + postcode)
- [x] Export: Excel in the MEK_Leads_crossdock.xlsx layout, CSV, JSON in mek-leads format
- [x] JSON restore (Instellingen, admin)
- [x] Province routing (`/leads?provincie=…`) with breadcrumb; warning when an edit moves a lead to another province
- [x] 55 original leads imported once as companies + leads by a seed script

### Prospect Radar
- [x] Search profiles, runs, review queue, all companies, costs (tabs)
- [x] Agentic n8n + Apify pipeline; no Google key in the browser
- [x] Schedules and budgets per profile
- [x] Run detail page: plan, counts, filtered-out reasons, batches, costs; refreshes while running
- [ ] Map view of found companies *(not built)*

### ROI & Offertes
- [x] 4-step wizard: lead details, route & efficiency, costs (Koop / Lease / AaS), comparison
- [x] Defaults give 18.8% efficiency, €8,460 per year, about 12 months payback of the extra cost
- [x] One calculation module for screen, comparison table and both PDFs
- [x] Quotes saved per lead, numbered by a database sequence (MEK-YYYY-NNNN)
- [x] Quote PDF and comparison PDF, in the UI language; reprint from the saved quotes list
- [x] Internal AaS margin only for Admin/Sales and hidden in presentation mode; never in the customer PDF *(built; not checked in a browser)*
- [x] Prefill from a lead (`/roi?lead=…`), including hall data saved from the demo

### Demo
- [x] Crossdock 2D: two animated lanes, process steps, calculator "Uw hal, uw volume" (defaults 26.1%, 3.0 h, 0.38 FTE)
- [x] Mek-Rider 3D product view: forks 1,198 → 1,998 mm, load selector, auto-rotate
- [x] 3D crossdock race with result panel; recording mode
- [x] three.js upgraded from 0.128 to 0.186
- [x] Opens from a lead; hall data can be saved on the lead
- [x] Same constants as ROI (from Instellingen)

### MEK Movers *(added 18 Oct, INC-005)*
- [x] Company dashboard, besparingscalculator and besparingsvideo, every section its own main-menu item with URL and breadcrumb; full-window option *(INC-007)*
- [x] Original HTML unchanged (only the hub link points to the Sales Hub)
- [x] Data in PostgreSQL (mm_documents), 16 Oct snapshot loaded (1,662 documents), live updates between tabs
- [x] Backup download and restore (admins), viewers read-only, login required *(checked in a browser)*
- [x] Automatic daily backup to backups/mek-movers/, last 30 kept *(INC-006, checked)*
- [x] One leads list: MEK Movers uses the Sales Hub leads (1,643 after merge), live sync both ways, status changes logged *(INC-008, checked in a browser)*

### Instellingen
- [x] Product constants (price, VAT, specs, shift hours, working days, quote validity, contact e-mail)
- [x] Kans thresholds and scoring weights; weight suggestion learned from approve/reject decisions
- [x] Home base, global monthly caps for Apify and Claude, re-qualify rules
- [x] Users and roles, password reset
- [x] System status (n8n, AI provider, webhooks, KvK) and LAN addresses for colleagues
- [x] Do-not-contact list, retention clean-up

## B.4 Architecture

- [x] Next.js 16, React 19, TypeScript, Tailwind CSS 4
- [x] PostgreSQL 17 + PostgREST 12 in Docker, own login (bcrypt + signed session cookie), Row Level Security *(replaced Supabase on 18 Oct, INC-003)*
- [x] AI agents in the app with Zod-validated structured output
- [x] n8n self-hosted in Docker for schedules and Apify calls
- [x] Apify actors called from n8n with a server-side token
- [x] PDOK Locatieserver for postcode → coordinates, municipality, province
- [x] KvK API support *(optional; only runs when `KVK_API_KEY` is set; not tested without a key)*
- [x] three.js and hand-built SVG charts
- [x] PDF generation (jsPDF in the browser)

## B.5 Search filters

- [x] Area mode: radius / provinces / whole Netherlands (265 coverage tiles of about 13 km)
- [x] Postcode + radius 5 / 10 / 20 / 30 / 50 km
- [x] Provinces multi-select
- [x] Search terms: 12 presets + own terms; agent can suggest new terms
- [x] Segments to include
- [x] Exclusion terms
- [x] Minimum Google reviews
- [x] Open businesses only
- [x] Must have website / phone
- [x] Family business filter
- [x] Minimum kans to queue
- [x] SBI codes *(field shown only with a KvK key)*
- [x] Skip companies in pipeline / rejected / seen in the last N days
- [x] Schedule: off / daily / weekly / every N hours, with a time window
- [x] Budget per run and per month, max companies per run
- [x] Search depth: standard / deep *(added 5 Oct)*
- [x] Web sources: LinkedIn company pages and Dutch logistics news sites via Google search, resolved through Google Maps *(added 5 Oct by a parallel session)*
- [x] Maximum run time setting *(added 5 Oct)*

## B.6 Output per company

- [x] Name, address, postcode + city from the Maps listing
- [x] Province, municipality, lat/lng from PDOK
- [x] Phone, website, Maps link; URLs validated (http/https only)
- [x] Place id, domain, KvK number as dedup keys
- [x] Reviews, rating, categories
- [x] Segment (rules, then agent)
- [x] Distance from the profile's postcode
- [x] Family business (ja / groot / nee / onbekend)
- [x] Fit score 0–100 and kans A/B/C (thresholds in Instellingen)
- [x] 3–5 reasons, each with evidence and source link
- [x] Growth signals (vacancy, new DC, expansion …) with source
- [x] "Waarom" and "aanpak" filled by the agent and shown in the UI
- [x] Contacts with name, role, e-mail, phone, source URL and LinkedIn search link
- [x] Source, run id, first seen, last seen
- [x] CSV export with formula-injection protection

## B.7 Agentic prospecting pipeline

- [x] 1 Plan: profile → term × area pairs; coverage cursor for province / country profiles
- [x] 2 Discover: n8n → `compass/crawler-google-places` per area
- [x] 3 Prefilter: closed, exclusions, outside area; dedup place id → domain → KvK → name + postcode; rule score
- [x] 4 Enrich: `apify/website-content-crawler`, `vdrmota/contact-info-scraper`, `apify/google-search-scraper`
- [x] 5 Qualify: agent verdict; below minimum kans kept as "seen"
- [x] 6 Contacts: best contact by role priority, LinkedIn and Google search links
- [x] 7 Review queue: approve → lead, reject with reason, snooze
- [x] 8 Outreach draft for leads; user edits and sends, or approves sending through n8n + Gmail
- [x] Scheduler every 30 minutes starts due profiles with budget left
- [x] Incremental runs: recently seen places not re-qualified; re-qualify on review growth, new website or after 90 days
- [x] Long scrapes: Apify actors started asynchronously and polled by n8n
- [x] Budget check before every Apify call; actual Apify cost logged per run; Claude cost per call
- [x] Idempotency: runId + batchId, retried batches ignored
- [x] Failure handling: failed steps reported, runs without callback for 30 minutes closed as failed
- [x] Order-safe completion: a run cannot close while a batch is still being processed *(race found and fixed during testing)*

*Checked with: demo mode, mock n8n, real n8n with a mock Apify, and one real Apify run (Helmond, 10 km, 11 places, $0.029).*

## B.8 Agents

- [x] Planner (suggests new search terms)
- [x] Prefilter classifier
- [x] Qualifier with the 7-criterion rubric and evidence
- [x] Contact picker
- [x] Outreach writer
- [x] Versioned prompts; every verdict stored with model, prompt version, input hash, tokens and cost
- [x] Model per agent via environment variables
- [x] Works without an API key: rules mode ("regelmodus")
- [x] Claude API provider *(built; not run — no Anthropic API key yet)*
- [x] Ollama provider for a free local model (qwen2.5:7b) *(added 5 Oct)*
- [ ] Ollama verified end to end *(first test fell back to rules because Node's fetch stopped after 300 s; fixed with streaming, re-test pending)*

## B.9 Data model

- [x] profiles, settings, search_profiles, search_runs, raw_places, companies, company_signals, evaluations, contacts, review_queue, leads, activities, quotes, usage_log
- [x] Extra: run_batches (idempotency), do_not_contact, outreach_drafts, web sources (migration of 5 Oct)
- [x] Row Level Security on every table
- [x] Optimistic locking on leads (version column)
- [x] Quote number sequence

## B.10 Interfaces between app and n8n

- [x] App → n8n discovery webhook (header `x-mek-secret`)
- [x] App → n8n enrich webhook
- [x] App → n8n send-email webhook *(workflow imported, switched off)*
- [x] n8n → app `/api/n8n/results` (Bearer secret)
- [x] n8n → app `/api/n8n/scheduler`
- [x] n8n → app `/api/n8n/budget`
- [x] `/api/health`

## B.11 Fixes for the A.8 findings

- [x] Stored XSS through website and Maps links
- [x] Internal margins shown to customers
- [x] Leads Nederland losing data outside claude.ai
- [x] SheetJS 0.18.5 CVEs (replaced by server-side exceljs)
- [x] Concurrent edits overwriting each other
- [x] No reset / restore, seed reloading
- [x] Fragile import dedup
- [x] ROI: mailto newlines, lease premium mismatch, hours/8 model, quote numbers
- [x] API key in the browser
- [x] Sort bug and CSV formula injection
- [x] Crossdock narrative vs calculator (step text made qualitative)
- [x] UTC dates, status change overwriting "laatste contact"
- [x] Hard-coded constants and inconsistent naming

## B.12 Non-functional requirements

- [x] E-mail + password login (bcrypt hashes in PostgreSQL, httpOnly session cookie); RLS on all tables
- [x] Secrets server-only; Apify token stored only in n8n
- [x] Every webhook checks the shared secret
- [x] Retention: raw scraper data 30 days, unapproved contacts 12 months
- [x] Do-not-contact list checked before outreach; opt-out line in drafts
- [x] No LinkedIn scraping (only Google search results and search links)
- [ ] Legitimate-interest assessment (AVG/GDPR) before go-live *(MEK to do)*
- [ ] Legal check on cold e-mail before automatic sending *(MEK to do)*
- [x] Budgets per run and per month, global caps, usage dashboard
- [x] Cheap prefilter before the Qualifier
- [x] Server-side pagination for leads
- [ ] Load test with 20,000 companies and 2,000 leads *(not done)*
- [x] Run states queued → discovering → enriching → qualifying → done / failed / budget reached
- [x] Dutch UI by default, English as second language *(user request)*
- [x] MEK house style with dark and light theme
- [x] Works at phone width; demo usable on a tablet
- [x] Unit tests: ROI and crossdock formulas (parity at gap 0), rule scoring, dedup keys, URL validation, CSV, n8n contract *(46 passing)*
- [x] End-to-end test: run → review → approve → lead → quote PDF *(Playwright, passing)*
- [ ] Sentry / error monitoring *(cloud only)*

## B.13 Running locally

- [x] Node.js and Docker Desktop installed (no Supabase CLI needed since 18 Oct)
- [x] Database running locally with migrations and seed (`npm run db:start`); data and users moved over from Supabase with `npm run db:import-supabase`
- [x] n8n in Docker, owner account, credentials and 5 workflows imported by `npm run n8n:setup`
- [x] Callbacks from Docker to the app through `host.docker.internal` (SSRF allow-list)
- [x] Demo mode and mock n8n for testing without credit
- [x] `start.ps1` starts everything; README with instructions
- [x] Apify token added and verified *(account on the Free plan)*
- [ ] Windows Firewall rule for colleagues on port 3000 *(needs an administrator; command in README)*
- [ ] Anthropic API key *(optional; Ollama or rules mode used meanwhile)*

## B.14 Cloud deployment

- [ ] Cloud PostgreSQL (EU) + PostgREST and migrations
- [ ] App on Vercel (EU) or a VPS
- [ ] n8n on an EU VPS with HTTPS
- [ ] Monitoring and uptime check on `/api/health`
- [ ] CI in GitHub Actions

## B.15 Build phases

- [x] 0 Foundation: app, database, auth, roles, house style, settings
- [x] 1 Leads: merged Leads and Overzicht, seed, import/export, activity log
- [x] 2 Sell: ROI & Offertes with saved quotes and PDF; Demo (2D + 3D)
- [x] 3 Discover: n8n discovery + Apify Google Maps + prefilter + review queue
- [x] 4 Qualify: enrichment workflows + Qualifier and Contact agents + evaluations log
- [x] 5 Continuous: scheduler, coverage cursor, budgets, usage dashboard, failure handling
- [ ] 6 Cloud
- [ ] 7 Outreach sending *(drafts and approval built; Gmail not connected, waits for the legal check)*

## B.16 Acceptance criteria

- [x] 1 Every Part A feature is available or consciously dropped *(dropped: Vite single-file build of the 3D app)*
- [x] 2 Default profile on postcode 5705 returns logistics companies with no duplicates and no excluded categories
- [x] 3 Each queued company shows a fit score, a kans, at least 3 reasons with linked evidence, "waarom" and "aanpak"
- [x] 4 Spend per run is visible for Apify and Claude; budget checked before every Apify call *(one actor run in progress can overshoot slightly)*
- [x] 5 Running the same profile twice adds no duplicate companies or leads
- [ ] 6 A scheduled profile runs unattended for 7 days and its coverage cursor moves *(needs a week of running)*
- [x] 7 The internal AaS margin is never visible in presentation mode or to viewers *(built; not checked in a browser)*
- [x] 8 Runs fully on the laptop with PostgreSQL + PostgREST, n8n in Docker and the app
- [ ] 8b Same stack in the cloud with only environment changes

## B.17 Decisions still open (for MEK)

- [ ] Start area: Noord-Brabant only or the whole Netherlands *(both supported)*
- [ ] Monthly budget for Apify and Claude in the test period *(defaults: $50 + $50)*
- [ ] Buy KvK API access
- [ ] Qualifier model: Claude Opus 5.5, Sonnet 5.5, or local Ollama *(current: Ollama, falls back to rules)*
- [ ] Who approves leads, and may A-leads skip the queue *("approve all A" button exists)*
- [ ] n8n in the cloud: VPS or n8n Cloud
- [ ] Legal check on contact data and cold e-mail
- [x] Product name "Mek-Rider" used everywhere

---

## Next steps

1. Re-test the Ollama provider after the streaming fix, and compare its scores with rules mode on the real Helmond companies.
2. Run a deep-search profile with a small budget to compare result quality with a standard run.
3. Put one profile on a daily schedule and check criterion 6 after a week.
4. Add the firewall rule so colleagues can open the app.
5. Decide the open B.17 items, then plan the cloud move (B.14).
