# BCN Plant Scout Next Feature Review

## Implemented in this pass

- Cloud download from Supabase observations into local storage.
- Conservative conflict handling: unsynced local edits are kept when cloud data also exists.
- Clearer Cloud Prep messaging for last sync and upload/download behavior.
- Record-level photo retry from Saved Plants for failed sync records.
- Sync Now button that runs upload and download from Cloud Prep.
- Saved Plants search by name, scientific name, alternate names, notes, gather notes, status, collection interests, privacy, and sync status.
- Saved Plants filters for collection type and return date.
- Saved Plants sorting by newest, name, ready-now status, and GPS distance.
- Plant Map screen with a stable local location list, status/collection filters, search, nearby filter, legend, and Google Maps navigation actions.
- Favorites and tags fields for local records, exports, search, map filtering, and Supabase rows.
- Return list quick actions for Ready, Collected, and +7 days.
- Account screen password reset support through Supabase Auth.
- In-app account deletion request flow pointing to the public deletion page or email request.
- New Plant is now camera-first from Home/Menu.
- GPS is acquired automatically while the New Plant form is open and shown as a simple quality indicator.
- New Plant form is simplified to photo, ID, plant names, notes, and return date.
- Advanced Options now contains reminder settings, gather notes, collection interests, privacy, favorite, tags, and raw GPS coordinates.
- Take Another Photo replaces the current unsaved photo, keeps GPS/form context, and reruns AI identification.
- AI identification now shows the suggested species, confidence, Accept ID, Take Another Photo, and alternate species choices.

## Needs review

- Downloaded cloud records currently restore observation metadata. Cloud photo files are not downloaded back into local app storage yet.
- Conflict handling is intentionally conservative. If a local record is pending or failed, cloud download keeps the local copy and adds a sync error note.
- Photo retry is record-level, not true per-thumbnail retry yet.
- Favorites are local-first and sync-ready, but older cloud tables need the columns below before upload.
- Map clustering is lightweight grouping, not full production clustering.
- Google sign-in is working through Supabase Auth. Email/password remains the fallback provider.

## Supabase notes

- No new tables are required for this pass.
- Existing Supabase projects should run:

```sql
alter table public.observations
  add column if not exists favorite boolean not null default false;

alter table public.observations
  add column if not exists tags text[] not null default '{}';
```

- Existing RLS policies must allow signed-in users to select their own `observations` rows.
- Existing RLS policies must allow upsert/select on `observation_photos` and upload to the `plant-photos` bucket path used by the app.

## Auth production notes

- Keep email/password as the fallback provider.
- Google is configured in Supabase Auth.
- Redirect URLs needed for Expo/dev and production builds:
  - `bcnplantscout://auth/callback`
  - `bcnplantscout://**`
  - `exp://**`
- Add Facebook only if the product needs it later.
- Apple sign-in should be enabled before iOS public release if account creation is offered on iOS.
- Apple sign-in is not implemented yet.

## Phone test checklist

- Open Plant Map and confirm saved plant locations appear in the local list.
- Select a map record and test View Details, Navigate, and Edit.
- Try map status, collection type, nearby, favorites, and search filters.
- Search Saved Plants by plant name, notes, status, and collection interest.
- Filter Saved Plants by collection type and return date.
- Use GPS sort and confirm the location permission prompt behaves normally.
- Edit a record, add tags, mark favorite, save, and confirm it appears in search/map filters.
- Use Returns quick actions: Ready, Collected, and +7 days.
- Upload pending records, then use Download Cloud Records.
- Use Sync Now from Cloud Prep.
- Sign out/in and send a password reset email.
- Open Request Account Deletion and confirm the public page opens.
- Force or inspect a failed sync record and try Retry Photos.
- From Home, tap New Plant and confirm the camera opens immediately.
- Cancel camera and confirm the New Plant form still loads safely.
- Take a photo and confirm GPS status changes from acquiring to a quality rating.
- Tap Take Another Photo and confirm the image changes, GPS stays, and AI runs again.
- Confirm only core form fields are visible before opening Advanced Options.
- Open Advanced Options and confirm tags, favorite, collection interests, privacy, and raw GPS are available.
- Confirm AI alternatives can be selected and Accept ID marks the suggestion accepted.
