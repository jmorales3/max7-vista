#!/usr/bin/env bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"

# Trim any accidental whitespace
TOKEN="$(echo -n "$TOKEN" | tr -d '[:space:]')"

if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is not set."
  exit 1
fi

# Verify the token works before attempting a push
echo "Verifying token..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/user)

if [ "$HTTP_STATUS" != "200" ]; then
  echo "ERROR: Token check failed (HTTP $HTTP_STATUS). The token may be expired or missing scopes."
  exit 1
fi

echo "Token OK."

# Use git credential helper so the token never has to be URL-encoded
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

echo "Tagging v1.0.0..."
git tag v1.0.0 2>/dev/null || echo "Tag v1.0.0 already exists, skipping"

echo "Pushing tag..."
git push origin v1.0.0

echo ""
echo "All done!"
echo "Track build : https://github.com/jmorales3/max7-vista/actions"
echo "Download    : https://github.com/jmorales3/max7-vista/releases"
