# BCN Plant Scout Runbook

## Start The App

```powershell
cd C:\BCNPlantTracker
npx.cmd expo start --clear --tunnel
```

Scan the QR code with Expo Go.

## Typecheck

```powershell
cd C:\BCNPlantTracker
npm.cmd run typecheck
```

## EAS Project

- Expo account: `bcn.pa`
- Project: `@bcn.pa/bcn-plant-tracker`
- Project URL: https://expo.dev/accounts/bcn.pa/projects/bcn-plant-tracker
- Android package: `com.basecampnorth.bcnplantscout`

## Build For Closed Testing

Preview APK for direct phone testing:

```powershell
cd C:\BCNPlantTracker
npm.cmd run build:android:preview
```

Production AAB for Google Play closed testing:

```powershell
cd C:\BCNPlantTracker
npm.cmd run build:android:production
```

## Supabase Setup

1. Open the Supabase project.
2. Go to SQL Editor.
3. Run `supabase-setup.sql`.
4. Confirm these tables exist:
   - `profiles`
   - `observations`
   - `observation_photos`
5. Confirm this storage bucket exists:
   - `plant-photos`

## Sync Test

1. Open the app.
2. Go to `Account`.
3. Sign in.
4. Go to `Cloud Prep`.
5. If needed, tap `Prepare Local Records for Upload`.
6. Tap `Upload Pending Records` or `Retry Failed Syncs`.
7. Check Supabase:
   - `observations` has the plant rows.
   - `observation_photos` has primary/extra photo rows.
   - Storage has files under `plant-photos/users/{user_id}/observations/`.

## Export Test

1. Go to `Export`.
2. Try CSV.
3. Try GeoJSON.
4. Try ZIP package.
5. Open the ZIP and confirm:
   - `bcn-plant-observations.csv`
   - `bcn-plant-observations.geojson`
   - `README.txt`
   - `photos/`

## Field Test Checklist

- Take a new plant photo.
- Confirm auto ID fills name/scientific name/AKA names.
- Capture GPS.
- Pick more than one collection interest.
- Choose a return date.
- Save.
- Open map from Saved Plants.
- Add an extra photo.
- Edit the record.
- Export a ZIP.
- Sync to Supabase.
