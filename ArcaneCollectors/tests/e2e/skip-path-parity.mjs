/**
 * skip-path-parity.mjs — 컷씬 스킵 경로 무손실 회귀 (T-Q6, docs/STORY_MODE_GDD.md §9)
 *
 * "전 컷씬을 스킵한 경로에서 보상과 플래그가 동일한지 검증 — 생략 불가"
 *
 * 검증 내용
 *   게스트 신규 계정 A(모든 컷씬 정상 시청 — 대사 탭으로 진행) 와
 *   게스트 신규 계정 B(모든 컷씬 Skip All)로 각각 1-1 → 1-5 를 클리어한 뒤
 *   세이브를 덤프해 비교한다:
 *     - 재화 (gold / gems / summonTickets / spiritStones)
 *     - story.viewedCutscenes ∪ skippedCutscenes 집합 (시청/스킵 "분류"만 다르고 총 재생 이력은 같아야 함)
 *     - tutorial.completedSteps
 *     - onboarding.unlockedMenus
 *     - 클리어 스테이지 목록
 *   전투는 자동전투 경로(StageSelectScene.startBattle 실제 호출, autoBattle 유지)를 그대로 쓰되
 *   회귀 판정과 무관한 소요 시간을 줄이기 위해 registry.battleSpeed 를 부스트한다.
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/skip-path-parity.mjs [--headed]
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const VIEWPORT = { width: 720, height: 1280 };
const STAGE_IDS = ['1-1', '1-2', '1-3', '1-4', '1-5'];
const SAVE_KEY = 'arcane_collectors_save';
/** 실제 턴 진행 속도. UI 버튼 상한(3x)을 넘겨 회귀와 무관한 대기시간을 줄인다. */
const BATTLE_SPEED_BOOST = 8;

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
    try {
      if (await page.evaluate(fn)) return true;
    } catch (error) {
      // 다른 에이전트의 동시 저장으로 인한 HMR 리로드 등 일시적 네비게이션 오류는 흡수하고 계속 폴링한다
      if (!/Execution context was destroyed|context was destroyed|Target closed/.test(error.message || '')) {
        throw error;
      }
    }
    await page.waitForTimeout(150);
  }
  return false;
}

/** 동시 저장으로 인한 일시적 HMR 리로드를 흡수하는 evaluate 래퍼 (1회 재시도) */
async function safeEvaluate(page, fn, arg) {
  try {
    return await page.evaluate(fn, arg);
  } catch (error) {
    if (!/Execution context was destroyed|context was destroyed|Target closed/.test(error.message || '')) {
      throw error;
    }
    await page.waitForTimeout(500);
    return page.evaluate(fn, arg);
  }
}

/** CutsceneScene 이 떠 있으면 mode 에 따라 처리하고, 없으면 즉시 반환한다 */
async function handleCutsceneIfAny(page, mode) {
  // 보스 스테이지(1-5)는 BattleScene.create() 진입 1200ms 후 battleEntryTransition이 끝나며
  // boss_before 컷씬이 뜬다(실측 1400~2400ms). 감지 창이 짧으면 컷씬이 뜨기 전에 폴링이
  // 끝나버려 "컷씬 없음"으로 오판하므로 여유 있게 4000ms로 잡는다.
  const up = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'), 4000);
  if (!up) return false;

  if (mode === 'skip') {
    await safeEvaluate(page, () => window.game.scene.getScene('CutsceneScene')?.player?.skipAll());
  } else {
    // 대사 탭으로 진행 — CutscenePlayer의 화면 탭존이 호출하는 handleTap()을 직접 반복 호출한다
    // (실제 탭 좌표 클릭도 시도했으나, 씬 전환 직후 캔버스 scale/bounds 값이 아직 안정되지 않은
    //  타이밍에 클릭이 씹혀 무한 대기가 재현됨 — 탭 핸들러를 직접 호출해 동일한 진행 로직을
    //  좌표 의존 없이 결정적으로 재현한다. `inputLockedUntil` 디바운스가 있어 각 호출 사이에는
    //  실제 탭 간격과 동등한 지연을 둔다)
    for (let i = 0; i < 200; i += 1) {
      const stillUp = await safeEvaluate(page, () => !!window.game?.scene.isActive('CutsceneScene'));
      if (!stillUp) break;
      await safeEvaluate(page, () => window.game.scene.getScene('CutsceneScene')?.player?.handleTap());
      await page.waitForTimeout(220);
    }
  }
  await waitFor(page, () => !window.game?.scene.isActive('CutsceneScene'), 8000);
  await page.waitForTimeout(200);
  return true;
}

