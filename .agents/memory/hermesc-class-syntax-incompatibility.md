---
name: hermesc 0.12.0 class syntax incompatibility
description: hermesc 0.12.0 (bundled with react-native 0.81.5) cannot compile ES6 class syntax; fix is JS-only class-transform overrides in babel.config.js + no-bytecode OTA publishing.
---

## The Rule

`hermesc 0.12.0` (linux64-bin shipped with `react-native@0.81.5`) cannot compile **any** ES6 class syntax — not just class fields, but even `class A {}` fails with "invalid statement encountered." `babel-preset-expo@57`'s `hermes-v1` profile intentionally preserves class syntax for "native Hermes handling," creating an incompatibility.

**Why:** hermesc is the Ahead-of-Time bytecode compiler. The linux64-bin hermesc bundled with RN 0.81.5 is too old for the hermes-v1 profile.

## Secondary Crash Cause

Even in the pure-JS (non-bytecode) OTA path, Hermes 0.12.0's native `[[DefineOwnProperty]]` for class fields conflicts with `StateSafePureComponent._installSetStateHooks()`, which marks `state` and `props` as **non-configurable** own properties. When VirtualizedList's class fields later attempt `[[DefineOwnProperty]]` on those same names, it crashes with "TypeError: property is not configurable" — called via Babel's `_defineProperty` helper.

## HBC Bytecode Version Mismatch

`eas update` (run locally) compiles the OTA bundle using the `hermesc` from `react-native/sdks/hermesc/linux64-bin` (version 0.12.0, HBC bytecode v96). `eas build` (run on EAS cloud) uses the `hermes-engine` npm package's hermesc, which may produce a **different HBC bytecode version**. If the versions differ, the device silently rejects the OTA `.hbc` bundle and falls back to the embedded APK bundle — this appears as "OTA updates not working" even though EAS shows the update published successfully.

**Symptom:** After clearing app data, the device re-downloads the same old embedded bundle hash instead of the new OTA hash.

**Fix:** Publish OTA as **pure JavaScript** (no hermesc compilation) using `--skip-bundler` + a pre-exported no-bytecode bundle:
```bash
npx expo export --platform android --platform ios --no-bytecode --dump-assetmap --output-dir /tmp/final-nohbc
eas update --branch production --skip-bundler --input-dir /tmp/final-nohbc --message "..."
```

Note: `eas update --input-dir` WITHOUT `--skip-bundler` IGNORES the pre-exported directory and re-bundles anyway.

## TypeScript Parse Error with Top-Level @babel/plugin-transform-classes

Adding `@babel/plugin-transform-classes` to **top-level** plugins (not in `overrides`) causes a `SyntaxError` on TypeScript files when Metro cache is cold (no-bytecode mode or first run). Top-level plugins run before `babel-preset-expo`'s TypeScript strip, and `@babel/plugin-transform-classes` fails on TypeScript type annotations like `(options: { fatal: boolean })`.

**Fix:** Scope `@babel/plugin-transform-classes` to `test: /\.jsx?$/` in `overrides` so it only runs on JavaScript files:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { 'react-compiler': false }]],
    overrides: [{
      test: /\.jsx?$/,
      plugins: [
        ['@babel/plugin-transform-class-properties', { loose: true }],
        ['@babel/plugin-transform-private-methods', { loose: true }],
        ['@babel/plugin-transform-private-property-in-object', { loose: true }],
        ['@babel/plugin-transform-classes', { loose: true }],
      ],
    }],
  };
};
```

## The EAS Module Cache Trap

EAS/Metro caches individual module transforms. Previous Babel configs with non-loose `@babel/plugin-transform-class-properties` left a stale cached transform of `VirtualizedList.js`. Subsequent OTA updates changed the bundle hash but Metro still served the stale module transform. The HBC version mismatch then prevented the fixed bundle from reaching the device. Switching to `--skip-bundler` with a fresh no-bytecode export bypasses both issues.

## Workflow for Getting a Fix to Device When APK Has HBC Mismatch

1. `npx expo export --platform android --platform ios --no-bytecode --dump-assetmap --output-dir /tmp/nohbc`
2. `eas update --branch production --skip-bundler --input-dir /tmp/nohbc --message "..."`
3. Device: open app → leave on crash screen 2–3 min → force-close → reopen

## Long-term Fix

Rebuild the APK with `eas build --profile preview --platform android` after fixing the babel.config.js. The new APK embeds the fixed bundle (no OTA dependency) and its embedded hermesc bytecode version matches any future OTA produced by the same local toolchain.
