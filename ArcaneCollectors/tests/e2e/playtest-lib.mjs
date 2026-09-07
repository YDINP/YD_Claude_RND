/**
 * playtest-lib.mjs — playtest.mjs 가 쓰는 조작·관측 유틸
 *
 * 여기 있는 것은 전부 "사람이 화면에서 할 수 있는 일"과 "저장값 읽기" 둘 뿐이다.
 * 상태를 바꾸는 것은 계정 준비(디버그 치트)에서만 하고, 검증 구간에서는 읽기만 한다.
 * 그래야 "표시값 ↔ 저장값" 대조가 의미를 갖는다.
 */
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { blockHmr } from './hmr-guard.mjs';
import { ACCOUNTS, seedScript } from './playtest-fixtures.mjs';

export { blockHmr, devWsPattern, isLocalTarget, checkUnexpectedReload } from './hmr-guard.mjs';
export { ACCOUNTS, BASE_IDS, ASC_IDS, legacySave, richSave } from './playtest-fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..', '..');
export const BASE_URL = process.env.PLAYTEST_BASE_URL || 'https://arcane-collectors.vercel.app';
export const SOURCE = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1') ? 'local' : 'live';
export const SHOT_DIR = path.join(ROOT, 'docs', 'qa', 'playtest');
export const RESULT_PATH = path.join(ROOT, 'docs', 'qa', 'playtest-result.json');
export const VIEWPORT = { width: 720, height: 1280 };

mkdirSync(SHOT_DIR, { recursive: true });

/** 게임 결함과 무관한 잡음 */
const IGNORED = [/favicon/i, /\[vite\]/i, /supabase/i, /net::ERR_/i, /Failed to load resource/i];
export const isIgnored = (t) => IGNORED.some((re) => re.test(t));

// ============================================================
// 결과 수집
// ============================================================

export const report = [];
let current = null;

export function startScenario(id, name) {
  current = { id, name, source: SOURCE, checks: [], issues: [], shots: [], consoleErrors: [] };
  report.push(current);
  console.log(`\n${'='.repeat(70)}\n[${id}] ${name}\n${'='.repeat(70)}`);
  return current;
}
export const currentScenario = () => current;

