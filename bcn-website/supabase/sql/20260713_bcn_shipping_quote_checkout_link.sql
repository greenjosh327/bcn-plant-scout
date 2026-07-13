-- Links reserved shipping quotes to Stripe Checkout sessions.
-- This keeps quote reservation, abandoned Checkout sessions, and completed orders traceable.

begin;

alter table public.shipping_quotes
  add column if not exists reserved_at timestamptz,
  add column if not exists stripe_session_id text;

create index if not exists shipping_quotes_reserved_at_idx
  on public.shipping_quotes(reserved_at);

create unique index if not exists shipping_quotes_stripe_session_id_key
  on public.shipping_quotes(stripe_session_id)
  where stripe_session_id is not null;

commit;
