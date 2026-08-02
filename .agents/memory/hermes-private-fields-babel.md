---
name: Hermes private class fields — eas update Linux fix
description: eas update fails on Linux with "private properties are not supported" from hermesc in React Native 0.81. Full fix requires both a Babel config change and a postinstall patch script.
---

The Linux `hermesc` binary bundled with `react-native@0.81.x` does not support ES2022 private
class fields (`#fieldName`). This affects react-native's own source files AND third-party
packages (e.g. `@tanstack/query-core`, `@react-navigation/*`, `ws`).

**Symptom:** `eas update` progresses through Metro bundling then fails during Hermes bytecode
compilation: `error: private properties are not supported` for every `#field` usage, then
`too many errors emitted`, then `Export failed`.

## Two-part fix (both required)

### Part 1 — `babel.config.js` (universal transform)
Add these plugins to `artifacts/patient-images-mobile/babel.config.js` so Metro transforms
private fields from ALL packages before hermesc sees them:
```js
plugins: [
  ['@babel/plugin-transform-private-methods', { loose: true }],
  ['@babel/plugin-transform-class-properties', { loose: true }],
],
```
`loose: true` is required. The plugins skip TypeScript `declare` fields correctly in v7.28+.
This is the PRIMARY fix for third-party packages (tanstack, etc.).

### Part 2 — `scripts/patch-react-native-domrect.cjs` (postinstall patch)
The patch script also rewrites private fields in `react-native/src/` and `react-native/Libraries/`
source files. It is wired to `postinstall` in the mobile app's `package.json`. The script also
fixes three bugs in the `react-native-worklets@0.5.1` Babel plugin (see worklets topic file).

## Why both are needed
The Babel config handles third-party packages compiled into the bundle.
The patch script handles react-native's own source files (some may not go through Babel transform).

## What NOT to do
Do not try to fix the worklets Babel plugin crash by adding `@babel/plugin-transform-typescript`
to the top-level config — this doesn't run before the worklets plugin visitor. Instead, the
postinstall patch to the worklets plugin itself (using original source text from `state.file.code`)
is the correct approach.

**How to apply after pnpm install:**
`pnpm install` triggers `postinstall` which runs the patch script automatically.
After any re-patch, clear Metro cache: `rm -rf /tmp/metro-cache`.
