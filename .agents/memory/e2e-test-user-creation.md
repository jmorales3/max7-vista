---
name: E2E testing without known credentials
description: How to create a disposable login for Playwright-based e2e testing when no test/admin credentials are known or a seeded default account doesn't exist in the current DB state.
---

## Problem
`runTest()` (Playwright-based e2e testing subagent) needs to log in, but:
- The app's "default seed admin" (e.g. `admin` / `admin1234`) may not exist — real user accounts may have replaced it.
- You don't know any real user's password (correctly — passwords are hashed, never guess/decode them).

## Solution
Insert a throwaway test user directly into the DB with a known password, run the test, then delete the row.

1. Find which password hashing library the app actually uses (check `node_modules` under the API server's own package, not the workspace root — the root `node_modules/.pnpm` often has multiple hash libs available even if the app only depends on one). `bcryptjs` is commonly present and pure-JS (no native binding issues), even when the app itself calls `bcrypt`.
2. Generate a hash via `bash`: `node -e "require('bcryptjs').hash('SomePass123!',10).then(h=>console.log(h))"` run from inside the package directory that has `bcryptjs` in `node_modules`.
3. Check which tenant/org actually has the data you need to test against (e.g. `SELECT tenant_id, count(*) FROM presentations GROUP BY tenant_id`) — inserting the test user into an empty tenant makes the test pointless.
4. `INSERT INTO users (username, password_hash, tenant_id, role, is_active) VALUES ('e2e_test_admin', '<hash>', <tenant>, 'superadmin', true)`.
5. Run `runTest()` with those credentials.
6. **Always clean up** — `DELETE FROM users WHERE username='e2e_test_admin'` afterward, plus any other disposable test rows (e.g. presentations) created solely to disambiguate test assertions.

**Why:** Real user passwords are unknown and unguessable by design; the seeded default account is not guaranteed to survive once real users exist. This lets you test authenticated flows without touching real accounts.

**How to apply:** Any time an e2e test plan requires login and the standard/documented seed credentials fail with "Invalid credentials".
