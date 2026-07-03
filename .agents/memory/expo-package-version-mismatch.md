---
name: Expo native package version pinning
description: Why adding an Expo native module by a loose semver range (e.g. ^57.0.0) can silently break the whole app, and how to catch it before it ships.
---

Expo native modules (expo-camera, expo-image-picker, expo-location, etc.) are
tightly coupled to the installed Expo SDK version — each SDK release expects
a specific narrow version range per module, not "whatever is newest on npm."

Installing a module with an open-ended semver range (`^57.0.0`) can resolve to
a version built for a much newer Expo SDK than the project uses. The failure
mode is not a clear "version mismatch" error — it can be an obscure runtime
crash deep in a transitive import (e.g.
`(0 , _expo.createPermissionHook) is not a function`) that kills the entire
app at boot, not just the screen that imports the module, because Expo Router
eagerly bundles all tab/route files.

**Why:** semver ranges optimize for "latest and greatest" but Expo's SDK
versioning model assumes lockstep versions across all `expo-*` packages;
letting the package manager pick the newest match breaks that assumption
silently until runtime.

**How to apply:** after adding/updating any `expo-*` package, run
`npx expo install --check` (or just use `npx expo install <package>` instead
of a raw package manager add) inside the Expo app's directory to confirm the
resolved version matches what the installed Expo SDK expects, *before*
restarting the workflow or testing. Don't rely on `tsc --noEmit` passing as
proof the install is safe — type declarations can be compatible while the
runtime JS is not.
