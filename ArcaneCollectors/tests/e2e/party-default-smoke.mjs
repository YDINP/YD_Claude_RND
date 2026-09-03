/**
 * party-default-smoke.mjs — 파티 편성 첫 진입 시 기본 편성 보장 실증
 *
 * 검증 내용
 *   신규 게스트 계정 → 파티 편성 팝업/씬 진입
 *   → 슬롯 1에 아이리스(base_iris)가 편성되어 보이는지
 *   → 파티를 비운 뒤 다시 열면 자동으로 다시 채워지는지
 *
 * 사전 조건: 개발 서버 또는 preview 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/party-default-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = new URL('../../docs/story/screenshots/', import.meta.url);
const VIEWPORT = { width: 720, height: 1280 };
const SAVE_KEY = 'arcane_collectors_save';

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

async function waitFor(page, fn, timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

const readSlots = () => {
  const popup = window.game.scene.getScene('MainMenuScene').activePopup;
  return (popup?.heroSlots || []).map((s) => (s.hero ? s.hero.id || s.hero.characterId : null));
};

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n=== 파티 기본 편성 스모크 (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(3000);

    const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'));
    assert(loginReady, 'LoginScene 활성화');
    if (!loginReady) throw new Error('부팅 실패');

    await page.evaluate(() => window.game.scene.getScene('LoginScene')._handleGuestLogin());
    const mainMenu = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'));
    assert(mainMenu, '신규 게스트 로그인 → MainMenuScene');
    await page.waitForTimeout(800);

    const savedParty = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).parties[0],
      SAVE_KEY
    );
    assert(
      JSON.stringify(savedParty).includes('base_iris'),
      '신규 세이브의 현재 파티에 base_iris 포함',
      JSON.stringify(savedParty)
    );

    // --- 파티 편성 팝업 ---
    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').openPopup('partyedit'));
    await page.waitForTimeout(1200);

    const popupSlots = await page.evaluate(readSlots);
    assert(popupSlots[0] === 'base_iris', '팝업 슬롯 1에 아이리스 편성', JSON.stringify(popupSlots));
    await page.screenshot({ path: new URL('party-default-popup.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/party-default-popup.png');

    // --- 파티가 빈 세이브로 재접속하면 자동으로 다시 채워진다 ---
    await page.evaluate(() => {
      const popup = window.game.scene.getScene('MainMenuScene').activePopup;
      popup.close();
    });
    // openPopup은 activePopup이 남아 있으면 즉시 반환하므로 완전히 닫힐 때까지 기다린다
    await waitFor(page, () => !window.game.scene.getScene('MainMenuScene').activePopup, 10000);
    await page.evaluate((key) => {
      const save = JSON.parse(localStorage.getItem(key));
      save.parties[0] = [null, null, null, null];
      localStorage.setItem(key, JSON.stringify(save));
    }, SAVE_KEY);

    await page.reload();
    await page.waitForTimeout(3000);
    if (await page.evaluate(() => !!window.game?.scene.isActive('LoginScene'))) {
      await page.evaluate(() => window.game.scene.getScene('LoginScene')._handleGuestLogin());
    }
    const rebooted = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'));
    assert(rebooted, '파티가 빈 세이브로 재접속');
    await page.waitForTimeout(1000);

    const persisted = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)).parties[0],
      SAVE_KEY
    );
    assert(
      JSON.stringify(persisted).includes('base_iris'),
      '빈 파티가 로드 시 자동 편성되어 저장됨',
      JSON.stringify(persisted)
    );

    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').openPopup('partyedit'));
    await page.waitForTimeout(1500);
    const refilled = await page.evaluate(readSlots);
    assert(refilled[0] === 'base_iris', '재접속 후 팝업 슬롯 1에 아이리스', JSON.stringify(refilled));

    // --- PartyEditScene(전용 씬)도 동일하게 보인다 ---
    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').activePopup?.close());
    await waitFor(page, () => !window.game.scene.getScene('MainMenuScene').activePopup, 10000);
    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').scene.start('PartyEditScene'));
    const sceneUp = await waitFor(page, () => !!window.game?.scene.isActive('PartyEditScene'), 20000);
    assert(sceneUp, 'PartyEditScene 진입');
    await page.waitForTimeout(1000);

    const sceneSlots = await page.evaluate(() =>
      (window.game.scene.getScene('PartyEditScene').heroSlots || []).map((s) =>
        s.hero ? s.hero.id || s.hero.characterId : null
      )
    );
    assert(sceneSlots[0] === 'base_iris', '전용 씬 슬롯 1에 아이리스 편성', JSON.stringify(sceneSlots));
    await page.screenshot({ path: new URL('party-default-scene.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/party-default-scene.png');

    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));
  } catch (error) {
    failed += 1;
    console.log(`❌ 예외 발생 — ${error.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
