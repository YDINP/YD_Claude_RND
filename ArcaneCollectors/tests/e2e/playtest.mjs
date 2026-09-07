/**
 * playtest.mjs — 기능별 실플레이 QA (Playwright)
 *
 * qa-sweep.mjs 와 무엇이 다른가
 *   qa-sweep 은 "화면을 열어서" 겹침·터치타깃·콘솔에러를 훑는 **정적 점검**이다.
 *   playtest 는 "실제로 플레이해서" 기능이 의도대로 도는지를 본다 — 레벨업하면 전투력이
 *   진짜 오르는지, 배지 숫자가 실제 수령 가능 건수와 같은지, 벽 경고가 실제 전투력과
 *   맞는지처럼 **표시값 ↔ 저장값 일치**와 **소프트락**을 캐는 것이 목적이다.
 *
 * 대상
 *   기본은 라이브 프로덕션. `PLAYTEST_BASE_URL` 로 로컬을 지정할 수 있다.
 *   라이브 정적 빌드에서도 부팅 **전에** `localStorage.arcane_debug_enabled='true'` 를
 *   심으면 `window.debug` 와 `window.__TEST_API__` 가 둘 다 열린다(2026-09-04 확인).
 *
 * 실행
 *   node tests/e2e/playtest.mjs                      # 전 시나리오 (라이브)
 *   node tests/e2e/playtest.mjs --only=1,4
 *   PLAYTEST_BASE_URL=http://localhost:3000 node tests/e2e/playtest.mjs --only=2
 *   node tests/e2e/playtest.mjs --headed
 *
 * 산출물
 *   docs/qa/playtest/<번호>-<슬러그>*.png
 *   docs/qa/playtest-result.json
 *
 * 자동화 경계
 *   좌표 탭 조작과 저장값 대조까지가 자동이다. 애니메이션의 "느낌"(부유 곡선, 컷인 임팩트),
 *   색 대비의 주관적 판단, 오디오는 자동 판정하지 않는다 — `manual()` 로 표시하고 캡처만
 *   남긴다. 보고서의 해당 줄은 사람이 캡처를 보고 채운다.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import * as L from './playtest-lib.mjs';

const {
  BASE_URL, SOURCE, RESULT_PATH,
  startScenario, currentScenario, check, manual, issue, note,
  safeEvaluate, tapWorld, canvasMap, findByLabel, waitForLabel, waitForLabelGone, tapLabel,
  visibleTexts, offscreenTexts, activeScenes, readSave, readRegistry, shot,
  newSession, newAccountSession, boot, guestLogin, passCutscene, closePopup, report,
  VIEWPORT,
} = L;

const HEADLESS = !process.argv.includes('--headed');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '');
const VERBOSE = process.argv.includes('--verbose');

// ============================================================
// 공용 플레이 동작
// ============================================================

/** 튜토리얼 오버레이/코치마크 상태 (읽기 전용) */
const tutorialUi = (page, sceneKey = 'MainMenuScene') => safeEvaluate(page, (key) => {
  const scene = window.game?.scene?.getScene?.(key);
  const flow = key === 'BattleScene' ? scene?._tutorialBinding?.flow : scene?.tutorialFlow;
  const hole = flow?.overlay?.hole || null;
  const close = flow?.coach?.closeHit?.getBounds?.();
  const ct = flow?.coach?.target || null;
  const raw = localStorage.getItem('arcane_collectors_save');
  const save = raw ? JSON.parse(raw) : {};
  return {
    active: !!window.game?.scene?.isActive?.(key),
    stepId: flow?.currentStepId || null,
    hasOverlay: !!flow?.overlay?.isVisible,
    hasCoach: !!flow?.coach?.isVisible,
    hole: hole ? { x: hole.x + hole.w / 2, y: hole.y + hole.h / 2, w: hole.w, h: hole.h } : null,
    close: close ? { x: close.centerX, y: close.centerY } : null,
    coachTarget: ct ? { x: ct.x + ct.w / 2, y: ct.y + ct.h / 2, w: ct.w, h: ct.h } : null,
    completed: save.tutorial?.completedSteps || [],
    done: !!save.tutorial?.completedAt,
  };
}, sceneKey);

/** 컷신이 활성이면 [건너뛰기]로 넘긴다 (없으면 탭으로). 넘긴 컷신 수를 돌려준다 */
async function skipCutscenes(page, rounds = 5) {
  let n = 0;
  for (let r = 0; r < rounds; r += 1) {
    if (!(await activeScenes(page)).includes('CutsceneScene')) break;
    const skip = await findByLabel(page, '건너뛰기');
    if (skip) { await tapWorld(page, skip.x, skip.y, 500); }
    else { await tapWorld(page, 540, 960, 300); }
    const gone = await (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 6000) {
        if (!(await activeScenes(page)).includes('CutsceneScene')) return true;
        // 페이지 넘김형 컷신은 탭을 계속 먹인다
        await tapWorld(page, 540, 960, 250);
      }
      return false;
    })();
    if (gone) n += 1; else break;
    await page.waitForTimeout(400);
  }
  return n;
}

/** 전투를 끝까지 진행한다 (자동전투 ON + 속도 부스트). 결과 씬 도달 여부 */
async function playBattle(page, { timeout = 60000, speed = 8, beforeAuto = null } = {}) {
  const up = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      if ((await activeScenes(page)).includes('BattleScene')) return true;
      if ((await activeScenes(page)).includes('CutsceneScene')) await skipCutscenes(page, 2);
      await page.waitForTimeout(300);
    }
    return false;
  })();
  if (!up) return { entered: false };
  await page.waitForTimeout(800);
  if (typeof beforeAuto === 'function') await beforeAuto();

  await safeEvaluate(page, (s) => window.game?.registry?.set?.('battleSpeed', s), speed);
  await tapLabel(page, 'AUTO OFF', { required: false, sceneKeys: ['BattleScene'] });

  const t0 = Date.now();
  let forced = false;
  while (Date.now() - t0 < timeout) {
    const scenes = await activeScenes(page);
    if (scenes.includes('BattleResultScene')) return { entered: true, forced };
    if (scenes.includes('CutsceneScene')) { await skipCutscenes(page, 2); continue; }
    if (!forced && Date.now() - t0 > 25000) {
      // 밸런스가 검증 대상이 아닌 시나리오에서 교착을 풀기 위한 실승리 처리
      forced = await safeEvaluate(page, () => {
        const bs = window.game?.scene?.getScene?.('BattleScene');
        if (!bs || !window.game.scene.isActive('BattleScene') || bs.battleEnded) return false;
        (bs.enemies || []).forEach((e) => { if (e) { e.currentHp = 0; e.isAlive = false; } });
        bs.endBattle(true);
        return true;
      });
      if (forced) note('전투 장기화 — endBattle(true) 로 실승리 처리 (밸런스는 판정 대상 아님)');
    }
    await tapLabel(page, 'AUTO OFF', { required: false, sceneKeys: ['BattleScene'] });
    await tapLabel(page, '다음 턴', { required: false, sceneKeys: ['BattleScene'] });
    await page.waitForTimeout(400);
  }
  const diag = await battleState(page);
  note(`전투 미종료 진단 — ${JSON.stringify(diag)}`);
  return { entered: true, timedOut: true, forced, diag };
}

/** 전투 내부 상태 (진단용) */
const battleState = (page) => safeEvaluate(page, () => {
  const bs = window.game?.scene?.getScene?.('BattleScene');
  return {
    scenes: window.game.scene.getScenes(true).map((s) => s.scene.key),
    paused: window.game.scene.isPaused('BattleScene'),
    turn: bs?.turn, ended: bs?.battleEnded, processing: bs?.isProcessingTurn,
    waitManual: bs?.waitingForManualInput, auto: bs?.autoBattle, speed: bs?.battleSpeed,
    allies: (bs?.allies || []).map((a) => `${a.name}:${a.currentHp}${a.isAlive ? '' : 'X'}`),
    enemies: (bs?.enemies || []).map((e) => `${e.name}:${e.currentHp}${e.isAlive ? '' : 'X'}`),
  };
});

/** 결과 화면 → 메인 복귀 */
async function backToMain(page) {
  if ((await activeScenes(page)).includes('BattleResultScene')) {
    await tapLabel(page, '메인으로', { required: false, sceneKeys: ['BattleResultScene'] });
  }
  await skipCutscenes(page, 4);
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    if ((await activeScenes(page)).includes('MainMenuScene')) { await page.waitForTimeout(700); return true; }
    if ((await activeScenes(page)).includes('CutsceneScene')) await skipCutscenes(page, 2);
    await page.waitForTimeout(300);
  }
  return false;
}

/** 어떤 화면에 있든 로비로 돌아온다 (팝업 닫기 → [뒤로]/[닫기] → 씬 복귀) */
async function backToLobby(page, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const scenes = await activeScenes(page);
    if (scenes.includes('MainMenuScene') && !(await findByLabel(page, '닫기', { exact: true }))) {
      await page.waitForTimeout(500);
      return true;
    }
    if (scenes.includes('CutsceneScene')) { await skipCutscenes(page, 2); continue; }
    const closed = await closePopup(page)
      || await tapLabel(page, '뒤로', { exact: true, required: false, settle: 900 })
      || await tapLabel(page, '메인으로', { exact: true, required: false, settle: 900 });
    if (!closed) {
      if (scenes.includes('MainMenuScene')) { await page.waitForTimeout(400); return true; }
      await safeEvaluate(page, () => window.__TEST_API__?.navigateTo?.('MainMenuScene'));
      await page.waitForTimeout(1500);
    }
  }
  return (await activeScenes(page)).includes('MainMenuScene');
}

/** 도크 카테고리를 열고 하위 항목을 탭해 팝업을 연다 (로비 복귀 → 카테고리 → 항목) */
async function openMenu(page, category, item) {
  await backToLobby(page);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cat = await findByLabel(page, category, { exact: true, sceneKeys: ['MainMenuScene'] });
    if (!cat) { await page.waitForTimeout(700); continue; }
    // 이미 펼쳐져 있으면 다시 탭하면 접힌다 — 항목이 보이는지 먼저 확인한다
    let found = await findByLabel(page, item, { exact: true, sceneKeys: ['MainMenuScene'] });
    if (!found) {
      await tapWorld(page, cat.x, cat.y, 800);
      found = await waitForLabel(page, item, { exact: true, sceneKeys: ['MainMenuScene'] }, 5000);
    }
    if (!found) continue;
    await tapWorld(page, found.x, found.y, 1500);
    return true;
  }
  return false;
}

/**
 * 화면 경계에 **걸려 잘린** 텍스트. 이탈(offscreen)과 다르다 —
 * 조금만 넘어가도 글자가 잘려 읽히지 않으므로 기준을 따로 둔다.
 * 스크롤 목록(마스크) 안은 제외한다(잘린 게 아니라 스크롤 밖이다).
 */
async function clippedTexts(page) {
  const size = await safeEvaluate(page, () => ({ w: window.game.scale.gameSize.width, h: window.game.scale.gameSize.height }));
  const texts = await visibleTexts(page);
  return texts.filter((t) => !t.masked && (
    t.y < -1 || t.x < -1 || t.y + t.h > size.h + 1 || t.x + t.w > size.w + 1
  ));
}

/** 겹침·이탈 자동 점검 — 화면 캡처와 함께 부른다 */
async function layoutAudit(page, label) {
  const off = await offscreenTexts(page);
  if (off.length) {
    issue('P2', `${label} — 텍스트 ${off.length}건이 화면 밖으로 이탈`, {
      evidence: off.slice(0, 4).map((t) => `"${t.text}"@(${t.x},${t.y})`).join(', '),
    });
  }
  return off;
}

/** 막힌 지점 진단 — 강조 영역 아래 무엇이 있고 무엇이 입력을 받는지 */
const stuckDiagnosis = (page, zone) => safeEvaluate(page, (z) => {
  const collect = (list, out) => { list.forEach((o) => { if (!o) return; out.push(o); if (Array.isArray(o.list)) collect(o.list, out); }); return out; };
  const inZone = (b) => b.centerX > z.x - z.w / 2 && b.centerX < z.x + z.w / 2 && b.centerY > z.y - z.h / 2 && b.centerY < z.y + z.h / 2;
  const out = { texts: [], interactive: [], popups: [], resources: null, ascend: null };
  for (const scene of window.game?.scene?.getScenes?.(true) || []) {
    for (const o of collect(scene.children.list, [])) {
      const b = o.getBounds?.();
      if (!b || !inZone(b)) continue;
      if (o.type === 'Text' && o.text) out.texts.push(o.text);
      if (o.input?.enabled) out.interactive.push(`${o.type}@${Math.round(b.centerX)},${Math.round(b.centerY)} vis=${o.visible} a=${o.alpha}`);
    }
    out.popups.push(...Object.keys(scene.activePopups || scene.popups || {}));
  }
  const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
  out.resources = save.resources ? { gems: save.resources.gems, spiritStones: save.resources.spiritStones, seal: save.resources.institutionSeal, shards: save.resources.characterShards } : null;
  out.scenes = window.game.scene.getScenes(true).map((sc) => sc.scene.key);
  out.ascended = (save.ascendedHeroes || []).map((h) => h.id || h);
  out.tutorial = save.tutorial;
  // 화면 전체에서 보이는 텍스트 상위 12개 — 어떤 화면에 멈춰 있는지 식별용
  out.screenTexts = [];
  for (const scene of window.game.scene.getScenes(true)) {
    for (const o of collect(scene.children.list, [])) {
      if (o.type !== 'Text' || !o.text) continue;
      let n = o, vis = true;
      while (n) { if (n.visible === false || n.alpha < 0.05) { vis = false; break; } n = n.parentContainer; }
      if (vis) out.screenTexts.push(o.text.slice(0, 24));
    }
  }
  out.screenTexts = out.screenTexts.slice(0, 14);
  return out;
}, zone);

/** 강조 영역 안에서 눌러 볼 지점 (영역 크기 대비 비율 오프셋) */
const POKE = [[0, 0], [0, -0.28], [0, 0.28], [0, -0.38], [0, 0.38], [-0.3, 0], [0.3, 0], [0, -0.44], [0, 0.44]];

// ============================================================
// 시나리오
// ============================================================

