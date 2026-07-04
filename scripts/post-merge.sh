#!/bin/bash
set -e

pnpm install
pnpm --filter @workspace/db run push-force

# core.hooksPath lives in .git/config (not versioned), so re-apply it on
# every merge to keep the pre-commit large-file guard and GitHub auto-sync
# active in this environment.
bash scripts/setup-git-hooks.sh
