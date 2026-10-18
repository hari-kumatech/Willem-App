# Project rules

- Layout: the app is `app/` (MEK Sales Hub, see its `AGENTS.md`); new features arrive in `features/<folder>/`;
  docs in `docs/`; `reference/` holds the original stand-alone apps and is read-only.
- Log every change you make to the app in `CHANGELOG.md`: a new entry at the top (under the marker line) with the
  next free `INC-0NN` number, in the format shown at the top of that file. Tick or add the matching line in
  `docs/REQUIREMENTS.md` when a requirement or function changes; it is the one requirements file.
- New features or app versions go into `features/<folder>/` with a `FEATURE.md` (template in `features/_TEMPLATE/`).
  Then run `node tools/track-features.mjs` so the folder is registered; never edit `features/registry.json` or
  the generated index by hand.
- New or updated HTML apps are installed with `node tools/install-html.mjs <file>` (never copied by hand into
  `app/public/mek-movers/`); handle every TO DO it prints. Guide: `docs/ADDING-FEATURES.md`.
- The database is PostgreSQL + PostgREST via `npm run db:*` in `app/`; Supabase is no longer used. Schema changes
  are new files in `app/db/migrations/`, applied with `npm run db:migrate`.
