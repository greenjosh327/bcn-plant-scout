-- Adds seed-pack inventory, bundle products, and inventory history for BCN Shop.

alter table public.products
  add column if not exists product_type text not null default 'standard';

alter table public.products
  drop constraint if exists products_product_type_check,
  add constraint products_product_type_check check (product_type in ('standard', 'bundle'));

alter table public.product_variants
  add column if not exists packs_consumed integer not null default 1;

alter table public.product_variants
  drop constraint if exists product_variants_packs_consumed_check,
  add constraint product_variants_packs_consumed_check check (packs_consumed > 0);

update public.product_variants variant
set packs_consumed = greatest(
  1,
  ceil(
    coalesce(
      nullif(substring(variant.name from '([0-9]+)'), '')::numeric,
      25
    ) / 25.0
  )::integer
)
from public.products product
where product.id = variant.product_id
  and product.category = 'Seeds'
  and variant.packs_consumed = 1;

create table if not exists public.bundle_components (
  id text primary key,
  bundle_product_id text not null references public.products(id) on delete cascade,
  component_product_id text not null references public.products(id) on delete restrict,
  component_variant_id text references public.product_variants(id) on delete set null,
  packs_consumed integer not null default 1 check (packs_consumed > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bundle_components_not_self check (bundle_product_id <> component_product_id)
);

create unique index if not exists bundle_components_unique_component
  on public.bundle_components(bundle_product_id, component_product_id, (coalesce(component_variant_id, '')));

create index if not exists bundle_components_bundle_sort_idx
  on public.bundle_components(bundle_product_id, sort_order);

create index if not exists bundle_components_component_product_idx
  on public.bundle_components(component_product_id);

drop trigger if exists touch_bundle_components_updated_at on public.bundle_components;
create trigger touch_bundle_components_updated_at
before update on public.bundle_components
for each row execute function public.touch_updated_at();

create table if not exists public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete restrict,
  variant_id text references public.product_variants(id) on delete set null,
  quantity_change integer not null check (quantity_change <> 0),
  reason text not null check (reason in ('manual_adjustment', 'sale', 'bundle_sale', 'return', 'restock', 'correction')),
  order_id uuid references public.orders(id) on delete set null,
  bundle_product_id text references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists inventory_ledger_product_created_idx
  on public.inventory_ledger(product_id, created_at desc);

create index if not exists inventory_ledger_order_idx
  on public.inventory_ledger(order_id);

alter table public.orders
  add column if not exists inventory_deducted_at timestamptz,
  add column if not exists inventory_returned_at timestamptz,
  add column if not exists inventory_deduction_error text;

update public.orders
set inventory_deducted_at = created_at
where inventory_deducted_at is null
  and payment_status = 'paid'
  and exists (
    select 1 from public.order_items
    where order_items.order_id = orders.id
  );

create or replace function public.bcn_order_inventory_requirements(target_order_id uuid)
returns table (
  product_id text,
  variant_id text,
  quantity_required integer,
  reason text,
  bundle_product_id text
)
language sql
stable
as $$
  with raw_requirements as (
    select
      case
        when product.product_type = 'bundle' then component.component_product_id
        else item.product_id
      end as product_id,
      case
        when product.product_type = 'bundle' then component.component_variant_id
        else item.variant_id
      end as variant_id,
      case
        when product.product_type = 'bundle' then item.quantity * component.packs_consumed
        when product.category = 'Seeds' then item.quantity * coalesce(variant.packs_consumed, 1)
        else item.quantity
      end as quantity_required,
      case
        when product.product_type = 'bundle' then 'bundle_sale'
        else 'sale'
      end as reason,
      case
        when product.product_type = 'bundle' then product.id
        else null
      end as bundle_product_id
    from public.order_items item
    join public.products product on product.id = item.product_id
    left join public.product_variants variant on variant.id = item.variant_id
    left join public.bundle_components component on component.bundle_product_id = product.id
    where item.order_id = target_order_id
      and item.product_id is not null
  )
  select
    raw_requirements.product_id,
    raw_requirements.variant_id,
    sum(raw_requirements.quantity_required)::integer as quantity_required,
    case
      when bool_or(raw_requirements.reason = 'bundle_sale') then 'bundle_sale'
      else 'sale'
    end as reason,
    raw_requirements.bundle_product_id
  from raw_requirements
  where raw_requirements.product_id is not null
  group by raw_requirements.product_id, raw_requirements.variant_id, raw_requirements.bundle_product_id;
$$;

create or replace function public.deduct_order_inventory(target_order_id uuid)
returns jsonb
language plpgsql
as $$
declare
  order_row public.orders%rowtype;
  requirement record;
  product_row public.products%rowtype;
  variant_row public.product_variants%rowtype;
  available_inventory integer;
  adjusted_count integer := 0;
begin
  select * into order_row
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order % was not found.', target_order_id;
  end if;

  if order_row.payment_status <> 'paid' then
    raise exception 'Order % is not paid.', target_order_id;
  end if;

  if order_row.inventory_deducted_at is not null then
    return jsonb_build_object('status', 'already_deducted', 'order_id', target_order_id);
  end if;

  if not exists (select 1 from public.order_items where order_id = target_order_id) then
    raise exception 'Order % has no items to deduct.', target_order_id;
  end if;

  if exists (
    select 1
    from public.order_items item
    join public.products product on product.id = item.product_id
    where item.order_id = target_order_id
      and product.product_type = 'bundle'
      and not exists (
        select 1 from public.bundle_components component
        where component.bundle_product_id = product.id
      )
  ) then
    raise exception 'Bundle order % has a bundle without components.', target_order_id;
  end if;

  for requirement in
    select *
    from public.bcn_order_inventory_requirements(target_order_id)
    order by product_id, coalesce(variant_id, '')
  loop
    select * into product_row
    from public.products
    where id = requirement.product_id
    for update;

    if not found then
      raise exception 'Inventory product % was not found.', requirement.product_id;
    end if;

    if requirement.variant_id is not null
      and product_row.category <> 'Seeds'
      and requirement.reason <> 'bundle_sale'
    then
      select * into variant_row
      from public.product_variants
      where id = requirement.variant_id
      for update;

      if not found then
        raise exception 'Inventory variant % was not found.', requirement.variant_id;
      end if;

      available_inventory := greatest(0, variant_row.inventory);
      if available_inventory < requirement.quantity_required then
        raise exception 'Insufficient inventory for %. Required %, available %.',
          product_row.name, requirement.quantity_required, available_inventory;
      end if;

      update public.product_variants
      set inventory = inventory - requirement.quantity_required,
          sold_out = (inventory - requirement.quantity_required) <= 0,
          updated_at = now()
      where id = requirement.variant_id;

      update public.products
      set inventory = coalesce((
            select sum(greatest(inventory, 0))::integer
            from public.product_variants
            where product_id = product_row.id
              and active = true
          ), 0),
          sold_out = coalesce((
            select sum(greatest(inventory, 0))::integer
            from public.product_variants
            where product_id = product_row.id
              and active = true
          ), 0) <= 0,
          updated_at = now()
      where id = product_row.id;
    else
      available_inventory := greatest(0, product_row.inventory);
      if available_inventory < requirement.quantity_required then
        raise exception 'Insufficient inventory for %. Required %, available %.',
          product_row.name, requirement.quantity_required, available_inventory;
      end if;

      update public.products
      set inventory = inventory - requirement.quantity_required,
          sold_out = (inventory - requirement.quantity_required) <= 0,
          updated_at = now()
      where id = product_row.id;
    end if;

    insert into public.inventory_ledger (
      product_id,
      variant_id,
      quantity_change,
      reason,
      order_id,
      bundle_product_id
    )
    values (
      requirement.product_id,
      requirement.variant_id,
      -requirement.quantity_required,
      requirement.reason,
      target_order_id,
      requirement.bundle_product_id
    );

    adjusted_count := adjusted_count + 1;
  end loop;

  update public.orders
  set inventory_deducted_at = now(),
      inventory_deduction_error = null,
      updated_at = now()
  where id = target_order_id;

  return jsonb_build_object('status', 'deducted', 'order_id', target_order_id, 'adjustments', adjusted_count);
end;
$$;

create or replace function public.return_order_inventory(target_order_id uuid, target_created_by uuid default null)
returns jsonb
language plpgsql
as $$
declare
  order_row public.orders%rowtype;
  requirement record;
  product_row public.products%rowtype;
  adjusted_count integer := 0;
begin
  select * into order_row
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order % was not found.', target_order_id;
  end if;

  if order_row.inventory_deducted_at is null then
    raise exception 'Inventory was not deducted for order %.', target_order_id;
  end if;

  if order_row.inventory_returned_at is not null then
    return jsonb_build_object('status', 'already_returned', 'order_id', target_order_id);
  end if;

  for requirement in
    select *
    from public.bcn_order_inventory_requirements(target_order_id)
    order by product_id, coalesce(variant_id, '')
  loop
    select * into product_row
    from public.products
    where id = requirement.product_id
    for update;

    if requirement.variant_id is not null
      and product_row.category <> 'Seeds'
      and requirement.reason <> 'bundle_sale'
    then
      update public.product_variants
      set inventory = inventory + requirement.quantity_required,
          sold_out = false,
          updated_at = now()
      where id = requirement.variant_id;

      update public.products
      set inventory = coalesce((
            select sum(greatest(inventory, 0))::integer
            from public.product_variants
            where product_id = product_row.id
              and active = true
          ), 0),
          sold_out = false,
          updated_at = now()
      where id = product_row.id;
    else
      update public.products
      set inventory = inventory + requirement.quantity_required,
          sold_out = false,
          updated_at = now()
      where id = product_row.id;
    end if;

    insert into public.inventory_ledger (
      product_id,
      variant_id,
      quantity_change,
      reason,
      order_id,
      bundle_product_id,
      created_by
    )
    values (
      requirement.product_id,
      requirement.variant_id,
      requirement.quantity_required,
      'return',
      target_order_id,
      requirement.bundle_product_id,
      target_created_by
    );

    adjusted_count := adjusted_count + 1;
  end loop;

  update public.orders
  set inventory_returned_at = now(),
      updated_at = now()
  where id = target_order_id;

  return jsonb_build_object('status', 'returned', 'order_id', target_order_id, 'adjustments', adjusted_count);
end;
$$;

revoke all on function public.bcn_order_inventory_requirements(uuid) from public, anon, authenticated;
revoke all on function public.deduct_order_inventory(uuid) from public, anon, authenticated;
revoke all on function public.return_order_inventory(uuid, uuid) from public, anon, authenticated;
grant execute on function public.bcn_order_inventory_requirements(uuid) to service_role;
grant execute on function public.deduct_order_inventory(uuid) to service_role;
grant execute on function public.return_order_inventory(uuid, uuid) to service_role;

alter table public.bundle_components enable row level security;
alter table public.inventory_ledger enable row level security;

grant select on public.bundle_components to anon, authenticated;
grant insert, update, delete on public.bundle_components to authenticated;
grant select on public.inventory_ledger to authenticated;
grant insert on public.inventory_ledger to authenticated;

drop policy if exists "Public can read active bundle components" on public.bundle_components;
create policy "Public can read active bundle components"
on public.bundle_components for select
to anon, authenticated
using (
  exists (
    select 1 from public.products bundle
    where bundle.id = bundle_components.bundle_product_id
      and bundle.active = true
      and bundle.product_type = 'bundle'
  )
  and exists (
    select 1 from public.products component
    where component.id = bundle_components.component_product_id
      and component.active = true
  )
);

drop policy if exists "Admins can manage bundle components" on public.bundle_components;
create policy "Admins can manage bundle components"
on public.bundle_components for all
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

drop policy if exists "Admins can read inventory ledger" on public.inventory_ledger;
create policy "Admins can read inventory ledger"
on public.inventory_ledger for select
to authenticated
using (
  exists (
    select 1 from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can insert inventory ledger" on public.inventory_ledger;
create policy "Admins can insert inventory ledger"
on public.inventory_ledger for insert
to authenticated
with check (
  exists (
    select 1 from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);

insert into public.products (
  id,
  slug,
  name,
  common_name,
  category,
  description,
  price,
  inventory,
  product_type,
  featured,
  active,
  ships,
  local_pickup,
  shipping_class,
  shipping_enabled,
  local_pickup_enabled,
  packed_weight_oz,
  ships_alone,
  expedited_required,
  allow_ground_advantage,
  free_shipping_eligible,
  shipping_surcharge_cents,
  max_quantity_per_package,
  preferred_package_id,
  shipping_configuration_complete,
  native_status,
  sunlight,
  soil,
  bloom_time,
  wildlife_benefits,
  pollinator_benefits,
  host_species,
  growing_notes,
  planting_instructions,
  shipping_notes,
  tags,
  source
)
values
  (
    'prod_wildlife-habitat-seed-collection',
    'wildlife-habitat-seed-collection',
    'Wildlife Habitat Seed Collection',
    'Wildlife habitat seed collection',
    'Seeds',
    'A small-batch collection of native Pennsylvania tree and shrub seeds selected for birds, wildlife food, woodland edges, and habitat restoration. Includes approximately 125 seeds across five individually packaged and labeled species gathered, cleaned, processed, and packed by Josh with help from a few friends.',
    24.99,
    0,
    'bundle',
    true,
    true,
    true,
    false,
    'seed_package',
    true,
    false,
    1.2,
    false,
    false,
    true,
    false,
    0,
    4,
    'preset_small_padded_mailer',
    true,
    'Pennsylvania native and Eastern North America',
    'Does Not Apply',
    'Does Not Apply',
    'Does Not Apply',
    'Very High',
    'Moderate',
    'Not Known',
    'A practical starter collection for wildlife plantings, native landscaping, woodland edges, and restoration projects.',
    'Each species is packaged separately. Follow the germination notes on the individual seed packets for each species.',
    'Ships as a seed package with the included species packed together in one mailer or small package.',
    array['bundle','collection','seeds','wildlife','habitat','native','pennsylvania'],
    'manual'
  ),
  (
    'prod_native-berry-food-forest-seed-collection',
    'native-berry-food-forest-seed-collection',
    'Native Berry & Food Forest Seed Collection',
    'Native berry and food forest seed collection',
    'Seeds',
    'A small-batch native berry and food forest seed collection for edible landscaping, homesteads, wildlife gardens, and restoration-minded plantings. Includes approximately 100 seeds across four individually packaged and labeled species gathered, cleaned, processed, and packed by Josh with help from a few friends.',
    19.99,
    0,
    'bundle',
    true,
    true,
    true,
    false,
    'seed_package',
    true,
    false,
    1.0,
    false,
    false,
    true,
    false,
    0,
    4,
    'preset_small_padded_mailer',
    true,
    'Pennsylvania native and Eastern North America',
    'Does Not Apply',
    'Does Not Apply',
    'Does Not Apply',
    'High',
    'Moderate',
    'Not Known',
    'Selected for native edible landscaping, food forest projects, and wildlife value.',
    'Each species is packaged separately. Follow the germination notes on the individual seed packets for each species.',
    'Ships as a seed package with the included species packed together in one mailer or small package.',
    array['bundle','collection','seeds','berry','food forest','native','pennsylvania'],
    'manual'
  ),
  (
    'prod_pennsylvania-native-seed-collection',
    'pennsylvania-native-tree-shrub-seed-collection',
    'Pennsylvania Native Tree & Shrub Seed Collection',
    'Pennsylvania native tree and shrub seed collection',
    'Seeds',
    'A small-batch Pennsylvania native seed collection for people starting habitat, wildlife, woodland-edge, and restoration plantings. Includes approximately 125 seeds across five individually packaged and labeled species gathered, cleaned, processed, and packed by Josh with help from a few friends.',
    24.99,
    0,
    'bundle',
    true,
    true,
    true,
    false,
    'seed_package',
    true,
    false,
    1.2,
    false,
    false,
    true,
    false,
    0,
    4,
    'preset_small_padded_mailer',
    true,
    'Pennsylvania native and Eastern North America',
    'Does Not Apply',
    'Does Not Apply',
    'Does Not Apply',
    'Very High',
    'Moderate',
    'Not Known',
    'Built around native Pennsylvania trees and shrubs useful for wildlife habitat and resilient plantings.',
    'Each species is packaged separately. Follow the germination notes on the individual seed packets for each species.',
    'Ships as a seed package with the included species packed together in one mailer or small package.',
    array['bundle','collection','seeds','native','tree','shrub','pennsylvania'],
    'manual'
  )
on conflict (id) do update
set product_type = excluded.product_type,
    price = excluded.price,
    active = excluded.active,
    featured = excluded.featured,
    ships = excluded.ships,
    local_pickup = excluded.local_pickup,
    shipping_class = excluded.shipping_class,
    shipping_enabled = excluded.shipping_enabled,
    local_pickup_enabled = excluded.local_pickup_enabled,
    packed_weight_oz = excluded.packed_weight_oz,
    max_quantity_per_package = excluded.max_quantity_per_package,
    preferred_package_id = excluded.preferred_package_id,
    shipping_configuration_complete = excluded.shipping_configuration_complete,
    description = excluded.description,
    tags = excluded.tags,
    updated_at = now();

with component_source(bundle_id, component_slug, sort_order) as (
  values
    ('prod_wildlife-habitat-seed-collection', 'black-cherry-seeds', 10),
    ('prod_wildlife-habitat-seed-collection', 'staghorn-sumac-seeds', 20),
    ('prod_wildlife-habitat-seed-collection', 'black-huckleberry-gaylussacia-baccata-seeds', 30),
    ('prod_wildlife-habitat-seed-collection', 'black-chokeberry-aronia-melanocarpa-seeds', 40),
    ('prod_wildlife-habitat-seed-collection', 'red-elderberry-sambucus-racemosa-seeds', 50),
    ('prod_native-berry-food-forest-seed-collection', 'beach-plum-seeds', 10),
    ('prod_native-berry-food-forest-seed-collection', 'black-huckleberry-gaylussacia-baccata-seeds', 20),
    ('prod_native-berry-food-forest-seed-collection', 'black-chokeberry-aronia-melanocarpa-seeds', 30),
    ('prod_native-berry-food-forest-seed-collection', 'red-elderberry-sambucus-racemosa-seeds', 40),
    ('prod_pennsylvania-native-seed-collection', 'black-cherry-seeds', 10),
    ('prod_pennsylvania-native-seed-collection', 'staghorn-sumac-seeds', 20),
    ('prod_pennsylvania-native-seed-collection', 'black-huckleberry-gaylussacia-baccata-seeds', 30),
    ('prod_pennsylvania-native-seed-collection', 'black-chokeberry-aronia-melanocarpa-seeds', 40),
    ('prod_pennsylvania-native-seed-collection', 'red-elderberry-sambucus-racemosa-seeds', 50)
)
insert into public.bundle_components (
  id,
  bundle_product_id,
  component_product_id,
  component_variant_id,
  packs_consumed,
  sort_order
)
select
  'bc_' || component_source.bundle_id || '_' || component.id,
  component_source.bundle_id,
  component.id,
  (
    select variant.id
    from public.product_variants variant
    where variant.product_id = component.id
      and variant.active = true
    order by
      case when variant.name ~* '25|15|regular|pack' then 0 else 1 end,
      variant.name
    limit 1
  ),
  1,
  component_source.sort_order
from component_source
join public.products component on component.slug = component_source.component_slug
on conflict (id) do update
set component_product_id = excluded.component_product_id,
    component_variant_id = excluded.component_variant_id,
    packs_consumed = excluded.packs_consumed,
    sort_order = excluded.sort_order,
    updated_at = now();
