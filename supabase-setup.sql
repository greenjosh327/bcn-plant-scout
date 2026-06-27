-- BCN Plant Scout Supabase setup
-- Run this in the Supabase SQL editor for the project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.observations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  privacy_level text not null default 'share with BCN',
  sync_status text not null default 'synced',
  sync_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  common_name text not null,
  scientific_name text,
  other_names text[] not null default '{}',
  confidence_score numeric,
  identification_status text,
  identification_error text,
  identified_at timestamptz,
  user_confirmed boolean not null default false,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters double precision,
  observed_at timestamptz not null,
  photo_uri text not null,
  photo_file_name text,
  photo_storage_path text,
  notes text,
  return_date text,
  reminder_lead_days integer,
  reminder_scheduled_for timestamptz,
  gather_notes text,
  collection_interests text[] not null default '{}',
  collection_status text
);

create table if not exists public.observation_photos (
  id text primary key,
  observation_id text not null references public.observations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_uri text not null,
  storage_path text,
  file_name text,
  photo_role text not null default 'extra',
  added_at timestamptz not null,
  sync_status text not null default 'synced',
  sync_error text
);

create index if not exists observations_user_id_idx
  on public.observations(user_id);

create index if not exists observations_observed_at_idx
  on public.observations(observed_at desc);

create index if not exists observations_return_date_idx
  on public.observations(return_date);

create index if not exists observation_photos_observation_id_idx
  on public.observation_photos(observation_id);

alter table public.profiles enable row level security;
alter table public.observations enable row level security;
alter table public.observation_photos enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "Users can upsert own profile" on public.profiles;
create policy "Users can upsert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users can read own observations" on public.observations;
create policy "Users can read own observations"
on public.observations for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own observations" on public.observations;
create policy "Users can insert own observations"
on public.observations for insert
to authenticated
with check (user_id = auth.uid() and owner_id = auth.uid());

drop policy if exists "Users can update own observations" on public.observations;
create policy "Users can update own observations"
on public.observations for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and owner_id = auth.uid());

drop policy if exists "Users can delete own observations" on public.observations;
create policy "Users can delete own observations"
on public.observations for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read own observation photos" on public.observation_photos;
create policy "Users can read own observation photos"
on public.observation_photos for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own observation photos" on public.observation_photos;
create policy "Users can insert own observation photos"
on public.observation_photos for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own observation photos" on public.observation_photos;
create policy "Users can update own observation photos"
on public.observation_photos for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own observation photos" on public.observation_photos;
create policy "Users can delete own observation photos"
on public.observation_photos for delete
to authenticated
using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('plant-photos', 'plant-photos', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload own plant photos" on storage.objects;
create policy "Users can upload own plant photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'plant-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can read own plant photos" on storage.objects;
create policy "Users can read own plant photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'plant-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can update own plant photos" on storage.objects;
create policy "Users can update own plant photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'plant-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'plant-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users can delete own plant photos" on storage.objects;
create policy "Users can delete own plant photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'plant-photos'
  and (storage.foldername(name))[1] = 'users'
  and (storage.foldername(name))[2] = auth.uid()::text
);
