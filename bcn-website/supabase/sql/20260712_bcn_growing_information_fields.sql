-- Adds public display controls for standardized growing information fields.
-- Safe to run more than once.

begin;

alter table public.products
  add column if not exists planting_instructions text,
  add column if not exists show_hardiness_zones boolean not null default true,
  add column if not exists show_sunlight boolean not null default true,
  add column if not exists show_soil boolean not null default true,
  add column if not exists show_bloom_time boolean not null default true,
  add column if not exists show_height boolean not null default true,
  add column if not exists show_spread boolean not null default true,
  add column if not exists show_native_status boolean not null default true,
  add column if not exists show_wildlife_benefits boolean not null default true,
  add column if not exists show_pollinator_benefits boolean not null default true,
  add column if not exists show_host_species boolean not null default true;

update public.products
set
  native_status = case
    when btrim(coalesce(native_status, '')) in ('', 'See product description') then null
    else btrim(native_status)
  end,
  hardiness_zones = case
    when btrim(coalesce(hardiness_zones, '')) in ('', 'See product description') then null
    else btrim(hardiness_zones)
  end,
  sunlight = case
    when btrim(coalesce(sunlight, '')) in ('', 'See product description') then null
    else btrim(sunlight)
  end,
  soil = case
    when btrim(coalesce(soil, '')) in ('', 'See product description') then null
    else btrim(soil)
  end,
  height = case
    when btrim(coalesce(height, '')) in ('', 'See product description') then null
    else btrim(height)
  end,
  spread = case
    when btrim(coalesce(spread, '')) in ('', 'See product description') then null
    else btrim(spread)
  end,
  bloom_time = case
    when btrim(coalesce(bloom_time, '')) in ('', 'See product description') then null
    else btrim(bloom_time)
  end,
  wildlife_benefits = case
    when btrim(coalesce(wildlife_benefits, '')) in ('', 'Selected for nursery, wildlife, food forest, or restoration value.') then null
    else btrim(wildlife_benefits)
  end,
  pollinator_benefits = case
    when btrim(coalesce(pollinator_benefits, '')) in ('', 'See product description for bloom and pollinator notes.') then null
    else btrim(pollinator_benefits)
  end,
  host_species = case
    when btrim(coalesce(host_species, '')) in ('', 'See product description') then null
    else btrim(host_species)
  end,
  planting_instructions = nullif(btrim(coalesce(planting_instructions, '')), ''),
  shipping_notes = case
    when btrim(coalesce(shipping_notes, '')) in ('', 'Shipping and pickup availability depends on item size, season, and live-plant condition.') then null
    else btrim(shipping_notes)
  end,
  growing_notes = nullif(btrim(coalesce(growing_notes, '')), '');

commit;
