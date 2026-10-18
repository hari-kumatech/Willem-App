-- One leads list (INC-008): the MEK Movers dashboard now reads and writes public.leads instead of its own
-- 'leads' documents in mm_documents. Fields the MEK Movers apps keep on a lead that have no column here
-- (for example offerteNummer) are stored in leads.extra, so nothing they save is lost.
alter table public.leads add column if not exists extra jsonb not null default '{}'::jsonb;
alter table public.leads add constraint leads_extra_object check (jsonb_typeof(extra) = 'object');
