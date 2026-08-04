module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { 'react-compiler': false }],
    ],

    // Restrict class transforms to .js/.jsx files ONLY.
    //
    // Why not top-level plugins:
    //   Top-level plugins run on ALL files including .ts/.tsx BEFORE babel-preset-expo's
    //   TypeScript strip runs. @babel/plugin-transform-classes on a .ts file causes a
    //   SyntaxError because TypeScript type annotations aren't recognised until after the
    //   TypeScript transform plugin is loaded from babel-preset-expo.
    //
    // Why we need this at all (the VirtualizedList crash):
    //   hermesc 0.12.0 (shipped with react-native 0.81.5) cannot compile any ES6 class
    //   syntax. babel-preset-expo@57 hermes-v1 profile intentionally preserves class
    //   syntax for "native Hermes handling", which causes hermesc to crash.
    //   Additionally, Hermes 0.12.0's native [[DefineOwnProperty]] for class fields
    //   conflicts with StateSafePureComponent._installSetStateHooks() which marks 'state'
    //   and 'props' as non-configurable — producing "TypeError: property is not
    //   configurable" via the _defineProperty Babel helper at runtime.
    //
    // With these four plugins scoped to .js/.jsx:
    //   - VirtualizedList.js (and all other node_module JS files) get ES5 class output
    //   - Class fields become simple `this.x = value` — no Object.defineProperty, no crash
    //   - TypeScript files continue through babel-preset-expo's normal TypeScript pipeline
    overrides: [
      {
        test: /\.jsx?$/,
        plugins: [
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-private-property-in-object', { loose: true }],
          ['@babel/plugin-transform-classes', { loose: true }],
        ],
      },
    ],
  };
};
