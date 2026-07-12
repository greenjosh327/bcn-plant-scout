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

3. `sql/20260712_bcn_growing_information_fields.sql`
   - Adds standardized growing information display toggles.
   - Adds planting/germination instructions.
   - Cleans old placeholder growing text to `null`.

4. Add the owner/admin user.
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

## Owner catalog admin

The website has an owner-only catalog editor at:

```text
/admin
```

It uses the same Supabase project as the catalog tables. Add these environment
variables in Vercel and in local `.env.local` when testing on your machine:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Only users in `public.bcn_admins` can edit products, variants, and inventory.
The public shop reads active products from Supabase when these environment
variables are present. If they are missing, the shop falls back to the generated
static catalog in `lib/imported-products.ts`.

The admin editor currently supports:

- product name, slug, names, category, description, tags, active/featured state
- ship/local pickup flags
- standardized growing information dropdowns with public display toggles
- growing notes, planting/germination instructions, and shipping notes
- variant price, SKU, active state, and inventory quick edits
- automatic product inventory totals from active variants

Product image editing is intentionally left for a later phase.
