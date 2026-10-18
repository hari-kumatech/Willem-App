# MEK Movers – dashboard, besparingscalculator and besparingsvideo

Offline copy of the MEK Movers apps from claude.ai (dashboard with leads, customers, quotes, orders, planning, machines, service, stock, invoices and goals; customer savings calculator with 3D; savings video generator). Merged into the MEK Sales Hub as the "MEK Movers" menu item (INC-005).

- **Type:** app
- **Status:** merged into the main app (INC-005); this folder stays as the stand-alone version
- **Relates to:** MEK Sales Hub → MEK Movers (`/mek-movers`), docs/REQUIREMENTS.md §10
- **How to run:** in the Sales Hub, menu **MEK Movers**; stand-alone: `cd mek-movers-local && npm start`

## What changed when merging

- The four HTML files are copied unchanged to `app/public/mek-movers/`, except the dashboard's
  "MEK Movers Sales" hub link, which now opens the Sales Hub (`/overzicht`) instead of the claude.ai artifact.
- Data moved from `data/db.json` to the Sales Hub database (table `mm_documents`); the 16 Oct snapshot was loaded
  with `npm run mek-movers:seed` (1,662 documents, identical to `seed.json`).
- Same API as `server.js` under `/mek-movers/api/` (db, events, export, import), now behind the Sales Hub login:
  viewers read only, only admins may restore a backup.
- Same automatic daily backup as `server.js` (INC-006): `app/backups/mek-movers/db-YYYY-MM-DD.json`,
  last 30 days kept.
- Not carried over on purpose: opening the HTML as a file (browser-storage fallback) and `npm run start:lan`; the
  Sales Hub itself is already reachable on the office network.

## Notes

- Since INC-008 the MEK Movers leads are the Sales Hub leads (one list of 1,643); the dashboard's Leads page opens the Sales Hub Leads page.
- Changes made in this stand-alone folder after 18 Oct do not reach the Sales Hub automatically; copy the HTML
  files again and load a backup with `npm run mek-movers:seed -- <backup.json> --force`.
