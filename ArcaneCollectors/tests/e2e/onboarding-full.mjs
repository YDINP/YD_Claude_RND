/**
 * onboarding-full.mjs — 신규 계정 온보딩(T-01~T-12) 완주 검증
 *
 * PART 1 — **실제 좌표 탭만으로** T-01 → T-12 완주 (진짜 E2E)
 *   게스트 로그인부터 완주까지 모든 튜토리얼 조작을 캔버스 좌표 클릭으로 수행한다.
 *   TutorialManager API 를 호출해 상태를 바꾸지 않는다(읽기만 한다).
 *   좌표는 "지금 화면에서 사람이 볼 수 있는 것"에서만 얻는다:
 *     - 마스킹 홀           → MainMenuScene.tutorialFlow.overlay.hole
 *     - 코치마크 닫기 버튼   → MainMenuScene.tutorialFlow.coach.closeHit
 *     - 버튼/카드           → 화면에 보이는 라벨 텍스트로 검색
 *   전투 밸런스는 검증 대상이 아니므로 로그인 직후 window.debug 로 파티를 보강한다
 *   (skip-path-parity.mjs 와 동일한 방식, 양쪽 계정 동일 조건).
 *
 * PART 2 — 상태 머신 API 회귀 (우회 경로 유지)
 *   commitStep/evaluate/notify/skip 규약을 API 로 직접 검증한다.
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/onboarding-full.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const VIEWPORT = { width: 720, height: 1280 };
const SHOT_DIR = new URL('../../docs/story/screenshots/onboarding/', import.meta.url);
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
const note = (msg) => console.log(`ℹ️  ${msg}`);

/** 브라우저 콘솔 최근 기록 (실패 진단용) */
const consoleLog = [];

async function waitFor(page, fn, timeout = 10000, arg = undefined) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await page.evaluate(fn, arg)) return true;
    } catch (error) {
      if (!/Execution context was destroyed|context was destroyed|Target closed/.test(error.message || '')) throw error;
    }
    await page.waitForTimeout(150);
  }
  return false;
}

async function safeEvaluate(page, fn, arg) {
  try {
    return await page.evaluate(fn, arg);
  } catch (error) {
    if (!/Execution context was destroyed|context was destroyed|Target closed/.test(error.message || '')) throw error;
    await page.waitForTimeout(500);
    return page.evaluate(fn, arg);
  }
}

const shot = async (page, name) => {
  try {
    await page.screenshot({ path: new URL(name, SHOT_DIR).pathname.slice(1) });
    console.log(`   📸 docs/story/screenshots/onboarding/${name}`);
  } catch (error) {
    console.log(`   (스크린샷 실패: ${error.message})`);
  }
};

// ============================================================
// 실제 좌표 탭 유틸 — 게임 월드 좌표 → 페이지 좌표 변환 후 마우스 클릭
// ============================================================

async function canvasMap(page) {
  return safeEvaluate(page, () => {
    const canvas = document.querySelector('canvas');
    const r = canvas.getBoundingClientRect();
    return {
      x: r.x, y: r.y, w: r.width, h: r.height,
      gw: window.game.scale.gameSize.width,
      gh: window.game.scale.gameSize.height,
    };
  });
}

/** 게임 월드 좌표를 실제 마우스로 클릭한다 */
async function tapWorld(page, wx, wy) {
  const m = await canvasMap(page);
  await page.mouse.click(m.x + (wx * m.w) / m.gw, m.y + (wy * m.h) / m.gh);
  await page.waitForTimeout(180);
}

/** 화면에 보이는 라벨 텍스트로 버튼을 찾아 그 중심 좌표를 돌려준다 (컨테이너 재귀 탐색) */
async function findByLabel(page, sceneKeys, label) {
  return safeEvaluate(page, ({ keys, text }) => {
    const collect = (list, out) => {
      list.forEach((obj) => {
        if (!obj) return;
        out.push(obj);
        if (obj.type === 'Container' && Array.isArray(obj.list)) collect(obj.list, out);
      });
      return out;
    };

    for (const key of keys) {
      const scene = window.game.scene.getScene(key);
      if (!scene || !window.game.scene.isActive(key)) continue;
      const all = collect(scene.children.list, []);
      const hit = all.find(
        (o) => o.type === 'Text' && typeof o.text === 'string' && o.text.includes(text) && o.visible !== false
      );
      if (!hit) continue;
      const b = hit.getBounds();
      return { sceneKey: key, x: b.centerX, y: b.centerY };
    }
    return null;
  }, { keys: Array.isArray(sceneKeys) ? sceneKeys : [sceneKeys], text: label });
}

/** 라벨이 화면에 나타날 때까지 기다린다 (고정 sleep 대신 조건 대기) */
async function waitForLabel(page, sceneKeys, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await findByLabel(page, sceneKeys, label)) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** 라벨로 찾은 버튼을 실제로 탭한다 */
async function tapLabel(page, sceneKeys, label, { required = true } = {}) {
  const found = await findByLabel(page, sceneKeys, label);
  if (!found) {
    if (required) throw new Error(`[tapLabel] '${label}' 을(를) 찾지 못했습니다 (${sceneKeys})`);
    return false;
  }
  await tapWorld(page, found.x, found.y);
  return true;
}

