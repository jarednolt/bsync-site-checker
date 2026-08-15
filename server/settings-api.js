import { Router } from 'express';
import { getStatus, writeConfig } from '../lib/config.js';

export const router = Router();

router.get('/settings', (req, res) => {
  res.json(getStatus());
});

router.post('/settings', (req, res) => {
  const { sfCliPath, sfConfigPath, sfPagesConfigPath } = req.body || {};
  const update = {};
  if (typeof sfCliPath === 'string') update.sfCliPath = sfCliPath.trim();
  if (typeof sfConfigPath === 'string') update.sfConfigPath = sfConfigPath.trim();
  if (typeof sfPagesConfigPath === 'string') update.sfPagesConfigPath = sfPagesConfigPath.trim();
  writeConfig(update);
  res.json(getStatus());
});
