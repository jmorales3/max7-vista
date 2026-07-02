#!/usr/bin/env bash
# Best-effort background push of the current branch to GitHub.
# Designed to be safe to call from a git hook: never blocks, never fails loudly,
# and never touches tags or triggers release builds (that's push-to-github.sh's job).
set -u

LOG_FILE="/tmp/auto-sync-github.log"
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

if [ "$BRANCH" != "main" ]; then
  exit 0
fi

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-}"
TOKEN="$(echo -n "$TOKEN" | tr -d '[:space:]')"

if [ -z "$TOKEN" ]; then
  echo "[$(date -u +%FT%TZ)] skip: GITHUB_PERSONAL_ACCESS_TOKEN not set" >> "$LOG_FILE"
  exit 0
fi

git config --global credential.helper \
  '!f() { echo username=x-access-token; echo "password='"$TOKEN"'"; }; f' 2>/dev/null

if ! git remote get-url origin &>/dev/null; then
  git remote add origin "https://github.com/jmorales3/max7-vista.git" 2>/dev/null
fi

if git push origin "$BRANCH" >> "$LOG_FILE" 2>&1; then
  echo "[$(date -u +%FT%TZ)] synced $BRANCH to GitHub" >> "$LOG_FILE"
else
  echo "[$(date -u +%FT%TZ)] push failed, see log above" >> "$LOG_FILE"
fi

exit 0
