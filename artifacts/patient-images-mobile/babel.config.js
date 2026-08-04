module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Disable React Compiler: it must run BEFORE class/TypeScript transforms to
      // correctly analyse React components. Our explicit plugins run first (plugins
      // before presets), so the compiler sees already-lowered ES5 code and can
      // produce incorrect memoisation output.
      ['babel-preset-expo', { 'react-compiler': false }],
    ],

    // IMPORTANT: these overrides apply ONLY to project source files, NOT node_modules.
    //
    // Why the exclusion matters:
    //   babel-preset-expo (via @react-native/babel-preset) already transforms
    //   React Native's own class components (e.g. VirtualizedList) with LOOSE
    //   class-properties (direct `this.x = v` assignment). Our explicit plugins
    //   run first (Babel: plugins before presets) and would otherwise double-transform
    //   those files with the _defineProperty helper whose `key in obj` prototype-chain
    //   check hits non-configurable properties in class hierarchies like
    //   VirtualizedList → StateSafePureComponent → PureComponent, throwing
    //   "property is not configurable" in Hermes 0.12.0.
    //
    // Why we still need these plugins on our code:
    //   The Linux hermesc binary bundled with react-native@0.81.5 is Hermes 0.12.0,
    //   which rejects: (1) ES2022 private class fields, (2) ES6 class declarations as
    //   statements, (3) async ARROW functions (async named functions are fine).
    //   Our TypeScript source and workspace packages need these transforms applied
    //   before babel-preset-expo runs its own passes.
    //
    // Plugin order within this override (first → last):
    //   1. TypeScript  — strip `private` param props, `declare` fields, `!:` syntax
    //   2. Arrow fns   — async () => {} → async function() {}
    //   3-5. Private methods / properties / property-in-object — ALL loose: true
    //        (Babel 7.29+ requires all three to share the same loose value, or throws
    //        a hard SyntaxError; loose = simple assignment, avoids Object.defineProperty)
    //   6. Classes     — ES6 class → ES5 constructor function (loose: fine, independent
    //                    of the three plugins above in Babel's consistency check)
    overrides: [
      {
        exclude: /node_modules/,
        plugins: [
          ['@babel/plugin-transform-typescript', { isTSX: true, allowDeclareFields: true }],
          ['@babel/plugin-transform-arrow-functions'],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-class-properties', { loose: true }],
          ['@babel/plugin-transform-private-property-in-object', { loose: true }],
          ['@babel/plugin-transform-classes', { loose: true }],
        ],
      },
    ],
  };
};
