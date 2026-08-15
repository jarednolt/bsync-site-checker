#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Check Site for Issues
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🔍
# @raycast.packageName Site Checker
# @raycast.argument1 { "type": "text", "placeholder": "URL (e.g. https://example.com)" }

# Documentation:
# @raycast.description Crawl a URL with Screaming Frog and report broken links, alt text, ARIA/roles, and color contrast issues.
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

URL="$1"

node scripts/site-check.js "$URL"
