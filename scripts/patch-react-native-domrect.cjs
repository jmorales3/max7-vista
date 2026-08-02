#!/usr/bin/env node
/**
 * Patches known bugs that prevent `eas update` from succeeding on Linux (Replit).
 *
 * PATCH 1 — react-native@0.81.x private class fields
 *   The Linux hermesc binary does not support private class fields (#fieldName).
 *   Scans ALL JS files under react-native/src/ and react-native/Libraries/ and replaces
 *   every private field declaration and this.#field access with the _fieldName equivalent.
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
 * PATCH 3 — react-native-worklets@0.5.1 missing @babel/* symlinks
 *   pnpm strict isolation does not link @babel/types, @babel/generator, or @babel/traverse
 *   into the worklets plugin's virtual node_modules, causing "Cannot find module" errors
 *   at Metro startup. Fix: create symlinks for each into the plugin's @babel/ directory.
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

// ── Patch 1: react-native private class fields ───────────────────────────────
// hermesc on Linux64 does not support ES2022 private class fields (#name).
// Walk ALL JS files under react-native/src/private/ and replace every
// private field declaration and this.#name access with _name equivalents.

function patchPrivateFields(content) {
  // Collect field names from class-field declarations: `  #name;` or `  #name =`
  const fieldNames = new Set();
  const declRe = /^\s{1,}#([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[:;=({]/gm;
  const accessRe = /\bthis\.#([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let m;
  while ((m = declRe.exec(content)) !== null) fieldNames.add(m[1]);
  while ((m = accessRe.exec(content)) !== null) fieldNames.add(m[1]);
  if (fieldNames.size === 0) return null; // no private fields found

  // Replace declarations (`  #name;`, `  #name =`, `  #name =`)
  // and this.#name accesses — but not random # in strings/comments
  for (const name of fieldNames) {
    // Declaration: #name at start of class body line (includes Flow type annotations with : and methods with ()
    content = content.replace(new RegExp(`(^\\s+)#(${name})(?=\\s*[:;=({])`, 'gm'), `$1_$2`);
    // Access: this.#name
    content = content.replace(new RegExp(`(\\bthis\\.)#(${name})\\b`, 'g'), `$1_$2`);
  }
  return content;
}

function walkJs(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkJs(full, callback);
    else if (entry.endsWith('.js')) callback(full);
  }
}

const rnDirs = storeDirs.filter(f => f.startsWith('react-native@0.81.'));
for (const dir of rnDirs) {
  const rnRoot = path.join(pnpmStore, dir, 'node_modules/react-native');
  let patched = 0;
  // Scan both src/ and Libraries/ — private fields appear in both trees
  for (const subDir of ['src', 'Libraries']) {
    walkJs(path.join(rnRoot, subDir), filePath => {
    const original = fs.readFileSync(filePath, 'utf8');
    const updated = patchPrivateFields(original);
      if (updated !== null && updated !== original) {
        fs.writeFileSync(filePath, updated, 'utf8');
        patched++;
      }
    });
  }
  if (patched > 0) console.log(`[patch-private-fields] Patched ${patched} file(s) in ${dir}`);
  else console.log(`[patch-private-fields] Already patched: ${dir}`);
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

// ── Patch 3: missing @babel/* symlinks for react-native-worklets ─────────────
// The worklets plugin requires @babel/types, @babel/generator, and @babel/traverse
// at load time. pnpm strict isolation only links @babel/core into the plugin's
// virtual node_modules, so the other three fail with "Cannot find module" at
// Metro startup. Fix: symlink each v7.x package from the pnpm store.

const workletsDirsForBabel = storeDirs.filter(f => f.startsWith('react-native-worklets@0.5.'));

// Map of bare name → pnpm store prefix to search for
const babelPkgsNeeded = {
  'types':     '@babel+types@7.',
  'generator': '@babel+generator@7.',
  'traverse':  '@babel+traverse@7.',
};

for (const [pkgName, storePrefix] of Object.entries(babelPkgsNeeded)) {
  const candidates = storeDirs.filter(f => f.startsWith(storePrefix)).sort();
  if (candidates.length === 0) continue;
  const bestDir = candidates.pop(); // highest version
  const pkgSrc = path.join(pnpmStore, bestDir, `node_modules/@babel/${pkgName}`);

  for (const dir of workletsDirsForBabel) {
    const babelDir = path.join(pnpmStore, dir, 'node_modules/@babel');
    const symTarget = path.join(babelDir, pkgName);

    if (!fs.existsSync(babelDir)) fs.mkdirSync(babelDir, { recursive: true });

    let needsLink = true;
    try {
      const existing = fs.readlinkSync(symTarget);
      if (existing === pkgSrc) needsLink = false;
    } catch { /* not a symlink or doesn't exist */ }

    if (needsLink) {
      try {
        if (fs.existsSync(symTarget)) fs.rmSync(symTarget, { recursive: true, force: true });
        fs.symlinkSync(pkgSrc, symTarget);
        console.log(`[patch-worklets-babel] Linked @babel/${pkgName} into ${dir}`);
      } catch (e) {
        console.error(`[patch-worklets-babel] Failed to link @babel/${pkgName}: ${e.message}`);
      }
    } else {
      console.log(`[patch-worklets-babel] Already linked @babel/${pkgName} into ${dir}`);
    }
  }
}

console.log('[patch] Done.');
