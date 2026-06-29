---
name: SQLite–Postgres schema parity rule
description: Standing directive — every schema or seed change made to the Postgres path must also be applied to the SQLite (Electron desktop) path, and vice versa.
---

# SQLite ↔ Postgres parity — standing directive

## The rule
Every change to the database layer must be applied to BOTH paths:

| Change type | Postgres path | SQLite path |
|---|---|---|
| New table | `CREATE TABLE IF NOT EXISTS` in `initPostgres()` | `CREATE TABLE IF NOT EXISTS` in `initSqlite()` exec block |
| New column on existing table | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `runMigrations()` | `ALTER TABLE … ADD COLUMN` (try/catch) in the `sqliteMigrations` array in `initSqlite()` |
| New seeded data (system templates, etc.) | `seedPostgres()` gated by `seed_state` key | `seedCephTemplatesSqlite()` (or equivalent) gated by `settings` key |

## Why
The desktop (Electron) app uses SQLite; the web/cloud app uses PostgreSQL. They share the same route handlers and Drizzle queries. If a column exists in Postgres but not SQLite, any query that references it silently returns wrong results or throws at runtime — with "Invalid credentials" or empty lists as the symptom, not a schema error.

## How to apply
Before opening any PR / pushing any commit that touches `initPostgres()`, `runMigrations()`, or `seedPostgres()`:
1. Open `initSqlite()` in `artifacts/api-server/src/index.ts`
2. Mirror every new `CREATE TABLE` there
3. Mirror every new `ALTER TABLE` in the `sqliteMigrations` array
4. Mirror every new seed in an equivalent SQLite seed function

Same rule applies in reverse: changes to `initSqlite()` must be reflected in `initPostgres()` / `runMigrations()`.

## Known historical gaps (all fixed as of build #30)
- `ceph_templates`, `ceph_landmarks`, `ceph_measurements`, `ceph_tracings`, `ceph_tracing_points`, `ceph_tracing_results` — tables existed in Postgres only; added to SQLite in build #29
- Ceph system templates (Steiner, Ricketts, Tweed, Witts) — seeded in Postgres only; added to SQLite seed in build #29
- `patients.tenant_id`, `tags.tenant_id`, `templates.tenant_id` — in Postgres via migration; added to SQLite migrations in build #30
- `ceph_measurements.ideal_min` / `ideal_max` — in SQLite only; added to Postgres migration in build #30
- `ceph_tracings.record_phase` — in SQLite only; added to Postgres migration in build #30
