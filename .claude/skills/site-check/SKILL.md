---
name: site-check
description: Run the Screaming Frog-backed accessibility/link/alt-text checker against one or more URLs and summarize the results. Use when the user asks to check, audit, or crawl a site (dev or production) for broken links, ARIA/roles, alt text, or color contrast.
---

# Site check

Runs the crawl → parse → aggregate → diff → report pipeline in this repo against one or more target URLs, then summarizes the result and offers to publish the HTML report.

## Steps

1. Confirm the target URL(s) with the user if not already given in their message. Multiple URLs are supported in one run.
2. Confirm `SF_CONFIG_PATH` is set (see [README.md](../../../README.md) "Screaming Frog setup" if not — this is a one-time step done once in the Screaming Frog GUI, not something to redo per run).
3. Run:
   ```bash
   node scripts/site-check.js <url1> [url2] [url3...]
   ```
4. Read the printed summary (new/persisting/resolved counts and the run directory path).
5. Report back to the user in plain language: how many new issues, how many persisting, how many resolved, broken out by category (broken links, alt text, ARIA, contrast) — pull the breakdown from `<run-dir>/aggregate.json` or `<run-dir>/diffed.json` if the terminal summary isn't detailed enough.
6. Point out the CSV path (`<run-dir>/report.csv`) as a local file for opening in a spreadsheet.
7. Ask whether they want the HTML report (`<run-dir>/report.html`) published as a shareable Artifact link. Only publish if they say yes — do not publish automatically, since the crawl target may be production and the report may be worth keeping private.

## Notes

- This is read-only against the target site (crawling + reporting). No production writes happen. Still, mention to the user before crawling production that Screaming Frog will be making requests against the live site.
- If the run reports 0 issues parsed for a target, or a warning about missing CSVs, the likely cause is a Screaming Frog export-tab name mismatch for their installed version — see the comment at the top of `scripts/run-crawl.sh` and the README troubleshooting section.
- If the user wants a different destination for results (e.g., Slack) instead of or in addition to HTML/CSV, that's a deliberate future extension point (`scripts/generate-report.js` output is derived from `<run-dir>/diffed.json`, which any new delivery script can also read) — don't build it speculatively, just note it's straightforward to add when asked.