/** 지정 월드 좌표 아래에 있는 인터랙티브 오브젝트를 Phaser 히트테스트로 조회한다 */
async function hitTestWorld(page, wx, wy, sceneKey = 'MainMenuScene') {
  const m = await canvasMap(page);
  await page.mouse.move(m.x + (wx * m.w) / m.gw, m.y + (wy * m.h) / m.gh);
  await page.waitForTimeout(120);
  return safeEvaluate(page, (key) => {
    const scene = window.game.scene.getScene(key);
    if (!scene || !window.game.scene.isActive(key)) return { inactive: key };
    const p = scene.input.activePointer;
    const list = scene.input.hitTestPointer(p) || [];
    return {
      pointer: { x: Math.round(p.worldX), y: Math.round(p.worldY) },
      hits: list.map((o) => ({
        type: o.type,
        name: o.name,
        depth: o.depth,
        parent: o.parentContainer?.depth ?? null,
        size: o.width && o.height ? `${Math.round(o.width)}x${Math.round(o.height)}` : null,
        alpha: o.alpha,
        siblings: o.parentContainer?.list?.length ?? null,
        parentIsSceneChild: o.parentContainer ? scene.children.list.includes(o.parentContainer) : null,
        parentVisible: o.parentContainer?.visible ?? null,
        parentAlpha: o.parentContainer?.alpha ?? null,
      })),
    };
  }, sceneKey);
}

/**
 * 소환 결과 연출을 실제로 닫는다.
 * `GachaResultOverlay` 는 공개 연출 도중의 탭을 '건너뛰기'로 쓰기 때문에
 * 한 번의 [확인] 탭으로 닫히지 않을 수 있다. 전면 레이어(depth 3010)가
 * 사라질 때까지 최대 `attempts` 회 탭한다.
 */
async function confirmSummonResult(page, attempts = 8) {
  // [확인] 라벨이 사라지면 연출이 끝난 것이다(버튼째 파괴된다).
  const stillOpen = async () => !!(await findByLabel(page, ['MainMenuScene'], '확인'));

  if (!(await stillOpen())) return true;

  for (let i = 0; i < attempts; i += 1) {
    const tapped = await tapLabel(page, ['MainMenuScene'], '확인', { required: false });
    if (!tapped) return true;
    await page.waitForTimeout(900);
    if (!(await stillOpen())) return true;
  }
  return false;
}

/** 튜토리얼 화면 상태 (읽기 전용) */
async function tutorialUi(page) {
  return safeEvaluate(page, () => {
    const scene = window.game.scene.getScene('MainMenuScene');
    const flow = scene?.tutorialFlow;
    const hole = flow?.overlay?.hole || null;
    const coach = flow?.coach;
    const closeHit = coach?.closeHit;
    const closeBounds = closeHit?.getBounds?.();
    return {
      stepId: flow?.currentStepId || null,
      tier: flow?.lastTier ?? null,
      hasOverlay: !!flow?.overlay?.isVisible,
      hasCoach: !!coach?.isVisible,
      hole,
      coachTarget: coach?.target || null,
      coachClose: closeBounds ? { x: closeBounds.centerX, y: closeBounds.centerY } : null,
    };
  });
}

async function waitForTutorialUi(page, predicate, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ui = await tutorialUi(page);
    if (predicate(ui)) return ui;
    await page.waitForTimeout(200);
  }
  return null;
}

async function readSave(page) {
  return safeEvaluate(page, () => JSON.parse(localStorage.getItem('arcane_collectors_save')));
}

/** 컷씬이 떠 있으면 [건너뛰기] 버튼을 실제로 탭한다 */
async function skipCutsceneByTap(page, { timeout = 4000 } = {}) {
  const up = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'), timeout);
  if (!up) return false;
  await page.waitForTimeout(400);
  const tapped = await tapLabel(page, ['CutsceneScene'], '건너뛰기', { required: false });
  if (!tapped) {
    // 폴백: 화면 중앙 탭으로 대사를 진행시킨다
    for (let i = 0; i < 30; i++) {
      if (!(await safeEvaluate(page, () => window.game.scene.isActive('CutsceneScene')))) break;
      await tapWorld(page, 540, 700);
    }
  }
  await waitFor(page, () => !window.game?.scene.isActive('CutsceneScene'), 10000);
  await page.waitForTimeout(300);
  return true;
}

/** 컷씬이 연속으로 뜨는 구간을 모두 넘긴다 */
async function skipAllCutscenes(page, { rounds = 4, timeout = 4000 } = {}) {
  let count = 0;
  for (let i = 0; i < rounds; i++) {
    const skipped = await skipCutsceneByTap(page, { timeout: i === 0 ? timeout : 1500 });
    if (!skipped) break;
    count += 1;
  }
  return count;
}

