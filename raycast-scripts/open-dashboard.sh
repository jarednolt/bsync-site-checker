#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Open Site Checker Dashboard
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🌐
# @raycast.packageName Site Checker

# Documentation:
# @raycast.description Opens the Site Checker dashboard, starting it first if it isn't already running.
# @raycast.author Jared

set -euo pipefail

# Make sure common Node install locations are on PATH (Raycast scripts run with a minimal PATH)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/current/bin:$PATH"

APP_DIR="/Users/jarednolt/claude-code/rm-site-checker"
PORT="${PORT:-4545}"
URL="http://localhost:$PORT"

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

if curl -s -o /dev/null "$URL"; then
  echo "Dashboard already running at $URL"
else
  echo "Starting dashboard..."
  nohup npm run ui > /tmp/site-checker-ui.log 2>&1 &

  for i in $(seq 1 20); do
    sleep 0.5
    if curl -s -o /dev/null "$URL"; then
      echo "Dashboard is up."
      break
    fi
  done
fi

open "$URL"
