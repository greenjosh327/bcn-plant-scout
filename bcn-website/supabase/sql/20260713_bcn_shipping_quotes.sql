-- Adds server-owned shipping quotes for BCN Shop checkout.
-- Phase 3 only: quote storage, checkout verification, and order metadata.
-- No label purchase, tracking webhook, or automatic fulfillment is enabled here.

begin;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.shipping_quotes (
  id uuid primary key default gen_random_uuid(),
  cart_fingerprint text not null,
  customer_email text,
  destination_address jsonb not null default '{}'::jsonb,
  validated_address jsonb not null default '{}'::jsonb,
  address_validation_status text not null default 'not_validated'
    check (
      address_validation_status in (
        'not_required',
        'not_validated',
        'validated',
        'corrected',
        'customer_confirmed',
        'invalid',
        'validation_unavailable'
      )
    ),
  package_plan jsonb not null default '[]'::jsonb,
  available_options jsonb not null default '[]'::jsonb,
  selected_option_id text,
  selected_option jsonb,
  provider text,
  quote_status text not null default 'open'
    check (quote_status in ('open', 'reserved', 'expired', 'converted', 'cancelled')),
  untracked_shipping_acknowledged boolean not null default false,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipping_quotes_cart_fingerprint_idx
  on public.shipping_quotes(cart_fingerprint);

create index if not exists shipping_quotes_expires_at_idx
  on public.shipping_quotes(expires_at);

create index if not exists shipping_quotes_quote_status_idx
  on public.shipping_quotes(quote_status, created_at desc);

alter table public.orders
  add column if not exists shipping_quote_id uuid,
  add column if not exists shipping_method_code text,
  add column if not exists shipping_method_name text,
  add column if not exists shipping_provider text,
  add column if not exists shipping_carrier text,
  add column if not exists shipping_service text,
  add column if not exists shipping_amount_cents integer,
  add column if not exists address_validation_status text,
  add column if not exists validated_shipping_address jsonb not null default '{}'::jsonb,
  add column if not exists untracked_shipping_acknowledged boolean not null default false,
  add column if not exists package_plan jsonb not null default '[]'::jsonb,
  add column if not exists shippo_shipment_ids text[] not null default '{}'::text[],
  add column if not exists shippo_rate_ids text[] not null default '{}'::text[],
  add column if not exists estimated_delivery text,
  add column if not exists internal_shipping_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_shipping_quote_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_shipping_quote_id_fkey
      foreign key (shipping_quote_id)
      references public.shipping_quotes(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists orders_shipping_quote_id_idx
  on public.orders(shipping_quote_id);

drop trigger if exists touch_shipping_quotes_updated_at on public.shipping_quotes;
create trigger touch_shipping_quotes_updated_at
before update on public.shipping_quotes
for each row execute function public.touch_updated_at();

alter table public.shipping_quotes enable row level security;

grant select, insert, update, delete on public.shipping_quotes to authenticated;

drop policy if exists "Admins can manage shipping quotes" on public.shipping_quotes;
create policy "Admins can manage shipping quotes"
on public.shipping_quotes for all
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

commit;
