# Site Checker

On-demand accessibility and link/alt-text health checker for a website (dev or production). Screaming Frog does the actual crawling and detection (broken links, missing alt text, ARIA/role validity, color contrast — via its built-in axe-core Accessibility auditing); this repo turns Screaming Frog's raw exports into a deduplicated, diffed report with a count of how often each issue recurs.

## How it works

There are two check modes:

- **Whole site** (`domain` mode) — spiders outward from one URL, checking every page it finds. This is the default. Submitting several URLs in this mode runs one full site-crawl per URL, one after another, and each gets its **own separate report** as soon as it finishes (not one combined report at the end).
- **Specific pages** (`pages` mode) — checks *only* the exact URLs you give it, with no link-following, all under one label you choose (e.g. "Westbench product pages"). Useful for a curated list of pages rather than a whole site — Screaming Frog's list mode (`--crawl-list`) instead of spider mode (`--crawl`).

```
node scripts/site-check.js <url1> [url2 ...]                    # whole-site mode, one report per URL
node scripts/site-check.js --mode pages --label "<name>" <url1> [url2 ...]   # specific-pages mode, one report
  └─ scripts/run-crawl.sh      crawls with the Screaming Frog CLI (spider or list mode), exports CSVs
  └─ scripts/parse-report.js   normalizes CSVs into one issue per instance
  └─ scripts/aggregate.js      groups repeats into one row per issue, with a count
  └─ scripts/diff-runs.js      compares against the previous run, tags new/persisting/resolved
  └─ scripts/generate-report.js  writes report.html and report.csv
```

Everything for a run lands under `runs/<timestamp>/` (gitignored — these are run artifacts, not source):
- `raw/<slug>/` — Screaming Frog's CSV exports for each target
- `issues.json` — every individual issue instance
- `aggregate.json` — issues grouped with a `count` and `affectedUrls`
- `diffed.json` — the above with `status: new | persisting | resolved`
- `report.html`, `report.csv` — the two deliverables

## Prerequisites

- Node.js 18+
- A paid Screaming Frog SEO Spider license (needed for the CLI's headless mode, Accessibility extraction, and unlimited crawl size)

## Getting started

**1. One-time Screaming Frog setup, in the Screaming Frog GUI.** You need **two** saved configs — one for each check mode — because they need different settings and can't safely share one file (see "Why two configs?" below):

*Whole-site config* (for "Whole site" checks):
1. `Config > Spider > Extraction` → enable **Accessibility**.
2. `Config > Spider > Rendering` → set rendering mode to **JavaScript** (required for Accessibility and color-contrast checks — they need computed styles, not just raw HTML).
3. `Config > Spider > Speed` → set a sane crawl rate (especially if you'll point this at production — don't hammer a live site).
4. `Configuration > Profiles > Save As...` and note the path to the saved `.seospiderconfig` file.

*Specific-pages config* (for "Specific pages" checks):
1. Repeat steps 1-3 above (same Accessibility/JavaScript/Speed settings).
2. **`Config > Spider > Limits` → enable "Limit Crawl Depth" and set it to `0`.** This is the step that actually matters here — without it, "specific pages" checks will spider outward from the given URLs instead of staying scoped to them (see below).
3. `Configuration > Profiles > Save As...` under a **different filename** than the whole-site config (e.g. `sf-pages.seospiderconfig`) and note its path.

Either way, don't use `File > Save As...` — with a crawl loaded, that saves the crawl's actual data as a `.seospider` file, not a reusable settings profile. If you already have a `.seospider` file from doing that, it's not usable here; go back and save via `Configuration > Profiles > Save As...` instead (you don't need a crawl loaded/run to do this).

**Why two configs?** Screaming Frog's list mode (used by "specific pages" checks, so it checks *only* the URLs given) only stays scoped to those exact URLs if the loaded config has Limit Crawl Depth set to `0`. A config saved for normal whole-site crawling has no such limit, so if the two modes shared one config, a "check these 2 specific pages" request would silently spider the entire site instead — confirmed by actually hitting this: a real test with 2 URLs spidered 6,000+ pages of a live site before being caught and killed. Keeping them as two separate saved configs is the only reliable fix, since there's no CLI flag to override crawl depth at invocation time — it's config-file-only.

