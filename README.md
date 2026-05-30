# Plan Roulette

MVP foundation for a React Native + Expo app using TypeScript and Expo Router.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

Fill `.env` with your Supabase project URL and anon key:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
```

Required environment variables:

- `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: Supabase public anon key.

Never use a Supabase service role key in this Expo app, `.env`, EAS environment variables, or checked-in configuration. The anon key is public client-side configuration, so Supabase tables must use strict Row Level Security policies.

## Run Targets

```bash
npm run android
npm run ios
npm run web
```

## Native Calendar

The optional "Add to calendar" action uses `expo-calendar`. Because this native module is not available in Expo Go, test it with a development build:

```bash
npx expo run:ios
npx expo run:android
```

Web and unsupported native environments fall back to copying the final plan.

## Internal Builds

Expo config is prepared for internal builds with:

- App name: `Plan Roulette`
- Slug: `plan-roulette`
- Scheme: `planroulette`
- iOS bundle identifier: `app.planroulette.mobile`
- Android package: `app.planroulette.mobile`
- Icon placeholder: `./assets/icon.png`
- Splash placeholder: `./assets/splash-icon.png`

Confirm the bundle/package identifiers against the final store accounts before production store submission.

EAS profiles:

```bash
npx eas build --profile development --platform ios
npx eas build --profile development --platform android
npx eas build --profile preview --platform all
npx eas build --profile production --platform all
```

Set the required Expo public Supabase variables for local shells and EAS build environments. Do not set or store Supabase service role keys for this client app.

## Project Structure

```text
src/app
src/components
src/constants
src/data
src/features
src/lib
src/types
src/utils
```

## Checks

```bash
npm run typecheck
npm test
```
