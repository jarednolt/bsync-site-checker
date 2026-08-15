import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeText } from '../lib/runs.js';
import { toCsv } from '../lib/csv.js';

const CSV_COLUMNS = [
  { key: 'target', header: 'Target' },
  { key: 'category', header: 'Category' },
  { key: 'rule', header: 'Rule' },
  { key: 'severity', header: 'Severity' },
  { key: 'status', header: 'Status' },
  { key: 'count', header: 'Count' },
  { key: 'pageCount', header: 'Pages Affected' },
  { key: 'detail', header: 'Detail' },
  { key: 'affectedUrls', header: 'Affected URLs' },
];

const STATUS_RANK = { new: 0, persisting: 1, resolved: 2 };

export function buildCsv(diffed) {
  return toCsv(diffed, CSV_COLUMNS);
}

export function buildHtml(diffed, { timestamp } = {}) {
  const targets = [...new Set(diffed.map((g) => g.target))].sort();
  const totals = diffed.reduce(
    (acc, g) => {
      acc[g.status] = (acc[g.status] || 0) + 1;
      return acc;
    },
    {}
  );

  const sections = targets.map((target) => renderTargetSection(target, diffed.filter((g) => g.target === target))).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Site Check Report</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #666666; --border: #e0e0e0;
    --card: #f7f7f8; --new: #b42318; --persisting: #b54708; --resolved: #067647;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #14161a; --fg: #e8e8e8; --muted: #9a9a9a; --border: #2c2f36; --card: #1c1f26; }
  }
  body { background: var(--bg); color: var(--fg); font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 2rem; }
  h1 { margin-bottom: 0.25rem; }
  .meta { color: var(--muted); margin-bottom: 1.5rem; }
  .totals { display: flex; gap: 1rem; margin-bottom: 2rem; }
  .totals span { padding: 0.4rem 0.8rem; border-radius: 6px; background: var(--card); border: 1px solid var(--border); }
  h2 { border-bottom: 1px solid var(--border); padding-bottom: 0.4rem; margin-top: 2.5rem; }
  h3 { margin-top: 1.5rem; text-transform: capitalize; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; font-size: 0.85rem; }
  .status-new { color: var(--new); font-weight: 600; }
  .status-persisting { color: var(--persisting); }
  .status-resolved { color: var(--resolved); }
  .count { font-weight: 600; }
  details summary { cursor: pointer; color: var(--muted); }
  code { font-size: 0.85rem; word-break: break-all; }
</style>
</head>
<body>
  <h1>Site Check Report</h1>
  <div class="meta">Run: ${escapeHtml(timestamp || '')}</div>
  <div class="totals">
    <span class="status-new">${totals.new || 0} new</span>
    <span class="status-persisting">${totals.persisting || 0} persisting</span>
    <span class="status-resolved">${totals.resolved || 0} resolved</span>
  </div>
  ${sections}
</body>
</html>
`;
}

function renderTargetSection(target, groups) {
  const byCategory = new Map();
  for (const g of groups) {
    if (!byCategory.has(g.category)) byCategory.set(g.category, []);
    byCategory.get(g.category).push(g);
  }

  const categorySections = [...byCategory.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([category, rows]) => renderCategoryTable(category, rows))
    .join('\n');

  return `<h2>${escapeHtml(target)}</h2>\n${categorySections}`;
}

function renderCategoryTable(category, rows) {
  const sorted = [...rows].sort((a, b) => {
    const statusDiff = (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3);
    if (statusDiff !== 0) return statusDiff;
    return b.count - a.count;
  });

  const body = sorted.map((g) => `
    <tr>
      <td class="status-${g.status}">${g.status}</td>
      <td>${escapeHtml(g.detail)}</td>
      <td class="count">${g.count}${g.previousCount != null && g.previousCount !== g.count ? ` <span title="previous count">(was ${g.previousCount})</span>` : ''}</td>
      <td>${g.pageCount ?? g.affectedUrls?.length ?? 0}</td>
      <td><details><summary>view</summary>${(g.affectedUrls || []).map((u) => `<code>${escapeHtml(u)}</code>`).join('<br/>')}</details></td>
    </tr>`).join('');

  return `<h3>${escapeHtml(category)}</h3>
  <table>
    <thead><tr><th>Status</th><th>Issue</th><th>Count</th><th>Pages</th><th>Affected URLs</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function run(runDir) {
  const timestamp = path.basename(runDir);
  const diffed = readJson(path.join(runDir, 'diffed.json'), []);
  const html = buildHtml(diffed, { timestamp });
  const csv = buildCsv(diffed);
  writeText(path.join(runDir, 'report.html'), html);
  writeText(path.join(runDir, 'report.csv'), csv);
  return { htmlPath: path.join(runDir, 'report.html'), csvPath: path.join(runDir, 'report.csv') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node scripts/generate-report.js <run-dir>');
    process.exit(1);
  }
  const { htmlPath, csvPath } = run(runDir);
  console.log(`Wrote ${htmlPath}`);
  console.log(`Wrote ${csvPath}`);
}
