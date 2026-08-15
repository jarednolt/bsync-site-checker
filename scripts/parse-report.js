import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from '../lib/csv.js';
import { writeJson } from '../lib/runs.js';

// SF's exported CSVs are classified by which columns they contain rather than
// by filename, since exact export filenames vary by Screaming Frog version.
// If a target's CSVs parse to zero issues, check the actual column headers
// in <run-dir>/raw/<target>/*.csv and adjust the column names referenced
// below (get/has calls) to match.
//
// Column names below are verified against a real Screaming Frog v24 install's
// actual CSV output (not just --help text) for the exports run-crawl.sh asks
// for: "Response Codes:All" (tab export) and "Accessibility:All Violations" /
// "Images:Images Missing Alt Attribute & Text Inlinks" (bulk exports). The
// Accessibility:All / Images:All *tab* exports were tried first and don't
// work — they only carry per-page violation counts and have no Alt Text
// column at all, with no per-instance issue/element/severity detail.

const IMPACT_TO_SEVERITY = {
  critical: 'critical',
  serious: 'critical',
  moderate: 'warning',
  minor: 'notice',
};

export function parseRun(runDir) {
  const rawDir = path.join(runDir, 'raw');
  if (!existsSync(rawDir)) {
    throw new Error(`No raw crawl data found at ${rawDir}. Run run-crawl.sh first.`);
  }

  const issues = [];
  const targets = [];

  for (const entry of readdirSync(rawDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const targetDir = path.join(rawDir, entry.name);
    const targetUrlFile = path.join(targetDir, '.target-url');
    const target = existsSync(targetUrlFile)
      ? readFileSync(targetUrlFile, 'utf8').trim()
      : entry.name;
    targets.push(target);

    const csvFiles = readdirSync(targetDir).filter((f) => f.toLowerCase().endsWith('.csv'));
    for (const file of csvFiles) {
      const records = parseCsv(readFileSync(path.join(targetDir, file), 'utf8'));
      for (const record of records) {
        issues.push(...classifyRecord(target, record));
      }
    }
  }

  return { issues, targets };
}

function classifyRecord(target, record) {
  if (has(record, 'Issue') && has(record, 'Location on Page')) return classifyAccessibility(target, record);
  if (has(record, 'Source') && has(record, 'Destination')) return classifyImage(target, record);
  if (has(record, 'Status Code') && has(record, 'Address')) return classifyResponseCode(target, record);
  return [];
}

function classifyResponseCode(target, record) {
  const statusCode = Number(get(record, 'Status Code'));
  if (!Number.isFinite(statusCode) || statusCode < 400) return [];
  const pageUrl = get(record, 'Address');
  const statusText = get(record, 'Status') || String(statusCode);
  return [{
    target,
    url: pageUrl,
    category: 'broken-link',
    severity: 'critical',
    rule: `broken-link:${statusCode}`,
    detail: `Returns ${statusCode} ${statusText}`,
  }];
}

function classifyImage(target, record) {
  // From an "Images Missing Alt ... Inlinks" bulk export: Source is the page
  // embedding the image, Destination is the image itself. Alt Text should
  // already be empty by definition of that export, but check anyway in case
  // SF_BULK_EXPORTS is pointed at the unfiltered "All Image Inlinks" export.
  const altText = get(record, 'Alt Text');
  if (altText) return [];
  const pageUrl = get(record, 'Source');
  const imageUrl = get(record, 'Destination');
  return [{
    target,
    url: pageUrl,
    category: 'alt-text',
    severity: 'warning',
    rule: 'alt-text:missing',
    detail: `Image ${imageUrl} has no alt text`,
  }];
}

function classifyAccessibility(target, record) {
  // From the "Accessibility:All Violations" bulk export.
  const pageUrl = get(record, 'Address');
  const issueText = get(record, 'Issue') || 'Accessibility issue';
  const impact = (get(record, 'User Impact') || '').toLowerCase();
  const severity = IMPACT_TO_SEVERITY[impact] || 'warning';
  const category = classifyIssueCategory(issueText);
  return [{
    target,
    url: pageUrl,
    category,
    severity,
    rule: `${category}:${slugify(issueText)}`,
    detail: issueText,
  }];
}

function classifyIssueCategory(issueText) {
  const text = issueText.toLowerCase();
  if (text.includes('contrast')) return 'contrast';
  if (text.includes('aria') || text.includes('role') || text.includes('landmark') || text.includes('region')) return 'aria';
  if (text.includes('alt text') || text.includes('alt attribute')) return 'alt-text';
  return 'accessibility-other';
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function get(record, name) {
  const key = Object.keys(record).find((k) => k.trim().toLowerCase() === name.toLowerCase());
  const value = key ? record[key] : undefined;
  return value === undefined ? undefined : value.trim();
}

function has(record, name) {
  return Object.keys(record).some((k) => k.trim().toLowerCase() === name.toLowerCase());
}

export function run(runDir) {
  const { issues, targets } = parseRun(runDir);
  writeJson(path.join(runDir, 'issues.json'), issues);
  return { issues, targets };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node scripts/parse-report.js <run-dir>');
    process.exit(1);
  }
  const { issues, targets } = run(runDir);
  console.log(`Parsed ${issues.length} issue instances across ${targets.length} target(s).`);
}
