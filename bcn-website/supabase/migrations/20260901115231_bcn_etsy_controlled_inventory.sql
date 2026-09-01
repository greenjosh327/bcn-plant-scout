-- Phase 2: controlled Etsy inventory proposals and audited physical seed-pack reconciliation.
-- Etsy writes remain application-gated and are never performed by this migration.

alter table public.inventory_ledger
  add column if not exists reference_key text;

create unique index if not exists inventory_ledger_reference_key_unique
  on public.inventory_ledger(reference_key)
  where reference_key is not null;

comment on column public.inventory_ledger.reference_key is
  'Optional idempotency key for an externally approved inventory adjustment or reconciliation.';

-- These inventory-only seed products remain hidden from the public catalog. They provide
-- an unambiguous BCN stock identity for Etsy mapping without reusing the Catalpa plant or
-- the Staghorn Sumac seed product.
insert into public.products (
  id,
  slug,
  name,
  scientific_name,
  common_name,
  category,
  description,
  price,
  inventory,
  active,
  local_pickup,
  ships,
  source
)
values
  (
    'prod_catalpa-speciosa-seeds',
    'northern-catalpa-catalpa-speciosa-seeds',
    'Northern Catalpa (Catalpa speciosa) Seeds',
    'Catalpa speciosa',
    'Catalpa',
    'Seeds',
    'Inventory-only BCN record for finished 25-seed packs.',
    5.00,
    0,
    false,
    true,
    true,
    'BCN owner inventory reconciliation 2026-09-01'
  ),
  (
    'prod_fragrant-sumac-seeds',
    'fragrant-sumac-rhus-aromatica-seeds',
    'Fragrant Sumac (Rhus aromatica) Seeds',
    'Rhus aromatica',
    'Fragrant Sumac',
    'Seeds',
    'Inventory-only BCN record for finished 25-seed packs. Not Staghorn Sumac.',
    5.00,
    0,
    false,
    true,
    true,
    'BCN owner inventory reconciliation 2026-09-01'
  )
on conflict (id) do nothing;

-- Red Elderberry is standardized to 25- and 100-seed options in BCN.
update public.product_variants
set
  name = 'Pack of 25',
  sku = 'BCN-2026-REB-25',
  packs_consumed = 1,
  updated_at = now()
where id = 'var_7eeb5bb1-9b86-41b3-9c49-2128c08a4070'
  and product_id = 'prod_c747934f-4a0c-4850-a205-e90a8c1f0dc5';

update public.product_variants
set
  name = 'Pack of 100',
  packs_consumed = 4,
  updated_at = now()
where id = 'var_e0bbf738-ebb2-43eb-9c2f-cda9976a8402'
  and product_id = 'prod_c747934f-4a0c-4850-a205-e90a8c1f0dc5';

-- Apply the owner-approved physical count snapshot once. Each unit is one finished
-- 25-seed pack. The unique ledger reference prevents a rerun from resetting stock
-- after later sales or from creating duplicate history.
do $$
declare
  inventory_item record;
  previous_quantity integer;
  reconciliation_admin uuid;
