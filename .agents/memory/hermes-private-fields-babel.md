---
name: Hermes 0.12.0 (linux64) — eas update/build full fix
description: eas update/build from Linux fails because the linux64 hermesc in react-native@0.81.5 is Hermes 0.12.0, which rejects four ES syntax categories. Full fix requires a postinstall patch script + five Babel plugins in precise order with specific loose/non-loose settings.
---

## Root cause
The **linux64** `hermesc` binary shipped with `react-native@0.81.5` is **Hermes 0.12.0**
(LLVM 8.0.0svn, HBC version 96). It rejects four syntax categories that modern Hermes supports:

| # | Rejected syntax | Fix |
|---|---|---|
| 1 | ES2022 private class fields `#field` | Patch source files + `@babel/plugin-transform-private-methods` + `@babel/plugin-transform-class-properties` |
| 2 | ES6 class declarations as statements | `@babel/plugin-transform-classes` |
| 3 | Async arrow functions `async () => {}` | `@babel/plugin-transform-arrow-functions` |
| 4 | TypeScript `private` constructor params / `!:` fields remaining after class transform | `@babel/plugin-transform-typescript` must run FIRST |

## Runtime error: "Cannot assign to read only property: 'NONE'"
A **separate** bug from the hermesc compilation errors — happens at runtime on device.

**Cause:** `@babel/plugin-transform-class-properties` in **loose mode** converts static class
properties to direct assignments (`Child.NONE = value`). When `_inheritsLoose` (from the
loose classes transform) sets `Child.__proto__ = Parent`, and `Parent.NONE` was defined
with `Object.defineProperty(..., { writable: false })` by a library's non-loose transform,
the assignment throws in strict mode because it walks up the prototype chain and hits a
non-writable property.

**Fix:** `@babel/plugin-transform-class-properties` must use **non-loose** mode (omit `loose`
option). Non-loose uses `_defineProperty` (= `Object.defineProperty`) which defines the
property directly on `Child` as an own property, bypassing prototype chain lookup entirely.
`@babel/plugin-transform-classes` can stay `loose: true` — the inconsistency doesn't matter
here because the helpers are independent.

## Final working `artifacts/patient-images-mobile/babel.config.js`
Five plugins in this EXACT order with these EXACT loose settings:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-transform-typescript', { isTSX: true, allowDeclareFields: true }],
      ['@babel/plugin-transform-arrow-functions'],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties'],          // NON-loose — critical
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  };
};
```

**Why TypeScript first:** strips `private` keyword and `!:` fields before class transforms run.

**Why arrow-functions second:** `async () => {}` → `async function() {}` before class transform
generates `_this` patterns.

**Why private/properties before classes:** `@babel/plugin-transform-classes` throws
"Missing class properties transform" on uninitialised fields not yet lowered.

**Why class-properties NON-loose:** loose = `Child.STATIC = value` → throws when the parent
has a non-writable property with the same name. Non-loose = `Object.defineProperty(Child, ...)` →
defines own property directly, no prototype chain traversal.

**Why classes loose:** Hermes 0.12.0 still handles the `_inheritsLoose` + `__proto__` pattern.
Non-loose would use `_createSuper`/`Reflect.construct` which also works but isn't needed.

## Part 2 — `scripts/patch-react-native-domrect.cjs` (postinstall patch)
Wired via `package.json` `postinstall`. Three patches:
1. Rewrites `#field` → `_field` in react-native's `src/` and `Libraries/` trees
2. Fixes three bugs in `react-native-worklets@0.5.1` Babel plugin (negative numericLiteral,
   @babel/generator crash, missing sourceMaps:true)
3. Symlinks `@babel/types`, `@babel/generator`, `@babel/traverse` into worklets plugin's
   pnpm virtual env (pnpm strict isolation blocks these transitively)

## devDependencies in mobile app package.json (all ~7.x)
```json
"@babel/plugin-transform-arrow-functions": "~7.27.1",
"@babel/plugin-transform-class-properties": "~7.28.6",
"@babel/plugin-transform-classes": "~7.28.6",
"@babel/plugin-transform-private-methods": "~7.28.6",
"@babel/plugin-transform-typescript": "~7.28.6"
```

## Server URL fix (AuthContext / ServerContext)
The mobile app reads the server URL from AsyncStorage. `ServerContext` falls back to
`process.env.EXPO_PUBLIC_API_URL` (baked at bundle time) but ONLY writes to AsyncStorage
when `saveServerUrl()` is explicitly called. `AuthContext` reads AsyncStorage directly.

**Fix:** Both contexts now use `DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://patient-image-manager.replit.app"` as the final fallback, and `ServerContext` writes this to AsyncStorage on first load so `AuthContext` always finds a valid URL.

## After pnpm install
Clear Metro cache: `rm -rf /tmp/metro-cache /tmp/metro-file-map-*`
Then: `eas build --profile preview --platform android` for a sideloadable APK
Or: `eas update --channel production --message "..."` for OTA update
