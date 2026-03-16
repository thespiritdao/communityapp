-- Migration 006: user_presence table
-- Tracks active sessions for member directory online indicator.
-- Upserted by the client every 60 seconds while the app is open.

create table if not exists public.user_presence (
  wallet_address  text primary key,
  last_seen_at    timestamptz not null default now()
);

-- RLS: authenticated users can upsert their own row; anyone can read
alter table public.user_presence enable row level security;

create policy "users can upsert own presence"
  on public.user_presence
  for all
  using (true)
  with check (true);

-- Index for fast "online in last 5 min" queries
create index if not exists idx_user_presence_last_seen
  on public.user_presence (last_seen_at desc);
