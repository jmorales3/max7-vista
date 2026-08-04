---
name: React Compiler + explicit Babel plugins ordering conflict
description: babel-plugin-react-compiler must run BEFORE class/TypeScript transforms; explicit plugins always run before presets in Babel, so any setup with explicit class transforms breaks React Compiler.
---

## Rule
Do NOT use `babel-plugin-react-compiler` alongside explicit `@babel/plugin-transform-classes` / `@babel/plugin-transform-class-properties` / `@babel/plugin-transform-typescript` plugins in the same Babel config.

## Why
Babel execution order: explicit `plugins` run first (forward), then `presets` run (reverse). `babel-preset-expo` v57+ enables React Compiler as its FIRST internal plugin ("Add compiler as soon as possible to prevent other plugins from modifying the code"). But if the project has explicit class/TS transform plugins outside the preset, those run BEFORE the preset — so React Compiler sees already-lowered ES5 constructor functions instead of original ES6 class/TypeScript components. It produces broken memoization output (incorrect `_c()` cache slot usage), causing every transformed functional component to crash at runtime.

## How to apply
When a project needs explicit `@babel/plugin-transform-classes` (e.g., for Hermes 0.12.0 compatibility), disable React Compiler explicitly:
```js
presets: [['babel-preset-expo', { 'react-compiler': false }]],
```

## Detection
Build log shows "React Compiler enabled" (Metro log). All functional components in post-login screens crash immediately; login screen may work if the compiler bailed out on it due to complexity. Crash happens in ErrorBoundary with no obvious error message (since the memoization corruption is subtle).

## FINAL FIX: remove all explicit plugins entirely
`babel-preset-expo@57` with `hermes-stable` profile (auto-selected for Hermes engine) already handles everything Hermes 0.12.0 needs: TypeScript stripping (via `tsFragment.overrides`), async arrow non-simple params (`fix-hermes-v1-async-arrow-non-simple-params`), class-in-finally, super-in-accessor. It intentionally skips `@babel/plugin-transform-class-properties` and leaves class fields for Hermes native handling. Any explicit class-properties plugin (even `loose:true`, even scoped via `overrides.exclude`) generates `_defineProperty` for files the preset expects Hermes to own natively, crashing on class hierarchies. The correct minimal config is just `['babel-preset-expo', { 'react-compiler': false }]` — nothing else.

`overrides.exclude: /node_modules/` does NOT work for this purpose: `babel-preset-expo@57` uses Metro's `api.caller(getIsNodeModule)` caller API (not path patterns) to distinguish files; our path-based exclude has no way to replicate this and runs on the wrong set of files.

## Root cause confirmed: plugins must be scoped to non-node_modules via `overrides`
Putting explicit `@babel/plugin-transform-class-properties` in the top-level `plugins` array makes it run on ALL files Metro processes — including React Native's own source (VirtualizedList, FlatList, etc.). VirtualizedList is a class component; Babel's `_defineProperty` helper checks `key in obj` (prototype chain) before deciding whether to call `Object.defineProperty`. In VirtualizedList's deep inheritance chain (`VirtualizedList → StateSafePureComponent → PureComponent`), a field name is found in the chain, `Object.defineProperty` is called, and Hermes 0.12.0 throws "property is not configurable".

**Confirmed fix**: wrap ALL explicit plugins in `overrides: [{ exclude: /node_modules/, plugins: [...] }]`. React Native's own node_modules files are then handled exclusively by `babel-preset-expo`'s built-in loose class-properties, which uses simple assignment and never touches the prototype chain.

## Also: Hermes 0.12.0 — non-loose class-properties + Error subclass → "property is not configurable"
Even with React Compiler disabled, non-loose `@babel/plugin-transform-class-properties` throws "property is not configurable" in Hermes 0.12.0 when a class that extends `Error` has a field named `cause`. Hermes exposes `cause` on `Error.prototype` as a non-configurable accessor; the non-loose `_defineProperty` helper sees `"cause" in this` → true → calls `Object.defineProperty` → Hermes rejects it.

**Fix**: set ALL THREE class-feature plugins to `loose: true` (they must share the same value per Babel 7.29+ constraint):
```js
['@babel/plugin-transform-private-methods', { loose: true }],
['@babel/plugin-transform-class-properties', { loose: true }],
['@babel/plugin-transform-private-property-in-object', { loose: true }],
```
Loose mode uses simple assignment, never `Object.defineProperty`, so no prototype chain collision. Safe when there are no private `#field` declarations in the codebase (verify with grep before applying).
