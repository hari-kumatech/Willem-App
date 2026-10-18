-- MEK Movers apps (dashboard, besparingscalculator, besparingsvideo) inside the Sales Hub (INC-005).
-- The apps keep their own document model: collections of JSON documents (leads, klanten, offertes, orders,
-- planning, demos, machines, service, artikelen, facturen, opvolging, instellingen). One row per document.
-- These are separate from the Sales Hub's own leads table; the two are not synchronised.

create table public.mm_documents (
  collection text not null check (collection ~ '^[A-Za-z0-9_.:@+~-]{1,200}$'),
  id text not null check (id ~ '^[A-Za-z0-9_.:@+~-]{1,200}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (collection, id)
);

alter table public.mm_documents enable row level security;
create policy mm_documents_read on public.mm_documents for select to authenticated using (public.can_read());
create policy mm_documents_insert on public.mm_documents for insert to authenticated with check (public.can_write());
create policy mm_documents_update on public.mm_documents for update to authenticated using (public.can_write()) with check (public.can_write());
create policy mm_documents_delete on public.mm_documents for delete to authenticated using (public.can_write());

-- Merge fields into an existing document in one statement (the apps' doc().update()). RLS applies (invoker).
create or replace function public.mm_patch(p_collection text, p_id text, p_data jsonb)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  update public.mm_documents
  set data = data || p_data, updated_at = now(), updated_by = auth.uid()
  where collection = p_collection and id = p_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Replace everything with a backup { collection: { id: document } } in one transaction (admins only).
create or replace function public.mm_replace_all(p_db jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_admin() and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'Alleen een admin mag een back-up terugzetten' using errcode = '42501';
  end if;
  delete from public.mm_documents where true;
  insert into public.mm_documents (collection, id, data, updated_by)
  select c.key, d.key, d.value, auth.uid()
  from jsonb_each(p_db) c, jsonb_each(c.value) d
  where jsonb_typeof(d.value) = 'object';
  get diagnostics n = row_count;
  return n;
end;
$$;
