-- Phase 2.5: manually triggered Etsy paid-order ingestion into BCN's authoritative
-- physical 25-seed-pack inventory. This migration creates no sync baseline, does
-- not ingest orders, and performs no Etsy API request or inventory adjustment.

alter table public.inventory_ledger
  drop constraint if exists inventory_ledger_reason_check;

alter table public.inventory_ledger
  add constraint inventory_ledger_reason_check
  check (reason in (
    'manual_adjustment', 'sale', 'bundle_sale', 'etsy_sale',
    'return', 'restock', 'correction'
  ));

alter table public.inventory_ledger
  add column if not exists source_metadata jsonb;

comment on column public.inventory_ledger.source_metadata is
  'Allowlisted server-only source identifiers. Etsy entries may contain receipt, transaction, listing, SKU, units sold, and physical packs consumed; never buyer PII or credentials.';

create table public.etsy_order_sync_state (
  connection_id text primary key
    references public.etsy_connections(id) on delete cascade,
  baseline_at timestamptz not null,
  cursor_updated_at timestamptz not null,
  baseline_initialized_by uuid not null references auth.users(id) on delete restrict,
  baseline_initialized_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  last_successful_sync_at timestamptz,
  active_run_id uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cursor_updated_at >= baseline_at),
  check (
    (active_run_id is null and lease_token is null and lease_expires_at is null)
    or (active_run_id is not null and lease_token is not null and lease_expires_at is not null)
  )
);

create table public.etsy_order_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id text not null references public.etsy_connections(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  client_request_id uuid not null,
  lease_token uuid not null,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  status text not null default 'running' check (status in (
    'running', 'completed', 'completed_with_review',
    'reconciliation_failed', 'failed', 'abandoned'
  )),
  paid_receipts_found integer not null default 0 check (paid_receipts_found >= 0),
  transactions_found integer not null default 0 check (transactions_found >= 0),
  matched_transactions integer not null default 0 check (matched_transactions >= 0),
  manual_review_transactions integer not null default 0 check (manual_review_transactions >= 0),
  ignored_transactions integer not null default 0 check (ignored_transactions >= 0),
  duplicate_transactions integer not null default 0 check (duplicate_transactions >= 0),
  physical_packs_decremented integer not null default 0 check (physical_packs_decremented >= 0),
  reconciliation_proposal_id uuid references public.etsy_inventory_change_sets(id) on delete set null,
  error_summary text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, client_request_id),
  check (window_ended_at >= window_started_at)
);

alter table public.etsy_order_sync_state
  add constraint etsy_order_sync_state_active_run_fkey
  foreign key (active_run_id) references public.etsy_order_sync_runs(id) on delete set null;

create table public.etsy_receipts (
  id bigint generated always as identity primary key,
  connection_id text not null references public.etsy_connections(id) on delete restrict,
  shop_id bigint not null check (shop_id > 0),
  receipt_id bigint not null check (receipt_id > 0),
  status text not null default '',
  is_paid boolean not null default false,
  is_canceled boolean not null default false,
  is_shipped boolean not null default false,
  created_timestamp timestamptz,
  updated_timestamp timestamptz,
  has_refund boolean not null default false,
  refund_audit jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, shop_id, receipt_id),
  check (jsonb_typeof(refund_audit) = 'array')
);