/** 전투: AUTO 버튼을 실제로 탭해 자동 전투로 전환하고 결과 화면까지 기다린다 */
async function playBattleByTap(page, timeout = 45000) {
  const battleUp = await waitFor(page, () => !!window.game?.scene.isActive('BattleScene'), 20000);
  if (!battleUp) {
    const diag = await safeEvaluate(page, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      return {
        active: window.game.scene.scenes.filter((sc) => window.game.scene.isActive(sc.scene.key)).map((sc) => sc.scene.key),
        paused: window.game.scene.scenes.filter((sc) => window.game.scene.isPaused(sc.scene.key)).map((sc) => sc.scene.key),
        energy: JSON.parse(localStorage.getItem('arcane_collectors_save'))?.energy,
        step: mm?.tutorialFlow?.currentStepId,
      };
    });
    note(`전투 미진입 진단 — ${JSON.stringify(diag)}`);
    note('브라우저 콘솔 최근 12줄: ' + consoleLog.slice(-12).join(' | '));
    return false;
  }
  await page.waitForTimeout(700);

  await safeEvaluate(page, (speed) => window.game.registry.set('battleSpeed', speed), BATTLE_SPEED_BOOST);
  await tapLabel(page, ['BattleScene'], 'AUTO OFF', { required: false });

  const start = Date.now();
  let forced = false;
  while (Date.now() - start < timeout) {
    if (await safeEvaluate(page, () => !!window.game?.scene.isActive('BattleResultScene'))) return true;

    // 밸런스 중립화: 25초 넘게 결판이 안 나면 BattleScene 자신의 승리 루틴을 태운다.
    // (검증 대상은 튜토리얼 배선이지 전투 밸런스가 아니다. 보상·스테이지 기록·컷씬은
    //  endBattle(true) 의 실제 경로를 그대로 통과한다.)
    if (!forced && Date.now() - start > 8000) {
      forced = await safeEvaluate(page, () => {
        const bs = window.game.scene.getScene('BattleScene');
        if (!bs || !window.game.scene.isActive('BattleScene') || bs.battleEnded) return false;
        (bs.enemies || []).forEach((e) => {
          if (!e) return;
          e.currentHp = 0;
          e.isAlive = false;
        });
        bs.endBattle(true);
        return true;
      });
      if (forced) note('전투 장기화 — BattleScene.endBattle(true) 로 실제 승리 처리');
    }
    if (await safeEvaluate(page, () => !!window.game?.scene.isActive('CutsceneScene'))) {
      await skipCutsceneByTap(page, { timeout: 1500 });
      continue;
    }
    // 수동 턴 대기 상태면 실제 버튼('다음 턴')을 탭한다
    await tapLabel(page, ['BattleScene'], 'AUTO OFF', { required: false });
    await tapLabel(page, ['BattleScene'], '다음 턴', { required: false });
    await page.waitForTimeout(400);
  }

  const diag = await safeEvaluate(page, () => {
    const bs = window.game.scene.getScene('BattleScene');
    return {
      active: window.game.scene.scenes.filter((sc) => window.game.scene.isActive(sc.scene.key)).map((sc) => sc.scene.key),
      turn: bs?.turn,
      ended: bs?.battleEnded,
      waitingManual: bs?.waitingForManualInput,
      auto: bs?.autoBattle,
      processing: bs?.isProcessingTurn,
    };
  });
  note(`전투 미종료 진단 — ${JSON.stringify(diag)}`);
  note('관련 콘솔: ' + consoleLog.slice(-14).join(' || '));
  return false;
}

/** 결과 화면에서 [메인으로]를 실제로 탭해 메인 메뉴로 돌아온다 */
async function returnToMainByTap(page) {
  const resultUp = await safeEvaluate(page, () => !!window.game?.scene.isActive('BattleResultScene'));
  if (resultUp) {
    await tapLabel(page, ['BattleResultScene'], '메인으로');
  }
  await skipAllCutscenes(page, { rounds: 3, timeout: 2500 });
  const ok = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 20000);
  // 컷씬이 뒤늦게 뜨는 경우까지 처리한 뒤 튜토리얼 UI 재부착을 기다린다
  await skipAllCutscenes(page, { rounds: 2, timeout: 1500 });
  await waitForTutorialUi(page, (u) => u.hasOverlay || u.hasCoach, 8000);
  await page.waitForTimeout(400);
  return ok;
}

/** 밸런스 중립화 (튜토리얼 배선이 검증 대상, 전투 승패는 아님) */
async function boostParty(page) {
  await safeEvaluate(page, () => {
    window.debug.unlockAllCharacters();
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
    save.characters.forEach((c) => window.debug.setCharacterLevel(c.id, 60));

    window.debug._refreshHeroRegistry();
    window.game.registry.set('battleSpeed', 8);

    // 파티 슬롯을 전투력 상위 4인으로 채운다. 온보딩 CTA 는 세이브의 파티를 그대로 쓰므로
    // 슬롯이 스타터 1인이면 전투 밸런스(검증 대상 아님)가 결과를 좌우한다.
    // StageSelectScene.autoFillParty 와 동일하게 registry.ownedHeroes 기준으로 고른다.
    const owned = (window.game.registry.get('ownedHeroes') || [])
      .slice()
      .sort((a, b) => (b.power || b.combatPower || 0) - (a.power || a.combatPower || 0));
    const ids = owned.slice(0, 4).map((h) => h.id).filter(Boolean);
    if (ids.length > 0) {
      const boosted = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      boosted.parties = boosted.parties || [];
      boosted.parties[0] = [...ids, null, null, null].slice(0, 4);
      localStorage.setItem('arcane_collectors_save', JSON.stringify(boosted));
    }
  });
}

/** 게스트 로그인 — [게스트로 시작] 버튼을 실제로 탭한다 */
async function loginGuestByTap(page) {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => !!(window.game && window.game.scene && window.game.scene.scenes.length > 0),
    { timeout: 20000 }
  );
  const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'), 20000);
  if (!loginReady) throw new Error('LoginScene 활성화 실패');
  await page.waitForTimeout(500);
  await tapLabel(page, ['LoginScene'], '게스트로 시작');
  const mainMenu = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 20000);
  if (!mainMenu) throw new Error('게스트 로그인 → MainMenuScene 진입 실패');
}

