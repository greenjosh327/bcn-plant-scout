-- BCN Shop product image storage.
-- Run this in Supabase SQL Editor before using product photo uploads in /admin.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create unique index if not exists product_images_one_primary_per_product_idx
on public.product_images(product_id)
where is_primary = true;

drop policy if exists "Public can read product image files" on storage.objects;
create policy "Public can read product image files"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product image files" on storage.objects;
create policy "Admins can upload product image files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update product image files" on storage.objects;
create policy "Admins can update product image files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete product image files" on storage.objects;
create policy "Admins can delete product image files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.bcn_admins admins
    where admins.user_id = (select auth.uid())
  )
);
