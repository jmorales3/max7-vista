---
name: git-filter-repo history rewrite gotchas
description: Failure modes encountered while shrinking git history with git-filter-repo and force-pushing to GitHub; check before doing another history rewrite.
---

## Stray files from prior crashed attempts block fast-import
If a previous filter-repo/gc run crashed or was interrupted, `.git/objects/pack/` and `.git/refs/**` can be left with `tmp_*`, `*.keep`, `*.lock`, and `fast_import_crash_*` files. These cause deterministic failures on retry:
- `fatal: cannot create keep file: File exists` — fast-import trying to recreate a keep marker that already exists.
- `Unable to create '.../packed-refs.lock': File exists` / `Unable to create '.../refs/heads/<branch>.lock': File exists` — stray ref locks.

**Why:** filter-repo re-runs regenerate identical content-addressed pack/keep names, colliding with leftovers from the earlier failed run.

**How to apply:** before (re)running `git-filter-repo`, check `ps aux | grep git` to confirm no process is actually running, then delete stray `tmp_*`, `*.keep`, `*.lock`, and `fast_import_crash_*` files under `.git/objects/pack/` and `.git/refs/`. Also check `.git/objects/pack/*.pack` files with no matching `.idx` — these are orphaned garbage from earlier crashes and are safe to delete.

## .git size includes the local git-lfs cache, not just objects
After filter-repo + `git reflog expire --all` + `git gc --prune=now --aggressive`, `.git/objects` can be small (tens of MB) while `.git` overall is still huge — check `du -sh .git/*` for a `.git/lfs/objects` directory holding cached LFS blobs for files that were removed from history. `git lfs prune` may retain them anyway; if you've confirmed via `git rev-list --objects <ref>` across all in-scope branches that nothing references them, deleting `.git/lfs/objects/*` directly is safe.

## GitHub push rejects single objects/LFS blobs over 2GB
A `git push` can fail with `Size must be less than or equal to 2147483648: [422]` even when no *tracked git blob* is anywhere near that size — the huge object is often a Git LFS pointer (small text blob containing `oid sha256:...` + `size ...`) still reachable in history, pointing to an actual LFS-stored file over GitHub's 2GB per-file limit. Find it with: search all small blobs (`git cat-file --batch-check`, filter `type==blob && size<500`) for content matching `oid sha256`, then `git rev-list --objects <ref> | grep <that-blob-hash>` to get its path, and filter-repo that path out too.

## Pushing changes to .github/workflows/*.yml needs a `workflow`-scoped PAT
A GitHub PAT with only `repo` scope will be rejected with `refusing to allow a Personal Access Token to create or update workflow ... without 'workflow' scope` if the rewritten history's push touches any file under `.github/workflows/`. Verify actual token scopes via `curl -s -D - https://api.github.com/user -H "Authorization: Bearer $TOKEN" | grep x-oauth-scopes` before assuming a provided token has what's needed — a 401 "Bad credentials" or a scopes list missing `workflow` both require the user to generate a new classic PAT with both `repo` and `workflow` checked.
