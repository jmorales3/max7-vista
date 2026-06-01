---
name: Deployment startup — listen before DB init
description: Why app.listen() must be called before any async DB initialisation in the deployed API server.
---

## Rule
In `artifacts/api-server/src/index.ts`, always call `app.listen()` first to open the port, then run DB schema init / first-run tasks in a fire-and-forget async IIFE with try/catch.

**Why:** Replit's deployment health-check expects the artifact port to open within ~60 seconds. `pool.query()` with multi-statement `CREATE TABLE IF NOT EXISTS` SQL can hang indefinitely in the production PostgreSQL environment (observed: process ran 60 s with no output, then SIGTERM). Because the old code awaited `initPostgres()` before `app.listen()`, the port never opened and every deploy failed with "a port configuration was specified but the required port was never opened".

**How to apply:**
- Wrap `app.listen()` in `await new Promise<void>(resolve => app.listen(port, host, () => { resolve(); }))` at the top of `start()`.
- Run all DB init and background tasks in `(async () => { ... })()` after the listen resolves.
- Always wrap DB init in try/catch so a failure doesn't crash the server.
- After changing `index.ts`, rebuild the dist: `pnpm --filter @workspace/api-server run build` — the deployment runs `dist/index.mjs`, not source.
