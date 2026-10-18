# Adding new features (new HTML files)

How to bring a new or updated HTML app, for example a new `dashboard.html` made on claude.ai, into the
MEK Sales Hub, and where every kind of file goes.

## Where things go

| What you have | Put it in | Then |
|---|---|---|
| New version of a MEK Movers app (`dashboard.html`, `besparingscalculator.html`, `besparingsvideo.html`, `index.html`) | `features/<date>-<name>/` | Install it with `tools/install-html.mjs` (below) |
| A brand-new HTML app | `features/<date>-<name>/` | Install it, then add it to the menu (step 4) |
| A data file (leads Excel / CSV / JSON, a MEK Movers backup `.json`) | `features/<date>-<name>/` | Import it in the app: **Leads → Importeer Excel**, or **Beheer → Back-up & herstel** |
| Product images, logos, PDFs for customers | `app/public/brand/` or `app/public/files/` | Use them in the app at `/brand/…` or `/files/…` |
| A change to what the app must do | [docs/REQUIREMENTS.md](REQUIREMENTS.md) | Add or tick the requirement |
| Specifications from MEK (Word, Excel) | `docs/specification/` | Mention them in `docs/REQUIREMENTS.md` |

Never put new files directly into `app/public/mek-movers/` by hand: the install tool makes the changes the files
need there and checks them.

## Step by step

1. **Make a folder** in `features/` named after the date and the change, lowercase, no spaces:
   `features/2026-10-25-dashboard-doelen/`.
2. **Put the HTML file(s) in it** with the name of the app they replace (`dashboard.html` …) or a new name for a
   new app. Copy [features/_TEMPLATE/FEATURE.md](../features/_TEMPLATE/FEATURE.md) into the folder and fill it in:
   what is new, for whom. The folder gets its own number (`INC-0NN`) and a line in [CHANGELOG.md](../CHANGELOG.md)
   automatically at the next commit.
3. **Install** it into the app, from the project folder (`MekMover App`):

   ```powershell
   node tools/install-html.mjs features/2026-10-25-dashboard-doelen/dashboard.html
   ```

   The tool copies the file to `app/public/mek-movers/` and:
   - adds `<script src="js/claude-local.js">`, so `claude.use('db')` and `claude.use('downloads')` work with the
     Sales Hub database instead of claude.ai;
   - points the dashboard's "MEK Movers Sales" hub link to the Sales Hub;
   - prints a **TO DO** line for anything that still needs code: a new section in the dashboard menu, a new app
     that is not in the main menu yet, or a claude.ai feature the Sales Hub does not offer.

   Check first without changing anything: add `--check`. Install under another name: add the name after the file
   (`… nieuw.html planning.html`).
4. **TO DO lines** (only when the tool printed them). The easiest way: open Claude Code in this project and say
   *"Integrate features/2026-10-25-dashboard-doelen into the app"*. By hand:
   - New app: add it to `FRAME_SRC` and `MOVERS_SECTIONS` in `app/src/modules/movers/sections.ts`, a label (Dutch and
     English) in `app/src/i18n/messages/common.ts`, and a menu item in `app/src/components/layout/SideNav.tsx`.
   - New dashboard section: add a line to `MOVERS_SECTIONS` with `innerLabel` exactly as the button text in the
     dashboard, plus its label and icon as above.
5. **Restart and test**: close the app window, double-click `Start MEK Sales Hub.cmd`. It rebuilds automatically
   because a file changed. Open the new page from the menu; add, change and delete something; open the same page
   in a second tab and check the change shows up there too.
6. **Write it down**: tick or add the functions in [docs/REQUIREMENTS.md](REQUIREMENTS.md), then commit. The commit
   hook registers the feature folder in the CHANGELOG.

## What works automatically

- **Data**: every collection an HTML app uses (`db.collection('…')`) is stored in the Sales Hub database (table
  `mm_documents`), with live updates between open tabs. A new collection needs no database change.
- **Leads**: the collection `leads` is the Sales Hub leads list. New fields are kept with each lead.
- **Login and roles**: the pages are behind the Sales Hub login; viewers can look but not save.
- **Backups**: the daily automatic backup and **Back-up & herstel** include new collections.

## Rules for HTML files from claude.ai

- Keep the data in `claude.use('db')`: no `localStorage` for data that must be kept or shared.
- Only `claude.use('db')` and `claude.use('downloads')` are available. A file that uses another runtime feature
  gets a TO DO from the install tool.
- Keep the dashboard's menu button texts (its `NAV` list) the same, or also update `sections.ts`: the main menu
  finds dashboard sections by that text. The install tool warns about any difference.
- Libraries from a CDN (three.js, jsPDF, SheetJS) are fine; the laptop needs internet for them.
