/**
 * gacha-visual-smoke.mjs — 소환 화면·결과 연출 시각 회귀 e2e
 *
 * 플레이 리포트 2건을 자동 검사로 고정한다.
 *   P1 「소환 화면에서 캐릭터가 배경 일러스트와 겹쳐 안 보임」
 *      → 배너 전신 스프라이트가 키 비주얼보다 **위 순번**에 있고 알파가 온전한지,
 *        키 비주얼은 눌려(알파 0.5 이하) 배경으로 물러났는지
 *   P0 「10연 소환 결과 화면이 보이지 않음」
 *      → 결과 카드 10장이 전부 **화면 안(visible bounds)** 에 있고 실효 알파 > 0.9 인지,
 *        재화가 모자랄 때의 안내 토스트가 화면 밖(y > GAME_HEIGHT)으로 나가지 않는지
 *
 * 캡처: docs/qa/playtest/gacha-banner-fixed.png
 *       docs/qa/playtest/gacha-ten-result-fixed.png
 *       docs/qa/playtest/gacha-ten-result-skip-fixed.png
 *       docs/qa/playtest/gacha-ssr-cutin-fixed.png
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/gacha-visual-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { blockHmr } from './hmr-guard.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SHOT_DIR = path.join(ROOT, 'docs', 'qa', 'playtest');
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const VIEWPORT = { width: 720, height: 1280 };

/** base 좌표계 기준 게임 해상도 (scaleConfig.js SSOT 와 같아야 한다) */
const GAME_WIDTH = 1080;
const GAME_HEIGHT = 1920;

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

async function waitFor(page, fn, timeout = 20000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch (e) { lastError = e.message; }
    await page.waitForTimeout(150);
  }
  if (lastError) console.log(`   (waitFor 마지막 예외: ${lastError.slice(0, 160)})`);
  return false;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
  console.log(`   📸 docs/qa/playtest/${name}.png`);
}

/**
 * 로그인 → MainMenuScene.
 * 개발 서버는 다른 작업의 HMR 리로드로 중간에 페이지가 갈릴 수 있어 몇 번 다시 시도한다.
 */
async function enterMainMenu(page, tries = 3) {
  for (let i = 0; i < tries; i++) {
    await waitFor(page, () => !!(window.game?.scene.isActive('LoginScene') || window.game?.scene.isActive('MainMenuScene')), 30000);
    try {
      if (await page.evaluate(() => !!window.game?.scene.isActive('LoginScene'))) {
        await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
      }
    } catch { /* 리로드 중 — 다시 시도 */ }
    if (await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 20000)) {
      // 세이브가 기록되기 전에 시드를 덮어쓰면 로그인 흐름이 되돌린다
      await waitFor(page, () => !!localStorage.getItem('arcane_collectors_save'), 10000);
      return true;
    }
  }
  return false;
}

/**
 * 10연 시나리오.
 * skipAt: 'none' 스킵 없이 끝까지 / 'stage1' 소환진 단계에서 스크림 탭 / 'reveal' 카드 공개 도중 [건너뛰기]
 */
const PULL_SCENARIOS = [
  { label: '스킵 없이 끝까지', skipAt: 'none', capture: 'gacha-ten-result-fixed' },
  { label: '1단계 스크림 탭 스킵', skipAt: 'stage1', capture: 'gacha-ten-result-skip-fixed' },
  { label: '카드 공개 도중 [건너뛰기] 스킵', skipAt: 'reveal', capture: false }
];

/** 소환 재화 보충 — 10연은 젬 2,700을 먹는다 (가챠는 에너지를 소비하지 않는다) */
async function topUp(page) {
  await page.evaluate(() => {
    window.debug?.addGems?.(50000);
  });
  await page.waitForTimeout(250);
}