/**
 * 온보딩 배선 이후, 게스트 로그인 직후 프롤로그(T-01/T-02) 컷씬이 자동 재생되며
 * MainMenuScene 을 일시정지시킨다. 계정 A는 대사 탭, 계정 B는 Skip All 로 처리해
 * 두 계정이 서로 다른 경로를 타되 진행은 동일하게 이어지도록 한다.
 */
async function clearPrologue(page, mode) {
  let handled = 0;

  // 컷씬 개수를 세지 않고 "T-01/T-02 커밋 완료"를 기준으로 기다린다.
  // T-02 컷씬은 T-01 커밋 후 한 박자 뒤에 뜨므로 단순 카운트로는 놓친다.
  for (let i = 0; i < 8; i += 1) {
    const done = await safeEvaluate(page, () => {
      const raw = localStorage.getItem('arcane_collectors_save');
      const steps = raw ? (JSON.parse(raw).tutorial?.completedSteps || []) : [];
      return steps.includes('T-01') && steps.includes('T-02');
    });
    if (done) break;

    const seen = await handleCutsceneIfAny(page, mode);
    if (seen) handled += 1;
    await page.waitForTimeout(500);
  }

  await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000);
  return handled;
}

async function loginGuest(page, mode = 'skip') {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => !!(window.game && window.game.scene && window.game.scene.scenes.length > 0),
    { timeout: 20000 }
  );

  const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'), 15000);
  if (!loginReady) throw new Error('LoginScene 활성화 실패');

  await safeEvaluate(page, () => {
    window.game.scene.getScene('LoginScene')?._handleGuestLogin?.();
  });
  const mainMenu = await waitFor(
    page,
    () => !!(window.game?.scene.isActive('MainMenuScene') || window.game?.scene.isActive('CutsceneScene')),
    15000
  );
  if (!mainMenu) throw new Error('게스트 로그인 → MainMenuScene 진입 실패');

  // 프롤로그 컷씬(T-01/T-02) 처리 — 처리하지 않으면 MainMenuScene 이 일시정지 상태로 남는다
  const prologue = await clearPrologue(page, mode);
  if (prologue > 0) console.log(`   프롤로그 컷씬 ${prologue}건 처리 (mode=${mode})`);

  await safeEvaluate(page, (speed) => window.game.registry.set('battleSpeed', speed), BATTLE_SPEED_BOOST);

  // 회귀 판정과 무관한 전투 밸런스 변수를 제거하기 위해 디버그 치트로 파티를 보강한다
  // (LoginScene이 기본적으로 registry.autoBattle=false로 강제하고, 챕터1 조우가 신규 1인 파티에게
  //  버거운 경우가 있어 그대로 두면 스킵/시청 계정 모두 승패가 갈려 회귀 판정이 어려워진다.
  //  두 계정에 동일하게 적용하므로 스킵 경로 무손실 판정 자체는 왜곡하지 않는다)
  await safeEvaluate(page, () => {
    window.debug.unlockAllCharacters();
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
    save.characters.forEach((c) => window.debug.setCharacterLevel(c.id, 60));
    window.debug._refreshHeroRegistry();
  });
}

