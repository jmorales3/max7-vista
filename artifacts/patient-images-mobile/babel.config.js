module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Disable React Compiler: it must run BEFORE class/TypeScript transforms to
      // correctly analyse React components. Our explicit plugins (TypeScript, classes,
      // private fields) run first (plugins before presets), so the compiler sees
      // already-lowered ES5 code and can produce incorrect memoisation output.
      ['babel-preset-expo', { 'react-compiler': false }],
    ],
    plugins: [
      // The Linux hermesc binary bundled with react-native@0.81.5 is Hermes 0.12.0,
      // which rejects: (1) ES2022 private class fields, (2) ES6 class declarations as
      // statements, (3) async ARROW functions (async named functions are fine).
      //
      // Plugin execution order (first → last):
      //   1. TypeScript  — strip `private` param props, `declare` fields, `!:` syntax
      //   2. Arrow fns   — async () => {} → async function() {} (Hermes 0.12 rejects async arrows)
      //   3. Private methods / properties / property-in-object   ← ALL must share the same
      //   4. Properties  — field initialisers                       `loose` value.
      //   5. Private property-in-object                          Babel 7.29+ throws a hard error
      //                                                          if they differ. All three must be
      //                                                          LOOSE (loose: true):
      //                                                          - Non-loose uses Object.defineProperty
      //                                                            via _defineProperty helper which
      //                                                            checks `key in obj` (prototype chain)
      //                                                            before deciding whether to call
      //                                                            Object.defineProperty. If the key
      //                                                            exists on an inherited non-configurable
      //                                                            property (e.g. `cause` on Error in
      //                                                            Hermes 0.12.0), Hermes throws
      //                                                            "property is not configurable".
      //                                                          - Loose uses simple assignment
      //                                                            (this.field = value), which skips
      //                                                            Object.defineProperty entirely and
      //                                                            never touches the prototype chain.
      //                                                          - No private class fields (#field) exist
      //                                                            in this codebase, so loose private
      //                                                            field handling is safe.
      //   6. Classes     — ES6 class declarations → ES5 constructor functions (loose: ok — unrelated
      //                    to the three plugins above, Babel's consistency check doesn't cover it)
      ['@babel/plugin-transform-typescript', { isTSX: true, allowDeclareFields: true }],
      ['@babel/plugin-transform-arrow-functions'],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  };
};
