import express from 'express';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { router as runsApi } from './runs-api.js';
import { router as settingsApi } from './settings-api.js';
import { router as scheduledApi } from './scheduled-api.js';
import { initScheduler } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4545;

const app = express();
app.use(express.json());
app.use('/api', runsApi);
app.use('/api', settingsApi);
app.use('/api', scheduledApi);
app.use(express.static(path.join(__dirname, '..', 'public')));

initScheduler();

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Site checker dashboard: ${url}`);
  openBrowser(url);
});

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    ['xdg-open', [url]];
  execFile(cmd, args, () => {});
}
