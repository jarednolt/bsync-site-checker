const runListEl = document.getElementById('run-list');
const trendTargetEl = document.getElementById('trend-target');
const trendChartsEl = document.getElementById('trend-charts');
const checkForm = document.getElementById('check-form');
const urlsInput = document.getElementById('urls-input');
const labelField = document.getElementById('label-field');
const pagesLabelInput = document.getElementById('pages-label');
const scheduleAtInput = document.getElementById('schedule-at');
const checkFormError = document.getElementById('check-form-error');
const progressPanel = document.getElementById('progress-panel');
const progressJobsEl = document.getElementById('progress-jobs');
const scheduledSection = document.getElementById('scheduled-section');
const scheduledList = document.getElementById('scheduled-list');
const detailSection = document.getElementById('detail-section');
const detailTitle = document.getElementById('detail-title');
const filterCategory = document.getElementById('filter-category');
const filterStatus = document.getElementById('filter-status');
const filterSearch = document.getElementById('filter-search');
const downloadCsv = document.getElementById('download-csv');
const issuesTableBody = document.querySelector('#issues-table tbody');
const issuesEmpty = document.getElementById('issues-empty');
const backToHistory = document.getElementById('back-to-history');
const setupBanner = document.getElementById('setup-banner');
const setupBannerText = document.getElementById('setup-banner-text');
const settingsDialog = document.getElementById('settings-dialog');
const settingsForm = document.getElementById('settings-form');
const settingsSfCli = document.getElementById('settings-sf-cli');
const settingsSfConfig = document.getElementById('settings-sf-config');
const settingsSfPagesConfig = document.getElementById('settings-sf-pages-config');

let currentIssues = [];
let activeEventSources = [];
let setupReady = false;
let pagesReady = false;
let checkRunning = false;

init();

function init() {
  loadRuns();
  loadScheduled();
  refreshSettingsStatus();
  checkForm.addEventListener('submit', onSubmitCheck);
  backToHistory.addEventListener('click', () => { detailSection.hidden = true; });
  filterCategory.addEventListener('change', renderIssuesTable);
  filterStatus.addEventListener('change', renderIssuesTable);
  filterSearch.addEventListener('input', renderIssuesTable);
  trendTargetEl.addEventListener('change', () => loadTrends(trendTargetEl.value));

  document.querySelectorAll('input[name="check-mode"]').forEach((r) => r.addEventListener('change', applyModeVisibility));
  document.querySelectorAll('input[name="check-when"]').forEach((r) => r.addEventListener('change', applyWhenVisibility));

  document.getElementById('open-settings').addEventListener('click', () => settingsDialog.showModal());
  document.getElementById('open-settings-from-banner').addEventListener('click', () => settingsDialog.showModal());
  document.getElementById('settings-cancel').addEventListener('click', () => settingsDialog.close());
  settingsForm.addEventListener('submit', onSaveSettings);
}

function applyModeVisibility() {
  const mode = document.querySelector('input[name="check-mode"]:checked').value;
  labelField.hidden = mode !== 'pages';
  updateRunButtonState();
}

function applyWhenVisibility() {
  const when = document.querySelector('input[name="check-when"]:checked').value;
  scheduleAtInput.hidden = when !== 'later';
}

async function refreshSettingsStatus() {
  const status = await fetchJson('/api/settings');
  setupReady = status.ready;
  pagesReady = status.pagesReady;
  updateRunButtonState();

  setupBanner.hidden = status.ready;
  if (!status.ready) {
    setupBannerText.textContent = "Screaming Frog isn't fully configured yet — set it up in Settings before running a check.";
  }

  settingsSfCli.value = status.settings.sfCliPath || '';
  settingsSfConfig.value = status.settings.sfConfigPath || '';
  settingsSfPagesConfig.value = status.settings.sfPagesConfigPath || '';
  setFieldStatus('settings-sf-cli-status', status.sfCli.exists && status.sfCli.executable,
    !status.sfCli.exists ? 'not found' : !status.sfCli.executable ? 'not executable' : 'found');
  setFieldStatus('settings-sf-config-status', status.sfConfig.exists, status.sfConfig.exists ? 'found' : 'not found');
  setFieldStatus('settings-sf-pages-config-status', status.sfPagesConfig.exists, status.sfPagesConfig.exists ? 'found' : 'not found');

  return status;
}

function setFieldStatus(elId, ok, label) {
  const el = document.getElementById(elId);
  el.textContent = ok ? `✓ ${label}` : `✗ ${label}`;
  el.className = 'field-status ' + (ok ? 'ok' : 'bad');
}

async function onSaveSettings(event) {
  event.preventDefault();
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sfCliPath: settingsSfCli.value.trim(),
      sfConfigPath: settingsSfConfig.value.trim(),
      sfPagesConfigPath: settingsSfPagesConfig.value.trim(),
    }),
  });
  await refreshSettingsStatus();
}

