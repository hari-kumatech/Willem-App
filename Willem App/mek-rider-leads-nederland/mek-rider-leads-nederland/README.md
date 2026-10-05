# Mek-Rider leads Nederland

Local copy of the published dashboard (https://claude.ai/artifact/AoqxrtSvfQpHKRPHTHWcPs), unchanged.

```
mek-rider-leads-nederland/
├── index.html        The complete app: HTML, CSS and JavaScript in one file
├── data/
│   └── leads.json    Export of the 55 leads from the published dashboard (2 Oct 2026)
└── README.md
```

## Running locally

Open `index.html` in a browser, or serve the folder (for example `npx serve .`).
It loads SheetJS (Excel import) from cdnjs and the Oswald font from Google Fonts, so you need an internet connection.

## Data

The published version stores leads in the shared Claude artifact database. That database is not available outside claude.ai, so locally the app falls back to in-memory storage: it starts empty and changes are lost on reload. `data/leads.json` is a backup of the current leads for reference or for connecting your own storage.
