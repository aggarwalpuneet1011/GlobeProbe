# GlobeProbe

An offline-first Android app that teaches primary-school children geography by letting them change a simulation and explain what happened. Eight concepts across water, air and coast: puddles drying, wind, rain on mountains, tides and landforms, with an interactive 3D globe. One child profile at a time, no accounts, no tracking. Built with Expo SDK 54, React Native 0.81.5, TypeScript, expo-router, Skia (2D sims), react-three-fiber (globe and landform) and expo-sqlite.

## Run it

```bash
npm install
npx expo start          # Skia, GL and audio modules need a development build or the EAS APK
```

Build the installable APK (needs your Expo login):

```bash
npx eas-cli login
npx eas-cli init        # first time only; writes the project id into app.json
eas build -p android --profile preview
```

The APK link appears when the build finishes.

### Build: arm64-only

The `development` and `preview` profiles build for `arm64-v8a` only, set via `ORG_GRADLE_PROJECT_reactNativeArchitectures` in `eas.json`. This roughly halves EAS build time (the native compile for Skia, Reanimated and GL is most of it) and shrinks the APK.

- Works on: any modern 64-bit Android phone.
- Won't install on: x86/x86_64 emulators, or 32-bit phones (some budget Android Go devices). Check a phone with `adb shell getprop ro.product.cpu.abi`; it should print `arm64-v8a`.
- To build for all architectures, remove the `env` line from the profile.
- The `production` profile is untouched: it builds a Play Store AAB for all architectures. An AAB can't be installed directly on a phone; use `preview` for that.

## First launch

1. Setup asks for a 4-digit Parent PIN (twice), an optional Gemini key, then the first child profile.
2. The Parent Zone (hold the lock on the profile screen for 3 seconds) is where you add or change the key later: Settings, paste, Test key. The Parent Zone also has an AI model picker (3.8 Flash, 3.6 Flash, 3.5 Flash-Lite); if the chosen model returns 404 the app steps to the next one. The key lives in the phone's secure store and is read only by `src/ai/gemini.ts`. Without a key everything works except spoken Case answers and free-text Why? questions (Case Files fall back to Build-it, Why? falls back to the FAQ).

## Checks

```bash
npm run typecheck
npm test                       # 16 pure-logic and mock-render test files
npm run validate:content
node scripts/check-assets.mjs
```

## Layout

- `app/` routes: setup, profiles, tabs (Home, Journey, Globe, Diary), Stop, Lab, Duel, Case, Sky, Review, Parent Zone.
- `src/content/` all concepts, duel decks, cases, places and copy as data.
- `src/sims/` 2D sims (fixed 30 Hz, seeded) and `src/three/` globe and landform.
- `src/learning/` mastery, reviews, duel rounds. `src/db/` SQLite schema and queries. `src/ai/` Gemini layer.
- `assets/` icons, Bindu, splash, sounds, textures. `assets/photos/` is empty by design.
- `scripts/gen-registries.mjs` regenerates the asset registry after you add photos.

## Privacy

No analytics, no accounts, no location, no notifications. Permissions: microphone, camera, internet, and wake lock (keeps the screen on; Parent Zone switch). Network hosts: api.open-meteo.com, marine-api.open-meteo.com, generativelanguage.googleapis.com.
