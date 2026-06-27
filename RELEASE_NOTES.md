# BCN Plant Scout Release Notes

## Toward 1.0

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
- New records default to sharing with BCN, with opt-out privacy choices.
- Saved plants can be edited, mapped, photographed again, shared, and deleted.
- Delete confirmation now protects against accidental deletion and cancels scheduled return reminders.
- Return reminders are configured for local notifications.

### Supabase setup
- `supabase-setup.sql` contains the expected tables, indexes, RLS policies, storage bucket, and storage policies.

## Next Test Pass

1. Run `supabase-setup.sql` in the Supabase SQL editor.
2. Start Expo with `npx.cmd expo start --clear --tunnel`.
3. Sign in on the Account page.
4. On Cloud Prep, tap `Prepare Local Records for Upload` if local-only records exist.
5. Tap `Upload Pending Records` or `Retry Failed Syncs`.
6. Confirm records appear in Supabase `observations` and `observation_photos`.
7. Confirm photos appear in the `plant-photos` storage bucket under `users/{user_id}/observations/`.
