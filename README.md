# BCN Plant Scout

Privacy policy and public app information for BCN Plant Scout.

Privacy policy:

https://greenjosh327.github.io/bcn-plant-scout/privacy-policy/

## iOS TestFlight Deployment

BCN Plant Scout is an Expo/React Native app, so iOS TestFlight builds use EAS Build and EAS Submit.

### App Details

- App name: `BCN Plant Scout`
- Bundle ID: `com.basecampnorth.bcnplantscout`
- Expo project: `@bcn.pa/bcn-plant-tracker`

### One-Time Apple Setup

1. Join/confirm Apple Developer Program access.
2. In App Store Connect, create a new app:
   - Platform: iOS
   - Name: `BCN Plant Scout`
   - Bundle ID: `com.basecampnorth.bcnplantscout`
   - SKU: `bcn-plant-scout`
3. Make sure your Apple account has access to Certificates, Identifiers & Profiles.

### Build iOS IPA

Run from PowerShell:

```powershell
cd C:\BCNPlantTracker
npx.cmd eas build -p ios --profile production
```

EAS will ask you to sign in to Apple and can create/manage the iOS distribution certificate and provisioning profile.

### Upload To TestFlight

After the iOS build finishes:

```powershell
cd C:\BCNPlantTracker
npx.cmd eas submit -p ios --latest
```

EAS will upload the latest iOS build to App Store Connect/TestFlight.

### GitHub Actions Secrets For Future Automation

For fully automatic GitHub Actions uploads, add these repository secrets:

- `EXPO_TOKEN`: Expo access token from expo.dev.
- `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key.
- `EXPO_PUBLIC_PLANTNET_API_KEY`: Pl@ntNet API key.

For non-interactive TestFlight submission, also add App Store Connect API key secrets:

- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_API_KEY_P8`

The `.p8` key must be created in App Store Connect under Users and Access > Integrations > App Store Connect API.
