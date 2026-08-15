import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, findPreviousAggregate } from '../lib/runs.js';

function groupKey(g) {
  return [g.target, g.category, g.rule].join('|');
}

// `targets` must be every target checked in this run (from manifest.json),
// not just the targets that show up in currentAggregate — a target with
// zero current issues still needs its prior issues marked "resolved".
export function diffAggregate(currentAggregate, targets, timestamp) {
  const result = [];

  for (const target of targets) {
    const current = currentAggregate.filter((g) => g.target === target);
    const previous = findPreviousAggregate(target, timestamp);
    const previousMap = new Map(previous.map((g) => [groupKey(g), g]));
    const currentKeys = new Set(current.map(groupKey));

    for (const group of current) {
      const prev = previousMap.get(groupKey(group));
      result.push({
        ...group,
        status: prev ? 'persisting' : 'new',
        previousCount: prev ? prev.count : null,
      });
    }

    for (const group of previous) {
      if (!currentKeys.has(groupKey(group))) {
        result.push({ ...group, status: 'resolved', previousCount: group.count });
      }
    }
  }

  return result;
}

export function run(runDir) {
  const timestamp = path.basename(runDir);
  const manifest = readJson(path.join(runDir, 'manifest.json'), null);
  const aggregate = readJson(path.join(runDir, 'aggregate.json'), []);
  const targets = manifest ? manifest.targets : [...new Set(aggregate.map((g) => g.target))];
  const diffed = diffAggregate(aggregate, targets, timestamp);
  writeJson(path.join(runDir, 'diffed.json'), diffed);
  return diffed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node scripts/diff-runs.js <run-dir>');
    process.exit(1);
  }
  const diffed = run(runDir);
  const counts = diffed.reduce((acc, g) => {
    acc[g.status] = (acc[g.status] || 0) + 1;
    return acc;
  }, {});
  console.log(`Diff: ${counts.new || 0} new, ${counts.persisting || 0} persisting, ${counts.resolved || 0} resolved.`);
}
