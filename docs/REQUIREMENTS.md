# MEK Sales Hub – requirements and functions

The one requirements file of the project: what the app must do and whether it is built. Every function found in the
code is listed, checked against the code on **18 October 2026**.

- `[x]` built and working. *Italics* say how it was checked, or a limit.
- `[ ]` not built yet, or waiting for a decision or an outside step.

Sources: *MEK Sales Hub – Requirements and System Specification* v0.1 / v0.2 (Part B) and *Willem app
requirements.xlsx*, both in [specification/](specification/). Changes over time: [CHANGELOG.md](../CHANGELOG.md).
New functions: add a line here (see [ADDING-FEATURES.md](ADDING-FEATURES.md)).

---

## 1. Purpose

MEK sells the **Mek-Rider** (MRTF01), a pallet truck that moves two pallets side by side, to logistics companies with
crossdock and distribution activity in the Netherlands. The app supports the whole chain:

1. **Find** companies likely to need a Mek-Rider (crossdock, DC, 3PL, food / fresh logistics, fulfilment).
2. **Qualify** them: fit score, chance class A/B/C, reasons with evidence, best contact person.
3. **Follow up** leads through a pipeline, from first contact to won or lost.
4. **Sell**: show the savings (ROI, crossdock demo, 3D, savings calculator and video) and send a numbered quote.
5. **Deliver and service** (MEK Movers): customers, orders, planning, machines, service, stock and invoices.

## 2. Goals

- [x] One application with one login, one database and one house style for leads, prospecting, ROI, demos and the MEK Movers apps
- [x] Continuous prospecting: saved search profiles run on a schedule, find new companies, refresh known ones, never add duplicates
- [x] Good customers, not just many: every company gets a fit score 0–100, a kans A/B/C, reasons and an approach
- [x] Human in control: new prospects land in a review queue; nothing is e-mailed without approval
- [x] Local first: the whole system runs on one Windows laptop, started with one double-click
- [ ] Same code deployed to a server or the cloud *(§13)*

## 3. Users, roles and general

