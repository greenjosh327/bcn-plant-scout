# BCN Plant Scout Release Notes

## Toward 1.0

### Account and sign-in
- Google sign-in is wired through Supabase Auth for Expo Go testing and built apps.
- Account screen hides email/password fields after sign-in so signed-in users see a cleaner status view.
- Account deletion and password reset actions remain available from the Account page.

### Cloud sync
- Supabase auth is wired for email/password sign-in.
- Records can be queued, uploaded, retried, and marked synced locally.
- Failed syncs now keep the Supabase error message on the saved plant card and detail view.
- Cloud Prep shows local-only, pending, synced, failed, privacy, and photo counts.
- Cloud Prep can queue older local-only records for upload.
- Upload order is observation row first, then photo metadata, which matches database constraints.

### Photos and exports
- Main and extra photos are included in ZIP export packages.
- ZIP exports include CSV, GeoJSON, README, and a photos folder.
- Extra photos can be shared, deleted, and promoted to primary.

### Field workflow
- New Plant starts camera-first, then runs plant identification and GPS capture as part of the field flow.
- Saved Plants includes search, filters, return filters, collection interest filters, and sorting.
- Returns has quick actions for Ready, Collected, +7 days, Open Map, and Edit.
- Plant Map uses a native phone map with saved plant markers, cluster count bubbles, filters, nearest-plant jump, selected plant cards, quick Ready/Collected actions, and Google Maps navigation.
- New records default to sharing with BCN, with opt-out privacy choices.
- Saved plants can be edited, mapped, photographed again, shared, and deleted.
- Delete confirmation now protects against accidental deletion and cancels scheduled return reminders.
- Return reminders are configured for local notifications.

### Supabase setup
- `supabase-setup.sql` contains the expected tables, indexes, RLS policies, storage bucket, and storage policies.
- Google provider setup requires redirect URLs in Supabase:
  - `bcnplantscout://auth/callback`
  - `bcnplantscout://**`
  - `exp://**`

### Build metadata
- Android package: `com.basecampnorth.bcnplantscout`
- Android versionCode for the next closed-test build: `8`
- iOS bundle ID: `com.basecampnorth.bcnplantscout`
- iOS build number for the next TestFlight build: `3`

Latest production AAB for Google Play closed testing:

https://expo.dev/artifacts/eas/5GxF4y5AhK7YyGstSMPf4FPfbIpdcL9MRU2NRHROpbU.aab

## Next Test Pass

1. Run `supabase-setup.sql` in the Supabase SQL editor.
2. Start Expo with `npx.cmd expo start --clear --tunnel`.
3. Sign in on the Account page with Google or email/password.
4. On Cloud Prep, tap `Prepare Local Records for Upload` if local-only records exist.
5. Tap `Upload Pending Records` or `Retry Failed Syncs`.
6. Confirm records appear in Supabase `observations` and `observation_photos`.
7. Confirm photos appear in the `plant-photos` storage bucket under `users/{user_id}/observations/`.
