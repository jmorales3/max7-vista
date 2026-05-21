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

# Only push the tag if it hasn't been pushed yet
if ! git ls-remote --tags origin v1.0.0 | grep -q v1.0.0; then
  echo "Pushing tag v1.0.0..."
  git tag v1.0.0 2>/dev/null || true
  git push origin v1.0.0
else
  echo "Tag v1.0.0 already on remote — skipping tag push."
  echo "To trigger a new release build, delete the old tag and re-push:"
  echo "  git push origin :refs/tags/v1.0.0"
  echo "  git tag -d v1.0.0"
  echo "  git tag v1.0.0"
  echo "  git push origin v1.0.0"
fi

echo ""
echo "Done!"
echo "Track build : https://github.com/jmorales3/max7-vista/actions"
echo "Download    : https://github.com/jmorales3/max7-vista/releases"
