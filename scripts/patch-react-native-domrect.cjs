#!/usr/bin/env node
/**
 * Patches known bugs that prevent `eas update` from succeeding on Linux (Replit).
 *
 * PATCH 1 — react-native@0.81.x DOMRectReadOnly.js
 *   Private class fields (#x, #y, #width, #height) that the Linux hermesc binary cannot compile.
 *   Replace with _x/_y/_width/_height.
 *
 * PATCH 2 — react-native-worklets@0.5.1 Babel plugin (three sub-fixes)
 *   A) negative numericLiteral values: Babel rejects numericLiteral(-27); use unaryExpression instead.
 *   B) @babel/generator called on raw TypeScript AST: crashes with "Cannot read properties of
 *      undefined (reading 'length')". Fix: use the original TypeScript source text from
 *      state.file.code instead of regenerating from the AST. workletTransformSync already
 *      includes @babel/preset-typescript so it handles the TS source fine.
 *   C) workletTransformSync not passed sourceMaps:true: returns map:null, which then hits the
 *      "[Reanimated] `inputMap` is undefined" assertion in buildWorkletString. Fix: add sourceMaps:true.
 *
 * Re-run (or pnpm install triggers postinstall) after any package update.
 */

const fs = require('fs');
const path = require('path');

const pnpmStore = path.join(__dirname, '../node_modules/.pnpm');

let storeDirs;
try {
  storeDirs = fs.readdirSync(pnpmStore);
} catch {
  console.log('[patch] .pnpm store not found – skipping.');
  process.exit(0);
}

// ── Patch 1: DOMRectReadOnly private class fields ────────────────────────────

const rnDirs = storeDirs.filter(f => f.startsWith('react-native@0.81.'));
for (const dir of rnDirs) {
  const filePath = path.join(
    pnpmStore, dir,
    'node_modules/react-native/src/private/webapis/geometry/DOMRectReadOnly.js'
  );
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('#x')) {
    console.log(`[patch-domrect] Already patched: ${filePath}`);
    continue;
  }

  content = content
    .replace(/  #x: number;/g,      '  _x: number;')
    .replace(/  #y: number;/g,      '  _y: number;')
    .replace(/  #width: number;/g,  '  _width: number;')
    .replace(/  #height: number;/g, '  _height: number;')
    .replace(/this\.#x\b/g,      'this._x')
    .replace(/this\.#y\b/g,      'this._y')
    .replace(/this\.#width\b/g,  'this._width')
    .replace(/this\.#height\b/g, 'this._height');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`[patch-domrect] Patched: ${filePath}`);
}

// ── Patch 2: react-native-worklets Babel plugin ──────────────────────────────

const workletsDirs = storeDirs.filter(f => f.startsWith('react-native-worklets@0.5.'));
for (const dir of workletsDirs) {
  const pluginPath = path.join(
    pnpmStore, dir,
    'node_modules/react-native-worklets/plugin/index.js'
  );
  if (!fs.existsSync(pluginPath)) continue;

  let content = fs.readFileSync(pluginPath, 'utf8');
  let changed = false;

  // Fix 2A: negative numericLiteral — Babel rejects negative numericLiteral values
  if (content.includes('numericLiteral)(-27)')) {
    content = content.replace(
      '(0, types_12.numericLiteral)(lineOffset),\n            (0, types_12.numericLiteral)(-27)',
      '(lineOffset >= 0 ? (0, types_12.numericLiteral)(lineOffset) : (0, types_12.unaryExpression)("-", (0, types_12.numericLiteral)(-lineOffset))),\n            (0, types_12.unaryExpression)("-", (0, types_12.numericLiteral)(27))'
    );
    changed = true;
  }

  // Fix 2B: @babel/generator called on raw TypeScript AST
  // Use original source text from state.file.code instead — workletTransformSync has
  // @babel/preset-typescript built in and handles TS source directly.
  const OLD_GEN = `      const codeObject = (0, generator_1.default)(fun.node, {
        sourceMaps: true,
        sourceFileName: state.file.opts.filename
      });`;
  const NEW_GEN = `      // Patch 2B: use original TypeScript source text instead of @babel/generator
      // to avoid crashes on TypeScript AST nodes inside worklet function bodies.
      // workletTransformSync already includes @babel/preset-typescript.
      const _patchNodeStart = fun.node.start;
      const _patchNodeEnd = fun.node.end;
      const _patchFileSrc = state.file.code;
      let codeObject;
      if (typeof _patchNodeStart === 'number' && typeof _patchNodeEnd === 'number' && _patchFileSrc) {
        codeObject = { code: _patchFileSrc.slice(_patchNodeStart, _patchNodeEnd), map: undefined };
      } else {
        codeObject = (0, generator_1.default)(fun.node, {
          sourceMaps: true,
          sourceFileName: state.file.opts.filename
        });
      }`;

  if (content.includes(OLD_GEN)) {
    content = content.replace(OLD_GEN, NEW_GEN);
    changed = true;
  }

  // Fix 2C: add sourceMaps:true to workletTransformSync so transformed.map is not null,
  // preventing the "[Reanimated] `inputMap` is undefined" assertion in buildWorkletString.
  const OLD_TRANSFORM = `      const transformed = (0, transform_1.workletTransformSync)(codeObject.code, {
        extraPlugins: [...extraPlugins, ...(_a = state.opts.extraPlugins) !== null && _a !== void 0 ? _a : []],
        extraPresets: state.opts.extraPresets,
        filename: state.file.opts.filename,
        ast: true,
        babelrc: false,
        configFile: false,
        inputSourceMap: codeObject.map
      });`;
  const NEW_TRANSFORM = `      const transformed = (0, transform_1.workletTransformSync)(codeObject.code, {
        extraPlugins: [...extraPlugins, ...(_a = state.opts.extraPlugins) !== null && _a !== void 0 ? _a : []],
        extraPresets: state.opts.extraPresets,
        filename: state.file.opts.filename,
        ast: true,
        sourceMaps: true,
        babelrc: false,
        configFile: false,
        inputSourceMap: codeObject.map
      });`;

  if (content.includes(OLD_TRANSFORM)) {
    content = content.replace(OLD_TRANSFORM, NEW_TRANSFORM);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(pluginPath, content, 'utf8');
    console.log(`[patch-worklets] Patched: ${pluginPath}`);
  } else {
    console.log(`[patch-worklets] Already patched: ${pluginPath}`);
  }
}

console.log('[patch] Done.');
