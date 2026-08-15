#!/usr/bin/env bash
# Crawls URLs with the Screaming Frog CLI in headless mode and exports the
# CSV reports parse-report.js needs into <run-dir>/raw/<slug>/.
#
# Two modes, each with its OWN config file (SF_CONFIG_PATH / SF_PAGES_CONFIG_PATH):
#   run-crawl.sh <run-dir> domain <url1> [url2 ...]
#     Spiders each URL outward (Screaming Frog's --crawl / spider mode),
#     one raw/<slug-of-url>/ folder per URL. This is the original behavior.
#   run-crawl.sh <run-dir> pages <label> <url1> [url2 ...]
#     Checks exactly the given URLs with no link-following (Screaming Frog's
#     --crawl-list / list mode), all together in one raw/<slug-of-label>/
#     folder, with .target-url set to <label> so the whole list is tracked
#     as one target for diffing purposes.
#
# Pages mode needs its OWN config, separate from the domain-mode one: list
# mode only stays scoped to the exact URLs given if the loaded config has
# Limit Crawl Depth set to 0 (Config > Spider > Limits in the GUI) — otherwise
# it follows discovered links same as spider mode. A config saved for normal
# whole-site crawling has no such limit, so reusing it here silently turns a
# "check these specific pages" request into a full site crawl (confirmed by
# actually running it: a 2-URL pages-mode request spidered 6,000+ pages of a
# real site before being caught and killed). See README for how to set up the
# dedicated pages-mode config.
#
# Broken links come from the "Response Codes:All" tab export (per-page rows).
# Accessibility and alt-text detail come from bulk exports, not tab exports —
# the Accessibility:All / Images:All *tabs* only give per-page violation
# counts with no issue description, element, or severity, and Images:All has
# no Alt Text column at all. "Accessibility:All Violations" and
# "Images:Images Missing Alt Attribute & Text Inlinks" are the bulk-export
# reports with real per-instance detail (verified against a real Screaming
# Frog v24 install's actual CSV output, not just --help text).
#
# All of these names rely on an exact string match against your installed
# Screaming Frog version — a mismatch fails silently (the crawl completes,
# that one export just doesn't happen). If parse-report.js reports "no CSVs
# found" for a target, run:
#   "$SF_CLI_PATH" --help export-tabs
#   "$SF_CLI_PATH" --help bulk-export
# and adjust SF_EXPORT_TABS / SF_BULK_EXPORTS below to match your version.
set -euo pipefail

SF_CLI="${SF_CLI_PATH:-/Applications/Screaming Frog SEO Spider.app/Contents/MacOS/ScreamingFrogSEOSpiderLauncher}"
SF_CONFIG="${SF_CONFIG_PATH:-}"
SF_PAGES_CONFIG="${SF_PAGES_CONFIG_PATH:-}"
EXPORT_TABS="${SF_EXPORT_TABS:-Response Codes:All}"
BULK_EXPORTS="${SF_BULK_EXPORTS:-Accessibility:All Violations,Images:Images Missing Alt Attribute & Text Inlinks}"

if [ "$#" -lt 3 ]; then
  echo "Usage: run-crawl.sh <run-dir> domain <url1> [url2 ...]" >&2
  echo "       run-crawl.sh <run-dir> pages <label> <url1> [url2 ...]" >&2
  exit 1
fi

RUN_DIR="$1"
MODE="$2"
shift 2

if [ "$MODE" != "domain" ] && [ "$MODE" != "pages" ]; then
  echo "Unknown mode: $MODE (expected 'domain' or 'pages')" >&2
  exit 1
fi

if [ ! -x "$SF_CLI" ]; then
  echo "Screaming Frog CLI not found or not executable at: $SF_CLI" >&2
  echo "Set SF_CLI_PATH to the ScreamingFrogSEOSpiderLauncher binary path." >&2
  exit 1
fi

if [ "$MODE" = "domain" ]; then
  if [ -z "$SF_CONFIG" ]; then
    echo "SF_CONFIG_PATH is not set. See README.md 'Screaming Frog setup' for the" >&2
    echo "one-time steps to save a crawl config, then:" >&2
    echo "  export SF_CONFIG_PATH=/path/to/your-saved.seospiderconfig" >&2
    exit 1
  fi
  if [ ! -f "$SF_CONFIG" ]; then
    echo "SF_CONFIG_PATH points to a file that doesn't exist: $SF_CONFIG" >&2
    exit 1
  fi
else
  if [ -z "$SF_PAGES_CONFIG" ]; then
    echo "SF_PAGES_CONFIG_PATH is not set. See README.md 'Screaming Frog setup' for the" >&2
    echo "one-time steps to save a dedicated pages-mode config (Limit Crawl Depth = 0), then:" >&2
    echo "  export SF_PAGES_CONFIG_PATH=/path/to/your-saved-pages.seospiderconfig" >&2
    exit 1
  fi
  if [ ! -f "$SF_PAGES_CONFIG" ]; then
    echo "SF_PAGES_CONFIG_PATH points to a file that doesn't exist: $SF_PAGES_CONFIG" >&2
    exit 1
  fi
fi

slugify() {
  echo "$1" | sed -E 's~^https?://~~; s~[^A-Za-z0-9]+~_~g; s~^_|_$~~g'
}

check_exports() {
  local target_dir="$1"
  local what="$2"
  if [ -z "$(find "$target_dir" -maxdepth 1 -name '*.csv' -print -quit)" ]; then
    echo "Warning: no CSV files were exported for $what. Check SF_EXPORT_TABS and" >&2
    echo "SF_BULK_EXPORTS against '\"$SF_CLI\" --help export-tabs' / '--help bulk-export'" >&2
    echo "for your installed version." >&2
  fi
}

if [ "$MODE" = "domain" ]; then
  for URL in "$@"; do
    SLUG=$(slugify "$URL")
    TARGET_DIR="$RUN_DIR/raw/$SLUG"
    mkdir -p "$TARGET_DIR"
    echo "$URL" > "$TARGET_DIR/.target-url"

    echo "Crawling $URL (whole site) -> $TARGET_DIR"
    "$SF_CLI" \
      --crawl "$URL" \
      --headless \
      --config "$SF_CONFIG" \
      --output-folder "$TARGET_DIR" \
      --export-format csv \
      --overwrite \
      --export-tabs "$EXPORT_TABS" \
      --bulk-export "$BULK_EXPORTS"

    check_exports "$TARGET_DIR" "$URL"
  done
else
  LABEL="$1"
  shift
  if [ "$#" -eq 0 ]; then
    echo "Pages mode needs at least one URL after the label." >&2
    exit 1
  fi

  SLUG=$(slugify "$LABEL")
  TARGET_DIR="$RUN_DIR/raw/$SLUG"
  mkdir -p "$TARGET_DIR"
  echo "$LABEL" > "$TARGET_DIR/.target-url"

  LIST_FILE="$TARGET_DIR/.pages-list.txt"
  printf '%s\n' "$@" > "$LIST_FILE"

  echo "Checking $# specific page(s) as \"$LABEL\" -> $TARGET_DIR"
  "$SF_CLI" \
    --crawl-list "$LIST_FILE" \
    --headless \
    --config "$SF_PAGES_CONFIG" \
    --output-folder "$TARGET_DIR" \
    --export-format csv \
    --overwrite \
    --export-tabs "$EXPORT_TABS" \
    --bulk-export "$BULK_EXPORTS"

  check_exports "$TARGET_DIR" "\"$LABEL\""
fi
