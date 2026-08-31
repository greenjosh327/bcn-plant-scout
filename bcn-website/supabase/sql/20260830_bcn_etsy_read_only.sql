-- Phase 1 Etsy integration: one server-only OAuth connection for BaseCampNorthPA.
-- Listings remain live Etsy data; this table never changes BCN catalog or inventory.

create table if not exists public.etsy_connections (
  id text primary key check (id = 'basecampnorthpa'),
  admin_user_id uuid references auth.users(id) on delete set null,
  etsy_user_id bigint,
  shop_id bigint,
  shop_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  access_token_expires_at timestamptz,
  granted_scopes text[] not null default '{}'::text[],
  oauth_state_hash text,
  oauth_code_verifier_encrypted text,
  oauth_state_expires_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint etsy_connections_positive_user_id check (etsy_user_id is null or etsy_user_id > 0),
  constraint etsy_connections_positive_shop_id check (shop_id is null or shop_id > 0)
);

alter table public.etsy_connections enable row level security;

revoke all on table public.etsy_connections from public, anon, authenticated;
revoke all on table public.etsy_connections from service_role;
grant select, insert, update, delete on table public.etsy_connections to service_role;

drop trigger if exists set_etsy_connections_updated_at on public.etsy_connections;
create trigger set_etsy_connections_updated_at
before update on public.etsy_connections
for each row execute function public.touch_updated_at();

comment on table public.etsy_connections is
  'Server-only Etsy OAuth connection state and encrypted credentials for the BaseCampNorthPA read-only integration.';
comment on column public.etsy_connections.access_token_encrypted is
  'AES-256-GCM ciphertext produced by the application; never a plaintext Etsy access token.';
comment on column public.etsy_connections.refresh_token_encrypted is
  'AES-256-GCM ciphertext produced by the application; never a plaintext Etsy refresh token.';