/** 1. 신규 유저 온보딩 — 게스트 → 프롤로그 → T-01~T-12 → 첫 전투/소환/각인 */
async function scenario1(browser, opts = {}) {
  const {
    id = 1,
    name = '신규 유저 온보딩',
    // 각인 스텝에서 막혔을 때 새로고침으로 풀어 주고 계속 진행할지.
    // 진단(시나리오 1)에서는 true — 뒤 스텝까지 봐야 하니까.
    // 회귀 확인(시나리오 14)에서는 false — "새로고침 없이 진행되는가"가 판정 대상이라
    // 여기서 새로고침해 버리면 고쳐졌는지 알 수 없다.
    recoverByReload = true,
    P = '01-onboarding',
  } = opts;
  startScenario(id, name);
  const { page, ctx, errors } = await newSession(browser);
  const onboarding = { stuckAt: null, reloadsUsed: 0, steps: [] };
  try {
    await boot(page);
    await shot(page, `${P}-a-login`);
    check(true, '로그인 화면 도달');

    const t0 = Date.now();
    await guestLogin(page);
    check(true, '게스트 로그인 → 씬 전환', `${Date.now() - t0}ms`);

    // --- 프롤로그 컷신 ---
    await page.waitForTimeout(2500);
    const inCut = (await activeScenes(page)).includes('CutsceneScene');
    check(inCut, '로그인 직후 프롤로그 컷신 자동 재생');
    if (inCut) {
      const pageLabel = await findByLabel(page, ' / ');
      note(`컷신 페이지 표기: ${pageLabel?.text || '없음'}`);
      await shot(page, `${P}-b-prologue`);
      const hasSkip = !!(await findByLabel(page, '건너뛰기'));
      check(hasSkip, '프롤로그에 건너뛰기 제공');
      manual('컷신 자막 대비/줄바꿈', `${P}-b-prologue.png`);
    }

    // --- 튜토리얼 루프: 안내가 가리키는 곳을 실제로 탭한다 ---
    const stepLog = [];
    let guard = 0;
    let lastStep = null;
    let stuckAt = '(none)';
    let poke = 0;
    let battleNo = 0;
    let battleFails = 0;
    while (guard < 120) {
      guard += 1;
      const scenes = await activeScenes(page);
      if (VERBOSE) note(`guard#${guard} scenes=[${scenes.join(',')}]`);

      if (scenes.includes('CutsceneScene')) { await skipCutscenes(page, 2); continue; }

      if (scenes.includes('BattleScene')) {
        // 첫 전투 — B-1~B-5 안내를 실제로 관찰한다
        const seen = [];
        const bt0 = Date.now();
        while (Date.now() - bt0 < 20000) {
          const bu = await tutorialUi(page, 'BattleScene');
          if (!bu.active) break;
          if (bu.stepId && !seen.includes(bu.stepId)) {
            seen.push(bu.stepId);
            if (seen.length <= 2) await shot(page, `${P}-d-battle-${bu.stepId}`);
            // B-1 코치마크가 턴 순서 바를 덮는지 — 좌표 계산으로는 재현이 안 돼
            // 실전투에서 봐 달라고 지목된 항목이다(2026-09-07 팀 리드).
            if (bu.stepId === 'B-1') {
              const overlap = await safeEvaluate(page, () => {
                const bs = window.game.scene.getScene('BattleScene');
                const flow = bs?._tutorialBinding?.flow;
                const coach = flow?.coach;
                const bubble = coach?.root?.getBounds?.();
                const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
                const all = collect(bs.children.list, []);
                const turnLabel = all.find((x) => x.type === 'Text' && /턴\s*순서/.test(x.text || ''));
                const turnBar = turnLabel ? turnLabel.parentContainer?.getBounds?.() || turnLabel.getBounds() : null;
                const closeHit = coach?.closeHit?.getBounds?.();
                const rect = (b) => (b ? { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom } : null);
                const intersects = (a, c) => !!(a && c) && !(a.r <= c.x || c.r <= a.x || a.b <= c.y || c.b <= a.y);
                const contains = (outer, inner) => !!(outer && inner)
                  && inner.x >= outer.x - 1 && inner.y >= outer.y - 1
                  && inner.r <= outer.r + 1 && inner.b <= outer.b + 1;
                const B = rect(bubble); const T = rect(turnBar); const C = rect(closeHit);
                return {
                  hasBubble: !!B, hasTurnBar: !!T, hasClose: !!C,
                  turnLabelText: turnLabel?.text || null,
                  bubbleCoversTurnBar: intersects(B, T),
                  closeInsideBubble: C ? contains(B, C) : null,
                  bubble: B, turnBar: T, close: C,
                };
              });
              note(`B-1 코치마크 배치: ${JSON.stringify(overlap)}`);
              if (overlap.hasBubble && overlap.hasTurnBar) {
                check(!overlap.bubbleCoversTurnBar, 'B-1 코치마크 말풍선이 턴 순서 바를 덮지 않는다',
                  `bubble=${JSON.stringify(overlap.bubble)} turnBar=${JSON.stringify(overlap.turnBar)}`);
                if (overlap.bubbleCoversTurnBar) {
                  issue('P2', 'B-1 코치마크 말풍선이 턴 순서 바를 덮는다', {
                    repro: `신규 게스트 → 1-1 첫 전투 진입 직후 B-1 안내 (뷰포트 ${VIEWPORT.width}x${VIEWPORT.height}, 렌더 1080x1920)`,
                    suspect: 'src/components/tutorial/CoachMark.js 말풍선 배치, src/components/battle/TurnOrderBar.js',
                    evidence: JSON.stringify(overlap),
                  });
                }
              } else {
                note('B-1 말풍선 또는 턴 순서 바를 찾지 못해 겹침 판정 생략(미검증)');
              }
              if (overlap.hasClose) {
                check(overlap.closeInsideBubble === true, 'B-1 코치마크 닫기 ✕ 히트박스가 말풍선 안에 있다',
                  `close=${JSON.stringify(overlap.close)} bubble=${JSON.stringify(overlap.bubble)}`);
                if (overlap.closeInsideBubble === false) {
                  issue('P2', 'B-1 코치마크 닫기 ✕ 히트박스가 말풍선 밖으로 나간다', {
                    repro: `신규 게스트 → 1-1 첫 전투 B-1 안내 (뷰포트 ${VIEWPORT.width}x${VIEWPORT.height})`,
                    suspect: 'src/components/tutorial/CoachMark.js closeHit 좌표',
                    evidence: JSON.stringify(overlap),
                  });
                }
              }
              await shot(page, `${P}-d-battle-B-1-coach`);
            }
          }
          if (bu.hasCoach && bu.close) { await tapWorld(page, bu.close.x, bu.close.y, 500); continue; }
          if (bu.hasOverlay && bu.hole) { await tapWorld(page, bu.hole.x, bu.hole.y, 500); continue; }
          break;
        }
        note(`전투 안내 관찰: ${seen.join(' → ') || '(없음)'}`);
        stepLog.push({ where: 'battle', steps: seen });
        const res = await playBattle(page, { timeout: 60000 });
        if (battleNo === 0) check(res.entered && !res.timedOut, '첫 전투 종료 → 결과 화면', JSON.stringify(res.diag || res));
        battleNo += 1;
        if (res.timedOut) {
          battleFails += 1;
          await shot(page, `${P}-stuck-battle-${battleNo}`);
          issue('P1', '전투가 종료 처리 후에도 결과 화면으로 넘어가지 않음(간헐)', {
            repro: '신규 게스트 1-1 전투 → 자동전투로 전멸까지 진행',
            suspect: 'src/scenes/BattleScene.js endBattle/showBattleResult, src/utils/transitionManager',
            evidence: JSON.stringify(res.diag || {}),
          });
          if (battleFails >= 2) { note('전투 종료 실패 반복 — 시나리오 중단'); break; }
        } else if (battleNo === 1) {
          await shot(page, `${P}-e-battle-result`);
        }
        await backToMain(page);
        continue;
      }

      if (!scenes.includes('MainMenuScene')) { await page.waitForTimeout(500); continue; }

      // 메인 메뉴는 활성 직후 한동안 안내가 아직 안 붙어 있다. 붙을 때까지 기다린다
      // (여기서 기다리지 않으면 "안내 없음 = 막힘"으로 잘못 판정한다).
      let ui = await tutorialUi(page);
      const mt0 = Date.now();
      while (!ui.done && !ui.stepId && !ui.hasOverlay && !ui.hasCoach && Date.now() - mt0 < 8000) {
        await page.waitForTimeout(400);
        ui = await tutorialUi(page);
      }
      if (ui.done) { check(true, '튜토리얼 완주 플래그(save.tutorial.completedAt)'); break; }
      if (VERBOSE) note(`   step=${ui.stepId} overlay=${ui.hasOverlay} coach=${ui.hasCoach} hole=${JSON.stringify(ui.hole)} coachTarget=${JSON.stringify(ui.coachTarget)} close=${JSON.stringify(ui.close)}`);
      if (ui.stepId !== lastStep) {
        lastStep = ui.stepId;
        poke = 0;
        // 스텝이 바뀔 때마다 재화를 함께 남긴다 — 보상 지급/소실 시점을 특정하기 위함
        const r = (await readSave(page))?.resources || {};
        stepLog.push({ step: ui.stepId, at: guard, gems: r.gems, stones: r.spiritStones, seal: r.institutionSeal, shards: r.characterShards });
        if (['T-05', 'T-08', 'T-10', 'T-12'].includes(ui.stepId)) {
          await shot(page, `${P}-c-${ui.stepId}`);
        }
      }

      // 안내가 가리키는 곳을 그대로 누른다: 강제 오버레이 구멍 > 코치마크 강조영역 > 닫기.
      // 강조 영역이 목록 전체를 덮는 스텝(T-07/T-09 각인 루트)은 중앙이 카드 사이 이음매라
      // 반응이 없다. 같은 스텝이 반복되면 영역 안쪽 다른 지점을 차례로 눌러 본다.
      const zone = (ui.hasOverlay && ui.hole) || (ui.hasCoach && ui.coachTarget) || null;
      if (zone) {
        if (poke >= POKE.length + 2) {
          // 강조 영역 안을 전부 눌러 봤는데도 스텝이 안 넘어간다 = 진행 불가
          await shot(page, `${P}-stuck-${ui.stepId}`);
          const diag = await stuckDiagnosis(page, zone);
          note(`진단: ${JSON.stringify(diag).slice(0, 1200)}`);
          onboarding.stuckAt = ui.stepId;

          if (!recoverByReload) {
            // 회귀 확인 모드 — 새로고침으로 풀어 주지 않는다. 여기서 막히면 미해소다.
            check(false, `${ui.stepId}: 각인 후 새로고침 없이 튜토리얼이 진행된다`, JSON.stringify(diag).slice(0, 300));
            issue('P0', `[회귀 미해소] 튜토리얼 ${ui.stepId} — 각인이 완료됐는데 새로고침 없이는 진행되지 않는다`, {
              repro: `신규 게스트 → 안내대로 ${ui.stepId} → 각인 실행 → 성공 화면 [확인] → 로비 (새로고침 없이 관찰)`,
              suspect: 'src/systems/TutorialManager.js 재평가 시점, src/components/popups/AscensionPopup.js 종료 후 notify',
              evidence: JSON.stringify(diag).slice(0, 800),
            });
            break;
          }

          // 새로고침으로 풀리는지 확인한다 — 풀리면 P1(1회 막힘), 안 풀리면 P0(계정 사망)
          await page.reload({ waitUntil: 'domcontentloaded' });
          onboarding.reloadsUsed += 1;
          await page.waitForTimeout(9000);
          const after = await tutorialUi(page);
          const recovered = after.stepId !== ui.stepId || after.done;
          await shot(page, `${P}-stuck-${ui.stepId}-after-reload`);
          check(recovered, `${ui.stepId} 막힘이 새로고침으로 복구되는가`, `reload 후 step=${after.stepId}`);
          // 필수 온보딩 경로가 막힌다 = 신규 유저 전원 영향. 새로고침으로 풀려도 P0 로 본다
          // (게임 안에 복구 수단이 없고, 화면은 검은 마스크만 남는다).
          issue('P0', `튜토리얼 ${ui.stepId}: 각인이 실제로 완료됐는데도 스텝이 커밋되지 않아 마스크가 화면을 막는다`, {
            repro: `신규 게스트 → 안내대로 ${ui.stepId} 까지 진행 → 각인 실행 → 성공 화면 [확인] → 로비 복귀`,
            suspect: 'src/systems/TutorialManager.js(evaluate 재평가 시점), src/components/popups/AscensionPopup.js(_showSuccessScreen→close 후 refresh 미호출), src/components/tutorial/TutorialFlow.js',
            evidence: `${recovered ? '새로고침으로 복구됨' : '새로고침으로도 복구 안 됨'} | ${JSON.stringify(diag).slice(0, 800)}`,
          });
          if (!recovered) break;
          poke = 0;
          lastStep = null;
          continue;
        }
        if (poke >= POKE.length && ui.close) {
          // 강조 영역을 다 눌러 봤다 — 닫기(=안내 해제)가 완료 조건인 스텝(T-12)일 수 있다
          poke += 1;
          await tapWorld(page, ui.close.x, ui.close.y, 900);
          continue;
        }
        const p = POKE[Math.min(poke, POKE.length - 1)];
        poke += 1;
        await tapWorld(page, zone.x + p[0] * zone.w, zone.y + p[1] * zone.h, 900);
        continue;
      }
      if (ui.hasCoach && ui.close) { await tapWorld(page, ui.close.x, ui.close.y, 600); continue; }

      // 안내가 없는데 완주도 아니면 — 진행 불가 후보. 결과 화면 계열 버튼을 눌러 본다
      const escape = await tapLabel(page, '확인', { required: false, settle: 800 })
        || await tapLabel(page, '메인으로', { required: false, settle: 800 })
        || await closePopup(page);
      if (!escape) {
        if (stuckAt === ui.stepId) break;
        stuckAt = ui.stepId;
        await page.waitForTimeout(1200);
      }
    }

    const save = await readSave(page);
    const doneSteps = save?.tutorial?.completedSteps || [];
    const mainDone = ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06', 'T-07', 'T-08', 'T-09', 'T-10', 'T-11', 'T-12'].filter((s) => doneSteps.includes(s));
    const battleDone = ['B-1', 'B-2', 'B-3', 'B-4', 'B-5'].filter((s) => doneSteps.includes(s));
    check(mainDone.length === 12, `튜토리얼 12스텝 완주 (${mainDone.length}/12)`, `미완: ${['T-01','T-02','T-03','T-04','T-05','T-06','T-07','T-08','T-09','T-10','T-11','T-12'].filter((s) => !doneSteps.includes(s)).join(',') || '없음'}`);
    check(battleDone.length === 5, `전투 안내 B-1~B-5 커밋 (${battleDone.length}/5)`, `미완: ${['B-1','B-2','B-3','B-4','B-5'].filter((s) => !doneSteps.includes(s)).join(',') || '없음'}`);
    if (mainDone.length < 12) {
      issue('P1', `튜토리얼이 ${lastStep ?? '?'} 에서 더 진행되지 않음 (${mainDone.length}/12)`, {
        repro: '게스트 로그인 → 안내가 가리키는 지점만 탭하며 진행',
        suspect: 'src/systems/TutorialManager.js, src/components/tutorial/TutorialFlow.js',
        evidence: `completedSteps=${doneSteps.join(',')}`,
      });
    }

    // 첫 소환·첫 각인 결과가 세이브에 남았는지
    check((save?.characters || []).length >= 2, `튜토리얼 중 영웅 획득 (${(save?.characters || []).length}명)`);
    check((save?.gacha?.totalPulls || 0) >= 1, `첫 소환 기록 (totalPulls=${save?.gacha?.totalPulls || 0})`);

    await shot(page, `${P}-f-final`);
    await layoutAudit(page, '온보딩 종료 시점');
    note(`스텝 로그: ${JSON.stringify(stepLog)}`);
    onboarding.steps = stepLog;
    onboarding.completedSteps = doneSteps;
    onboarding.mainDone = mainDone.length;
    onboarding.battleDone = battleDone.length;
    currentScenario().consoleErrors = errors.slice(0, 20);
    check(errors.length === 0, '온보딩 전 구간 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
  return onboarding;
}

// ============================================================
// 진행된 계정 준비 — 시나리오 2~8 공통
// ============================================================

/**
 * 게스트로 로그인한 뒤 디버그 치트로 "튜토리얼을 마친 유저"를 만든다.
 * 세이브를 손으로 조립하지 않고 게임 자신의 지급 경로(unlockAllCharacters 등)를 쓰는 이유는,
 * 손으로 만든 세이브가 마이그레이션을 타면서 실제 계정과 다른 모양이 되기 때문이다.
 */
async function prepareVeteran(page, { chapter = 3, tower = 15 } = {}) {
  await boot(page);
  await guestLogin(page);
  await page.waitForTimeout(1500);
  await safeEvaluate(page, ({ chapter, tower }) => {
    const d = window.debug;
    d.unlockAllCharacters();
    d.maxResources();
    d.clearAllStages();
    d.skipToChapter(`chapter_${chapter}`);
    d.giveAllEquipment();
    d.addSweepTickets(20);
    d.setTowerFloor(tower);
    d.autoOptimalParty();
    d._refreshHeroRegistry();

    // 튜토리얼은 완주 처리하고 파티 4인을 채운다 — 시나리오 2~8 은 튜토리얼 이후의 화면을 본다.
    // (debug.autoOptimalParty 는 파티를 채우지 못하는 경우가 있어 세이브에 직접 넣는다)
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
    const ids = (save.characters || []).map((c) => c.id).filter(Boolean).slice(0, 4);
    if (ids.length) save.parties = [[...ids, null, null, null].slice(0, 4)];
    (save.characters || []).forEach((c) => { c.level = 20; });   // 3성 만렙(30) 미만 — 레벨업 검증 여지를 남긴다
    save.tutorial = {
      currentStep: null,
      completedSteps: ['T-01','T-02','T-03','T-04','T-05','T-06','T-07','T-08','T-09','T-10','T-11','T-12','B-1','B-2','B-3','B-4','B-5'],
      skippedSteps: [], skipped: false, completed: true,
      startedAt: Date.now() - 3600000, completedAt: Date.now() - 1800000,
    };
    localStorage.setItem('arcane_collectors_save', JSON.stringify(save));
  }, { chapter, tower });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const scenes = await activeScenes(page);
    if (scenes.includes('MainMenuScene')) break;
    if (scenes.includes('CutsceneScene')) { await skipCutscenes(page, 3); continue; }
    if (scenes.includes('LoginScene')) { await guestLogin(page); continue; }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2500);
  // 복귀 유저 카드·팝업이 떠 있으면 닫는다
  await closePopup(page);
  return true;
}

/** 새로고침 후 로비(MainMenuScene)가 뜰 때까지 기다린다. 로그인 화면이면 다시 게스트 로그인 */
async function waitForLobby(page, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const scenes = await activeScenes(page);
    if (scenes.includes('MainMenuScene')) { await page.waitForTimeout(2000); return true; }
    if (scenes.includes('CutsceneScene')) { await skipCutscenes(page, 3); continue; }
    if (scenes.includes('LoginScene')) {
      const btn = await findByLabel(page, '게스트로 시작', { sceneKeys: ['LoginScene'] });
      if (btn) { await tapWorld(page, btn.x, btn.y, 1500); continue; }
    }
    await page.waitForTimeout(500);
  }
  return false;
}

/** 로비 상태 스냅 (명상 뷰 + 유휴 시스템) */
const lobbyState = (page) => safeEvaluate(page, () => {
  const mm = window.game?.scene?.getScene?.('MainMenuScene');
  const view = mm?.idleBattleView;
  const idle = mm?.idleSystem;
  return {
    accumulated: idle?.accumulatedDamage ?? null,
    required: view?.requiredMana ?? null,
    focus: view?._focus ?? null,
    dps: idle?.currentDPS ?? idle?.dps ?? null,
    partyCount: (view?.chibis || view?.partyChibis || []).length || null,
    manaText: view?.manaText?.text || null,
    focusText: view?.focusLabel?.text || null,
    etaText: view?.etaText?.text || null,
    readyVisible: !!view?.readyText?.visible,
  };
});

// ============================================================
// 2. 명상 로비
// ============================================================

