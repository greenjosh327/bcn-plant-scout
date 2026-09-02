-- Persist sanitized Etsy PUT and immediate GET verification evidence for every
-- controlled inventory attempt. These server-only audit columns never contain
-- access tokens, API keys, authorization codes, or PKCE material.

alter table public.etsy_inventory_change_items
  add column if not exists put_endpoint text,
  add column if not exists put_http_status integer,
  add column if not exists put_response jsonb,
  add column if not exists readback_endpoint text,
  add column if not exists readback_http_status integer,
  add column if not exists readback_quantities jsonb,
  add column if not exists readback_at timestamptz,
  add column if not exists verified_at timestamptz;

alter table public.etsy_inventory_change_items
  drop constraint if exists etsy_inventory_change_items_put_http_status_check,
  add constraint etsy_inventory_change_items_put_http_status_check
    check (put_http_status is null or put_http_status between 100 and 599),
  drop constraint if exists etsy_inventory_change_items_readback_http_status_check,
  add constraint etsy_inventory_change_items_readback_http_status_check
    check (readback_http_status is null or readback_http_status between 100 and 599);

comment on column public.etsy_inventory_change_items.put_endpoint is
  'Sanitized Etsy inventory PUT path; never includes query credentials or secrets.';
comment on column public.etsy_inventory_change_items.put_http_status is
  'Exact HTTP status returned by the Etsy inventory PUT.';
comment on column public.etsy_inventory_change_items.put_response is
  'Allowlisted Etsy PUT response fields: product, offering, SKU, quantity, enabled state, and quantity property IDs.';
comment on column public.etsy_inventory_change_items.readback_endpoint is
  'Fresh individual-listing inventory GET path used for mandatory post-write verification.';
comment on column public.etsy_inventory_change_items.readback_http_status is
  'Exact HTTP status returned by the immediate Etsy inventory read-back.';
comment on column public.etsy_inventory_change_items.readback_quantities is
  'Allowlisted product, offering, SKU, and quantity values returned by the immediate Etsy read-back.';
comment on column public.etsy_inventory_change_items.readback_at is
  'Timestamp when the immediate Etsy GET response was received, whether or not quantities matched.';
comment on column public.etsy_inventory_change_items.verified_at is
  'Timestamp when the immediate Etsy GET exactly matched the approved offering quantity.';
