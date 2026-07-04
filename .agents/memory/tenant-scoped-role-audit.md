---
name: Tenant-scoped role audit pattern
description: How a role that is supposed to be single-tenant-only can silently regain cross-tenant power, and where to look.
---

When a role is redesigned to be tenant-scoped (e.g. "Superadministrator manages only their own organization"), grep every `requireRole("<that role>")` call site across all route files, not just the ones the current task touches. Cross-tenant leaks hide in three shapes:

1. **List/read endpoints with no `WHERE tenantId = ...`** — trivially returns every tenant's rows.
2. **Write endpoints that accept a client-supplied `tenantId` in the body** — even if scoped by default, an optional override defeats it.
3. **Update/delete-by-id endpoints that look up only by `id`** — must also filter by `tenantId` so an id belonging to another tenant 404s instead of matching.

**Why:** these three shapes don't show up in a manual click-through test with one account — they only surface when you have two real accounts in two different tenants and try to reach across. A single-tenant demo environment will look fine and still ship the bug.

**How to apply:** for any "make role X single-tenant" task, enumerate every route gated by that role's middleware, and for each one check all three shapes above. A bulk export/import (backup, migration, "download everything") endpoint is an especially high-risk spot — it often predates the tenant model and dumps the whole table, credentials included.

Also update every user-facing description of the role (help/manual text in all locales, chatbot system prompt, in-app copy) in the same pass — these drift out of sync with the actual access-control code and end up describing the old (wrong) behavior as if it were a feature.
