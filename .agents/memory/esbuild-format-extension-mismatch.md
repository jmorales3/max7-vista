---
name: esbuild format/outExtension must match package.json type + start script
description: A merge/rebase conflict silently flipped esbuild's output format and file extension, breaking the production start command.
---

`artifacts/api-server` has `"type": "module"` in package.json and a `start` script of `node ./dist/index.mjs`. Its `build.mjs` esbuild config must produce ESM output named `.mjs` to match: `format: "esm"` + `outExtension: { ".js": ".mjs" }`.

A rebase conflict resolution flipped both settings (`format: "cjs"` + `outExtension: { ".js": ".js" }`) without touching package.json or the start script. The build still succeeded (esbuild happily bundles as cjs), so there was no build-time error — only a runtime `Cannot find module '.../dist/index.mjs'` when starting the server, since the build now emitted `index.js` instead.

**Why:** esbuild's `format` and `outExtension` are independent knobs from the consuming package.json/start script; nothing type-checks that they agree, so a bad merge can silently desync them and the failure only surfaces at process start, not at build time.

**How to apply:** if a Node service with `"type": "module"` fails to start with "Cannot find module '.../index.mjs'" (or similar) right after a merge/rebase touched its build config, check `ls dist/` for the actual emitted filename/extension vs what the `start` script invokes, and check `format`/`outExtension` in the bundler config for a mismatch — don't assume it's related to whatever unrelated change (e.g. secret rotation) you were doing at the time.

**Recurrence (2026-07-06):** same failure class resurfaced on the *consumer* side instead of the producer side — `artifacts/electron-app/src/main.ts`'s `startApiServer()` hardcodes the path to the bundled api-server entry file (both the dev path and the packaged `process.resourcesPath` path), and it had drifted to `index.js` while `build.mjs` still correctly emits `index.mjs`. Symptom in a packaged Windows build: `Server Error … Cannot find module 'C:\Program Files\<app>\resources\api-server\index.js'`. Git history shows this exact filename has flip-flopped between `.js`/`.mjs` multiple times across unrelated commits — treat any "Cannot find module .../api-server/index.*" report as this bug first, regardless of what feature was being worked on when it was noticed; verify by diffing the hardcoded path in main.ts against `ls artifacts/api-server/dist/`.
