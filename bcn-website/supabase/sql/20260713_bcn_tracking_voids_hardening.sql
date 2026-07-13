-- Adds Phase 6 fulfillment hardening for Shippo tracking updates and label void/refund requests.
-- Uses existing orders RLS and admin policies; no new public tables are created.

begin;

alter table public.orders
  add column if not exists label_refund_status text not null default 'not_requested',
  add column if not exists label_refund_ids text[] not null default '{}'::text[],
  add column if not exists label_refund_requested_at timestamptz,
  add column if not exists label_refund_updated_at timestamptz,
  add column if not exists label_refund_error text,
  add column if not exists label_refund_metadata jsonb not null default '{}'::jsonb,
  add column if not exists tracking_carrier text,
  add column if not exists tracking_status_detail text,
  add column if not exists tracking_substatus text,
  add column if not exists tracking_action_required boolean not null default false,
  add column if not exists tracking_eta timestamptz,
  add column if not exists tracking_history jsonb not null default '[]'::jsonb,
  add column if not exists tracking_metadata jsonb not null default '{}'::jsonb,
  add column if not exists tracking_updated_at timestamptz;

alter table public.orders
  drop constraint if exists orders_label_purchase_status_check;

alter table public.orders
  add constraint orders_label_purchase_status_check
  check (
    label_purchase_status in (
      'not_started',
      'purchasing',
      'purchased',
      'failed',
      'not_supported',
      'refund_pending',
      'refunded',
      'refund_failed',
      'refund_rejected'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_label_refund_status_check'
  ) then
    alter table public.orders
      add constraint orders_label_refund_status_check
      check (label_refund_status in ('not_requested', 'requested', 'queued', 'pending', 'success', 'error'));
  end if;
end;
$$;

create index if not exists orders_label_refund_status_idx
  on public.orders(label_refund_status, created_at desc);

create index if not exists orders_tracking_status_idx
  on public.orders(tracking_status, created_at desc)
  where tracking_status is not null;

commit;
