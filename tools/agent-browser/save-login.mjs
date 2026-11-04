// Opens the login profile in a visible Chrome. Log in to whatever sites agents need,
// then close the window: the login state is saved for every new agent session.
//
//   node tools/agent-browser/save-login.mjs [url ...]
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { LOGIN_PROFILE, STATE_FILE } from './paths.mjs';

// playwright-core comes with the @playwright/mcp npx cache; no extra install needed.
function loadPlaywright() {
  const npx = join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
  for (const dir of readdirSync(npx)) {
    const pkg = join(npx, dir, 'node_modules', 'playwright-core', 'package.json');
    if (existsSync(pkg)) return createRequire(pkg)('playwright-core');
  }
  throw new Error('playwright-core not found: run "npx -y @playwright/mcp@latest --version" once first');
}

const { chromium } = loadPlaywright();
let context;
try {
  context = await chromium.launchPersistentContext(LOGIN_PROFILE, { channel: 'chrome', headless: false, viewport: null });
} catch (e) {
  console.error('Login profile is in use (an old-style agent session still holds it). Close that session and retry.');
  console.error(String(e.message).split('\n')[0]);
  process.exit(1);
}

const urls = process.argv.slice(2);
const first = context.pages()[0] ?? (await context.newPage());
if (urls[0]) await first.goto(urls[0]);
for (const url of urls.slice(1)) await (await context.newPage()).goto(url);

// Save while open (closing the window ends the context before a final save could run).
const save = () => context.storageState({ path: STATE_FILE }).catch(() => {});
await save();
const timer = setInterval(save, 2000);
console.log(`Log in, then close the window. Saving to ${STATE_FILE}`);
await new Promise((resolve) => context.on('close', resolve));
clearInterval(timer);
console.log('Saved.');
