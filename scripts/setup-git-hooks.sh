#!/usr/bin/env bash
# One-time setup: point git at the tracked hooks in scripts/git-hooks so that
# every commit on main auto-syncs to GitHub (see scripts/auto-sync-github.sh).
# Safe to re-run.
set -e
cd "$(git rev-parse --show-toplevel)"
chmod +x scripts/git-hooks/post-commit scripts/auto-sync-github.sh scripts/push-to-github.sh
git config core.hooksPath scripts/git-hooks
echo "Git hooks path set to scripts/git-hooks — commits to main will now auto-sync to GitHub."
