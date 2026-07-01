# BCN Plant Scout Web Dashboard

Private Supabase-powered dashboard for BCN Plant Scout field records.

## Local Setup

```powershell
cd C:\BCNPlantTracker\web-dashboard
npm install
Copy-Item .env.example .env.local
```

Edit `.env.local`:

```text
VITE_SUPABASE_URL=https://hjcskfmssgpdgrhhqzvk.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Then run:

```powershell
npm run dev
```

## Vercel Setup

1. Import the GitHub repo into Vercel.
2. Set the project root directory to `web-dashboard`.
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Build command: `npm run build`
5. Output directory: `dist`

## Supabase Auth URLs

In Supabase, go to `Authentication` > `URL Configuration`.

Add redirect URLs for local and production:

```text
http://localhost:5173/**
https://*.vercel.app/**
https://scout.basecampnorthpa.com/**
```

Set the production Site URL after Vercel gives you the final URL.

## Privacy

The dashboard uses the public Supabase publishable key, but data remains private because:

- Users must sign in.
- `observations` rows are protected by RLS.
- `observation_photos` rows are protected by RLS.
- `plant-photos` is a private Storage bucket.
- Photo previews use short-lived signed URLs.
