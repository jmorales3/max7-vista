module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // The Linux hermesc binary bundled with react-native@0.81.5 is Hermes 0.12.0,
      // which rejects: (1) ES2022 private class fields, (2) ES6 class declarations as
      // statements, (3) async ARROW functions (async named functions are fine).
      //
      // All class/TS plugins must be v7.x — v8 of class-properties rejects TS !: fields
      // unless TypeScript runs first; with v7 that ordering works without extra config.
      //
      // Plugin execution order (first → last); each step must complete before the next:
      //   1. TypeScript  — strip `private` param props, `declare` fields, `!:` syntax
      //   2. Arrow fns   — async () => {} → async function() {} (Hermes 0.12 rejects async arrows)
      //   3. Private     — #method / #field → _method / _field
      //   4. Properties  — field initialisers → constructor assignments
      //   5. Classes     — ES6 class declarations → ES5 constructor functions
      ['@babel/plugin-transform-typescript', { isTSX: true, allowDeclareFields: true }],
      ['@babel/plugin-transform-arrow-functions'],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  };
};
