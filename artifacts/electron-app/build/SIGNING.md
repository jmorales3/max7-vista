# Code Signing & Notarization

This document describes the environment variables (set as GitHub Actions secrets or locally) needed to produce signed, distributable installers.

## macOS — Developer ID signing + notarization

| Secret / env var | Description |
|---|---|
| `CSC_LINK` | Base64-encoded Apple Developer ID Application `.p12` certificate file. Export from Keychain: `base64 -i cert.p12 | pbcopy` |
| `CSC_KEY_PASSWORD` | Password that protects the `.p12` file |
| `APPLE_ID` | Apple ID email address used for notarization (e.g. `dev@example.com`) |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for the Apple ID. Generate at [appleid.apple.com](https://appleid.apple.com) |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID found in [developer.apple.com/account](https://developer.apple.com/account) |

electron-builder activates notarization automatically when `APPLE_ID` is present. `hardenedRuntime: true` and the entitlements in `entitlements.mac.plist` are already configured for the correct capabilities.

## Windows — Authenticode signing

| Secret / env var | Description |
|---|---|
| `WIN_CSC_LINK` | Base64-encoded `.p12` or `.pfx` Authenticode / EV certificate file |
| `WIN_CSC_KEY_PASSWORD` | Password protecting the certificate |

An EV (Extended Validation) certificate is strongly recommended for Windows because it builds immediate SmartScreen reputation.

## Local unsigned builds

Running `pnpm package:mac` or `pnpm package:win` without any of the above env vars produces **unsigned** installers (useful for local testing). macOS will show a Gatekeeper warning; Windows SmartScreen may block the installer.

## CI release builds

The `.github/workflows/build-installers.yml` workflow triggers on `v*` tags and handles setting all signing env vars from GitHub repo secrets. Add the secrets above under **Settings → Secrets and variables → Actions** in your GitHub repository before pushing the first release tag.
