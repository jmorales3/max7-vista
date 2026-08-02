module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    overrides: [
      {
        // TypeScript files: strip TS syntax FIRST so @babel/plugin-transform-class-properties
        // never sees unstripped `!:` or `declare` fields (which cause a hard error in v8).
        test: /\.(ts|tsx)$/,
        plugins: [
          ['@babel/plugin-transform-typescript', { isTSX: true, allowDeclareFields: true }],
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-class-properties', { loose: true }],
        ],
      },
      {
        // Plain JS/JSX files from node_modules: transform private fields directly.
        // The Linux hermesc binary in react-native@0.81.x does not support ES2022
        // private class fields (#field), so they must be lowered by Babel.
        test: /\.(js|jsx)$/,
        plugins: [
          ['@babel/plugin-transform-private-methods', { loose: true }],
          ['@babel/plugin-transform-class-properties', { loose: true }],
        ],
      },
    ],
  };
};
