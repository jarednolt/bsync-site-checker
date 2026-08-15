#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNS_ROOT, ensureDir, writeJson } from '../lib/runs.js';
import { getStatus } from '../lib/config.js';
import { run as parseRun } from './parse-report.js';
import { run as aggregateRun } from './aggregate.js';
import { run as diffRun } from './diff-runs.js';
import { run as reportRun } from './generate-report.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runCrawl(runDir, mode, label, urls, onProgress, settings) {
  const args = mode === 'pages'
    ? [runDir, 'pages', label, ...urls]
    : [runDir, 'domain', ...urls];

  return new Promise((resolve, reject) => {
    const child = spawn(path.join(SCRIPT_DIR, 'run-crawl.sh'), args, {
      env: {
        ...process.env,
        SF_CLI_PATH: settings.sfCliPath,
        SF_CONFIG_PATH: settings.sfConfigPath,
        SF_PAGES_CONFIG_PATH: settings.sfPagesConfigPath,
      },
    });

    const forwardLines = (chunk) => {
      chunk.toString('utf8').split('\n').filter(Boolean).forEach((line) => onProgress('crawl', line));
    };
    child.stdout.on('data', forwardLines);
    child.stderr.on('data', forwardLines);

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`run-crawl.sh exited with code ${code}`));
    });
  });
}

export async function siteCheck(urls, { onProgress = () => {}, mode = 'domain', label } = {}) {
  if (!urls || urls.length === 0) {
    throw new Error('Provide at least one target URL.');
  }
  if (mode === 'pages' && !label) {
    throw new Error('Pages mode requires a label to track the list under.');
  }

  const status = getStatus();
  const ready = mode === 'pages' ? status.pagesReady : status.ready;
  if (!ready) {
    const problems = [];
    if (!status.sfCli.exists) problems.push(`Screaming Frog CLI not found at ${status.sfCli.value}`);
    else if (!status.sfCli.executable) problems.push(`Screaming Frog CLI at ${status.sfCli.value} is not executable`);
    if (mode === 'pages') {
      if (!status.sfPagesConfig.value) problems.push('no specific-pages crawl config path is set');
      else if (!status.sfPagesConfig.exists) problems.push(`specific-pages crawl config not found at ${status.sfPagesConfig.value}`);
    } else {
      if (!status.sfConfig.value) problems.push('no crawl config path is set');
      else if (!status.sfConfig.exists) problems.push(`crawl config not found at ${status.sfConfig.value}`);
    }
    throw new Error(`Setup incomplete (${problems.join('; ')}). Open Settings to fix this.`);
  }

  const ts = timestamp();
  const runDir = path.join(RUNS_ROOT, ts);
  const targets = mode === 'pages' ? [label] : urls;
  ensureDir(runDir);
  writeJson(path.join(runDir, 'manifest.json'), { timestamp: ts, targets });

  onProgress('crawl', mode === 'pages'
    ? `Checking ${urls.length} specific page(s) as "${label}"...`
    : `Crawling ${urls.length} target(s)...`);
  await runCrawl(runDir, mode, label, urls, onProgress, status.settings);

  onProgress('parse', 'Parsing Screaming Frog exports...');
  parseRun(runDir);

  onProgress('aggregate', 'Aggregating repeated issues...');
  aggregateRun(runDir);

  onProgress('diff', 'Diffing against the previous run...');
  const diffed = diffRun(runDir);

  onProgress('report', 'Generating report.html and report.csv...');
  const { htmlPath, csvPath } = reportRun(runDir);

  const counts = diffed.reduce((acc, g) => {
    acc[g.status] = (acc[g.status] || 0) + 1;
    return acc;
  }, {});

  onProgress('done', `Done. ${counts.new || 0} new, ${counts.persisting || 0} persisting, ${counts.resolved || 0} resolved.`);

  return { runDir, timestamp: ts, htmlPath, csvPath, counts, diffed };
}

function parseCliArgs(argv) {
  let mode = 'domain';
  let label;
  const urls = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mode') {
      mode = argv[++i];
    } else if (argv[i] === '--label') {
      label = argv[++i];
    } else {
      urls.push(argv[i]);
    }
  }

  return { mode, label, urls };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { mode, label, urls } = parseCliArgs(process.argv.slice(2));
  siteCheck(urls, { mode, label, onProgress: (stage, message) => console.log(`[${stage}] ${message}`) })
    .then(({ runDir, htmlPath, csvPath, counts }) => {
      console.log('');
      console.log(`Run directory: ${runDir}`);
      console.log(`New: ${counts.new || 0}  Persisting: ${counts.persisting || 0}  Resolved: ${counts.resolved || 0}`);
      console.log(`HTML report: ${htmlPath}`);
      console.log(`CSV report:  ${csvPath}`);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
