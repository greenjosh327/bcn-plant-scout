-- Deployment-ready, intentionally CLOSED. Apply to the shared Scout/shop database.
-- No profile, subscription, existing observation, catalog or analytics changes.
create table public.scout_challenge_config (
  id boolean primary key default true check (id),
  page_visible boolean not null default true,
  entries_enabled boolean not null default false,
  drawings_enabled boolean not null default false,
  reviewed_rules_version text,
  reviewed_at timestamptz,
  check (not (entries_enabled or drawings_enabled) or (reviewed_rules_version = 'bcn-scout-2026-draft-v2' and reviewed_at is not null))
);
insert into public.scout_challenge_config(id) values (true);
create table public.scout_challenge_weeks (
  id integer primary key check (id between 1 and 4),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at)
);
insert into public.scout_challenge_weeks values
  (1,'2026-10-19 00:00 America/New_York','2026-10-26 00:00 America/New_York'),
  (2,'2026-10-26 00:00 America/New_York','2026-11-02 00:00 America/New_York'),
  (3,'2026-11-02 00:00 America/New_York','2026-11-09 00:00 America/New_York'),
  (4,'2026-11-09 00:00 America/New_York','2026-11-16 00:00 America/New_York');
create table public.scout_challenge_entries (
  id uuid primary key,
  week_id integer not null references public.scout_challenge_weeks,
  user_id uuid references auth.users on delete set null,
  full_name text not null check (length(full_name) between 2 and 100),
  email text not null,
  state text not null,
  email_key text not null,
  review_key text not null,
  method text not null check (method in ('app','web')),
  status text not null check (status in ('pending','eligible','duplicate','ineligible','withdrawn')),
  review_reason text,
  rules_version text not null default 'bcn-scout-2026-draft-v2',
  submitted_at timestamptz not null default clock_timestamp(),
  consent_at timestamptz not null default clock_timestamp(),
  age_confirmed boolean not null default false,
  unique (week_id,email_key)
);
create index scout_challenge_person_review on public.scout_challenge_entries(week_id,review_key);
create unique index scout_challenge_user_week on public.scout_challenge_entries(week_id,user_id) where user_id is not null;
create table public.scout_challenge_progress (
  id uuid primary key default gen_random_uuid(),
  week_id integer not null references public.scout_challenge_weeks,
  user_id uuid not null references auth.users on delete cascade,
  record_id text not null unique,
  record_created_at timestamptz not null,
  saved_at timestamptz not null
);
create index scout_challenge_progress_user on public.scout_challenge_progress(user_id,week_id);
create table public.scout_challenge_preferences (
  user_id uuid primary key references auth.users on delete cascade,
  opted_out boolean not null default false,
  full_name text,
  state text,
  age_confirmed boolean not null default false,
  rules_acknowledged boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.scout_challenge_drawings (
  id uuid primary key,
  week_id integer not null unique references public.scout_challenge_weeks,
  winner_entry_id uuid not null references public.scout_challenge_entries,
  eligible_entry_ids uuid[] not null,
  entry_snapshot jsonb not null,
  entropy text not null check (entropy ~ '^[0-9a-f]{64}$'),
  selected_index integer not null,
  algorithm text not null default 'uint32-rejection-v1',
  drawn_by uuid not null,
  drawn_at timestamptz not null default clock_timestamp()
);
create table public.scout_challenge_fulfillment (
  drawing_id uuid primary key references public.scout_challenge_drawings,
  notification_status text not null default 'pending' check (notification_status in ('pending','notified','responded')),
  fulfillment_status text not null default 'pending' check (fulfillment_status in ('pending','packed','shipped','delivered')),
  seed_product_ids text[] not null default '{}',
  tracking_reference text,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.scout_challenge_audit (
  id bigint generated always as identity primary key,
  week_id integer references public.scout_challenge_weeks,
  actor_id uuid,
  action text not null,
  record_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
create table public.scout_challenge_rate_limits (
  key text not null,
  bucket bigint not null,
  hits integer not null,
  primary key(key,bucket)
);
-- Tables have no public policies. Only the backend service can access contest data.
do $$ declare t text; begin
  foreach t in array array['config','weeks','entries','progress','drawings','fulfillment','audit','rate_limits','preferences'] loop
    execute format('alter table public.scout_challenge_%I enable row level security', t);
    execute format('revoke all on public.scout_challenge_%I from public, anon, authenticated, service_role', t);
    execute format('grant select, insert, update on public.scout_challenge_%I to service_role', t);
  end loop;
end $$;
revoke update on public.scout_challenge_drawings, public.scout_challenge_audit, public.scout_challenge_config from service_role;
revoke all on sequence public.scout_challenge_audit_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.scout_challenge_audit_id_seq to service_role;
create function public.scout_challenge_immutable() returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Immutable drawing/audit record'; end $$;
create trigger scout_challenge_drawings_immutable before update or delete on public.scout_challenge_drawings for each row execute function public.scout_challenge_immutable();
create trigger scout_challenge_audit_immutable before update or delete on public.scout_challenge_audit for each row execute function public.scout_challenge_immutable();
create function public.scout_challenge_lock_week(p_week integer, p_open boolean) returns void language plpgsql security invoker set search_path = '' as $$
declare w public.scout_challenge_weeks; begin
  select * into strict w from public.scout_challenge_weeks where id=p_week for update;
  if p_open then
    if not exists (select 1 from public.scout_challenge_config where entries_enabled and reviewed_at is not null and reviewed_rules_version='bcn-scout-2026-draft-v2') then raise exception 'Challenge is closed'; end if;
    if clock_timestamp() < w.starts_at or clock_timestamp() >= w.ends_at then raise exception 'Week is not open'; end if;
  end if;
  if exists (select 1 from public.scout_challenge_drawings where week_id=p_week) then raise exception 'Week has already been drawn'; end if;
end $$;
create function public.scout_challenge_rate(p_key text, p_limit integer) returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer; b bigint := floor(extract(epoch from clock_timestamp())/3600); begin
  -- Shared durable limit across serverless instances. Keys are HMACs, never raw IPs/emails.
  insert into public.scout_challenge_rate_limits values(p_key,b,1)
    on conflict(key,bucket) do update set hits=public.scout_challenge_rate_limits.hits+1 returning hits into n;
  return n <= p_limit;
end $$;
create function public.scout_challenge_enter(p_id uuid,p_user uuid,p_week integer,p_name text,p_email text,p_state text,p_email_key text,p_review_key text,p_method text) returns void language plpgsql security invoker set search_path = '' as $$
declare collision boolean; begin
  perform public.scout_challenge_lock_week(p_week,true);
  if p_state <> all(string_to_array('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC',' ')) then raise exception 'Ineligible state'; end if;
  -- One entry across both methods. Return the same confirmation for repeat requests.
  if exists (select 1 from public.scout_challenge_entries where week_id=p_week and (email_key=p_email_key or (p_user is not null and user_id=p_user))) then return; end if;
  if p_method<>'web' then raise exception 'App qualification is automatic'; end if;
  collision := exists(select 1 from public.scout_challenge_entries where week_id=p_week and review_key=p_review_key);
  if collision then
    update public.scout_challenge_entries set status='pending',review_reason='Possible same person: manual review, not a household exclusion' where week_id=p_week and review_key=p_review_key;
  end if;
  insert into public.scout_challenge_entries(id,user_id,week_id,full_name,email,state,email_key,review_key,method,status,review_reason,age_confirmed)
    values(p_id,p_user,p_week,p_name,lower(trim(p_email)),p_state,p_email_key,p_review_key,p_method,case when collision then 'pending' else 'eligible' end,case when collision then 'Possible same person: manual review' end,true);
  insert into public.scout_challenge_audit(week_id,actor_id,action,record_id,details) values(p_week,p_user,'entry_submitted',p_id,jsonb_build_object('method',p_method,'possible_duplicate',collision));
end $$;
create function public.scout_challenge_admin(p_actor uuid) returns void language plpgsql security invoker set search_path = '' as $$
begin if not exists(select 1 from public.bcn_admins where user_id=p_actor) then raise exception 'Admin required'; end if; end $$;
create function public.scout_challenge_review_entry(p_id uuid,p_actor uuid,p_status text,p_reason text) returns void language plpgsql security invoker set search_path = '' as $$
declare e public.scout_challenge_entries; n integer; begin
  perform public.scout_challenge_admin(p_actor);
  select * into strict e from public.scout_challenge_entries where id=p_id;
  perform public.scout_challenge_lock_week(e.week_id,false);
  if length(trim(p_reason)) < 5 then raise exception 'Review reason required'; end if;
  if e.method='app' and p_status='eligible' then
    select count(*) into n from public.scout_challenge_progress where user_id=e.user_id and week_id=e.week_id;
    if n < 10 then raise exception '10 new saved plant records required'; end if;
    if exists(select 1 from public.scout_challenge_preferences where user_id=e.user_id and opted_out) then raise exception 'Participant opted out'; end if;
    if not e.age_confirmed or e.state='' then raise exception 'Age and residence confirmation required'; end if;
  end if;
  update public.scout_challenge_entries set status=p_status,review_reason=p_reason where id=p_id;
  insert into public.scout_challenge_audit(week_id,actor_id,action,record_id,details) values(e.week_id,p_actor,'entry_reviewed',p_id,jsonb_build_object('before',e.status,'after',p_status,'reason',p_reason));
end $$;
create function public.scout_challenge_draw(p_id uuid,p_week integer,p_actor uuid,p_entropy text) returns uuid language plpgsql security invoker set search_path = '' as $$
declare ids uuid[]; snapshot jsonb; n bigint; lim bigint; sample bigint; idx integer; i integer; begin
  perform public.scout_challenge_admin(p_actor);
  perform public.scout_challenge_lock_week(p_week,false);
  if not exists(select 1 from public.scout_challenge_config where drawings_enabled and reviewed_at is not null and reviewed_rules_version='bcn-scout-2026-draft-v2') then raise exception 'Drawings are disabled'; end if;
  if (clock_timestamp() at time zone 'America/New_York')::date <> ((select ends_at from public.scout_challenge_weeks where id=p_week) at time zone 'America/New_York')::date then raise exception 'Drawing must occur on the scheduled Monday'; end if;
  if clock_timestamp() < (select ends_at from public.scout_challenge_weeks where id=p_week) then raise exception 'Week has not closed'; end if;
  if exists(select 1 from public.scout_challenge_entries where week_id=p_week and status='pending') then raise exception 'Resolve all pending entries before drawing'; end if;
  select array_agg(id order by id) into ids from public.scout_challenge_entries where week_id=p_week and status='eligible';
  n := coalesce(array_length(ids,1),0);
  if n=0 or n>1000000 or p_entropy !~ '^[0-9a-f]{64}$' then raise exception 'Invalid drawing pool or entropy'; end if;
  lim := (4294967296 / n) * n;
  for i in 0..7 loop
    sample := ('x'||substr(p_entropy,i*8+1,8))::bit(32)::bigint;
    if sample < lim then idx := (sample % n)::integer; exit; end if;
  end loop;
  if idx is null then raise exception 'Random sample rejected'; end if;
  select jsonb_agg(jsonb_build_object('id',id,'method',method,'status',status,'reason',review_reason) order by id) into snapshot from public.scout_challenge_entries where week_id=p_week;
  insert into public.scout_challenge_drawings(id,week_id,winner_entry_id,eligible_entry_ids,entry_snapshot,entropy,selected_index,drawn_by) values(p_id,p_week,ids[idx+1],ids,snapshot,p_entropy,idx,p_actor);
  insert into public.scout_challenge_fulfillment(drawing_id) values(p_id);
  insert into public.scout_challenge_audit(week_id,actor_id,action,record_id,details) values(p_week,p_actor,'drawing_completed',p_id,jsonb_build_object('pool_size',n,'winner_entry_id',ids[idx+1],'algorithm','uint32-rejection-v1'));
  return ids[idx+1];
end $$;
create function public.scout_challenge_fulfill(p_id uuid,p_actor uuid,p_notification text,p_status text,p_products text[],p_tracking text) returns void language plpgsql security invoker set search_path = '' as $$
declare week integer; previous public.scout_challenge_fulfillment; begin
  perform public.scout_challenge_admin(p_actor);
  select week_id into strict week from public.scout_challenge_drawings where id=p_id;
  select * into strict previous from public.scout_challenge_fulfillment where drawing_id=p_id for update;
  if previous.fulfillment_status in ('shipped','delivered') and (p_products<>previous.seed_product_ids or p_status not in ('shipped','delivered')) then raise exception 'Shipped prize cannot be replaced or reverted'; end if;
  if p_status in ('packed','shipped','delivered') then
    if coalesce(array_length(p_products,1),0)<>3 then raise exception 'Exactly three seed packs required'; end if;
    -- Check selections against current stock; physical reservation remains the existing shop workflow.
    if (previous.fulfillment_status='pending' or p_products<>previous.seed_product_ids) and exists(select 1 from unnest(p_products) as choice(id) left join public.products p on p.id=choice.id where p.id is null or not p.active or p.category<>'Seeds' or p.inventory < (select count(*) from unnest(p_products) x where x=choice.id)) then raise exception 'Select eligible in-stock seed packs'; end if;
  end if;
  if p_status in ('shipped','delivered') and coalesce(length(trim(p_tracking)),0)<3 then raise exception 'Tracking reference required'; end if;
  update public.scout_challenge_fulfillment set notification_status=p_notification,fulfillment_status=p_status,seed_product_ids=p_products,tracking_reference=p_tracking,updated_at=clock_timestamp() where drawing_id=p_id;
  insert into public.scout_challenge_audit(week_id,actor_id,action,record_id,details) values(week,p_actor,'fulfillment_updated',p_id,jsonb_build_object('notification',p_notification,'status',p_status,'products',p_products,'shipping_cost_to_winner',0));
end $$;
create function public.scout_challenge_account_cleanup(p_user uuid) returns void language plpgsql security invoker set search_path = '' as $$
declare e public.scout_challenge_entries; begin
  -- Service-only; delete-account derives p_user from auth.getUser, never request JSON.
  for e in select * from public.scout_challenge_entries where user_id=p_user loop
    perform 1 from public.scout_challenge_weeks where id=e.week_id for update;
    update public.scout_challenge_entries set full_name='Deleted participant',email='deleted@invalid',state='',email_key='deleted:'||id::text,review_key='deleted:'||id::text,
      status=case when exists(select 1 from public.scout_challenge_drawings where week_id=e.week_id) then status else 'ineligible' end,
      review_reason='Account deleted; contact information removed' where id=e.id;
    insert into public.scout_challenge_audit(week_id,actor_id,action,record_id) values(e.week_id,p_user,'participant_contact_removed',e.id);
  end loop;
end $$;
-- Minimal server-stamped record metadata; no GPS or photographs enter the contest tables.
alter table public.observations add column scout_saved_at timestamptz, add column scout_created_at timestamptz;
create function public.scout_challenge_stamp_record() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then new.scout_saved_at=clock_timestamp(); new.scout_created_at=new.created_at;
  else new.scout_saved_at=old.scout_saved_at; new.scout_created_at=old.scout_created_at; end if;
  return new;
end $$;
create trigger scout_challenge_record_stamp before insert or update on public.observations for each row execute function public.scout_challenge_stamp_record();
create index scout_challenge_records_time on public.observations(user_id,scout_saved_at) where scout_saved_at is not null;
create schema scout_challenge_private;
revoke all on schema scout_challenge_private from public,anon,authenticated;
grant usage on schema scout_challenge_private to service_role;
-- Security-definer is limited to the private trigger helper. It never exposes observations.
create function scout_challenge_private.sync_user(p_user uuid,p_week integer) returns void language plpgsql security definer set search_path='' as $$
declare pref public.scout_challenge_preferences; mail text; name text; st text; acknowledged boolean; collision boolean; existing public.scout_challenge_entries; begin
  perform public.scout_challenge_lock_week(p_week,true);
  select * into pref from public.scout_challenge_preferences where user_id=p_user;
  if coalesce(pref.opted_out,false) then return; end if;
  insert into public.scout_challenge_progress(week_id,user_id,record_id,record_created_at,saved_at)
    select p_week,p_user,o.id,o.scout_created_at,o.scout_saved_at from public.observations o join public.scout_challenge_weeks w on w.id=p_week
    where o.user_id=p_user and o.scout_created_at>=w.starts_at and o.scout_created_at<w.ends_at and o.scout_saved_at>=w.starts_at and o.scout_saved_at<w.ends_at on conflict(record_id) do nothing;
  if (select count(*) from public.scout_challenge_progress where user_id=p_user and week_id=p_week)<10 then return; end if;
  select lower(trim(email)) into mail from auth.users where id=p_user and email_confirmed_at is not null;
  if mail is null then return; end if;
  name := left(coalesce(nullif(trim(pref.full_name),''),(select nullif(trim(display_name),'') from public.profiles where id=p_user),'Plant Scout participant'),100);
  st := coalesce(pref.state,''); acknowledged:=coalesce(pref.age_confirmed and pref.rules_acknowledged and st<>'' and length(pref.full_name)>=2,false);
  select * into existing from public.scout_challenge_entries where week_id=p_week and (email_key=mail or user_id=p_user);
  if existing.id is not null then
    if existing.method='app' and existing.status='withdrawn' then update public.scout_challenge_entries set status='pending',review_reason='Participation restored; review eligibility' where id=existing.id; end if;
    return;
  end if;
  collision := st<>'' and exists(select 1 from public.scout_challenge_entries where week_id=p_week and review_key=lower(name)||'|'||st);
  if collision then update public.scout_challenge_entries set status='pending',review_reason='Possible same person; manual review' where week_id=p_week and review_key=lower(name)||'|'||st; end if;
  insert into public.scout_challenge_entries(id,user_id,week_id,full_name,email,state,email_key,review_key,method,status,review_reason,age_confirmed)
    values(gen_random_uuid(),p_user,p_week,name,mail,st,mail,lower(name)||'|'||st,'app',case when acknowledged and not collision then 'eligible' else 'pending' end,case when collision then 'Possible same person; manual review' when not acknowledged then 'Confirm age, residence and rules' end,coalesce(pref.age_confirmed,false));
  insert into public.scout_challenge_audit(week_id,actor_id,action,details) values(p_week,p_user,'automatic_qualification',jsonb_build_object('saved_records',10));
end $$;
revoke all on function scout_challenge_private.sync_user(uuid,integer) from public,anon,authenticated;
grant execute on function scout_challenge_private.sync_user(uuid,integer) to service_role;
create function public.scout_challenge_sync_user(p_user uuid,p_week integer) returns void language plpgsql security invoker set search_path='' as $$
begin perform scout_challenge_private.sync_user(p_user,p_week); end $$;
create function scout_challenge_private.record_saved() returns trigger language plpgsql security definer set search_path='' as $$
declare week integer; begin
  -- The JWT identity must own the inserted record. No client can call this helper.
  if auth.uid() is null or auth.uid()<>new.user_id then return new; end if;
  if not exists(select 1 from public.scout_challenge_config where entries_enabled and reviewed_at is not null and reviewed_rules_version='bcn-scout-2026-draft-v2') then return new; end if;
  select id into week from public.scout_challenge_weeks where clock_timestamp()>=starts_at and clock_timestamp()<ends_at;
  if week is not null then perform scout_challenge_private.sync_user(new.user_id,week); end if;
  return new;
exception when others then
  -- Contest failures must not prevent normal saving. Authenticated status refresh retries.
  raise warning 'Weekly giveaway progress update deferred'; return new;
end $$;
revoke all on function scout_challenge_private.record_saved() from public,anon,authenticated;
create trigger scout_challenge_new_record after insert on public.observations for each row execute function scout_challenge_private.record_saved();
create function public.scout_challenge_preferences(p_user uuid,p_opted_out boolean,p_name text,p_state text,p_age boolean,p_consent boolean) returns void language plpgsql security invoker set search_path='' as $$
declare week integer; previous_week integer; begin
  select id into strict week from public.scout_challenge_weeks where clock_timestamp()>=starts_at and clock_timestamp()<ends_at;
  perform public.scout_challenge_lock_week(week,true);
  if p_state<>'' and p_state<>all(string_to_array('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC',' ')) then raise exception 'Ineligible state'; end if;
  insert into public.scout_challenge_preferences(user_id,opted_out,full_name,state,age_confirmed,rules_acknowledged)
    values(p_user,p_opted_out,nullif(trim(p_name),''),nullif(p_state,''),p_age,p_consent)
    on conflict(user_id) do update set opted_out=p_opted_out,full_name=coalesce(excluded.full_name,public.scout_challenge_preferences.full_name),state=coalesce(excluded.state,public.scout_challenge_preferences.state),age_confirmed=public.scout_challenge_preferences.age_confirmed or p_age,rules_acknowledged=public.scout_challenge_preferences.rules_acknowledged or p_consent,updated_at=clock_timestamp();
  if p_opted_out then
    for previous_week in select distinct e.week_id from public.scout_challenge_entries e where e.user_id=p_user and e.method='app' and not exists(select 1 from public.scout_challenge_drawings d where d.week_id=e.week_id) order by e.week_id loop
      perform 1 from public.scout_challenge_weeks where id=previous_week for update;
      update public.scout_challenge_entries set status='withdrawn',review_reason='Opted out of automatic app participation' where user_id=p_user and method='app' and week_id=previous_week;
    end loop;
  else
    update public.scout_challenge_entries set full_name=coalesce(nullif(trim(p_name),''),full_name),state=coalesce(nullif(p_state,''),state),age_confirmed=age_confirmed or p_age,status='pending',review_reason='Eligibility details changed; review required' where user_id=p_user and method='app' and week_id=week;
    perform scout_challenge_private.sync_user(p_user,week);
  end if;
  insert into public.scout_challenge_audit(week_id,actor_id,action,details) values(week,p_user,'participation_preferences_updated',jsonb_build_object('opted_out',p_opted_out));
end $$;
-- Postgres grants EXECUTE to PUBLIC by default: explicitly deny every contest function.
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'scout_challenge_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;
