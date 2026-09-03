/**
 * memory-smoke.mjs — 씬 순환 메모리 스모크 (2026-09-03, 팀 리드 지시)
 *
 * 목적
 *   게스트 로그인 후 메인→영웅목록→상세→소환→스테이지→전투→결과→메인 순환을
 *   5회 반복하면서 매 회(메인메뉴 복귀 시점) 다음을 기록한다:
 *     - performance.memory.usedJSHeapSize (Chromium)
 *     - Phaser 텍스처 수 (game.textures.list 키 수)
 *     - 활성 트윈 수 (scene.tweens.getTweens().length 합산, 모든 활성 씬)
 *     - 활성 타이머 수 (scene.time._active.length 합산, 모든 활성 씬)
 *     - 씬 표시 객체 수 (scene.children.list.length 합산, 모든 활성 씬)
 *
 *   통과 기준(예산은 tools/art/asset-manifest.json 의 memoryBudget 필드가 SSOT):
 *     5회차가 1회차 대비 힙 +15% 이내, 텍스처 수 +10개 이내.
 *
 *   결과는 docs/qa/memory-smoke-result.json 에 저장한다(매 실행 덮어씀).
 *
 * 사전 조건: 개발 서버 실행 중 (npm run dev → http://localhost:3000)
 * 실행: node tests/e2e/memory-smoke.mjs [--headed]
 * 종료 코드: 실패 시 1 (예산 초과 포함)
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SCENE_TIMEOUT_MS = 45000;
const RESULT_PATH = join(ROOT, 'docs', 'qa', 'memory-smoke-result.json');

const manifest = JSON.parse(readFileSync(join(ROOT, 'tools', 'art', 'asset-manifest.json'), 'utf-8'));
const BUDGET = manifest.memoryBudget || { cycles: 5, heapGrowthMaxPercent: 15, textureCountGrowthMax: 10 };
const CYCLES = BUDGET.cycles || 5;

let passed = 0;
let failed = 0;
const assert = (condition, name, detail = '') => {
  if (condition) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/** 활성 씬을 하나 골라 대기(활성화될 때까지) */
async function waitForActiveScene(page, key, timeout = SCENE_TIMEOUT_MS) {
  await page.waitForFunction(
    (k) => !!(window.game && window.game.scene.isActive(k)),
    key,
    { timeout }
  );
}

/** window.game 전역에서 지금 이 순간의 메모리 스냅샷을 만든다 */
async function collectSnapshot(page, label) {
  // 가능하면 GC 를 강제해 노이즈를 줄인다(--js-flags=--expose-gc 로 launch 필요)
  await page.evaluate(() => {
    if (typeof window.gc === 'function') window.gc();
  });
  await page.waitForTimeout(150);

  return page.evaluate((lbl) => {
    const game = window.game;
    const mem = performance.memory
      ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize }
      : { usedJSHeapSize: null, totalJSHeapSize: null };

    const textureCount = Object.keys(game.textures.list).length;

    let tweenCount = 0;
    let timerCount = 0;
    let displayObjectCount = 0;
    const activeSceneKeys = [];

    game.scene.scenes.forEach((sc) => {
      if (!game.scene.isActive(sc.scene.key)) return;
      activeSceneKeys.push(sc.scene.key);
      if (sc.tweens && typeof sc.tweens.getTweens === 'function') {
        tweenCount += sc.tweens.getTweens().length;
      }
      if (sc.time && Array.isArray(sc.time._active)) {
        timerCount += sc.time._active.length;
      }
      if (sc.children && Array.isArray(sc.children.list)) {
        displayObjectCount += sc.children.list.length;
      }
    });

    return {
      label: lbl,
      heapUsedBytes: mem.usedJSHeapSize,
      heapTotalBytes: mem.totalJSHeapSize,
      textureCount,
      tweenCount,
      timerCount,
      displayObjectCount,
      activeSceneKeys,
    };
  }, label);
}

