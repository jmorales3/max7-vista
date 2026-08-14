---
name: Expo OTA update channel
description: The patient-images-mobile app uses Expo's OTA update system (expo-updates), not the dev server or Replit publish, to deliver JS bundle changes to installed phones.
---

# Expo OTA update channel

## Rule
Any code change that needs to reach the user's physical phone must be pushed via `eas update`, not via Replit publish or dev server restart.

**Why:** The installed native app (EAS build, `production` channel, project ID `d925dfed-65f1-4a09-a76a-7bf438eb8f17`) fetches JS bundles from `https://u.expo.dev/...`. Replit publish only updates the static web export and the API server. The dev server (`artifacts/patient-images-mobile: expo`) is irrelevant to the installed app.

## How to apply
- Whenever the user asks "do I need to do anything to get changes onto the phone?" — answer: yes, run `eas update`.
- Command (run from `artifacts/patient-images-mobile`):
  ```
  npx eas-cli@latest update --channel production --message "<description>" --non-interactive
  ```
- EXPO_TOKEN secret is available; `eas whoami` authenticates as `jmorales3`.
- After publishing, the user just force-closes and reopens the app — Expo downloads the new bundle automatically on startup.
- Replit publish is still needed for API server and web app changes, but NOT for mobile JS bundle changes.
