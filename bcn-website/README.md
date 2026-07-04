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
```

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

## Current State

The site reads products from Supabase when configured and falls back to sample product data in `lib/products.ts`.

Cart and Stripe Checkout are implemented. Shipping is a simple flat-rate first pass, pickup is supported,
and tax is delegated to Stripe automatic tax. Inventory decrement, order records, webhooks, customer
accounts, and email automation are next.

## Future Data

The Prisma schema in `prisma/schema.prisma` includes the product fields needed for the store:

- scientific and common names
- category
- inventory
- images
- hardiness, sunlight, soil, bloom time, height, spread
- wildlife, pollinator, host plant, growing, and shipping notes

When ready, connect a PostgreSQL database using `DATABASE_URL` in `.env`.
