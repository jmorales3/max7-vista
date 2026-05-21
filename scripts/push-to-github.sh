#!/usr/bin/env bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
TOKEN="$(echo -n "$TOKEN" | tr -d '[:space:]')"

if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is not set."
  exit 1
fi

echo "Verifying token..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user)

if [ "$HTTP_STATUS" != "200" ]; then
  echo "ERROR: Token check failed (HTTP $HTTP_STATUS)."
  exit 1
fi

echo "Token OK."

git config --global credential.helper \
  '!f() { echo username=x-access-token; echo "password='"$TOKEN"'"; }; f'

REMOTE_URL="https://github.com/jmorales3/max7-vista.git"

if git remote get-url origin &>/dev/null; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi

echo "Pushing main branch..."
git push -u origin main

echo "Re-tagging v1.0.0 to trigger a fresh release build..."
# Delete remote tag if it exists
git push origin :refs/tags/v1.0.0 2>/dev/null || true
# Delete local tag if it exists
git tag -d v1.0.0 2>/dev/null || true
# Re-create and push
git tag v1.0.0
git push origin v1.0.0

echo ""
echo "Done! A new release build has been triggered."
echo "Track build : https://github.com/jmorales3/max7-vista/actions"
echo "Download    : https://github.com/jmorales3/max7-vista/releases"
