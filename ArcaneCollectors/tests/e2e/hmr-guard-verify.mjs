/**
 * hmr-guard-verify.mjs — HMR 가드가 **실제로 리로드를 막는지** 실증한다.
 *
 * 이 결함의 본질은 "패턴이 틀렸다"가 아니라 **검증되지 않은 가드**였다.
 * `page.routeWebSocket(/vite|24678/)` 는 문법적으로 멀쩡했고, 아무도 그것이 정말
 * 리로드를 막는지 확인하지 않아 몇 달간 동작하지 않은 채로 있었다.
 * 그래서 이 스크립트는 "고쳤다"가 아니라 **"막혔다"를 관측**한다.
 *
 * 방법 — 대조군/실험군
 *   대조군: 가드 없이 페이지를 띄우고 소스 파일에 변경 이벤트를 준다 → 리로드가 **일어나야** 한다.
 *           (일어나지 않으면 이 실증 자체가 무의미하므로 그 사실을 먼저 보고한다)
 *   실험군: 같은 조건에 가드만 걸고 같은 이벤트를 준다 → 리로드가 **일어나지 않아야** 한다.
 *
 * 파일을 어떻게 건드리나 — **내용은 한 글자도 바꾸지 않는다**
 *   `fs.utimesSync()` 로 mtime 만 갱신한다. Vite 의 감시자(chokidar)는 mtime 변경에
 *   `change` 이벤트를 내므로 HMR 이 그대로 발동하지만, 파일 내용과 git 상태는 그대로다.
 *   다른 작업자가 그 파일을 편집 중이어도 잃는 것이 없다. 실행 전후로 SHA-256 을 찍어
 *   내용이 동일함을 함께 보고한다.
 *
 * 실행: node tests/e2e/hmr-guard-verify.mjs
 *   기본 대상은 http://localhost:3000 (PLAYTEST_BASE_URL 로 변경 가능)
 */
import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { readFileSync, statSync, utimesSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { blockHmr, devWsPattern, isLocalTarget } from './hmr-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const BASE_URL = process.env.PLAYTEST_BASE_URL || 'http://localhost:3000';

/** HMR 을 깨울 파일. 앱 모듈 그래프 안에 있어야 Vite 가 갱신을 보낸다 */
const TOUCH_TARGET = path.join(ROOT, 'src', 'main.js');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);

let passed = 0;
let failed = 0;
const check = (ok, name, detail = '') => {
  if (ok) { passed += 1; console.log(`PASS | ${name}${detail ? ` — ${detail}` : ''}`); }
  else { failed += 1; console.log(`FAIL | ${name}${detail ? ` — ${detail}` : ''}`); }
  return ok;
};
const note = (m) => console.log(`  .. ${m}`);

/** mtime 만 현재로 갱신한다 (내용 무변경) */
function touchMtime(file) {
  const st = statSync(file);
  const now = new Date();
  utimesSync(file, now, now);
  return { before: st.mtimeMs, after: statSync(file).mtimeMs };
}

/**
 * 페이지를 띄우고 파일 변경 이벤트를 준 뒤, 리로드가 일어났는지 본다.
 * @param {boolean} withGuard
 */
