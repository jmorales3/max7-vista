---
name: hermesc 0.12.0 class syntax incompatibility
description: hermesc 0.12.0 (bundled with react-native 0.81.5) cannot compile ANY ES6 class syntax; fix is top-level class-transform plugins in babel.config.js.
---

## The Rule

`hermesc 0.12.0` (linux64-bin shipped with `react-native@0.81.5`) cannot compile **any** ES6 class syntax — not just class fields, but even `class A {}` fails with "invalid statement encountered." `babel-preset-expo@57`'s `hermes-v1` profile intentionally preserves class syntax for "native Hermes handling," creating an incompatibility.

**Why:** hermesc is the Ahead-of-Time bytecode compiler. It predates ES6 class support in Hermes's compiler (though the Hermes *runtime* on the device does support classes). `babel-preset-expo@57` introduced hermes-v1 for a *newer* Hermes ("Hermes V1, SDK 56+"), but the linux64-bin hermesc bundled with RN 0.81.5 is too old.

## Secondary Crash Cause

Even in the pure-JS (non-bytecode) OTA path, Hermes 0.12.0's native `[[DefineOwnProperty]]` for class fields conflicts with `StateSafePureComponent._installSetStateHooks()`, which marks `state` and `props` as **non-configurable** own properties. When VirtualizedList's class fields later attempt `[[DefineOwnProperty]]` on those same names, it crashes with "TypeError: property is not configurable" — called via Babel's `_defineProperty` helper at bundle address ~109933.

## The EAS Module Cache Trap

EAS caches individual Metro module transforms. Previous Babel configs (with non-loose `@babel/plugin-transform-class-properties` in top-level plugins) left a stale cached transform of `VirtualizedList.js`. Subsequent OTA updates changed the user-facing bundle hash but served the stale module-level transform of VirtualizedList. Simply switching to loose class-properties did NOT bust this cache because the cache key for node-module transforms may not include the full babel.config.js content.

## The Fix

Add four top-level plugins to `babel.config.js` (applies to ALL files including node_modules, runs BEFORE babel-preset-expo):

```js
plugins: [
  ['@babel/plugin-transform-class-properties', { loose: true }],
  ['@babel/plugin-transform-private-methods', { loose: true }],
  ['@babel/plugin-transform-private-property-in-object', { loose: true }],
  ['@babel/plugin-transform-classes', { loose: true }],
],
```

**Why this works:**
1. `@babel/plugin-transform-classes` (the new addition) converts all class definitions to ES5 constructor functions — hermesc-compatible
2. All four plugins together produce simple `this.x = value` assignments for class fields (no `Object.defineProperty`, no `_defineProperty` helper) — no conflict with non-configurable `state`/`props`
3. Adding `@babel/plugin-transform-classes` is a meaningful enough config change to bust the EAS module-level cache for VirtualizedList

## How to Apply

After publishing with this config, hermesc compiles `.hbc` bytecode successfully (confirming ES5-only input). Force-close and reopen the app to pick up the OTA.

## Verification

Output bundles are `.hbc` files (hermesc bytecode) — this confirms hermesc compiled successfully with the new config.
