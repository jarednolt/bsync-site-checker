import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from '../lib/runs.js';

const SEVERITY_RANK = { critical: 0, warning: 1, notice: 2 };

export function aggregateIssues(issues) {
  const groups = new Map();

  for (const issue of issues) {
    const key = groupKey(issue);
    if (!groups.has(key)) {
      groups.set(key, {
        target: issue.target,
        category: issue.category,
        rule: issue.rule,
        detail: issue.detail,
        severity: issue.severity,
        count: 0,
        affectedUrls: new Set(),
      });
    }
    const group = groups.get(key);
    group.count += 1;
    if (issue.url) group.affectedUrls.add(issue.url);
  }

  return [...groups.values()]
    .map((group) => {
      const affectedUrls = [...group.affectedUrls].sort();
      return { ...group, affectedUrls, pageCount: affectedUrls.length };
    })
    .sort((a, b) => {
      if (a.target !== b.target) return a.target < b.target ? -1 : 1;
      const severityDiff = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
      if (severityDiff !== 0) return severityDiff;
      return b.count - a.count;
    });
}

function groupKey(issue) {
  return [issue.target, issue.category, issue.rule].join('|');
}

export function run(runDir) {
  const issues = readJson(path.join(runDir, 'issues.json'), []);
  const aggregate = aggregateIssues(issues);
  writeJson(path.join(runDir, 'aggregate.json'), aggregate);
  return aggregate;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node scripts/aggregate.js <run-dir>');
    process.exit(1);
  }
  const aggregate = run(runDir);
  console.log(`Aggregated into ${aggregate.length} distinct issue group(s).`);
}
