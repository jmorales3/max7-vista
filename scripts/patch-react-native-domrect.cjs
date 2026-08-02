#!/usr/bin/env node
/**
 * Patches two known bugs that prevent `eas update` from succeeding on Linux (Replit):
 *
 * 1. react-native@0.81.x — DOMRectReadOnly.js uses private class fields (#x, #y, #width,
 *    #height) that the Linux hermesc binary cannot compile. Replace with _x/_y/_width/_height.
 *
 * 2. react-native-worklets@0.5.1 — Babel plugin crashes with
 *    "Cannot read properties of undefined (reading 'length')" when a worklet function is
 *    defined inside a TypeScript file. The plugin calls @babel/generator on the raw TS AST
 *    before type annotations are stripped, causing the crash. Patch the generator call to
 *    clone the node and strip TS annotations first. Also fix hardcoded negative numericLiteral
 *    values that Babel rejects.
 *
 * Re-run (or pnpm install) after any package update.
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

  // Fix A: negative numericLiteral(-27) — Babel rejects negative numericLiteral values
  if (content.includes('numericLiteral)(-27)')) {
    content = content.replace(
      '(0, types_12.numericLiteral)(lineOffset),\n            (0, types_12.numericLiteral)(-27)',
      '(lineOffset >= 0 ? (0, types_12.numericLiteral)(lineOffset) : (0, types_12.unaryExpression)("-", (0, types_12.numericLiteral)(-lineOffset))),\n            (0, types_12.unaryExpression)("-", (0, types_12.numericLiteral)(27))'
    );
    changed = true;
  }

  // Fix B: @babel/generator called on raw TypeScript AST — strip TS annotations first
  const OLD_GEN = `      const codeObject = (0, generator_1.default)(fun.node, {
        sourceMaps: true,
        sourceFileName: state.file.opts.filename
      });`;
  const NEW_GEN = `      // Patch: strip TypeScript annotations from a clone before @babel/generator
      // to prevent 'Cannot read properties of undefined (reading length)' crashes
      // when worklets are defined inside TypeScript files.
      const _genNode = (0, types_12.cloneNode)(fun.node, true);
      (function _stripTS(n) {
        if (!n || typeof n !== 'object') return;
        if (n.typeAnnotation !== undefined) n.typeAnnotation = null;
        if (n.returnType !== undefined) n.returnType = null;
        if (n.typeParameters !== undefined) n.typeParameters = null;
        if (n.optional) n.optional = false;
        if (Array.isArray(n.params)) n.params.forEach(_stripTS);
        if (n.body) _stripTS(n.body);
        if (Array.isArray(n.body && n.body.body)) n.body.body.forEach(_stripTS);
      })(_genNode);
      const codeObject = (0, generator_1.default)(_genNode, {
        sourceMaps: true,
        sourceFileName: state.file.opts.filename
      });`;

  if (content.includes(OLD_GEN)) {
    content = content.replace(OLD_GEN, NEW_GEN);
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
