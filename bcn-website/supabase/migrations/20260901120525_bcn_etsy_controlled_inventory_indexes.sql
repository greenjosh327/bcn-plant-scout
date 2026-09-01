-- Cover Phase 1/2 Etsy foreign keys used by audit and ownership lookups.

create index if not exists etsy_connections_admin_user_idx
  on public.etsy_connections(admin_user_id);

create index if not exists etsy_listing_mappings_confirmed_by_idx
  on public.etsy_listing_mappings(confirmed_by);

create index if not exists etsy_variation_mappings_confirmed_by_idx
  on public.etsy_variation_mappings(confirmed_by);

create index if not exists etsy_inventory_change_sets_connection_idx
  on public.etsy_inventory_change_sets(connection_id);

create index if not exists etsy_inventory_change_sets_approved_by_idx
  on public.etsy_inventory_change_sets(approved_by);
