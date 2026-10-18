# MekMover App

Sales tools for the **Mek-Rider** by MEK: finding and qualifying logistics prospects, following up leads,
calculating ROI, making quotes, showing demos, and running the MEK Movers business (customers, orders, planning,
machines, service, invoices). Everything is in one app, the **MEK Sales Hub**.

## Start the app

Needs **Docker Desktop** and **Node.js** (both free). Double-click **`Start MEK Sales Hub.cmd`**. The browser opens
on http://localhost:3000 when the app is ready. The first start takes a few minutes. Keep the window open while
you use the app.

## Project structure

```
MekMover App/
├── Start MEK Sales Hub.cmd      double-click to start the app
├── README.md                    this file
├── CHANGELOG.md                 every change, numbered INC-001, INC-002, … (newest first)
├── CLAUDE.md                    rules for Claude Code sessions in this project
│
├── app/                         THE APP: MEK Sales Hub (Next.js + PostgreSQL in Docker)
│   ├── README.md                how it works, commands, database, privacy
│   ├── public/mek-movers/       the MEK Movers HTML apps (dashboard, besparingscalculator, besparingsvideo)
│   ├── src/                     app code (pages, modules, texts in Dutch and English)
│   ├── db/migrations/           database schema
│   ├── n8n/                     prospecting workflows
│   └── start.ps1                what the .cmd runs
│
├── features/                    DROP NEW HTML FILES AND FEATURES HERE, one folder each
│   ├── _TEMPLATE/FEATURE.md     copy into a new folder and fill in
│   └── mek-movers-apps/         INC-002: stand-alone MEK Movers version
│
├── docs/
│   ├── REQUIREMENTS.md          every requirement and function, ticked [x] when built
│   ├── ADDING-FEATURES.md       how to add a new or updated HTML file to the app
│   └── specification/           MEK's specification (.docx) and Willem app requirements.xlsx
│
├── reference/                   original stand-alone apps, kept for reference only (not used by the app)
│
└── tools/
    ├── install-html.mjs         installs an HTML file from features/ into the app
    └── track-features.mjs       registers feature folders in CHANGELOG.md
```

## Adding something new

| You have | Put it in | Guide |
|---|---|---|
| A new or updated HTML file | `features/<date>-<name>/` | [docs/ADDING-FEATURES.md](docs/ADDING-FEATURES.md) |
| A new requirement or idea | [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (unticked `[ ]`) | |
| A change to the app code | `app/` | log it in [CHANGELOG.md](CHANGELOG.md) |

## Keeping track of changes

1. **New feature folder**: the tracker gives it the next INC number and writes the CHANGELOG entry and index row,
   automatically before each commit, live with `node tools/track-features.mjs --watch`, or by hand with
   `node tools/track-features.mjs`.
2. **Change to the app**: add an entry at the top of [CHANGELOG.md](CHANGELOG.md) with the next free number, and tick or
   add the requirement in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

After a fresh clone, switch the commit hook on once: `git config core.hooksPath .githooks`.
