#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Check Site List for Issues
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 📋
# @raycast.packageName Site Checker
# @raycast.argument1 { "type": "text", "placeholder": "Path to .txt file of URLs (e.g. ~/Desktop/urls.txt)" }

# Documentation:
# @raycast.description Crawl every URL in a .txt file with Screaming Frog and report broken links, alt text, ARIA/roles, and color contrast issues.
# @raycast.author Jared

set -euo pipefail

# Make sure common Node install locations are on PATH (Raycast scripts run with a minimal PATH)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/current/bin:$PATH"

APP_DIR="/Users/jarednolt/claude-code/rm-site-checker"
cd "$APP_DIR" || { echo "Could not find app folder at $APP_DIR"; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found in PATH."
  echo "Edit the PATH line near the top of this script to include your Node install location."
  exit 1
fi

if [ ! -d "node_modules/express" ]; then
  echo "Dependencies not installed yet. Run this once in Terminal:"
  echo "  cd \"$APP_DIR\" && npm install"
  exit 1
fi

# Expand ~ if the user typed a path like ~/Desktop/urls.txt
LIST_FILE="${1/#\~/$HOME}"

if [ ! -f "$LIST_FILE" ]; then
  echo "File not found: $LIST_FILE"
  exit 1
fi

URLS=()
while IFS= read -r LINE || [ -n "$LINE" ]; do
  LINE="$(echo "$LINE" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  [ -z "$LINE" ] && continue
  [[ "$LINE" == \#* ]] && continue
  URLS+=("$LINE")
done < "$LIST_FILE"

if [ "${#URLS[@]}" -eq 0 ]; then
  echo "No URLs found in $LIST_FILE"
  exit 1
fi

LABEL="$(basename "$LIST_FILE" .txt)"

echo "Checking ${#URLS[@]} specific page(s) from $LIST_FILE as \"$LABEL\""
node scripts/site-check.js --mode pages --label "$LABEL" "${URLS[@]}"
