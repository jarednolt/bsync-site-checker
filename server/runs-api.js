import { Router } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { RUNS_ROOT, listRunTimestamps, readJson } from '../lib/runs.js';
import { enqueueBatch, subscribe } from './jobs.js';

const TIMESTAMP_RE = /^[A-Za-z0-9_-]+$/;

export const router = Router();

router.get('/runs', (req, res) => {
  const timestamps = listRunTimestamps().reverse();
  const runs = timestamps.map((ts) => {
    const manifest = readJson(path.join(RUNS_ROOT, ts, 'manifest.json'), { targets: [] });
    // A run whose diffed.json never got written means the job failed before
    // reaching the report stage (e.g. the crawl itself errored) — distinct
    // from a run that completed and genuinely found zero issues.
    const incomplete = !existsSync(path.join(RUNS_ROOT, ts, 'diffed.json'));
    const diffed = incomplete ? [] : readJson(path.join(RUNS_ROOT, ts, 'diffed.json'), []);
    return { timestamp: ts, targets: manifest.targets, counts: summarize(diffed), incomplete };
  });
  res.json(runs);
});

router.get('/runs/:timestamp', (req, res) => {
  const ts = req.params.timestamp;
  if (!TIMESTAMP_RE.test(ts)) return res.status(400).json({ error: 'Invalid run timestamp.' });

  const manifest = readJson(path.join(RUNS_ROOT, ts, 'manifest.json'), null);
  if (!manifest) return res.status(404).json({ error: 'Run not found.' });

  const diffed = readJson(path.join(RUNS_ROOT, ts, 'diffed.json'), []);
  res.json({ timestamp: ts, targets: manifest.targets, issues: diffed, counts: summarize(diffed) });
});

router.get('/runs/:timestamp/report.csv', (req, res) => {
  const ts = req.params.timestamp;
  if (!TIMESTAMP_RE.test(ts)) return res.status(400).send('Invalid run timestamp.');

  const csvPath = path.join(RUNS_ROOT, ts, 'report.csv');
  res.download(csvPath, `site-check-${ts}.csv`, (err) => {
    if (err && !res.headersSent) res.status(404).send('Report not found.');
  });
});

router.get('/trends', (req, res) => {
  const target = req.query.target;
  if (!target) return res.status(400).json({ error: 'target query param is required.' });

  const series = [];
  for (const ts of listRunTimestamps()) {
    const manifest = readJson(path.join(RUNS_ROOT, ts, 'manifest.json'), null);
    if (!manifest || !manifest.targets.includes(target)) continue;

    const aggregate = readJson(path.join(RUNS_ROOT, ts, 'aggregate.json'), []);
    const counts = {};
    for (const group of aggregate) {
      if (group.target !== target) continue;
      counts[group.category] = (counts[group.category] || 0) + group.count;
    }
    series.push({ timestamp: ts, counts });
  }
  res.json(series);
});

router.post('/checks', (req, res) => {
  const mode = req.body?.mode === 'pages' ? 'pages' : 'domain';
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  const urls = Array.isArray(req.body?.urls)
    ? req.body.urls.filter((u) => typeof u === 'string' && u.trim())
    : [];

  if (urls.length === 0) return res.status(400).json({ error: 'Provide at least one URL.' });
  if (mode === 'pages' && !label) return res.status(400).json({ error: 'Specific-pages mode needs a label for the list.' });

  const jobIds = enqueueBatch({ mode, label, urls });
  res.status(202).json({ jobIds, mode });
});

router.get('/checks/:jobId/events', (req, res) => {
  const found = subscribe(req.params.jobId, res);
  if (!found) res.status(404).end();
});

function summarize(diffed) {
  return diffed.reduce(
    (acc, g) => {
      acc[g.status] = (acc[g.status] || 0) + 1;
      return acc;
    },
    { new: 0, persisting: 0, resolved: 0 }
  );
}
