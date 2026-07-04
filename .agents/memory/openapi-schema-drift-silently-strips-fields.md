---
name: OpenAPI schema drift silently strips fields
description: A DB column read/written directly in a route handler but missing from openapi.yaml's request/response schema gets silently dropped by the generated zod validator, not rejected with an error.
---

When a route does `db.update(table).set(parsed.data)` where `parsed = SomeZodSchema.safeParse(req.body)`, any request field not declared in that schema's `openapi.yaml` definition is silently stripped (zod objects strip unknown keys by default) — `safeParse` still succeeds, so no 400 is returned. If that was the *only* field sent, the update becomes a no-op (or, in Drizzle, an empty `.set({})` call can itself throw a confusing SQL error).

**Why:** This class of bug is invisible from the route handler code alone — the DB schema/select already reads/writes the column fine, so it *looks* wired up correctly. The actual defect is an omission in `openapi.yaml`, several files removed from where the symptom (silent failure clicking a button) appears.

**How to apply:** When a "field exists on the DB table and is read/written in route code, but a `PATCH`/`POST` action for it errors or silently no-ops" is reported, check whether that field is declared in the OpenAPI schema for both the response type AND the corresponding `*Update`/`*Input` request type — not just one of them. Grep generated `api.schemas.ts` / zod output for the field name to confirm it round-trips.
