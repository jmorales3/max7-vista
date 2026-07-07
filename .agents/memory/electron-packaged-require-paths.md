---
name: Electron packaged build — relative require() paths in esbuild bundles
description: Runtime crashes when api-server bundle uses createRequire(import.meta.url) to load files that don't exist relative to the packaged bundle path
---

When the api-server is bundled by esbuild into a single `dist/index.mjs`, any call using `createRequire(import.meta.url)` to load a **relative** file (e.g. `require("../package.json")`) will resolve relative to the bundle's location at runtime — not relative to the original source file's location at build time.

In the packaged Electron app: `import.meta.url` → `file:///C:/Program Files/Max7 Vista/resources/api-server/index.mjs`, so `require("../package.json")` looks for `resources/package.json`, which does not exist. This throws at **module load time** (top-level code), crashing the whole server before any route can run.

**Why:** esbuild does not statically inline calls made through `createRequire(import.meta.url)` — it treats them as opaque runtime requires, leaving them unresolved. Unlike a plain `import pkg from "../package.json"` (which esbuild bundles inline), the `createRequire` pattern produces a real runtime file lookup that fails in the installed app.

**How to apply:**
1. Never use `createRequire(import.meta.url)` to load relative files (like `package.json`) in source files that will be bundled for Electron. Alternatives:
   - Wrap in `try/catch` with a safe fallback (e.g. `{ version: "unknown" }`), AND have Electron inject the value as an env var (`APP_VERSION: app.getVersion()`) before the dynamic import, so routes can still serve a meaningful value.
   - Use a static `import` with a JSON import assertion — esbuild will inline these at build time and eliminate the runtime file dependency entirely.
2. The Electron `main.ts` `startApiServer()` should always set `APP_VERSION: app.getVersion()` in the `process.env` block before importing the server bundle — the `/api/version` route already prefers `process.env.APP_VERSION` over the bundled pkg fallback.
3. Also applies to any other file the bundle tries to `require()` at the top level by relative path — asset files, config files, locale JSONs, etc.
