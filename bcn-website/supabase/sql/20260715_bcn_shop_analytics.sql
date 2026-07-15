-- BCN Shop first-party analytics.
-- Public pages write through /api/analytics/event with the service role.
-- Admin reads aggregate summaries through /api/admin/analytics.

create table if not exists public.shop_analytics_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_name text not null
    check (event_name in ('page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase')),
  visitor_id text,
  session_id text,
  path text not null default '/',
  page_title text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  product_id text references public.products(id) on delete set null,
  product_slug text,
  product_name text,
  variant_id text references public.product_variants(id) on delete set null,
  variant_name text,
  quantity integer check (quantity is null or quantity > 0),
  value_cents integer check (value_cents is null or value_cents >= 0),
  currency text not null default 'usd',
  order_id uuid references public.orders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists shop_analytics_events_created_at_idx
on public.shop_analytics_events(created_at desc);

create index if not exists shop_analytics_events_event_created_idx
on public.shop_analytics_events(event_name, created_at desc);

create index if not exists shop_analytics_events_product_created_idx
on public.shop_analytics_events(product_id, created_at desc)
where product_id is not null;

create index if not exists shop_analytics_events_session_idx
on public.shop_analytics_events(session_id)
where session_id is not null;

create index if not exists shop_analytics_events_utm_idx
on public.shop_analytics_events(utm_source, utm_campaign, created_at desc)
where utm_source is not null or utm_campaign is not null;

alter table public.shop_analytics_events enable row level security;

revoke all on public.shop_analytics_events from anon, authenticated;

drop policy if exists "Admins can read shop analytics events" on public.shop_analytics_events;
create policy "Admins can read shop analytics events"
on public.shop_analytics_events for select
to authenticated
using (
  exists (
    select 1 from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);