/**
 * BattleScene 이 떠 있는 동안 강제로 자동전투를 유지하며 최종적으로 "재개된"(pause 아닌)
 * BattleResultScene 을 기다린다.
 * LoginScene이 registry.autoBattle=false 로 초기화하므로 매 폴링마다 켜준다.
 *
 * 주의: 승리 시 BattleResultScene.create()가 stage_clear/boss_after 컷씬을 먼저 띄우고
 * 자기 자신은 scene.pause()로 잠시 멈춘다. Phaser의 isActive()는 PAUSED 상태를 false로
 * 보고하므로, 그 사이에 뜨는 CutsceneScene을 이 루프 안에서 직접 처리해야
 * "정지된 BattleResultScene을 영원히 기다리는" 교착을 피할 수 있다.
 */
async function waitForBattleEnd(page, mode, timeout = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const cutsceneActive = await safeEvaluate(page, () => !!window.game?.scene.isActive('CutsceneScene'));
    if (cutsceneActive) {
      await handleCutsceneIfAny(page, mode);
      continue;
    }

    const state = await safeEvaluate(page, (speed) => {
      if (window.game?.scene.isActive('BattleResultScene')) return 'result';
      const bs = window.game?.scene.getScene('BattleScene');
      if (bs && window.game.scene.isActive('BattleScene')) {
        bs.battleSpeed = speed;
        bs.autoBattle = true;
        window.game.registry.set('autoBattle', true);
        window.game.registry.set('battleSpeed', speed);
        if (bs.waitingForManualInput && !bs.isProcessingTurn && !bs.battleEnded) {
          bs.waitingForManualInput = false;
          bs.processTurn();
        }
      }
      return 'pending';
    }, BATTLE_SPEED_BOOST);
    if (state === 'result') return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** MainMenuScene 이 활성화될 때까지 정리한다 (BattleResultScene 등에서 복귀) */
async function returnToMainMenu(page, mode = 'skip') {
  await safeEvaluate(page, () => {
    if (window.game.scene.isActive('BattleResultScene')) {
      window.game.scene.getScene('BattleResultScene').goToMain();
    }
  });

  // 메인 메뉴 진입 시 튜토리얼(T-01/T-02)이 컷씬을 자동 재생하면 MainMenuScene 은 일시정지 상태다.
  // 컷씬을 먼저 처리한 뒤에 복귀를 판정한다.
  let ok = false;
  for (let i = 0; i < 4 && !ok; i += 1) {
    ok = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 8000);
    if (!ok) await handleCutsceneIfAny(page, mode);
  }
  if (!ok) throw new Error('MainMenuScene 복귀 실패');
  await page.waitForTimeout(250);
}

/**
 * 스테이지 1개를 실제 UI 경로로 클리어한다.
 * 패배 시 최대 2회까지 재도전한다(패배는 보상 0이므로 최종 결과 비교에는 영향 없음).
 */
