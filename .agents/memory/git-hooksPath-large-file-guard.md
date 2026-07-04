---
name: Git hooksPath large-file guard
description: How the project blocks oversized files from entering git history, and why core.hooksPath must be re-applied per environment.
---

The repo uses `git config core.hooksPath scripts/git-hooks` (set via `scripts/setup-git-hooks.sh`) so hook scripts can be version-controlled instead of living only in the untracked `.git/hooks/` dir. A `pre-commit` hook there rejects any staged file over ~8MB unless it's Git-LFS-tracked or listed in `scripts/git-hooks/large-file-allowlist.txt`.

**Why:** Large build artifacts (Electron installers, uploaded images, screenshots, zip exports) were committed into history four times, each requiring a multi-hour `git filter-repo` rewrite to fix (see git-filter-repo-rewrite.md).

**How to apply:** `core.hooksPath` lives in `.git/config`, which is never committed — every fresh clone/environment starts with it unset. `scripts/post-merge.sh` now re-runs `scripts/setup-git-hooks.sh` on every merge to keep the guard active; if that call is ever removed, the pre-commit guard silently stops working with no error.
