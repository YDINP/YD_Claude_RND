// 전용 크롬(agent-chrome.ps1)에 CDP로 붙어 스크립트 실행: node cdp-run.mjs <port> <script.mjs>
// script.mjs 는 `export default async (ctx, page) => 결과` 형태.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const req = createRequire(import.meta.url);
let pw;
try { pw = req('playwright-core'); } catch {
  const base = join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
  for (const d of readdirSync(base)) { const p = join(base, d, 'node_modules', 'playwright-core'); if (existsSync(p)) { pw = req(p); break; } }
}
const [port, script] = process.argv.slice(2);
const browser = await pw.chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => !p.url().startsWith('chrome://')) || ctx.pages()[0] || await ctx.newPage();
const fn = (await import(pathToFileURL(script).href)).default;
try { console.log(JSON.stringify(await fn(ctx, page), null, 1)); } finally { await browser.close(); } // close() on CDP only disconnects