async function clearStage(page, stageId, mode) {
  await returnToMainMenu(page, mode);

  await safeEvaluate(page, () => {
    window.game.scene.getScene('MainMenuScene').scene.start('StageSelectScene');
  });
  const stageSelectUp = await waitFor(page, () => !!window.game?.scene.isActive('StageSelectScene'), 10000);
  if (!stageSelectUp) throw new Error(`[${stageId}] StageSelectScene 진입 실패`);
  await page.waitForTimeout(300);

  const launched = await safeEvaluate(page, (sid) => {
    const scene = window.game.scene.getScene('StageSelectScene');
    const chapter = parseInt(sid.split('-')[0], 10);
    const stage = scene.generateStages(chapter).find((s) => s.id === sid);
    if (!stage) return false;
    scene.selectedStage = stage;
    scene.showPartySelect();
    scene.autoFillParty();
    scene.startBattle();
    return true;
  }, stageId);
  if (!launched) throw new Error(`[${stageId}] 스테이지 정의를 찾지 못함`);

  // startBattle() 직후 뜰 수 있는 chapter_enter/stage_enter 컷씬
  await handleCutsceneIfAny(page, mode);

  let victory = false;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // battleEntryTransition(1200ms) 직후 BattleScene이 boss_before 컷씬으로 즉시 scene.pause()될
    // 수 있다(1-5). Phaser의 isActive()는 PAUSED 상태를 false로 보고하므로 isActive만 보면
    // 이미 생성됐지만 일시정지된 BattleScene을 "아직 진입 안 함"으로 오판한다. isPaused도 함께 본다.
    const battleUp = await waitFor(
      page,
      () => !!(window.game?.scene.isActive('BattleScene') || window.game?.scene.isPaused('BattleScene')),
      15000
    );
    if (!battleUp) throw new Error(`[${stageId}] BattleScene 진입 실패 (시도 ${attempt})`);

    await safeEvaluate(page, (speed) => {
      const bs = window.game.scene.getScene('BattleScene');
      if (bs) bs.battleSpeed = speed;
      window.game.registry.set('battleSpeed', speed);
    }, BATTLE_SPEED_BOOST);

    // BattleScene.create() 내부에서 뜰 수 있는 boss_before 컷씬 (1-5)
    await handleCutsceneIfAny(page, mode);

    // BattleResultScene.create()가 승리 시 stage_clear/boss_after 컷씬을 먼저 띄우므로
    // waitForBattleEnd 내부에서 그 컷씬까지 함께 처리한 뒤 "재개된" 결과 화면을 기다린다.
    const resultUp = await waitForBattleEnd(page, mode, 90000);
    if (!resultUp) throw new Error(`[${stageId}] 전투 종료(BattleResultScene) 대기 실패 (시도 ${attempt})`);

    victory = await safeEvaluate(page, () => window.game.scene.getScene('BattleResultScene').victory);
    if (victory) break;

    if (attempt < 2) {
      console.log(`   ↻ [${stageId}] 패배 — 재도전 (${attempt}/2)`);
      await safeEvaluate(page, () => window.game.scene.getScene('BattleResultScene').retryBattle());
    }
  }

  await page.waitForTimeout(200);
  return victory;
}

function normalizeSet(arr) {
  return Array.from(new Set(arr || [])).sort();
}

function extractComparableState(save) {
  return {
    resources: {
      gold: save.resources?.gold,
      gems: save.resources?.gems,
      summonTickets: save.resources?.summonTickets,
      spiritStones: save.resources?.spiritStones
    },
    cutsceneUnion: normalizeSet([
      ...(save.story?.viewedCutscenes || []),
      ...(save.story?.skippedCutscenes || [])
    ]),
    tutorialCompletedSteps: normalizeSet(save.tutorial?.completedSteps),
    unlockedMenus: normalizeSet(save.onboarding?.unlockedMenus),
    clearedStages: normalizeSet(Object.keys(save.progress?.clearedStages || {}))
  };
}

