module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // The Linux hermesc binary bundled with react-native@0.81.5 is Hermes 0.12.0,
      // which rejects: (1) ES2022 private class fields, (2) ES6 class declarations as
      // statements, (3) async ARROW functions (async named functions are fine).
      //
      // Plugin execution order (first → last):
      //   1. TypeScript  — strip `private` param props, `declare` fields, `!:` syntax
      //   2. Arrow fns   — async () => {} → async function() {} (Hermes 0.12 rejects async arrows)
      //   3. Private     — #method / #field → _method / _field  (loose: ok for private methods)
      //   4. Properties  — field initialisers → constructor assignments
      //                    MUST be non-loose (no `loose` option) so it uses Object.defineProperty.
      //                    Loose mode uses direct assignment (Child.NONE = value) which throws
      //                    "Cannot assign to read only property" when a parent class defined
      //                    the same static property as non-writable via Object.defineProperty and
      //                    _inheritsLoose set Child.__proto__ = Parent (prototype chain lookup).
      //   5. Classes     — ES6 class declarations → ES5 constructor functions (loose: ok here)
      ['@babel/plugin-transform-typescript', { isTSX: true, allowDeclareFields: true }],
      ['@babel/plugin-transform-arrow-functions'],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties'],
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  };
};
