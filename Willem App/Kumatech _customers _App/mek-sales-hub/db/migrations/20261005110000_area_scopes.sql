-- "Search now" can run a profile for another area (a province or the whole Netherlands) and large radius
-- profiles are walked in tiles. Each area keeps its own coverage cursor, so a run continues where the last
-- run for that same area stopped. Key: 'nl' | 'prov:<names>' | 'radius:<pc4>:<km>'.
alter table public.search_profiles add column if not exists coverage_cursors jsonb not null default '{}'::jsonb;
