module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // The Linux hermesc binary bundled with react-native@0.81.5 is Hermes 0.12.0,
      // which does not support:
      //   1. ES2022 private class fields (#fieldName)
      //   2. ES6 class declarations as statements
      // All three plugins must be v7.28.6 (v8 rejects TS !: fields without a
      // TypeScript-first pass that creates unresolvable Metro dependency ordering).
      // loose:true required for consistent behaviour across all three transforms.
      // Order matters: properties/methods must be lowered before the class
      // declaration itself is converted to an ES5 function.
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  };
};
