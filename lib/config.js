import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_PATH = path.join(process.cwd(), 'config.json');

const DEFAULT_SF_CLI_PATH =
  '/Applications/Screaming Frog SEO Spider.app/Contents/MacOS/ScreamingFrogSEOSpiderLauncher';

export function readConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(partial) {
  const next = { ...readConfig(), ...partial };
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

// config.json (set via the Settings panel) wins over shell env vars, which
// win over the default macOS install path — so existing env-var-based setups
// keep working untouched until someone saves settings through the UI.
export function resolveSettings() {
  const config = readConfig();
  return {
    sfCliPath: config.sfCliPath || process.env.SF_CLI_PATH || DEFAULT_SF_CLI_PATH,
    sfConfigPath: config.sfConfigPath || process.env.SF_CONFIG_PATH || '',
    // Screaming Frog's list mode (used by "specific pages" checks) only stays
    // scoped to the exact URLs given if the loaded config has Limit Crawl
    // Depth set to 0 — otherwise it follows discovered links same as spider
    // mode. Sharing the whole-site config for this silently turns a
    // "specific pages" check into a full site crawl, so pages mode needs its
    // own dedicated config with that limit set.
    sfPagesConfigPath: config.sfPagesConfigPath || process.env.SF_PAGES_CONFIG_PATH || '',
  };
}

function checkPath(value, { executable = false } = {}) {
  if (!value) return { value, exists: false, executable: false };
  try {
    const stats = statSync(value);
    const isExecutable = executable ? Boolean(stats.mode & 0o111) : true;
    return { value, exists: true, executable: isExecutable };
  } catch {
    return { value, exists: false, executable: false };
  }
}

export function getStatus() {
  const settings = resolveSettings();
  const sfCli = checkPath(settings.sfCliPath, { executable: true });
  const sfConfig = checkPath(settings.sfConfigPath);
  const sfPagesConfig = checkPath(settings.sfPagesConfigPath);
  return {
    settings,
    sfCli,
    sfConfig,
    sfPagesConfig,
    // "ready" covers whole-site (domain) mode, the default. Specific-pages
    // mode additionally needs sfPagesConfig — checked separately in
    // siteCheck() so domain-only users aren't forced to set up a config
    // they'll never use.
    ready: sfCli.exists && sfCli.executable && sfConfig.exists,
    pagesReady: sfCli.exists && sfCli.executable && sfPagesConfig.exists,
  };
}
