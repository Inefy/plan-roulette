# Mobile Launch Readiness

This checklist covers the repo and account work needed to ship Plan Roulette to the Apple App Store and Google Play.

## Configured in this repo

- iOS bundle identifier: `app.planroulette.mobile`.
- Android package name: `app.planroulette.mobile`.
- Production invite links are declared as native links for `https://planroulette.app/join/*` and `https://www.planroulette.app/join/*`.
- iOS associated domains are declared for `planroulette.app` and `www.planroulette.app`.
- Android App Links are declared with `autoVerify` for the same invite-link hosts.
- EAS production builds use the `production` channel, Android App Bundle output, iOS medium resource class, and remote build-number management.
- EAS production submit targets the Google Play production track and App Store Connect.
- App Store export compliance is declared as not using non-exempt encryption.
- Calendar permission copy is scoped to adding final plans, and reminder permission copy is omitted because reminders are not used.

## Required account and domain setup

Do not commit any of these secrets or account-specific files.

1. Run `npx eas-cli@latest init` while signed in to the correct Expo account if the project is not already linked to EAS.
2. Set production EAS environment variables:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Confirm Apple Developer settings:
   - Bundle ID `app.planroulette.mobile` exists.
   - Associated Domains capability is enabled.
   - App Store Connect app record exists for Plan Roulette.
   - App privacy answers match `docs/launch-copy.md`.
4. Host Apple universal-link files:
   - `https://planroulette.app/.well-known/apple-app-site-association`
   - `https://www.planroulette.app/.well-known/apple-app-site-association`
5. Confirm Google Play settings:
   - Package name `app.planroulette.mobile` exists.
   - Play App Signing is enabled.
   - Production store listing uses the copy in `docs/launch-copy.md`.
   - Data Safety answers match `docs/launch-copy.md`.
6. Host Android App Links verification files:
   - `https://planroulette.app/.well-known/assetlinks.json`
   - `https://www.planroulette.app/.well-known/assetlinks.json`
7. Run the full QA checklist in `docs/mvp-qa-checklist.md` on one iPhone and one Android device before production submission.

## Domain file templates

Replace `APPLE_TEAM_ID` and Android SHA-256 fingerprints with the real production values before hosting.

Apple `apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["APPLE_TEAM_ID.app.planroulette.mobile"],
        "components": [
          {
            "/": "/join/*",
            "comment": "Plan Roulette invite links"
          }
        ]
      }
    ]
  }
}
```

Android `assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.planroulette.mobile",
      "sha256_cert_fingerprints": [
        "SHA256_PRODUCTION_CERT_FINGERPRINT"
      ]
    }
  }
]
```

## Release commands

Run these from a clean `main` checkout after the account setup is complete.

```bash
npm test
npm run typecheck
npx expo install --check
npx expo-doctor
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform all
```

After EAS Submit, Apple still requires selecting the uploaded build in App Store Connect and submitting it for App Review.