function currentModeReady() {
  const mode = document.querySelector('input[name="check-mode"]:checked').value;
  return mode === 'pages' ? pagesReady : setupReady;
}

function updateRunButtonState() {
  const button = checkForm.querySelector('button');
  const ready = currentModeReady();
  button.disabled = !ready || checkRunning;
  button.title = !ready ? 'Configure Screaming Frog in Settings before running a check.' : '';
}

async function loadRuns() {
  const runs = await fetchJson('/api/runs');
  renderRunList(runs);
  populateTrendTargets(runs);
}

function renderRunList(runs) {
  if (runs.length === 0) {
    runListEl.innerHTML = '<li class="empty">No runs yet.</li>';
    return;
  }

  runListEl.innerHTML = '';
  for (const run of runs) {
    const li = document.createElement('li');
    const badges = run.incomplete
      ? '<span class="badge incomplete">failed / incomplete</span>'
      : `
        <span class="badge new">${run.counts.new} new</span>
        <span class="badge persisting">${run.counts.persisting} persisting</span>
        <span class="badge resolved">${run.counts.resolved} resolved</span>`;
    li.innerHTML = `
      <span>${formatTimestamp(run.timestamp)}<br><small>${run.targets.join(', ')}</small></span>
      <span class="badges">${badges}</span>`;
    if (!run.incomplete) li.addEventListener('click', () => openRunDetail(run.timestamp));
    else li.classList.add('empty');
    runListEl.appendChild(li);
  }
}

function populateTrendTargets(runs) {
  const targets = [...new Set(runs.flatMap((r) => r.targets))].sort();
  const previous = trendTargetEl.value;

  if (targets.length === 0) {
    trendTargetEl.innerHTML = '<option value="">No targets yet</option>';
    trendChartsEl.innerHTML = '';
    return;
  }

  trendTargetEl.innerHTML = targets.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  trendTargetEl.value = targets.includes(previous) ? previous : targets[0];
  loadTrends(trendTargetEl.value);
}

async function loadTrends(target) {
  if (!target) { trendChartsEl.innerHTML = ''; return; }
  const series = await fetchJson(`/api/trends?target=${encodeURIComponent(target)}`);
  renderTrends(series);
}

function renderTrends(series) {
  const categories = [...new Set(series.flatMap((point) => Object.keys(point.counts)))].sort();
  if (categories.length === 0) {
    trendChartsEl.innerHTML = '<p class="empty">No issues recorded yet for this target.</p>';
    return;
  }

  trendChartsEl.innerHTML = categories
    .map((category) => {
      const values = series.map((point) => point.counts[category] || 0);
      return `<div class="trend-chart"><h4>${escapeHtml(category)}</h4>${buildSparkline(values)}</div>`;
    })
    .join('');
}

