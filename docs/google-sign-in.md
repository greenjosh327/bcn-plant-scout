# Google Sign-In Setup

BCN Plant Scout has app-side Google OAuth wiring through Supabase Auth.

## App Redirect

Use these redirect URLs in Supabase Auth settings:

```text
bcnplantscout://auth/callback
bcnplantscout://**
exp://**
```

## Supabase Dashboard

1. Open Supabase Dashboard.
2. Go to Authentication > Providers.
3. Enable Google.
4. Add the Google OAuth client ID and client secret from Google Cloud.
5. Go to Authentication > URL Configuration.
6. Add the redirect URLs above to Redirect URLs.

`exp://**` is for Expo Go testing. `bcnplantscout://**` is for the built
Android/iOS app.

## Google Play Data Safety

For account creation, BCN Plant Scout now supports:

- Username and password
- OAuth

The account deletion URL remains:

```text
https://greenjosh327.github.io/bcn-plant-scout/delete-account/
```
