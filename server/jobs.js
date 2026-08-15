import crypto from 'node:crypto';
import { siteCheck } from '../scripts/site-check.js';

const jobs = new Map();
const queue = [];
let active = null;

// Domain mode gets one job per URL, so the existing single-active-job queue
// runs them one after another and each finishes into its own report as soon
// as it's done, instead of waiting on a single combined run. Pages mode is
// one list tracked as one thing, so it stays a single job.
export function enqueueBatch({ mode = 'domain', label, urls }) {
  if (mode === 'pages') {
    return [enqueueCheck(urls, { mode, label }).id];
  }
  return urls.map((url) => enqueueCheck([url], { mode: 'domain' }).id);
}

export function enqueueCheck(urls, { mode = 'domain', label } = {}) {
  const job = {
    id: crypto.randomUUID(),
    urls,
    mode,
    label,
    status: 'queued',
    events: [],
    result: null,
    error: null,
    subscribers: new Set(),
  };
  jobs.set(job.id, job);
  queue.push(job.id);
  processQueue();
  return job;
}

function processQueue() {
  if (active || queue.length === 0) return;

  const jobId = queue.shift();
  const job = jobs.get(jobId);
  active = job;
  job.status = 'running';
  emit(job, 'queue', 'Started.');

  siteCheck(job.urls, { mode: job.mode, label: job.label, onProgress: (stage, message) => emit(job, stage, message) })
    .then((result) => {
      job.status = 'done';
      job.result = result;
      emit(job, 'done', `Run complete: ${result.runDir}`);
    })
    .catch((err) => {
      job.status = 'failed';
      job.error = err.message;
      emit(job, 'error', err.message);
    })
    .finally(() => {
      active = null;
      processQueue();
    });
}

function emit(job, stage, message) {
  const event = { stage, message, status: job.status, ts: new Date().toISOString() };
  job.events.push(event);

  for (const res of job.subscribers) {
    writeEvent(res, event);
  }

  if (job.status === 'done' || job.status === 'failed') {
    for (const res of job.subscribers) res.end();
    job.subscribers.clear();
  }
}

function writeEvent(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function getJob(id) {
  return jobs.get(id);
}

export function subscribe(id, res) {
  const job = jobs.get(id);
  if (!job) return false;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  for (const event of job.events) writeEvent(res, event);

  if (job.status === 'done' || job.status === 'failed') {
    res.end();
    return true;
  }

  job.subscribers.add(res);
  res.on('close', () => job.subscribers.delete(res));
  return true;
}
