/**
 * capture-idle-battle.mjs — 방치 전투 무대 3초 간격 3장 캡처
 *
 * 정지 화면 한 장으로는 "살아 있는가"를 판단할 수 없다. 3초 간격으로 세 장을 찍어
 * 공격 순번이 실제로 돌고 보스 HP·진행률이 움직이는지 대조한다.
 *
 * 실행: node tools/art/capture-idle-battle.mjs   (사전: vite 서버 기동)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/redesign/screenshots/after');
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);

async function waitFor(page, fn, timeout = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* retry */ }
    await page.waitForTimeout(150);
  }
  return false;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => log(`  [err] ${e.message.slice(0, 160)}`));
page.on('console', (m) => { if (m.type() === 'error') log(`  [console.error] ${m.text().slice(0, 160)}`); });
page.on('response', (r) => { if (r.status() >= 400) log(`  [http ${r.status()}] ${r.url().slice(0, 140)}`); });

/** 컷씬을 넘기고 메인 메뉴가 조용해질 때까지 */
async function settle(page, timeout = 40000) {
  const deadline = Date.now() + timeout;
  let calm = 0;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => !!window.game?.scene.isActive('CutsceneScene'))) {
      await page.evaluate(() => window.game.scene.getScene('CutsceneScene')?.player?.skipScene());
      calm = 0;
      await page.waitForTimeout(700);
      continue;
    }
    if (await page.evaluate(() => !!window.game?.scene.isActive('MainMenuScene'))) {
      calm += 1;
      if (calm >= 6) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

// HMR 차단 — 다른 트랙이 파일을 저장하면 vite 가 페이지를 통째로 리로드해 캡처가 깨진다.
// 클라이언트를 no-op 스텁으로 대체하면 모듈 그래프는 그대로 두고 리로드만 막는다.
const VITE_CLIENT_STUB = [
  'export const createHotContext = () => ({',
  '  accept(){}, acceptExports(){}, dispose(){}, prune(){}, decline(){},',
  '  invalidate(){}, on(){}, off(){}, send(){}, data: {}',
  '});',
  'export const updateStyle = () => {};',
  'export const removeStyle = () => {};',
  'export const injectQuery = (url) => url;',
  'export const ErrorOverlay = class {};'
].join(String.fromCharCode(10));
await page.route('**/@vite/client', (route) => route.fulfill({
  status: 200,
  contentType: 'application/javascript',
  body: VITE_CLIENT_STUB
}));

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, 'document.querySelector("canvas") !== null');
  await waitFor(page, `window.game && window.game.scene.isActive('LoginScene')`);
  await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
  await settle(page);

  // 완주 유저 상태로 — 소탕/보스전 2분할 CTA 가 함께 보이게 한다
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
    save.tutorial = save.tutorial || {};
    save.tutorial.completed = true;
    save.tutorial.completedSteps = ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06',
      'T-07', 'T-08', 'T-09', 'T-10', 'T-11', 'T-12'];
    save.progress = save.progress || {};
    save.progress.clearedStages = Object.assign({}, save.progress.clearedStages,
      { '1-1': 3, '1-2': 3, '1-3': 3 });
    localStorage.setItem('arcane_collectors_save', JSON.stringify(save));
  });
  await waitFor(page, `!!window.game && !!window.game.scene.getScene('MainMenuScene')`);
  await page.evaluate(() => window.game.scene.getScene('MainMenuScene')?.scene.restart());
  await settle(page);
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainMenuScene');
    scene?.tutorialFlow?.destroy?.();
    scene.tutorialFlow = null;
    scene?.returningCard?.hide?.();
    scene?.activePopup?.hide?.();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainMenuScene');
    scene.activePopup = null;
    scene?.destroyOrphanPopups?.();
  });
  await page.waitForTimeout(600);

  // 진행 중인 전투를 찍기 위해 누적 보상을 먼저 수령한다(= 유저가 [보상받기] 를 누른 것과 같다).
  // 그러면 누적 피해가 0 으로 돌아가 HP 바가 0 에서 차오르는 구간을 담을 수 있다.
  await page.evaluate(() => {
    const scene = window.game.scene.getScene('MainMenuScene');
    scene?.idleSystem?.claimRewards?.();
    scene?.idleBattleView?.clearBossReady?.();
    scene?.idleBattleView?.updateBossHp(0, scene.idleSystem.currentBossHp);
  });
  await page.waitForTimeout(1200);

  for (let i = 1; i <= 3; i += 1) {
    const state = await page.evaluate(() => {
      const view = window.game.scene.getScene('MainMenuScene')?.idleBattleView;
      const scene = window.game.scene.getScene('MainMenuScene');
      if (!view) return { missing: true, active: window.game.scene.getScenes(true).map((x) => x.scene.key), uiCreated: scene?._uiCreated };
      return {
        turn: view._turn,
        acc: Math.floor(view.bossCurrentHp || 0),
        max: Math.floor(view.bossMaxHp || 0),
        tweens: view._activeTweens,
        boss: view.currentBoss?.name || null,
        eta: view.etaText?.text || null
      };
    });
    const file = path.join(OUT, `idle-battle-${i}.png`);
    await page.screenshot({ path: file });
    log(`  [shot] docs/redesign/screenshots/after/idle-battle-${i}.png  ${JSON.stringify(state)}`);
    if (i < 3) await page.waitForTimeout(3000);
  }

  log('\n캡처 완료');
} catch (error) {
  log(`실패: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