/** 결과 그리드의 [확인] 을 실제 히트 영역 pointerdown 으로 누른다 */
async function tapConfirm(page) {
  const tapped = await page.evaluate(() => {
    const overlay = window.game.scene.getScene('MainMenuScene').activePopup?.resultOverlay;
    if (!overlay || !overlay.actionButtons.length) return { found: false };
    const button = overlay.actionButtons[overlay.actionButtons.length - 1];
    const hit = button.list.find((child) => child.input);
    if (!hit) return { found: false };
    const enabled = !!hit.input.enabled;
    if (enabled) hit.emit('pointerdown', {}, 0, 0, { stopPropagation() {} });
    return { found: true, enabled };
  });
  await page.waitForTimeout(500);
  return tapped;
}

/** 10연 1회 — 지정한 시점에 스킵하고 결과 그리드를 검사한다 */
async function runTenPull(page, { label, skipAt, capture }) {
  await topUp(page);
  await page.evaluate(() => window.game.scene.getScene('MainMenuScene').activePopup.performSummon(10, false));
  const up = await waitFor(page, () => !!window.game.scene.getScene('MainMenuScene')?.activePopup?.resultOverlay, 8000);
  assert(up, `[${label}] 10연 결과 오버레이 생성`);
  if (!up) return;

  if (skipAt === 'none') {
    // 컷인 단계 캡처 — SSR/SR 이 없으면 컷인 없이 그리드로 간다
    const cutin = await waitFor(
      page,
      () => window.game.scene.getScene('MainMenuScene')?.activePopup?.resultOverlay?.state?.stageId === 'cutin',
      10000
    );
    if (cutin) {
      await page.waitForTimeout(500);
      await shot(page, 'gacha-ssr-cutin-fixed');
    } else {
      console.log('   (이번 10연에 컷인 대상이 없어 컷인 캡처를 건너뜀)');
    }
  } else if (skipAt === 'stage1') {
    // 카드가 아직 하나도 만들어지지 않은 시점 — 여기서 스크림을 탭한다
    const before = await page.evaluate(() => {
      const overlay = window.game.scene.getScene('MainMenuScene').activePopup.resultOverlay;
      return { stage: overlay.state.stageId, cards: overlay.cards.length };
    });
    assert(
      before.cards === 0 && before.stage !== 'grid',
      `[${label}] 카드가 만들어지기 전 단계에서 스킵한다`,
      JSON.stringify(before)
    );
    await page.evaluate(() => {
      const overlay = window.game.scene.getScene('MainMenuScene').activePopup.resultOverlay;
      overlay.scrim.emit('pointerdown', {}, 0, 0, { stopPropagation() {} });
    });
  } else if (skipAt === 'reveal') {
    // 렌더 쪽 진실(카드 엔트리)로 판정한다 — 상태의 revealed 와 어긋나도 이 조건이 먼저다
    const inFlip = await waitFor(page, () => {
      const overlay = window.game.scene.getScene('MainMenuScene')?.activePopup?.resultOverlay;
      if (!overlay || overlay.state.stageId !== 'flip') return false;
      const opened = overlay.cards.filter((entry) => entry.revealed).length;
      return opened > 0 && opened < overlay.plan.count;
    }, 10000);
    assert(inFlip, `[${label}] 카드가 일부만 열린 시점을 잡았다`);
    await page.evaluate(() => {
      const overlay = window.game.scene.getScene('MainMenuScene').activePopup.resultOverlay;
      const hit = overlay.skipButton?.list.find((child) => child.input);
      if (hit) hit.emit('pointerdown', {}, 0, 0, { stopPropagation() {} });
      else overlay.skip();
    });
  }

  const settled = await waitFor(
    page,
    () => window.game.scene.getScene('MainMenuScene')?.activePopup?.resultOverlay?.isSettled === true,
    20000
  );
  assert(settled, `[${label}] 결과 그리드 단계 도달`);
  await page.waitForTimeout(700);

  const grid = await page.evaluate((size) => {
    const overlay = window.game.scene.getScene('MainMenuScene').activePopup.resultOverlay;
    const root = overlay.root;
    const layer = overlay.cardLayer;
    const chain = root.alpha * layer.alpha;
    const half = { w: 168 / 2, h: 234 / 2 };  // s(112) × s(156)
    return {
      skipped: !!overlay.state.skipped,
      rootVisible: root.visible,
      rootDepth: root.depth,
      count: overlay.cards.length,
      layerChildren: layer.list.length,
      cards: overlay.cards.map((entry) => {
        const c = entry.card;
        const w = half.w * Math.abs(c.scaleX);
        const h = half.h * Math.abs(c.scaleY);
        return {
          index: entry.index,
          alpha: +(c.alpha * chain).toFixed(3),
          visible: c.visible && layer.visible && root.visible,
          inBounds: c.x - w >= 0 && c.x + w <= size.w && c.y - h >= 0 && c.y + h <= size.h,
          children: c.list.length
        };
      })
    };
  }, { w: GAME_WIDTH, h: GAME_HEIGHT });

  const offscreen = grid.cards.filter((c) => !c.inBounds);
  const faded = grid.cards.filter((c) => !(c.alpha > 0.9) || !c.visible);
  assert(grid.count === 10 && grid.layerChildren >= 10, `[${label}] 결과 카드 10장 생성`, JSON.stringify({ count: grid.count, children: grid.layerChildren }));
  assert(grid.rootVisible && grid.rootDepth === 3010, `[${label}] 오버레이 루트가 전면(depth 3010)에 보인다`);
  assert(offscreen.length === 0, `[${label}] 카드 전부 화면 안(visible bounds)에 렌더`, JSON.stringify(offscreen));
  assert(faded.length === 0, `[${label}] 카드 전부 실효 알파 > 0.9 · visible`, JSON.stringify(faded));
  assert(grid.cards.filter((c) => c.children < 3).length === 0, `[${label}] 카드마다 표면·프레임·라벨이 들어 있다`);
  if (skipAt !== 'none') assert(grid.skipped, `[${label}] 스킵 상태로 그리드에 도달했다`);

  if (capture) await shot(page, capture);

  const confirm = await tapConfirm(page);
  assert(confirm.found && confirm.enabled, `[${label}] [확인] 버튼이 활성 상태로 눌린다`, JSON.stringify(confirm));
  const closed = await waitFor(page, () => !window.game.scene.getScene('MainMenuScene')?.activePopup?.resultOverlay, 5000);
  assert(closed, `[${label}] [확인] 으로 결과 연출이 닫힌다`);
}

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  const page = await browser.newPage({ viewport: VIEWPORT });

  // 공유 dev 서버 격리 — 남이 소스를 저장해도 이 페이지는 리로드되지 않는다.
  // 실증: node tests/e2e/hmr-guard-verify.mjs
  await blockHmr(page, BASE_URL);
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n=== 소환 시각 회귀 e2e (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => localStorage.setItem('arcane_debug_enabled', 'true'));
    await page.reload();
    await page.waitForTimeout(3000);
    assert(await enterMainMenu(page), '게스트 로그인 → MainMenuScene');

    // 튜토리얼 오버레이가 팝업을 덮지 않도록 완주 처리하고 재진입한다
    await page.evaluate(() => {
      const key = 'arcane_collectors_save';
      const save = JSON.parse(localStorage.getItem(key));
      save.tutorial = { ...(save.tutorial || {}), completed: true, currentStep: null };
      save.progress = { ...(save.progress || {}), clearedStages: { '1-1': 3, '1-2': 2 }, totalBattles: 20 };
      save.gacha = { ...(save.gacha || {}), freeTenPullUsed: true };
      save.resources = { ...(save.resources || {}), gems: 1500, summonTickets: 0 };
      localStorage.setItem(key, JSON.stringify(save));
    });
    await page.reload();
    await page.waitForTimeout(3500);
    assert(await enterMainMenu(page), '튜토리얼 완주 세이브로 MainMenuScene 재진입');
    await page.waitForTimeout(800);

    // ------------------------------------------------------------
    // 1. 재화 부족 안내가 화면 안에 그려지는가 (P0 — 무반응처럼 보이던 지점)
    // ------------------------------------------------------------
    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').openPopup('gacha'));
    assert(
      await waitFor(page, () => window.game.scene.getScene('MainMenuScene')?.activePopup?.isOpen === true),
      '소환 팝업 열림'
    );
    await page.waitForTimeout(900);

    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').activePopup.performSummon(10, false));
    await page.waitForTimeout(300);

    const toast = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainMenuScene');
      const found = scene.children.list.find((o) => o.type === 'Text' && o.depth === 4000);
      if (!found) return null;
      return { text: found.text, x: found.x, y: found.y, h: found.height, alpha: found.alpha };
    });
    assert(!!toast, '젬 부족 시 안내 토스트 생성', JSON.stringify(toast));
    assert(
      !!toast && toast.y > 0 && toast.y < GAME_HEIGHT,
      '안내 토스트가 화면 안(0 < y < 1920)에 있다',
      `y=${toast && toast.y} (GAME_HEIGHT=${GAME_HEIGHT})`
    );

    // ------------------------------------------------------------
    // 2. 배너 — 픽업 캐릭터가 배경 일러스트 위에서 주인공으로 읽히는가 (P1)
    // ------------------------------------------------------------
    await page.evaluate(() => window.debug?.addGems?.(50000));
    await page.waitForTimeout(200);

    const banner = await page.evaluate(() => {
      const panel = window.game.scene.getScene('MainMenuScene').activePopup?.bannerPanel;
      if (!panel) return null;
      panel.setBanner('pickup_iris_olympus');
      const list = panel.artLayer.list;
      const figure = panel._figure;
      const rim = panel._figureRim;
      // 키 비주얼은 배너 텍스처를 쓰는 Image 다 (전신 시트는 fb_/portrait 키)
      const keyVisual = list.find((o) => o.type === 'Image' && /^banner_pickup_/.test(o.texture?.key || ''));
      return {
        selectedId: panel.selectedId,
        figure: figure ? {
          key: figure.texture.key,
          index: list.indexOf(figure),
          alpha: figure.alpha,
          w: Math.round(figure.displayWidth),
          h: Math.round(figure.displayHeight),
          visible: figure.visible
        } : null,
        rimIndex: rim ? list.indexOf(rim) : -1,
        keyVisual: keyVisual ? {
          key: keyVisual.texture.key,
          index: list.indexOf(keyVisual),
          alpha: keyVisual.alpha,
          tinted: keyVisual.isTinted
        } : null,
        childCount: list.length
      };
    });
    await page.waitForTimeout(700);

    assert(!!banner?.figure, '배너에 픽업 전신 스프라이트가 있다', JSON.stringify(banner));
    assert(!!banner?.keyVisual, '배너에 키 비주얼 일러스트가 있다', JSON.stringify(banner?.keyVisual));
    assert(
      !!banner?.figure && !!banner?.keyVisual && banner.figure.index > banner.keyVisual.index,
      '전신 스프라이트가 키 비주얼보다 위 순번(앞)에 그려진다',
      `figure=${banner?.figure?.index} keyVisual=${banner?.keyVisual?.index}`
    );
    assert(
      !!banner?.figure && banner.figure.alpha > 0.9 && banner.figure.visible,
      '전신 스프라이트가 불투명하게 보인다',
      `alpha=${banner?.figure?.alpha}`
    );
    assert(
      !!banner?.keyVisual && banner.keyVisual.alpha <= 0.5,
      '키 비주얼이 눌려 배경으로 물러났다 (alpha ≤ 0.5)',
      `alpha=${banner?.keyVisual?.alpha}`
    );
    assert(
      banner?.rimIndex >= 0 && banner.rimIndex < banner.figure.index,
      '전신 바로 뒤에 교단색 백글로우가 깔려 있다',
      `rim=${banner?.rimIndex} figure=${banner?.figure?.index}`
    );
    await shot(page, 'gacha-banner-fixed');

    // ------------------------------------------------------------
    // 3. 10연 결과 — 스킵 없이 / 1단계에서 스킵 / 카드 공개 도중 스킵
    //
    // 카드는 3단계(flip)에서 만들어진다. 그 전에 스킵하면 카드가 영영 안 생겨
    // 빈 결과 패널만 떴다(플레이 리포트 "연출 중에 클릭해서 스킵하면 결과가 안 나온다").
    // 세 경로 모두 카드 10장 + 누를 수 있는 [확인] 로 수렴해야 한다.
    // ------------------------------------------------------------
    for (const scenario of PULL_SCENARIOS) {
      await runTenPull(page, scenario);
    }

    // ------------------------------------------------------------
    // 4. [다시 소환] 연쇄 — 에너지 0이어도 젬만 충분하면 10연이 끝까지 진행되어야 한다
    //
    // 가챠는 에너지를 소비하지 않는다(에너지는 전투/스테이지 전용 자원). 에너지를 0으로
    // 만들어 둔 채로 10연을 돌려도 결과 오버레이가 떠야 하며, '에너지가 부족합니다' 같은
    // 안내로 막혀선 안 된다.
    // ------------------------------------------------------------
    await topUp(page);
    await page.evaluate(() => window.debug?.setEnergy?.(0));
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainMenuScene');
      scene.children.list.filter((o) => o.type === 'Text' && o.depth === 4000).forEach((o) => o.destroy());
    });
    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').activePopup.performSummon(10, false));
    await waitFor(page, () => !!window.game.scene.getScene('MainMenuScene')?.activePopup?.resultOverlay, 8000);

    const again = await page.evaluate(() => {
      const overlay = window.game.scene.getScene('MainMenuScene').activePopup.resultOverlay;
      if (!overlay) return false;
      overlay.skip();
      if (!(overlay.actionButtons || []).length) return false;
      overlay._pullAgain();
      return true;
    });
    assert(again, '[다시 소환] 버튼이 결과 그리드에 있다');

    await page.waitForTimeout(1200);
    const feedback = await page.evaluate((size) => {
      const scene = window.game.scene.getScene('MainMenuScene');
      const overlay = scene.activePopup?.resultOverlay || null;
      const notice = scene.children.list.find((o) => o.type === 'Text' && o.depth === 4000);
      return {
        overlay: !!overlay,
        toast: notice ? { text: notice.text, y: notice.y, onScreen: notice.y > 0 && notice.y < size.h } : null,
        energy: window.__TEST_API__?.getEnergyStatus?.().current
      };
    }, { w: GAME_WIDTH, h: GAME_HEIGHT });

    assert(
      feedback.energy === 0,
      '에너지가 0인 상태에서 검사했다 (가챠가 우연히 에너지를 소비해 통과하는 거짓양성 방지)',
      `energy=${feedback.energy}`
    );
    assert(
      feedback.overlay,
      '에너지 0에서도 10연을 연속 2회(루프 3회 + 이번) 돌리면 젬만으로 끝까지 진행되어 결과 오버레이가 뜬다 — 에너지 부족 토스트로 막히지 않는다',
      JSON.stringify(feedback)
    );
    if (feedback.toast) {
      assert(
        !/에너지/.test(feedback.toast.text || ''),
        '표시된 안내가 에너지 부족 문구가 아니다',
        feedback.toast.text
      );
    }

    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));
  } catch (err) {
    failed += 1;
    console.log(`❌ 예외 발생 — ${err.message}`);
    console.error(err);
    try { await shot(page, 'gacha-visual-failure'); } catch { /* ignore */ }
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