**2. Start the dashboard:**

```bash
npm install   # first time only
npm run ui
```

This opens `http://localhost:4545` in your browser automatically (override the port with `PORT=<n> npm run ui`). Don't open `public/index.html` directly as a file — the dashboard only works when served by this command.

**3. Connect Screaming Frog.** Click **Settings** in the dashboard and fill in:
- **Screaming Frog CLI path** — pre-filled with the default macOS install location; change it if yours differs.
- **Whole-site crawl config path** — the first `.seospiderconfig` file from step 1.
- **Specific-pages crawl config path** — the second, depth-limited `.seospiderconfig` file from step 1. You only need this one if you plan to use "Specific pages" checks — "Whole site" checks work without it.

Each field shows a live ✓/✗ once saved. A banner appears on the main page if the CLI path or whole-site config is missing (blocks all checks); the Run check button specifically disables itself for "Specific pages" mode if just the pages config is missing, without blocking "Whole site" mode. This is stored in a local `config.json` (gitignored, not committed) rather than shell environment variables — no `export` or shell-profile editing needed. (Env vars `SF_CLI_PATH` / `SF_CONFIG_PATH` / `SF_PAGES_CONFIG_PATH` still work as a fallback if you're scripting the CLI directly without ever opening the dashboard.)

## Usage

Once Settings shows the fields you need green: pick **Whole site** or **Specific pages** (the latter shows a "Label this list" field), enter one or more URLs (one per line) in "New check", and click **Run check** — progress streams live per report, and each finished run lands in history below.

**Scheduling**: pick "Schedule for later" instead of "Run now" and choose a date/time — useful for setting up a batch before you leave for the night and finding the reports ready in the morning. This only works while the dashboard server keeps running and your Mac stays awake until the scheduled time (it's an in-app timer, not a macOS-level scheduled job) — disable sleep, or run `caffeinate` in a terminal, if you're scheduling something overnight. A scheduled batch survives a dashboard restart (it's persisted to `scheduled.json` and re-armed on startup), but not the Mac actually going to sleep or losing power. Cancel a pending one any time from the "Scheduled checks" list.

The same pipeline is also available from the terminal:

```bash
node scripts/site-check.js https://dev.example.com
node scripts/site-check.js https://example.com https://staging.example.com   # two separate reports, run one after another
node scripts/site-check.js --mode pages --label "Key pages" https://example.com/a https://example.com/b
```

Or, from Claude Code, just ask it to check a site — the `/site-check` skill wraps this same pipeline and will summarize the results and offer to publish the HTML report.

The dashboard lets you trigger a check with a live progress log, browse run history, filter/search a run's issues by category/status/text, view trend charts of issue counts over time per target, and download a run's CSV. All three entry points (dashboard, CLI, Claude skill) read and write the same `runs/<timestamp>/` files, so runs started any way show up in the same history.

## Raycast

Three Raycast Script Commands are in `raycast-scripts/`, already executable:

- **check-site.sh** — "Check Site for Issues". Argument: a URL.
- **check-site-list.sh** — "Check Site List for Issues". Argument: path to a `.txt` file of URLs (one per line; blank lines and `#`-prefixed lines are skipped — the same format used by the `quick-links` screenshot project, so the same list file works for both). Runs in **specific-pages mode** (no link-following), labeled from the file's own name (e.g. `westbench.txt` → label "westbench").
- **open-dashboard.sh** — "Open Site Checker Dashboard". No arguments; starts the dashboard if it isn't already running, then opens it.

All three `cd` into this project and call the same `scripts/site-check.js` CLI (or start `npm run ui`) that the rest of this README describes — they need the same one-time `npm install` above, and the same Settings/Screaming Frog setup.

### Install into Raycast

1. Open Raycast → Settings → Extensions → Script Commands.
2. Click the folder icon (Add Directory) and select this project's `raycast-scripts` folder.
3. Raycast will pick up all three commands automatically. Search for "Check Site" or "Site Checker" in Raycast to run them.
4. Optionally set a hotkey/alias for any of them from that same Extensions settings page.

### Notes

- Both `check-site.sh` and `check-site-list.sh` run always show live output in Raycast's fullOutput view — progress lines, then the run directory, counts, and report paths, same as running `node scripts/site-check.js` in a terminal.
- If Raycast can't find `node`, open the script and add your Node install path to the `export PATH=...` line near the top (run `which node` in Terminal to find it) — same fix as in `quick-links`'s Raycast scripts.

## Safety note

This tool is read-only — it crawls and reports, it never writes to the target site. It's safe to point at production, but Screaming Frog will be making real HTTP requests against whatever URL you give it, so keep the crawl speed setting reasonable for a live site.

## Troubleshooting

**A "Specific pages" check crawled way more than the pages I listed.**
This means the specific-pages config either isn't set (falling back to something without a crawl-depth limit) or wasn't actually saved with `Config > Spider > Limits > Limit Crawl Depth` set to `0`. Open Settings, check the specific-pages config path is set and pointing at a config saved with that limit — see "Why two configs?" above. If a check is currently running away like this, kill the `ScreamingFrogSEOSpiderLauncher` process (Activity Monitor, or `pkill -f ScreamingFrogSEOSpiderLauncher` in Terminal) rather than waiting for it to finish.

**A scheduled batch didn't run.**
The dashboard has to still be running (`npm run ui`), and the Mac has to be awake, at the scheduled time — this is an in-process timer, not a system-level job. Check whether the Mac went to sleep, or the terminal running the dashboard was closed. If the dashboard was restarted (but not the Mac put to sleep) before the scheduled time, it should have re-armed automatically from `scheduled.json`.

**"Setup incomplete" error, or the Run check button is disabled.**
Open Settings and check the ✓/✗ next to each field. `config.json` (written by Settings) takes precedence over the `SF_CLI_PATH`/`SF_CONFIG_PATH`/`SF_PAGES_CONFIG_PATH` env vars, which take precedence over the built-in default CLI path — so if you've set both, the dashboard values win. "Whole site" mode only needs the CLI path and whole-site config; "Specific pages" mode additionally needs the specific-pages config.

**A target parses to 0 issues, or `run-crawl.sh` warns "no CSV files were exported".**
Screaming Frog's `--export-tabs` and `--bulk-export` names must exactly match your installed version's names — a mismatch fails silently (the crawl completes, that one export just doesn't happen). Run:
```bash
"$SF_CLI_PATH" --help export-tabs
"$SF_CLI_PATH" --help bulk-export
```
and compare against the `SF_EXPORT_TABS` (`Response Codes:All`) and `SF_BULK_EXPORTS` (`Accessibility:All Violations,Images:Images Missing Alt Attribute & Text Inlinks`) defaults in `scripts/run-crawl.sh`. Override with `export SF_EXPORT_TABS="..."` / `export SF_BULK_EXPORTS="..."` if your version names them differently.

Note it's specifically the **bulk exports**, not the `Accessibility:All` / `Images:All` tab exports, that carry per-issue detail (issue name, element, severity for accessibility; the containing page for missing-alt images) — the tab exports only have per-page violation counts and, for Images, no alt-text column at all. This was verified against a real install's actual CSV output, not just `--help` text, after the tab-export approach turned out to silently produce zero accessibility issues.

**A target parses issues but they land in the wrong category, or column values look empty.**
`scripts/parse-report.js` classifies each CSV row by which columns it has (`Issue` + `Location on Page`, `Source` + `Destination`, `Status Code` + `Address`) rather than by filename, since export filenames also vary by version. Open one of the actual CSVs under `runs/<timestamp>/raw/<slug>/` and check the header row matches what `parse-report.js` expects (`Address`, `Status Code`, `Status`, `Source`, `Destination`, `Alt Text`, `Issue`, `User Impact`, `Location on Page`) — adjust the column names in that file if your version uses different ones.

## Extending

- **Slack (or any other) delivery**: `generate-report.js` reads `diffed.json` and nothing upstream of it. A `scripts/notify-slack.js` reading the same file can be added without touching the crawl/parse/aggregate/diff steps.
- **Mapping broken links back to the pages that link to them**: missing-alt images already map back to their containing page (via the Images Missing Alt Attribute & Text Inlinks bulk export's `Source` column). Broken links still report the broken URL itself as the "affected URL", not the page(s) linking to it — Screaming Frog's Response Codes inlinks bulk exports could add that the same way, once you've confirmed the exact bulk-export name for your installed version.
