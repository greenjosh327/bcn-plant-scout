# Base Camp North Website

Public website and future online store for Base Camp North.

This app is intentionally separate from the BCN Plant Scout mobile app and private dashboard.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL-ready schema
- Stripe dependency installed for future checkout work

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
- `/admin` Admin dashboard scaffold

## Current State

The site uses sample product data in `lib/products.ts`.

Live payments, shipping, tax, admin auth, customer accounts, and email automation are not implemented yet.

## Future Data

The Prisma schema in `prisma/schema.prisma` includes the product fields needed for the store:

- scientific and common names
- category
- inventory
- images
- hardiness, sunlight, soil, bloom time, height, spread
- wildlife, pollinator, host plant, growing, and shipping notes

When ready, connect a PostgreSQL database using `DATABASE_URL` in `.env`.
