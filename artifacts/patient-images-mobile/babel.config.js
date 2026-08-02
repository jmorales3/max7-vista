module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // The Linux hermesc binary bundled with react-native@0.81.x does not support
      // ES2022 private class fields (#fieldName). These v7 transforms lower them to
      // regular properties for every package in the bundle before hermesc runs.
      // v7.28.6 is required — v8 rejects TypeScript !: fields unless TypeScript runs
      // first, which creates an unresolvable dependency ordering problem in Metro.
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
    ],
  };
};
