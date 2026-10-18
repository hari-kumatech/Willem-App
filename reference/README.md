# Reference: original apps

The stand-alone apps MEK used before the Sales Hub. They are kept for reference only: the app does not use these
files, and everything they did is now in the Sales Hub (see [docs/REQUIREMENTS.md](../docs/REQUIREMENTS.md)).
Do not change them; new work goes into [features/](../features/) and [app/](../app/).

| Folder | What it was | Now in the Sales Hub |
|---|---|---|
| [MEK-Movers-Sales/](MEK-Movers-Sales/) | Plain-HTML tools: leads dashboard, ROI calculator, crossdock visualisation, prospect finder, product files | Leads, ROI & Offertes, Demo, Prospect Radar; product files in `app/public/files/` and `app/public/brand/` |
| [mek-rider-3d/](mek-rider-3d/) | three.js / Vite 3D product view and crossdock race | Demo → Mek-Rider 3D |
| [mek-rider-leads-nederland/](mek-rider-leads-nederland/) | Single-file leads dashboard with the 55 starting leads | Leads (imported by `npm run seed`) |
