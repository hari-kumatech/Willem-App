# MekMover App

Sales tools for the **Mek-Rider** by MEK: finding and qualifying logistics prospects, following up leads,
calculating ROI, making quotes and showing demos.

## Start here

| File | What it is |
|---|---|
| [REQUIREMENTS.md](REQUIREMENTS.md) | Requirements of the apps and a short description of every function. |
| [CHANGELOG.md](CHANGELOG.md) | Every incremental change, numbered `INC-001`, `INC-002`, … (newest first). |
| [incremental_features/](incremental_features/) | Put each new feature or app version here as its own folder; it is registered automatically. |

## Project structure

```
MekMover App/
├── README.md                     this file
├── REQUIREMENTS.md               requirements + functions of all apps
├── CHANGELOG.md                  numbered log of incremental changes
├── CLAUDE.md                     rules for Claude Code sessions in this project
├── incremental_features/         new features / app versions, one folder each (auto-registered)
│   ├── README.md                 how it works + generated index
│   ├── registry.json             generated: INC number, title, status per folder
│   ├── _TEMPLATE/FEATURE.md      copy into a new folder to describe it
│   └── mek-movers-apps/          INC-002: MEK Movers local version
├── tools/track-features.mjs      registers feature folders in CHANGELOG.md and the index
├── .githooks/pre-commit          runs the tracker before every commit
├── Willem app requirements.xlsx  original search terms and wanted output fields
└── Willem App/
    ├── Kumatech _customers _App/mek-sales-hub/   MAIN APP: MEK Sales Hub (Next.js + PostgreSQL)
    ├── MEK-Movers-Sales/                          original HTML tools (reference)
    ├── mek-rider-3d/                              original 3D app (reference)
    ├── mek-rider-leads-nederland/                 original leads dashboard (reference)
    ├── hari_hackathon demo app/                   separate project (own git repo)
    └── MEK Sales Hub - Requirements and System Specification*.docx
```

## Running the main app

Needs Node.js and Docker Desktop (both free). Double-click **`Start MEK Sales Hub.cmd`** in this folder: it
installs packages, starts the database (PostgreSQL + PostgREST) and n8n, builds the app and opens
http://localhost:3000 in the browser. The first start takes a few minutes; keep the window open while you use the app.

Or from PowerShell in `Willem App/Kumatech _customers _App/mek-sales-hub/`:

```powershell
.\start.ps1          # same as the .cmd; -Dev for hot reload, -Rebuild to force a fresh build
```

Details: the app's own [README](Willem%20App/Kumatech%20_customers%20_App/mek-sales-hub/README.md).

## Keeping track of changes

1. **New feature folder**: drop it into `incremental_features/` (start from `_TEMPLATE/FEATURE.md`). The tracker gives
   it the next INC number and writes the CHANGELOG entry and index row: automatically before each commit, live with
   `node tools/track-features.mjs --watch`, or by hand with `node tools/track-features.mjs`.
2. **Change to an existing app**: add an entry at the top of [CHANGELOG.md](CHANGELOG.md) with the next free number,
   and update [REQUIREMENTS.md](REQUIREMENTS.md) when a requirement or function changes.

After a fresh clone, switch the commit hook on once: `git config core.hooksPath .githooks`.
