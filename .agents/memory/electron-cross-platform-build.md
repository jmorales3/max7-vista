---
name: Electron cross-platform packaging limits in this environment
description: Which electron-builder targets can actually be produced from this Replit Linux sandbox, and what requires CI.
---

Only the Linux target (AppImage) can be packaged natively from this workspace. Windows (NSIS) cross-builds require Wine, which is not installed and cannot be relied on here; macOS builds require an actual macOS host.

**Why:** `electron-builder --win` on Linux normally shells out to Wine to run Windows-specific resource-signing tools; without Wine the build fails or produces an unusable artifact. There's no macOS host available in this sandbox at all.

**How to apply:** When asked to "build/package the desktop app," run `pnpm run build:full` (frontend+backend+main process compile) plus `pnpm --filter @workspace/electron-app run package:linux` for a real local artifact. For Windows/macOS installers, point the user to the existing GitHub Actions workflows (`.github/workflows/build-installers.yml`, `build-windows.yml`, `build-win.yml`) which build those targets on the appropriate CI runners — don't attempt them locally.
