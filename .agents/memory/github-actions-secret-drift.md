---
name: GitHub Actions secret vs Replit env secret drift
description: Same-named secrets in Replit and GitHub Actions are two independent stores and can silently diverge, breaking anything signed/baked with one against the other
---

A secret with the same name (e.g. `LICENSE_HMAC_SECRET`) can exist in **two independent places**: Replit's environment secrets store, and the GitHub repo's Actions secrets store. Nothing keeps them in sync automatically — they are set separately, by different flows, at different times.

For Max7 Vista specifically: `build-full.mjs` bakes `LICENSE_HMAC_SECRET` (from `process.env` at build time) into `secrets.generated.ts`, which ships inside the Electron installer. GitHub Actions builds read the secret from **GitHub's** repo secret (`${{ secrets.LICENSE_HMAC_SECRET }}`), not Replit's. Any license code signed locally (e.g. via `tools/gen-license.mjs --secret <replit value>`) will fail signature verification (`"Invalid license signature"`) against an installer built by CI if the two stores disagree.

**Why:** it's easy to set/rotate a secret in one place (e.g. requesting it via Replit's env-secrets flow) while forgetting the CI-side copy has a stale or never-set value — there is no automatic propagation between the two systems, and no error until someone tries to actually redeem a code against a real build.

**How to apply:**
1. Whenever a build-time-baked secret is used both for local/dev signing and for CI-built artifacts, treat the GitHub Actions secret as the source of truth for what ships, and verify local values are generated against a copy of *that* same value — not just "whatever is in Replit's env."
2. To sync GitHub's copy to Replit's without ever printing either value: fetch `/repos/{owner}/{repo}/actions/secrets/public-key`, seal-box encrypt the Replit env value with `libsodium-wrappers` (`crypto_box_seal`), then `PUT /repos/{owner}/{repo}/actions/secrets/{NAME}` with `{encrypted_value, key_id}`. A 204 response confirms success.
3. After syncing, a **new build is required** — already-built installers keep whatever secret was baked in at their build time; syncing the GitHub secret only affects builds triggered after the sync.
4. Symptom to watch for: signature verifies fine against one secret store but the shipped app rejects it — that's the tell-tale sign of this exact drift, not a bug in the signing/verification code itself.
