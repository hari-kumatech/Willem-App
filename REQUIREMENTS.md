# MEK Mover apps – requirements and functions

What the apps in this project must do, and a short description of each function. The detailed, line-by-line
build status of the main app is in
[mek-sales-hub/REQUIREMENTS_STATUS.md](Willem%20App/Kumatech%20_customers%20_App/mek-sales-hub/REQUIREMENTS_STATUS.md);
the full specification is the Word document *MEK Sales Hub – Requirements and System Specification* in `Willem App/`.
Changes over time are logged in [CHANGELOG.md](CHANGELOG.md).

*Last updated: 18 October 2026 (INC-003: database moved from Supabase to plain PostgreSQL; INC-005: MEK Movers apps added to the Sales Hub; INC-008: one leads list).*

---

## 1. Purpose

MEK sells the **Mek-Rider** (MRTF01), a pallet truck that moves two pallets side by side, to logistics companies
with crossdock and distribution activity in the Netherlands. The apps support the whole sales process:

1. **Find** companies that are likely to need a Mek-Rider (crossdock, DC, 3PL, food / fresh logistics, fulfilment).
2. **Qualify** them: a fit score, a chance class A/B/C, reasons with evidence, and the best contact person.
3. **Follow up** leads through a pipeline, from first contact to won or lost.
4. **Sell**: show the savings (ROI, crossdock demo, 3D product view) and send a numbered quote as a PDF.

## 2. Apps in this project

| App | Folder | Status | In short |
|---|---|---|---|
| **MEK Sales Hub** (main app) | `Willem App/Kumatech _customers _App/mek-sales-hub/` | in use, local | One app with one login for leads, prospect search, ROI and quotes, demos, and the MEK Movers apps. |
| MEK Movers – local version | `incremental_features/mek-movers-apps/` | merged into the Sales Hub (INC-005) | Stand-alone copy of the MEK Movers dashboard, savings calculator and savings video, with a local JSON database. |
| MEK-Movers-Sales | `Willem App/MEK-Movers-Sales/` | reference | Original plain-HTML tools: leads dashboard, ROI calculator, crossdock visualisation, prospect finder, product files. |
| Mek-Rider 3D | `Willem App/mek-rider-3d/` | reference | Original three.js / Vite 3D product view and crossdock race (now part of the Sales Hub). |
| Mek-Rider leads Nederland | `Willem App/mek-rider-leads-nederland/` | reference | Original single-file leads dashboard with the 55 starting leads (imported into the Sales Hub). |
| Hackathon demo app | `Willem App/hari_hackathon demo app/` | separate project | *YoungCreator2026 / Job Hunter*: not part of MEK sales; has its own git repository. |

## 3. Users and roles (Sales Hub)

| Role | May do |
|---|---|
| **Admin** | Everything, including settings, product constants, budgets, users and the internal AaS margin. |
| **Sales** | Leads, review queue, search profiles, runs, ROI and quotes. |
| **Viewer** | Read only. |

The first account becomes admin; admins add colleagues with a role and a temporary password.
A presentation mode hides margins, scores and notes on customer-facing screens.

## 4. Functional requirements and functions (Sales Hub)

### 4.1 Overzicht (overview)
- National KPIs: total leads, open A-leads, open pipeline value, quotes outstanding, won, win ratio.
- 12 province tiles plus "no province", newest agent finds, latest runs, open review count, actions due today.

### 4.2 Leads
- **One leads list** for the whole app (since INC-008): the MEK Movers dashboard uses the same leads, changes show up
  live on both sides. 1,643 leads after merging the Sales Hub and MEK Movers lists.
- Pipeline with six statuses; KPI tile per status; filters (status, A/B/C, family business, city, province, search).
- Inline status change with activity log; a reason is required for "lost". Next action with due date (overdue in red).
- Contact cell with phone, e-mail, website, Maps and LinkedIn **search links** (no LinkedIn scraping).
- Lead detail: agent assessment, contacts, activity log, quotes, e-mail draft.
- Import Excel / CSV / JSON (deduplicated on name + postcode); export Excel, CSV (formula-injection safe), JSON.
- Output fields wanted per lead (from *Willem app requirements.xlsx*): company name, province, city, A/B/C class,
  industry, revenue, employees, locations, contact person, job title, e-mail, phone, website, LinkedIn,
  crossdock activity (yes/no), estimated pallet movements per day, potential ROI, lead status, last contact,
  next action, notes.

### 4.3 Prospect Radar (agentic prospecting)
- **Search profiles**: area (postcode + radius 5–50 km, provinces, or the whole Netherlands in 265 tiles), search
  terms (presets from the requirements sheet, such as *crossdock, distributiecentrum, 3PL logistiek, vers logistiek,
  e-fulfilment*, plus your own), exclusions, minimum reviews, must have website / phone, minimum A/B/C, schedule,
  and budgets per run and per month.
- **Pipeline per run**: plan → discover (Google Maps via Apify, run by n8n) → prefilter and deduplicate (place id →
  domain → KvK → name + postcode) → enrich (website, contacts, growth signals) → qualify (AI agent or rules) →
  pick contact → **review queue**.
