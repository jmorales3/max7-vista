---
name: hermes-v0 transform profile fix for hermesc 0.12.0
description: Single babel-preset-expo option that makes hermesc 0.12.0 (react-native 0.81.5 linux64-bin) compile bytecode bundles successfully.
---

## Rule
Set `unstable_transformProfile: 'hermes-v0'` in `babel-preset-expo` options inside `babel.config.js`.

## Why
hermesc 0.12.0 (at `react-native/sdks/hermesc/linux64-bin/hermesc`) cannot compile:
- Private class fields (`#field`) — "private properties are not supported"
- Class declarations (`class Foo {}`) — "invalid statement encountered"
- Async functions — "async functions are unsupported"

`babel-preset-expo`'s `hermes-stable` profile (selected automatically when Metro passes `engine='hermes'` in bytecode mode) intentionally omits Babel transforms for those features, trusting Hermes to handle them natively. That is correct for current Hermes, but hermesc 0.12.0 is too old.

## How to apply
In `artifacts/patient-images-mobile/babel.config.js`:
```js
presets: [['babel-preset-expo', { unstable_transformProfile: 'hermes-v0' }]]
```

`hermes-v0` profile applies these as preset-level plugins (reaching all files including node_modules):
- `@babel/plugin-transform-class-properties` `{ loose: true }`
- `@babel/plugin-transform-private-methods` `{ loose: true }`
- `@babel/plugin-transform-private-property-in-object` `{ loose: true }`
- `@babel/plugin-transform-classes` (no loose — but not needed for VirtualizedList fix)
- `@babel/plugin-transform-async-to-generator`
- `@babel/plugin-transform-async-generator-functions`

`loose: true` on class-properties is load-bearing: non-loose uses `Object.defineProperty` which conflicts with `StateSafePureComponent` marking `state`/`props` non-configurable → VirtualizedList "property is not configurable" crash at runtime.

## What didn't work (and why)
- Babel `overrides` in `babel.config.js` — do NOT reach node_modules files in Metro bytecode mode; they work in no-bytecode mode only because `hermes-v0` preset plugins also run there.
- Top-level `plugins` for class transforms — `@babel/plugin-transform-classes` at top-level runs before `babel-preset-expo`'s TypeScript-stripping overrides, emitting `function Foo(private x)` (the TSParameterProperty access modifier ends up in the generated function signature).
- Custom preset after `babel-preset-expo` — TypeScript was stripped but async transforms from hermes-v1 were lost, causing hermesc to fail on async functions.

## Verified
`npx expo export --platform android` produces a clean `.hbc` file with no hermesc errors after `rm -rf /tmp/metro-cache /tmp/metro-file-map-*`.
