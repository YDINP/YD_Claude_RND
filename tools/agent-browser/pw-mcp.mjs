// Playwright MCP launcher: one browser per Claude session.
//
// - Default: an isolated in-memory profile, preloaded with the shared login state
//   (save-login.mjs writes it), so sessions never fight over one profile lock.
// - PW_CDP_PORT set: attach to that dedicated Chrome instead (agent-chrome.ps1 starts one).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { STATE_FILE } from './paths.mjs';

const args = ['-y', '@playwright/mcp@latest'];
const port = process.env.PW_CDP_PORT;
if (port) {
  args.push('--cdp-endpoint', `http://127.0.0.1:${port}`);
} else {
  args.push('--browser', 'chrome', '--isolated');
  if (existsSync(STATE_FILE)) args.push('--storage-state', STATE_FILE);
}
args.push(...process.argv.slice(2)); // e.g. --headless

// npx's own JS entry, run by this node: no shell, so kill() reaches the server itself.
const npxCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
const child = spawn(process.execPath, [npxCli, ...args], { stdio: 'inherit' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
