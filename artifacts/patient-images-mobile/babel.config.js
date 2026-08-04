module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // babel-preset-expo@57 with the hermes-stable transform profile (auto-selected
      // when engine='hermes') already handles everything Hermes 0.12.0 needs:
      //
      //  • TypeScript stripping — via tsFragment.overrides (@babel/plugin-transform-typescript)
      //  • Async arrow non-simple params — via fix-hermes-v1-async-arrow-non-simple-params
      //  • Class-in-finally / super-in-accessor — dedicated hermes-v1 fix plugins
      //  • Class properties — intentionally NOT transformed; Hermes handles them natively.
      //    (The hermes-v1 config deliberately skips @babel/plugin-transform-class-properties
      //    and leaves class fields as native syntax. Adding our own class-properties plugin
      //    generates _defineProperty helpers that call Object.defineProperty, which throws
      //    "property is not configurable" in Hermes 0.12.0 for class hierarchies like
      //    VirtualizedList → StateSafePureComponent → PureComponent.)
      //
      // React Compiler is disabled because it must run BEFORE class/TypeScript transforms;
      // with extra explicit plugins it would see already-lowered code and produce broken output.
      ['babel-preset-expo', { 'react-compiler': false }],
    ],
  };
};