async function run() {
  const headless = !process.argv.includes('--headed');
  // 주의: --js-flags=--expose-gc 를 주면 이 앱(Phaser+WebGL)의 부팅 자체가
  // 멈춘다(원인 미상, 실측 확인됨). window.gc() 는 그냥 없는 채로 둔다 —
  // collectSnapshot() 이 이미 존재 여부를 확인하고 없으면 건너뛴다.
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });

  const pageErrors = [];
  page.on('pageerror', (err) => { pageErrors.push(`${err.name}: ${err.message}`); console.log('[pageerror]', err.message); });
  if (process.env.DEBUG_MEMORY_SMOKE) {
    page.on('console', (msg) => console.log(`[console.${msg.type()}]`, msg.text()));
  }

  // 게스트 자동 로그인 — LoginScene 스킵, BootScene → PreloadScene → MainMenuScene
  await page.addInitScript(() => {
    localStorage.setItem('arcane_auth', JSON.stringify({
      userId: 'guest_memory_smoke', authType: 'guest', autoLogin: true, lastLogin: Date.now(),
    }));
    localStorage.setItem('arcane_collectors_guest_user_guest', JSON.stringify({
      id: 'guest_memory_smoke', createdAt: Date.now(),
    }));
  });

  const snapshots = [];

  try {
    console.log(`\n=== 메모리 스모크 (${BASE_URL}) — ${CYCLES}회 순환 ===\n`);

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForActiveScene(page, 'MainMenuScene');
    await page.waitForTimeout(500);

    // 스테이지 데이터(1-1)와 파티는 BattleScene 이 SaveManager 기본 파티(base_iris)로
    // 자동 채우도록 빈 배열로 넘긴다. HeroDetailScene 은 신규 게스트 확정 지급 영웅인
    // base_iris 를 조회한다(BootScene._initRegistry() 가 registry.ownedHeroes 에 심어 둠).
    // Node 쪽에서 직접 읽는다 — 브라우저 안에서 동적 import('*.json') 은 Vite dev 서버가
    // MIME 타입을 application/json 으로 내려줘서 모듈로 취급하지 않는다(스펙상 허용 안 됨).
    const stagesJson = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'stages.json'), 'utf-8'));
    const stage = stagesJson.chapters[0].stages[0];

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      console.log(`--- 사이클 ${cycle}/${CYCLES} ---`);

      // 1. 영웅 목록
      await page.evaluate(() => window.game.scene.getScene('MainMenuScene').scene.start('HeroListScene'));
      await waitForActiveScene(page, 'HeroListScene');
      await page.waitForTimeout(400);

      // 2. 영웅 상세 (base_iris — 신규 게스트 확정 지급 영웅)
      await page.evaluate(() => {
        window.game.scene.getScene('HeroListScene').scene.start('HeroDetailScene', { heroId: 'base_iris' });
      });
      await waitForActiveScene(page, 'HeroDetailScene');
      await page.waitForTimeout(700); // 전신 시트 + @2x 로드 대기

      // 3. 소환 (GachaScene) — 실제 1회 소환을 트리거해 결과 연출까지 태운 뒤 강제 종료
      await page.evaluate(() => {
        window.game.scene.getScene('HeroDetailScene').scene.start('GachaScene');
      });
      await waitForActiveScene(page, 'GachaScene');
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const scene = window.game.scene.getScene('GachaScene');
        if (scene && typeof scene.onGemButton === 'function') scene.onGemButton(1);
      });
      await page.waitForTimeout(2500); // 소환 연출 진행
      await page.evaluate(() => {
        const scene = window.game.scene.getScene('GachaScene');
        if (scene && scene.resultOverlay) scene.resultOverlay.destroy();
      });
      await page.waitForTimeout(300);

      // 4. 스테이지 선택
      await page.evaluate(() => {
        window.game.scene.getScene('GachaScene').scene.start('StageSelectScene');
      });
      await waitForActiveScene(page, 'StageSelectScene');
      await page.waitForTimeout(400);

      // 5. 전투. BootScene._initRegistry() 가 registry.autoBattle 을 기본 false 로
      // 심어 둔다(사용자 설정값) — 그대로 두면 BattleScene 이 수동 턴 입력을 기다리며
      // 영원히 끝나지 않는다. 이 스모크는 전투 로직이 아니라 씬 메모리 수명이
      // 관심사이므로 자동전투로 강제해 결과 화면까지 자연 진행시킨다.
      // 결과 화면 전환 자체는 BattleScene 의 승패 판정 로직
      // (transitionManager.victoryTransition/defeatTransition)이 스스로 건다 — 여기서
      // 수동으로 scene.start('BattleResultScene', ...)를 또 부르면 진행 중이던 자동
      // 전환과 경합해 씬 매니저가 불안정해진다(실측 확인). 그래서 자연 발생을 기다린다.
      await page.evaluate(() => window.game.registry.set('autoBattle', true));
      await page.evaluate((stageData) => {
        window.game.scene.getScene('StageSelectScene').scene.start('BattleScene', {
          stage: stageData,
          party: [],
          mode: 'normal',
        });
      }, stage);
      await waitForActiveScene(page, 'BattleScene');

      // 6. 결과 화면 — 자동전투가 실제로 끝날 때까지 자연 대기
      await waitForActiveScene(page, 'BattleResultScene', 60000);
      await page.waitForTimeout(500);

      // 7. 메인으로 복귀 — 이 시점에 스냅샷을 찍는다(사이클의 안정된 공통 지점)
      await page.evaluate(() => {
        window.game.scene.getScene('BattleResultScene').scene.start('MainMenuScene');
      });
      await waitForActiveScene(page, 'MainMenuScene');
      await page.waitForTimeout(600);

      const snap = await collectSnapshot(page, `cycle_${cycle}`);
      snapshots.push(snap);
      console.log(
        `   heap=${snap.heapUsedBytes ? (snap.heapUsedBytes / 1024 / 1024).toFixed(2) + 'MB' : 'N/A'} ` +
        `textures=${snap.textureCount} tweens=${snap.tweenCount} timers=${snap.timerCount} displayObjs=${snap.displayObjectCount}`
      );
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    let heapGrowthPercent = null;
    if (first.heapUsedBytes && last.heapUsedBytes) {
      heapGrowthPercent = ((last.heapUsedBytes - first.heapUsedBytes) / first.heapUsedBytes) * 100;
    }
    const textureGrowth = last.textureCount - first.textureCount;
    const tweenGrowth = last.tweenCount - first.tweenCount;
    const timerGrowth = last.timerCount - first.timerCount;
    const displayObjGrowth = last.displayObjectCount - first.displayObjectCount;

    console.log('\n=== 결과 ===');
    if (heapGrowthPercent !== null) {
      console.log(`힙 증가율: ${heapGrowthPercent.toFixed(1)}% (예산 ${BUDGET.heapGrowthMaxPercent}%)`);
    } else {
      console.log('힙 측정 불가 (performance.memory 없음)');
    }
    console.log(`텍스처 증가: ${textureGrowth}개 (예산 ${BUDGET.textureCountGrowthMax}개)`);
    console.log(`트윈 증가: ${tweenGrowth}개 / 타이머 증가: ${timerGrowth}개 / 표시객체 증가: ${displayObjGrowth}개 (참고용, 예산 없음)`);

    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));
    if (heapGrowthPercent !== null) {
      assert(
        heapGrowthPercent <= BUDGET.heapGrowthMaxPercent,
        `힙 증가율이 예산(${BUDGET.heapGrowthMaxPercent}%) 이내`,
        `${heapGrowthPercent.toFixed(1)}%`
      );
    }
    assert(
      textureGrowth <= BUDGET.textureCountGrowthMax,
      `텍스처 수 증가가 예산(${BUDGET.textureCountGrowthMax}개) 이내`,
      `+${textureGrowth}`
    );

    const resultDoc = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      budget: BUDGET,
      snapshots,
      summary: {
        heapGrowthPercent,
        textureGrowth,
        tweenGrowth,
        timerGrowth,
        displayObjGrowth,
        pass: failed === 0,
      },
      pageErrors,
    };
    mkdirSync(dirname(RESULT_PATH), { recursive: true });
    writeFileSync(RESULT_PATH, JSON.stringify(resultDoc, null, 2) + '\n', 'utf-8');
    console.log(`\n결과 저장: ${RESULT_PATH}`);
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('메모리 스모크 실행 실패:', err);
  process.exit(1);
});
