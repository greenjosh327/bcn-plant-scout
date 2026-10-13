-- Isolated public TEST submissions. No existing objects, accounts or official entries changed.
begin;
create table public.scout_preview_config (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  retention_days integer not null default 7 check (retention_days = 7),
  privacy_version text not null default 'preview-2026-v1' check (privacy_version = 'preview-2026-v1'),
  reviewed_at timestamptz,
  cleanup_verified_at timestamptz
);
insert into public.scout_preview_config(id) values(true);
create table public.scout_preview_submissions (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 3 and 100),
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 254),
  state text not null check (state ~ '^[A-Z]{2}$'),
  week integer not null check (week between 1 and 4),
  submitted_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '7 days'),
  status text not null default 'PREVIEW ONLY' check (status = 'PREVIEW ONLY'),
  privacy_version text not null check (privacy_version = 'preview-2026-v1'),
  unique (email, week)
);
create index scout_preview_expiry on public.scout_preview_submissions(expires_at);
create table public.scout_preview_limits (
  key text not null check (key ~ '^[a-f0-9]{64}$'),
  bucket timestamptz not null,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null,
  primary key (key, bucket)
);
create table public.scout_preview_used_proofs (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null default (clock_timestamp() + interval '10 minutes')
);
alter table public.scout_preview_config enable row level security;
alter table public.scout_preview_submissions enable row level security;
alter table public.scout_preview_limits enable row level security;
alter table public.scout_preview_used_proofs enable row level security;
-- Explicit deny policies document the intended public boundary; service_role bypasses RLS.
create policy preview_config_private on public.scout_preview_config to anon,authenticated using(false) with check(false);
create policy preview_submissions_private on public.scout_preview_submissions to anon,authenticated using(false) with check(false);
create policy preview_limits_private on public.scout_preview_limits to anon,authenticated using(false) with check(false);
create policy preview_proofs_private on public.scout_preview_used_proofs to anon,authenticated using(false) with check(false);
revoke all on public.scout_preview_config,public.scout_preview_submissions,public.scout_preview_limits,public.scout_preview_used_proofs from public,anon,authenticated,service_role;
grant select on public.scout_preview_config to service_role;
grant select,insert,delete on public.scout_preview_submissions to service_role;
grant select,insert,update,delete on public.scout_preview_limits to service_role;
grant select,insert,delete on public.scout_preview_used_proofs to service_role;

create function public.scout_preview_rate(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; t timestamptz; begin
  if p_limit not between 1 and 1000 or p_seconds not in (3600,86400) then raise exception 'Invalid rate limit'; end if;
  t := to_timestamp(floor(extract(epoch from clock_timestamp())/p_seconds)*p_seconds);
  insert into public.scout_preview_limits(key,bucket,attempts,expires_at)
    values(p_key,t,1,t + make_interval(secs=>p_seconds) + interval '1 day')
    on conflict(key,bucket) do update set attempts=least(public.scout_preview_limits.attempts+1,1001)
    returning attempts into n;
  return n <= p_limit;
end $$;
create function public.scout_preview_submit(p_name text,p_email text,p_state text,p_week integer,p_privacy text,p_proof text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.scout_preview_config where id and enabled and reviewed_at is not null and cleanup_verified_at is not null;
  if not found then raise exception 'Preview closed'; end if;
  if p_privacy <> 'preview-2026-v1' or p_name !~ '\S+\s+\S+' or char_length(p_name) not between 3 and 100
    or p_email <> lower(btrim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_state not in ('AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY') then raise exception 'Invalid preview submission'; end if;
  -- Single-use proof and insert are atomic. A duplicate email/week returns identical success.
  insert into public.scout_preview_used_proofs(key) values(p_proof);
  insert into public.scout_preview_submissions(full_name,email,state,week,privacy_version)
    values(p_name,p_email,p_state,p_week,p_privacy) on conflict(email,week) do nothing;
end $$;
create function public.scout_preview_purge()
returns integer language plpgsql security invoker set search_path = '' as $$
declare n integer; begin
  delete from public.scout_preview_submissions where expires_at <= clock_timestamp();
  get diagnostics n = row_count;
  delete from public.scout_preview_limits where expires_at <= clock_timestamp();
  delete from public.scout_preview_used_proofs where expires_at <= clock_timestamp();
  return n;
end $$;
revoke all on function public.scout_preview_rate(text,integer,integer),public.scout_preview_submit(text,text,text,integer,text,text),public.scout_preview_purge() from public,anon,authenticated;
grant execute on function public.scout_preview_rate(text,integer,integer),public.scout_preview_submit(text,text,text,integer,text,text),public.scout_preview_purge() to service_role;
commit;
