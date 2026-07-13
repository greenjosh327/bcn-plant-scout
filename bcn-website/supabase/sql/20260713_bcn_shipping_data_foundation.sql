-- Adds the BCN Shop shipping data foundation.
-- Phase 1 only: no Shippo calls, checkout changes, label purchase, or webhook changes.
--
-- Manual rollback outline:
-- 1. Drop admin policies for shipping_package_presets and shipping_settings.
-- 2. Drop public.shipping_settings.
-- 3. Drop public.shipping_package_presets after removing products.preferred_package_id.
-- 4. Drop the product shipping columns added below.

begin;

create table if not exists public.shipping_package_presets (
  id text primary key,
  name text not null,
  code text not null unique,
  length_in numeric(8, 2) not null check (length_in > 0),
  width_in numeric(8, 2) not null check (width_in > 0),
  height_in numeric(8, 2) not null check (height_in > 0),
  empty_weight_oz numeric(8, 2) not null default 0 check (empty_weight_oz >= 0),
  maximum_weight_oz numeric(8, 2) not null check (maximum_weight_oz > 0),
  allowed_shipping_classes text[] not null default '{}',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipping_settings (
  id text primary key default 'default',
  shippo_enabled boolean not null default true,
  shippo_mode text not null default 'live' check (shippo_mode in ('test', 'live')),
  allowed_carrier text not null default 'usps',
  flat_rate_fallback_enabled boolean not null default true,
  automatic_label_purchase boolean not null default false,
  economy_seed_mail_cents integer not null default 175 check (economy_seed_mail_cents >= 0),
  tracked_seed_fallback_cents integer not null default 549 check (tracked_seed_fallback_cents >= 0),
  cutting_small_plant_fallback_cents integer not null default 999 check (cutting_small_plant_fallback_cents >= 0),
  tree_fallback_enabled boolean not null default false,
  local_pickup_cents integer not null default 0 check (local_pickup_cents >= 0),
  quote_expiration_minutes integer not null default 20 check (quote_expiration_minutes > 0),
  handling_fee_cents integer not null default 0 check (handling_fee_cents >= 0),
  free_shipping_threshold_cents integer check (free_shipping_threshold_cents is null or free_shipping_threshold_cents >= 0),
  allowed_usps_service_levels text[] not null default array['usps_ground_advantage', 'usps_priority', 'usps_priority_express'],
  ground_advantage_enabled boolean not null default true,
  priority_mail_enabled boolean not null default true,
  priority_mail_express_enabled boolean not null default true,
  economy_seed_mail_enabled boolean not null default true,
  max_seed_packets_per_economy_envelope integer not null default 12 check (max_seed_packets_per_economy_envelope > 0),
  max_economy_envelope_weight_oz numeric(8, 2) not null default 1 check (max_economy_envelope_weight_oz > 0),
  ship_from_address jsonb not null default '{}'::jsonb,
  pickup_display_location text not null default 'Effort, Pennsylvania',
  live_rates_maintenance_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products
  add column if not exists shipping_class text,
  add column if not exists shipping_enabled boolean not null default false,
  add column if not exists local_pickup_enabled boolean not null default true,
  add column if not exists packed_weight_oz numeric(8, 2),
  add column if not exists packed_length_in numeric(8, 2),
  add column if not exists packed_width_in numeric(8, 2),
  add column if not exists packed_height_in numeric(8, 2),
  add column if not exists ships_alone boolean not null default false,
  add column if not exists expedited_required boolean not null default false,
  add column if not exists allow_ground_advantage boolean not null default true,
  add column if not exists free_shipping_eligible boolean not null default false,
  add column if not exists shipping_surcharge_cents integer not null default 0,
  add column if not exists max_quantity_per_package integer not null default 1,
  add column if not exists preferred_package_id text,
  add column if not exists shipping_configuration_complete boolean not null default false;

alter table public.products
  drop constraint if exists products_shipping_class_check,
  add constraint products_shipping_class_check
    check (
      shipping_class is null
      or shipping_class in (
        'seed_envelope',
        'seed_package',
        'small_package',
        'cutting',
        'live_plant',
        'tree',
        'oversized_pickup_only',
        'digital'
      )
    );

alter table public.products
  drop constraint if exists products_shipping_surcharge_cents_check,
  add constraint products_shipping_surcharge_cents_check check (shipping_surcharge_cents >= 0);

alter table public.products
  drop constraint if exists products_max_quantity_per_package_check,
  add constraint products_max_quantity_per_package_check check (max_quantity_per_package > 0);

alter table public.products
  drop constraint if exists products_packed_weight_oz_check,
  add constraint products_packed_weight_oz_check check (packed_weight_oz is null or packed_weight_oz > 0);

alter table public.products
  drop constraint if exists products_packed_dimensions_check,
  add constraint products_packed_dimensions_check
    check (
      (packed_length_in is null and packed_width_in is null and packed_height_in is null)
      or (packed_length_in > 0 and packed_width_in > 0 and packed_height_in > 0)
    );

alter table public.products
  drop constraint if exists products_preferred_package_id_fkey;

alter table public.products
  add constraint products_preferred_package_id_fkey
    foreign key (preferred_package_id)
    references public.shipping_package_presets(id)
    on update cascade
    on delete set null;

insert into public.shipping_package_presets (
  id,
  name,
  code,
  length_in,
  width_in,
  height_in,
  empty_weight_oz,
  maximum_weight_oz,
  allowed_shipping_classes,
  active,
  sort_order
) values
  ('preset_seed_envelope_4x6', 'Seed Envelope', 'seed_envelope_4x6', 6, 4, 0.25, 1, 1, array['seed_envelope']::text[], true, 10),
  ('preset_small_padded_mailer', 'Small Padded Mailer', 'small_padded_mailer', 9, 6, 0.75, 0.6, 16, array['seed_envelope', 'seed_package', 'small_package', 'cutting']::text[], true, 20),
  ('preset_small_box', 'Small Box', 'small_box', 8, 6, 4, 3, 70, array['seed_package', 'small_package', 'cutting', 'live_plant']::text[], true, 30),
  ('preset_tree_box_36', 'Tree Box - 36 Inch', 'tree_box_36', 36, 4, 4, 0, 1120, array['tree']::text[], true, 40),
  ('preset_tree_box_48', 'Tree Box - 48 Inch', 'tree_box_48', 48, 4, 4, 0, 1120, array['tree']::text[], true, 50)
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  length_in = excluded.length_in,
  width_in = excluded.width_in,
  height_in = excluded.height_in,
  empty_weight_oz = excluded.empty_weight_oz,
  maximum_weight_oz = excluded.maximum_weight_oz,
  allowed_shipping_classes = excluded.allowed_shipping_classes,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.shipping_settings (
  id,
  shippo_enabled,
  shippo_mode,
  allowed_carrier,
  flat_rate_fallback_enabled,
  automatic_label_purchase,
  economy_seed_mail_cents,
  tracked_seed_fallback_cents,
  cutting_small_plant_fallback_cents,
  tree_fallback_enabled,
  local_pickup_cents,
  quote_expiration_minutes,
  pickup_display_location
) values (
  'default',
  true,
  'live',
  'usps',
  true,
  false,
  175,
  549,
  999,
  false,
  0,
  20,
  'Effort, Pennsylvania'
)
on conflict (id) do update set
  shippo_enabled = excluded.shippo_enabled,
  shippo_mode = excluded.shippo_mode,
  allowed_carrier = excluded.allowed_carrier,
  flat_rate_fallback_enabled = excluded.flat_rate_fallback_enabled,
  automatic_label_purchase = excluded.automatic_label_purchase,
  economy_seed_mail_cents = excluded.economy_seed_mail_cents,
  tracked_seed_fallback_cents = excluded.tracked_seed_fallback_cents,
  cutting_small_plant_fallback_cents = excluded.cutting_small_plant_fallback_cents,
  tree_fallback_enabled = excluded.tree_fallback_enabled,
  local_pickup_cents = excluded.local_pickup_cents,
  quote_expiration_minutes = excluded.quote_expiration_minutes,
  pickup_display_location = excluded.pickup_display_location,
  updated_at = now();

update public.products
set
  shipping_enabled = coalesce(ships, false),
  local_pickup_enabled = coalesce(local_pickup, true),
  shipping_configuration_complete = false
where shipping_class is null
  and packed_weight_oz is null
  and preferred_package_id is null;

create index if not exists products_shipping_class_idx on public.products(shipping_class);
create index if not exists products_shipping_configuration_complete_idx on public.products(shipping_configuration_complete);
create index if not exists shipping_package_presets_active_sort_idx on public.shipping_package_presets(active, sort_order);

alter table public.shipping_package_presets enable row level security;
alter table public.shipping_settings enable row level security;

grant select, insert, update, delete on public.shipping_package_presets to authenticated;
grant select, insert, update, delete on public.shipping_settings to authenticated;

drop policy if exists "Admins can manage shipping package presets" on public.shipping_package_presets;
create policy "Admins can manage shipping package presets"
on public.shipping_package_presets for all
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

drop policy if exists "Admins can manage shipping settings" on public.shipping_settings;
create policy "Admins can manage shipping settings"
on public.shipping_settings for all
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

drop trigger if exists touch_shipping_package_presets_updated_at on public.shipping_package_presets;
create trigger touch_shipping_package_presets_updated_at
before update on public.shipping_package_presets
for each row execute function public.touch_updated_at();

drop trigger if exists touch_shipping_settings_updated_at on public.shipping_settings;
create trigger touch_shipping_settings_updated_at
before update on public.shipping_settings
for each row execute function public.touch_updated_at();

commit;