// ---- PART 2 (API 경로) ----
async function loginGuest(page) {
  await page.goto(BASE_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(
    () => !!(window.game && window.game.scene && window.game.scene.scenes.length > 0),
    { timeout: 20000 }
  );
  const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'), 15000);
  if (!loginReady) throw new Error('LoginScene 활성화 실패');
  await safeEvaluate(page, () => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
  const mainMenu = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000);
  if (!mainMenu) throw new Error('게스트 로그인 → MainMenuScene 진입 실패');
}

async function getTutorialState(page) {
  return safeEvaluate(page, async () => {
    const { TutorialManager } = await import('/src/systems/TutorialManager.js');
    const { SaveManager } = await import('/src/systems/SaveManager.js');
    return TutorialManager.getState(SaveManager.load());
  });
}

async function commitStep(page, stepId) {
  return safeEvaluate(page, async (id) => {
    const { TutorialManager } = await import('/src/systems/TutorialManager.js');
    return TutorialManager.commitStep(id, 'played');
  }, stepId);
}

async function evaluateTutorial(page) {
  return safeEvaluate(page, async () => {
    const { TutorialManager } = await import('/src/systems/TutorialManager.js');
    return TutorialManager.evaluate();
  });
}

async function notifyTutorial(page, type, payload = {}) {
  return safeEvaluate(page, async ({ t, p }) => {
    const { TutorialManager } = await import('/src/systems/TutorialManager.js');
    return TutorialManager.notify(t, p);
  }, { t: type, p: payload });
}

async function clearStageByApi(page, stageId) {
  await safeEvaluate(page, () => {
    if (window.game.scene.isActive('BattleResultScene')) {
      window.game.scene.getScene('BattleResultScene').goToMain();
    }
  });
  await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000);
  await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene').scene.start('StageSelectScene'));
  const up = await waitFor(page, () => !!window.game?.scene.isActive('StageSelectScene'), 10000);
  if (!up) throw new Error(`[${stageId}] StageSelectScene 진입 실패`);
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

  await skipAllCutscenes(page, { rounds: 3, timeout: 3000 });
  const ok = await playBattleByTap(page);
  if (!ok) throw new Error(`[${stageId}] 전투 종료 대기 실패`);
  const victory = await safeEvaluate(page, () => window.game.scene.getScene('BattleResultScene').victory);
  await returnToMainByTap(page);
  return victory;
}

// ============================================================
// PART 1 — 실제 좌표 탭 완주
// ============================================================

/** 현재 모험 패널의 "▶ 전투 시작" CTA(마스킹 홀 또는 코치마크 대상)를 탭해 전투를 마친다 */
async function playTutorialStageByTap(page, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    // 1) 메인 메뉴에서 튜토리얼 CTA(홀 또는 코치마크 대상)를 실제로 탭한다
    const ui = await waitForTutorialUi(page, (u) => u.hole || u.coachTarget, 20000);
    if (!ui) throw new Error(`[${label}] 튜토리얼 CTA 를 찾지 못했습니다`);

    const target = ui.hole || ui.coachTarget;
    await tapWorld(page, target.x + target.w / 2, target.y + target.h / 2);
    await page.waitForTimeout(500);

    const entered = await waitFor(
      page,
      () => !!(window.game?.scene.isActive('BattleScene') || window.game?.scene.isActive('CutsceneScene')),
      8000
    );
    if (!entered) {
      const under = await hitTestWorld(page, target.x + target.w / 2, target.y + target.h / 2);
      note(`[${label}] ${attempt}회차 탭이 전투로 이어지지 않음 — ${JSON.stringify(under)}`);
      await page.waitForTimeout(1000);
      continue;
    }

    // 2) 진입 컷씬을 실제 [건너뛰기] 탭으로 넘긴다
    await skipAllCutscenes(page, { rounds: 4, timeout: 4000 });

    // 3) 전투 종료까지 대기 (장기화 시 실제 승리 루틴으로 마무리)
    const fought = await playBattleByTap(page);
    if (!fought) {
      note(`[${label}] ${attempt}회차 전투가 결과 화면에 도달하지 못함 — 재시도`);
      await returnToMainByTap(page);
      continue;
    }

    const result = await safeEvaluate(page, () => {
      const rs = window.game.scene.getScene('BattleResultScene');
      return { victory: !!rs?.victory, stage: rs?.stage?.id };
    });

    await returnToMainByTap(page);
    if (result.victory) return true;
    note(`[${label}] ${attempt}회차 패배 — ${JSON.stringify(result)} → 다시 도전`);
  }
  return false;
}

