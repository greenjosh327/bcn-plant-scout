-- Adds server-side GA4 purchase event dedupe state for completed Stripe orders.
-- The browser prepares a verified payload through /api/analytics/purchase,
-- sends gtag("event", "purchase"), then acknowledges the order after the
-- Google tag callback so ga4_purchase_tracked_at is not set too early.

alter table public.orders
  add column if not exists coupon_code text,
  add column if not exists ga4_purchase_tracked_at timestamptz,
  add column if not exists ga4_purchase_transaction_id text;

create unique index if not exists orders_ga4_purchase_transaction_id_key
  on public.orders(ga4_purchase_transaction_id)
  where ga4_purchase_transaction_id is not null;

create index if not exists orders_ga4_purchase_pending_idx
  on public.orders(created_at desc)
  where payment_status = 'paid'
    and ga4_purchase_tracked_at is null;
