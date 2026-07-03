---
name: api-server route path double-mount gotcha
description: Why some routes in this monorepo's api-server need a `/api` prefix in their path and others don't, depending on which sub-router file they live in.
---

The main app mounts the aggregate router at `/api` (`app.use("/api", router)` in
`app.ts`). Inside `routes/index.ts`, most sub-routers are mounted with
`router.use(xRouter)` (no extra prefix), so routes declared in those files
should use bare paths like `/server-info` — the final path becomes
`/api/server-info`.

`health.ts` is inconsistent: `/healthz` is bare (final path `/api/healthz`),
but the pre-existing `/api/version` route was declared with a redundant
`/api` prefix baked into its path string, making its *real* final path
`/api/api/version` (confirmed intentional/pre-existing quirk — the frontend
calls it at that exact double-prefixed path).

**Why:** copying the `/api/version` pattern for a new route
(`/api/server-info`) silently doubles the prefix again, and the resulting
404-adjacent behavior is misleading: Express falls through past the
sub-router entirely and the request hits `requireAuth` on a later route,
returning a confusing `401 Unauthorized` instead of a 404 — easy to
misdiagnose as an auth bug when it's actually a route-not-found problem.

**How to apply:** when adding a new route anywhere in `routes/*.ts`, check
how sibling routes in the *same file* are actually reached (curl them) before
assuming the prefix convention — don't copy a neighboring route's path
string as a template without verifying its real mounted path first.
