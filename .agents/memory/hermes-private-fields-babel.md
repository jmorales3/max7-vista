---
name: Hermes private class fields — eas update Linux fix
description: eas update fails on Linux with "private properties are not supported" from hermesc on React Native 0.81 DOMRectReadOnly.js — patch the source file directly.
---

The Linux `hermesc` binary bundled with `react-native@0.81.x` does not support ES2022 private
class fields (`#x`, `#y`, etc.). The offending file is:
`react-native/src/private/webapis/geometry/DOMRectReadOnly.js`
which declares `#x`, `#y`, `#width`, `#height` as private fields.

**Symptom:** `eas update` bundles all 1500+ modules successfully with Metro, then fails during
the Hermes bytecode step: `error: private properties are not supported` for every `#field`
usage, then `too many errors emitted`, then `Export failed`.

**DO NOT try to fix this with Babel plugins.** Adding `@babel/plugin-transform-class-properties`
and `@babel/plugin-transform-private-methods` to `babel.config.js` creates cascading ordering
conflicts with:
- TypeScript `declare` fields in `expo-image/ExpoImage.tsx` (needs TypeScript plugin first)
- The `react-native-worklets` Babel plugin (crashes with "Cannot read properties of undefined
  (reading 'length')") when the config is restructured to fix the ordering

**Correct fix:** Patch `DOMRectReadOnly.js` in-place to replace `#x`/`#y`/`#width`/`#height`
with `_x`/`_y`/`_width`/`_height` (regular underscore-prefixed properties). The patch script
lives at `scripts/patch-react-native-domrect.cjs` and is wired to the mobile app's `postinstall`
hook so it re-runs after every `pnpm install`.

**Why:** Patching the single source file is far simpler than fighting Babel plugin ordering
across mixed JS/Flow/TS files in node_modules. The `babel.config.js` stays as the stock
`presets: ['babel-preset-expo']` with no additions.

**How to apply:** Run `node scripts/patch-react-native-domrect.cjs` from the workspace root any
time `pnpm install` is run manually (postinstall handles it automatically otherwise). Metro cache
at `/tmp/metro-cache` must also be cleared after a re-patch: `rm -rf /tmp/metro-cache`.
