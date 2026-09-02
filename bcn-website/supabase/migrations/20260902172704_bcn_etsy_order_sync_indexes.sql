-- Cover Phase 2.5 foreign keys used by audit lookups and retained-row deletes.
create index etsy_order_sync_state_initialized_by_idx
  on public.etsy_order_sync_state(baseline_initialized_by);
create index etsy_order_sync_state_active_run_idx
  on public.etsy_order_sync_state(active_run_id)
  where active_run_id is not null;
create index etsy_order_sync_runs_requested_by_idx
  on public.etsy_order_sync_runs(requested_by);
create index etsy_order_sync_runs_proposal_idx
  on public.etsy_order_sync_runs(reconciliation_proposal_id)
  where reconciliation_proposal_id is not null;
create index etsy_transactions_last_run_idx
  on public.etsy_transactions(last_sync_run_id);
create index etsy_transactions_listing_mapping_idx
  on public.etsy_transactions(listing_mapping_id)
  where listing_mapping_id is not null;
create index etsy_transactions_variation_mapping_idx
  on public.etsy_transactions(variation_mapping_id)
  where variation_mapping_id is not null;
create index etsy_transactions_variant_idx
  on public.etsy_transactions(bcn_variant_id)
  where bcn_variant_id is not null;
create index etsy_transactions_ledger_idx
  on public.etsy_transactions(ledger_id)
  where ledger_id is not null;
