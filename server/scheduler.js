import crypto from 'node:crypto';
import path from 'node:path';
import { readJson, writeJson } from '../lib/runs.js';
import { enqueueBatch } from './jobs.js';

const SCHEDULED_PATH = path.join(process.cwd(), 'scheduled.json');

const scheduled = new Map();
const timers = new Map();

function persist() {
  writeJson(SCHEDULED_PATH, [...scheduled.values()]);
}

export function scheduleBatch({ mode = 'domain', label, urls, runAt }) {
  const runAtMs = Date.parse(runAt);
  if (!Number.isFinite(runAtMs)) {
    throw new Error('runAt must be a valid date/time.');
  }

  const entry = {
    id: crypto.randomUUID(),
    mode,
    label: label || null,
    urls,
    runAt: new Date(runAtMs).toISOString(),
  };

  scheduled.set(entry.id, entry);
  persist();
  arm(entry);
  return entry;
}

export function listScheduled() {
  return [...scheduled.values()].sort((a, b) => (a.runAt < b.runAt ? -1 : 1));
}

export function cancelScheduled(id) {
  if (!scheduled.has(id)) return false;
  clearTimeout(timers.get(id));
  timers.delete(id);
  scheduled.delete(id);
  persist();
  return true;
}

function fire(entry) {
  timers.delete(entry.id);
  scheduled.delete(entry.id);
  persist();
  enqueueBatch({ mode: entry.mode, label: entry.label, urls: entry.urls });
}

function arm(entry) {
  const delay = Math.max(0, Date.parse(entry.runAt) - Date.now());
  const timer = setTimeout(() => fire(entry), delay);
  timers.set(entry.id, timer);
}

// Called once at server startup: re-arms anything still in the future, and
// immediately fires anything whose time already passed while the dashboard
// wasn't running (this only survives a restart — it can't survive the Mac
// being asleep or the process being killed with nothing to resume it).
export function initScheduler() {
  const persisted = readJson(SCHEDULED_PATH, []);
  for (const entry of persisted) {
    scheduled.set(entry.id, entry);
    arm(entry);
  }
}
