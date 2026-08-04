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