- [x] **Admin**: everything, including settings, product constants, budgets, users and the internal AaS margin
- [x] **Sales**: leads, review queue, search profiles, runs, ROI and quotes
- [x] **Viewer**: read only (also in the MEK Movers apps: "look but not save" notice)
- [x] First account becomes admin; admins add colleagues with a role and a temporary password; password reset
- [x] Last admin cannot be removed or downgraded
- [x] Presentation mode (switch in the header): hides margins, scores and notes on ROI, Overzicht, Leads and Prospect Radar *(the demo screens show nothing internal)*
- [x] Dark / light theme switch; Dutch / English language switch (Dutch by default)
- [x] Main menu in groups: **Sales Hub** (Overzicht, Leads, Prospect Radar, ROI & Offertes) · **MEK Movers**, collapsible (Dashboard, Basisgegevens; Verkoop: Klanten, Offertes, Demo's; Uitvoering: Orders, Planning; Service: Machines, Service, Voorraad; Financieel: Facturen) · **Klantpresentatie** (Demo, Besparingscalculator, Besparingsvideo) · **Beheer** (Back-up & herstel, Instellingen)
- [x] Review-queue count badge on the Prospect Radar menu item; indicators for demo mode and rules mode
- [x] Works at phone width; demo usable on a tablet

## 4. Overzicht (overview)

- [x] KPI cards: total leads (with open A-leads), open pipeline, quotes outstanding, won, win ratio
- [x] 12 province tiles plus "Zonder provincie" (province from PDOK), each opening the leads of that province
- [x] Newest agent finds, latest runs, open review count
- [x] Actions due today or earlier

## 5. Leads

One leads list for the whole app: the MEK Movers dashboard uses the same leads (§10). 1,643 leads after merging.

- [x] Six statuses in pipeline order; KPI tile per status (count, € sum or A/B/C split); clicking a tile filters
- [x] Value split bar, open pipeline, win ratio
- [x] Filters: status, kans A/B/C, family business, city, province, live search (also in notes, "waarom", "aanpak", next action); clear-filters button
- [x] Sort on every column except Contact; server-side filtering and pagination
- [x] Inline status change with activity log; a reason is required for "verloren"
- [x] Contact cell: phone, e-mail, website, Maps, LinkedIn search links for 4 roles + Google site:linkedin search *(no LinkedIn scraping)*
- [x] Lead form with all fields; quote value = number × list price until typed; two-click delete
- [x] Warning when an edit moves a lead to another province; message when someone else changed the lead meanwhile (optimistic locking)
- [x] Next action with due date; overdue shown in red
- [x] Lead detail page: agent assessment, contacts, activity log (add call / mail / meeting / note), quotes, e-mail draft
- [x] From a lead: re-qualify ("Opnieuw beoordelen"), make a quote ("Maak offerte (ROI)"), open the demo with the lead's hall
- [x] Import Excel / CSV / JSON (server-side, 5 MB limit, hyperlinks preferred, Dutch status mapping, dedup on name + postcode); province split reported after import
- [x] Export Excel (MEK_Leads_crossdock.xlsx layout), CSV (formula-injection safe), JSON; export follows the selected province
- [x] JSON restore (Instellingen, admin)
- [x] Province routing (`/leads?provincie=…`) with breadcrumb
- [x] 55 original leads imported by a seed script

### 5.1 Lead fields wanted (from *Willem app requirements.xlsx*)

- [x] Company name, province, city, A/B/C class, industry (segment), contact person, job title, e-mail, phone, website, lead status, last contact, next action, notes *(province is in the CSV export, not in the Excel export)*
- [x] LinkedIn: search links only, on purpose (no LinkedIn scraping)
- [ ] Estimated pallet movements per day as a lead column *(now only in the hall data saved from the demo)*
- [ ] Potential ROI on the lead *(now only in the saved quotes)*
- [ ] Revenue, employees, number of locations
- [ ] Crossdock activity yes / no *(now only as a growth signal on the company)*

## 6. Prospect Radar (agentic prospecting)

### 6.1 Screens
- [x] Tabs: search profiles, runs, review queue, all companies, costs
- [x] Profile page: "Nu zoeken" with an area for this run, coverage progress, agent-suggested search terms, cost estimate, pause / activate, delete
- [x] Run detail page: plan, counts, filtered-out reasons, batches, costs; refreshes while running
- [x] Review queue: approve (→ lead), reject with a fixed reason, snooze; "approve all A"; filter and sort on kans
- [x] Company detail page with evidence, signals and contacts; re-qualify
- [x] All companies: search, state filter, pagination, CSV export
- [x] Costs: per run, per profile and per agent (Apify and AI)
- [ ] Map view of found companies

### 6.2 Search filters (per profile)
- [x] Area: postcode + radius (5 to 200 km), provinces, or the whole Netherlands (265 coverage tiles of about 13 km, a few tiles per run)
- [x] Search terms: 12 presets + own terms; the agent can suggest new terms
- [x] Segments to include; exclusion terms
- [x] Minimum Google reviews; open businesses only; must have website / phone; family business filter
- [x] Minimum kans to queue
- [x] SBI codes *(field shown only with a KvK key)*
- [x] Skip companies in pipeline / rejected / seen in the last N days
- [x] Schedule: off / daily / weekly / every N hours, with a time window
- [x] Budget per run and per month; max companies per run; places per search; enrichment on / off
- [x] Search depth standard / deep; maximum run time
- [x] Web sources: LinkedIn company pages and Dutch logistics news sites via Google search, resolved through Google Maps

### 6.3 Output per company
- [x] Name, address, postcode, city from the Maps listing; province, municipality, lat/lng from PDOK
- [x] Phone, website, Maps link; URLs validated (http/https only)
- [x] Place id, domain, KvK number as dedup keys
- [x] Reviews, rating, categories; segment (rules, then agent); distance from the profile's postcode
- [x] Family business (ja / groot / nee / onbekend)
- [x] Fit score 0–100 and kans A/B/C (thresholds in Instellingen); 3–5 reasons, each with evidence and source link
- [x] Growth signals (vacancy, new DC, expansion …) with source
- [x] "Waarom" and "aanpak" filled by the agent
- [x] Contacts with name, role, e-mail, phone, source URL and LinkedIn search link, ranked by role priority
- [x] Source, run id, first seen, last seen

### 6.4 Pipeline per run
- [x] 1 Plan: profile → term × area pairs; coverage cursor for province / country profiles
- [x] 2 Discover: n8n → Apify `compass/crawler-google-places` per area
- [x] 3 Prefilter: closed, exclusions, outside area; dedup place id → domain → KvK → name + postcode; rule score
- [x] 4 Enrich: `apify/website-content-crawler`, `vdrmota/contact-info-scraper`, `apify/google-search-scraper`
- [x] 5 Qualify: agent verdict; below the minimum kans kept as "seen"
- [x] 6 Contacts: best contact, LinkedIn and Google search links
- [x] 7 Review queue
- [x] 8 Outreach draft for leads; user edits and sends, or approves sending through n8n + Gmail
- [x] Scheduler every 30 minutes starts due profiles with budget left
- [x] Incremental runs: recently seen places not re-qualified; re-qualify on review growth, new website or after 90 days
- [x] Long scrapes started asynchronously and polled by n8n
- [x] Budget checked before every Apify call; actual Apify cost logged per run; AI cost per call; global monthly caps
- [x] Idempotency: runId + batchId, retried batches ignored
- [x] Failure handling: failed steps reported; runs without any sign of life for **90 minutes** closed as failed
- [x] A run cannot close while a batch is still being processed
- [x] Run states queued → discovering → enriching → qualifying → done / failed / budget reached

*Checked with: demo mode, mock n8n, real n8n with a mock Apify, and one real Apify run (Helmond, 10 km, 11 places, $0.029).*

### 6.5 Agents
- [x] Planner (suggests search terms), prefilter classifier, qualifier, contact picker, outreach writer
- [x] Qualifier rubric of 7 criteria with evidence *(6 scored by the agent; distance calculated by the app)*
- [x] Versioned prompts; every verdict stored with model, prompt version, input hash, tokens and cost
- [x] Model per agent via environment variables
- [x] Works without an API key: rules mode ("regelmodus")
- [x] Claude API provider *(built; not run, no Anthropic API key yet)*
- [x] Ollama provider for a free local model (qwen2.5:7b)
- [ ] Ollama verified end to end *(re-test pending after the streaming fix)*

## 7. ROI & Offertes (quotes)

- [x] 4-step wizard: lead details, route & efficiency, costs (Koop / Lease / AaS, or all three), comparison
- [x] Defaults give 18.8% efficiency, €8,460 per year, about 12 months payback of the extra cost
- [x] One calculation module for screen, comparison table, charts and both PDFs
- [x] Quotes saved per lead, numbered by a database sequence (MEK-YYYY-NNNN)
- [x] Quote PDF and comparison PDF, in the UI language
- [x] Saved-quotes page (who made it, reprint)
- [x] Request by e-mail to the contact address (mailto)
- [x] Internal AaS margin only for Admin / Sales, hidden in presentation mode, never in the customer PDF *(built; not checked in a browser)*
- [x] Prefill from a lead (`/roi?lead=…`), including hall data saved from the demo

## 8. Demo

- [x] Crossdock 2D: two animated lanes, process steps, calculator "Uw hal, uw volume" (defaults 26.1%, 3.0 h, 0.38 FTE); pause, reset, tempo
- [x] Mek-Rider 3D product view: forks 1,198 → 1,998 mm (extend / retract), load selector 0–2 pallets, auto-rotate
- [x] 3D crossdock race with speed control and result panel; recording mode
- [x] Lead picker; hall data saved on the lead (logged as an activity); "Open ROI met deze hal"
- [x] Same product constants as ROI (from Instellingen)

## 9. Instellingen (settings)

- [x] Product constants: price, VAT, specs (forks, speed, capacity), competitor truck price, shift hours, working days, quote validity, contact e-mail
- [x] Kans thresholds and scoring weights; weight suggestions learned from approve / reject decisions
- [x] Home base, global monthly caps for Apify and AI, re-qualify rules
- [x] Users and roles, password reset
- [x] System status (n8n, AI provider and model per agent, webhooks, KvK, link to `/api/health`) and the LAN addresses for colleagues
- [x] Do-not-contact list; data retention clean-up (also on demand)
- [x] JSON restore of leads (admin)

## 10. MEK Movers (company dashboard)

The original claude.ai HTML apps in `app/public/mek-movers/`, every section its own menu item and URL under
`/mek-movers/…`, with breadcrumb and "open in full window". Data in the Sales Hub database (table `mm_documents`),
live updates between open tabs. Viewers look but cannot save.

### 10.1 Start
- [x] Buttons "Nieuwe klant" and "Nieuwe offerte"
- [x] Chain tiles: leads in conversation, open quotes (€), orders in progress (€), machines to deliver (+ late), machines in the field, open service (+ maintenance this month); a click opens the list
- [x] Goals panel: goal vs actual per month (machines and revenue), "achter op schema" / "doel gehaald", pipeline shown hatched
- [x] "Vandaag opvolgen": quotes due for follow-up, with "Morgen" (postpone) and "Opvolgen"
- [x] "Komende 14 dagen": agenda preview
- [x] "Vraagt aandacht": overdue invoices, late orders, stock shortages and below-minimum stock, open service, maintenance due, warranty ending, order ready to deliver, quote won, demo overdue, deposit not received, reservation to release
- [x] Production, stock and machines: in production, ready, in demo, at customers, to build, free to reserve
- [x] Sales per financing type; recurring revenue for the next 12 months and contract value still to come
- [x] Attention badges on the menu: quotes to follow up, open service, stock short, overdue invoices

### 10.2 Basisgegevens
- [x] Price per Mek-Rider; lease interest and term; maintenance contract price and term; as-a-service monthly price and minimum term
- [x] Lead time, quote validity, warranty; follow-up after N workdays
- [x] Payment options (name + quote text), one default; add / delete
- [x] Goals per year and month (machines, revenue); "Verdeel over 12 maanden"

### 10.3 Verkoop
- [x] **Leads**: the shared Sales Hub leads (§5); the dashboard's own Leads page opens the Sales Hub Leads page
- [x] **Offerte maken** (5 steps: customer and salesperson, situation, calculation, offer with Koop / Koop+onderhoud / Lease / As-a-service, discount and extra lines, PDF with automatic number, cover letter, savings and signature block); save as draft
- [x] **Klanten**: branches, contacts, ROI per year and payback, machines in the field, revenue; tabs Gegevens, ROI-situatie (live outcome, advised number, 4 financing types compared, "Offerte maken voor", savings video for this customer), Historie (timeline); plan a visit or demo, new quote
- [x] **Offertes**: Concept → Verstuurd → Gewonnen / Verloren (also stored on the lead); follow-up dialog with notes, outcome and history; reserve machines; confirm order; totals open, won, chance
- [x] **Demo's**: demo machine, customer, branch, dates, outcome positive / doubt / negative, findings; Gepland / Loopt / Afgerond; "Maak offerte" after a positive demo
- [ ] Quote PDF attachments (technical datasheet, one-pager) *(mentioned in the PDF, not attached)*
- [ ] VAT lines on quotes *(all amounts excl. VAT)*

### 10.4 Uitvoering
- [x] **Orders**: number OR-YYYY-NNN; Gereserveerd → Besteld → In productie → Gereed voor levering → Geleverd → In bedrijf genomen (or Geannuleerd); financing type, linked machines, expected delivery = order date + lead time, deposit received; make invoice, plan delivery, delivery note PDF with acceptance checklist and signatures; totals order book, to deliver, late, reserved
- [x] **Planning**: visit, delivery, commissioning, service visit, demo, production ready, quote follow-up, other; week view, day view and list; past items on request; automatic entries for deliveries, demos, maintenance and follow-ups; visit report and next action

### 10.5 Service
- [x] **Machines**: In productie, Op voorraad, Demomachine, Verkocht, Lease, As-a-service; filters ready to deliver, reserved, free; serial number, type, reservation, customer, warranty, maintenance and inspection dates, hour meter; report ready (one or many), add a range of serial numbers, report service
- [x] **Service**: maintenance, fault, warranty claim, periodic inspection; Open / Gepland / Afgerond; cost and parts used; plan a visit; totals open, planned, faults this year
- [x] **Voorraad**: bill of materials MRTF01, spare parts, complete machines; needed for orders, shortage, buildable with current stock, stock value; filter below minimum

### 10.6 Financieel
- [x] **Facturen**: number F-YYYY-NNN; one-off, deposit, monthly term, service; due date = invoice date + 30 days; Concept / Open / Betaald; mark paid; totals outstanding, overdue, invoiced this year
- [ ] Invoice PDF *(invoices are records only)*

### 10.7 Flow and data
- [x] Lead → Klant → Offerte → reserve machines → Order → Planning (delivery) → delivery note → machine in the field → Service → Factuur; positive Demo → Offerte
- [x] Lists everywhere: search, status chips, sortable columns, totals, create / edit / two-click delete
- [x] Excel import of leads
- [ ] Excel export of the MEK Movers lists *(full backup as JSON is available, §10.10)*

### 10.8 Besparingscalculator (customer-facing)
- [x] Inputs: pallets per day, distances, load time, speed, driving hours, usage, current trucks, workdays, staff cost
- [x] Outcome: efficiency gain, savings per year, advised number of Mek-Riders, fewer trips per day, calculation details
- [x] 3D race standard truck vs Mek-Rider (pause, restart, overview / top / ride-along camera, tempo); 2D fallback
- [x] Buy, lease or as-a-service: cumulative chart, payback, comparison table
- [x] "Vraag een offerte aan" / "Plan een demo" by e-mail to sales
- [ ] Prices from Basisgegevens *(calculator and video use fixed prices: €22,500, lease 6% / 60 months, AaS €800 per month)*
- [ ] Requests from the calculator stored as a lead *(now only by e-mail)*

### 10.9 Besparingsvideo
- [x] Inputs as the calculator, video updates live; 1280×720, about 56 s, chapters Logo, Intro, Race, Per pallet, Per dag, Capaciteit, Besparing, Einde
- [x] Pause / play, restart, timeline
- [x] Download MP4 (or WebM) in three qualities: small 960×540 (±3 MB, for WhatsApp / e-mail), normal and high 1280×720
- [x] Per-customer video from the customer's ROI tab, file named after the customer

### 10.10 Back-up & herstel
- [x] Download a full backup (JSON) *(everyone with read access)*
- [x] Restore a backup (admins only; the current state is saved first)
- [x] Automatic daily backup to `app/backups/mek-movers/`, last 30 days kept
- [x] Record counts per collection

## 11. Architecture

- [x] Next.js 16, React 19, TypeScript, Tailwind CSS 4
- [x] PostgreSQL 17 + PostgREST 12 in Docker (no Supabase); own login with bcrypt passwords and a signed httpOnly session cookie
- [x] Row Level Security on every table
- [x] Data model: profiles, settings, search_profiles, search_runs, run_batches, raw_places, companies, company_signals, evaluations, contacts, review_queue, leads (+ `extra` for MEK Movers fields), activities, quotes, usage_log, do_not_contact, outreach_drafts, web_leads, mm_documents
- [x] Optimistic locking on leads; quote number sequence
- [x] AI agents in the app with Zod-validated structured output
- [x] n8n self-hosted in Docker for schedules and Apify calls; Apify token stored only in n8n
- [x] Interfaces: app → n8n discovery, enrich and send-email webhooks (`x-mek-secret`); n8n → app `/api/n8n/results`, `/scheduler`, `/budget` (Bearer secret); `/api/health`; MEK Movers API `/mek-movers/api/db`, `/events` (live), `/export`, `/import`; `/api/export/leads` and `/api/export/companies`
- [x] PDOK Locatieserver for postcode → coordinates, municipality, province
- [x] KvK API *(optional; only with `KVK_API_KEY`; not tested without a key)*
- [x] three.js, hand-built SVG charts, PDFs with jsPDF in the browser

```
Browser ──► Next.js app (:3000) ──► PostgREST (:54331) ──► PostgreSQL (:54332)        database in Docker
                 │   ▲
                 ▼   │ callbacks (Bearer secret)
               n8n (Docker, :5678) ──► Apify actors (Google Maps, website, contacts, Google search)
AI: Claude API | Ollama (local) | rules mode        Geo: PDOK        Optional: KvK API
```

## 12. Non-functional requirements

- [x] Secrets server-side only; every webhook checks the shared secret; database ports on localhost only
- [x] Retention: raw scraper data 30 days, contacts of unapproved companies 12 months
- [x] Do-not-contact list checked before outreach; opt-out line in drafts
- [x] No LinkedIn scraping (only Google search results and search links)
- [ ] Legitimate-interest assessment (AVG/GDPR) before go-live *(MEK to do)*
- [ ] Legal check on cold e-mail before automatic sending *(MEK to do)*
- [x] Cost control: budgets per run and per month, global caps, cheap prefilter before the qualifier, usage dashboard
- [x] Server-side pagination for leads
- [ ] Load test with 20,000 companies and 2,000 leads
- [x] MEK house style with dark and light theme
- [x] Unit tests: ROI and crossdock formulas, rule scoring, dedup keys, URL / CSV safety, n8n contract, coverage tiles, web sources, PDF *(51 passing on 18 Oct)*
- [x] End-to-end test: run → review → approve → lead → quote PDF (Playwright)
- [x] Backups: `npm run db:backup` / `db:restore`; migrations applied in order and recorded
- [ ] Error monitoring (Sentry)

## 13. Running and deployment

- [x] One double-click start (`Start MEK Sales Hub.cmd`): Docker, database with migrations, n8n, build only when changed, browser opens
- [x] Runs on a new laptop with only Docker Desktop and Node.js installed; secrets generated on first start
- [x] n8n in Docker with owner account, credentials and 5 workflows (`npm run n8n:setup`)
- [x] Demo mode and mock n8n / mock Apify for testing without credit
- [x] Apify token added and verified *(Free plan)*
- [ ] Windows Firewall rule for colleagues on port 3000 *(needs an administrator; command in app/README.md)*
- [ ] Anthropic API key *(optional; Ollama or rules mode meanwhile)*
- [ ] Hosting on a company server behind the IXON VPN for a few users
- [ ] Cloud: PostgreSQL (EU) + PostgREST, app and n8n on an EU host with HTTPS, uptime check on `/api/health`, CI

## 14. Acceptance criteria

- [x] 1 Every Part A feature is available or consciously dropped *(dropped: Vite single-file build of the 3D app)*
- [x] 2 Default profile on postcode 5705 returns logistics companies with no duplicates and no excluded categories
- [x] 3 Each queued company shows a fit score, a kans, at least 3 reasons with linked evidence, "waarom" and "aanpak"
- [x] 4 Spend per run visible for Apify and AI; budget checked before every Apify call *(one actor run in progress can overshoot slightly)*
- [x] 5 Running the same profile twice adds no duplicate companies or leads
- [ ] 6 A scheduled profile runs unattended for 7 days and its coverage cursor moves *(needs a week of running)*
- [x] 7 The internal AaS margin is never visible in presentation mode or to viewers *(built; not checked in a browser)*
- [x] 8 Runs fully on the laptop with PostgreSQL + PostgREST, n8n in Docker and the app
- [ ] 8b Same stack on a server or in the cloud with only environment changes

## 15. Decisions still open (for MEK)

- [ ] Start area: Noord-Brabant only or the whole Netherlands *(both supported)*
- [ ] Monthly budget for Apify and AI in the test period *(defaults: $50 + $50)*
- [ ] Buy KvK API access
- [ ] Qualifier model: Claude, or local Ollama *(current: Ollama, falls back to rules)*
- [ ] Who approves leads, and may A-leads skip the queue *("approve all A" exists)*
- [ ] Where n8n and the app are hosted (company server behind IXON, VPS, n8n Cloud)
- [ ] Legal check on contact data and cold e-mail
- [x] Product name "Mek-Rider" used everywhere

## 16. Known inconsistencies to fix

- [ ] Phone number differs: 0492-238010 (dashboard and PDFs) vs 0492 - 760 280 (besparingscalculator)
- [ ] Two price settings: Sales Hub Instellingen (ROI, demo) and MEK Movers Basisgegevens (dashboard quotes) are separate
- [ ] The n8n scheduler note still says runs are closed after 30 minutes (the app uses 90)
