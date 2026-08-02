module.exports = function (api) {
  api.cache(true);
  return {
    // Presets run in REVERSE order (last → first).
    // babel-preset-expo (index 1) runs first → strips TypeScript declare fields.
    // Our inline preset (index 0) runs second → transforms private class fields
    // after TypeScript has already been handled.
    presets: [
      {
        plugins: [
          "@babel/plugin-transform-class-properties",
          "@babel/plugin-transform-private-methods",
        ],
      },
      ["babel-preset-expo", { unstable_transformImportMeta: true }],
    ],
  };
};
