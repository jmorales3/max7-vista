---
name: Expo Web Mobile Proxy Routing
description: How to make the Expo Metro dev server work with the Replit /mobile/ path prefix so that Playwright tests can load the app bundle.
---

# Expo Web Mobile — Replit Path-Prefix Routing

## The Rule
When the Expo mobile web app is served at a sub-path (e.g. `/mobile/`) behind the Replit router, the Metro dev server generates root-relative script URLs (`/node_modules/...bundle`) that bypass the `/mobile/` route and return 502 in the browser.

**Why:** Metro has no knowledge of the Replit router's path prefix. The HTML it generates has `<script src="/node_modules/...">`, which the browser fetches from the root path, not from `/mobile/`.

**How to apply:**
1. **dev-proxy.js** — strip the `/mobile` prefix before forwarding to Metro, AND rewrite HTML responses to prefix root-relative `src`/`href` attributes with `/mobile`.
2. **babel.config.js** — `react-native-worklets@0.5.1` (auto-included by `babel-preset-expo ≥ 57`) has a bug: `buildWorkletString` calls `fs.readFileSync(sourceFile)` where `sourceFile` is a basename-only path from the source map `sources` array, causing ENOENT. Fix: set `worklets: false` in `babel-preset-expo` options to disable auto-include, then re-add the plugin manually with `{ disableSourceMaps: true }`.

## Key files changed
- `artifacts/patient-images-mobile/scripts/dev-proxy.js` — path stripping + HTML rewrite
- `artifacts/patient-images-mobile/babel.config.js` — worklets plugin fix
