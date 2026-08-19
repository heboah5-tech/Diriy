-- Diriyah — Supabase schema
-- Run this in the Supabase SQL editor (one time) for your project.
-- All "Firestore-style" docs are stored as JSONB rows keyed by id.

create extension if not exists "pgcrypto";

create table if not exists public.pays (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.settings (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.blocked_bins (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Enable Realtime on all three tables so onSnapshot-style subscriptions work.
alter publication supabase_realtime add table public.pays;
alter publication supabase_realtime add table public.settings;
alter publication supabase_realtime add table public.blocked_bins;

-- Row Level Security.
-- The dashboard requires an authenticated admin (Supabase Auth user). The
-- visitor-facing pages are anonymous and need anon access to their own row.
-- For simplicity (matching the previous Firebase rules of the project) we
-- allow anon read/write on these three tables. Tighten as needed.

alter table public.pays           enable row level security;
alter table public.settings       enable row level security;
alter table public.blocked_bins   enable row level security;

drop policy if exists "pays anon all"           on public.pays;
drop policy if exists "settings anon all"       on public.settings;
drop policy if exists "blocked_bins anon all"   on public.blocked_bins;

create policy "pays anon all"          on public.pays         for all using (true) with check (true);
create policy "settings anon all"      on public.settings     for all using (true) with check (true);
create policy "blocked_bins anon all"  on public.blocked_bins for all using (true) with check (true);

-- Create an admin user (run once, replace email/password):
-- Use the Supabase Dashboard → Authentication → Users → Add user
-- (or call supabase.auth.admin.createUser from a server script).
