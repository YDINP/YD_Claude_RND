/**
 * gacha-banner-pull-smoke.mjs — 배너별 픽업 라우팅 e2e 실증 (T-XX)
 *
 * 검증 내용
 *   게스트 로그인 → GachaScene 진입 → 배너 스트립에서 픽업 배너 선택
 *   → 10연차 소환 실행 → GachaSystem.pull()이 선택된 bannerId로 라우팅되는지
 *   → 결과 연출(GachaResultOverlay)이 정상 렌더링되는지 → 스크린샷 1장 캡처
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/gacha-banner-pull-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = new URL('../../docs/story/screenshots/', import.meta.url);
const VIEWPORT = { width: 720, height: 1280 };

let passed = 0;
let failed = 0;
const assert = (condition, name, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

async function waitFor(page, fn, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n=== 배너별 픽업 라우팅 e2e (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(3000);

    // 1. 게스트 로그인 (공유 서버 부하로 자동로그인이 LoginScene 폴링보다 먼저 끝날 수 있어
    // LoginScene 활성 or 이미 MainMenuScene 도달 둘 다 성공 경로로 취급한다)
    const reachedLoginOrMenu = await waitFor(
      page,
      () => !!(window.game?.scene.isActive('LoginScene') || window.game?.scene.isActive('MainMenuScene')),
      15000
    );
    assert(reachedLoginOrMenu, 'LoginScene 활성화 또는 자동로그인으로 MainMenuScene 직행');

    if (await page.evaluate(() => !!window.game?.scene.isActive('LoginScene'))) {
      await page.evaluate(() => {
        window.game.scene.getScene('LoginScene')?._handleGuestLogin?.();
      });
    }
    const mainMenu = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000);
    assert(mainMenu, '게스트 로그인 → MainMenuScene');

    // 2. GachaScene 직접 진입 (튜토리얼 강제 스텝을 우회 — 배너 라우팅만 검증하는 게 목적)
    await page.evaluate(() => {
      window.game.scene.getScene('MainMenuScene').scene.start('GachaScene');
    });
    const gachaUp = await waitFor(page, () => !!window.game?.scene.isActive('GachaScene'), 10000);
    assert(gachaUp, 'GachaScene 진입');
    await page.waitForTimeout(500);

    // 3. 배너 스트립에서 픽업 배너를 선택 (setBanner()는 실제 칩 탭 핸들러와 동일 경로)
    const bannerSelected = await page.evaluate(() => {
      const scene = window.game.scene.getScene('GachaScene');
      if (!scene?.bannerPanel) return null;
      scene.bannerPanel.setBanner('pickup_iris_olympus');
      return scene.bannerPanel.selectedId;
    });
    assert(bannerSelected === 'pickup_iris_olympus', '배너 스트립에서 픽업 배너 선택', String(bannerSelected));
    await page.waitForTimeout(300);

    // 신규 계정 기본 젬(1500)은 10연 비용(2700)에 못 미친다 — 무료 10연은 GachaSystem.pull()
    // 내부에서만 판정되고 GachaScene.onGemButton()의 canPull() 사전 검사는 이를 모르므로
    // (기존 화면 동작, 이 트랙 범위 밖) UI 경로를 그대로 쓰기 위해 젬을 보충한다.
    await page.evaluate(() => window.debug?.addGems?.(10000));
    await page.waitForTimeout(200);

    // 4. 10연차 소환 실행 — 실제 클릭 핸들러(onGemButton)를 그대로 호출한다
    const pullTriggered = await page.evaluate(() => {
      const scene = window.game.scene.getScene('GachaScene');
      if (!scene || scene.currentTab !== 'hero') return false;
      scene.onGemButton(10);
      return true;
    });
    assert(pullTriggered, '10연차 소환 실행(선택된 배너로 pull() 호출)');

    const overlayUp = await waitFor(page, () => !!window.game?.scene.getScene('GachaScene')?.resultOverlay, 8000);
    assert(overlayUp, 'GachaResultOverlay 표시');

    // 5. 연출을 결과 그리드로 건너뛰어 안정적인 캡처 대상을 만든다
    await page.evaluate(() => {
      window.game.scene.getScene('GachaScene')?.resultOverlay?.skip?.();
    });
    await page.waitForTimeout(600);

    const settled = await waitFor(
      page,
      () => !!window.game?.scene.getScene('GachaScene')?.resultOverlay?.isSettled,
      5000
    );
    assert(settled, '결과 그리드 도달(연출 스킵)');

    await page.screenshot({ path: new URL('gacha_pickup_banner_10pull.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/gacha_pickup_banner_10pull.png');

    // 6. 세이브에 배너별 픽업 천장 카운터가 기록됐는지 확인 (BLK-XX)
    const bannerGachaState = await page.evaluate(() => {
      const raw = localStorage.getItem('arcane_collectors_save'); // SaveManager.SAVE_KEY
      return raw ? JSON.parse(raw).gacha : null;
    });
    assert(
      !!bannerGachaState?.banners?.pickup_iris_olympus,
      '배너별 픽업 천장 카운터가 세이브에 기록됨 (gacha.banners[bannerId])',
      JSON.stringify(bannerGachaState?.banners || {})
    );

    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));
  } catch (err) {
    failed += 1;
    console.log(`❌ 예외 발생 — ${err.message}`);
    console.error(err);
    try {
      await page.screenshot({ path: new URL('gacha-pull-failure.png', SHOT_DIR).pathname.slice(1) });
    } catch { /* ignore */ }
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
