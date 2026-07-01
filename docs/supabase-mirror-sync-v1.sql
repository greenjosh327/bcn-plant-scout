-- BCN Plant Scout mirror sync v1
-- Run this in Supabase SQL Editor before using dashboard/mobile soft deletes.

alter table public.observations
  add column if not exists deleted_at timestamptz;

create index if not exists observations_user_deleted_idx
  on public.observations (user_id, deleted_at);

-- Optional later columns. The mobile app currently keeps these local until the
-- cloud schema is expanded.
-- alter table public.observations add column if not exists favorite boolean default false;
-- alter table public.observations add column if not exists tags text[] default '{}';