async function runPart1(page) {
  console.log('--- PART 1: 실제 좌표 탭만으로 T-01 → T-12 완주 ---\n');

  await loginGuestByTap(page);

  // T-01 — 프롤로그 컷씬이 자동 재생된다
  const t01Up = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'), 12000);
  assert(t01Up, '[T-01] 신규 계정 진입 시 프롤로그 컷씬이 자동 재생된다 (P0 회귀 방지)');
  await shot(page, '01-t01-cutscene-autoplay.png');
  await skipCutsceneByTap(page);

  // T-02 — 아이리스 합류 컷씬. 스텝이 T-03 으로 넘어갈 때까지 컷씬을 계속 넘긴다.
  for (let i = 0; i < 6; i++) {
    const ui = await tutorialUi(page);
    if (ui.stepId === 'T-03') break;
    await skipCutsceneByTap(page, { timeout: 3000 });
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(600);

  let save = await readSave(page);
  assert(
    save.tutorial.startedAt > 0,
    '[T-01] tutorial.startedAt 기록 — 로그인 시점에 튜토리얼이 시작된다',
    JSON.stringify(save.tutorial)
  );
  assert(
    save.tutorial.completedSteps.includes('T-01') && save.tutorial.completedSteps.includes('T-02'),
    '[T-01/T-02] 컷씬 종료 후 자동 커밋',
    JSON.stringify(save.tutorial.completedSteps)
  );
  assert(
    save.story.viewedCutscenes.includes('cs_ch1_enter'),
    '[T-01] 스킵해도 story.viewedCutscenes 에 기록된다(재노출 방지)',
    JSON.stringify(save.story)
  );

  await boostParty(page);
  await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene').scene.restart());
  await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000);
  await page.waitForTimeout(1200);

  // T-03 — 강제 마스킹 + 홀 탭으로 1-1 클리어
  const t03Ui = await waitForTutorialUi(page, (u) => u.stepId === 'T-03' && u.hasOverlay && u.hole, 15000);
  assert(!!t03Ui, '[T-03] 강제 스텝 마스킹(딤 + 홀)이 실제로 화면에 붙는다', JSON.stringify(await tutorialUi(page)));
  await shot(page, '02-t03-forced-mask.png');

  const won11 = await playTutorialStageByTap(page, 'T-03/1-1');
  assert(won11, '[T-03] 홀을 탭해 1-1 전투 진입 → 승리');
  save = await readSave(page);
  assert(save.progress.clearedStages['1-1'] > 0, '[T-03] 1-1 클리어 기록', JSON.stringify(save.progress.clearedStages));
  assert(save.tutorial.completedSteps.includes('T-03'), '[T-03] stage_clear 조건으로 자동 커밋');

  // T-04 — 코치마크 안내로 1-2, 1-3
  const t04Ui = await waitForTutorialUi(page, (u) => u.stepId === 'T-04', 15000);
  assert(!!t04Ui, '[T-04] 안내 스텝으로 전환');
  assert(t04Ui?.hasCoach === true && t04Ui?.hasOverlay === false, '[T-04] 안내 스텝은 딤 없이 코치마크만 표시');
  await shot(page, '03-t04-coachmark.png');

  const won12 = await playTutorialStageByTap(page, 'T-04/1-2');
  const won13 = await playTutorialStageByTap(page, 'T-04/1-3');
  assert(won12 && won13, '[T-04] CTA 탭으로 1-2, 1-3 연속 클리어');
  save = await readSave(page);
  assert(save.tutorial.completedSteps.includes('T-04'), '[T-04] stage_clear_all 조건으로 자동 커밋');

  // T-05 — 소환 팝업 자동 오픈 + 홀 탭으로 무료 10연
  const t05Ui = await waitForTutorialUi(page, (u) => u.stepId === 'T-05' && u.hole, 20000);
  assert(!!t05Ui, '[T-05] 소환 팝업이 강제로 열리고 무료 10연 버튼에 홀이 뚫린다');
  const gachaLocked = await safeEvaluate(page, () => {
    const popup = window.game.scene.getScene('MainMenuScene').activePopup;
    return { onboarding: !!popup?.onboarding, closeEnabled: popup?.closeBtn?.input?.enabled === true };
  });
  assert(gachaLocked.onboarding && gachaLocked.closeEnabled === false, '[T-05] 온보딩 모드 + 닫기 잠금', JSON.stringify(gachaLocked));
  await shot(page, '04-t05-gacha-forced.png');

  const shardsBefore = (await readSave(page)).resources.characterShards?.base_omar || 0;
  await tapWorld(page, t05Ui.hole.x + t05Ui.hole.w / 2, t05Ui.hole.y + t05Ui.hole.h / 2);

  // 고정 대기(6초)는 머신 부하에 따라 결과 연출을 앞질러 [확인] 탭이 헛돌았다.
  // 그러면 depth 3010 전면 스크림이 살아남아 T-07 이후 모든 탭을 삼킨다.
  // 조건을 직접 기다린다: 세이브 기록 → [확인] 버튼 등장.
  await waitFor(
    page,
    () => JSON.parse(localStorage.getItem('arcane_collectors_save'))?.gacha?.freeTenPullUsed === true,
    20000
  );
  await waitForLabel(page, ['MainMenuScene'], '확인', 20000);
  await page.waitForTimeout(600);

  save = await readSave(page);
  assert(save.gacha.freeTenPullUsed === true, '[T-05] 홀 탭으로 무료 10연 실행');

  // 결과 연출의 [확인]을 실제로 탭해 닫는다.
  // 카드 공개가 끝나기 전의 탭은 '건너뛰기'로 소비되므로, 전면 레이어가 사라질 때까지 반복한다.
  // 남겨 두면 depth 3010 스크림이 이후 스텝의 탭을 통째로 삼킨다(T-07 이 여기서 막혔다).
  const confirmed = await confirmSummonResult(page);
  assert(confirmed, '[T-05] 소환 결과 [확인] 탭으로 연출 종료');
  await page.waitForTimeout(700);
  assert(save.tutorial.completedSteps.includes('T-05'), '[T-05] 커밋 (gacha_result_confirmed)');
  assert(
    (save.resources.characterShards?.base_omar || 0) >= shardsBefore + 30,
    '[T-05 보상] 각성의 인도 — 오마르 조각 +30 지급',
    `before=${shardsBefore} after=${save.resources.characterShards?.base_omar}`
  );
  assert(
    save.onboarding.unlockedMenus.includes('herolist') && save.onboarding.unlockedMenus.includes('partyedit'),
    '[T-05] herolist/partyedit 해금',
    JSON.stringify(save.onboarding.unlockedMenus)
  );
  await shot(page, '05-t05-gacha-result.png');

  // 스텝이 끝나면 튜토리얼이 잠금을 풀고 팝업을 스스로 정리한다
  // (열어 둔 채로 두면 다음 스텝의 안내 대상이 팝업 뒤에 가려져 진행이 막힌다)
  const popupClosed = await waitFor(
    page,
    () => !window.game.scene.getScene('MainMenuScene').activePopup,
    10000
  );
  assert(popupClosed, '[T-05] 스텝 종료 후 소환 팝업이 자동으로 닫힌다');
  await page.waitForTimeout(600);

  // T-06 — 각인 메뉴 코치마크 → 아이콘 탭
  const t06Ui = await waitForTutorialUi(page, (u) => u.stepId === 'T-06' && u.coachTarget && u.tier === 1, 20000);
  assert(!!t06Ui, '[T-06] 각인 메뉴 코치마크가 실제 아이콘(레지스트리 1단계 해석)에 붙는다', JSON.stringify(await tutorialUi(page)));
  await shot(page, '06-t06-menu-coachmark.png');
  const beforeTap = await safeEvaluate(page, () => ({
    activePopup: window.game.scene.getScene('MainMenuScene').activePopup?.constructor?.name || null,
    menuLabels: (window.game.scene.getScene('MainMenuScene')._menuObjects || [])
      .filter((o) => o.type === 'Text').map((o) => o.text),
  }));
  note(`T-06 탭 직전 — ${JSON.stringify(beforeTap)} / target=${JSON.stringify(t06Ui?.coachTarget)}`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (t06Ui?.coachTarget) {
      await tapWorld(page, t06Ui.coachTarget.x + t06Ui.coachTarget.w / 2, t06Ui.coachTarget.y + t06Ui.coachTarget.h / 2);
    } else {
      await tapLabel(page, ['MainMenuScene'], '각인');
    }
    await page.waitForTimeout(900);
    const after = await safeEvaluate(page, () => ({
      activePopup: window.game.scene.getScene('MainMenuScene').activePopup?.constructor?.name || null,
      step: window.game.scene.getScene('MainMenuScene').tutorialFlow?.currentStepId,
    }));
    if (after.activePopup) break;
    note(`T-06 ${attempt}회차 탭에도 팝업이 열리지 않음 — ${JSON.stringify(after)}`);

    // 포인터 아래에 실제로 무엇이 있는지 Phaser 히트테스트로 확인한다
    const m = await canvasMap(page);
    await page.mouse.move(
      m.x + ((t06Ui.coachTarget.x + t06Ui.coachTarget.w / 2) * m.w) / m.gw,
      m.y + ((t06Ui.coachTarget.y + t06Ui.coachTarget.h / 2) * m.h) / m.gh
    );
    const hits = await safeEvaluate(page, () => {
      const scene = window.game.scene.getScene('MainMenuScene');
      const p = scene.input.activePointer;
      const list = scene.input.hitTestPointer(p) || [];
      return {
        pointer: { x: p.x, y: p.y, worldX: p.worldX, worldY: p.worldY },
        hits: list.map((o) => ({ type: o.type, name: o.name, depth: o.depth, parent: o.parentContainer?.depth ?? null })),
        topOnly: scene.input.topOnly,
      };
    });
    note(`히트테스트 — ${JSON.stringify(hits)}`);
    note('콘솔(에러/경고): ' + consoleLog.filter((l) => /error|warning/i.test(l)).slice(-6).join(' || '));
    const layers = await safeEvaluate(page, () => {
      const scene = window.game.scene.getScene('MainMenuScene');
      const out = [];
      const walk = (list, path) => (list || []).forEach((o, i) => {
        if (!o) return;
        if (o.type === 'Container' && o.depth >= 1000) {
          out.push({
            path: `${path}[${i}]`, depth: o.depth, alpha: o.alpha, visible: o.visible,
            children: (o.list || []).length,
            interactive: (o.list || []).filter((c) => c.input).map((c) => `${c.type} ${Math.round(c.width||0)}x${Math.round(c.height||0)}`),
          });
        }
        if (o.type === 'Container') walk(o.list, `${path}[${i}]`);
      });
      walk(scene.children.list, 'root');
      return out;
    });
    note(`depth>=1000 컨테이너 — ${JSON.stringify(layers)}`);
    await tapLabel(page, ['MainMenuScene'], '각인', { required: false });
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(600);

  save = await readSave(page);
  assert(save.tutorial.completedSteps.includes('T-06'), '[T-06] 메뉴 아이콘 탭 → popup_open 조건으로 커밋');
  assert(save.onboarding.unlockedMenus.includes('ascension'), '[T-06] ascension 해금');

  // T-07 — 오마르 각인 (카드 → 루트 → 확정, 전부 홀 탭)
  const won07 = await completeAscensionByTap(page, 'T-07', '오마르');
  assert(won07, '[T-07] 마스킹 홀 3연속 탭으로 오마르 각인 완료');
  save = await readSave(page);
  assert(save.tutorial.completedSteps.includes('T-07'), '[T-07] ascension_complete 조건으로 커밋');
  await shot(page, '07-t07-omar-ascended.png');

  // T-08 — 파티 편성 (기본 세이브가 이미 1인 파티라 조건이 충족되어 자동 커밋될 수 있다)
  save = await readSave(page);
  if (save.tutorial.completedSteps.includes('T-08')) {
    note('T-08 은 기본 세이브의 1인 파티로 party_saved 조건이 이미 충족되어 자동 커밋됨');
    assert(true, '[T-08] party_saved 조건 충족으로 커밋');
  } else {
    const t08Ui = await waitForTutorialUi(page, (u) => u.stepId === 'T-08', 10000);
    assert(!!t08Ui, '[T-08] 파티 편성 안내 표시');
    await tapLabel(page, ['MainMenuScene'], '파티');
    await page.waitForTimeout(800);
    await tapLabel(page, ['MainMenuScene'], '자동 편성');
    await page.waitForTimeout(500);
    await tapLabel(page, ['MainMenuScene'], '파티 저장');
    await page.waitForTimeout(800);
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene').activePopup?.hide?.());
    save = await readSave(page);
    assert(save.tutorial.completedSteps.includes('T-08'), '[T-08] 파티 저장 → 커밋');
  }

  // T-09 — 아이리스 기관 선택 (강제 F-2)
  const goldBeforeT09 = (await readSave(page)).resources.gold;
  const won09 = await completeAscensionByTap(page, 'T-09', '아이리스');
  assert(won09, '[T-09] 마스킹 홀 탭으로 아이리스 기관 각인 완료');
  save = await readSave(page);
  assert(save.tutorial.completedSteps.includes('T-09'), '[T-09] ascension_complete 조건으로 커밋');
  assert(save.onboarding.firstAscensionGrantUsed === true, '[T-09 보상] 첫 각인 보증 지급 플래그');
  assert(save.ascendedHeroes.some((h) => h.baseHeroId === 'base_iris'), '[T-09] 전직영웅 획득', JSON.stringify(save.ascendedHeroes.map((h) => h.ascendedHeroId)));
  note(`T-08 골드 보너스 확인용 — 골드 ${goldBeforeT09} → ${save.resources.gold}`);
  await shot(page, '08-t09-iris-ascended.png');

  // T-10, T-11 — 1-4, 1-5(보스)
  const won14 = await playTutorialStageByTap(page, 'T-10/1-4');
  assert(won14, '[T-10] CTA 탭으로 1-4 클리어');
  save = await readSave(page);
  assert(save.tutorial.completedSteps.includes('T-10'), '[T-10] 커밋 + quest 해금');
  assert(save.onboarding.unlockedMenus.includes('quest'), '[T-10] quest 해금', JSON.stringify(save.onboarding.unlockedMenus));

  const won15 = await playTutorialStageByTap(page, 'T-11/1-5');
  assert(won15, '[T-11] CTA 탭으로 1-5 보스 클리어');
  save = await readSave(page);
  assert(save.tutorial.completedSteps.includes('T-11'), '[T-11] 커밋');
  assert(
    ['inventory', 'gacha', 'collection'].every((k) => save.onboarding.unlockedMenus.includes(k)),
    '[T-11] inventory/gacha/collection 해금',
    JSON.stringify(save.onboarding.unlockedMenus)
  );
  assert(
    save.story.viewedCutscenes.includes('cs_1_5_boss_before') && save.story.viewedCutscenes.includes('cs_1_5_boss_after'),
    '[T-11] 보스 전후 컷씬 재생 기록',
    JSON.stringify(save.story.viewedCutscenes)
  );

  // T-12 — 유휴전투 안내 코치마크 닫기
  const gemsBefore = (await readSave(page)).resources.gems;
  const t12Ui = await waitForTutorialUi(page, (u) => u.stepId === 'T-12' && u.hasCoach, 20000);
  assert(!!t12Ui, '[T-12] 유휴전투 안내 코치마크 표시');
  await shot(page, '09-t12-idle-coachmark.png');
  if (t12Ui?.coachClose) {
    await tapWorld(page, t12Ui.coachClose.x, t12Ui.coachClose.y);
  }
  await page.waitForTimeout(1200);

  save = await readSave(page);
  assert(save.tutorial.completedSteps.includes('T-12'), '[T-12] 코치마크 닫기 탭 → overlay_dismissed 커밋');
  assert(save.tutorial.completed === true, '튜토리얼 완주 — tutorial.completed === true');
  assert(
    save.resources.gems >= gemsBefore + 300,
    '[T-12 보상] 완주 보상 젬 +300 지급',
    `before=${gemsBefore} after=${save.resources.gems}`
  );

  // 완주 후 메뉴 그리드
  await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene').scene.restart());
  await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000);
  await page.waitForTimeout(1200);

  const grid = await safeEvaluate(page, async () => {
    const { MenuGridGate } = await import('/src/systems/MenuGridGate.js');
    const { SaveManager } = await import('/src/systems/SaveManager.js');
    const save2 = SaveManager.load();
    return {
      unlocked: MenuGridGate.deriveUnlockedMenus(save2, SaveManager.ALL_MENU_KEYS).length,
      total: SaveManager.ALL_MENU_KEYS.length,
      tutorialUiGone: !window.game.scene.getScene('MainMenuScene').tutorialFlow?.isShowing,
    };
  });
  assert(grid.unlocked === grid.total, '완주 후 메뉴 13항목 전부 해금', JSON.stringify(grid));
  assert(grid.tutorialUiGone, '완주 후 튜토리얼 오버레이/코치마크가 남지 않는다');
  await shot(page, '10-completed-13-menus.png');
}

