module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': false,

          // hermesc 0.12.0 (react-native 0.81.5, linux64-bin) cannot compile
          // class declarations, private class fields, or async functions.
          //
          // babel-preset-expo's hermes-stable profile (selected by Metro when
          // engine='hermes' in bytecode mode) intentionally omits those Babel
          // transforms, assuming the Hermes runtime handles them natively.
          // That is correct for current Hermes, but not for hermesc 0.12.0.
          //
          // Forcing hermes-v0 restores the full set of pre-compilation transforms:
          //   - @babel/plugin-transform-class-properties  { loose: true }
          //   - @babel/plugin-transform-private-methods   { loose: true }
          //   - @babel/plugin-transform-classes
          //   - @babel/plugin-transform-async-to-generator
          //   - @babel/plugin-transform-async-generator-functions
          //   (plus block-scoping, destructuring, etc.)
          //
          // These run as preset-level plugins (not overrides), so they apply to
          // all files including node_modules.  The preset's TypeScript-stripping
          // overrides run before its sub-preset plugins (documented in
          // babel-preset-expo's index.js: "Top-level overrides run before
          // sub-preset plugins"), so class transforms never encounter raw
          // TypeScript constructor parameter properties.
          //
          // loose: true for class-properties is load-bearing: non-loose uses
          // Object.defineProperty, which conflicts with StateSafePureComponent
          // marking 'state'/'props' non-configurable → VirtualizedList crash.
          // hermes-v0 already uses loose: true for class-properties and
          // private-methods by default.
          unstable_transformProfile: 'hermes-v0',
        },
      ],
    ],
  };
};