async function runAccount(browser, mode) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n--- 계정 ${mode === 'watch' ? 'A(시청)' : 'B(스킵)'} 진행 시작 ---`);
    await loginGuest(page, mode);

    const clearedFlags = {};
    for (const stageId of STAGE_IDS) {
      const victory = await clearStage(page, stageId, mode);
      clearedFlags[stageId] = victory;
      console.log(`   ${victory ? '🏆' : '💀'} [${mode}] ${stageId} ${victory ? '클리어' : '실패'}`);
    }

    const save = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, SAVE_KEY);

    return { save, clearedFlags, pageErrors };
  } finally {
    await context.close();
  }
}

/** HMR 등 외부 요인으로 인한 실패를 흡수하기 위한 1회 재시도 래퍼 */
async function runAccountWithRetry(browser, mode) {
  try {
    return await runAccount(browser, mode);
  } catch (error) {
    console.log(`⚠️ [${mode}] 1차 시도 실패 — 재시도: ${error.message}`);
    return await runAccount(browser, mode);
  }
}

async function run() {
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });

  try {
    console.log(`\n=== 컷씬 스킵 경로 무손실 회귀 — T-Q6 (${BASE_URL}) ===\n`);

    const resultA = await runAccountWithRetry(browser, 'watch');
    const resultB = await runAccountWithRetry(browser, 'skip');

    assert(!!resultA.save, '계정 A(시청) 세이브 덤프 성공');
    assert(!!resultB.save, '계정 B(스킵) 세이브 덤프 성공');
    assert(resultA.pageErrors.length === 0, '계정 A 처리되지 않은 예외 0건', resultA.pageErrors.join(' | '));
    assert(resultB.pageErrors.length === 0, '계정 B 처리되지 않은 예외 0건', resultB.pageErrors.join(' | '));

    assert(
      STAGE_IDS.every((id) => resultA.clearedFlags[id]),
      '계정 A(시청) 1-1~1-5 전부 클리어',
      JSON.stringify(resultA.clearedFlags)
    );
    assert(
      STAGE_IDS.every((id) => resultB.clearedFlags[id]),
      '계정 B(스킵) 1-1~1-5 전부 클리어',
      JSON.stringify(resultB.clearedFlags)
    );

    if (!resultA.save || !resultB.save) {
      console.log('\n결과: 세이브를 확보하지 못해 비교를 진행할 수 없음\n');
      process.exit(1);
    }

    const stateA = extractComparableState(resultA.save);
    const stateB = extractComparableState(resultB.save);

    console.log('\n--- 상태 비교 ---');
    console.log('A(시청):', JSON.stringify(stateA, null, 2));
    console.log('B(스킵):', JSON.stringify(stateB, null, 2));

    // 스킵 계정은 skippedCutscenes 가 채워져 있어야 "실제로 스킵 경로를 탔다"는 증거가 된다
    const skippedNonEmpty = (resultB.save.story?.skippedCutscenes || []).length > 0;
    assert(skippedNonEmpty, '계정 B — skippedCutscenes 기록 존재(실제 스킵 경로 확인)', JSON.stringify(resultB.save.story?.skippedCutscenes));
    const watchedNoSkip = (resultA.save.story?.skippedCutscenes || []).length === 0;
    assert(watchedNoSkip, '계정 A — skippedCutscenes 없음(실제 시청 경로 확인)', JSON.stringify(resultA.save.story?.skippedCutscenes));

    // 재화 동일성
    for (const key of Object.keys(stateA.resources)) {
      assert(
        stateA.resources[key] === stateB.resources[key],
        `재화 동일 — resources.${key}`,
        `A=${stateA.resources[key]} B=${stateB.resources[key]}`
      );
    }

    assert(
      JSON.stringify(stateA.cutsceneUnion) === JSON.stringify(stateB.cutsceneUnion),
      'viewedCutscenes ∪ skippedCutscenes 집합 동일 (시청/스킵 분류만 다름)',
      `A=${JSON.stringify(stateA.cutsceneUnion)}\n      B=${JSON.stringify(stateB.cutsceneUnion)}`
    );

    assert(
      JSON.stringify(stateA.tutorialCompletedSteps) === JSON.stringify(stateB.tutorialCompletedSteps),
      'tutorial.completedSteps 동일',
      `A=${JSON.stringify(stateA.tutorialCompletedSteps)} B=${JSON.stringify(stateB.tutorialCompletedSteps)}`
    );

    assert(
      JSON.stringify(stateA.unlockedMenus) === JSON.stringify(stateB.unlockedMenus),
      'onboarding.unlockedMenus 동일',
      `A=${JSON.stringify(stateA.unlockedMenus)} B=${JSON.stringify(stateB.unlockedMenus)}`
    );

    assert(
      JSON.stringify(stateA.clearedStages) === JSON.stringify(stateB.clearedStages),
      '클리어 스테이지 목록 동일',
      `A=${JSON.stringify(stateA.clearedStages)} B=${JSON.stringify(stateB.clearedStages)}`
    );

    // 참고 진단 — 보스 클리어 컷씬(boss_after)이 실제로 트리거되는지 관찰 기록
    const has15After = stateA.cutsceneUnion.includes('cs_1_5_boss_after');
    assert(has15After, '1-5 클리어 시 cs_1_5_boss_after 컷씬이 실제로 트리거됨', JSON.stringify(stateA.cutsceneUnion));
  } catch (error) {
    failed += 1;
    console.log(`❌ 예외 발생 — ${error.message}`);
    console.log(error.stack);
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