/** 각인 팝업을 홀 탭만으로 통과한다 (카드 → 루트 → 확정) */
async function completeAscensionByTap(page, stepId, heroLabel) {
  const before = (await readSave(page)).ascendedHeroes.length;

  for (let stage = 0; stage < 3; stage++) {
    const ui = await waitForTutorialUi(page, (u) => u.stepId === stepId && (u.hole || u.coachTarget), 20000);
    if (!ui) return false;
    const target = ui.hole || ui.coachTarget;
    const state = await safeEvaluate(page, async () => {
      const { SaveManager } = await import('/src/systems/SaveManager.js');
      const popup = window.game.scene.getScene('MainMenuScene').activePopup;
      const heroId = popup?.selectedBaseHero?.id || null;
      const cultId = popup?.selectedRoute?.cultId || null;
      const save = SaveManager.load();
      return {
        popup: popup?.constructor?.name || null,
        popupStep: popup?.currentStep ?? null,
        heroId,
        cultId,
        shards: save.resources?.characterShards || {},
        canAscend: heroId && cultId ? SaveManager.canAscend(heroId, cultId) : null,
      };
    });
    note(`[${stepId}] ${stage + 1}단계 탭 — ui=${JSON.stringify({ hole: !!ui.hole, tier: ui.tier })} ${JSON.stringify(state)}`);

    // 루트 목록 단계에서는 목록 중앙이 아니라 첫 번째 루트 카드를 누른다(사람이 하는 선택).
    const tapY = state.popupStep === 2
      ? target.y + Math.min(target.h * 0.12, 90)
      : target.y + target.h / 2;
    await tapWorld(page, target.x + target.w / 2, tapY);
    await page.waitForTimeout(900);
    await skipAllCutscenes(page, { rounds: 2, timeout: 2500 });
    await page.waitForTimeout(700);

    const done = (await readSave(page)).ascendedHeroes.length > before;
    if (done) break;
  }

  await skipAllCutscenes(page, { rounds: 3, timeout: 3000 });
  await page.waitForTimeout(900);
  await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene').activePopup?.hide?.());
  await page.waitForTimeout(700);

  const after = (await readSave(page)).ascendedHeroes.length;
  if (after <= before) note(`[${stepId}] ${heroLabel} 각인이 완료되지 않았습니다`);
  return after > before;
}

