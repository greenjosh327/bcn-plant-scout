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
