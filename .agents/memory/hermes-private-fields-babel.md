---
name: Hermes 0.12.0 (linux64) — eas update full fix
description: eas update from Linux fails because the linux64 hermesc in react-native@0.81.5 is Hermes 0.12.0, which rejects four ES syntax categories. Full fix requires a postinstall patch script + five Babel plugins in precise order.
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

## Two-part fix (both required)

### Part 1 — `artifacts/patient-images-mobile/babel.config.js`
Five plugins in this EXACT order (all v7.x, all `loose:true` where applicable):

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-transform-typescript', { isTSX: true, allowDeclareFields: true }],
      ['@babel/plugin-transform-arrow-functions'],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  };
};
```

**Why all v7.x:** v8 of `class-properties` throws on TypeScript `!:` / `declare` fields
unless TypeScript was stripped first. v7.28.6 handles them gracefully without requiring
the TypeScript plugin to be installed first. With v7 the ordering above is safe.

**Why TypeScript first:** `@babel/plugin-transform-classes` converts `class Foo { constructor(private x: T) }` to `function Foo(private x)` — hermesc then rejects `private` as an identifier. TypeScript must strip it first.

**Why arrow-functions second:** Hermes 0.12.0 accepts `async function(){}` but NOT `async () => {}`. Arrow → named function conversion must happen before classes runs (which generates `_this` patterns that capture arrow-this).

**Why private/properties before classes:** `@babel/plugin-transform-classes` throws "Missing class properties transform" if it encounters uninitialised fields (`_x;`) that haven't been lowered yet.

### Part 2 — `scripts/patch-react-native-domrect.cjs` (postinstall patch)
The patch script must run after every `pnpm install`. It does three things:
1. Rewrites `#field` → `_field` in react-native's own `src/` and `Libraries/` source files (the Babel config handles node_modules, but these files may go through a different Metro code path)
2. Fixes three bugs in the `react-native-worklets@0.5.1` Babel plugin
3. Creates symlinks for `@babel/types`, `@babel/generator`, `@babel/traverse` into the worklets plugin's pnpm virtual env (pnpm strict isolation blocks them otherwise)

## devDependencies in mobile app package.json (all ~7.x)
```json
"@babel/plugin-transform-arrow-functions": "~7.27.1",
"@babel/plugin-transform-class-properties": "~7.28.6",
"@babel/plugin-transform-classes": "~7.28.6",
"@babel/plugin-transform-private-methods": "~7.28.6",
"@babel/plugin-transform-typescript": "~7.28.6"
```

## After pnpm install
Clear Metro cache: `rm -rf /tmp/metro-cache /tmp/metro-file-map-*`
Then: `eas update --channel production --message "..."`
