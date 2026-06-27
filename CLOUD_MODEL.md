# BCN Plant Scout Cloud Model

## Current Goal

The mobile app is local-first. It should keep working in the field with weak signal, then sync records and photos to Supabase when the user is signed in.

## Current Tables

### `profiles`

One row per signed-in user.

- `id`: Supabase auth user ID
- `email`
- `display_name`
- timestamps

### `observations`

One row per saved plant record.

- stable local ID used as the primary key
- user/owner IDs
- plant names and ID confidence
- exact GPS and accuracy
- photo URI and storage path
- notes, return date, reminder data
- collection interests and status
- privacy level
- sync status fields

### `observation_photos`

One row per primary or extra photo.

- photo ID
- observation ID
- user ID
- local URI
- Supabase storage path
- file name
- role: `primary` or `extra`
- sync fields

### Storage Bucket

`plant-photos`

Path pattern:

```text
users/{user_id}/observations/{observation_id}/{photo_role}-{file_name}
```

## Privacy Model

Current privacy levels:

- `private`: user keeps the record private.
- `share with BCN`: default. Good for the nursery dataset.
- `public approximate`: future public map candidate.

Important: current RLS keeps rows user-owned. A future BCN admin/web dashboard will need either:

- an admin role/service endpoint, or
- a separate public/shared table populated from approved records.

## Recommended 1.0 Scope

- Keep mobile app local-first.
- Sync authenticated user records and photos.
- Keep exact coordinates protected by RLS.
- Use ZIP export for GIS backup and QGIS work.
- Defer public map publishing until there is a reviewed sharing workflow.

## Recommended Post-1.0 Scope

- Web dashboard for signed-in users.
- BCN admin view for shared records.
- Public approximate map table or view.
- Server-side photo thumbnails.
- Conflict handling when a record is edited on more than one device.
