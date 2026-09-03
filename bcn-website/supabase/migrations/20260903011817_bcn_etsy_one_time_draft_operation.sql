create table if not exists public.etsy_one_time_draft_operations (
  id text primary key,
  token_hash text,
  status text not null default 'approved',
  listing_id bigint,
  image_ranks smallint[] not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint etsy_one_time_draft_operations_id_check
    check (id = 'muscadine-2026-draft'),
  constraint etsy_one_time_draft_operations_token_hash_check
    check (token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
  constraint etsy_one_time_draft_operations_status_check
    check (status in ('approved', 'creating', 'created', 'uploading', 'complete', 'failed')),
  constraint etsy_one_time_draft_operations_listing_id_check
    check (listing_id is null or listing_id > 0),
  constraint etsy_one_time_draft_operations_image_ranks_check
    check (image_ranks <@ array[1, 2, 3]::smallint[])
);

alter table public.etsy_one_time_draft_operations enable row level security;

revoke all on table public.etsy_one_time_draft_operations from public, anon, authenticated;
grant select, insert, update, delete on table public.etsy_one_time_draft_operations to service_role;

comment on table public.etsy_one_time_draft_operations is
  'Server-only, single-use authorization and audit state for the fixed 2026 Muscadine Etsy draft operation.';
