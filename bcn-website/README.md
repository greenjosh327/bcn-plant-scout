# Base Camp North Website

Public website and future online store for Base Camp North.

This app is intentionally separate from the BCN Plant Scout mobile app and private dashboard.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL-ready schema
- Stripe Checkout for cart payments

## Run Locally

```powershell
cd C:\BCNPlantTracker\bcn-website
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Build

```powershell
cd C:\BCNPlantTracker\bcn-website
npm run build
```

## Test

```powershell
cd C:\BCNPlantTracker\bcn-website
npm test
```

The current automated tests cover the shipping rule engine, package planner,
quote fingerprints, fallback quote behavior, seed envelope mail, mixed carts,
tree restrictions, pickup-only, digital-only, `ships_alone`, max quantity per
package, and missing package data.

## Vercel Deployment

Deploy this folder as its own Vercel project. Do not point the existing
`scout.basecampnorthpa.com` Plant Scout dashboard project at this folder.

Recommended project:

- Project name: `base-camp-north-website`
- Git repository: `greenjosh327/bcn-plant-scout`
- Root directory: `bcn-website`
- Framework preset: `Next.js`
- Build command: `npm run build`
- Install command: `npm install`
- Output directory: leave blank/default for Next.js

Recommended domain:

- `shop.basecampnorthpa.com`

Required environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://hjcskfmssgpdgrhhqzvk.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_UJkg9Mfn-Pzc67XgKWBeHA_7sQkZTd9
NEXT_PUBLIC_SITE_URL=https://shop.basecampnorthpa.com
STRIPE_SECRET_KEY=sk_test_or_live_key_here
STRIPE_WEBHOOK_SECRET=whsec_from_stripe_webhook
SUPABASE_SERVICE_ROLE_KEY=server_only_service_role_key_here
SHIPPO_API_TOKEN=shippo_live_or_test_token_here
SHIPPO_API_MODE=live
SHIPPING_PROVIDER=shippo
SHIPPING_FLAT_RATE_FALLBACK_ENABLED=true
SHIPPING_AUTOMATIC_LABEL_PURCHASE=false
BCN_SHIP_FROM_NAME=Josh Green
BCN_SHIP_FROM_COMPANY=Base Camp North
BCN_SHIP_FROM_STREET1=1517 Long Leaf Drive
BCN_SHIP_FROM_STREET2=
BCN_SHIP_FROM_CITY=Effort
BCN_SHIP_FROM_STATE=PA
BCN_SHIP_FROM_ZIP=18330
BCN_SHIP_FROM_COUNTRY=US
BCN_SHIP_FROM_PHONE=
BCN_SHIP_FROM_EMAIL=
```

Only `NEXT_PUBLIC_*` values are safe for browser code. `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and `SHIPPO_API_TOKEN`
must stay server-side in Vercel environment variables or local `.env.local`.

After the domain is live, add this Supabase Auth redirect URL:

```text
https://shop.basecampnorthpa.com/**
```

## Pages

- `/` Home
- `/shop` Product grid with search, category filter, and sorting
- `/shop/product/[slug]` Product detail page
- `/gis` GIS services placeholder
- `/about` Base Camp North story
- `/contact` Contact placeholder
- `/articles` Article placeholders
- `/cart` Cart and checkout scaffold
- `/cart/success` Stripe checkout success page
- `/admin` Admin dashboard scaffold
- `/api/stripe/webhook` Stripe Checkout webhook for paid orders

## Supabase Setup

Run the SQL files in this order from the Supabase SQL Editor:

1. `supabase/sql/20260703_bcn_catalog_schema.sql`
2. `supabase/sql/20260703_bcn_catalog_seed.sql`
3. `supabase/sql/20260712_bcn_growing_information_fields.sql`
4. `supabase/sql/20260703_bcn_orders_schema.sql`
5. `supabase/sql/20260713_bcn_shipping_data_foundation.sql`
6. `supabase/sql/20260713_bcn_shipping_quotes.sql`
7. `supabase/sql/20260713_bcn_shipping_quote_checkout_link.sql`

The shipping data migration creates:

- product shipping class and package planning fields
- reusable package presets
- shop-level shipping settings for future Shippo rate and label logic
- admin-only RLS policies for shipping setup tables

The order migration creates:

- `orders`
- `order_items`
- inventory decrement functions
- RLS policies so only admins can read order data

The shipping quote migration creates:

- `shipping_quotes` for server-owned cart/address/package quotes
- order columns for selected shipping method, provider, package plan, and rate IDs
- admin-only RLS policies for quote review

The checkout link migration adds Stripe session tracking to reserved shipping
quotes so abandoned sessions and completed orders can be traced cleanly.

The Stripe webhook uses the Supabase service role key on the server to write
orders and update inventory. The browser never writes directly to order tables.

## Stripe Webhook

Create a Stripe webhook endpoint in the Stripe Dashboard:

```text
https://shop.basecampnorthpa.com/api/stripe/webhook
```

Subscribe to this event:

```text
checkout.session.completed
```

Copy the webhook signing secret into Vercel as:

```text
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Local Webhook Testing