/** 자동 판정 체크 */
export function check(ok, name, detail = '') {
  current.checks.push({ ok: !!ok, name, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` — ${detail}` : ''}`);
  return !!ok;
}
/** 사람이 캡처를 보고 판단할 항목 (자동 판정 대상 아님) */
export function manual(name, detail = '') {
  current.checks.push({ ok: null, manual: true, name, detail: String(detail) });
  console.log(`EYE  | ${name}${detail ? ` — ${detail}` : ''}`);
}
/** 결함 기록 */
export function issue(severity, title, { repro = '', suspect = '', evidence = '' } = {}) {
  current.issues.push({ severity, title, repro, suspect, evidence });
  console.log(`  BUG [${severity}] ${title}`);
}
export const note = (msg) => console.log(`  .. ${msg}`);

// ============================================================
// 좌표 탭 유틸
// ============================================================

export async function safeEvaluate(page, fn, arg) {
  try {
    return await page.evaluate(fn, arg);
  } catch (error) {
    if (!/Execution context was destroyed|context was destroyed|Target closed/.test(error.message || '')) throw error;
    await page.waitForTimeout(500);
    return page.evaluate(fn, arg);
  }
}

export async function canvasMap(page) {
  return safeEvaluate(page, () => {
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, gw: window.game?.scale?.gameSize.width, gh: window.game?.scale?.gameSize.height };
  });
}

/** 게임 월드 좌표(base 720x1280 기준 아님 — 렌더 좌표)를 실제 마우스로 클릭 */
export async function tapWorld(page, wx, wy, settle = 250) {
  const m = await canvasMap(page);
  await page.mouse.click(m.x + (wx * m.w) / m.gw, m.y + (wy * m.h) / m.gh);
  await page.waitForTimeout(settle);
}

/**
 * 활성 씬 전체(팝업 컨테이너 포함)에서 화면에 실제로 보이는 라벨 텍스트를 찾는다.
 * 조상 컨테이너가 숨겨져 있으면 제외한다 — 닫힌 팝업의 잔존 텍스트를 잡지 않기 위함.
 */
export async function findByLabel(page, label, { exact = false, sceneKeys = null, nth = 0, minDepth = null } = {}) {
  return safeEvaluate(page, ({ text, exact, keys, nth, minDepth }) => {
    const collect = (list, out) => {
      list.forEach((obj) => { if (!obj) return; out.push(obj); if (Array.isArray(obj.list)) collect(obj.list, out); });
      return out;
    };
    const scenes = keys
      ? keys.map((k) => window.game?.scene?.getScene?.(k)).filter((s) => s && window.game.scene.isActive(s.scene.key))
      : (window.game?.scene?.getScenes?.(true) || []);
    const hits = [];
    for (const scene of scenes) {
      for (const o of collect(scene.children.list, [])) {
        if (o.type !== 'Text' || typeof o.text !== 'string') continue;
        if (exact ? o.text.trim() !== text : !o.text.includes(text)) continue;
        let n = o, vis = true, topDepth = o.depth;
        while (n) { if (n.visible === false || n.alpha < 0.05) { vis = false; break; } topDepth = Math.max(topDepth, n.depth || 0); n = n.parentContainer; }
        if (!vis) continue;
        if (minDepth !== null && topDepth < minDepth) continue;
        const b = o.getBounds();
        hits.push({ sceneKey: scene.scene.key, text: o.text, x: b.centerX, y: b.centerY, w: b.width, h: b.height, depth: topDepth });
      }
    }
    hits.sort((a, b) => b.depth - a.depth);
    return hits[nth] || null;
  }, { text: label, exact, keys: sceneKeys, nth, minDepth });
}

export async function waitForLabel(page, label, opts = {}, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const f = await findByLabel(page, label, opts);
    if (f) return f;
    await page.waitForTimeout(200);
  }
  return null;
}

export async function waitForLabelGone(page, label, opts = {}, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (!(await findByLabel(page, label, opts))) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** 라벨을 실제로 탭한다 */
export async function tapLabel(page, label, { required = true, dx = 0, dy = 0, settle = 400, ...opts } = {}) {
  const found = await findByLabel(page, label, opts);
  if (!found) {
    if (required) throw new Error(`[tapLabel] '${label}' 을(를) 화면에서 찾지 못했습니다`);
    return null;
  }
  await tapWorld(page, found.x + dx, found.y + dy, settle);
  return found;
}

/** 현재 화면의 보이는 텍스트 전부 (겹침/잘림/이탈 판정용) */
export async function visibleTexts(page) {
  return safeEvaluate(page, () => {
    const collect = (list, out) => {
      list.forEach((obj) => { if (!obj) return; out.push(obj); if (Array.isArray(obj.list)) collect(obj.list, out); });
      return out;
    };
    const out = [];
    for (const scene of window.game?.scene?.getScenes?.(true) || []) {
      for (const o of collect(scene.children.list, [])) {
        if (o.type !== 'Text' || typeof o.text !== 'string' || !o.text.trim()) continue;
        let n = o, vis = true, topDepth = o.depth;
        while (n) { if (n.visible === false || n.alpha < 0.05) { vis = false; break; } topDepth = Math.max(topDepth, n.depth || 0); n = n.parentContainer; }
        if (!vis) continue;
        let masked = false;
        for (let m = o; m; m = m.parentContainer) { if (m.mask) { masked = true; break; } }
        const b = o.getBounds();
        out.push({ scene: scene.scene.key, text: o.text, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), depth: topDepth, masked });
      }
    }
    return out;
  });
}

/**
 * 화면 밖 이탈 검사.
 * 게임 캔버스(렌더 해상도) 밖으로 절반 이상 나간 텍스트를 돌려준다.
 */
export async function offscreenTexts(page) {
  const size = await safeEvaluate(page, () => ({ w: window.game.scale.gameSize.width, h: window.game.scale.gameSize.height }));
  const texts = await visibleTexts(page);
  // 스크롤 컨테이너 안(마스크가 걸린) 항목은 제외한다. 목록을 스크롤하면 화면 밖에 있는 게
  // 정상이고, 그것까지 세면 긴 목록마다 거짓 양성이 쏟아진다.
  return texts.filter((t) => !t.masked
    && (t.x + t.w * 0.5 < 0 || t.x + t.w * 0.5 > size.w || t.y + t.h * 0.5 < 0 || t.y + t.h * 0.5 > size.h));
}

/** 활성 씬 키 목록 */
export const activeScenes = (page) => safeEvaluate(page, () => (window.game?.scene?.getScenes?.(true) || []).map((s) => s.scene.key));

/** 세이브 원본 */
export const readSave = (page) => safeEvaluate(page, () => {
  const raw = localStorage.getItem('arcane_collectors_save');
  return raw ? JSON.parse(raw) : null;
});

/** registry 스냅 */
export const readRegistry = (page) => safeEvaluate(page, () => window.__TEST_API__?.getRegistryData?.() ?? null);

export async function shot(page, name) {
  const file = path.join(SHOT_DIR, `${name}.png`);
  try {
    await page.screenshot({ path: file });
    current?.shots.push(`docs/qa/playtest/${name}.png`);
    console.log(`  [shot] docs/qa/playtest/${name}.png`);
  } catch (e) { console.log(`  (캡처 실패: ${e.message})`); }
  return file;
}

// ============================================================
// 세션 준비
// ============================================================

/**
 * 새 페이지.
 * 부팅 **전에** `arcane_debug_enabled` 를 심어야 DebugManager 가 window.debug 를 건다.
 * 라이브 정적 빌드(import.meta.env.DEV=false)에서도 이 경로로 디버그 API 가 열린다.
 */
export async function newSession(browser, { save = null, debug = true } = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // 공유 dev 서버 격리 — 남이 소스를 저장해도 이 페이지는 리로드되지 않는다.
  // 라이브(원격) 대상이면 아무 것도 하지 않는다. 실증: node tests/e2e/hmr-guard-verify.mjs
  const hmr = await blockHmr(page, BASE_URL);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !isIgnored(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => {
    if (isIgnored(e.message)) return;
    // 스택 첫 줄까지 남긴다 — 프로덕션 번들이라 심볼은 뭉개지지만 파일·라인은 남는다
    const where = (e.stack || '').split(String.fromCharCode(10)).slice(1, 3).join(' | ').slice(0, 240);
    errors.push(`PAGEERROR: ${e.message.slice(0, 200)}${where ? ` @ ${where}` : ''}`);
  });
  await page.addInitScript(({ save, debug }) => {
    try {
      if (debug) localStorage.setItem('arcane_debug_enabled', 'true');
      if (save) localStorage.setItem('arcane_collectors_save', JSON.stringify(save));
    } catch { /* storage 차단 환경 무시 */ }
  }, { save, debug });
  page.__errors = errors;
  page.__hmr = hmr;
  return { ctx, page, errors, hmr };
}

/**
 * 계정 시나리오(A/B/C) 세션.
 * 세이브와 게스트 자동로그인 세션을 문서 로드 **전에** 심는다 — 로그인 화면을 거치지 않고
 * 바로 로비로 들어가므로, 준비 단계에서 조작이 끼어들어 상태를 오염시키지 않는다.
 * A(신규)는 세이브를 심지 않고 로그인부터 직접 플레이한다.
 */
export async function newAccountSession(browser, accountKey) {
  const account = ACCOUNTS[accountKey];
  if (!account) throw new Error(`알 수 없는 계정 시나리오: ${accountKey}`);
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const hmr = await blockHmr(page, BASE_URL);
  const errors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (isIgnored(t)) return;
    // shutdown() 정리 실패는 console.warn 으로 나온다 — 이번 검수의 핵심 관심사라 함께 받는다
    if (m.type() === 'error' || /shutdown\(\) 실패/.test(t)) errors.push(`${m.type().toUpperCase()}: ${t.slice(0, 300)}`);
  });
  page.on('pageerror', (e) => {
    if (isIgnored(e.message)) return;
    const where = (e.stack || '').split(String.fromCharCode(10)).slice(1, 3).join(' | ').slice(0, 240);
    errors.push(`PAGEERROR: ${e.message.slice(0, 200)}${where ? ` @ ${where}` : ''}`);
  });
  await page.addInitScript(seedScript, { saveData: account.save ? account.save() : null, guest: accountKey !== 'A', debug: true });
  page.__errors = errors;
  page.__hmr = hmr;
  return { ctx, page, errors, hmr, account };
}

/** 게임 부팅 → 로그인 화면 */
export async function boot(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const ok = await waitForLabel(page, '게스트로 시작', {}, 40000);
  if (!ok) throw new Error(`부팅 실패 — 로그인 화면 미도달 (활성 씬: ${(await activeScenes(page)).join(',')})`);
}

/** 게스트 로그인 → MainMenu 또는 프롤로그 */
export async function guestLogin(page, timeout = 40000) {
  await tapLabel(page, '게스트로 시작');
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const scenes = await activeScenes(page);
    if (scenes.includes('MainMenuScene') || scenes.includes('CutsceneScene')) return scenes;
    await page.waitForTimeout(250);
  }
  throw new Error('게스트 로그인 후 씬 전환 실패');
}

/** 프롤로그 컷신이 떠 있으면 끝까지 탭해서 넘긴다. 소요 탭 수를 돌려준다 */
export async function passCutscene(page, maxTaps = 80) {
  let taps = 0;
  while (taps < maxTaps) {
    if (!(await activeScenes(page)).includes('CutsceneScene')) return taps;
    await tapWorld(page, 540, 960, 260);
    taps += 1;
  }
  return taps;
}

/** 열려 있는 팝업을 닫는다 (닫기 버튼 라벨 후보를 순회) */
export async function closePopup(page) {
  for (const label of ['✕', '×', 'X', '닫기']) {
    const f = await findByLabel(page, label, { exact: true });
    if (f) { await tapWorld(page, f.x, f.y, 500); return true; }
  }
  return false;
}
