-- BCN Plant Scout / Base Camp North catalog tables.
-- Run this in Supabase SQL Editor before running the generated seed file.

create table if not exists public.bcn_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  slug text not null unique,
  name text not null,
  scientific_name text,
  common_name text,
  category text not null check (category in ('Plants', 'Cuttings', 'Seeds')),
  description text not null default '',
  price numeric(10, 2) not null default 0,
  inventory integer not null default 0,
  featured boolean not null default false,
  active boolean not null default true,
  plant_type text,
  native_status text,
  hardiness_zones text,
  sunlight text,
  soil text,
  height text,
  spread text,
  bloom_time text,
  wildlife_benefits text,
  pollinator_benefits text,
  host_species text,
  planting_instructions text,
  shipping_notes text,
  growing_notes text,
  show_hardiness_zones boolean not null default true,
  show_sunlight boolean not null default true,
  show_soil boolean not null default true,
  show_bloom_time boolean not null default true,
  show_height boolean not null default true,
  show_spread boolean not null default true,
  show_native_status boolean not null default true,
  show_wildlife_benefits boolean not null default true,
  show_pollinator_benefits boolean not null default true,
  show_host_species boolean not null default true,
  local_pickup boolean not null default true,
  ships boolean not null default false,
  tags text[] not null default '{}',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  name text not null,
  sku text,
  price numeric(10, 2) not null default 0,
  inventory integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  storage_path text,
  public_url text,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_active_category_idx on public.products(active, category);
create index if not exists products_featured_idx on public.products(featured) where active = true;
create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
create index if not exists product_variants_sku_idx on public.product_variants(sku);
create index if not exists product_images_product_id_idx on public.product_images(product_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_products_updated_at on public.products;
create trigger touch_products_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

drop trigger if exists touch_product_variants_updated_at on public.product_variants;
create trigger touch_product_variants_updated_at
before update on public.product_variants
for each row execute function public.touch_updated_at();

drop trigger if exists touch_product_images_updated_at on public.product_images;
create trigger touch_product_images_updated_at
before update on public.product_images
for each row execute function public.touch_updated_at();

alter table public.bcn_admins enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_images enable row level security;

grant select on public.products to anon, authenticated;
grant select on public.product_variants to anon, authenticated;
grant select on public.product_images to anon, authenticated;
grant select on public.bcn_admins to authenticated;
grant insert, update, delete on public.products to authenticated;
grant insert, update, delete on public.product_variants to authenticated;
grant insert, update, delete on public.product_images to authenticated;

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
on public.products for select
to anon, authenticated
using (active = true);

drop policy if exists "Public can read active product variants" on public.product_variants;
create policy "Public can read active product variants"
on public.product_variants for select
to anon, authenticated
using (
  active = true
  and exists (
    select 1 from public.products
    where products.id = product_variants.product_id
    and products.active = true
  )
);

drop policy if exists "Public can read active product images" on public.product_images;
create policy "Public can read active product images"
on public.product_images for select
to anon, authenticated
using (
  exists (
    select 1 from public.products
    where products.id = product_images.product_id
    and products.active = true
  )
);

drop policy if exists "Admins can read admin list" on public.bcn_admins;
drop policy if exists "Users can read their own admin row" on public.bcn_admins;
create policy "Users can read their own admin row"
on public.bcn_admins for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
on public.products for all
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

drop policy if exists "Admins can manage product variants" on public.product_variants;
create policy "Admins can manage product variants"
on public.product_variants for all
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

drop policy if exists "Admins can manage product images" on public.product_images;
create policy "Admins can manage product images"
on public.product_images for all
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

-- After this file runs, add yourself as an admin with your Supabase auth user id:
-- insert into public.bcn_admins (user_id)
-- values ('YOUR-AUTH-USER-ID-HERE')
-- on conflict (user_id) do nothing;
