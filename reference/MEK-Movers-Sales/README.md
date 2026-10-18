# MEK Movers Sales – local version

All tools are plain HTML files: no build step, no server required.
Open any `index.html` in Chrome, Edge or Firefox.

## Contents

| Folder | What it is |
| --- | --- |
| `leads-dashboard/` | Leads dashboard (prospects → offers), A/B/C scoring, LinkedIn search buttons, Excel import. |
| `roi-calculator/` | Mek-Rider payback (ROI) calculator with PDF export. |
| `crossdock-visualisatie/` | Interactive crossdock comparison: standard EPT vs Mek-Rider. |
| `prospect-zoeker/` | Find logistics companies by postcode via Google Maps (needs your own API key). |
| `bestanden/` | Datasheet PDF, one-pager PDF, lead list (Excel), top-view drawings, logo, dimension drawing. |

## Leads dashboard – how data is stored locally

* Online (claude.ai) the dashboard uses a shared database.
* Locally it stores everything in your browser (`localStorage`, key `mek_leads_v1`).
* On first open it is filled with the 55 leads exported on 1 Oct 2026
  (`data/leads.json`, also embedded in the page so it works when opened as a file).
* Use **Exporteer** to download a JSON backup; data stays per browser and per computer.
* To reset: clear site data for the page, or run `localStorage.removeItem('mek_leads_v1')` in the console.

To share data between colleagues you need a real backend
(e.g. Supabase, Firebase or your own API). Replace the `saveLead`, `removeLead`
and loading code in the `// ---------- opslag ----------` section of
`leads-dashboard/index.html` – everything else works unchanged.

Tip: if you serve the folder with a local web server
(`python -m http.server` in this folder, then open http://localhost:8000/leads-dashboard/),
the dashboard reads `data/leads.json` directly, so you can edit that file to change the seed data.

## External resources (internet required)

* Google Fonts (Oswald) – falls back to system fonts offline.
* cdnjs: SheetJS (Excel import in the dashboard), jsPDF (PDF export in the calculator).
* Google Maps JavaScript API + PDOK (prospect-zoeker only).

## Not included

The design canvases (one-pager, social post, trailer wrap) only run inside Claude.
Their exported results are in `bestanden/`; export new versions from the canvas when needed.