async function trial(browser, withGuard) {
  const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 } });
  const page = await ctx.newPage();

  // 페이지가 받은 HMR 웹소켓 프레임을 직접 관찰한다 — 리로드 여부와 별개로
  // "서버 메시지가 도달했는가"를 보면 가드가 전송 계층에서 막혔는지 알 수 있다.
  await page.addInitScript(() => {
    window.__hmrFrames = [];
    const Native = window.WebSocket;
    window.WebSocket = function (...args) {
      const ws = new Native(...args);
      ws.addEventListener('message', (e) => {
        try { window.__hmrFrames.push(String(e.data).slice(0, 120)); } catch { /* 무시 */ }
      });
      return ws;
    };
    window.WebSocket.prototype = Native.prototype;
    // 이 페이지가 살아 있는 동안 바뀌지 않는 표식 — 리로드되면 사라진다
    window.__lifeId = Math.random().toString(36).slice(2);
  });

  const guard = withGuard
    ? await blockHmr(page, BASE_URL)
    : { applied: false, loads: (() => { let n = 0; page.on('load', () => { n += 1; }); return () => n; })() };

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.game, { timeout: 40000 });
  // 최초 진입의 'load' 이벤트가 카운터에 반영된 뒤에 기준값을 잡는다.
  // 그러지 않으면 최초 로드가 "리로드 1회"로 잘못 세어진다.
  await page.waitForLoadState('load');
  await page.waitForTimeout(800);
  const lifeBefore = await page.evaluate(() => window.__lifeId);
  const loadsBefore = guard.loads();
  await page.waitForTimeout(1500);
  const framesBefore = await page.evaluate(() => (window.__hmrFrames || []).slice(0, 5));

  const touched = touchMtime(TOUCH_TARGET);
  note(`${withGuard ? '[가드 ON ]' : '[가드 OFF]'} src/main.js mtime ${Math.round(touched.before)} → ${Math.round(touched.after)} (내용 무변경)`);

  // 리로드는 즉시 오지 않는다. 넉넉히 기다린 뒤 판정한다.
  let reloaded = false;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const life = await page.evaluate(() => window.__lifeId).catch(() => null);
    if (life !== lifeBefore) { reloaded = true; break; }
    await page.waitForTimeout(250);
  }
  const loadsAfter = guard.loads();
  const framesAfter = await page.evaluate(() => (window.__hmrFrames || []).slice(0, 5)).catch(() => []);

  await ctx.close();
  return { reloaded, loadsBefore, loadsAfter, framesBefore, framesAfter };
}

(async () => {
  console.log(`\n=== HMR 가드 실증 (${BASE_URL}) ===\n`);

  if (!isLocalTarget(BASE_URL)) {
    console.log('대상이 로컬 dev 서버가 아니다 — HMR 자체가 없으므로 실증할 것이 없다.');
    process.exit(0);
  }
  note(`가드 패턴: ${devWsPattern(BASE_URL)}`);

  const hashBefore = sha(TOUCH_TARGET);
  const browser = await chromium.launch({ headless: true });

  try {
    // 1) 대조군 — 가드가 없으면 리로드가 일어나야 한다
    const control = await trial(browser, false);
    note(`대조군 결과: reloaded=${control.reloaded}, load ${control.loadsBefore}→${control.loadsAfter}`);
    note(`대조군이 받은 HMR 프레임: ${JSON.stringify(control.framesAfter)}`);
    const controlValid = check(
      control.reloaded,
      '대조군(가드 없음) — 소스 변경 이벤트에 페이지가 리로드된다',
      '이게 실패하면 실증 자체가 성립하지 않는다(HMR 이 꺼져 있거나 파일이 모듈 그래프 밖)'
    );

    // 2) 실험군 — 가드가 있으면 리로드가 일어나면 안 된다
    const guarded = await trial(browser, true);
    note(`실험군 결과: reloaded=${guarded.reloaded}, load ${guarded.loadsBefore}→${guarded.loadsAfter}`);
    note(`실험군이 받은 HMR 프레임: ${JSON.stringify(guarded.framesAfter)}`);
    check(!guarded.reloaded, '실험군(가드 있음) — 같은 변경에도 페이지가 리로드되지 않는다');
    check(guarded.loadsAfter === guarded.loadsBefore, '실험군 — 페이지 로드 횟수가 늘지 않는다', `${guarded.loadsBefore} → ${guarded.loadsAfter}`);
    check(guarded.framesAfter.length === 0, '실험군 — HMR 웹소켓 프레임이 하나도 도달하지 않는다', JSON.stringify(guarded.framesAfter));

    if (!controlValid) {
      note('대조군이 리로드되지 않았다 — 실험군의 통과는 "가드가 막았다"는 증거가 되지 못한다.');
    }
  } finally {
    await browser.close();
  }

  const hashAfter = sha(TOUCH_TARGET);
  check(hashBefore === hashAfter, 'src/main.js 내용은 변경되지 않았다(mtime 만 갱신)', `sha256[0:16] ${hashBefore}`);

  console.log(`\n통과 ${passed} / 실패 ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})();
