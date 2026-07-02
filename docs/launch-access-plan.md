# BCN Plant Scout Launch Access Plan

This is the intended path for moving from the current soft launch meter to real account access.

## Current app behavior

- Trial meter starts on first app run after the launch-meter update.
- Trial targets are 30 days, 100 records, or 250 photos.
- The app does not block saving, syncing, exporting, or map use yet.
- If a user crosses the soft wall, the app shows "Upgrade coming soon" and keeps working.
- Current owner/super accounts are handled in app code by trusted BCN email address.

## Production super account

Move owner access into Supabase instead of app code.

Recommended profile columns:

```sql
alter table public.profiles
  add column if not exists plan_role text not null default 'trial',
  add column if not exists trial_started_at timestamptz default now(),
  add column if not exists trial_record_limit integer not null default 100,
  add column if not exists trial_photo_limit integer not null default 250,
  add column if not exists trial_day_limit integer not null default 30,
  add column if not exists subscription_status text not null default 'trialing',
  add column if not exists access_expires_at timestamptz;
```

Use `plan_role = 'owner'` for Josh/BCN accounts. The app should treat owner accounts as unlimited.

## Gift codes

Use one unique code per person. Do not put valid gift codes directly in app code.

Recommended table:

```sql
create table if not exists public.gift_codes (
  code text primary key,
  label text,
  plan_role text not null default 'friend',
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.gift_codes enable row level security;
```

For production, redeem codes through a Supabase Edge Function so users cannot forge access from the app.

## Billing later

- iOS: StoreKit/App Store subscription.
- Android: Google Play Billing subscription.
- Supabase should store only entitlement status, not card data.
