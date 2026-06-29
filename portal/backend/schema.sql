-- ============================================================
-- REVLAR ANALYST PORTAL — Supabase schema
-- Run this once in: Supabase dashboard -> SQL Editor -> New query.
-- It creates the tables the portal reads/writes, plus the
-- server-side guarantees that make the audit trail defensible.
-- ============================================================

-- ---------- 1. Clients ----------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------- 2. Collision-free case references (server-side) ----------
-- The browser must NOT mint references (two analysts could collide).
-- This sequence + function hands out RV-YYYY-#### safely.
create sequence if not exists public.case_seq;

create or replace function public.next_case_reference()
returns text
language sql
security definer
set search_path = public
as $$
  select 'RV-' || extract(year from now())::int || '-' ||
         lpad(nextval('public.case_seq')::text, 4, '0');
$$;
grant execute on function public.next_case_reference() to authenticated;

-- ---------- 3. Cases ----------
create table if not exists public.cases (
  id                    uuid primary key default gen_random_uuid(),
  reference             text unique not null,
  client                text not null,
  type                  text not null check (type in ('video','audio','image')),
  urgency               text not null default 'standard' check (urgency in ('standard','rush')),
  status                text not null default 'Open'
                          check (status in ('Open','In Progress','Complete','Reopened')),
  verdict               text,            -- raw engine/pipeline verdict (set by detection, not this app)
  score                 int,             -- engine confidence 0-100
  analyst_verdict       text,            -- the HUMAN, defensible verdict (the thing you sell)
  analyst_verdict_reason text,           -- shown in the court-ready report
  file_hash             text,            -- SHA-256 chain of custody
  file_path             text,            -- path in the private storage bucket
  notes                 text,            -- analyst working notes
  analyst               text,            -- display name (convenience)
  created_by            uuid default auth.uid(),  -- authoritative identity
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists cases_created_idx on public.cases (created_at desc);

-- keep updated_at honest
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists cases_touch on public.cases;
create trigger cases_touch before update on public.cases
  for each row execute function public.touch_updated_at();

-- ---------- 4. Append-only activity log (tamper-evident audit trail) ----------
create table if not exists public.activity_log (
  id              uuid primary key default gen_random_uuid(),
  action          text not null,
  case_reference  text,
  analyst         text,
  actor           uuid default auth.uid(),   -- who really did it
  created_at      timestamptz not null default now()
);
create index if not exists activity_created_idx on public.activity_log (created_at desc);

-- block UPDATE/DELETE so the log can never be rewritten or back-dated
create or replace function public.block_mutation()
returns trigger language plpgsql as $$
begin raise exception 'activity_log is append-only'; end;
$$;
drop trigger if exists activity_no_change on public.activity_log;
create trigger activity_no_change before update or delete on public.activity_log
  for each row execute function public.block_mutation();

-- ---------- 5. Row Level Security ----------
-- Internal team tool: any signed-in analyst can read + create, and
-- update cases. activity_log gets NO update/delete policy, so combined
-- with the trigger above it is effectively immutable.
alter table public.clients      enable row level security;
alter table public.cases        enable row level security;
alter table public.activity_log enable row level security;

create policy "read clients"    on public.clients      for select to authenticated using (true);
create policy "read cases"      on public.cases        for select to authenticated using (true);
create policy "read activity"   on public.activity_log for select to authenticated using (true);

create policy "insert clients"  on public.clients      for insert to authenticated with check (true);
create policy "insert cases"    on public.cases        for insert to authenticated with check (true);
create policy "insert activity" on public.activity_log for insert to authenticated with check (true);

create policy "update cases"    on public.cases        for update to authenticated using (true) with check (true);

-- ---------- 6. Private evidence storage ----------
-- In the dashboard: Storage -> New bucket -> name "case-files",
-- and leave "Public bucket" UNCHECKED (evidence must stay private).
-- Then run these so signed-in analysts can upload and read via signed URLs:
create policy "authed upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'case-files');
create policy "authed read"   on storage.objects
  for select to authenticated using (bucket_id = 'case-files');

-- ---------- 7. (optional) seed a couple of clients ----------
-- insert into public.clients (name) values ('Tribune Newsroom'), ('Harris County DA')
--   on conflict (name) do nothing;
