---
name: electron-builder parallel release race
description: macOS + Windows build jobs publishing to the same GitHub release tag can race and one job's "create release" call fails with 422 already_exists.
---

# Parallel platform builds racing to create the same GitHub Release

`build-installers.yml` runs `build-mac` and `build-win` as independent parallel
jobs, each invoking `electron-builder --publish always` for the same tag. Both
jobs try to create the GitHub Release for that tag if it doesn't exist yet.

**Why:** electron-builder's publish step is not race-safe across concurrent
jobs — whichever job's "create release" HTTP call loses the race gets
`422 Unprocessable Entity` (`already_exists` on `tag_name`) and its job fails
outright, even though the release was actually created successfully overall.
This is intermittent (worked fine for v1.1.3/1.1.4/1.1.5, failed for v1.1.6)
so don't assume yesterday's clean run means it's fixed.

**How to apply:** After tagging a release, check both platform jobs'
conclusions, not just whether the tag/workflow "completed". If exactly one
platform job failed with this 422/already_exists pattern, the release object
already exists from the other job — re-running just the failed job (rerun
failed jobs) is safe and will attach that platform's assets. Verify by
fetching `/releases/tags/<tag>` afterward and confirming assets from BOTH
platforms are present before telling the user the release is ready.
