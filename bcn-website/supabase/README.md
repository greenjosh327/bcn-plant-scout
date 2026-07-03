# Base Camp North Supabase Catalog Setup

Run these files in the Supabase SQL Editor for the BCN project:

1. `sql/20260703_bcn_catalog_schema.sql`
   - Creates catalog tables.
   - Enables RLS.
   - Allows public read access for active products.
   - Restricts product, inventory, and image edits to users listed in `bcn_admins`.

2. `sql/20260703_bcn_catalog_seed.sql`
   - Loads the imported Square/Squarespace catalog into `products`, `product_variants`, and `product_images`.
   - Safe to rerun. Existing rows are updated by id.

3. Add the owner/admin user.
   - Find your user id in Supabase Authentication > Users.
   - Run:

```sql
insert into public.bcn_admins (user_id)
values ('YOUR-AUTH-USER-ID-HERE')
on conflict (user_id) do nothing;
```

The import source files are:

- `C:\Users\green\Downloads\MLPXB0KH69RQW_catalog-2026-07-03-0207.csv`
- `C:\Users\green\Downloads\EtsyListingsDownload.csv`

To regenerate the static catalog and seed SQL:

```powershell
cd C:\BCNPlantTracker
python .\bcn-website\scripts\import_catalog.py
```