- **Review queue**: approve (becomes a lead), reject with a reason, or snooze. Nothing is e-mailed without approval.
- **Agents**: planner, prefilter, qualifier (7-criterion rubric with evidence), contact picker, outreach writer.
  AI provider: Claude API, free local Ollama, or rules mode without any AI.
- Costs per run (Apify and AI) are logged; budget checked before every Apify call; runs without a sign of life are closed.

### 4.4 ROI & Offertes (quotes)
- 4-step wizard: lead details, route and efficiency, costs (buy / lease / as-a-service), comparison.
- One calculation module for the screen, the comparison table and both PDFs.
- Quotes saved per lead, numbered `MEK-YYYY-NNNN`; quote PDF and comparison PDF in the UI language.
- The internal AaS margin is never shown to viewers, in presentation mode or in customer PDFs.

### 4.5 Demo
- Crossdock 2D: two animated lanes and the calculator "Uw hal, uw volume".
- Mek-Rider 3D: product view (forks 1,198 → 1,998 mm, 0–2 pallets) and crossdock race; recording mode.
- Uses the same product constants as the ROI module; hall data can be saved on a lead.

### 4.6 MEK Movers (dashboard, besparingscalculator, besparingsvideo)
Added in INC-005; since INC-007 every section is its own item in the main menu (group **MEK Movers**, with
Besparingscalculator and Besparingsvideo under **Klantpresentatie** and Back-up & herstel under **Beheer**), each with
its own URL under `/mek-movers/`. The original apps, unchanged, with their data in the Sales Hub database (table
`mm_documents`) and live updates between open tabs.
- **Dashboard** (company dashboard): chain from lead to service with KPIs; goals per year (machines / revenue);
  customers with ROI tab and history (linked to the shared leads, §4.2), quotes with quote generator and PDF,
  orders with delivery note PDF, planning (week view), demos, machines, service, stock (articles), invoices,
  base settings and goals for 2026 and 2027; Excel import / export.
- **Besparingscalculator**: customer-facing savings calculator (pallets per day, distances, load times, speed) with
  a 3D simulation of the Mek-Rider, number of Mek-Riders needed and payback.
- **Besparingsvideo**: savings video for a customer from the same inputs, with chapters and download (small file
  for WhatsApp / e-mail or full quality).
- **Start & back-up**: download a full backup, or restore one (admins only; the previous state is saved first).
  An automatic backup is also written every day to `backups/mek-movers/` (last 30 days kept).
- Viewers can look but not save. Leads are the shared Sales Hub leads (§4.2); the dashboard's own Leads page opens the Sales Hub Leads page.

### 4.7 Instellingen (settings)
- Product constants, A/B/C thresholds and scoring weights (with suggestions learned from approve / reject).
- Home base, global monthly caps, users and roles, password reset, system status, do-not-contact list, data retention.

### 4.8 Main menu (since INC-007)

| Group | Items |
|---|---|
| Sales Hub | Overzicht, Leads, Prospect Radar, ROI & Offertes |
| MEK Movers (collapsible) | Dashboard, Basisgegevens · Verkoop: Klanten, Offertes, Demo's · Uitvoering: Orders, Planning · Service: Machines, Service, Voorraad · Financieel: Facturen |
| Klantpresentatie | Demo, Besparingscalculator, Besparingsvideo |
| Beheer | Back-up & herstel, Instellingen |

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Local first | Everything runs on one Windows laptop; colleagues use `http://<laptop-ip>:3000` on the office network. |
| Free tools | Database is **PostgreSQL + PostgREST** (free, open source) in Docker: no Supabase account or CLI (since INC-003). n8n self-hosted. Ollama as free AI option. Only Apify and the optional Claude API cost money. |
| Security | Login with e-mail + password (bcrypt), httpOnly session cookie; Row Level Security on every table; secrets server-side only; every webhook checks a shared secret; the database ports listen on localhost only. |
| Privacy (AVG/GDPR) | Raw scraper data deleted after 30 days, contacts of unapproved companies after 12 months; do-not-contact list; no LinkedIn scraping. Legitimate-interest assessment and legal check on cold e-mail still to do by MEK. |
| Cost control | Budgets per run and per month, global caps, cheap prefilter before the expensive qualifier, usage dashboard. |
| Language and style | Dutch UI by default, English as second language; MEK house style, dark and light theme; works at phone width. |
| Quality | Unit tests (formulas, scoring, dedup, URL / CSV safety, n8n contract) and a Playwright end-to-end test. |
| Data safety | `npm run db:backup` / `db:restore`; migrations in `db/migrations` are applied in order and recorded. |

## 6. Architecture (Sales Hub)

```
Browser ──► Next.js 16 app (:3000) ──► PostgREST (:54331) ──► PostgreSQL 17 (:54332)      all in Docker except the app
                 │   ▲
                 ▼   │ callbacks (Bearer secret)
               n8n (Docker, :5678) ──► Apify actors (Google Maps, website, contacts, Google search)
                 │
AI: Claude API | Ollama (local) | rules mode         Geo: PDOK Locatieserver          Optional: KvK API
```

## 7. Open items

- Cloud deployment (EU), monitoring, CI.
- Outreach sending through Gmail (built, switched off until the legal check).
- Map view of found companies; load test with 20,000 companies; Ollama end-to-end verification.
- Decisions for MEK: start area, monthly budgets, KvK access, qualifier model, who approves leads.
