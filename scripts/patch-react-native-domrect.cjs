#!/usr/bin/env node
/**
 * Patches react-native's DOMRectReadOnly.js to replace private class fields
 * (#x, #y, #width, #height) with underscore-prefixed regular properties.
 *
 * The Linux hermesc binary shipped with react-native@0.81.x does not support
 * private class fields, causing `eas update` to fail on Linux (Replit).
 * Re-run this after every `pnpm install`.
 */

const fs = require('fs');
const path = require('path');

const pnpmStore = path.join(__dirname, '../node_modules/.pnpm');

let files;
try {
  files = fs.readdirSync(pnpmStore);
} catch {
  console.log('[patch-domrect] .pnpm store not found – skipping.');
  process.exit(0);
}

const rnDirs = files.filter(f => f.startsWith('react-native@0.81.'));

if (rnDirs.length === 0) {
  console.log('[patch-domrect] No react-native@0.81.x found – skipping.');
  process.exit(0);
}

for (const dir of rnDirs) {
  const filePath = path.join(
    pnpmStore,
    dir,
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
