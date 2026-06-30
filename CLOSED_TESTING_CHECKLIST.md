# Closed Testing Checklist

## Local Validation

- [x] `npm.cmd run typecheck` passes.
- [x] `npx.cmd expo config --type public` passes.
- [x] `npx.cmd expo export --platform android --clear` passes.
- [ ] Expo Go test can save a new record.
- [ ] Google sign-in returns to the app and shows the correct signed-in email.
- [ ] Email/password reviewer account still signs in.
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

Latest production AAB for the next closed test:

https://expo.dev/artifacts/eas/nVl3ng_gIBxgnpqfSAwNYaY1Q-9_AgRH65zDDBDk6xI.aab

Build logs:

https://expo.dev/accounts/bcn.pa/projects/bcn-plant-tracker/builds/2c5d2abf-e68b-4e6f-a51e-eee92c7ebdc3

Current local config is Android `versionCode` 7. Google Play needs each
uploaded AAB to have a version code it has never seen before.

## Google Play Console

- [ ] Create app: `BCN Plant Scout`.
- [ ] Package name: `com.basecampnorth.bcnplantscout`.
- [ ] Upload production `.aab` to closed testing track.
- [ ] If Play Console says version code was already used, rebuild after confirming `app.json` has a higher `android.versionCode`.
- [ ] Add app icon/screenshots.
- [ ] Add short description and full description from `PLAY_STORE_LISTING_DRAFT.md`.
- [ ] Fill Data Safety using `PLAY_STORE_LISTING_DRAFT.md`.
- [ ] Add privacy policy URL.
- [ ] Add testers by email list or Google Group.
- [ ] Submit closed testing release for review.

## Closed Test Smoke Test

- [ ] Install from Play closed testing link.
- [ ] Create/sign into account.
- [ ] Sign in with Google.
- [ ] Take photo.
- [ ] Confirm plant ID.
- [ ] Capture GPS.
- [ ] Save plant.
- [ ] Add extra photo.
- [ ] Open map.
- [ ] Tap map markers and confirm selected plant card appears.
- [ ] Test map controls: My Location, Nearest Plant, Fit Plants, Zoom In/Out, Satellite.
- [ ] Mark a mapped plant Ready and Collected from the map card.
- [ ] Export ZIP.
- [ ] Sync to Supabase.
- [ ] Delete test record if needed.

## Known Before 1.0 Public Release

- Public map/dashboard is not part of mobile 1.0.
- Shared-with-BCN records are synced but still protected by user-level RLS.
- Push notifications are local return reminders, not server push.
