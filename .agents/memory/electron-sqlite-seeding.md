---
name: Electron SQLite seeding pitfalls
description: Three bugs that silently break first-run admin seeding in packaged Electron apps; covers bcrypt import, DB init order, and self-healing hash repair.
---

# Electron SQLite first-run seeding — known pitfalls

## Bug 1: dynamic import of bcryptjs silently fails in esbuild bundle
`await import("bcryptjs")` inside an async function in an esbuild-bundled `.mjs` returns the module object, but `.default` may be undefined for CJS modules, causing `bcrypt.hash()` to throw. The seed function throws, is caught silently, and the DB has 0 users → every login fails with "Invalid credentials".

**Fix:** Use a static top-level `import bcrypt from "bcryptjs"` in `index.ts`. Static imports are always resolved correctly by esbuild.

## Bug 2: DB init must happen BEFORE app.listen() (SQLite only)
If `initSqlite()` + `seedSqlite()` run in a fire-and-forget IIFE after `app.listen()`, Electron's `nativeImport()` resolves at module evaluation time (before `start()` finishes), and the login window can open before the DB is seeded.

**Fix:** `await initSqlite()` BEFORE `app.listen()` for SQLite. Add a `waitForApiServer()` poll in `main.ts` that hits `/api/auth/needs-setup` every 250ms (up to 20s) before opening the window.

**Why:** PostgreSQL stays fire-and-forget (listen first) because pool.query() can hang in prod and block the health-check port.

## Bug 3: stale corrupted hash in existing DB
If a previous bad build ran and stored a garbage/empty `password_hash`, subsequent builds skip seeding (COUNT > 0) and login always fails.

**Fix:** In `seedSqlite()`, when COUNT > 0, check if the superadmin's hash starts with `$2` (valid bcrypt). If not, re-hash the configured default seed password and UPDATE the row.

## Bug 4: wrong userData folder name
`app.getPath("userData")` uses `app.getName()` which defaults to the npm `name` field (`@workspace/electron-app`), producing `%AppData%\@workspace\electron-app` instead of `%AppData%\Max7 Vista`.

**Fix:** Call `app.setName("Max7 Vista")` as early as possible in `main.ts`, before any `app.getPath()` call.

## Diagnostic tool
Write a `startup.log` to `USER_DATA_DIR` from inside `start()` with timestamps around `initSqlite`. If `initSqlite: complete` appears in <10ms, seeding was skipped (COUNT > 0 early-return). If line is missing, init threw before logging.
