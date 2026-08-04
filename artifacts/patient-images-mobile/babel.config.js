module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // React Compiler is disabled: it must run before class/TypeScript transforms,
      // but our explicit plugins (which run before presets) would give it already-lowered code.
      ['babel-preset-expo', { 'react-compiler': false }],
    ],

    // Applied to ALL files (including node_modules) because they are top-level plugins.
    // Plugins always run BEFORE presets, so these transform class syntax first, then
    // babel-preset-expo's hermes-v1 fixes (async-arrow, class-in-finally, etc.) run on
    // already-downleveled code.
    //
    // Why we need this:
    //
    //   1. hermesc 0.12.0 (shipped with react-native 0.81.5) cannot compile ES6+ class
    //      syntax (class definitions with extends, class fields, etc.).  babel-preset-expo@57
    //      hermes-v1 intentionally PRESERVES class syntax for "Hermes native handling", which
    //      means hermesc receives class fields it cannot compile.
    //
    //   2. Even in the pure-JS (non-bytecode) OTA path, Hermes 0.12.0's native class-field
    //      initializer uses [[DefineOwnProperty]], which fails on class fields with the same
    //      name as properties previously made non-configurable by
    //      StateSafePureComponent._installSetStateHooks() ('state' and 'props').
    //
    //   3. EAS caches individual Metro module transforms.  Previous Babel configs left a
    //      stale non-loose _defineProperty transform of VirtualizedList in the EAS cache,
    //      which persisted across subsequent OTA updates.  Adding @babel/plugin-transform-classes
    //      here meaningfully changes the cache key for node-module transforms, busting that cache.
    //
    // With these four plugins in loose mode, ALL class fields become simple `this.x = value`
    // assignments in the constructor (no Object.defineProperty, no _defineProperty helper),
    // eliminating the "property is not configurable" crash.
    plugins: [
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
      // Transform ES6 class definitions to ES5 constructor functions.
      // This is required for hermesc 0.12.0 compatibility AND busts the EAS module cache.
      // babel-preset-expo@57 hermes-v0 also includes this plugin; having it here as a
      // top-level plugin (which runs first) is harmless — hermes-v0's copy becomes a no-op.
      ['@babel/plugin-transform-classes', { loose: true }],
    ],
  };
};
