alter table public.etsy_one_time_draft_operations
  drop constraint if exists etsy_one_time_draft_operations_id_check,
  drop constraint if exists etsy_one_time_draft_operations_image_ranks_check;

alter table public.etsy_one_time_draft_operations
  add constraint etsy_one_time_draft_operations_id_check
    check (id in ('muscadine-2026-draft', 'spicebush-2026-draft')),
  add constraint etsy_one_time_draft_operations_image_ranks_check
    check (image_ranks <@ array[1, 2, 3, 4]::smallint[]);

comment on table public.etsy_one_time_draft_operations is
  'Server-only, single-use authorization and audit state for fixed, owner-approved Etsy draft operations.';
