module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // The Linux hermesc binary bundled with react-native@0.81.5 is Hermes 0.12.0,
      // which rejects: (1) ES2022 private class fields, (2) ES6 class declarations.
      //
      // All plugins must be v7.28.6 — v8 of class-properties rejects TypeScript !:
      // fields unless TypeScript has already been stripped, which requires TypeScript
      // to be a top-level plugin (before presets). With v7.28.6 that ordering is safe.
      //
      // Plugin execution order (first → last), each required before the next:
      //   1. TypeScript  — strip `private` param properties, `declare` fields, `!:` etc.
      //   2. Private methods/fields — lower #method / #field to _method / _field
      //   3. Class properties — lower field initialisers into constructors
      //   4. Classes — lower ES6 class declarations to ES5 constructor functions
      ['@babel/plugin-transform-typescript', { isTSX: true, allowDeclareFields: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  };
};
