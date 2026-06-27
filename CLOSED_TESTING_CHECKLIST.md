# Closed Testing Checklist

## Local Validation

- [ ] `npm.cmd run typecheck` passes.
- [ ] `npx.cmd expo config --type public` passes.
- [ ] Expo Go test can save a new record.
- [ ] Supabase upload reports reachable/synced.
- [ ] CSV export works.
- [ ] GeoJSON export works.
- [ ] ZIP export includes photos.

## Android Build

- [x] Log in to Expo/EAS.
- [x] Build preview APK:

```powershell
cd C:\BCNPlantTracker
npx.cmd eas build -p android --profile preview
```

Preview build:

https://expo.dev/accounts/bcn.pa/projects/bcn-plant-tracker/builds/d1956280-14b8-4272-a371-9d5a2d223d4a

- [ ] Install preview APK on Android phone and run smoke test.
- [x] Build production AAB:

```powershell
cd C:\BCNPlantTracker
npx.cmd eas build -p android --profile production
```

Production AAB:

https://expo.dev/artifacts/eas/d8NmbaXYxEEgtXkDMLb36YvU-bOqABBCV9lyISgDM7I.aab

## Google Play Console

- [ ] Create app: `BCN Plant Scout`.
- [ ] Package name: `com.basecampnorth.bcnplantscout`.
- [ ] Upload production `.aab` to closed testing track.
- [ ] Add app icon/screenshots.
- [ ] Add short description and full description from `PLAY_STORE_LISTING_DRAFT.md`.
- [ ] Fill Data Safety using `PLAY_STORE_LISTING_DRAFT.md`.
- [ ] Add privacy policy URL.
- [ ] Add testers by email list or Google Group.
- [ ] Submit closed testing release for review.

## Closed Test Smoke Test

- [ ] Install from Play closed testing link.
- [ ] Create/sign into account.
- [ ] Take photo.
- [ ] Confirm plant ID.
- [ ] Capture GPS.
- [ ] Save plant.
- [ ] Add extra photo.
- [ ] Open map.
- [ ] Export ZIP.
- [ ] Sync to Supabase.
- [ ] Delete test record if needed.

## Known Before 1.0 Public Release

- Public map/dashboard is not part of mobile 1.0.
- Shared-with-BCN records are synced but still protected by user-level RLS.
- Push notifications are local return reminders, not server push.
