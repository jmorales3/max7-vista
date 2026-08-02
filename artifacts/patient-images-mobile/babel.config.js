module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    // Apply private-field transforms ONLY to .js/.jsx files (e.g. React Native's
    // DOMRectReadOnly.js which uses #x / #y private class fields).
    // Keeping these OUT of .ts/.tsx files avoids the TypeScript "declare" fields
    // ordering conflict in packages like expo-image.
    overrides: [
      {
        test: /\.(js|jsx)$/,
        plugins: [
          "@babel/plugin-transform-class-properties",
          "@babel/plugin-transform-private-methods",
        ],
      },
    ],
  };
};
