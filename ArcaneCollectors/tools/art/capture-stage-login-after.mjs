/**
 * capture-stage-login-after.mjs — T-16 · T-19 리디자인 후 캡처
 *
 * 담는 화면
 *   boot-splash / boot-progress   부팅 스플래시 (로고 · 세계관 문구 · 진행바)
 *   login-guest                   로그인 (bg_login · 로고 · 9-slice 버튼)
 *   stage-chapter1                스테이지 선택, 신규 계정 (전부 미클리어)
 *   stage-chapter1-progress       클리어 · 3성 소탕 · 보스 · 이야기 표시가 함께 보이는 상태
 *   stage-chapter3                다른 챕터 (배경 · 교단색이 바뀌는지)
 *
 * 실행: node tools/art/capture-stage-login-after.mjs   (사전: vite 서버 기동)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/redesign/screenshots/after');
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);

async function waitFor(page, fn, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* retry */ }
    await page.waitForTimeout(150);
  }
  return false;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  log(`  [shot] docs/redesign/screenshots/after/${name}.png`);
}

/**
 * 디버그 FAB 은 캡처에 남기지 않는다.
 * FAB 은 이제 기본 숨김이지만, 이전에 켜 둔 상태가 localStorage 에 남아 있을 수 있으므로
 * 캡처 전에 명시적으로 끈다. `window.debug` 는 DebugManager 가 등록한 본체다
 * (동적 import 로 받은 모듈은 Vite HMR 쿼리 때문에 다른 인스턴스가 될 수 있어 쓰지 않는다).
 */
async function hideDebugFab(page) {
  await page.evaluate(() => {
    window.debug?.hideFab?.();
    window.debug?.currentPanel?.destroy?.();
    if (window.debug) window.debug.currentPanel = null;
  });
  await page.waitForTimeout(200);
}

async function settleMain(page, timeout = 40000) {
  const deadline = Date.now() + timeout;
  let calm = 0;
  while (Date.now() < deadline) {
    const cutscene = await page.evaluate(() => !!window.game?.scene.isActive('CutsceneScene'));
    if (cutscene) {
      await page.evaluate(() => window.game.scene.getScene('CutsceneScene')?.player?.skipScene());
      calm = 0;
      await page.waitForTimeout(700);
      continue;
    }
    const main = await page.evaluate(() => !!window.game?.scene.isActive('MainMenuScene'));
    if (main) {
      calm += 1;
      if (calm >= 3) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function openStageSelect(page) {
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainMenuScene');
    scene?.tutorialFlow?.destroy?.();
    if (scene) scene.tutorialFlow = null;
    scene.scene.start('StageSelectScene');
  });
  const ok = await waitFor(page, "!!window.game?.scene.isActive('StageSelectScene')", 15000);
  await page.waitForTimeout(1800);
  await hideDebugFab(page);
  return ok;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => log(`  [err] ${e.message.slice(0, 160)}`));
page.on('console', (m) => {
  if (m.type() === 'error') log(`  [console.error] ${m.text().slice(0, 160)}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) log(`  [http ${r.status()}] ${r.url().slice(0, 160)}`);
});

try {
  // ---------------- 부팅 ----------------
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, 'document.querySelector("canvas") !== null', 20000);

  await page.waitForTimeout(700);
  await shot(page, 'boot-splash');
  await page.waitForTimeout(1100);
  await shot(page, 'boot-progress');

  // ---------------- 로그인 ----------------
  await waitFor(page, "!!window.game?.scene.isActive('LoginScene')", 20000);
  await page.waitForTimeout(1000);
  await hideDebugFab(page);
  await shot(page, 'login-guest');

  // ---------------- 스테이지 선택 ----------------
  await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
  const mainUp = await settleMain(page);
  log(`  [state] MainMenuScene 정착 ${mainUp}`);

  await openStageSelect(page);
  await shot(page, 'stage-chapter1');

  // 진행 상태 — 클리어 별 · 3성 소탕 · 보스 강조 · 이야기 표시를 한 화면에 모은다
  await page.evaluate(() => {
    const registry = window.game.registry;
    registry.set('clearedStages', { '1-1': 3, '1-2': 2, '1-3': 1 });

    const raw = localStorage.getItem('arcane_collectors_save');
    if (raw) {
      const save = JSON.parse(raw);
      save.progress = save.progress || {};
      save.progress.clearedStages = { '1-1': 3, '1-2': 2, '1-3': 1 };
      save.story = save.story || {};
      save.story.viewedCutscenes = Array.from(new Set([
        ...(save.story.viewedCutscenes || []),
        'cs_ch1_enter', 'cs_1_1_enter', 'cs_1_1_clear', 'cs_1_2_enter', 'cs_1_2_clear'
      ]));
      save.story.skippedCutscenes = save.story.skippedCutscenes || [];
      localStorage.setItem('arcane_collectors_save', JSON.stringify(save));
    }

    const scene = window.game.scene.getScene('StageSelectScene');
    scene.refreshStages();
    scene.updateChapterHeader();
    scene.updateLorePanel();
  });
  await page.waitForTimeout(1200);
  await hideDebugFab(page);
  await shot(page, 'stage-chapter1-progress');

  // 챕터 3 — 배경과 교단색이 함께 바뀌는지
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('StageSelectScene');
    scene.changeChapter(1);
    scene.changeChapter(1);
  });
  await page.waitForTimeout(2600);
  await hideDebugFab(page);
  await shot(page, 'stage-chapter3');

  log('\n캡처 완료');
} catch (e) {
  log(`실패: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
