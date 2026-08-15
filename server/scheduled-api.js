import { Router } from 'express';
import { cancelScheduled, listScheduled, scheduleBatch } from './scheduler.js';

export const router = Router();

router.get('/scheduled', (req, res) => {
  res.json(listScheduled());
});

router.post('/scheduled', (req, res) => {
  const mode = req.body?.mode === 'pages' ? 'pages' : 'domain';
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
  const urls = Array.isArray(req.body?.urls)
    ? req.body.urls.filter((u) => typeof u === 'string' && u.trim())
    : [];
  const runAt = req.body?.runAt;

  if (urls.length === 0) return res.status(400).json({ error: 'Provide at least one URL.' });
  if (mode === 'pages' && !label) return res.status(400).json({ error: 'Specific-pages mode needs a label for the list.' });
  if (!runAt) return res.status(400).json({ error: 'runAt is required.' });

  try {
    const entry = scheduleBatch({ mode, label, urls, runAt });
    res.status(201).json(entry);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/scheduled/:id', (req, res) => {
  const cancelled = cancelScheduled(req.params.id);
  if (!cancelled) return res.status(404).json({ error: 'Not found.' });
  res.status(204).end();
});