create table public.etsy_transactions (
  id bigint generated always as identity primary key,
  receipt_row_id bigint not null references public.etsy_receipts(id) on delete restrict,
  last_sync_run_id uuid references public.etsy_order_sync_runs(id) on delete set null,
  connection_id text not null references public.etsy_connections(id) on delete restrict,
  shop_id bigint not null check (shop_id > 0),
  receipt_id bigint not null check (receipt_id > 0),
  transaction_id bigint not null check (transaction_id > 0),
  listing_id bigint check (listing_id >= 0),
  etsy_product_id bigint check (etsy_product_id > 0),
  sku text,
  variation_label text not null default '',
  variation_fingerprint text not null,
  variation_audit jsonb not null default '[]'::jsonb,
  quantity_purchased integer not null check (quantity_purchased >= 0),
  paid_at timestamptz,
  listing_mapping_id bigint references public.etsy_listing_mappings(id) on delete restrict,
  variation_mapping_id bigint references public.etsy_variation_mappings(id) on delete restrict,
  bcn_product_id text references public.products(id) on delete restrict,
  bcn_variant_id text references public.product_variants(id) on delete set null,
  packs_consumed_per_unit integer check (packs_consumed_per_unit in (1, 4)),
  physical_packs_consumed integer check (physical_packs_consumed is null or physical_packs_consumed > 0),
  processing_status text not null check (processing_status in (
    'pending', 'processed', 'ignored_unpaid', 'ignored_canceled',
    'manual_review_unmatched', 'manual_review_blocked',
    'manual_review_refund', 'manual_review_insufficient_stock',
    'manual_review_post_processing_change'
  )),
  review_reason text,
  ledger_id uuid references public.inventory_ledger(id) on delete restrict,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, shop_id, transaction_id),
  check (jsonb_typeof(variation_audit) = 'array'),
  check (
    (processing_status <> 'processed' or ledger_id is not null)
    and (ledger_id is null or processing_status in ('processed', 'manual_review_post_processing_change'))
  )
);

create index etsy_order_sync_runs_connection_created_idx
  on public.etsy_order_sync_runs(connection_id, created_at desc);
create index etsy_receipts_shop_updated_idx
  on public.etsy_receipts(shop_id, updated_timestamp desc);
create index etsy_transactions_receipt_idx
  on public.etsy_transactions(receipt_row_id);
create index etsy_transactions_status_seen_idx
  on public.etsy_transactions(processing_status, last_seen_at desc);
create index etsy_transactions_product_processed_idx
  on public.etsy_transactions(bcn_product_id, processed_at desc);

drop trigger if exists touch_etsy_order_sync_state_updated_at on public.etsy_order_sync_state;
create trigger touch_etsy_order_sync_state_updated_at
before update on public.etsy_order_sync_state
for each row execute function public.touch_updated_at();

drop trigger if exists touch_etsy_order_sync_runs_updated_at on public.etsy_order_sync_runs;
create trigger touch_etsy_order_sync_runs_updated_at
before update on public.etsy_order_sync_runs
for each row execute function public.touch_updated_at();

drop trigger if exists touch_etsy_receipts_updated_at on public.etsy_receipts;
create trigger touch_etsy_receipts_updated_at
before update on public.etsy_receipts
for each row execute function public.touch_updated_at();

drop trigger if exists touch_etsy_transactions_updated_at on public.etsy_transactions;
create trigger touch_etsy_transactions_updated_at
before update on public.etsy_transactions
for each row execute function public.touch_updated_at();

alter table public.etsy_order_sync_state enable row level security;
alter table public.etsy_order_sync_runs enable row level security;
alter table public.etsy_receipts enable row level security;
alter table public.etsy_transactions enable row level security;

revoke all on table public.etsy_order_sync_state from public, anon, authenticated, service_role;
revoke all on table public.etsy_order_sync_runs from public, anon, authenticated, service_role;
revoke all on table public.etsy_receipts from public, anon, authenticated, service_role;
revoke all on table public.etsy_transactions from public, anon, authenticated, service_role;

grant select, insert, update on table public.etsy_order_sync_state to service_role;
grant select, insert, update on table public.etsy_order_sync_runs to service_role;
grant select, insert, update on table public.etsy_receipts to service_role;
grant select, insert, update on table public.etsy_transactions to service_role;

grant usage, select on sequence public.etsy_receipts_id_seq to service_role;
grant usage, select on sequence public.etsy_transactions_id_seq to service_role;