Install and log in to the Stripe CLI, then run:

```powershell
cd C:\BCNPlantTracker\bcn-website
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` value printed by Stripe CLI into local `.env.local`, then
start the site:

```powershell
npm run dev
```

Use the shop checkout flow with Stripe test cards. A successful checkout should:

- create one `orders` row
- create one or more `order_items` rows
- mark payment status as `paid`
- save pickup or shipping details
- reduce purchased product or variant inventory
- ignore duplicate webhook retries for the same `stripe_session_id`

## Owner Order Workflow

Open the owner dashboard:

```text
https://shop.basecampnorthpa.com/admin
```

The admin area supports:

- viewing paid Stripe orders written to Supabase
- searching orders by customer, email, SKU, status, fulfillment type, or item name
- filtering open, new, pickup, shipping, fulfilled, cancelled, and all orders
- marking orders ready for pickup, shipped, fulfilled, or cancelled
- copying pickup/customer update messages
- copying shipping addresses
- printing a packing slip
- exporting the visible order list to CSV

Recommended morning test:

1. Place one pickup order with a small test item.
2. Place one shipping order with Stripe test card `4242 4242 4242 4242`.
3. Confirm each order appears in Supabase `orders` and `order_items`.
4. Confirm the `/cart/success` page shows the order summary after checkout.
5. Open `/admin`, search for the customer email, and print a packing slip.
6. Mark pickup as ready, shipping as shipped, then mark both fulfilled.
7. Confirm inventory decreased on the product or variant that was purchased.

## Current State

The site reads products from Supabase when configured and falls back to sample product data in `lib/products.ts`.

Cart, Stripe Checkout, webhook order persistence, customer receipt display, and owner order fulfillment tools
are implemented. Checkout now uses server-owned shipping quotes built from the shipping rules and package
planner. The cart collects a destination address, saves quote options in Supabase, verifies the selected quote
again before Stripe Checkout, links reserved quotes to Stripe sessions, and records quote metadata on paid orders. Pickup is supported, and tax is
delegated to Stripe automatic tax. Paid checkouts create Supabase orders and order items, reduce inventory,
and can be fulfilled from the owner admin dashboard. Shippo live USPS rates are used when configured, while
label purchase, tracking webhooks, customer accounts, automated order emails, and refund handling are future
steps.

## Future Data

The Prisma schema in `prisma/schema.prisma` includes the product fields needed for the store:

- scientific and common names
- category
- inventory
- images
- hardiness, sunlight, soil, bloom or harvest time, mature height, spacing, and native range
- wildlife, pollinator, host plant, growing, planting/germination, and shipping notes
- public display toggles for standardized growing information fields
- shipping class, package preset, packed weight and dimensions, surcharge, free-shipping eligibility,
  expedited/ships-alone flags, Ground Advantage eligibility, and shipping setup status

When ready, connect a PostgreSQL database using `DATABASE_URL` in `.env`.
