# BCN Plant Scout Privacy Policy Draft

Effective date: 2026-06-25

BCN Plant Scout is a field-record app for Base Camp North. It helps users record plant observations with photos, GPS locations, plant names, collection notes, return reminders, exports, and optional cloud sync.

## Information The App Collects

The app may collect:

- Email address for account sign-in.
- Plant observation names and notes entered by the user.
- Plant photos selected or taken by the user.
- GPS coordinates and location accuracy for saved observations.
- Return dates, reminder settings, collection interests, and collection status.
- Plant identification results, including suggested common names, scientific names, and confidence scores.

## How Information Is Used

Information is used to:

- Save local plant observation records on the device.
- Identify plants from photos when the user chooses or auto-identification is enabled.
- Capture GPS points for field records.
- Export records for GIS, spreadsheet, or archive use.
- Sync records and photos to Supabase when the user is signed in.
- Support Base Camp North nursery recordkeeping when the user chooses `share with BCN`.

## Location Data

The app records location only when creating or updating plant observation records. Location data is used to help users return to plants and to support GIS exports.

Exact GPS coordinates are controlled by the app privacy setting. Public map or approximate-location sharing is not part of the current 1.0 release.

## Photos

Photos are stored locally on the device and may be uploaded to Supabase storage when cloud sync is used. Photos are used for field records, plant identification, sharing, and exports.

## Cloud Sync

Cloud sync uses Supabase. Records are associated with the signed-in user's account. Access is protected with Supabase authentication and row-level security policies.

## Third-Party Services

The app may use:

- Supabase for authentication, database storage, and photo storage.
- Pl@ntNet for plant identification from user-selected plant photos.
- Google Maps links for opening saved GPS points in a map app.

## User Choices

Users can:

- Keep records local by not signing in or not uploading.
- Mark records private.
- Share records with BCN.
- Export records as CSV, GeoJSON, or ZIP packages.
- Delete local saved records in the app.

## Contact

For privacy questions, contact Base Camp North through the BCN website:

https://basecampnorth-pa.square.site
