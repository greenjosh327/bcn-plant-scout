-- Adds admin-managed Shippo label purchase state to paid orders.
-- Labels are purchased from server-side code only; Shippo tokens stay in Vercel/local env vars.

begin;

alter table public.orders
  add column if not exists label_purchase_status text not null default 'not_started',
  add column if not exists label_provider text,
  add column if not exists label_transaction_ids text[] not null default '{}'::text[],
  add column if not exists label_rate_ids text[] not null default '{}'::text[],
  add column if not exists label_urls text[] not null default '{}'::text[],
  add column if not exists label_file_type text,
  add column if not exists label_purchase_test_mode boolean,
  add column if not exists label_purchased_at timestamptz,
  add column if not exists label_purchase_error text,
  add column if not exists label_metadata jsonb not null default '{}'::jsonb,
  add column if not exists tracking_numbers text[] not null default '{}'::text[],
  add column if not exists tracking_urls text[] not null default '{}'::text[],
  add column if not exists tracking_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_label_purchase_status_check'
  ) then
    alter table public.orders
      add constraint orders_label_purchase_status_check
      check (label_purchase_status in ('not_started', 'purchasing', 'purchased', 'failed', 'not_supported', 'refunded'));
  end if;
end;
$$;

create index if not exists orders_label_purchase_status_idx
  on public.orders(label_purchase_status, created_at desc);

create index if not exists orders_tracking_numbers_idx
  on public.orders using gin(tracking_numbers);

commit;
