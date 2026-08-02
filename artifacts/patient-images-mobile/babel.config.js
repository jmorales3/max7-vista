module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      "@babel/plugin-transform-class-properties",
      "@babel/plugin-transform-private-methods",
    ],
  };
};
