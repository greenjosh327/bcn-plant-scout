-- BCN Shop order tables and inventory helpers.
-- Run this after 20260703_bcn_catalog_schema.sql.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_name text,
  customer_email text,
  phone text,
  order_status text not null default 'new'
    check (order_status in ('new', 'ready_for_pickup', 'shipped', 'fulfilled', 'cancelled', 'refunded')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('paid', 'unpaid', 'no_payment_required', 'refunded', 'failed')),
  fulfillment_type text not null default 'pickup'
    check (fulfillment_type in ('pickup', 'shipping')),
  pickup_location text,
  shipping_address jsonb not null default '{}'::jsonb,
  subtotal numeric(10, 2) not null default 0,
  shipping_cost numeric(10, 2) not null default 0,
  tax numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  currency text not null default 'usd',
  notes text,
  fulfilled_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  variant_id text references public.product_variants(id) on delete set null,
  sku text,
  product_name text not null,
  variant_name text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null default 0,
  line_total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.products
add column if not exists sold_out boolean not null default false;

alter table public.product_variants
add column if not exists sold_out boolean not null default false;

create index if not exists orders_customer_email_idx on public.orders(customer_email);
create index if not exists orders_status_idx on public.orders(order_status, payment_status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_variant_id_idx on public.order_items(variant_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_orders_updated_at on public.orders;
create trigger touch_orders_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

create or replace function public.decrement_product_variant_inventory(
  target_variant_id text,
  purchased_quantity integer
)
returns void
language plpgsql
as $$
declare
  parent_product_id text;
  remaining_inventory integer;
begin
  if purchased_quantity <= 0 then
    return;
  end if;

  update public.product_variants
  set inventory = greatest(inventory - purchased_quantity, 0),
      sold_out = greatest(inventory - purchased_quantity, 0) <= 0,
      updated_at = now()
  where id = target_variant_id
  returning product_id, inventory into parent_product_id, remaining_inventory;

  if parent_product_id is not null then
    update public.products
    set inventory = coalesce((
          select sum(inventory)::integer
          from public.product_variants
          where product_id = parent_product_id
        ), 0),
        sold_out = coalesce((
          select sum(inventory)::integer
          from public.product_variants
          where product_id = parent_product_id
        ), 0) <= 0,
        updated_at = now()
    where id = parent_product_id;
  end if;
end;
$$;

create or replace function public.decrement_product_inventory(
  target_product_id text,
  purchased_quantity integer
)
returns void
language plpgsql
as $$
begin
  if purchased_quantity <= 0 then
    return;
  end if;

  update public.products
  set inventory = greatest(inventory - purchased_quantity, 0),
      sold_out = greatest(inventory - purchased_quantity, 0) <= 0,
      updated_at = now()
  where id = target_product_id;
end;
$$;

revoke all on function public.decrement_product_variant_inventory(text, integer) from public, anon, authenticated;
revoke all on function public.decrement_product_inventory(text, integer) from public, anon, authenticated;
grant execute on function public.decrement_product_variant_inventory(text, integer) to service_role;
grant execute on function public.decrement_product_inventory(text, integer) to service_role;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

grant select, update on public.orders to authenticated;
grant select, update on public.order_items to authenticated;

drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders"
on public.orders for select
to authenticated
using (
  exists (
    select 1 from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
on public.orders for update
to authenticated
using (
  exists (
    select 1 from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can read order items" on public.order_items;
create policy "Admins can read order items"
on public.order_items for select
to authenticated
using (
  exists (
    select 1 from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);