begin
  select connection.admin_user_id
  into reconciliation_admin
  from public.etsy_connections connection
  join public.bcn_admins admin on admin.user_id = connection.admin_user_id
  where connection.id = 'basecampnorthpa';

  for inventory_item in
    select *
    from (values
      ('prod_catalpa-speciosa-seeds', 2, 'etsy-phase2-20260901-catalpa'),
      ('prod_fragrant-sumac-seeds', 52, 'etsy-phase2-20260901-fragrant-sumac'),
      ('prod_donald-wyman-crabapple-seeds', 36, 'etsy-phase2-20260901-donald-wyman-crabapple'),
      ('prod_prairifire-crabapple-seeds', 1, 'etsy-phase2-20260901-prairifire-crabapple'),
      ('prod_6365ffae-5dda-4d0c-84e6-90b20469d2b1', 34, 'etsy-phase2-20260901-black-huckleberry'),
      ('prod_373a4d3c-96b8-493b-a1b1-edf62ada5fb5', 12, 'etsy-phase2-20260901-beach-plum'),
      ('prod_0b70691c-58ab-45d0-b392-87f19b0433bf', 3, 'etsy-phase2-20260901-black-cherry'),
      ('prod_bb82b070-4894-4f5e-b332-660b47584560', 10, 'etsy-phase2-20260901-black-chokeberry'),
      ('prod_c747934f-4a0c-4850-a205-e90a8c1f0dc5', 14, 'etsy-phase2-20260901-red-elderberry')
    ) as approved_inventory(product_id, target_quantity, reference_key)
  loop
    if exists (
      select 1
      from public.inventory_ledger ledger
      where ledger.reference_key = inventory_item.reference_key
    ) then
      continue;
    end if;

    select product.inventory
    into previous_quantity
    from public.products product
    where product.id = inventory_item.product_id
    for update;

    if previous_quantity is null then
      raise exception 'Approved seed inventory product % was not found', inventory_item.product_id;
    end if;

    if previous_quantity <> inventory_item.target_quantity then
      update public.products
      set
        inventory = inventory_item.target_quantity,
        sold_out = inventory_item.target_quantity <= 0,
        updated_at = now()
      where id = inventory_item.product_id;

      insert into public.inventory_ledger (
        product_id,
        quantity_change,
        reason,
        created_by,
        reference_key
      )
      values (
        inventory_item.product_id,
        inventory_item.target_quantity - previous_quantity,
        'correction',
        reconciliation_admin,
        inventory_item.reference_key
      );
    end if;
  end loop;
end
$$;

create table if not exists public.etsy_listing_mappings (
  id bigint generated always as identity primary key,
  connection_id text not null default 'basecampnorthpa'
    references public.etsy_connections(id) on delete cascade,
  shop_id bigint not null check (shop_id > 0),
  listing_id bigint not null check (listing_id > 0),
  listing_title text not null default '',
  bcn_product_id text references public.products(id) on delete restrict,
  status text not null check (status in ('suggested', 'confirmed', 'manual_review', 'blocked')),
  match_method text,
  block_reason text,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, listing_id)
);

create table if not exists public.etsy_variation_mappings (
  id bigint generated always as identity primary key,
  listing_mapping_id bigint not null
    references public.etsy_listing_mappings(id) on delete cascade,
  etsy_product_id bigint not null check (etsy_product_id > 0),
  etsy_offering_id bigint not null check (etsy_offering_id > 0),
  bcn_variant_id text references public.product_variants(id) on delete set null,
  sku text,
  variation_label text not null,
  variation_fingerprint text not null,
  packs_consumed integer check (packs_consumed in (1, 4)),
  status text not null check (status in ('suggested', 'confirmed', 'manual_review', 'blocked')),
  block_reason text,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_mapping_id, etsy_product_id, etsy_offering_id)
);

create table if not exists public.etsy_inventory_change_sets (
  id uuid primary key default gen_random_uuid(),
  connection_id text not null default 'basecampnorthpa'
    references public.etsy_connections(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null unique,
  source_fingerprint text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'applying', 'completed', 'partial', 'failed', 'stale', 'cancelled')),
  expires_at timestamptz not null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  completed_at timestamptz,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.etsy_inventory_change_items (
  id bigint generated always as identity primary key,
  change_set_id uuid not null
    references public.etsy_inventory_change_sets(id) on delete restrict,
  listing_mapping_id bigint
    references public.etsy_listing_mappings(id) on delete restrict,
  variation_mapping_id bigint
    references public.etsy_variation_mappings(id) on delete restrict,
  bcn_product_id text references public.products(id) on delete restrict,
  species text,
  shop_id bigint not null check (shop_id > 0),
  listing_id bigint not null check (listing_id > 0),
  listing_title text not null,
  etsy_product_id bigint not null check (etsy_product_id > 0),
  etsy_offering_id bigint not null check (etsy_offering_id > 0),
  sku text,
  variation_name text not null,
  packs_consumed integer check (packs_consumed in (1, 4)),
  before_quantity integer not null check (before_quantity >= 0),
  proposed_quantity integer not null check (proposed_quantity >= 0),
  before_pack_commitment integer check (before_pack_commitment >= 0),
  proposed_pack_commitment integer check (proposed_pack_commitment >= 0),
  physical_pack_inventory integer check (physical_pack_inventory >= 0),
  warning_status text not null,
  result_status text not null default 'proposed'
    check (result_status in ('proposed', 'no_change', 'blocked', 'succeeded', 'failed', 'skipped', 'unknown')),
  etsy_status_code integer,
  etsy_error_message text,
  verified_quantity integer check (verified_quantity is null or verified_quantity >= 0),
  attempted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (change_set_id, listing_id, etsy_product_id, etsy_offering_id)
);

