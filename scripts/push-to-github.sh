#!/usr/bin/env bash
set -e

REMOTE_URL="https://jmorales3:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/jmorales3/max7-vista.git"

if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

git push -u origin main
git tag v1.0.0 2>/dev/null || echo "Tag v1.0.0 already exists, skipping"
git push origin v1.0.0

echo ""
echo "Done! GitHub Actions is now building your .exe installer."
echo "Track progress: https://github.com/jmorales3/max7-vista/actions"
echo "Download when ready: https://github.com/jmorales3/max7-vista/releases"