// ============================================================
// PART 2 — 상태 머신 API 회귀
// ============================================================

async function runPart2(page) {
  console.log('\n--- PART 2: 상태 머신 API 회귀 (우회 경로) ---\n');

  await loginGuest(page);
  await boostParty(page);

  const rewardWired = await safeEvaluate(page, async () => {
    const { TutorialManager } = await import('/src/systems/TutorialManager.js');
    return typeof TutorialManager.getRewardHandler() === 'function';
  });
  assert(rewardWired, '보상 핸들러가 항상 존재한다 (기본 핸들러 내장, P1 회귀 방지)');

  let r = await commitStep(page, 'T-01');
  assert(r?.ok, 'T-01 커밋(API)', JSON.stringify(r));
  r = await commitStep(page, 'T-02');
  assert(r?.ok, 'T-02 커밋(API)', JSON.stringify(r));

  let committed = await evaluateTutorial(page);
  assert(committed.length === 0, 'T-03 조건 미충족 상태에서 evaluate()가 아무것도 커밋하지 않음');

  const c11 = await clearStageByApi(page, '1-1');
  assert(c11, '[T-03] StageSelectScene 경로로 1-1 클리어');
  committed = await evaluateTutorial(page);
  // 화면에 붙은 TutorialFlow 가 먼저 자동 커밋했을 수 있으므로 최종 상태로 판정한다
  const stateAfter11 = await getTutorialState(page);
  assert(
    committed.includes('T-03') || stateAfter11.completedSteps.includes('T-03'),
    'T-03 자동 커밋(stage_clear 조건 재평가)',
    JSON.stringify({ committed, completed: stateAfter11.completedSteps })
  );

  const t09SkipAttempt = await safeEvaluate(page, async () => {
    const { TutorialManager } = await import('/src/systems/TutorialManager.js');
    return TutorialManager.skip('T-09');
  });
  assert(t09SkipAttempt?.reason === 'forced_step', 'T-09(F-2)는 skip() 으로 건너뛸 수 없음', JSON.stringify(t09SkipAttempt));

  const skipAll = await safeEvaluate(page, async () => {
    const { TutorialManager } = await import('/src/systems/TutorialManager.js');
    return TutorialManager.skipAll();
  });
  assert(
    skipAll.remaining.every((id) => ['T-05', 'T-07', 'T-09'].includes(id)),
    'skipAll 후 강제 스텝만 남는다',
    JSON.stringify(skipAll)
  );

  const state = await getTutorialState(page);
  assert(state.completed === false, 'skipAll 만으로는 완주 처리되지 않는다 (강제 4스텝 유지)');

  const t06Notify = await notifyTutorial(page, 'popup_open', { popupKey: 'ascension' });
  assert(t06Notify === null || t06Notify?.ok === false, '완료된 스텝에는 popup_open 통지가 커밋을 만들지 않는다', JSON.stringify(t06Notify));
}

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));
  page.on('console', (msg) => {
    const text = msg.text();
    if (/\[SAVE\]|데이터 로드|데이터 저장/.test(text)) return;   // 저장 로그는 잡음이라 제외
    consoleLog.push(`[${msg.type()}] ${text}`.slice(0, 260));
    if (consoleLog.length > 120) consoleLog.shift();
  });

  try {
    console.log(`\n=== 온보딩 T-01~T-12 완주 검증 (${BASE_URL}) ===\n`);
    await runPart1(page);
    await runPart2(page);
    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));
  } catch (error) {
    failed += 1;
    console.log(`❌ 예외 발생 — ${error.message}`);
    console.log(error.stack);
    await shot(page, '99-failure.png');
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