create or replace function public.initialize_etsy_order_sync_baseline(
  p_connection_id text,
  p_admin_user_id uuid,
  p_baseline_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  result public.etsy_order_sync_state%rowtype;
begin
  if p_baseline_at is null or p_baseline_at > now() + interval '1 minute' then
    raise exception 'The Etsy order-sync baseline must be a current or past timestamp.';
  end if;

  if not exists (select 1 from public.bcn_admins where user_id = p_admin_user_id) then
    raise exception 'The Etsy order-sync baseline requires an active BCN admin.';
  end if;

  if not exists (
    select 1 from public.etsy_connections
    where id = p_connection_id and shop_id is not null
  ) then
    raise exception 'Etsy must be connected before initializing order sync.';
  end if;

  insert into public.etsy_order_sync_state (
    connection_id, baseline_at, cursor_updated_at, baseline_initialized_by
  ) values (
    p_connection_id, p_baseline_at, p_baseline_at, p_admin_user_id
  )
  on conflict (connection_id) do nothing
  returning * into result;

  if result.connection_id is null then
    raise exception 'The Etsy order-sync baseline is already initialized and cannot be silently replaced.';
  end if;

  return jsonb_build_object(
    'connection_id', result.connection_id,
    'baseline_at', result.baseline_at,
    'initialized_at', result.baseline_initialized_at
  );
end;
$$;

create or replace function public.begin_etsy_order_sync(
  p_connection_id text,
  p_admin_user_id uuid,
  p_client_request_id uuid,
  p_window_ended_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  state_row public.etsy_order_sync_state%rowtype;
  run_row public.etsy_order_sync_runs%rowtype;
  new_run_id uuid := gen_random_uuid();
  new_lease_token uuid := gen_random_uuid();
  window_start timestamptz;
begin
  select * into state_row
  from public.etsy_order_sync_state
  where connection_id = p_connection_id
  for update;

  if not found then
    raise exception 'The owner-approved Etsy order-sync baseline has not been initialized.';
  end if;

  select * into run_row
  from public.etsy_order_sync_runs
  where connection_id = p_connection_id and client_request_id = p_client_request_id;

  if found then
    return jsonb_build_object(
      'run_id', run_row.id,
      'lease_token', run_row.lease_token,
      'window_started_at', run_row.window_started_at,
      'window_ended_at', run_row.window_ended_at,
      'status', run_row.status,
      'reused', true
    );
  end if;

  if state_row.active_run_id is not null and state_row.lease_expires_at > now() then
    raise exception 'Another Etsy order sync is already running.';
  end if;

  if state_row.active_run_id is not null then
    update public.etsy_order_sync_runs
    set status = 'abandoned', completed_at = now(), error_summary = 'The sync lease expired.'
    where id = state_row.active_run_id and status = 'running';
  end if;

  window_start := greatest(
    state_row.baseline_at,
    state_row.cursor_updated_at - interval '5 minutes'
  );

  if p_window_ended_at is null or p_window_ended_at < window_start then
    raise exception 'The Etsy order-sync window is invalid.';
  end if;

  insert into public.etsy_order_sync_runs (
    id, connection_id, requested_by, client_request_id, lease_token,
    window_started_at, window_ended_at
  ) values (
    new_run_id, p_connection_id, p_admin_user_id, p_client_request_id, new_lease_token,
    window_start, p_window_ended_at
  ) returning * into run_row;

  update public.etsy_order_sync_state
  set
    active_run_id = new_run_id,
    lease_token = new_lease_token,
    lease_expires_at = now() + interval '10 minutes',
    last_attempt_at = now(),
    last_error = null
  where connection_id = p_connection_id;

  return jsonb_build_object(
    'run_id', run_row.id,
    'lease_token', run_row.lease_token,
    'window_started_at', run_row.window_started_at,
    'window_ended_at', run_row.window_ended_at,
    'status', run_row.status,
    'reused', false
  );
end;
$$;

create or replace function public.process_etsy_order_receipt(
  p_run_id uuid,
  p_lease_token uuid,
  p_connection_id text,
  p_shop_id bigint,
  p_receipt jsonb,
  p_transactions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  receipt_row public.etsy_receipts%rowtype;
  existing_transaction public.etsy_transactions%rowtype;
  transaction_json jsonb;
  mapping_record record;
  product_record public.products%rowtype;
  pending_group record;
  pending_transaction public.etsy_transactions%rowtype;
  ledger_uuid uuid;
  receipt_was_new boolean := false;
  receipt_was_paid boolean := false;
  is_paid boolean := coalesce((p_receipt->>'is_paid')::boolean, false);
  is_canceled boolean := coalesce((p_receipt->>'is_canceled')::boolean, false);
  has_refund boolean := coalesce((p_receipt->>'has_refund')::boolean, false);
  matched_count integer := 0;
  review_count integer := 0;
  ignored_count integer := 0;
  duplicate_count integer := 0;
  pack_count integer := 0;
  incoming_quantity integer;
  incoming_listing_id bigint;
  incoming_product_id bigint;
  incoming_transaction_id bigint;
  incoming_sku text;
  incoming_fingerprint text;
  incoming_paid_at timestamptz;
  selected_status text;
  selected_reason text;
  affected_count integer;
begin
  if jsonb_typeof(p_transactions) <> 'array' then
    raise exception 'Etsy transaction input must be an array.';
  end if;

  if not exists (
    select 1
    from public.etsy_order_sync_state state
    join public.etsy_order_sync_runs run on run.id = state.active_run_id
    where state.connection_id = p_connection_id
      and state.active_run_id = p_run_id
      and state.lease_token = p_lease_token
      and state.lease_expires_at > now()
      and run.status = 'running'
      and run.connection_id = p_connection_id
  ) then
    raise exception 'The Etsy order-sync lease is missing or expired.';
  end if;

  select * into receipt_row
  from public.etsy_receipts
  where connection_id = p_connection_id
    and shop_id = p_shop_id
    and receipt_id = (p_receipt->>'receipt_id')::bigint
  for update;

  receipt_was_new := not found;
  receipt_was_paid := coalesce(receipt_row.is_paid, false);

  insert into public.etsy_receipts (
    connection_id, shop_id, receipt_id, status, is_paid, is_canceled, is_shipped,
    created_timestamp, updated_timestamp, has_refund, refund_audit, last_seen_at
  ) values (
    p_connection_id,
    p_shop_id,
    (p_receipt->>'receipt_id')::bigint,
    coalesce(p_receipt->>'status', ''),
    is_paid,
    is_canceled,
    coalesce((p_receipt->>'is_shipped')::boolean, false),
    nullif(p_receipt->>'created_at', '')::timestamptz,
    nullif(p_receipt->>'updated_at', '')::timestamptz,
    has_refund,
    coalesce(p_receipt->'refunds', '[]'::jsonb),
    now()
  )
  on conflict (connection_id, shop_id, receipt_id) do update set
    status = excluded.status,
    is_paid = excluded.is_paid,
    is_canceled = excluded.is_canceled,
    is_shipped = excluded.is_shipped,
    created_timestamp = coalesce(excluded.created_timestamp, public.etsy_receipts.created_timestamp),
    updated_timestamp = coalesce(excluded.updated_timestamp, public.etsy_receipts.updated_timestamp),
    has_refund = excluded.has_refund,
    refund_audit = excluded.refund_audit,
    last_seen_at = now()
  returning * into receipt_row;

  for transaction_json in select value from jsonb_array_elements(p_transactions)
  loop
    incoming_transaction_id := (transaction_json->>'transaction_id')::bigint;
    incoming_listing_id := nullif(transaction_json->>'listing_id', '')::bigint;
    incoming_product_id := nullif(transaction_json->>'product_id', '')::bigint;
    incoming_quantity := (transaction_json->>'quantity')::integer;
    incoming_sku := nullif(btrim(transaction_json->>'sku'), '');
    incoming_fingerprint := transaction_json->>'variation_fingerprint';
    incoming_paid_at := nullif(transaction_json->>'paid_at', '')::timestamptz;

    if incoming_transaction_id <= 0 or incoming_quantity < 0 or incoming_fingerprint is null then
      raise exception 'Etsy returned an invalid transaction identity or quantity.';
    end if;
    if (transaction_json->>'receipt_id')::bigint <> receipt_row.receipt_id then
      raise exception 'Etsy returned a transaction for the wrong receipt.';
    end if;

    select * into existing_transaction
    from public.etsy_transactions
    where connection_id = p_connection_id
      and shop_id = p_shop_id
      and transaction_id = incoming_transaction_id
    for update;

    if found and existing_transaction.ledger_id is not null then
      if is_canceled or has_refund
         or existing_transaction.listing_id is distinct from incoming_listing_id
         or existing_transaction.etsy_product_id is distinct from incoming_product_id
         or existing_transaction.quantity_purchased <> incoming_quantity
         or existing_transaction.variation_fingerprint <> incoming_fingerprint
         or coalesce(existing_transaction.sku, '') <> coalesce(incoming_sku, '') then
        update public.etsy_transactions
        set
          last_sync_run_id = p_run_id,
          last_seen_at = now(),
          processing_status = 'manual_review_post_processing_change',
          review_reason = case
            when is_canceled then 'Etsy reports this previously processed receipt as canceled. Stock was not restored.'
            when has_refund then 'Etsy reports a refund on this previously processed receipt. Stock was not restored.'
            else 'Etsy changed a previously processed transaction. Stock was not adjusted automatically.'
          end
        where id = existing_transaction.id;
        review_count := review_count + 1;
      else
        update public.etsy_transactions
        set last_sync_run_id = p_run_id, last_seen_at = now()
        where id = existing_transaction.id;
        duplicate_count := duplicate_count + 1;
      end if;
      continue;
    end if;

    selected_status := 'pending';
    selected_reason := null;
    if not is_paid or incoming_paid_at is null then
      selected_status := 'ignored_unpaid';
      selected_reason := 'The Etsy receipt or transaction is not paid.';
    elsif is_canceled then
      selected_status := 'ignored_canceled';
      selected_reason := 'The Etsy receipt is canceled.';
    elsif has_refund then
      selected_status := 'manual_review_refund';
      selected_reason := 'The Etsy receipt contains refund information. Stock was not changed.';
    elsif incoming_quantity = 0 or incoming_listing_id is null or incoming_product_id is null then
      selected_status := 'manual_review_unmatched';
      selected_reason := 'Etsy did not return a usable listing, product, or purchased quantity for this transaction.';
    else
      select
        listing.id as listing_mapping_id,
        listing.bcn_product_id,
        variation.id as variation_mapping_id,
        variation.bcn_variant_id,
        variation.packs_consumed
      into mapping_record
      from public.etsy_listing_mappings listing
      join public.etsy_variation_mappings variation
        on variation.listing_mapping_id = listing.id
      where listing.connection_id = p_connection_id
        and listing.shop_id = p_shop_id
        and listing.listing_id = incoming_listing_id
        and listing.status = 'confirmed'
        and listing.bcn_product_id is not null
        and variation.status = 'confirmed'
        and variation.etsy_product_id = incoming_product_id
        and coalesce(variation.sku, '') = coalesce(incoming_sku, '')
        and variation.variation_fingerprint = incoming_fingerprint
        and variation.packs_consumed in (1, 4);

      if not found then
        if exists (
          select 1 from public.etsy_listing_mappings listing
          where listing.connection_id = p_connection_id
            and listing.shop_id = p_shop_id
            and listing.listing_id = incoming_listing_id
            and (
              listing.status = 'blocked'
              or listing.bcn_product_id = 'prod_0b70691c-58ab-45d0-b392-87f19b0433bf'
            )
        ) then
          selected_status := 'manual_review_blocked';
          selected_reason := 'This listing is blocked from automated order inventory handling.';
        else
          selected_status := 'manual_review_unmatched';
          selected_reason := 'No exact confirmed listing/product/SKU/variation mapping matched this transaction.';
        end if;
      elsif mapping_record.bcn_product_id = 'prod_0b70691c-58ab-45d0-b392-87f19b0433bf' then
        selected_status := 'manual_review_blocked';
        selected_reason := 'Black Cherry remains blocked pending verified quantity-on-property handling.';
      end if;
    end if;

    insert into public.etsy_transactions (
      receipt_row_id, last_sync_run_id, connection_id, shop_id, receipt_id,
      transaction_id, listing_id, etsy_product_id, sku, variation_label,
      variation_fingerprint, variation_audit, quantity_purchased, paid_at,
      listing_mapping_id, variation_mapping_id, bcn_product_id, bcn_variant_id,
      packs_consumed_per_unit, physical_packs_consumed, processing_status,
      review_reason, last_seen_at
    ) values (
      receipt_row.id, p_run_id, p_connection_id, p_shop_id, receipt_row.receipt_id,
      incoming_transaction_id, incoming_listing_id, incoming_product_id, incoming_sku,
      coalesce(transaction_json->>'variation_label', ''), incoming_fingerprint,
      coalesce(transaction_json->'variations', '[]'::jsonb), incoming_quantity, incoming_paid_at,
      mapping_record.listing_mapping_id, mapping_record.variation_mapping_id,
      mapping_record.bcn_product_id, mapping_record.bcn_variant_id,
      mapping_record.packs_consumed,
      case when mapping_record.packs_consumed in (1, 4)
        then incoming_quantity * mapping_record.packs_consumed else null end,
      selected_status, selected_reason, now()
    )
    on conflict (connection_id, shop_id, transaction_id) do update set
      receipt_row_id = excluded.receipt_row_id,
      last_sync_run_id = excluded.last_sync_run_id,
      receipt_id = excluded.receipt_id,
      listing_id = excluded.listing_id,
      etsy_product_id = excluded.etsy_product_id,
      sku = excluded.sku,
      variation_label = excluded.variation_label,
      variation_fingerprint = excluded.variation_fingerprint,
      variation_audit = excluded.variation_audit,
      quantity_purchased = excluded.quantity_purchased,
      paid_at = excluded.paid_at,
      listing_mapping_id = excluded.listing_mapping_id,
      variation_mapping_id = excluded.variation_mapping_id,
      bcn_product_id = excluded.bcn_product_id,
      bcn_variant_id = excluded.bcn_variant_id,
      packs_consumed_per_unit = excluded.packs_consumed_per_unit,
      physical_packs_consumed = excluded.physical_packs_consumed,
      processing_status = excluded.processing_status,
      review_reason = excluded.review_reason,
      last_seen_at = now();

    if selected_status like 'manual_review_%' then
      review_count := review_count + 1;
    elsif selected_status like 'ignored_%' then
      ignored_count := ignored_count + 1;
    end if;
  end loop;

  for pending_group in
    select bcn_product_id, sum(physical_packs_consumed)::integer as packs_required
    from public.etsy_transactions
    where receipt_row_id = receipt_row.id
      and last_sync_run_id = p_run_id
      and processing_status = 'pending'
    group by bcn_product_id
    order by bcn_product_id
  loop
    select * into product_record
    from public.products
    where id = pending_group.bcn_product_id
    for update;

    if not found or product_record.inventory < pending_group.packs_required then
      update public.etsy_transactions
      set
        processing_status = 'manual_review_insufficient_stock',
        review_reason = format(
          'BCN physical inventory is insufficient: %s packs available, %s required. No stock was changed.',
          coalesce(product_record.inventory, 0), pending_group.packs_required
        )
      where receipt_row_id = receipt_row.id
        and last_sync_run_id = p_run_id
        and processing_status = 'pending'
        and bcn_product_id = pending_group.bcn_product_id;
      get diagnostics affected_count = row_count;
      review_count := review_count + affected_count;
      continue;
    end if;

    for pending_transaction in
      select * from public.etsy_transactions
      where receipt_row_id = receipt_row.id
        and last_sync_run_id = p_run_id
        and processing_status = 'pending'
        and bcn_product_id = pending_group.bcn_product_id
      order by transaction_id
      for update
    loop
      insert into public.inventory_ledger (
        product_id, variant_id, quantity_change, reason, created_by,
        reference_key, source_metadata
      ) values (
        pending_transaction.bcn_product_id,
        pending_transaction.bcn_variant_id,
        -pending_transaction.physical_packs_consumed,
        'etsy_sale',
        (select requested_by from public.etsy_order_sync_runs where id = p_run_id),
        format('etsy:%s:%s', p_shop_id, pending_transaction.transaction_id),
        jsonb_build_object(
          'source', 'etsy',
          'shop_id', p_shop_id,
          'receipt_id', pending_transaction.receipt_id,
          'transaction_id', pending_transaction.transaction_id,
          'listing_id', pending_transaction.listing_id,
          'sku', pending_transaction.sku,
          'units_sold', pending_transaction.quantity_purchased,
          'physical_packs_consumed', pending_transaction.physical_packs_consumed
        )
      )
      on conflict (reference_key) where reference_key is not null do nothing
      returning id into ledger_uuid;

      if ledger_uuid is null then
        raise exception 'Duplicate Etsy ledger reference detected for transaction %.', pending_transaction.transaction_id;
      end if;

      update public.products
      set
        inventory = inventory - pending_transaction.physical_packs_consumed,
        sold_out = inventory - pending_transaction.physical_packs_consumed <= 0,
        updated_at = now()
      where id = pending_transaction.bcn_product_id
        and inventory >= pending_transaction.physical_packs_consumed;

      if not found then
        raise exception 'BCN inventory changed during Etsy transaction processing.';
      end if;

      update public.etsy_transactions
      set
        processing_status = 'processed',
        review_reason = null,
        ledger_id = ledger_uuid,
        processed_at = now()
      where id = pending_transaction.id;

      matched_count := matched_count + 1;
      pack_count := pack_count + pending_transaction.physical_packs_consumed;
      ledger_uuid := null;
    end loop;
  end loop;

  return jsonb_build_object(
    'receipt_id', receipt_row.receipt_id,
    'new_paid_receipt', is_paid and not is_canceled and (receipt_was_new or not receipt_was_paid),
    'transactions_found', jsonb_array_length(p_transactions),
    'matched_transactions', matched_count,
    'manual_review_transactions', review_count,
    'ignored_transactions', ignored_count,
    'duplicate_transactions', duplicate_count,
    'physical_packs_decremented', pack_count
  );
end;
$$;

create or replace function public.finish_etsy_order_sync(
  p_run_id uuid,
  p_lease_token uuid,
  p_status text,
  p_counts jsonb,
  p_reconciliation_proposal_id uuid default null,
  p_error_summary text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  run_row public.etsy_order_sync_runs%rowtype;
begin
  if p_status not in ('completed', 'completed_with_review', 'reconciliation_failed') then
    raise exception 'Invalid successful Etsy order-sync completion status.';
  end if;

  select * into run_row
  from public.etsy_order_sync_runs
  where id = p_run_id and lease_token = p_lease_token
  for update;

  if not found or run_row.status <> 'running' then
    raise exception 'The Etsy order-sync run is not active.';
  end if;

  update public.etsy_order_sync_runs
  set
    status = p_status,
    paid_receipts_found = coalesce((p_counts->>'paid_receipts_found')::integer, 0),
    transactions_found = coalesce((p_counts->>'transactions_found')::integer, 0),
    matched_transactions = coalesce((p_counts->>'matched_transactions')::integer, 0),
    manual_review_transactions = coalesce((p_counts->>'manual_review_transactions')::integer, 0),
    ignored_transactions = coalesce((p_counts->>'ignored_transactions')::integer, 0),
    duplicate_transactions = coalesce((p_counts->>'duplicate_transactions')::integer, 0),
    physical_packs_decremented = coalesce((p_counts->>'physical_packs_decremented')::integer, 0),
    reconciliation_proposal_id = p_reconciliation_proposal_id,
    error_summary = left(p_error_summary, 500),
    completed_at = now()
  where id = p_run_id;

  update public.etsy_order_sync_state
  set
    cursor_updated_at = run_row.window_ended_at,
    last_successful_sync_at = now(),
    active_run_id = null,
    lease_token = null,
    lease_expires_at = null,
    last_error = case when p_status = 'reconciliation_failed' then left(p_error_summary, 500) else null end
  where connection_id = run_row.connection_id
    and active_run_id = p_run_id
    and lease_token = p_lease_token;

  return jsonb_build_object('run_id', p_run_id, 'status', p_status);
end;
$$;

create or replace function public.fail_etsy_order_sync(
  p_run_id uuid,
  p_lease_token uuid,
  p_error_summary text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  run_row public.etsy_order_sync_runs%rowtype;
begin
  select * into run_row
  from public.etsy_order_sync_runs
  where id = p_run_id and lease_token = p_lease_token
  for update;

  if not found then
    return jsonb_build_object('run_id', p_run_id, 'status', 'not_found');
  end if;

  if run_row.status = 'running' then
    update public.etsy_order_sync_runs
    set status = 'failed', error_summary = left(p_error_summary, 500), completed_at = now()
    where id = p_run_id;
  end if;

  update public.etsy_order_sync_state
  set
    active_run_id = null,
    lease_token = null,
    lease_expires_at = null,
    last_error = left(p_error_summary, 500)
  where connection_id = run_row.connection_id
    and active_run_id = p_run_id
    and lease_token = p_lease_token;

  return jsonb_build_object('run_id', p_run_id, 'status', 'failed');
end;
$$;

revoke all on function public.initialize_etsy_order_sync_baseline(text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.begin_etsy_order_sync(text, uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.process_etsy_order_receipt(uuid, uuid, text, bigint, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.finish_etsy_order_sync(uuid, uuid, text, jsonb, uuid, text)
  from public, anon, authenticated;
revoke all on function public.fail_etsy_order_sync(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.initialize_etsy_order_sync_baseline(text, uuid, timestamptz) to service_role;
grant execute on function public.begin_etsy_order_sync(text, uuid, uuid, timestamptz) to service_role;
grant execute on function public.process_etsy_order_receipt(uuid, uuid, text, bigint, jsonb, jsonb) to service_role;
grant execute on function public.finish_etsy_order_sync(uuid, uuid, text, jsonb, uuid, text) to service_role;
grant execute on function public.fail_etsy_order_sync(uuid, uuid, text) to service_role;

comment on table public.etsy_order_sync_state is
  'Server-only owner-approved baseline, successful cursor, and persistent single-sync lease. No row is created by the migration.';
comment on table public.etsy_order_sync_runs is
  'Audited manually triggered Etsy order-sync windows and reconciliation proposal linkage.';
comment on table public.etsy_receipts is
  'Sanitized Etsy receipt state without buyer identity, email, address, messages, or payment details.';
comment on table public.etsy_transactions is
  'Sanitized Etsy sale lines, exact confirmed mapping evidence, processing decision, and unique physical inventory ledger linkage.';