create index if not exists etsy_listing_mappings_bcn_product_idx
  on public.etsy_listing_mappings(bcn_product_id);
create index if not exists etsy_variation_mappings_listing_idx
  on public.etsy_variation_mappings(listing_mapping_id);
create index if not exists etsy_variation_mappings_bcn_variant_idx
  on public.etsy_variation_mappings(bcn_variant_id);
create index if not exists etsy_inventory_change_sets_admin_created_idx
  on public.etsy_inventory_change_sets(admin_user_id, created_at desc);
create index if not exists etsy_inventory_change_items_change_set_idx
  on public.etsy_inventory_change_items(change_set_id);
create index if not exists etsy_inventory_change_items_product_created_idx
  on public.etsy_inventory_change_items(bcn_product_id, created_at desc);
create index if not exists etsy_inventory_change_items_listing_idx
  on public.etsy_inventory_change_items(listing_id);
create index if not exists etsy_inventory_change_items_listing_mapping_idx
  on public.etsy_inventory_change_items(listing_mapping_id);
create index if not exists etsy_inventory_change_items_variation_mapping_idx
  on public.etsy_inventory_change_items(variation_mapping_id);

alter table public.etsy_listing_mappings enable row level security;
alter table public.etsy_variation_mappings enable row level security;
alter table public.etsy_inventory_change_sets enable row level security;
alter table public.etsy_inventory_change_items enable row level security;

revoke all on table public.etsy_listing_mappings from public, anon, authenticated, service_role;
revoke all on table public.etsy_variation_mappings from public, anon, authenticated, service_role;
revoke all on table public.etsy_inventory_change_sets from public, anon, authenticated, service_role;
revoke all on table public.etsy_inventory_change_items from public, anon, authenticated, service_role;

grant select, insert, update on table public.etsy_listing_mappings to service_role;
grant select, insert, update on table public.etsy_variation_mappings to service_role;
grant select, insert, update on table public.etsy_inventory_change_sets to service_role;
grant select, insert, update on table public.etsy_inventory_change_items to service_role;

grant usage, select on sequence public.etsy_listing_mappings_id_seq to service_role;
grant usage, select on sequence public.etsy_variation_mappings_id_seq to service_role;
grant usage, select on sequence public.etsy_inventory_change_items_id_seq to service_role;

drop trigger if exists touch_etsy_listing_mappings_updated_at on public.etsy_listing_mappings;
create trigger touch_etsy_listing_mappings_updated_at
before update on public.etsy_listing_mappings
for each row execute function public.touch_updated_at();

drop trigger if exists touch_etsy_variation_mappings_updated_at on public.etsy_variation_mappings;
create trigger touch_etsy_variation_mappings_updated_at
before update on public.etsy_variation_mappings
for each row execute function public.touch_updated_at();

drop trigger if exists touch_etsy_inventory_change_sets_updated_at on public.etsy_inventory_change_sets;
create trigger touch_etsy_inventory_change_sets_updated_at
before update on public.etsy_inventory_change_sets
for each row execute function public.touch_updated_at();

comment on table public.etsy_listing_mappings is
  'Server-only, owner-reviewed mapping between an Etsy listing and one BCN physical seed inventory product.';
comment on table public.etsy_variation_mappings is
  'Server-only, owner-reviewed mapping from an Etsy offering to its physical 25-seed-pack consumption.';
comment on table public.etsy_inventory_change_sets is
  'Expiring, idempotent owner-admin Etsy inventory proposals and approval state.';
comment on table public.etsy_inventory_change_items is
  'Immutable proposal snapshots plus verified per-offering Etsy inventory write results.';