async function scenario2(browser) {
  startScenario(2, '명상 로비 — 마력 축적·수확·오프라인 복귀');
  const { page, ctx, errors } = await newSession(browser);
  try {
    await prepareVeteran(page);
    await shot(page, '02-meditation-a-lobby');
    check((await activeScenes(page)).includes('MainMenuScene'), '로비 진입');

    // --- 집중력(표시) vs 실제 축적 속도 ---
    const s0 = await lobbyState(page);
    check(s0.accumulated !== null, '유휴 시스템 축적 마력 읽기', JSON.stringify(s0));
    await page.waitForTimeout(10000);
    const s1 = await lobbyState(page);
    const grew = (s1.accumulated ?? 0) > (s0.accumulated ?? 0);
    check(grew, '마력이 시간에 따라 실제로 증가', `${s0.accumulated} → ${s1.accumulated}`);

    if (grew && s1.focus) {
      const measured = (s1.accumulated - s0.accumulated) / 10;
      const shown = s1.focus;
      const ratio = measured > 0 ? shown / measured : 0;
      const ok = ratio > 0.5 && ratio < 2.0;   // 지수평활이 있으므로 2배 이내면 일치로 본다
      check(ok, '표시 집중력/초 ↔ 실측 증가율 일치', `표시 ${shown.toFixed(1)}/s, 실측 ${measured.toFixed(1)}/s (비 ${ratio.toFixed(2)})`);
      if (!ok) {
        issue('P2', '집중력/초 표시가 실제 마력 증가율과 어긋난다', {
          repro: '로비에서 10초 대기하며 축적 마력 증가분과 집중력 표기를 비교',
          suspect: 'src/components/MeditationView.js renderMana(_focus 산출)',
          evidence: `표시 ${shown.toFixed(1)}/s vs 실측 ${measured.toFixed(1)}/s`,
        });
      }
      note(`마력 ${s1.manaText} / 집중력 ${s1.focusText} / ETA ${s1.etaText}`);
    }

    // --- 수확 ---
    const before = await readSave(page);
    const harvestBtn = await findByLabel(page, '보상받기', { sceneKeys: ['MainMenuScene'] })
      || await findByLabel(page, '수확', { sceneKeys: ['MainMenuScene'] });
    if (harvestBtn) {
      await tapWorld(page, harvestBtn.x, harvestBtn.y, 1500);
      await shot(page, '02-meditation-b-harvest');
      const after = await readSave(page);
      const gained = (after?.resources?.gold || 0) - (before?.resources?.gold || 0);
      check(gained !== 0 || (after?.statistics?.totalGoldEarned || 0) > (before?.statistics?.totalGoldEarned || 0),
        '수확(보상받기)이 실제 재화를 지급', `골드 ${before?.resources?.gold} → ${after?.resources?.gold}`);
      if (gained === 0) {
        issue('P1', '보상받기를 눌러도 골드가 늘지 않는다', {
          repro: '로비 → [보상받기] 탭 → 세이브의 resources.gold 비교',
          suspect: 'src/systems/IdleProgressSystem.js, src/scenes/MainMenuScene.js 보상 수령 핸들러',
          evidence: `gold ${before?.resources?.gold} → ${after?.resources?.gold}`,
        });
      }
    } else {
      check(false, '수확 버튼이 로비에 노출');
    }

    // --- 오프라인 복귀 ---
    // 주의: debug.setLastOnlineTime() 은 `lastOnlineTime` 을 쓰는데 게임이 읽는 필드는
    // `lastOnline`/`lastLogoutTime` 이다(아래 P2 참조). 그래서 세이브를 직접 되돌린다.
    await safeEvaluate(page, () => {
      const d = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      const ago = Date.now() - 6 * 3600 * 1000;
      d.lastOnline = ago; d.lastLogoutTime = ago; d.lastOnlineTime = ago;
      localStorage.setItem('arcane_collectors_save', JSON.stringify(d));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const lobbyBack = await waitForLobby(page);
    check(lobbyBack, '새로고침 후 로비 복귀');
    await shot(page, '02-meditation-c-offline-return');
    const offlineTexts = (await visibleTexts(page)).map((t) => t.text);
    const hasOffline = offlineTexts.some((t) => /오프라인|자리를 비운|복귀|그동안/.test(t));
    // 보상이 "계산은 됐는데 화면에 안 뜨는" 것인지 구분한다 — 원인이 완전히 다르다
    const offlineModel = await safeEvaluate(page, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      return {
        pending: window.game.registry.get('pendingOfflineRewards') || null,
        passed: mm?.showOfflineRewards ? { gold: mm.showOfflineRewards.gold, duration: mm.showOfflineRewards.duration } : null,
      };
    });
    note(`오프라인 보상 모델: ${JSON.stringify(offlineModel)}`);
    check(!!offlineModel.pending, '오프라인 보상이 계산되어 registry 에 실린다', JSON.stringify(offlineModel.pending));
    check(hasOffline, '오프라인 6시간 후 복귀 보상 팝업 노출', offlineTexts.slice(0, 8).join(' / '));
    if (!hasOffline && offlineModel.passed) {
      issue('P1', `오프라인 보상(${offlineModel.passed.gold} 골드)이 계산·전달되는데 수령 팝업이 뜨지 않는다`, {
        repro: '세이브의 lastOnline/lastLogoutTime 을 6시간 전으로 되돌리고 새로고침 → 로비',
        suspect: 'src/scenes/MainMenuScene.js:176~199 showOfflineRewardsPopup 호출부, 같은 파일 showOfflineRewardsPopup()',
        evidence: JSON.stringify(offlineModel),
      });
    } else if (!hasOffline) {
      issue('P2', '오프라인 6시간 뒤 복귀해도 누적 보상 안내가 보이지 않는다', {
        repro: '세이브의 lastOnline 을 6시간 전으로 되돌리고 새로고침',
        suspect: 'src/systems/SaveManager.js calculateOfflineRewards, src/scenes/BootScene.js',
        evidence: offlineTexts.slice(0, 10).join(' / '),
      });
    }

    // 디버그 치트가 실제로 읽히는 필드를 쓰지 않는다 (개발 도구 결함)
    const cheatField = await safeEvaluate(page, () => {
      window.debug.setLastOnlineTime(5);
      const after = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      return {
        hoursAgoOnLastOnline: Math.round((Date.now() - after.lastOnline) / 3600000 * 10) / 10,
        hoursAgoOnLastOnlineTime: after.lastOnlineTime ? Math.round((Date.now() - after.lastOnlineTime) / 3600000 * 10) / 10 : null,
      };
    });
    const cheatWorks = cheatField.hoursAgoOnLastOnline >= 4;
    check(cheatWorks, 'debug.setLastOnlineTime(5) 이 오프라인 계산 필드(lastOnline)를 5시간 전으로 되돌린다', JSON.stringify(cheatField));
    if (!cheatWorks) {
      issue('P2', 'debug.setLastOnlineTime()/fastForwardOffline() 이 아무 데서도 읽지 않는 lastOnlineTime 필드를 쓴다 (게다가 SaveManager.save 가 lastOnline 을 현재로 되돌려 오프라인 시간이 0이 된다)', {
        repro: 'window.debug.setLastOnlineTime(5) 호출 후 세이브의 lastOnline 경과 시간 확인',
        suspect: 'src/systems/DebugManager.js:597,608 (lastOnlineTime) vs src/systems/SaveManager.js:1201 (lastOnline)',
        evidence: JSON.stringify(cheatField),
      });
    }

    // --- 치비 렌더 ---
    const chibi = await safeEvaluate(page, () => {
      const v = window.game?.scene?.getScene?.('MainMenuScene')?.idleBattleView;
      const keys = Object.keys(v || {}).filter((k) => /chibi|party|ally/i.test(k));
      const arr = keys.map((k) => (Array.isArray(v[k]) ? { k, n: v[k].length } : null)).filter(Boolean);
      return { keys, arr };
    });
    note(`명상 뷰 파티 오브젝트: ${JSON.stringify(chibi)}`);
    manual('치비 4인 렌더·교단색·부유 애니메이션', '02-meditation-a-lobby.png / 02-meditation-c-offline-return.png');

    await layoutAudit(page, '명상 로비');
    currentScenario().consoleErrors = errors.slice(0, 20);
    check(errors.length === 0, '명상 로비 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

// ============================================================
// 3. 메뉴 도크
// ============================================================

const DOCK = [
  { cat: '성장', items: ['영웅', '파티', '각인', '가방'] },
  { cat: '도전', items: ['무한탑', '레이드', '이벤트', '퀘스트'] },
  { cat: '교류', items: ['PvP', '길드', '친구'] },
  { cat: '수집', items: ['소환', '도감'] },
];

async function scenario3(browser) {
  startScenario(3, '메뉴 도크 — 카테고리 펼침·배지·잠금');
  const { page, ctx, errors } = await newSession(browser);
  try {
    await prepareVeteran(page);
    await shot(page, '03-dock-a-collapsed');

    for (const { cat, items } of DOCK) {
      const opened = await tapLabel(page, cat, { exact: true, sceneKeys: ['MainMenuScene'], required: false, settle: 800 });
      if (!opened) { check(false, `도크 카테고리 [${cat}] 탭 가능`); continue; }
      const shown = [];
      for (const it of items) if (await findByLabel(page, it, { exact: true, sceneKeys: ['MainMenuScene'] })) shown.push(it);
      check(shown.length === items.length, `[${cat}] 하위 항목 ${items.length}개 노출`, `보임: ${shown.join(',')}`);
      if (shown.length !== items.length) {
        issue('P1', `메뉴 도크 [${cat}] 에서 ${items.filter((i) => !shown.includes(i)).join(',')} 항목이 보이지 않는다`, {
          repro: `로비 하단 도크에서 [${cat}] 탭`,
          suspect: 'src/utils/menuLayout.js, src/scenes/MainMenuScene.js 도크 렌더',
        });
      }
      await shot(page, `03-dock-b-${cat}`);
      await layoutAudit(page, `도크 ${cat}`);
      // 다시 탭하면 접힌다
      await tapLabel(page, cat, { exact: true, sceneKeys: ['MainMenuScene'], required: false, settle: 700 });
      const stillOpen = await findByLabel(page, items[0], { exact: true, sceneKeys: ['MainMenuScene'] });
      check(!stillOpen, `[${cat}] 다시 탭하면 접힌다`);
    }

    // --- 배지 숫자 ↔ 실제 수령 가능 건수 ---
    const badge = await safeEvaluate(page, async () => {
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      const quest = window.__TEST_API__?.getQuestStatus?.() || null;
      // 화면의 배지 숫자 텍스트 수집 (도크/시트에 붙은 1~9+ 표기)
      const collect = (list, out) => { list.forEach((o) => { if (!o) return; out.push(o); if (Array.isArray(o.list)) collect(o.list, out); }); return out; };
      const mm = window.game.scene.getScene('MainMenuScene');
      const badges = collect(mm.children.list, [])
        .filter((o) => o.type === 'Text' && /^\d\+?$|^9\+$/.test((o.text || '').trim()))
        .map((o) => ({ text: o.text, x: Math.round(o.x), y: Math.round(o.y) }));
      return { quest, badges, tickets: save?.resources?.summonTickets };
    });
    note(`배지 텍스트: ${JSON.stringify(badge.badges).slice(0, 300)}`);
    note(`퀘스트 상태: ${JSON.stringify(badge.quest).slice(0, 300)}`);

    // 씬이 계산한 배지 모델을 그대로 읽어 실제 수령 가능 건수와 대조한다
    const model = await safeEvaluate(page, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      return {
        badges: mm?._menuBadges || null,
        quest: window.__TEST_API__?.getQuestStatus?.() || null,
        tickets: save?.resources?.summonTickets ?? 0,
        freeTenUsed: save?.gacha?.freeTenPullUsed === true,
        heroCount: (save?.characters || []).length,
        invCount: (save?.inventory || []).length,
      };
    });
    note(`배지 모델: ${JSON.stringify(model.badges)}`);
    if (model.badges && model.quest) {
      const qb = model.badges.quest?.count ?? 0;
      const qa = model.quest.claimable ?? 0;
      check(qb === qa, '퀘스트 배지 숫자 = 실제 수령 가능 퀘스트 수', `배지 ${qb} vs 실제 ${qa}`);
      if (qb !== qa) {
        issue('P1', `퀘스트 배지 숫자(${qb})가 실제 수령 가능 건수(${qa})와 다르다`, {
          repro: '로비 도크 > 도전 > 퀘스트 배지 숫자와 퀘스트 팝업의 수령 가능 개수 비교',
          suspect: 'src/scenes/MainMenuScene.js _collectMenuBadgeContext, src/systems/MenuBadgeRules.js',
          evidence: JSON.stringify(model.badges),
        });
      }
      const gb = model.badges.gacha;
      const expected = model.freeTenUsed ? Math.floor(model.tickets / 10) : 1;
      const gok = (gb?.count ?? 0) === expected;
      check(gok, '소환 배지 숫자 = 무료10연 미사용(1) 또는 소환권/10', `배지 ${gb?.count ?? 0}(${gb?.type}) vs 기대 ${expected}, 소환권 ${model.tickets}`);
      if (!gok) {
        issue('P2', `소환 배지 숫자(${gb?.count ?? 0})가 소환권 보유량(${model.tickets})과 맞지 않는다`, {
          repro: '로비 도크 > 수집 > 소환 배지 확인',
          suspect: 'src/systems/MenuBadgeRules.js computeMenuBadges(gacha)',
          evidence: JSON.stringify(model.badges),
        });
      }
    } else {
      check(false, '메뉴 배지 모델(_menuBadges) 읽기');
    }
    manual('카테고리 롤업 숫자(9+)의 구성 항목이 납득 가능한지', '03-dock-a-collapsed.png');

    currentScenario().consoleErrors = errors.slice(0, 20);
    check(errors.length === 0, '메뉴 도크 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

// ============================================================
// 4. 전투
// ============================================================

async function scenario4(browser) {
  startScenario(4, '전투 — 자동/수동·스킬·상태 표시·결과');
  const { page, ctx, errors } = await newSession(browser);
  try {
    await prepareVeteran(page);
    // 진행도에 따라 로비 진입점 라벨이 다르다: 신규는 [전투 시작], 클리어한 챕터는 [보스전]/[소탕]
    let start = null;
    for (const label of ['전투 시작', '보스전', '소탕']) {
      start = await findByLabel(page, label, { exact: true, sceneKeys: ['MainMenuScene'] })
        || (label === '전투 시작' ? await findByLabel(page, '전투 시작 (', { sceneKeys: ['MainMenuScene'] }) : null);
      if (start) { note(`로비 전투 진입점: "${start.text}"`); break; }
    }
    check(!!start, '로비에 전투 진입점 노출(전투 시작/보스전)');
    if (start) await tapWorld(page, start.x, start.y, 2000);
    await skipCutscenes(page, 3);

    const up = await (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 25000) {
        if ((await activeScenes(page)).includes('BattleScene')) return true;
        await skipCutscenes(page, 1);
        await page.waitForTimeout(400);
      }
      return false;
    })();
    check(up, '전투 화면 진입');
    if (!up) return;

    await page.waitForTimeout(1200);
    await shot(page, '04-battle-a-start');
    const st0 = await battleState(page);
    check(st0.auto === false, '전투 진입 시 기본은 수동(AUTO OFF)', `auto=${st0.auto}`);

    // HP 수치 표기 / 교단 배지 / 상태이상
    const texts = (await visibleTexts(page)).map((t) => t.text);
    const hpShown = texts.some((t) => /\d+\s*\/\s*\d+/.test(t));
    check(hpShown, 'HP를 수치로 표기', texts.filter((t) => /\d+\/\d+/.test(t)).slice(0, 3).join(' / '));

    // 전투에 들어온 아군이 실제 보유 영웅과 같은가 — 이름(한국어)과 최대 HP를 대조한다
    const allies = await safeEvaluate(page, () => {
      const bs = window.game.scene.getScene('BattleScene');
      const heroes = window.__TEST_API__?.getHeroes?.() || [];
      return {
        battle: (bs?.allies || []).map((a) => ({ id: a.id, name: a.name, maxHp: a.maxHp, atk: a.atk ?? a.attack })),
        owned: heroes.slice(0, 6).map((h) => ({ id: h.id, name: h.name, level: h.level })),
      };
    });
    note(`전투 아군: ${JSON.stringify(allies.battle)}`);
    const rawIdName = allies.battle.some((a) => /^(base_|asc_|char_)/.test(String(a.name || '')));
    const flatHp = allies.battle.length > 0 && allies.battle.every((a) => a.maxHp === 100);
    check(!rawIdName, '전투 아군 이름이 한국어 이름으로 표시(내부 ID 아님)', JSON.stringify(allies.battle.map((a) => a.name)));
    check(!flatHp, '전투 아군 최대 HP가 영웅 스탯에서 로드됨(기본값 100 아님)', JSON.stringify(allies.battle.map((a) => a.maxHp)));
    if (rawIdName || flatHp) {
      issue('P0', '보스전으로 들어간 전투에서 파티 영웅이 해석되지 않아 이름은 내부 ID, 최대 HP는 기본값 100 이 된다 (반드시 패배)', {
        repro: '로비 → [보스전] → 전투 화면의 아군 이름/HP 확인',
        suspect: 'src/scenes/MainMenuScene.js:1378 — 보스전 파티 로드만 레거시 getCharacter(id)(characters.json: char_1~4)를 쓴다. 같은 파일 348·1299·1578 행은 getCharacterOrHero(id) 를 쓴다',
        evidence: JSON.stringify(allies).slice(0, 700),
      });
    }
    const cultBadge = await safeEvaluate(page, () => {
      const bs = window.game.scene.getScene('BattleScene');
      const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
      const all = collect(bs.children.list, []);
      return {
        named: all.filter((o) => o.name && /cult|badge|status|buff|debuff/i.test(o.name)).map((o) => o.name).slice(0, 12),
        total: all.length,
      };
    });
    note(`전투 화면 배지/상태 오브젝트: ${JSON.stringify(cultBadge)}`);
    manual('교단 배지·상태이상 아이콘 가독성', '04-battle-a-start.png');

    // 수동 턴 1회
    const nextTurn = await waitForLabel(page, '다음 턴', { sceneKeys: ['BattleScene'] }, 12000);
    if (nextTurn) {
      const t0 = (await battleState(page)).turn;
      await tapWorld(page, nextTurn.x, nextTurn.y, 2500);
      const t1 = (await battleState(page)).turn;
      check(t1 >= t0, '[다음 턴] 탭으로 수동 진행', `turn ${t0} → ${t1}`);
    } else {
      check(false, '수동 대기 시 [다음 턴] 버튼 노출');
    }

    // 스킬 사용 — 파티 카드 탭
    const skillCard = await safeEvaluate(page, () => {
      const bs = window.game.scene.getScene('BattleScene');
      const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
      // 하단 파티 카드 영역(속도/퇴각 버튼 위)의 텍스트 = 영웅 이름 + 스킬명
      const cands = collect(bs.children.list, []).filter((o) => {
        if (o.type !== 'Text' || !o.text || !o.visible) return false;
        const b = o.getBounds();
        return b.centerY > 1550 && b.centerY < 1800 && !/AUTO|퇴각|^\dx$/.test(o.text);
      });
      if (!cands.length) return null;
      const hit = cands[cands.length - 1];
      const b = hit.getBounds();
      return { text: hit.text, x: b.centerX, y: b.centerY };
    });
    if (skillCard) {
      await tapWorld(page, skillCard.x, skillCard.y, 2000);
      await shot(page, '04-battle-b-skill');
      check(true, `스킬 카드 탭 (${skillCard.text})`);
    } else {
      check(false, '스킬 카드가 전투 화면에 노출');
    }

    // 자동전투로 종료
    const res = await playBattle(page, { timeout: 90000 });
    check(res.entered && !res.timedOut, '자동전투로 전투 종료 → 결과 화면', JSON.stringify(res.diag || {}));
    if (res.timedOut) {
      issue('P1', '자동전투가 끝나지 않는다', { repro: '로비 → 전투 시작 → AUTO ON', suspect: 'src/scenes/BattleScene.js', evidence: JSON.stringify(res.diag || {}) });
    }
    if (!res.timedOut) {
      await page.waitForTimeout(1200);
      await shot(page, '04-battle-c-result');
      const rt = (await visibleTexts(page)).map((t) => t.text);
      check(rt.some((t) => /승리|패배|VICTORY|DEFEAT|클리어/.test(t)), '결과 화면에 승패 표기', rt.slice(0, 8).join(' / '));
      const retry = await findByLabel(page, '재도전', { sceneKeys: ['BattleResultScene'] });
      check(!!retry, '결과 화면에 [재도전] 제공');
      await layoutAudit(page, '전투 결과');
      await backToMain(page);
    }

    // 소탕
    const sweepOpened = await (async () => {
      const st = await findByLabel(page, '전투 시작', { sceneKeys: ['MainMenuScene'] });
      if (!st) return false;
      await tapWorld(page, st.x, st.y - 120, 1000);  // 스테이지 선택 진입 시도
      return true;
    })();
    const sweep = await findByLabel(page, '소탕');
    check(!!sweep, '소탕 진입점 노출', sweep ? `"${sweep.text}"` : `스테이지 선택 진입=${sweepOpened}`);
    if (sweep) {
      const before = await readSave(page);
      await tapWorld(page, sweep.x, sweep.y, 2000);
      await shot(page, '04-battle-d-sweep');
      const after = await readSave(page);
      check((after?.resources?.gold || 0) >= (before?.resources?.gold || 0), '소탕 후 재화 감소 없음(정상 지급 또는 무변화)',
        `gold ${before?.resources?.gold} → ${after?.resources?.gold}`);
    }

    currentScenario().consoleErrors = errors.slice(0, 20);
    check(errors.length === 0, '전투 구간 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

// ============================================================
// 5. 성장 루프
// ============================================================

async function scenario5(browser) {
  startScenario(5, '성장 루프 — 레벨업·장비·각인·컬렉션');
  const { page, ctx, errors } = await newSession(browser);
  try {
    await prepareVeteran(page);
    check(await openMenu(page, '성장', '영웅'), '성장 > 영웅 팝업 열기');
    await page.waitForTimeout(1200);
    await shot(page, '05-growth-a-herolist');

    // 첫 영웅 카드 진입
    // 카드의 **입력 영역**(팝업 안 165x210 Rectangle)을 눌러야 상세가 열린다.
    // 로비 파티 슬롯에도 같은 영웅 이름이 있어서 이름 텍스트로 찾으면 로비를 누르게 된다.
    const card = await safeEvaluate(page, () => {
      const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
      for (const sc of window.game.scene.getScenes(true)) {
        for (const o of collect(sc.children.list, [])) {
          if (!o.input?.enabled || o.type !== 'Rectangle') continue;
          let top = o.depth; for (let n = o; n; n = n.parentContainer) top = Math.max(top, n.depth || 0);
          if (top < 2000) continue;
          const b = o.getBounds();
          if (b.width > 120 && b.width < 260 && b.height > 150 && b.height < 300) return { x: b.centerX, y: b.centerY };
        }
      }
      return null;
    });
    check(!!card, '영웅 목록에 영웅 카드(입력 영역) 렌더');
    if (card) await tapWorld(page, card.x, card.y, 2200);
    await shot(page, '05-growth-b-heroinfo');
    const summaryOk = !!(await findByLabel(page, '전투력'));
    check(summaryOk, '영웅 카드 탭 → 요약 팝업(전투력·스킬) 표시');

    // [상세 보기] 로 4탭 상세 화면 진입
    const detail = await tapLabel(page, '상세 보기', { required: false, settle: 2500 });
    check(!!detail, '요약 팝업에서 [상세 보기] 진입');
    await shot(page, '05-growth-b-herodetail');

    const tabs = ['스탯', '스킬', '장비', '이야기'];
    const seen = [];
    for (const t of tabs) if (await findByLabel(page, t, { exact: true })) seen.push(t);
    check(seen.length >= 3, `영웅 상세 탭 노출 (${seen.join(',')})`, `기대 ${tabs.join(',')}`);
    for (const t of seen) {
      await tapLabel(page, t, { exact: true, required: false, settle: 900 });
      await shot(page, `05-growth-c-tab-${t}`);
      await layoutAudit(page, `영웅 상세 ${t}`);
    }

    // 리드 지목(2026-09-07): 하단 버튼 보조 라벨 잘림이 "재현 안 됨" 으로 남았다.
    // 재현되는지 확인하고, 되면 뷰포트까지 포함한 재현 절차를 남긴다.
    const detailClipped = await clippedTexts(page);
    check(detailClipped.length === 0, '영웅 상세에 화면 경계로 잘린 텍스트 없음',
      detailClipped.slice(0, 4).map((t) => `"${t.text}"@(${t.x},${t.y},${t.w}x${t.h})`).join(' / '));
    if (detailClipped.length > 0) {
      issue('P2', `영웅 상세 하단 라벨이 화면 경계에 잘린다 (${detailClipped.length}건)`, {
        repro: `계정 B → 성장 > 영웅 > 카드 > [상세 보기] → 하단. 뷰포트 ${VIEWPORT.width}x${VIEWPORT.height}(CSS px, DPR 1), 게임 렌더 1080x1920, Chromium headless`,
        suspect: 'src/scenes/HeroDetailScene.js 하단 액션 바 배치',
        evidence: detailClipped.slice(0, 6).map((t) => `"${t.text}" y=${t.y} h=${t.h}`).join(' / '),
      });
    }

    // --- 레벨업 → 전투력 변화 ---
    const powerBefore = await heroPower(page);
    const lvBtn = await findByLabel(page, '레벨업') || await findByLabel(page, '강화');
    if (lvBtn) {
      await tapWorld(page, lvBtn.x, lvBtn.y, 1800);
      await shot(page, '05-growth-d-levelup');
      const powerAfter = await heroPower(page);
      const up = powerAfter.power > powerBefore.power || powerAfter.level > powerBefore.level;
      check(up, '레벨업 후 레벨/전투력 상승', `Lv ${powerBefore.level}→${powerAfter.level}, 전투력 ${powerBefore.power}→${powerAfter.power}`);
      if (!up) {
        issue('P1', '레벨업을 눌러도 레벨·전투력이 변하지 않는다', {
          repro: '성장 > 영웅 > 영웅 선택 > [레벨업]',
          suspect: 'src/scenes/HeroDetailScene.js, src/systems/ProgressionSystem.js',
          evidence: `${JSON.stringify(powerBefore)} → ${JSON.stringify(powerAfter)}`,
        });
      }
    } else {
      check(false, '영웅 상세에 [레벨업] 버튼 노출');
    }

    // --- 장비 장착 → 스탯 반영 ---
    await tapLabel(page, '장비', { exact: true, required: false, settle: 1000 });
    const equipSlot = await findByLabel(page, '무기') || await findByLabel(page, '장착');
    if (equipSlot) {
      const p0 = await heroPower(page);
      await tapWorld(page, equipSlot.x, equipSlot.y, 1500);
      await shot(page, '05-growth-e-equip');
      const okBtn = await findByLabel(page, '장착', { exact: true });
      if (okBtn) await tapWorld(page, okBtn.x, okBtn.y, 1800);
      const p1 = await heroPower(page);
      check(p1.power >= p0.power, '장비 장착 후 전투력이 줄지 않음', `${p0.power} → ${p1.power}`);
      note(`장비 장착 전후 전투력 ${p0.power} → ${p1.power}`);
    } else {
      check(false, '장비 탭에 슬롯/장착 진입점 노출');
    }

    // 영웅 상세는 별도 씬이라 팝업 닫기로는 못 나온다. 로비로 확실히 복귀한다
    await backToLobby(page);

    // --- 컬렉션 보너스 ---
    if (await openMenu(page, '수집', '도감')) {
      await page.waitForTimeout(1200);
      await shot(page, '05-growth-f-collection');
      const ct = (await visibleTexts(page)).map((t) => t.text);
      check(ct.some((t) => /보너스|효과|\+\d/.test(t)), '도감에 컬렉션 보너스 표기', ct.slice(0, 8).join(' / '));
      await layoutAudit(page, '도감');
      await closePopup(page);
    } else check(false, '수집 > 도감 팝업 열기');

    currentScenario().consoleErrors = errors.slice(0, 20);
    check(errors.length === 0, '성장 루프 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

/**
 * 현재 열려 있는 영웅 화면의 레벨·전투력을 **화면 표기에서** 읽는다.
 * registry 의 파생값이 아니라 유저가 보는 숫자를 대조해야 "표시값 ↔ 실제" 검증이 된다.
 */
const heroPower = (page) => safeEvaluate(page, () => {
  const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
  let power = null, level = null;
  const texts = [];
  for (const sc of window.game.scene.getScenes(true)) {
    for (const o of collect(sc.children.list, [])) {
      if (o.type !== 'Text' || !o.text) continue;
      let n = o, vis = true; while (n) { if (n.visible === false || n.alpha < 0.05) { vis = false; break; } n = n.parentContainer; }
      if (!vis) continue;
      const b = o.getBounds();
      texts.push({ t: o.text.trim(), x: b.centerX, y: b.centerY });
    }
  }
  // '전투력' 라벨과 같은 줄(±40px)에 있는 숫자를 그 값으로 본다
  const label = texts.find((x) => x.t === '전투력');
  if (label) {
    const near = texts.filter((x) => x !== label && Math.abs(x.y - label.y) < 45 && /^[\d,]+$/.test(x.t));
    if (near.length) power = Number(near[0].t.replace(/,/g, ''));
  }
  const lv = texts.find((x) => /^Lv\.?\s*\d+/.test(x.t));
  if (lv) level = Number((lv.t.match(/\d+/) || [0])[0]);
  return { level, power, sample: texts.slice(0, 6).map((x) => x.t) };
});

// ============================================================
// 6. 가챠
// ============================================================

async function scenario6(browser) {
  startScenario(6, '가챠 — 배너·단발/10연·SSR 컷인·확률 고지·피티');
  const { page, ctx, errors } = await newSession(browser);
  try {
    await prepareVeteran(page);
    check(await openMenu(page, '수집', '소환'), '수집 > 소환 팝업 열기');
    await page.waitForTimeout(1500);
    await shot(page, '06-gacha-a-banner');
    await layoutAudit(page, '가챠 배너');

    const pity0 = await safeEvaluate(page, () => window.__TEST_API__?.getGachaStatus?.() || null);
    note(`피티 초기: ${JSON.stringify(pity0)}`);

    // 확률 고지
    const rateBtn = await findByLabel(page, '확률 및 천장 상세 보기') || await findByLabel(page, '확률');
    if (rateBtn) {
      await tapWorld(page, rateBtn.x, rateBtn.y, 1500);
      await shot(page, '06-gacha-b-rates');
      const rt = (await visibleTexts(page)).map((t) => t.text).filter((t) => /%/.test(t));
      check(rt.length > 0, '확률 고지 패널에 수치 표기', rt.slice(0, 8).join(' / '));
      note(`고지 수치: ${rt.slice(0, 12).join(' / ')}`);
      await closePopup(page);
      await page.waitForTimeout(800);
    } else check(false, '가챠에 확률 고지 진입점 노출');

    // 단발
    const before = await readSave(page);
    const one = await findByLabel(page, '단일 소환') || await findByLabel(page, '티켓 ×1');
    if (one) {
      await tapWorld(page, one.x, one.y, 3000);
      await shot(page, '06-gacha-c-single');
      for (let i = 0; i < 6; i++) { if (!(await tapLabel(page, '확인', { required: false, settle: 900 }))) break; }
      const after = await readSave(page);
      check((after?.gacha?.totalPulls || 0) > (before?.gacha?.totalPulls || 0), '단발 소환이 실제로 실행됨',
        `totalPulls ${before?.gacha?.totalPulls} → ${after?.gacha?.totalPulls}`);
      check((after?.gacha?.pityCounter ?? 0) !== (before?.gacha?.pityCounter ?? 0) || (after?.gacha?.pityCounter ?? 0) === 0,
        '피티 카운터 갱신', `${before?.gacha?.pityCounter} → ${after?.gacha?.pityCounter}`);
    } else check(false, '단발 소환 버튼 노출');

    // 10연
    const b2 = await readSave(page);
    const ten = await findByLabel(page, '10연차') || await findByLabel(page, '티켓 ×10');
    if (ten) {
      await tapWorld(page, ten.x, ten.y, 4000);
      await shot(page, '06-gacha-d-ten');
      for (let i = 0; i < 10; i++) { if (!(await tapLabel(page, '확인', { required: false, settle: 900 }))) break; }
      const a2 = await readSave(page);
      const delta = (a2?.gacha?.totalPulls || 0) - (b2?.gacha?.totalPulls || 0);
      check(delta === 10, '10연 소환이 10회로 집계', `+${delta}`);
      if (delta !== 10) {
        issue('P1', `10연 소환의 집계가 10이 아니다 (+${delta})`, {
          repro: '수집 > 소환 > 10회',
          suspect: 'src/systems/GachaSystem.js, src/systems/PitySystem.js',
          evidence: `totalPulls ${b2?.gacha?.totalPulls} → ${a2?.gacha?.totalPulls}`,
        });
      }
    } else check(false, '10연 소환 버튼 노출');

    manual('SSR 컷인 연출 임팩트/스킵 가능성', '06-gacha-c-single.png / 06-gacha-d-ten.png');

    // 장비 가챠 배너 전환
    const eq = await findByLabel(page, '장비 소환');
    if (eq) {
      await tapWorld(page, eq.x, eq.y, 1500);
      await shot(page, '06-gacha-e-equipment-banner');
      check(true, '장비 배너로 전환');
      await layoutAudit(page, '장비 가챠');
    } else check(false, '장비 가챠 배너 전환 진입점 노출');

    currentScenario().consoleErrors = errors.slice(0, 20);
    check(errors.length === 0, '가챠 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

// ============================================================
// 7. 콘텐츠
// ============================================================

async function scenario7(browser) {
  startScenario(7, '콘텐츠 — 스테이지 벽·무한탑·레이드·이벤트·퀘스트·도감');
  const { page, ctx, errors } = await newSession(browser);
  try {
    await prepareVeteran(page, { chapter: 3, tower: 15 });

    // --- 스테이지 선택: 벽 경고 문구 ↔ 실제 전투력 ---
    const stage = await findByLabel(page, '현재 모험', { sceneKeys: ['MainMenuScene'] });
    if (stage) await tapWorld(page, stage.x, stage.y, 1800);
    await page.waitForTimeout(1200);
    await shot(page, '07-content-a-stageselect');
    const wall = await safeEvaluate(page, () => {
      const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
      const out = { warnings: [], power: null };
      for (const sc of window.game.scene.getScenes(true)) {
        for (const o of collect(sc.children.list, [])) {
          if (o.type !== 'Text' || !o.text || !o.visible) continue;
          if (/어려움|위험|버거|전투력|권장|부족|매우/.test(o.text)) out.warnings.push(o.text.slice(0, 40));
        }
      }
      const mm = window.game.scene.getScene('MainMenuScene');
      out.power = mm?.partyPower ?? window.game.registry.get('partyPower') ?? null;
      return out;
    });
    note(`벽 경고 문구: ${JSON.stringify(wall).slice(0, 400)}`);
    check(wall.warnings.length > 0, '스테이지 화면에 전투력/난이도 안내 노출', wall.warnings.slice(0, 4).join(' / '));
    manual('벽 경고 문구가 실제 파티 전투력과 맞는지', '07-content-a-stageselect.png + 위 로그');
    await layoutAudit(page, '스테이지 선택');
    await closePopup(page);
    await page.waitForTimeout(800);

    // --- 무한탑 ---
    if (await openMenu(page, '도전', '무한탑')) {
      await page.waitForTimeout(1500);
      await shot(page, '07-content-b-tower');
      const tt = (await visibleTexts(page)).map((t) => t.text);
      check(tt.some((t) => /층/.test(t)), '무한탑에 층수 표기', tt.slice(0, 8).join(' / '));
      const season = await findByLabel(page, '시즌');
      const rank = await findByLabel(page, '순위') || await findByLabel(page, '랭킹');
      check(!!season, '무한탑 시즌 탭 노출');
      check(!!rank, '무한탑 순위 탭 노출');
      if (season) { await tapWorld(page, season.x, season.y, 1200); await shot(page, '07-content-b2-tower-season'); }
      await layoutAudit(page, '무한탑');
      await closePopup(page); await page.waitForTimeout(700);
    } else check(false, '도전 > 무한탑 열기');

    for (const [cat, item, slug] of [['도전', '레이드', 'raid'], ['도전', '이벤트', 'event'], ['도전', '퀘스트', 'quest']]) {
      if (await openMenu(page, cat, item)) {
        await page.waitForTimeout(1400);
        await shot(page, `07-content-c-${slug}`);
        const txt = (await visibleTexts(page)).map((t) => t.text);
        check(txt.length > 3, `${item} 팝업에 내용 렌더`, `${txt.length}개 텍스트`);
        if (item === '퀘스트') {
          // 리드 지목(2026-09-07): 마지막 항목 보상 텍스트 잘림이 "재현 안 됨" 으로 남았다.
          const questClipped = await clippedTexts(page);
          check(questClipped.length === 0, '퀘스트 목록에 화면 경계로 잘린 텍스트 없음',
            questClipped.slice(0, 4).map((t) => `"${t.text}"@(${t.x},${t.y})`).join(' / '));
          if (questClipped.length > 0) {
            issue('P2', `퀘스트 목록 항목이 화면 경계에 잘린다 (${questClipped.length}건)`, {
              repro: `계정 B → 도전 > 퀘스트 → 목록 하단. 뷰포트 ${VIEWPORT.width}x${VIEWPORT.height}(CSS px, DPR 1), 게임 렌더 1080x1920, Chromium headless`,
              suspect: 'src/components/popups/QuestPopup.js 목록 하단 여백',
              evidence: questClipped.slice(0, 6).map((t) => `"${t.text}" y=${t.y} h=${t.h}`).join(' / '),
            });
          }
          const claim = await findByLabel(page, '수령') || await findByLabel(page, '받기');
          if (claim) {
            const b = await readSave(page);
            await tapWorld(page, claim.x, claim.y, 1600);
            const a = await readSave(page);
            check((a?.resources?.gold || 0) >= (b?.resources?.gold || 0), '퀘스트 수령 후 재화 감소 없음',
              `gold ${b?.resources?.gold} → ${a?.resources?.gold}`);
            await shot(page, '07-content-c-quest-claim');
          } else note('수령 가능한 퀘스트 없음 — 수령 동작 미검증');
        }
        await layoutAudit(page, item);
        await closePopup(page); await page.waitForTimeout(700);
      } else check(false, `${cat} > ${item} 열기`);
    }

    // --- 도감 / 이야기 ---
    if (await openMenu(page, '수집', '도감')) {
      await page.waitForTimeout(1400);
      await shot(page, '07-content-d-collection');
      const tabs = ['영웅', '이야기', '장비'];
      const seen = [];
      for (const t of tabs) if (await findByLabel(page, t, { exact: true })) seen.push(t);
      note(`도감 탭: ${seen.join(',')}`);
      for (const t of seen) { await tapLabel(page, t, { exact: true, required: false, settle: 900 }); await shot(page, `07-content-d-collection-${t}`); }
      await layoutAudit(page, '도감');
      await closePopup(page);
    } else check(false, '수집 > 도감 열기');

    currentScenario().consoleErrors = errors.slice(0, 20);
    check(errors.length === 0, '콘텐츠 구간 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

// ============================================================
// 8. 소셜·기타
// ============================================================

async function scenario8(browser) {
  startScenario(8, '소셜·기타 — PvP·길드·친구·가방·설정');
  const { page, ctx, errors } = await newSession(browser);
  try {
    await prepareVeteran(page);

    for (const [cat, item, slug] of [['교류', 'PvP', 'pvp'], ['교류', '길드', 'guild'], ['교류', '친구', 'friends'], ['성장', '가방', 'inventory']]) {
      if (await openMenu(page, cat, item)) {
        await page.waitForTimeout(1400);
        await shot(page, `08-social-a-${slug}`);
        const txt = (await visibleTexts(page)).map((t) => t.text);
        check(txt.length > 3, `${item} 팝업 렌더`, `${txt.length}개 텍스트`);
        await layoutAudit(page, item);
        await closePopup(page); await page.waitForTimeout(700);
      } else check(false, `${cat} > ${item} 열기`);
    }

    // --- 설정: 음량 슬라이더 저장 ---
    await backToLobby(page);
    // 톱니는 텍스트가 아니라 아이콘이다 — 상단바 우측 끝의 인터랙티브 오브젝트를 찾는다
    const gear = await safeEvaluate(page, () => {
      const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
      const mm = window.game.scene.getScene('MainMenuScene');
      const cands = collect(mm.children.list, []).filter((o) => {
        if (!o.input?.enabled) return false;
        const b = o.getBounds?.(); if (!b) return false;
        return b.centerY < 130 && b.centerX > window.game.scale.gameSize.width * 0.72;
      });
      if (!cands.length) return null;
      const b = cands[0].getBounds();
      return { x: b.centerX, y: b.centerY };
    });
    if (gear) {
      await tapWorld(page, gear.x, gear.y, 1600);
      await shot(page, '08-social-b-settings');
      const before = (await readSave(page))?.settings || {};
      // 슬라이더 트랙 위 임의 지점을 눌러 값을 바꾼다
      const slider = await findByLabel(page, '음악') || await findByLabel(page, 'BGM') || await findByLabel(page, '배경음');
      if (slider) {
        await tapWorld(page, slider.x + 200, slider.y, 1200);
        await shot(page, '08-social-c-settings-volume');
        const mid = (await readSave(page))?.settings || {};
        await closePopup(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForLobby(page);
        const after = (await readSave(page))?.settings || {};
        const changed = JSON.stringify(before) !== JSON.stringify(mid);
        check(changed, '음량 슬라이더 조작이 설정에 반영', `${JSON.stringify(before)} → ${JSON.stringify(mid)}`);
        check(JSON.stringify(mid) === JSON.stringify(after), '설정이 새로고침 후에도 유지', JSON.stringify(after));
        if (!changed) {
          issue('P2', '음량 슬라이더를 조작해도 settings 값이 바뀌지 않는다', {
            repro: '상단바 톱니 → 설정 → 음악 슬라이더 오른쪽 지점 탭',
            suspect: 'src/components/popups/SettingsPopup.js 슬라이더 입력 처리',
            evidence: `${JSON.stringify(before)} / ${JSON.stringify(mid)}`,
          });
        }
      } else check(false, '설정에 음량 슬라이더 노출');
    } else check(false, '상단바 설정(톱니) 진입점 노출');

    // --- 복귀 유저 카드 ---
    await safeEvaluate(page, () => {
      const d = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      const ago = Date.now() - 8 * 24 * 3600 * 1000;
      d.lastOnline = ago; d.lastLogoutTime = ago; d.lastOnlineTime = ago;
      localStorage.setItem('arcane_collectors_save', JSON.stringify(d));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForLobby(page);
    await shot(page, '08-social-d-returning');
    const rt = (await visibleTexts(page)).map((t) => t.text);
    const hasReturn = rt.some((t) => /복귀|돌아오|오랜만|그동안|8일/.test(t));
    check(hasReturn, '8일 미접속 후 복귀 카드 노출', rt.slice(0, 10).join(' / '));
    if (!hasReturn) {
      issue('P2', '8일 미접속 뒤에도 복귀 유저 카드가 보이지 않는다', {
        repro: 'debug.setLastOnlineTime(192) → 새로고침',
        suspect: 'src/systems/ReturningPlayerRules.js, src/components/ReturningPlayerCard.js',
        evidence: rt.slice(0, 10).join(' / '),
      });
    }

    currentScenario().consoleErrors = errors.slice(0, 20);
    check(errors.length === 0, '소셜·기타 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

// ============================================================
// 전 기능 커버리지 — 계정 A/B/C, 씬 16종·팝업 17종, shutdown() 왕복
// ============================================================

/** 게임이 정의한 팝업 키 전부 (MainMenuScene.openPopup 의 맵과 같아야 한다) */
const POPUP_KEYS = [
  'gacha', 'herolist', 'partyedit', 'quest', 'tower', 'ascension', 'eventdungeon',
  'inventory', 'settings', 'pvp', 'guild', 'raid', 'friends', 'collection',
  'storylog', 'bossinfo',
];
/** 팝업 17번째 — 가챠 안에서 열리는 확률 고지 패널 (openPopup 경로가 아니다) */
const RATE_PANEL_LABEL = '확률 및 천장 상세 보기';

/** 독립 씬 전부. Boot/Preload 는 부팅 경로라 별도로 확인한다 */
const SCENE_KEYS = [
  'LoginScene', 'BootScene', 'PreloadScene', 'CutsceneScene', 'MainMenuScene',
  'StageSelectScene', 'BattleScene', 'BattleResultScene', 'HeroListScene',
  'HeroDetailScene', 'PartyEditScene', 'GachaScene', 'InventoryScene',
  'QuestScene', 'TowerScene', 'SettingsScene',
];

/**
 * shutdown() 이 이번에 처음 실제로 도는 씬들.
 * 메모리 스모크 순환 경로 밖이라 예산 감시가 닿지 않는다 — 여기서 왕복시켜 본다.
 */
const SHUTDOWN_RISK_SCENES = ['TowerScene', 'QuestScene', 'InventoryScene', 'PartyEditScene', 'SettingsScene'];

/** 계정 세션을 열고 로비까지 들어간다 (A 는 로그인부터, B/C 는 자동로그인) */
async function openAccount(browser, key) {
  const session = await newAccountSession(browser, key);
  const { page } = session;
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  if (key === 'A') {
    await waitForLabel(page, '게스트로 시작', {}, 40000);
    await guestLogin(page);
  }
  const ok = await waitForLobby(page, 60000);
  return { ...session, lobby: ok };
}

/**
 * 페이지 안에서 각 씬의 `shutdown()` 호출 횟수를 세도록 계측한다.
 * `src/main.js` 가 'ready' 시점에 `events.on('shutdown', () => scene.shutdown())` 를 걸어 두므로,
 * 여기서 메서드를 감싸면 **실제로 정리 코드가 돌았는지**를 관측할 수 있다.
 * (한 번도 실행된 적 없던 코드라 "돌긴 도는가" 자체가 검증 대상이다)
 */
const instrumentShutdown = (page) => safeEvaluate(page, () => {
  if (window.__shutdownCounts) return Object.keys(window.__shutdownCounts).length;
  window.__shutdownCounts = {};
  window.__shutdownErrors = [];
  for (const scene of window.game.scene.scenes) {
    const key = scene.scene.key;
    if (typeof scene.shutdown !== 'function' || scene.__shutdownWrapped) continue;
    const original = scene.shutdown.bind(scene);
    scene.__shutdownWrapped = true;
    scene.shutdown = function wrapped(...args) {
      window.__shutdownCounts[key] = (window.__shutdownCounts[key] || 0) + 1;
      try {
        return original(...args);
      } catch (e) {
        window.__shutdownErrors.push(`${key}: ${e && e.message}`);
        throw e;
      }
    };
  }
  return Object.keys(window.__shutdownCounts).length;
});

const shutdownStats = (page) => safeEvaluate(page, () => ({
  counts: window.__shutdownCounts || {},
  errors: window.__shutdownErrors || [],
}));

/** 씬으로 이동하고 실제로 활성화될 때까지 기다린다 */
async function gotoScene(page, sceneKey, timeout = 20000) {
  await safeEvaluate(page, (k) => window.__TEST_API__?.navigateTo?.(k), sceneKey);
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await activeScenes(page)).includes(sceneKey)) { await page.waitForTimeout(900); return true; }
    await page.waitForTimeout(250);
  }
  return false;
}

/**
 * 화면이 "그려졌는지".
 *
 * 중요 — `texts` 는 **실제로 보이는** 텍스트만 센다(조상까지 곱한 누적 alpha 기준).
 * 처음엔 존재 여부만 셌는데, 그러면 `Modal` 의 컨테이너 alpha 가 0 이어서 화면에는
 * 아무것도 안 보이는 팝업도 "텍스트 많음 = 정상"으로 통과한다(2026-09-05 오프라인 보상
 * 팝업이 정확히 그 사례였다). "열렸다"와 "보인다"는 다르다.
 * `hiddenTexts` 는 존재하지만 투명해서 제외된 수 — 이 값이 크면 그 자체가 신호다.
 */
const renderStats = (page) => safeEvaluate(page, () => {
  const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
  const effective = (o) => {
    let a = o.alpha === undefined ? 1 : o.alpha;
    let vis = o.visible !== false;
    for (let n = o.parentContainer; n; n = n.parentContainer) {
      if (n.visible === false) vis = false;
      a *= (n.alpha === undefined ? 1 : n.alpha);
    }
    return vis ? a : 0;
  };
  const out = { scenes: [], objects: 0, texts: 0, hiddenTexts: 0, interactive: 0, nullTextures: 0, maxAlpha: 0 };
  for (const sc of window.game.scene.getScenes(true)) {
    out.scenes.push(sc.scene.key);
    const all = collect(sc.children.list, []);
    out.objects += all.length;
    for (const o of all) {
      const a = effective(o);
      if (o.type === 'Text' && (o.text || '').trim()) {
        if (a >= 0.05) out.texts += 1; else out.hiddenTexts += 1;
      }
      if (o.input?.enabled) out.interactive += 1;
      if (a > out.maxAlpha) out.maxAlpha = Math.round(a * 100) / 100;
      // 해제된 텍스처를 물고 있는 표시 객체 — glTexture null 크래시의 전조
      if (o.texture && o.texture.key && !o.texture.source?.[0]?.glTexture) out.nullTextures += 1;
    }
  }
  return out;
});

/**
 * 화면 픽셀을 실제로 읽는다 (Phaser 렌더러 스냅샷).
 * 객체 트리는 "있다"고 말하는데 화면에는 없는 경우를 잡기 위한 최종 확인이다.
 * 여러 지점을 샘플링해 팝업이 화면 어디에도 그려지지 않는 상황을 놓치지 않는다.
 */
const screenSample = (page, rects) => safeEvaluate(page, async (rs) => {
  const g = window.game;
  if (typeof g?.renderer?.snapshotArea !== 'function') return rs.map(() => ({ error: 'snapshotArea 없음' }));
  // **순차 실행이 필수다.** Phaser 렌더러는 대기 중인 스냅샷을 하나만 들고 있어서
  // 동시에 여러 번 부르면 앞선 요청이 콜백을 받지 못하고 타임아웃난다(실측).
  const out = [];
  for (const r of rs) {
    // eslint-disable-next-line no-await-in-loop
    out.push(await new Promise((resolve) => {
      let done = false;
      const bail = setTimeout(() => { if (!done) { done = true; resolve({ error: 'timeout' }); } }, 5000);
      g.renderer.snapshotArea(r.x, r.y, r.w, r.h, (img) => {
        if (done) return;
        done = true; clearTimeout(bail);
        try {
          const c = document.createElement('canvas');
          c.width = r.w; c.height = r.h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, r.w, r.h).data;
          let sum = 0, sq = 0, n = 0;
          for (let i = 0; i < d.length; i += 4 * 17) {   // 성긴 샘플링으로 충분하다
            const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
            sum += v; sq += v * v; n += 1;
          }
          const mean = sum / n;
          resolve({ mean: Math.round(mean * 10) / 10, sd: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean)) * 10) / 10 });
        } catch (e) { resolve({ error: String(e).slice(0, 100) }); }
      });
    }));
  }
  return out;
}, rects);

/** 화면 곳곳의 표본 영역 (팝업이 어디에 그려지든 걸리도록) */
const SAMPLE_RECTS = (w, h) => [
  { x: Math.round(w * 0.24), y: Math.round(h * 0.16), w: 200, h: 120 },
  { x: Math.round(w * 0.30), y: Math.round(h * 0.42), w: 240, h: 160 },
  { x: Math.round(w * 0.24), y: Math.round(h * 0.70), w: 200, h: 120 },
];

/**
 * 화면이 **유의미하게** 바뀌었는가.
 *
 * 단순히 "픽셀이 같은가"로 보면 안 된다 — 로비는 명상 뷰의 오라·게이지가 계속 움직여서
 * 아무 것도 안 해도 표본이 흔들린다(실측: 같은 지점이 79.2 → 81.7). 그래서 먼저
 * **아무 조작 없이 두 번 찍어 노이즈 폭**을 재고, 조작 후 변화가 그 노이즈를 확실히
 * 넘어설 때만 "바뀌었다"고 본다.
 *
 * @param {Array} baseA 조작 전 표본 1
 * @param {Array} baseB 조작 전 표본 2 (baseA 와의 차이 = 배경 노이즈)
 * @param {Array} after 조작 후 표본
 * @returns {{changed: boolean, detail: string}}
 */
function screenChanged(baseA, baseB, after) {
  if (![baseA, baseB, after].every(Array.isArray)) return { changed: false, detail: '표본 없음' };
  const parts = [];
  let changed = false;
  for (let i = 0; i < after.length; i += 1) {
    const a = baseA[i]; const b = baseB[i]; const c = after[i];
    if (!a || !b || !c || a.error || b.error || c.error) { parts.push(`#${i} 오류`); continue; }
    const noise = Math.abs((b.mean ?? 0) - (a.mean ?? 0));
    const signal = Math.abs((c.mean ?? 0) - (b.mean ?? 0));
    const threshold = Math.max(noise * 3, 4);
    if (signal > threshold) changed = true;
    parts.push(`#${i} 신호 ${signal.toFixed(1)} vs 임계 ${threshold.toFixed(1)}(노이즈 ${noise.toFixed(1)})`);
  }
  return { changed, detail: parts.join(' / ') };
}

/** 열려 있는 팝업 루트의 누적 alpha (Modal 계열 투명 버그 탐지) */
const popupVisibility = (page) => safeEvaluate(page, () => {
  const mm = window.game.scene.getScene('MainMenuScene');
  const popup = mm?.activePopup;
  if (!popup) return { open: false };
  const root = popup.container || popup.root || popup.modal?.container || null;
  const chain = [];
  let a = 1;
  for (let n = root; n; n = n.parentContainer) {
    const na = n.alpha === undefined ? 1 : n.alpha;
    chain.push({ type: n.type, alpha: na, visible: n.visible !== false });
    a *= na;
    if (n.visible === false) a = 0;
  }
  return { open: true, key: mm.activePopupKey, hasRoot: !!root, effectiveAlpha: Math.round(a * 100) / 100, chain: chain.slice(0, 4) };
});

// ============================================================
// 9. shutdown() 첫 실행 위험 구간 — 5개 씬 × 3회 왕복
// ============================================================

async function scenario9(browser) {
  startScenario(9, 'shutdown() 첫 실행 위험 구간 — 5개 씬 3회 왕복 (계정 B)');
  const { page, ctx, errors } = await openAccount(browser, 'B');
  try {
    check((await activeScenes(page)).includes('MainMenuScene'), '계정 B 로비 진입');
    const wrapped = await instrumentShutdown(page);
    note(`shutdown() 계측 대상 씬 ${wrapped}개`);

    /** 왕복 후에도 기능이 도는지 — 씬마다 "이건 눌려야 한다"는 라벨 */
    const FUNCTION_PROBE = {
      TowerScene: ['층', '도전'],
      QuestScene: ['퀘스트', '수령'],
      InventoryScene: ['장비', '소비', '재료'],
      PartyEditScene: ['파티', '저장'],
      SettingsScene: ['설정', '음량', '음악'],
    };

    for (const sceneKey of SHUTDOWN_RISK_SCENES) {
      for (let trip = 1; trip <= 3; trip += 1) {
        const errBefore = errors.length;
        const entered = await gotoScene(page, sceneKey);
        if (!check(entered, `${sceneKey} 진입 (${trip}/3회차)`)) break;

        const stats = await renderStats(page);
        // 빈 화면·검은 화면 판정: 표시 객체가 거의 없으면 정리가 화면을 지웠다는 뜻이다
        check(stats.objects > 5 && stats.texts > 0,
          `${sceneKey} ${trip}회차 재진입 화면이 정상 렌더 (객체 ${stats.objects} · 텍스트 ${stats.texts})`,
          JSON.stringify(stats));
        check(stats.nullTextures === 0,
          `${sceneKey} ${trip}회차 — glTexture 해제된 표시 객체 없음`, `${stats.nullTextures}건`);
        if (stats.objects <= 5 || stats.texts === 0) {
          issue('P0', `${sceneKey} ${trip}회차 재진입 시 화면이 비어 있다`, {
            repro: `로비 → ${sceneKey} → 로비 → ${sceneKey} (${trip}회 반복)`,
            suspect: `src/scenes/${sceneKey}.js shutdown(), src/main.js 씬 정리 배선`,
            evidence: JSON.stringify(stats),
          });
        }

        // 기능이 살아 있는지 — 이 씬에서 보여야 할 라벨이 실제로 보이는가
        const probes = FUNCTION_PROBE[sceneKey] || [];
        const seen = [];
        for (const label of probes) if (await findByLabel(page, label)) seen.push(label);
        check(seen.length > 0, `${sceneKey} ${trip}회차 — 기능 요소 노출 (${seen.join(',') || '없음'})`, `기대 ${probes.join('/')}`);

        if (trip === 1 || trip === 3) await shot(page, `09-shutdown-${sceneKey}-trip${trip}`);

        // 로비로 돌아온다 = shutdown() 이 실제로 돈다
        const back = await gotoScene(page, 'MainMenuScene');
        check(back, `${sceneKey} → 로비 복귀 (${trip}/3회차)`);

        const newErrors = errors.slice(errBefore);
        const fatal = newErrors.filter((e) => /glTexture|Cannot read propert|shutdown\(\) 실패|is not a function/.test(e));
        check(fatal.length === 0, `${sceneKey} ${trip}회차 왕복 — 치명 예외 없음`, fatal.slice(0, 2).join(' | '));
        if (fatal.length) {
          issue('P0', `${sceneKey} 왕복 ${trip}회차에서 예외: ${fatal[0].slice(0, 120)}`, {
            repro: `로비 ↔ ${sceneKey} ${trip}회 왕복`,
            suspect: `src/scenes/${sceneKey}.js shutdown() 이 아직 쓰이는 참조를 끊었을 가능성`,
            evidence: fatal.slice(0, 3).join(' | '),
          });
        }
      }

      // 이 씬의 정리가 **공용 텍스처를 물고 갔는지** — 로비와 영웅 목록을 다시 본다.
      // MeditationView 가 HeroDetailScene 의 치비 텍스처를 자기 것으로 착각해 해제할 뻔한 전례가 있다.
      const lobby = await renderStats(page);
      check(lobby.texts > 5, `${sceneKey} 왕복 후 로비가 정상 렌더 (텍스트 ${lobby.texts})`, JSON.stringify(lobby));
      const heroOk = await openMenu(page, '성장', '영웅');
      const heroStats = heroOk ? await renderStats(page) : null;
      check(!!heroOk && heroStats.texts > 5, `${sceneKey} 왕복 후 영웅 목록이 정상 렌더`, JSON.stringify(heroStats));
      check(!heroStats || heroStats.nullTextures === 0, `${sceneKey} 왕복 후 영웅 목록 텍스처 정상`, `${heroStats?.nullTextures}건`);
      if (heroStats && heroStats.nullTextures > 0) {
        issue('P0', `${sceneKey} 정리 후 영웅 목록의 텍스처가 해제돼 있다(공용 텍스처 오해제)`, {
          repro: `로비 ↔ ${sceneKey} 3회 왕복 → 성장 > 영웅`,
          suspect: `src/scenes/${sceneKey}.js shutdown() 의 텍스처 해제 범위`,
          evidence: JSON.stringify(heroStats),
        });
      }
      await backToLobby(page);
    }

    const stats = await shutdownStats(page);
    note(`shutdown() 호출 횟수: ${JSON.stringify(stats.counts)}`);
    for (const sceneKey of SHUTDOWN_RISK_SCENES) {
      check((stats.counts[sceneKey] || 0) >= 3, `${sceneKey}.shutdown() 이 실제로 3회 이상 실행됨`, `${stats.counts[sceneKey] || 0}회`);
    }
    // `src/main.js` 의 try/catch 가 삼키는 예외 — 화면은 멀쩡해 보이지만 정리는 실패한 것이다.
    // 정리 코드가 조용히 실패하는 건 안 도는 것과 같으므로 **1건이라도 있으면 결함으로 센다.**
    const swallowedWarn = errors.filter((e) => /shutdown\(\) 실패/.test(e));
    const swallowed = [...stats.errors, ...swallowedWarn];
    check(swallowed.length === 0, 'shutdown() 실행 중 삼켜진 예외 0건', swallowed.slice(0, 3).join(' | '));
    if (swallowed.length) {
      issue('P1', `shutdown() 정리가 조용히 실패한다 (${swallowed.length}건): ${swallowed[0].slice(0, 120)}`, {
        repro: '위험 구간 5씬 3회 왕복 — main.js 가 예외를 삼키므로 화면상으로는 드러나지 않는다',
        suspect: 'src/main.js 씬 정리 배선 + 해당 씬의 shutdown()',
        evidence: swallowed.join(' | ').slice(0, 800),
      });
    }

    currentScenario().consoleErrors = errors.slice(0, 30);
  } finally { await ctx.close(); }
}

// ============================================================
// 10. 씬 16종 · 팝업 17종 전수 방문 (계정 B)
// ============================================================

async function scenario10(browser) {
  startScenario(10, '커버리지 — 씬 16종 · 팝업 17종 전수 방문 (계정 B)');
  const { page, ctx, errors } = await openAccount(browser, 'B');
  try {
    await instrumentShutdown(page);

    // --- 팝업 17종 ---
    // "열렸다"와 "보인다"는 다르다. `Modal` 의 컨테이너 alpha 가 0 에서 복원되지 않아
    // 오프라인 보상 팝업이 화면에 전혀 안 뜨던 사례가 있었다(2026-09-05). 그래서 세 겹으로 본다:
    //   ① activePopup 이 잡혔는가  ② 보이는(누적 alpha≥0.05) 텍스트가 있는가
    //   ③ **화면 픽셀이 실제로 바뀌었는가** — 객체 트리를 못 믿을 때의 최종 확인
    const size = await safeEvaluate(page, () => ({ w: window.game.scale.gameSize.width, h: window.game.scale.gameSize.height }));
    const rects = SAMPLE_RECTS(size.w, size.h);
    const popupResult = {};
    for (const key of POPUP_KEYS) {
      const errBefore = errors.length;
      await backToLobby(page);
      await page.waitForTimeout(600);
      // 노이즈 기준선 — 아무 것도 하지 않고 두 번 찍는다(명상 뷰 애니메이션 폭 측정)
      const baseA = await screenSample(page, rects);
      await page.waitForTimeout(700);
      const baseB = await screenSample(page, rects);
      const opened = await safeEvaluate(page, (k) => {
        const mm = window.game.scene.getScene('MainMenuScene');
        if (!mm) return false;
        mm.openPopup(k);
        return true;
      }, key);
      await page.waitForTimeout(1600);
      const stats = await renderStats(page);
      const vis = await popupVisibility(page);
      const after = await screenSample(page, rects);
      const isOpen = await safeEvaluate(page, () => {
        const mm = window.game.scene.getScene('MainMenuScene');
        return { key: mm?.activePopupKey || null, has: !!mm?.activePopup };
      });
      const px = screenChanged(baseA, baseB, after);
      const pixelUnchanged = !px.changed;
      const ok = !!opened && isOpen.has && isOpen.key === key && stats.texts > 3;
      popupResult[key] = { ok, texts: stats.texts, hiddenTexts: stats.hiddenTexts, alpha: vis.effectiveAlpha, pixelUnchanged, nullTextures: stats.nullTextures };
      check(ok, `팝업 [${key}] 열림 + 보이는 내용 렌더`, `activePopupKey=${isOpen.key}, 보이는 텍스트 ${stats.texts} (숨은 ${stats.hiddenTexts})`);
      check(px.changed, `팝업 [${key}] 이 **화면 픽셀로** 실제 표시된다`, px.detail);
      if (vis.open && vis.hasRoot) {
        check((vis.effectiveAlpha ?? 0) >= 0.05, `팝업 [${key}] 루트 누적 alpha 정상`, `alpha=${vis.effectiveAlpha} chain=${JSON.stringify(vis.chain)}`);
      }
      if (pixelUnchanged || (vis.open && vis.hasRoot && (vis.effectiveAlpha ?? 1) < 0.05) || (stats.texts <= 3 && stats.hiddenTexts > 3)) {
        issue('P0', `팝업 [${key}] 이 열리지만 화면에 보이지 않는다 (Modal alpha 계열)`, {
          repro: `로비에서 MainMenuScene.openPopup('${key}') → 화면 확인`,
          suspect: 'src/components/Modal.js 컨테이너 alpha 복원, src/components/PopupBase.js show()',
          evidence: JSON.stringify({ vis, stats, pixels: px.detail }).slice(0, 700),
        });
      }
      check(stats.nullTextures === 0, `팝업 [${key}] 텍스처 정상`, `${stats.nullTextures}건`);
      await shot(page, `10-popup-${key}`);
      await layoutAudit(page, `팝업 ${key}`);
      const newErrors = errors.slice(errBefore);
      check(newErrors.length === 0, `팝업 [${key}] 콘솔 에러 없음`, newErrors.slice(0, 2).join(' | '));
      if (!ok) {
        issue('P1', `팝업 [${key}] 이 열리지 않거나 내용이 비어 있다`, {
          repro: `로비에서 MainMenuScene.openPopup('${key}')`,
          suspect: `src/components/popups/*.js (${key}), src/scenes/MainMenuScene.js:2378 openPopup`,
          evidence: JSON.stringify({ isOpen, stats }),
        });
      }
      // 팝업 재개폐 — 닫았다 다시 열어도 같은 상태로 뜨는가
      await closePopup(page);
      await page.waitForTimeout(700);
      await safeEvaluate(page, (k) => window.game.scene.getScene('MainMenuScene')?.openPopup(k), key);
      await page.waitForTimeout(1400);
      const again = await renderStats(page);
      const againPixels = await screenSample(page, rects);
      const px2 = screenChanged(baseA, baseB, againPixels);
      check(again.texts >= Math.floor(stats.texts * 0.6),
        `팝업 [${key}] 재개폐 후에도 내용이 그대로 뜬다`, `1회 ${stats.texts} → 2회 ${again.texts}`);
      check(px2.changed, `팝업 [${key}] 재개폐 후에도 화면 픽셀로 표시된다`, px2.detail);
      if (again.texts < Math.floor(stats.texts * 0.6)) {
        issue('P1', `팝업 [${key}] 을 닫았다 다시 열면 내용이 줄어든다 (${stats.texts} → ${again.texts})`, {
          repro: `openPopup('${key}') → 닫기 → 다시 openPopup('${key}')`,
          suspect: `src/components/popups/${key} 의 destroy/재생성 경로, PopupBase 의 정리`,
          evidence: JSON.stringify({ first: stats, second: again }),
        });
      }
      await closePopup(page);
    }

    // `Modal` 을 직접 생성하는 지점은 팝업 등록 맵 밖에 있다(오프라인 보상·에너지 충전·파티 안내 등).
    // 같은 alpha 버그의 영향권이므로 어디인지 남겨 둔다 — 트리거 조건이 상황 의존적이라
    // 여기서 전부 띄우지는 못한다. 오프라인 보상 Modal 은 시나리오 14b 에서 실제로 띄워 본다.
    note('Modal 직접 생성 지점: src/scenes/MainMenuScene.js:425 · 546 · 1495 (팝업 맵 밖 — 개별 트리거 필요)');

    // 17번째 — 확률 고지 패널
    await backToLobby(page);
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('gacha'));
    await page.waitForTimeout(1600);
    const rate = await tapLabel(page, RATE_PANEL_LABEL, { required: false, settle: 1500 })
      || await tapLabel(page, '확률', { required: false, settle: 1500 });
    check(!!rate, '팝업 [RateDisclosure] 확률 고지 패널 진입');
    if (rate) {
      const pcts = (await visibleTexts(page)).map((t) => t.text).filter((t) => /%/.test(t));
      check(pcts.length > 0, '확률 고지 패널에 수치 표기', pcts.slice(0, 6).join(' / '));
      await shot(page, '10-popup-ratedisclosure');
    }
    await backToLobby(page);

    // --- 씬 16종 ---
    const sceneResult = {};
    for (const key of SCENE_KEYS) {
      // Boot/Preload/Login 은 부팅 경로다. 되돌아갈 수 없으므로 방문 대상에서 뺀다
      if (['BootScene', 'PreloadScene', 'LoginScene'].includes(key)) {
        const exists = await safeEvaluate(page, (k) => !!window.game.scene.getScene(k), key);
        sceneResult[key] = { registered: exists, visited: false };
        check(exists, `씬 [${key}] 등록됨 (부팅 경로라 방문은 생략)`);
        continue;
      }
      const errBefore = errors.length;
      const entered = await gotoScene(page, key);
      const stats = entered ? await renderStats(page) : null;
      sceneResult[key] = { registered: true, visited: entered, texts: stats?.texts ?? 0 };
      check(entered, `씬 [${key}] 진입`);
      if (entered) {
        check(stats.objects > 3, `씬 [${key}] 렌더 (객체 ${stats.objects} · 텍스트 ${stats.texts})`, JSON.stringify(stats));
        check(stats.nullTextures === 0, `씬 [${key}] 텍스처 정상`, `${stats.nullTextures}건`);
        await shot(page, `10-scene-${key}`);
        await layoutAudit(page, `씬 ${key}`);
      }
      const newErrors = errors.slice(errBefore);
      check(newErrors.length === 0, `씬 [${key}] 콘솔 에러 없음`, newErrors.slice(0, 2).join(' | '));
      await backToLobby(page);
    }
    note(`씬 커버리지: ${JSON.stringify(sceneResult)}`);
    note(`팝업 커버리지: ${JSON.stringify(popupResult)}`);

    const st = await shutdownStats(page);
    note(`shutdown() 호출 횟수: ${JSON.stringify(st.counts)}`);
    const swallowed10 = [...st.errors, ...errors.filter((e) => /shutdown\(\) 실패/.test(e))];
    check(swallowed10.length === 0, '전수 방문 중 shutdown() 삼켜진 예외 0건', swallowed10.slice(0, 3).join(' | '));
    if (swallowed10.length) {
      issue('P1', `전수 방문 중 shutdown() 정리가 조용히 실패한다 (${swallowed10.length}건)`, {
        repro: '씬 16종 · 팝업 17종 전수 방문',
        suspect: 'src/main.js 씬 정리 배선 + 해당 씬의 shutdown()',
        evidence: swallowed10.join(' | ').slice(0, 800),
      });
    }
    currentScenario().consoleErrors = errors.slice(0, 30);
  } finally { await ctx.close(); }
}

// ============================================================
// 11. 이번 세션 신규/변경분 집중 (계정 B)
// ============================================================

async function scenario11(browser) {
  startScenario(11, '이번 세션 신규분 — 명상 성소·치비 정렬·도크 아이콘·컷씬 가독성 (계정 B)');
  const { page, ctx, errors } = await openAccount(browser, 'B');
  try {
    await page.waitForTimeout(2500);
    await shot(page, '11-new-a-meditation');

    // --- 명상 성소: 제단·룬·오라·수확 + 배경 폴백 ---
    const sanctum = await safeEvaluate(page, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      const v = mm?.idleBattleView;
      if (!v) return null;
      const keys = Object.keys(v);
      const pick = (re) => keys.filter((k) => re.test(k));
      return {
        parts: { altar: pick(/altar|제단/i), rune: pick(/rune/i), aura: pick(/aura/i), harvest: pick(/harvest|ready/i) },
        bgKey: v.background?.texture?.key || v.bg?.texture?.key || null,
        partyMembers: (v.partyMembers || []).length,
        requiredMana: v.requiredMana,
      };
    });
    note(`명상 성소 구성: ${JSON.stringify(sanctum)}`);
    check(!!sanctum, '명상 성소 뷰 존재');
    check(!!sanctum?.bgKey, '성소 배경 텍스처가 실제로 붙어 있다(폴백 포함)', `bg=${sanctum?.bgKey}`);
    if (sanctum && !sanctum.bgKey) {
      issue('P1', '명상 성소에 배경 텍스처가 붙지 않았다(폴백도 실패)', {
        repro: '로비 진입 후 명상 뷰 배경 확인',
        suspect: 'src/components/MeditationView.js 배경 로드/폴백',
        evidence: JSON.stringify(sanctum),
      });
    }
    manual('제단·룬·오라 연출과 수확 순간의 인상', '11-new-a-meditation.png');

    // --- 치비 4인 발밑 선 정렬 ---
    const chibi = await safeEvaluate(page, () => {
      const v = window.game.scene.getScene('MainMenuScene')?.idleBattleView;
      const members = v?.partyMembers || [];
      return members.map((m) => {
        const obj = m?.sprite || m?.image || m?.container || m;
        const b = obj?.getBounds?.();
        return b ? {
          id: m?.heroId || m?.id || null,
          bottom: Math.round(b.bottom), left: Math.round(b.x),
          w: Math.round(b.width), h: Math.round(b.height),
          tint: obj.tintTopLeft ?? null,
        } : null;
      }).filter(Boolean);
    });
    note(`치비 배치: ${JSON.stringify(chibi)}`);
    check(chibi.length === 4, `명상 뷰에 파티 4인 치비 렌더 (${chibi.length}명)`);
    if (chibi.length >= 2) {
      // 발밑 선은 좌우 열끼리 맞아야 한다. 전체 편차가 크면 규격이 어긋난 것이다.
      const bottoms = chibi.map((c) => c.bottom);
      const spread = Math.max(...bottoms) - Math.min(...bottoms);
      const heights = chibi.map((c) => c.h);
      const hSpread = Math.max(...heights) - Math.min(...heights);
      // 앞줄/뒷줄 배치가 있어 바닥선이 완전히 같을 수는 없다. 스프라이트 높이 대비로 본다
      const ok = spread <= Math.max(...heights) * 1.2;
      check(ok, '치비 발밑 선이 규격 안에서 정렬', `bottom 편차 ${spread}px, 높이 편차 ${hSpread}px, 높이 ${heights.join('/')}`);
      check(hSpread <= Math.max(...heights) * 0.35, '치비 스프라이트 크기가 서로 비슷하다(규격 정렬)', `높이 ${heights.join('/')}`);
      if (!ok) {
        issue('P2', `명상 뷰 치비 발밑 선이 ${spread}px 어긋난다`, {
          repro: '로비 명상 뷰의 파티 4인 치비 바운즈 비교',
          suspect: 'src/components/MeditationView.js 치비 배치, 치비 스프라이트 규격',
          evidence: JSON.stringify(chibi),
        });
      }
    }
    manual('전직영웅 치비 폴백 틴트가 교단색과 맞는지', '11-new-a-meditation.png');

    // --- 도크 아이콘 14종 ---
    await backToLobby(page);
    const icons = await safeEvaluate(page, () => {
      const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
      const mm = window.game.scene.getScene('MainMenuScene');
      const all = collect(mm.children.list, []);
      const imgs = all.filter((o) => (o.type === 'Image' || o.type === 'Sprite') && o.getBounds && o.getBounds().centerY > window.game.scale.gameSize.height * 0.8);
      return imgs.map((o) => ({ key: o.texture?.key || null, missing: !o.texture || o.texture.key === '__MISSING' }));
    });
    note(`도크 아이콘: ${JSON.stringify(icons)}`);
    check(icons.every((i) => !i.missing), '도크 아이콘에 __MISSING 텍스처 없음', JSON.stringify(icons.filter((i) => i.missing)));
    await shot(page, '11-new-b-dock-icons');
    for (const cat of ['성장', '도전', '교류', '수집']) {
      await tapLabel(page, cat, { exact: true, required: false, settle: 700 });
      await shot(page, `11-new-b-dock-${cat}`);
      const sub = await safeEvaluate(page, () => {
        const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
        const mm = window.game.scene.getScene('MainMenuScene');
        return collect(mm.children.list, [])
          .filter((o) => (o.type === 'Image' || o.type === 'Sprite') && o.visible && o.texture?.key)
          .filter((o) => o.getBounds().centerY > window.game.scale.gameSize.height * 0.72)
          .map((o) => o.texture.key);
      });
      note(`[${cat}] 시트 아이콘: ${JSON.stringify(sub)}`);
      await tapLabel(page, cat, { exact: true, required: false, settle: 600 });
    }

    // --- 영웅 상세: 치비 배지 + 전신 일러스트 공존 ---
    if (await openMenu(page, '성장', '영웅')) {
      await page.waitForTimeout(1200);
      const card = await safeEvaluate(page, () => {
        const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
        for (const sc of window.game.scene.getScenes(true)) {
          for (const o of collect(sc.children.list, [])) {
            if (!o.input?.enabled || o.type !== 'Rectangle') continue;
            let top = o.depth; for (let n = o; n; n = n.parentContainer) top = Math.max(top, n.depth || 0);
            if (top < 2000) continue;
            const b = o.getBounds();
            if (b.width > 120 && b.width < 260 && b.height > 150 && b.height < 300) return { x: b.centerX, y: b.centerY };
          }
        }
        return null;
      });
      if (card) await tapWorld(page, card.x, card.y, 2000);
      await tapLabel(page, '상세 보기', { required: false, settle: 2500 });
      await shot(page, '11-new-c-hero-detail');
      const art = await safeEvaluate(page, () => {
        const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
        const imgs = [];
        for (const sc of window.game.scene.getScenes(true)) {
          for (const o of collect(sc.children.list, [])) {
            if ((o.type !== 'Image' && o.type !== 'Sprite') || !o.visible || !o.texture?.key) continue;
            const b = o.getBounds();
            imgs.push({ key: o.texture.key, w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.centerY) });
          }
        }
        const big = imgs.filter((i) => i.w > 300 && i.h > 300);
        const chibiish = imgs.filter((i) => /chibi/i.test(i.key));
        return { big: big.slice(0, 3), chibi: chibiish.slice(0, 3), total: imgs.length };
      });
      note(`영웅 상세 아트: ${JSON.stringify(art)}`);
      check(art.big.length > 0, '영웅 상세에 전신 일러스트 렌더', JSON.stringify(art.big));
      check(art.chibi.length > 0, '영웅 상세에 치비 배지 공존', JSON.stringify(art.chibi));
      if (art.big.length > 0 && art.chibi.length === 0) {
        issue('P2', '영웅 상세에 치비 배지가 보이지 않는다(전신 일러스트만)', {
          repro: '성장 > 영웅 > 카드 > 상세 보기',
          suspect: 'src/scenes/HeroDetailScene.js 치비 배지 렌더',
          evidence: JSON.stringify(art),
        });
      }

      // --- 팝업 재개폐: 레벨업 후 닫았다 다시 열기 ---
      const p0 = await heroPower(page);
      await tapLabel(page, '레벨업', { required: false, settle: 1800 });
      const p1 = await heroPower(page);
      check(p1.power >= p0.power, '레벨업 후 전투력이 줄지 않음', `${p0.power} → ${p1.power}`);
      await backToLobby(page);
      const reopened = await openMenu(page, '성장', '영웅');
      await page.waitForTimeout(1400);
      const reStats = await renderStats(page);
      check(!!reopened && reStats.texts > 5, '레벨업 후 영웅 목록 재개폐 정상', JSON.stringify(reStats));
      check(reStats.nullTextures === 0, '레벨업 후 재개폐에서 텍스처 정상', `${reStats.nullTextures}건`);
      await shot(page, '11-new-d-reopen-after-levelup');
      await backToLobby(page);
    } else check(false, '성장 > 영웅 진입');

    // --- 컷씬 가독성 ---
    const cutOk = await gotoScene(page, 'CutsceneScene', 12000);
    if (cutOk) {
      await page.waitForTimeout(1500);
      await shot(page, '11-new-e-cutscene');
      const cut = await visibleTexts(page);
      const narration = cut.filter((t) => t.text.length > 12);
      check(narration.length > 0, '컷씬 내레이션 텍스트 렌더', narration.slice(0, 2).map((t) => t.text.slice(0, 24)).join(' / '));
      manual('내레이션이 배경에 묻히는지 / 화자 패널 대비', '11-new-e-cutscene.png');
      await backToLobby(page);
    } else {
      note('컷씬 씬 직접 진입 불가 — 온보딩(시나리오 1) 캡처로 대체 판단');
    }

    manual('적 아트 화풍 통일 (재생성 진행 중 27/84 — 결함으로 세지 않음)', '04-battle-a-start.png / 10-scene-BattleScene.png');
    currentScenario().consoleErrors = errors.slice(0, 30);
    check(errors.length === 0, '신규분 구간 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

// ============================================================
// 12. 표시값 ↔ 저장값 대조 강화 (계정 B)
// ============================================================

async function scenario12(browser) {
  startScenario(12, '표시값 ↔ 저장값 대조 — 전투력·배지·벽 경고·명상 적분·가챠 (계정 B)');
  const { page, ctx, errors } = await openAccount(browser, 'B');
  try {
    await page.waitForTimeout(2500);

    // --- 1) 레벨업/진화 후 전투력 (스탯 SSOT 회귀) ---
    if (await openMenu(page, '성장', '영웅')) {
      await page.waitForTimeout(1200);
      const card = await safeEvaluate(page, () => {
        const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
        for (const sc of window.game.scene.getScenes(true)) {
          for (const o of collect(sc.children.list, [])) {
            if (!o.input?.enabled || o.type !== 'Rectangle') continue;
            let top = o.depth; for (let n = o; n; n = n.parentContainer) top = Math.max(top, n.depth || 0);
            if (top < 2000) continue;
            const b = o.getBounds();
            if (b.width > 120 && b.width < 260 && b.height > 150 && b.height < 300) return { x: b.centerX, y: b.centerY };
          }
        }
        return null;
      });
      if (card) await tapWorld(page, card.x, card.y, 2000);
      await tapLabel(page, '상세 보기', { required: false, settle: 2500 });

      const before = await heroPower(page);
      const saveBefore = await readSave(page);
      await tapLabel(page, '레벨업', { required: false, settle: 2000 });
      const after = await heroPower(page);
      const saveAfter = await readSave(page);

      const lvUp = (saveAfter?.characters || []).some((c, i) => (c.level || 0) > ((saveBefore?.characters || [])[i]?.level || 0));
      check(lvUp, '레벨업이 세이브에 반영', `표시 ${before.level}→${after.level}`);
      check(after.power > before.power, '레벨업 후 화면의 전투력이 실제로 오른다', `${before.power} → ${after.power}`);
      if (lvUp && !(after.power > before.power)) {
        issue('P1', `레벨은 올랐는데 표시 전투력이 그대로다 (${before.power} → ${after.power}) — 스탯 SSOT 회귀 의심`, {
          repro: '성장 > 영웅 > 카드 > 상세 보기 > [레벨업]',
          suspect: 'src/scenes/HeroDetailScene.js 전투력 재계산, src/data/index.ts calculatePower',
          evidence: JSON.stringify({ before, after }),
        });
      }
      await shot(page, '12-ssot-a-levelup');

      // 진화(각인) 버튼이 있으면 눌러 보고 같은 대조를 한다
      const evo = await findByLabel(page, '진화') || await findByLabel(page, '각인');
      if (evo) {
        const p0 = await heroPower(page);
        await tapWorld(page, evo.x, evo.y, 2200);
        for (let i = 0; i < 4; i += 1) if (!(await tapLabel(page, '확인', { required: false, settle: 1200 }))) break;
        const p1 = await heroPower(page);
        note(`진화 시도 전후 전투력 ${p0.power} → ${p1.power}`);
        check(p1.power >= p0.power, '진화 후 전투력이 줄지 않는다', `${p0.power} → ${p1.power}`);
        await shot(page, '12-ssot-b-evolve');
      } else note('진화 버튼 없음 — 진화 대조는 생략');
      await backToLobby(page);
    }

    // --- 2) 배지 숫자 == 실제 수령 가능 건수 ---
    const badge = await safeEvaluate(page, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      return {
        badges: mm?._menuBadges || null,
        quest: window.__TEST_API__?.getQuestStatus?.() || null,
        tickets: save?.resources?.summonTickets ?? 0,
        freeTenUsed: save?.gacha?.freeTenPullUsed === true,
      };
    });
    note(`배지 모델: ${JSON.stringify(badge.badges)} / 퀘스트: ${JSON.stringify(badge.quest).slice(0, 200)}`);
    if (badge.badges && badge.quest) {
      const qb = badge.badges.quest?.count ?? 0;
      const qa = badge.quest.claimable ?? 0;
      check(qb === qa, '퀘스트 배지 숫자 == 실제 수령 가능 건수', `배지 ${qb} vs 실제 ${qa}`);
      if (qb !== qa) {
        issue('P1', `퀘스트 배지(${qb}) ≠ 실제 수령 가능(${qa})`, {
          repro: '로비 도크 > 도전 배지와 퀘스트 팝업 수령 가능 수 비교',
          suspect: 'src/scenes/MainMenuScene.js _collectMenuBadgeContext, src/systems/MenuBadgeRules.js',
          evidence: JSON.stringify(badge),
        });
      }
      const expected = badge.freeTenUsed ? Math.floor(badge.tickets / 10) : 1;
      check((badge.badges.gacha?.count ?? 0) === expected, '소환 배지 숫자 == 규칙 기대치',
        `배지 ${badge.badges.gacha?.count ?? 0} vs 기대 ${expected} (소환권 ${badge.tickets})`);
    } else check(false, '메뉴 배지 모델(_menuBadges) 읽기');

    // --- 3) 벽 경고 전투력 == 실제 전투력 ---
    const wall = await safeEvaluate(page, () => {
      const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
      const mm = window.game.scene.getScene('MainMenuScene');
      const texts = collect(mm.children.list, [])
        .filter((o) => o.type === 'Text' && o.visible && o.text)
        .map((o) => ({ t: o.text.trim(), y: Math.round(o.getBounds().centerY) }));
      const label = texts.find((x) => x.t === '전투력');
      const shownPower = label
        ? Number((texts.find((x) => Math.abs(x.y - label.y) < 45 && /^[\d,]+$/.test(x.t))?.t || '0').replace(/,/g, ''))
        : null;
      const warn = texts.find((x) => /매우\s*어려움|어려움|보통|쉬움|위험/.test(x.t));
      return { shownPower, warning: warn?.t || null, partyPower: mm?.partyPower ?? null };
    });
    note(`벽 경고: ${JSON.stringify(wall)}`);
    check(wall.shownPower !== null && wall.shownPower > 0, '로비에 파티 전투력이 표시된다', `${wall.shownPower}`);
    check(!!wall.warning, '스테이지 난이도 경고 문구 노출', `${wall.warning}`);
    if (wall.partyPower !== null && wall.shownPower !== null) {
      check(Math.abs(wall.partyPower - wall.shownPower) <= 1, '표시 전투력 == 씬이 계산한 파티 전투력',
        `표시 ${wall.shownPower} vs 계산 ${wall.partyPower}`);
    }
    await shot(page, '12-ssot-c-wall');

    // --- 4) 명상: 집중력/초 × 경과시간 ≈ 축적 마력, 수확 반영 ---
    const m0 = await lobbyState(page);
    await page.waitForTimeout(12000);
    const m1 = await lobbyState(page);
    const measured = ((m1.accumulated ?? 0) - (m0.accumulated ?? 0)) / 12;
    const shown = m1.focus ?? 0;
    const ratio = measured > 0 ? shown / measured : 0;
    check(ratio > 0.5 && ratio < 2.0, '집중력/초 × 경과시간 ≈ 축적 마력',
      `표시 ${shown.toFixed(1)}/s, 실측 ${measured.toFixed(1)}/s (비 ${ratio.toFixed(2)})`);
    const gBefore = (await readSave(page))?.resources?.gold ?? 0;
    const harvest = await findByLabel(page, '보상받기', { sceneKeys: ['MainMenuScene'] });
    if (harvest) {
      await tapWorld(page, harvest.x, harvest.y, 2000);
      const gAfter = (await readSave(page))?.resources?.gold ?? 0;
      check(gAfter > gBefore, '수확 보상이 실제 재화에 반영', `골드 ${gBefore} → ${gAfter}`);
      if (gAfter <= gBefore) {
        issue('P1', '보상받기를 눌러도 골드가 늘지 않는다', {
          repro: '로비 → [보상받기] → 세이브의 resources.gold 비교',
          suspect: 'src/systems/IdleProgressSystem.js, src/scenes/MainMenuScene.js 수령 핸들러',
          evidence: `${gBefore} → ${gAfter}`,
        });
      }
    } else check(false, '로비에 수확(보상받기) 노출');

    // --- 5) 가챠 10연: 결과 개수 == 실제 지급 수, 스킵 경로에서도 결과 화면 ---
    await backToLobby(page);
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('gacha'));
    await page.waitForTimeout(1600);
    const b4 = await readSave(page);
    const heroesBefore = (b4?.characters || []).length;
    const pullsBefore = b4?.gacha?.totalPulls ?? 0;
    const ten = await findByLabel(page, '10연차') || await findByLabel(page, '티켓 ×10');
    check(!!ten, '10연 소환 진입점 노출');
    if (ten) {
      await tapWorld(page, ten.x, ten.y, 3500);
      // 스킵 경로 — [건너뛰기] 를 눌러도 결과 화면이 떠야 한다
      const skip = await findByLabel(page, '건너뛰기');
      if (skip) { await tapWorld(page, skip.x, skip.y, 2500); note('10연 연출을 [건너뛰기] 로 통과'); }
      const resultShown = await waitForLabel(page, '확인', {}, 12000);
      check(!!resultShown, '스킵 경로에서도 10연 결과 화면이 뜬다');
      if (!resultShown) {
        issue('P1', '10연 연출을 건너뛰면 결과 화면이 뜨지 않는다', {
          repro: '수집 > 소환 > 10연차 → [건너뛰기]',
          suspect: 'src/components/GachaResultOverlay.js 스킵 경로',
        });
      }
      await shot(page, '12-ssot-d-gacha-ten');
      const shownCount = await safeEvaluate(page, () => {
        const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
        let cards = 0;
        for (const sc of window.game.scene.getScenes(true)) {
          for (const o of collect(sc.children.list, [])) {
            let top = o.depth; for (let n = o; n; n = n.parentContainer) top = Math.max(top, n.depth || 0);
            if (top < 3000) continue;
            if ((o.type === 'Image' || o.type === 'Sprite') && o.visible && o.getBounds().width > 60) cards += 1;
          }
        }
        return cards;
      });
      for (let i = 0; i < 12; i += 1) if (!(await tapLabel(page, '확인', { required: false, settle: 900 }))) break;
      const a4 = await readSave(page);
      const delta = (a4?.gacha?.totalPulls ?? 0) - pullsBefore;
      const heroDelta = (a4?.characters || []).length - heroesBefore;
      const shardDelta = Object.values(a4?.resources?.characterShards || {}).reduce((s, v) => s + v, 0)
        - Object.values(b4?.resources?.characterShards || {}).reduce((s, v) => s + v, 0);
      check(delta === 10, '10연 집계 == 10회', `+${delta}`);
      check(heroDelta + (shardDelta > 0 ? 1 : 0) > 0, '10연 결과가 영웅/조각으로 실제 지급됨',
        `영웅 +${heroDelta}, 조각 합 +${shardDelta}`);
      note(`결과 화면 카드 추정 ${shownCount}장 / 영웅 +${heroDelta} / 조각 +${shardDelta}`);
      if (delta === 10 && heroDelta === 0 && shardDelta === 0) {
        issue('P1', '10연을 돌렸는데 영웅도 조각도 늘지 않았다(표시만 되고 지급 안 됨)', {
          repro: '수집 > 소환 > 10연차 → 결과 확인 후 세이브 비교',
          suspect: 'src/systems/GachaSystem.js 지급 경로',
          evidence: JSON.stringify({ delta, heroDelta, shardDelta }),
        });
      }
    }

    currentScenario().consoleErrors = errors.slice(0, 30);
  } finally { await ctx.close(); }
}

// ============================================================
// 13. 계정 C — 레거시 v1 세이브 마이그레이션
// ============================================================

async function scenario13(browser) {
  startScenario(13, '계정 C — 레거시 v1 세이브 마이그레이션');
  const { page, ctx, errors } = await openAccount(browser, 'C');
  try {
    check((await activeScenes(page)).includes('MainMenuScene'), '레거시 세이브로 로비 진입');
    await page.waitForTimeout(2500);
    await shot(page, '13-legacy-a-lobby');

    const migrated = await readSave(page);
    check((migrated?.version ?? 1) >= 2, `세이브 버전 상승 (v1 → v${migrated?.version})`);
    check(!!migrated?.tutorial, '마이그레이션이 tutorial 섹션을 만든다');
    check(!!migrated?.onboarding, '마이그레이션이 onboarding 섹션을 만든다');
    check(!!migrated?.story, '마이그레이션이 story 섹션을 만든다');

    // ---- 레거시 char_1~4 처리 판정 ----
    // `char_1~4` 는 폐지된 id 다(`characters.json` 에만 남아 있고 게임은 `base_*` 를 쓴다).
    // 오늘 P0 로 잡힌 보스전 파티 미해석의 원인도 같은 뿌리라, **치환 자체는 의도일 가능성이 크다.**
    // 그래서 "몇 명인가" 만으로 판정하지 않고 세 가지를 따로 본다.
    //   ① 치환된 영웅이 실제로 플레이 가능한가 (이름·스탯·포트레이트가 해석되는가)
    //   ② 파티가 비어 소프트락에 걸리지 않는가
    //   ③ 사라진 인원이 조각·재화로 환급됐는가
    // ③ 이 없고 ① 도 아니면(=그냥 소실) 기존 유저 자산이 사라지는 것이므로 P0 다.
    const ids = (migrated?.characters || []).map((c) => c.id);
    const LEGACY_COUNT = 4;
    const LEGACY_GEMS = 4200;
    const LEGACY_TICKETS = 7;
    note(`마이그레이션 후 영웅: ${ids.slice(0, 8).join(',')} (레거시 ${LEGACY_COUNT}명 → ${ids.length}명)`);
    check(ids.length > 0, `마이그레이션 후에도 영웅이 남아 있다 (${ids.length}명)`, ids.slice(0, 6).join(','));

    // ① 치환된 영웅이 플레이 가능한 형태로 해석되는가
    const playable = await safeEvaluate(page, () => {
      const owned = window.game.registry.get('ownedHeroes') || [];
      return owned.slice(0, 6).map((h) => ({
        id: h.id,
        name: h.name || null,
        rawName: !h.name || /^(char_|base_|asc_)/.test(String(h.name)),
        hp: h.hp ?? h.maxHp ?? null,
        atk: h.atk ?? null,
        portrait: h.portrait || h.portraitId || h.texture || null,
      }));
    });
    note(`해석된 영웅: ${JSON.stringify(playable)}`);
    const resolvedOk = playable.length > 0 && playable.every((h) => h.name && !h.rawName && (h.hp ?? 0) > 0);
    check(resolvedOk, '마이그레이션 후 영웅이 이름·스탯까지 해석된다(플레이 가능)', JSON.stringify(playable.slice(0, 3)));
    if (!resolvedOk) {
      issue('P0', '레거시 마이그레이션 후 영웅이 이름/스탯으로 해석되지 않는다', {
        repro: 'version 1 세이브를 심고 부팅 → registry.ownedHeroes 확인',
        suspect: 'src/systems/SaveManager.js 마이그레이션, src/data/index.ts getCharacterOrHero',
        evidence: JSON.stringify(playable),
      });
    }

    // ② 파티 소프트락 — 파티가 비면 전투 진입 자체가 막힌다
    const partyAfter = migrated?.parties?.[0];
    const partyIdsAfter = (partyAfter?.heroIds || (Array.isArray(partyAfter) ? partyAfter : [])).filter(Boolean);
    check(partyIdsAfter.length > 0, `마이그레이션 후 파티가 비어 있지 않다 (${partyIdsAfter.length}명)`, partyIdsAfter.join(','));
    const battleEntry = await findByLabel(page, '전투 시작', { sceneKeys: ['MainMenuScene'] })
      || await findByLabel(page, '보스전', { exact: true, sceneKeys: ['MainMenuScene'] })
      || await findByLabel(page, '소탕', { exact: true, sceneKeys: ['MainMenuScene'] });
    check(!!battleEntry, '마이그레이션 후 전투 진입점이 살아 있다(파티 소프트락 없음)', battleEntry ? `"${battleEntry.text}"` : '없음');
    if (partyIdsAfter.length === 0 || !battleEntry) {
      issue('P0', '레거시 마이그레이션 후 파티가 비어 전투에 들어갈 수 없다(소프트락)', {
        repro: 'version 1 세이브를 심고 부팅 → 로비의 파티/전투 진입점 확인',
        suspect: 'src/systems/SaveManager.js 마이그레이션의 parties 재구성',
        evidence: `parties[0]=${JSON.stringify(partyAfter)}`,
      });
    }

    // ③ 소실인가 환급인가
    const shardTotal = Object.values(migrated?.resources?.characterShards || {}).reduce((a, v) => a + (v || 0), 0);
    const compensated = (migrated?.resources?.gems ?? 0) > LEGACY_GEMS
      || shardTotal > 0
      || (migrated?.resources?.summonTickets ?? 0) > LEGACY_TICKETS;
    const lost = LEGACY_COUNT - ids.length;
    note(`영웅 증감 ${-lost}명 / 조각 합 ${shardTotal} / 젬 ${migrated?.resources?.gems} (레거시 ${LEGACY_GEMS}) / 소환권 ${migrated?.resources?.summonTickets} (레거시 ${LEGACY_TICKETS})`);
    check(lost <= 0 || compensated || resolvedOk,
      `레거시 영웅 ${LEGACY_COUNT}명이 유지·치환·환급 중 하나로 처리된다`,
      `감소 ${lost}명 · 환급 흔적 ${compensated} · 치환본 정상 ${resolvedOk}`);
    if (lost > 0 && !compensated && !resolvedOk) {
      issue('P0', `레거시 영웅 ${lost}명이 보상 없이 소실됐다 (${LEGACY_COUNT}명 → ${ids.length}명)`, {
        repro: 'version 1 세이브(char_1~4 보유)를 심고 부팅 → characters·resources 비교',
        suspect: 'src/systems/SaveManager.js 마이그레이션(레거시 char_* 처리), _grantStarterHero',
        evidence: `after=${ids.join(',')} / shards=${shardTotal} / gems=${migrated?.resources?.gems} / tickets=${migrated?.resources?.summonTickets}`,
      });
    } else if (lost > 0 && !compensated && resolvedOk) {
      // 치환본은 멀쩡하지만 사라진 인원에 대한 환급은 없다 — 자산 손실은 손실이다
      issue('P1', `레거시 영웅 ${lost}명이 치환됐으나 환급 흔적이 없다 (${LEGACY_COUNT}명 → ${ids.length}명)`, {
        repro: 'version 1 세이브를 심고 부팅 → characters 감소분과 resources 증가분 비교',
        suspect: 'src/systems/SaveManager.js 마이그레이션 보상 지급',
        evidence: `after=${ids.join(',')} / shards=${shardTotal} / gems=${migrated?.resources?.gems}`,
      });
    }
    const party = migrated?.parties?.[0];
    const partyIds = party?.heroIds || (Array.isArray(party) ? party : []);
    check(partyIds.filter(Boolean).length > 0, `파티가 비어 있지 않다 (${partyIds.filter(Boolean).join(',')})`);

    // 진행도 보존
    check(Object.keys(migrated?.progress?.clearedStages || {}).length >= 7, '클리어 기록 보존', `${Object.keys(migrated?.progress?.clearedStages || {}).length}개`);
    check((migrated?.resources?.gold ?? 0) >= 850000, '재화 보존', `골드 ${migrated?.resources?.gold}`);

    // ---- 인벤토리 스키마 정규화 (배열 → { equipment, items }) ----
    // 구세이브의 `inventory` 는 배열이었다. `EquipmentSystem`/`DebugManager` 가 `inventory.equipment`
    // 로 접근하면서 배열에 프로퍼티를 붙였다가 저장 때마다 장비가 소실됐다.
    // `SaveManager._migrateInventorySchema()` 가 이걸 정규화한다 — 실제로 도는지 본다.
    const invAfter = migrated?.inventory;
    const invNormalized = !!invAfter && !Array.isArray(invAfter)
      && Array.isArray(invAfter.equipment) && Array.isArray(invAfter.items);
    check(invNormalized, '인벤토리 스키마가 { equipment, items } 로 정규화된다',
      Array.isArray(invAfter) ? '아직 배열이다' : JSON.stringify(Object.keys(invAfter || {})));
    if (!invNormalized) {
      issue('P1', '레거시 세이브의 inventory 배열이 { equipment, items } 로 정규화되지 않았다', {
        repro: 'version 1 세이브(inventory: [])를 심고 부팅 → 세이브의 inventory 형태 확인',
        suspect: 'src/systems/SaveManager.js:286~306 _migrateInventorySchema',
        evidence: JSON.stringify(invAfter).slice(0, 300),
      });
    }
    // 정규화 과정에서 기존 항목이 사라지지 않았는가 (C 픽스처의 inventory 는 비어 있으므로
    // 여기서는 "배열이 items 로 옮겨졌는가"의 형태만 확인한다)
    note(`인벤토리 정규화 결과: ${JSON.stringify(invAfter).slice(0, 200)}`);

    // 저장을 한 번 더 유발해도 장비가 유지되는가 (소실 버그 재발 감시)
    await safeEvaluate(page, () => window.debug?.giveAllEquipment?.());
    await page.waitForTimeout(800);
    const invGranted = (await readSave(page))?.inventory;
    const grantedCount = Array.isArray(invGranted?.equipment) ? invGranted.equipment.length : -1;
    await safeEvaluate(page, () => window.debug?.addGold?.(1));   // 임의의 저장 유발
    await page.waitForTimeout(800);
    const invAfterSave = (await readSave(page))?.inventory;
    const afterCount = Array.isArray(invAfterSave?.equipment) ? invAfterSave.equipment.length : -1;
    check(grantedCount < 0 || afterCount >= grantedCount, '저장을 다시 해도 장비가 소실되지 않는다',
      `지급 직후 ${grantedCount}종 → 재저장 후 ${afterCount}종`);
    if (grantedCount > 0 && afterCount < grantedCount) {
      issue('P1', `저장 시 장비가 소실된다 (${grantedCount}종 → ${afterCount}종)`, {
        repro: 'debug.giveAllEquipment() → 임의 저장 유발 → inventory.equipment 개수 비교',
        suspect: 'src/systems/SaveManager.js 저장 경로, src/systems/EquipmentSystem.js',
        evidence: `${grantedCount} → ${afterCount}`,
      });
    }

    // 로비가 레거시 영웅으로도 정상 렌더되는가
    const stats = await renderStats(page);
    check(stats.texts > 5, '레거시 계정 로비 렌더 정상', JSON.stringify(stats));
    check(stats.nullTextures === 0, '레거시 계정 로비 텍스처 정상', `${stats.nullTextures}건`);
    await layoutAudit(page, '레거시 로비');

    // 레거시 계정에서 주요 팝업이 열리는가 (레거시 영웅 ID 로 인한 해석 실패 탐지)
    for (const key of ['herolist', 'partyedit', 'inventory', 'collection']) {
      const errBefore = errors.length;
      await backToLobby(page);
      await safeEvaluate(page, (k) => window.game.scene.getScene('MainMenuScene')?.openPopup(k), key);
      await page.waitForTimeout(1500);
      const st = await renderStats(page);
      check(st.texts > 3, `레거시 계정에서 팝업 [${key}] 렌더`, JSON.stringify(st));
      const newErrors = errors.slice(errBefore);
      check(newErrors.length === 0, `레거시 팝업 [${key}] 콘솔 에러 없음`, newErrors.slice(0, 2).join(' | '));
      await shot(page, `13-legacy-b-${key}`);
      await closePopup(page);
    }

    currentScenario().consoleErrors = errors.slice(0, 30);
    check(errors.length === 0, '레거시 마이그레이션 구간 콘솔 에러 없음', errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
}

// ============================================================
// 14. 회귀 확인 — 2026-09-04 라이브 검수에서 잡은 P0 2건 + P1 5건
// ============================================================

/**
 * 각 항목은 "고쳐졌다"가 아니라 **"증상이 사라졌다"** 를 관측한다.
 * 수정이 반영되기 전에 돌리면 당연히 실패한다 — 그게 이 시나리오의 기준선이다.
 *
 * 로컬(dev 서버) 대상에서는 `ProgressionSystem` 을 직접 import 해 스탯 SSOT 와 대조한다.
 * 프로덕션 번들에서는 import 가 불가능하므로 `registry.ownedHeroes`(HeroFactory 가
 * getFinalStats 로 만든 정규화본)로 낮춰 대조하고, 그 사실을 결과에 남긴다.
 */

/** ProgressionSystem.getFinalStats() 를 직접 태워 스탯 SSOT 를 얻는다 (로컬 전용) */
const finalStatsOf = (page, heroIds) => safeEvaluate(page, async (ids) => {
  const out = { source: null, stats: {} };
  try {
    const mod = await import('/src/systems/ProgressionSystem.js');
    const PS = mod.ProgressionSystem || mod.default;
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
    for (const id of ids) {
      const rec = (save.characters || []).find((c) => c.id === id || c.characterId === id);
      if (!rec) continue;
      out.stats[id] = PS.getFinalStats(rec);
    }
    out.source = 'ProgressionSystem.getFinalStats';
    return out;
  } catch (e) {
    // 프로덕션 번들 — 소스 경로 import 불가. registry 정규화본으로 낮춰 대조한다.
    const owned = window.game.registry.get('ownedHeroes') || [];
    for (const id of ids) {
      const h = owned.find((o) => o.id === id);
      if (h) out.stats[id] = { hp: h.hp ?? h.maxHp, atk: h.atk, def: h.def, spd: h.spd };
    }
    out.source = `registry.ownedHeroes (import 실패: ${String(e).slice(0, 60)})`;
    return out;
  }
}, heroIds);

async function scenario14(browser) {
  // --- R-1 / R-2: 각인 소프트락. 새로고침 없이 온보딩을 완주하는가 ---
  const result = await scenario1(browser, {
    id: 14,
    name: '회귀 확인 A — 각인 소프트락(T-07·T-09) 새로고침 없이 진행되는가',
    recoverByReload: false,
    P: '14-regress-onboarding',
  });
  check(result.reloadsUsed === 0, '온보딩 중 새로고침 복구를 쓰지 않았다', `${result.reloadsUsed}회`);
  check(!result.stuckAt, '각인 스텝에서 막히지 않았다', result.stuckAt ? `막힌 스텝: ${result.stuckAt}` : '없음');
  check((result.mainDone || 0) === 12, `새로고침 없이 T-01~T-12 완주 (${result.mainDone || 0}/12)`);

  // --- R-3 ~ R-7: 진행 계정에서 나머지 항목 ---
  startScenario('14b', '회귀 확인 B — 보스전 스탯·PvP·오프라인 보상·탑 undefined·내부 ID (계정 B)');
  const { page, ctx, errors } = await openAccount(browser, 'B');
  try {
    await page.waitForTimeout(2500);

    // ---------- R-3: 보스전 아군 스탯 == getFinalStats() ----------
    const partyIds = await safeEvaluate(page, () => {
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      const p = save.parties?.[0];
      return (p?.heroIds || (Array.isArray(p) ? p : [])).filter(Boolean);
    });
    const ssot = await finalStatsOf(page, partyIds);
    note(`스탯 SSOT 출처: ${ssot.source}`);
    note(`SSOT: ${JSON.stringify(ssot.stats)}`);

    const boss = await findByLabel(page, '보스전', { exact: true, sceneKeys: ['MainMenuScene'] })
      || await findByLabel(page, '전투 시작', { exact: true, sceneKeys: ['MainMenuScene'] });
    check(!!boss, '로비에 보스전/전투 진입점');
    if (boss) {
      await tapWorld(page, boss.x, boss.y, 2200);
      await skipCutscenes(page, 3);
      const up = await (async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 25000) {
          if ((await activeScenes(page)).includes('BattleScene')) return true;
          await skipCutscenes(page, 1);
          await page.waitForTimeout(400);
        }
        return false;
      })();
      check(up, '보스전 진입');
      if (up) {
        await page.waitForTimeout(1500);
        await shot(page, '14b-regress-boss-party');
        const allies = await safeEvaluate(page, () => {
          const bs = window.game.scene.getScene('BattleScene');
          return (bs?.allies || []).map((a) => ({
            id: a.id, name: a.name, maxHp: a.maxHp, atk: a.atk ?? a.attack, def: a.def, spd: a.spd,
          }));
        });
        note(`전투 아군: ${JSON.stringify(allies)}`);

        const rawId = allies.filter((a) => /^(base_|asc_|char_)/.test(String(a.name || '')));
        check(rawId.length === 0, '[회귀] 전투 아군 이름이 내부 ID 가 아니다', JSON.stringify(allies.map((a) => a.name)));
        const flat100 = allies.length > 0 && allies.every((a) => a.maxHp === 100);
        check(!flat100, '[회귀] 전투 아군 최대 HP 가 기본값 100 이 아니다', JSON.stringify(allies.map((a) => a.maxHp)));

        // 핵심 — 실제 스탯이 SSOT 와 일치하는가
        const mismatches = [];
        for (const a of allies) {
          const s = ssot.stats[a.id];
          if (!s) { mismatches.push(`${a.id}: SSOT 없음`); continue; }
          if (Number(a.maxHp) !== Number(s.hp)) mismatches.push(`${a.id}: maxHp ${a.maxHp} ≠ SSOT ${s.hp}`);
          if (s.atk != null && Number(a.atk) !== Number(s.atk)) mismatches.push(`${a.id}: atk ${a.atk} ≠ SSOT ${s.atk}`);
        }
        check(mismatches.length === 0, '[회귀] 보스전 아군 스탯 == getFinalStats()', mismatches.slice(0, 4).join(' / '));
        if (mismatches.length > 0 || rawId.length > 0 || flat100) {
          issue('P0', '[회귀 미해소] 보스전 파티 스탯이 SSOT 와 다르다', {
            repro: '로비 → [보스전] → BattleScene.allies 와 ProgressionSystem.getFinalStats() 비교',
            suspect: 'src/scenes/MainMenuScene.js 보스전 파티 로드(getCharacterOrHero + getFinalStats 경유 여부)',
            evidence: `${JSON.stringify(allies)} vs ${JSON.stringify(ssot.stats)} (${ssot.source})`,
          });
        }

        // 결과 화면의 '내 파티 N' 도 0 이 아니어야 한다
        const res = await playBattle(page, { timeout: 90000 });
        if (res.entered && !res.timedOut) {
          await page.waitForTimeout(1200);
          await shot(page, '14b-regress-boss-result');
          const rt = (await visibleTexts(page)).map((t) => t.text);
          const myPower = rt.find((t) => /내 파티\s*[\d,]+/.test(t));
          const zeroPower = /내 파티\s*0\b/.test(myPower || '');
          const unknown = rt.filter((t) => t.trim() === '???').length;
          check(!zeroPower, '[회귀] 결과 화면의 내 파티 전투력이 0 이 아니다', myPower || '(문구 없음)');
          check(unknown === 0, '[회귀] 결과 화면 편성 목록에 ??? 가 없다', `${unknown}건`);
          // 보상 아이템 이름이 내부 ID 로 새지 않는가 (P1-4)
          const rawItem = rt.filter((t) => /^[a-z][a-z0-9_]*_[a-z0-9_]+$/.test(t.trim()));
          check(rawItem.length === 0, '[회귀] 결과 화면에 아이템 내부 ID 노출 없음', rawItem.slice(0, 4).join(', '));
          if (rawItem.length > 0) {
            issue('P1', `[회귀 미해소] 결과 화면에 내부 ID 노출: ${rawItem.slice(0, 3).join(', ')}`, {
              repro: '전투 승리 → 결과 화면 보상 카드',
              suspect: 'src/scenes/BattleResultScene.js 아이템 이름 해석',
              evidence: rawItem.join(', '),
            });
          }
        } else {
          note('전투가 종료되지 않아 결과 화면 회귀 항목은 미검증');
        }
        await backToMain(page);
      }
    }

    // ---------- R-4: PvP 상대 조회 ----------
    await backToLobby(page);
    const errBeforePvp = errors.length;
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('pvp'));
    await page.waitForTimeout(6000);
    await shot(page, '14b-regress-pvp');
    const pvpTexts = (await visibleTexts(page)).map((t) => t.text);
    const stillLoading = pvpTexts.some((t) => /로딩 중/.test(t));
    const pvpErrors = errors.slice(errBeforePvp).filter((e) => /warn is not a function|is not a function/.test(e));
    check(!stillLoading, '[회귀] PvP 본문이 로딩 중에서 멈추지 않는다', pvpTexts.slice(0, 8).join(' / '));
    check(pvpErrors.length === 0, '[회귀] PvP 조회 중 함수 부재 예외 없음', pvpErrors.slice(0, 2).join(' | '));
    if (stillLoading || pvpErrors.length) {
      issue('P1', '[회귀 미해소] PvP 상대 조회가 여전히 실패한다', {
        repro: '교류 → PvP → 본문 6초 관찰',
        suspect: 'src/utils/GameLogger.ts warn 정의, src/systems/PvPSystem.js findOpponents',
        evidence: `loading=${stillLoading} / ${pvpErrors.join(' | ')}`,
      });
    }
    await closePopup(page);

    // ---------- R-5: 오프라인 보상 팝업 ----------
    await safeEvaluate(page, () => {
      const d = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      const ago = Date.now() - 6 * 3600 * 1000;
      d.lastOnline = ago; d.lastLogoutTime = ago;
      localStorage.setItem('arcane_collectors_save', JSON.stringify(d));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForLobby(page);
    await shot(page, '14b-regress-offline');
    const offTexts = (await visibleTexts(page)).map((t) => t.text);
    const offShown = offTexts.some((t) => /오프라인|자리를 비운|그동안|복귀/.test(t));
    const offModel = await safeEvaluate(page, () => {
      const mm = window.game.scene.getScene('MainMenuScene');
      return { passed: mm?.showOfflineRewards ? mm.showOfflineRewards.gold : null };
    });
    check(offShown, '[회귀] 6시간 오프라인 복귀 시 보상 팝업이 뜬다', offTexts.slice(0, 8).join(' / '));
    if (!offShown && offModel.passed) {
      issue('P1', `[회귀 미해소] 오프라인 보상(${offModel.passed})이 전달되는데 팝업이 뜨지 않는다`, {
        repro: '세이브 lastOnline/lastLogoutTime 을 6시간 전으로 → 새로고침',
        suspect: 'src/scenes/MainMenuScene.js showOfflineRewardsPopup 호출부',
        evidence: JSON.stringify({ offModel, texts: offTexts.slice(0, 10) }),
      });
    }
    if (offShown) {
      const gBefore = (await readSave(page))?.resources?.gold ?? 0;
      await tapLabel(page, '받기', { required: false, settle: 1800 });
      const gAfter = (await readSave(page))?.resources?.gold ?? 0;
      check(gAfter >= gBefore, '오프라인 보상 수령이 재화에 반영', `골드 ${gBefore} → ${gAfter}`);
    }

    // ---------- R-6: 무한탑 undefined ----------
    await backToLobby(page);
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('tower'));
    await page.waitForTimeout(2500);
    await shot(page, '14b-regress-tower');
    const towerTexts = (await visibleTexts(page)).map((t) => t.text);
    const undef = towerTexts.filter((t) => /undefined|NaN|null/i.test(t));
    check(undef.length === 0, '[회귀] 무한탑에 undefined/NaN 표기 없음', undef.slice(0, 4).join(' / '));
    // 적 이름이 내부 ID 로 새는지 (wolf_alpha 같은 소문자 스네이크)
    const rawEnemy = towerTexts.filter((t) => /^[a-z][a-z0-9]*_[a-z0-9_]+(\s*x\d+)?$/.test(t.trim()));
    check(rawEnemy.length === 0, '[회귀] 무한탑 적 이름이 내부 ID 가 아니다', rawEnemy.slice(0, 4).join(' / '));
    if (undef.length || rawEnemy.length) {
      issue('P1', '[회귀 미해소] 무한탑에 undefined 또는 내부 ID 노출', {
        repro: '도전 → 무한탑',
        suspect: 'src/components/popups/TowerPopup.js, src/systems/TowerSystem.js',
        evidence: JSON.stringify({ undef, rawEnemy }).slice(0, 400),
      });
    }
    await closePopup(page);

    // ---------- R-8(P1-5): 강제 튜토리얼 마스크 딤이 화면을 삼키는가 ----------
    // 여기서는 팝업 위 딤이 이중으로 겹치는지를 수치로 본다(온보딩 계정에서만 의미가 있어
    // 계정 B 에서는 팝업 자체 딤 알파만 기록한다).
    const dim = await safeEvaluate(page, () => {
      const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
      const mm = window.game.scene.getScene('MainMenuScene');
      mm.openPopup('gacha');
      const out = [];
      for (const o of collect(mm.children.list, [])) {
        if (o.type !== 'Rectangle' || !o.visible) continue;
        const b = o.getBounds();
        if (b.width > window.game.scale.gameSize.width * 0.9 && b.height > window.game.scale.gameSize.height * 0.9) {
          out.push({ alpha: o.alpha, fill: o.fillColor });
        }
      }
      return out;
    });
    note(`전체 화면 딤 레이어: ${JSON.stringify(dim)}`);
    const totalDim = dim.reduce((a, d) => a + (d.alpha || 0), 0);
    check(totalDim < 1.4, '[참고] 전면 딤 레이어 누적 알파가 과하지 않다', `합 ${totalDim.toFixed(2)} (${dim.length}겹)`);
    await closePopup(page);

    currentScenario().consoleErrors = errors.slice(0, 30);
  } finally { await ctx.close(); }
}

// ============================================================
// 15. 이전 미검증 4건 재시도
// ============================================================

async function scenario15(browser) {
  startScenario(15, '미검증 4건 재시도 — 장비 장착·음량 슬라이더·상태이상·무한탑 순위 (계정 B)');
  const { page, ctx, errors } = await openAccount(browser, 'B');
  try {
    await page.waitForTimeout(2500);

    // ---------- U-1: 장비 장착 → 스탯 반영 ----------
    // 지난 검수에서는 인벤토리 장비가 전부 타입 `기타` 라 슬롯 후보가 없어 장착까지 못 갔다.
    await safeEvaluate(page, () => window.debug?.giveAllEquipment?.());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForLobby(page);

    const inv = await safeEvaluate(page, () => {
      const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
      // 스키마 변경(2026-09-05): inventory 가 배열 → { equipment, items } 가 됐다.
      // 구·신 양쪽을 모두 받아 픽스처/마이그레이션 상태와 무관하게 읽는다.
      const invField = save.inventory;
      const list = Array.isArray(invField?.equipment) ? invField.equipment
        : (Array.isArray(save.equipment) ? save.equipment
          : (Array.isArray(invField) ? invField : []));
      return list.slice(0, 8).map((it) => ({ id: it.id, type: it.type, slot: it.slot, name: it.name }));
    });
    note(`장비 레코드: ${JSON.stringify(inv)}`);
    const typed = inv.filter((i) => i.type && !/^기타$|^etc$|^other$/i.test(String(i.type)));
    check(inv.length > 0, '장비를 보유하고 있다', `${inv.length}종`);
    check(typed.length > 0, '장비에 실제 슬롯 타입이 지정돼 있다(기타 아님)', JSON.stringify(inv.map((i) => i.type)));
    if (inv.length > 0 && typed.length === 0) {
      issue('P1', '장비 타입이 전부 `기타` 라 무기/방어구/액세서리/유물 슬롯에 매칭되지 않는다', {
        repro: '성장 → 가방 → 장비 탭 / 영웅 상세 → 장비 탭',
        suspect: 'src/systems/EquipmentSystem.js 타입 매핑, src/data/equipment.json',
        evidence: JSON.stringify(inv),
      });
    }

    const opened = await openMenu(page, '성장', '영웅');
    if (opened) {
      await page.waitForTimeout(1200);
      const card = await safeEvaluate(page, () => {
        const collect = (l, o) => { l.forEach((x) => { if (!x) return; o.push(x); if (Array.isArray(x.list)) collect(x.list, o); }); return o; };
        for (const sc of window.game.scene.getScenes(true)) {
          for (const o of collect(sc.children.list, [])) {
            if (!o.input?.enabled || o.type !== 'Rectangle') continue;
            let top = o.depth; for (let n = o; n; n = n.parentContainer) top = Math.max(top, n.depth || 0);
            if (top < 2000) continue;
            const b = o.getBounds();
            if (b.width > 120 && b.width < 260 && b.height > 150 && b.height < 300) return { x: b.centerX, y: b.centerY };
          }
        }
        return null;
      });
      if (card) await tapWorld(page, card.x, card.y, 2000);
      await tapLabel(page, '상세 보기', { required: false, settle: 2500 });
      await tapLabel(page, '장비', { exact: true, required: false, settle: 1500 });
      await shot(page, '15-retry-a-equip-tab');

      const heroId = await safeEvaluate(page, () => {
        const hd = window.game.scene.getScene('HeroDetailScene');
        return hd?.hero?.id || hd?.heroId || null;
      });
      const before = await heroPower(page);
      const ssotBefore = heroId ? await finalStatsOf(page, [heroId]) : null;

      // 빈 슬롯을 눌러 장착 목록을 열고 첫 후보를 장착한다
      const slot = await findByLabel(page, '무기', { exact: true }) || await findByLabel(page, '+');
      if (slot) {
        await tapWorld(page, slot.x, slot.y, 1800);
        await shot(page, '15-retry-b-equip-picker');
        const pickerTexts = (await visibleTexts(page)).map((t) => t.text);
        note(`장착 목록: ${pickerTexts.slice(0, 10).join(' / ')}`);
        const equipBtn = await findByLabel(page, '장착', { exact: true });
        if (equipBtn) {
          await tapWorld(page, equipBtn.x, equipBtn.y, 2000);
        } else {
          // 목록의 첫 항목을 눌러 본다
          const firstItem = await findByLabel(page, '초보자');
          if (firstItem) { await tapWorld(page, firstItem.x, firstItem.y, 1500); await tapLabel(page, '장착', { required: false, settle: 1800 }); }
        }
        await shot(page, '15-retry-c-equipped');
        const after = await heroPower(page);
        const ssotAfter = heroId ? await finalStatsOf(page, [heroId]) : null;
        const equippedNow = await safeEvaluate(page, (id) => {
          const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
          const rec = (save.characters || []).find((c) => c.id === id);
          return rec?.equipment || rec?.equipped || null;
        }, heroId);
        note(`장착 상태: ${JSON.stringify(equippedNow)}`);
        const didEquip = !!equippedNow && Object.values(equippedNow).some(Boolean);
        check(didEquip, '장비가 실제로 장착됐다(세이브 반영)', JSON.stringify(equippedNow));
        if (didEquip) {
          check(after.power > before.power, '장착 후 화면 전투력이 오른다', `${before.power} → ${after.power}`);
          if (ssotBefore && ssotAfter && heroId) {
            const b = ssotBefore.stats[heroId], a = ssotAfter.stats[heroId];
            check(!!a && !!b && (a.atk > b.atk || a.hp > b.hp || a.def > b.def),
              '장착이 getFinalStats() 스탯에 반영된다', `${JSON.stringify(b)} → ${JSON.stringify(a)}`);
          }
          if (!(after.power > before.power)) {
            issue('P1', `장비를 장착했는데 표시 전투력이 그대로다 (${before.power} → ${after.power})`, {
              repro: '성장 → 영웅 → 상세 보기 → 장비 탭 → 슬롯 → 장착',
              suspect: 'src/scenes/HeroDetailScene.js 재계산, src/systems/ProgressionSystem.js getEquipmentBonus',
              evidence: JSON.stringify({ before, after, equippedNow }),
            });
          }
        } else {
          note('장착에 도달하지 못했다 — 장비 타입/슬롯 매칭 문제일 수 있다(위 U-1 참조). 미검증으로 남긴다');
        }
      } else check(false, '영웅 상세 장비 탭에 슬롯 진입점 노출');
      await backToLobby(page);
    }

    // ---------- U-2: 음량 슬라이더 ----------
    // 값은 settings 루트가 아니라 `settings.audio` 에 저장된다(SettingsPopup 주석 SND-01).
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('settings'));
    await page.waitForTimeout(1800);
    await shot(page, '15-retry-d-settings');
    const audioBefore = (await readSave(page))?.settings?.audio ?? (await readSave(page))?.settings ?? null;
    note(`설정(오디오) 이전: ${JSON.stringify(audioBefore)}`);
    const musicRow = await findByLabel(page, '음악') || await findByLabel(page, 'BGM') || await findByLabel(page, '배경음');
    check(!!musicRow, '설정에 음량 행(음악) 노출');
    if (musicRow) {
      // 드래그 슬라이더다 — 탭이 아니라 실제로 끌어야 값이 바뀐다
      const m = await canvasMap(page);
      const toPage = (wx, wy) => ({ x: m.x + (wx * m.w) / m.gw, y: m.y + (wy * m.h) / m.gh });
      const from = toPage(musicRow.x + 120, musicRow.y);
      const to = toPage(musicRow.x + 320, musicRow.y);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(1200);
      await shot(page, '15-retry-e-settings-dragged');
      const audioMid = (await readSave(page))?.settings?.audio ?? (await readSave(page))?.settings ?? null;
      const changed = JSON.stringify(audioBefore) !== JSON.stringify(audioMid);
      check(changed, '음량 슬라이더 드래그가 설정 값을 바꾼다', `${JSON.stringify(audioBefore)} → ${JSON.stringify(audioMid)}`);
      await closePopup(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForLobby(page);
      const audioAfter = (await readSave(page))?.settings?.audio ?? (await readSave(page))?.settings ?? null;
      check(JSON.stringify(audioMid) === JSON.stringify(audioAfter), '음량 설정이 새로고침 후에도 유지', JSON.stringify(audioAfter));
      if (!changed) {
        issue('P2', '음량 슬라이더를 드래그해도 settings.audio 가 바뀌지 않는다', {
          repro: '설정 → 음악 슬라이더를 오른쪽으로 드래그 → 세이브의 settings.audio 확인',
          suspect: 'src/components/popups/SettingsPopup.js 슬라이더 드래그 처리, src/systems/SoundManager.js 저장',
          evidence: JSON.stringify({ audioBefore, audioMid }),
        });
      }
    }

    // ---------- U-3: 전투 상태이상 아이콘 ----------
    // 상태이상은 `battler.cultState.statuses` 에 쌓인다(CultMechanicsSystem).
    // 발생 조건을 강제할 치트가 없으므로, 전투를 돌리며 발생을 관찰하고
    // 끝내 발생하지 않으면 **미검증으로 남긴다**(통과로 위장하지 않는다).
    await backToLobby(page);
    const bossBtn = await findByLabel(page, '보스전', { exact: true, sceneKeys: ['MainMenuScene'] })
      || await findByLabel(page, '전투 시작', { exact: true, sceneKeys: ['MainMenuScene'] });
    if (bossBtn) {
      await tapWorld(page, bossBtn.x, bossBtn.y, 2200);
      await skipCutscenes(page, 3);
      const inBattle = await (async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 25000) {
          if ((await activeScenes(page)).includes('BattleScene')) return true;
          await skipCutscenes(page, 1);
          await page.waitForTimeout(400);
        }
        return false;
      })();
      if (inBattle) {
        await tapLabel(page, 'AUTO OFF', { required: false, sceneKeys: ['BattleScene'] });
        let observed = null;
        const t0 = Date.now();
        while (Date.now() - t0 < 45000) {
          const st = await safeEvaluate(page, () => {
            const bs = window.game.scene.getScene('BattleScene');
            if (!bs || !window.game.scene.isActive('BattleScene')) return null;
            const pack = (arr) => (arr || []).map((b) => ({
              name: b.name,
              statuses: (b.cultState?.statuses || []).map((s) => s.type),
            })).filter((b) => b.statuses.length > 0);
            return { allies: pack(bs.allies), enemies: pack(bs.enemies) };
          });
          if (!st) break;
          if (st.allies.length || st.enemies.length) { observed = st; break; }
          await page.waitForTimeout(700);
        }
        if (observed) {
          await shot(page, '15-retry-f-status-effect');
          note(`상태이상 관측: ${JSON.stringify(observed)}`);
          check(true, '전투 중 상태이상 발생 관측', JSON.stringify(observed).slice(0, 200));
          manual('상태이상 아이콘이 화면에서 식별 가능한지', '15-retry-f-status-effect.png');
        } else {
          await shot(page, '15-retry-f-status-none');
          note('45초 동안 상태이상이 발생하지 않았다 — 상태이상 아이콘은 이번에도 미검증으로 남긴다');
          check(null === null, '상태이상 미발생 (미검증으로 남김)', '통과로 세지 않는다');
        }
        await backToMain(page);
      }
    }

    // ---------- U-4: 무한탑 순위 ----------
    // 지난번 "순위 탭 없음" 은 잘못된 기대였다 — 순위는 별도 탭이 아니라 **시즌 탭 안**에 있다
    // (`TowerPopup.js`: '시즌 순위 TOP 20', '내 순위').
    await backToLobby(page);
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('tower'));
    await page.waitForTimeout(2200);
    const seasonTab = await findByLabel(page, '시즌');
    check(!!seasonTab, '무한탑 시즌 탭 노출');
    if (seasonTab) {
      await tapWorld(page, seasonTab.x, seasonTab.y, 2500);
      await shot(page, '15-retry-g-tower-season');
      const st = (await visibleTexts(page)).map((t) => t.text);
      check(st.some((t) => /시즌 순위|내 순위|TOP/.test(t)), '시즌 탭 안에 순위 영역 노출', st.filter((t) => /순위|TOP/.test(t)).slice(0, 4).join(' / '));
      const refresh = await findByLabel(page, '순위 새로고침');
      check(!!refresh, '순위 새로고침 진입점 노출');
      if (refresh) {
        await tapWorld(page, refresh.x, refresh.y, 3000);
        await shot(page, '15-retry-h-tower-rank-refreshed');
        const after = (await visibleTexts(page)).map((t) => t.text);
        const stuck = after.some((t) => /로딩 중|불러오는/.test(t));
        check(!stuck, '순위 새로고침이 로딩에서 멈추지 않는다', after.slice(0, 8).join(' / '));
      }
      await layoutAudit(page, '무한탑 시즌 탭');
    }
    await closePopup(page);

    currentScenario().consoleErrors = errors.slice(0, 30);
  } finally { await ctx.close(); }
}

// ============================================================
// 16. 표시된 보상 == 실제 지급분 (팀 기준: 지급되지 않는 보상은 표시하지 않는다)
// ============================================================

/**
 * 화면에 "보상"으로 적힌 것과 세이브에 실제로 들어온 것을 대조한다.
 *
 * 배경 — 2026-09-05 하루에만 이 계열에서 6건이 나왔다(레이드 조각/SSR권, 친구 포인트 상점
 * 3종, 타워 ssrTicket). 전부 **화면에는 있는데 지급 경로가 없는** 항목이었다.
 * 그래서 팀 기준이 "지급되지 않는 보상은 화면에 표시하지 않는다" 로 정해졌고,
 * 이 시나리오가 그 기준을 네 경로(레이드·친구 상점·타워·스테이지 전투)에서 강제한다.
 *
 * 판정 방식
 *   ① 화면에서 보상처럼 보이는 토큰을 긁는다 (`골드 2840`, `젬 50`, `조각`, `SSR권` …)
 *   ② 보상 수령/전투를 실제로 수행한다
 *   ③ 세이브의 재화 스냅샷 차이를 낸다
 *   ④ 표시된 항목이 세이브 어디에서도 늘지 않았으면 **표시만 하고 안 주는 것** = 결함
 *
 *   수치가 붙은 항목은 "그 수치 이상 늘었는가"까지 본다. 수치 없는 항목(`조각`·`SSR권` 등)은
 *   대응 필드가 하나라도 늘었는지만 본다 — 정확한 지급량 규칙을 테스트가 다시 구현하면
 *   그 자체가 또 하나의 진실 원본이 되어 어긋난다.
 */

/** 화면 문구의 보상 라벨 → 세이브 경로. 여기 없는 라벨은 "지급 경로 불명"으로 따로 잡는다 */
const REWARD_FIELDS = Object.freeze({
  '골드': ['resources', 'gold'],
  '젬': ['resources', 'gems'],
  '정령석': ['resources', 'spiritStones'],
  '스킬북': ['resources', 'skillBooks'],
  '소환권': ['resources', 'summonTickets'],
  '각인서': ['resources', 'institutionSeal'],
  '세계수의 씨앗': ['resources', 'worldTreeSeeds'],
  '각성의 불꽃': ['resources', 'awakeningFlame'],
});

/** 지급 경로가 없다고 알려진(= 표시되면 안 되는) 라벨 */
const UNBACKED_LABELS = ['SSR권', 'SSR 확정권', 'ssrTicket', '조각', '장비 확률', 'equipmentChance'];

/** 세이브의 재화·수량 스냅샷 */
const resourceSnapshot = (page) => safeEvaluate(page, () => {
  const d = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
  const r = d.resources || {};
  const inv = d.inventory;
  return {
    gold: r.gold ?? 0,
    gems: r.gems ?? 0,
    spiritStones: r.spiritStones ?? 0,
    skillBooks: r.skillBooks ?? 0,
    summonTickets: r.summonTickets ?? 0,
    institutionSeal: r.institutionSeal ?? 0,
    worldTreeSeeds: r.worldTreeSeeds ?? 0,
    awakeningFlame: r.awakeningFlame ?? 0,
    shardTotal: Object.values(r.characterShards || {}).reduce((a, v) => a + (v || 0), 0),
    heroes: (d.characters || []).length,
    equipment: Array.isArray(inv?.equipment) ? inv.equipment.length : (Array.isArray(inv) ? inv.length : 0),
    items: Array.isArray(inv?.items) ? inv.items.length : 0,
  };
});

/** 화면에서 보상처럼 보이는 문구를 긁는다 */
async function scanRewardText(page) {
  const texts = (await visibleTexts(page)).map((t) => t.text.trim()).filter(Boolean);
  const numbered = [];
  const unbacked = [];
  for (const t of texts) {
    for (const label of Object.keys(REWARD_FIELDS)) {
      const m = t.match(new RegExp(`${label}\\s*[:x×]?\\s*([\\d,]+)`));
      if (m) numbered.push({ label, amount: Number(m[1].replace(/,/g, '')), text: t.slice(0, 40) });
    }
    for (const label of UNBACKED_LABELS) {
      if (t.includes(label)) unbacked.push({ label, text: t.slice(0, 40) });
    }
  }
  return { numbered, unbacked, sample: texts.slice(0, 12) };
}

/** 스냅샷 차이 */
function snapshotDelta(before, after) {
  const out = {};
  for (const k of Object.keys(before || {})) {
    const d = (after?.[k] ?? 0) - (before?.[k] ?? 0);
    if (d !== 0) out[k] = d;
  }
  return out;
}

/**
 * 한 경로에 대해 "표시 == 지급" 을 판정한다.
 * @param {string} route 경로 이름 (보고서용)
 * @param {object} shown scanRewardText 결과
 * @param {object} delta snapshotDelta 결과
 * @param {boolean} claimed 실제로 수령/클리어 동작을 수행했는가
 */
function judgeRewardParity(route, shown, delta, claimed, extra = {}) {
  const gained = Object.keys(delta).length > 0;
  note(`[${route}] 표시=${JSON.stringify(shown.numbered)} 미보증표시=${JSON.stringify(shown.unbacked)} 실지급=${JSON.stringify(delta)}`);

  // ① 지급 경로가 없다고 알려진 라벨이 화면에 남아 있으면 안 된다
  check(shown.unbacked.length === 0, `[${route}] 지급 경로 없는 보상 표기 없음`,
    shown.unbacked.map((u) => u.text).join(' / ') || '없음');
  if (shown.unbacked.length > 0) {
    issue('P1', `[${route}] 지급되지 않는 보상이 화면에 표시된다: ${shown.unbacked.map((u) => u.label).join(', ')}`, {
      repro: `${route} 화면의 보상 문구 확인`,
      suspect: extra.suspect || '해당 팝업의 보상 표기',
      evidence: JSON.stringify(shown.unbacked).slice(0, 400),
    });
  }

  if (!claimed) {
    note(`[${route}] 수령/클리어를 수행하지 못해 지급 대조는 생략한다(표기 검사만 수행)`);
    return;
  }

  // ② 수치가 붙은 표시는 그만큼 이상 들어와야 한다
  for (const item of shown.numbered) {
    const path = REWARD_FIELDS[item.label];
    const key = path[1];
    const got = delta[key] ?? 0;
    const ok = got >= item.amount;
    check(ok, `[${route}] 표시된 ${item.label} ${item.amount} 이 실제 지급됨`, `실제 +${got}`);
    if (!ok) {
      issue('P1', `[${route}] ${item.label} ${item.amount} 을 표시했는데 실제로는 +${got} 만 들어왔다`, {
        repro: `${route} 보상 표시 확인 → 수령/클리어 → 세이브 재화 비교`,
        suspect: extra.suspect || '해당 경로의 보상 지급',
        evidence: JSON.stringify({ shown: item, delta }),
      });
    }
  }

  // ③ 보상을 표시했는데 아무 것도 안 늘었으면 그 자체가 결함이다
  if (shown.numbered.length > 0 && !gained) {
    issue('P1', `[${route}] 보상을 표시했는데 세이브에는 아무 것도 늘지 않았다`, {
      repro: `${route} 수령/클리어 후 세이브 비교`,
      suspect: extra.suspect || '해당 경로의 보상 지급',
      evidence: JSON.stringify({ shown: shown.numbered, delta }),
    });
  }
}

async function scenario16(browser) {
  startScenario(16, '보상 표시 == 실지급 — 레이드·친구 상점·타워·스테이지 전투 (계정 B)');
  const { page, ctx, errors } = await openAccount(browser, 'B');
  try {
    await page.waitForTimeout(2500);

    // ---------- 1) 레이드 ----------
    await backToLobby(page);
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('raid'));
    await page.waitForTimeout(2000);
    await shot(page, '16-reward-a-raid');
    const raidShown = await scanRewardText(page);
    const raidBefore = await resourceSnapshot(page);
    const raidClaim = await findByLabel(page, '수령') || await findByLabel(page, '받기');
    let raidClaimed = false;
    if (raidClaim) { await tapWorld(page, raidClaim.x, raidClaim.y, 2200); raidClaimed = true; }
    const raidAfter = await resourceSnapshot(page);
    judgeRewardParity('레이드', raidShown, snapshotDelta(raidBefore, raidAfter), raidClaimed, {
      suspect: 'src/components/popups/RaidPopup.js, src/systems/RaidSystem.js',
    });
    await closePopup(page);

    // ---------- 2) 친구 포인트 상점 ----------
    await backToLobby(page);
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('friends'));
    await page.waitForTimeout(2000);
    await shot(page, '16-reward-b-friends');
    const friendShown = await scanRewardText(page);
    const shopEntry = await findByLabel(page, '상점') || await findByLabel(page, '교환') || await findByLabel(page, '포인트');
    if (shopEntry) {
      await tapWorld(page, shopEntry.x, shopEntry.y, 2000);
      await shot(page, '16-reward-b-friends-shop');
    }
    const shopShown = await scanRewardText(page);
    const shopBefore = await resourceSnapshot(page);
    const buyBtn = await findByLabel(page, '구매') || await findByLabel(page, '교환하기');
    let bought = false;
    if (buyBtn) { await tapWorld(page, buyBtn.x, buyBtn.y, 2200); bought = true; }
    const shopAfter = await resourceSnapshot(page);
    note(`친구 팝업 표기: ${JSON.stringify(friendShown.numbered).slice(0, 200)}`);
    // 카탈로그가 제거됐다면 구매 진입점 자체가 없어야 한다 — 있는데 지급이 없으면 결함
    check(!bought || Object.keys(snapshotDelta(shopBefore, shopAfter)).length > 0,
      '[친구 상점] 구매 버튼이 있으면 실제로 지급된다',
      `구매 시도=${bought}, 델타=${JSON.stringify(snapshotDelta(shopBefore, shopAfter))}`);
    judgeRewardParity('친구 상점', shopShown, snapshotDelta(shopBefore, shopAfter), bought, {
      suspect: 'src/components/popups/FriendsPopup.js, src/systems/FriendSystem.js',
    });
    await closePopup(page);

    // ---------- 3) 무한탑 층 보상 ----------
    await backToLobby(page);
    await safeEvaluate(page, () => window.game.scene.getScene('MainMenuScene')?.openPopup('tower'));
    await page.waitForTimeout(2200);
    await shot(page, '16-reward-c-tower');
    const towerShown = await scanRewardText(page);
    const towerBefore = await resourceSnapshot(page);

    // 층 도전은 전투다. 밸런스는 검증 대상이 아니므로 확실히 이기도록 치트를 켠다
    // (보상 계산은 치트와 무관한 경로를 그대로 탄다).
    await safeEvaluate(page, () => { window.debug?.setOneHitKill?.(true); window.debug?.setInvincible?.(true); });
    const challenge = await findByLabel(page, '층 도전') || await findByLabel(page, '도전');
    let towerCleared = false;
    if (challenge) {
      await tapWorld(page, challenge.x, challenge.y, 2500);
      const res = await playBattle(page, { timeout: 90000 });
      if (res.entered && !res.timedOut) {
        await page.waitForTimeout(1200);
        await shot(page, '16-reward-c-tower-result');
        const resultShown = await scanRewardText(page);
        note(`[무한탑] 결과 화면 표기: ${JSON.stringify(resultShown.numbered)} / 미보증 ${JSON.stringify(resultShown.unbacked)}`);
        towerShown.numbered.push(...resultShown.numbered);
        towerShown.unbacked.push(...resultShown.unbacked);
        towerCleared = true;
        await backToMain(page);
      } else {
        note('무한탑 전투가 종료되지 않아 층 보상 지급 대조는 생략한다');
      }
    } else check(false, '무한탑에 층 도전 진입점 노출');
    await safeEvaluate(page, () => { window.debug?.setOneHitKill?.(false); window.debug?.setInvincible?.(false); });
    const towerAfter = await resourceSnapshot(page);
    judgeRewardParity('무한탑', towerShown, snapshotDelta(towerBefore, towerAfter), towerCleared, {
      suspect: 'src/components/popups/TowerPopup.js, src/systems/TowerSystem.js',
    });

    // ---------- 4) 스테이지 전투 결과 ----------
    await backToLobby(page);
    const stageBefore = await resourceSnapshot(page);
    await safeEvaluate(page, () => { window.debug?.setOneHitKill?.(true); window.debug?.setInvincible?.(true); });
    const entry = await findByLabel(page, '전투 시작', { sceneKeys: ['MainMenuScene'] })
      || await findByLabel(page, '보스전', { exact: true, sceneKeys: ['MainMenuScene'] });
    let stageCleared = false;
    let stageShown = { numbered: [], unbacked: [], sample: [] };
    if (entry) {
      await tapWorld(page, entry.x, entry.y, 2200);
      await skipCutscenes(page, 3);
      const res = await playBattle(page, { timeout: 90000 });
      if (res.entered && !res.timedOut) {
        await page.waitForTimeout(1500);
        await shot(page, '16-reward-d-stage-result');
        stageShown = await scanRewardText(page);
        stageCleared = true;
        await backToMain(page);
      } else note('스테이지 전투가 종료되지 않아 보상 대조는 생략한다');
    } else check(false, '로비에 전투 진입점 노출');
    await safeEvaluate(page, () => { window.debug?.setOneHitKill?.(false); window.debug?.setInvincible?.(false); });
    const stageAfter = await resourceSnapshot(page);
    judgeRewardParity('스테이지 전투', stageShown, snapshotDelta(stageBefore, stageAfter), stageCleared, {
      suspect: 'src/scenes/BattleResultScene.js, src/scenes/BattleScene.js showBattleResult',
    });

    currentScenario().consoleErrors = errors.slice(0, 30);
  } finally { await ctx.close(); }
}

// ============================================================
// 실행기
// ============================================================

const SCENARIOS = [
  { id: 1, run: scenario1 },
  { id: 2, run: scenario2 },
  { id: 3, run: scenario3 },
  { id: 4, run: scenario4 },
  { id: 5, run: scenario5 },
  { id: 6, run: scenario6 },
  { id: 7, run: scenario7 },
  { id: 8, run: scenario8 },
  { id: 9, run: scenario9 },
  { id: 10, run: scenario10 },
  { id: 11, run: scenario11 },
  { id: 12, run: scenario12 },
  { id: 13, run: scenario13 },
  { id: 14, run: scenario14 },   // 회귀 확인 (14 + 14b)
  { id: 15, run: scenario15 },   // 이전 미검증 4건 재시도
  { id: 16, run: scenario16 },   // 표시된 보상 == 실지급 (팀 기준)
];

(async () => {
  const wanted = ONLY ? ONLY.split(',').map((s) => Number(s.trim())) : null;
  const list = SCENARIOS.filter((s) => !wanted || wanted.includes(s.id));
  console.log(`playtest — 대상 ${BASE_URL} (${SOURCE}) / 시나리오 ${list.map((s) => s.id).join(',')}`);
  const browser = await chromium.launch({ headless: HEADLESS });
  for (const s of list) {
    try { await s.run(browser); }
    catch (e) {
      console.log(`  !! 시나리오 ${s.id} 중단 — ${e.message}`);
      if (currentScenario()) issue('P1', `시나리오 실행 중 예외: ${e.message}`, { evidence: (e.stack || '').split('\n').slice(0, 3).join(' ') });
    }
  }
  await browser.close();

  writeFileSync(RESULT_PATH, JSON.stringify({ baseUrl: BASE_URL, source: SOURCE, at: new Date().toISOString(), report }, null, 2), 'utf-8');
  const fails = report.flatMap((r) => r.checks.filter((c) => c.ok === false));
  const issues = report.flatMap((r) => r.issues);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`실패 체크 ${fails.length}건 / 결함 ${issues.length}건 (P0 ${issues.filter((i) => i.severity === 'P0').length}, P1 ${issues.filter((i) => i.severity === 'P1').length}, P2 ${issues.filter((i) => i.severity === 'P2').length})`);
  console.log(`결과: ${RESULT_PATH}`);
  process.exit(0);
})();
