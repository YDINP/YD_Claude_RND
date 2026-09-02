/**
 * capture-mainmenu-after.mjs — T-10 리디자인 후 메인 메뉴 3상태 캡처
 *
 * 메뉴 그리드가 온보딩 진행에 따라 0 → 3~7 → 13 으로 늘어난다(MenuGridGate).
 * 세 구간을 각각 세이브 주입으로 재현해 레이아웃이 항목 수에 관계없이
 * 성립하는지 눈으로 확인한다.
 *
 * 실행: node tools/art/capture-mainmenu-after.mjs   (사전: vite 서버 기동)
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
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  log(`  [shot] docs/redesign/screenshots/after/${name}.png`);
}

/** 세이브를 직접 써넣고 메인 메뉴를 다시 그린다 */
async function applySave(page, mutate) {
  await page.evaluate((fnBody) => {
    const raw = localStorage.getItem('arcane_collectors_save');
    const save = raw ? JSON.parse(raw) : {};
    // eslint-disable-next-line no-new-func
    new Function('save', fnBody)(save);
    localStorage.setItem('arcane_collectors_save', JSON.stringify(save));
  }, mutate);
  // HMR 리로드로 씬이 사라졌을 수 있으니 존재를 먼저 확인한다
  await waitFor(page, `!!window.game && !!window.game.scene.getScene('MainMenuScene')`);
  await page.evaluate(() => window.game.scene.getScene('MainMenuScene')?.scene.restart());
  await settleMainMenu(page);
  await page.waitForTimeout(3200);
  await hideTutorialUi(page);
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

/**
 * 프롤로그 컷씬을 전부 넘기고 메인 메뉴가 조용해질 때까지 기다린다.
 * CutsceneScene 은 MainMenuScene 위에 얹히므로 isActive('MainMenuScene') 만으로는
 * 컷씬이 끝났는지 알 수 없다. 컷씬이 없는 상태가 연속으로 유지될 때만 정착으로 본다.
 */
async function settleMainMenu(page, timeout = 40000) {
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
      if (calm >= 6) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

/** 튜토리얼 딤/코치마크를 걷어 레이아웃 자체가 보이게 한다 (캡처 전용) */
async function hideTutorialUi(page) {
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainMenuScene');
    scene?.tutorialFlow?.destroy?.();
    scene.tutorialFlow = null;
    scene?.returningCard?.hide?.();
    // 튜토리얼이 강제로 연 팝업(각인 등)도 닫는다. 레이아웃 자체를 찍는 것이 목적이다
    scene?.activePopup?.hide?.();
    scene?.destroyOrphanPopups?.();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainMenuScene');
    scene.activePopup = null;
    scene?.destroyOrphanPopups?.();
  });
  await page.waitForTimeout(400);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, 'document.querySelector("canvas") !== null');
  await waitFor(page, `window.game && window.game.scene.isActive('LoginScene')`);
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    const s = window.game.scene.getScene('LoginScene');
    if (s && s._handleGuestLogin) s._handleGuestLogin();
  });
  await settleMainMenu(page);
  await page.waitForTimeout(3200);

  // ① 신규 계정 — 그리드 0개, 온보딩 단일 CTA
  await hideTutorialUi(page);
  await shot(page, 'mainmenu-onboarding-grid0');

  // ② 튜토리얼 중 — T-05/T-06 해금 (herolist/partyedit/ascension → 3개)
  await applySave(page, `
    save.tutorial = save.tutorial || {};
    save.tutorial.completed = false;
    save.tutorial.completedSteps = ['T-01','T-02','T-03','T-04','T-05','T-06'];
    save.onboarding = save.onboarding || {};
    save.onboarding.unlockedMenus = ['herolist','partyedit','ascension'];
  `);
  await shot(page, 'mainmenu-tutorial-grid3');

  // ③ 튜토리얼 후반 — 7개 해금 (4열 구간)
  await applySave(page, `
    save.onboarding.unlockedMenus = ['gacha','herolist','partyedit','quest','ascension','inventory','collection'];
  `);
  await shot(page, 'mainmenu-tutorial-grid7');

  // ④ 완주 유저 — 13개 전량 해금, 소탕/보스전 2분할
  await applySave(page, `
    save.tutorial.completed = true;
    save.tutorial.completedSteps = ['T-01','T-02','T-03','T-04','T-05','T-06','T-07','T-08','T-09','T-10','T-11','T-12'];
    save.progress = save.progress || {};
    save.progress.clearedStages = Object.assign({}, save.progress.clearedStages, {
      '1-1': 3, '1-2': 3, '1-3': 3, '1-4': 3, '1-5': 3
    });
  `);
  await shot(page, 'mainmenu-completed-grid13');

  log('\n캡처 완료');
} catch (error) {
  log(`실패: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
