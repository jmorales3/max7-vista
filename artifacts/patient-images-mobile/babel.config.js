module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // The Linux hermesc binary bundled with react-native@0.81.x does not support
      // ES2022 private class fields (#fieldName syntax). These transforms convert
      // ALL private class fields/methods across every package in the bundle to
      // regular properties before hermesc processes them.
      // loose:true is required for consistent behaviour with other class transforms.
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
    ],
  };
};
