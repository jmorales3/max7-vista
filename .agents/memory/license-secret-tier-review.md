---
name: License system review pitfalls
description: Recurring code-review blockers for the license/activation feature — leaked secret in build output, tier enum drift, CLI flag drift, and the .lic tamper-file pattern.
---

When building or modifying license/activation code (HMAC-signed license codes, machine binding, tamper detection):

- **Never let build scripts write the signing secret into a committed source file.** `build-full.mjs`-style scripts that bake `LICENSE_HMAC_SECRET` into a generated `.ts` file must write it to a gitignored path, and that path must be verified as gitignored before every commit — this leaked once already.
  **Why:** a generated file with a real name (`secrets.generated.ts`) blends in with normal build output and isn't obviously suspicious in a diff.
  **How to apply:** whenever touching the license build pipeline, grep for the actual secret value or the generated file path in `git ls-files` before finishing.

- **Tier/plan enum and CLI flag names must match end-to-end**: `LicensePayload.plan` type in `license.ts`, the `gen-license.mjs` CLI args, and any UI plan labels are three independent places that can drift out of sync (e.g. `1yr|2yr|lifetime` vs `6mo|1yr|lifetime`, or `--mid`+env-secret vs `--machineId --plan --secret`).
  **Why:** these three surfaces are edited independently and nothing type-checks the CLI arg names or the plan string literals against each other.
  **How to apply:** when changing tiers or the generator CLI, grep the whole repo for the old tier strings/flag names to confirm no stale copy remains.

- **Two independent tamper checks are expected for desktop licenses**: the DB `record_hash` (detects direct DB edits) and a secondary `.lic` file under `USER_DATA_DIR` (detects DB replacement/rollback). `computeStatus()` takes a `licFileValid` boolean parameter — the status route must call `verifyLicFile()` and pass the result in, or `.lic` tampering silently passes.
  **Why:** DB-only tamper checks don't catch a user restoring an old DB file wholesale (record_hash would still match the old, now-stale record).
  **How to apply:** any route that reads license status must verify both signals before calling `computeStatus`; any route that writes an activation must call `writeLicFile()` after the DB update succeeds.
</content>
