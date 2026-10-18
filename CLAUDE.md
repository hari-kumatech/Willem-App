# Project rules

- Log every change you make to an app in `CHANGELOG.md`: a new entry at the top (under the marker line) with the next
  free `INC-0NN` number, in the format shown at the top of that file. Update `REQUIREMENTS.md` when a requirement or
  function changes, and `mek-sales-hub/REQUIREMENTS_STATUS.md` for the main app.
- New features or app versions go into `incremental_features/<folder>/` with a `FEATURE.md` (template in
  `incremental_features/_TEMPLATE/`). Then run `node tools/track-features.mjs` so the folder is registered; never
  edit `incremental_features/registry.json` or the generated index by hand.
- The main app is `Willem App/Kumatech _customers _App/mek-sales-hub/` (see its `AGENTS.md`). Its database is
  PostgreSQL + PostgREST via `npm run db:*`; Supabase is no longer used. Schema changes are new files in
  `db/migrations/`, applied with `npm run db:migrate`.
