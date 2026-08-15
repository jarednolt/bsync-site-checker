import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const RUNS_ROOT = path.join(process.cwd(), 'runs');

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, text, 'utf8');
}

export function urlToSlug(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[/:?#]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function listRunTimestamps() {
  if (!existsSync(RUNS_ROOT)) return [];
  return readdirSync(RUNS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Finds the most recent aggregate.json entries for a given target from the
 * closest prior run that actually checked that target (per manifest.json),
 * so a genuinely clean previous run (zero issues) is distinguished from a
 * run that never covered this target. Returns [] if no prior run checked it.
 */
export function findPreviousAggregate(target, beforeTimestamp) {
  const timestamps = listRunTimestamps().filter((ts) => ts < beforeTimestamp).reverse();
  for (const ts of timestamps) {
    const manifest = readJson(path.join(RUNS_ROOT, ts, 'manifest.json'), null);
    if (!manifest || !manifest.targets.includes(target)) continue;
    const aggregate = readJson(path.join(RUNS_ROOT, ts, 'aggregate.json'), []);
    return aggregate.filter((group) => group.target === target);
  }
  return [];
}