function buildSparkline(values) {
  const width = 300;
  const height = 60;
  const pad = 6;
  const max = Math.max(...values, 1);

  if (values.length === 1) {
    const y = height - pad - (values[0] / max) * (height - pad * 2);
    return `<svg viewBox="0 0 ${width} ${height}"><circle cx="${width / 2}" cy="${y}" r="3" fill="var(--accent)" /></svg>`;
  }

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - (v / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const circles = points
    .map((p) => {
      const [x, y] = p.split(',');
      return `<circle cx="${x}" cy="${y}" r="2.5" fill="var(--accent)" />`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}">
    <polyline points="${points.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="1.5" />
    ${circles}
  </svg>`;
}

async function openRunDetail(timestamp) {
  const run = await fetchJson(`/api/runs/${encodeURIComponent(timestamp)}`);
  currentIssues = run.issues;

  detailTitle.textContent = `Run: ${formatTimestamp(run.timestamp)}`;
  downloadCsv.href = `/api/runs/${encodeURIComponent(timestamp)}/report.csv`;

  const categories = [...new Set(currentIssues.map((i) => i.category))].sort();
  filterCategory.innerHTML = '<option value="">All categories</option>' +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  filterStatus.value = '';
  filterSearch.value = '';

  detailSection.hidden = false;
  detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderIssuesTable();
}

function renderIssuesTable() {
  const category = filterCategory.value;
  const status = filterStatus.value;
  const search = filterSearch.value.trim().toLowerCase();

  const filtered = currentIssues.filter((issue) => {
    if (category && issue.category !== category) return false;
    if (status && issue.status !== status) return false;
    if (search && !issue.detail.toLowerCase().includes(search)) return false;
    return true;
  });

  issuesTableBody.innerHTML = filtered
    .map((issue) => `
      <tr>
        <td>${escapeHtml(issue.target)}</td>
        <td>${escapeHtml(issue.category)}</td>
        <td class="status-${issue.status}">${issue.status}</td>
        <td>${escapeHtml(issue.detail)}</td>
        <td>${issue.count}${issue.previousCount != null && issue.previousCount !== issue.count ? ` (was ${issue.previousCount})` : ''}</td>
        <td>${issue.pageCount ?? issue.affectedUrls?.length ?? 0}</td>
        <td>${issue.affectedUrls?.length ? `<details><summary>view</summary>${issue.affectedUrls.map((u) => `<code>${escapeHtml(u)}</code>`).join('<br/>')}</details>` : ''}</td>
      </tr>`)
    .join('');

  issuesEmpty.hidden = filtered.length > 0;
}

async function onSubmitCheck(event) {
  event.preventDefault();
  if (!currentModeReady()) return;
  hideFormError();

  const mode = document.querySelector('input[name="check-mode"]:checked').value;
  const when = document.querySelector('input[name="check-when"]:checked').value;
  const urls = urlsInput.value.split('\n').map((u) => u.trim()).filter(Boolean);
  const label = pagesLabelInput.value.trim();

  if (urls.length === 0) return;
  if (mode === 'pages' && !label) {
    showFormError('Give this list of pages a label before running.');
    return;
  }

  if (when === 'later') {
    if (!scheduleAtInput.value) {
      showFormError('Pick a date and time to schedule this for.');
      return;
    }
    try {
      await postJson('/api/scheduled', {
        mode,
        label,
        urls,
        runAt: new Date(scheduleAtInput.value).toISOString(),
      });
      checkForm.reset();
      applyModeVisibility();
      applyWhenVisibility();
      loadScheduled();
    } catch (err) {
      showFormError(err.message);
    }
    return;
  }

  checkRunning = true;
  updateRunButtonState();
  progressPanel.hidden = false;
  progressJobsEl.innerHTML = '';
  activeEventSources.forEach((es) => es.close());
  activeEventSources = [];

  try {
    const body = mode === 'pages' ? { mode, label, urls } : { mode, urls };
    const { jobIds } = await postJson('/api/checks', body);
    const labels = mode === 'pages' ? [label] : urls;
    watchBatch(jobIds, labels);
  } catch (err) {
    showFormError(err.message);
    checkRunning = false;
    updateRunButtonState();
  }
}

function watchBatch(jobIds, labels) {
  let remaining = jobIds.length;
  jobIds.forEach((jobId, i) => {
    const block = createProgressBlock(labels[i] ?? jobId);
    progressJobsEl.appendChild(block.el);
    watchJob(jobId, block, () => {
      remaining -= 1;
      loadRuns();
      if (remaining === 0) {
        checkRunning = false;
        updateRunButtonState();
      }
    });
  });
}

function createProgressBlock(label) {
  const el = document.createElement('div');
  el.className = 'progress-job';
  el.innerHTML = `<h4>${escapeHtml(label)} <span class="status-badge">queued</span></h4><div class="progress-log"></div>`;
  return { el, statusEl: el.querySelector('.status-badge'), logEl: el.querySelector('.progress-log') };
}

function watchJob(jobId, block, onFinished) {
  const es = new EventSource(`/api/checks/${jobId}/events`);
  activeEventSources.push(es);

  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    block.statusEl.textContent = data.status;
    const line = document.createElement('div');
    line.textContent = `[${data.stage}] ${data.message}`;
    block.logEl.appendChild(line);
    block.logEl.scrollTop = block.logEl.scrollHeight;

    if (data.status === 'done' || data.status === 'failed') {
      es.close();
      onFinished();
    }
  };

  es.onerror = () => {
    block.statusEl.textContent = 'error';
    es.close();
    onFinished();
  };
}

async function loadScheduled() {
  const items = await fetchJson('/api/scheduled');
  scheduledSection.hidden = items.length === 0;

  scheduledList.innerHTML = items
    .map((item) => `
      <li>
        <span>${formatDateTime(item.runAt)} — ${item.mode === 'pages' ? escapeHtml(item.label) : item.urls.map(escapeHtml).join(', ')}</span>
        <button type="button" class="cancel-scheduled" data-id="${item.id}">Cancel</button>
      </li>`)
    .join('');

  scheduledList.querySelectorAll('.cancel-scheduled').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/scheduled/${btn.dataset.id}`, { method: 'DELETE' });
      loadScheduled();
    });
  });
}

function showFormError(message) {
  checkFormError.textContent = message;
  checkFormError.hidden = false;
}

function hideFormError() {
  checkFormError.hidden = true;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed with ${res.status}`);
  return res.json();
}

function formatTimestamp(ts) {
  const iso = ts.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z').replace('T', ' ').slice(0, 19);
  return iso;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
