---
name: Hermes private class fields babel transform
description: eas update fails on Linux with "private properties are not supported" from hermesc — needs explicit babel plugins to downcompile them.
---

The Linux `hermesc` binary bundled with `react-native` (at least through 0.81.x) does not support
ES2022 private class fields (`#x`, `#y`, etc.) even though the same code works fine on device.
`babel-preset-expo` alone does not transform these away in the Replit environment.

**Symptom:** `eas update` bundles successfully with Metro but then fails during the Hermes bytecode
step: `error: private properties are not supported` for every `#field` usage, then `too many errors
emitted`, then `Export failed`.

**Fix:** add explicit Babel plugins to `babel.config.js` in the Expo app:
```js
plugins: [
  ["@babel/plugin-transform-class-properties", { loose: true }],
  ["@babel/plugin-transform-private-methods", { loose: true }],
],
```
And install them as devDependencies:
```
pnpm --filter @workspace/patient-images-mobile add -D @babel/plugin-transform-class-properties @babel/plugin-transform-private-methods
```

**Why:** Babel transforms the bundle JS before it reaches hermesc, so adding these plugins
downcompiles private fields to regular properties that hermesc can handle. `loose: true` is
required to avoid the conflicting-decorator-metadata error that strict mode triggers in this
Expo version.

**How to apply:** any time `eas update` or `eas build` fails with "private properties are not
supported" in hermesc on a Linux build host.
