/**
 * battle-cult-live.mjs — 교단 메커니즘이 실플레이에 반영되는지 e2e 실증 (MECH-02 / BattleSystem 통합)
 *
 * 검증 내용
 *   게스트 로그인 → 올림푸스 전직영웅(asc_iris_olympus / asc_leon_olympus) 지급
 *   → 1-4 출격(컷씬 스킵) → 전투 진입
 *   → 배틀러가 BattleUnit인지(= 판정이 BattleSystem을 지나는지)
 *   → Divine Charge 게이지(cultState.divinity)가 실제로 쌓이는지
 *   → Lightning Strike가 전투 로그에 뜨는지
 *   → 전투가 끝까지 진행되어 BattleResultScene으로 넘어가는지
 *   → 배지 + 로그가 함께 보이는 순간을 캡처
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/battle-cult-live.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = new URL('../../docs/redesign/screenshots/after/', import.meta.url);
const VIEWPORT = { width: 720, height: 1280 };
const SAVE_KEY = 'arcane_collectors_save';
/** 올림푸스 전직영웅 — Divine Charge / Lightning Strike 보유 */
const OLYMPUS_HEROES = ['asc_iris_olympus', 'asc_leon_olympus'];
/** 전투 관측 상한 (배속 3배 기준 충분) */
const OBSERVE_TIMEOUT_MS = 90000;
/** 관측용 스테이지 — Divine Charge(기본 7타) 가 찰 만큼 길게 버티는 구간 */
const CHAPTER = Number(process.env.CULT_SMOKE_CHAPTER || 1);
const STAGE_ID = process.env.CULT_SMOKE_STAGE || '1-4';
/** 지급 레벨 — 보스를 상대로 Divine Charge가 찰 때까지 버틸 만큼 */
const HERO_LEVEL = Number(process.env.CULT_SMOKE_LEVEL || 60);
/** 화면 로그에 뜨는 Lightning Strike 표기 (BattleSceneAdapter.CULT_EFFECT_LABELS) */
const LIGHTNING_SCREEN_LABEL = '뇌격 심판';

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

async function waitFor(page, fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await page.evaluate(fn)) return true;
    } catch {
      // 씬 전환 중 실행 컨텍스트가 잠깐 사라질 수 있다 — 다음 폴링에서 다시 시도
    }
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

  // 분위기 없는 유닛(기본영웅)이 연출/상성 조회에서 터지면 그 턴의 피해 판정이 통째로 사라진다.
  // 회귀 감시용으로 해당 콘솔 문구를 모은다.
  const vfxErrors = [];
  /** 전투 구간에서 뜬 console.error / console.warn 전량 (연출 회귀 감시) */
  const consoleIssues = [];
  let watchConsole = false;
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Animation error') || text.includes('Mood matchup error')) vfxErrors.push(text);
    if (watchConsole && (msg.type() === 'error' || msg.type() === 'warning')) consoleIssues.push(text);
  });

  try {
    console.log(`\n=== 교단 메커니즘 실플레이 스모크 (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(3000);

    // 1. 게스트 로그인
    const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'));
    assert(loginReady, 'LoginScene 활성화');
    await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
    assert(await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000),
      '게스트 로그인 → MainMenuScene');

    // 2. 올림푸스 전직영웅 지급 (세이브 직접 주입 후 재기동)
    const granted = await page.evaluate(({ key, heroes, level }) => {
      const save = JSON.parse(localStorage.getItem(key) || '{}');
      save.characters = save.characters || [];
      heroes.forEach((id, index) => {
        if (save.characters.some(c => c.characterId === id)) return;
        save.characters.push({
          id,
          instanceId: `${id}_e2e_${index}`,
          characterId: id,
          level,
          exp: 0,
          stars: 4,
          skillLevels: [1, 1, 1],
          equipped: null,
          equipment: { weapon: null, armor: null, accessory: null }
        });
      });
      localStorage.setItem(key, JSON.stringify(save));
      return save.characters.map(c => c.characterId);
    }, { key: SAVE_KEY, heroes: OLYMPUS_HEROES, level: HERO_LEVEL });
    assert(OLYMPUS_HEROES.every(id => granted.includes(id)), '올림푸스 전직영웅 2인 지급', granted.join(','));

    await page.reload();
    await page.waitForTimeout(3000);
    if (await page.evaluate(() => !!window.game?.scene.isActive('LoginScene'))) {
      await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
    }
    assert(await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000),
      '재기동 후 MainMenuScene 복귀');

    // 3. 출격
    await page.evaluate(() => {
      window.game.scene.getScene('MainMenuScene').scene.start('StageSelectScene');
    });
    assert(await waitFor(page, () => !!window.game?.scene.isActive('StageSelectScene')), 'StageSelectScene 진입');
    await page.waitForTimeout(600);

    const launched = await page.evaluate(({ chapter, stageId }) => {
      const scene = window.game.scene.getScene('StageSelectScene');
      const stage = scene.generateStages(chapter).find((s) => s.id === stageId);
      if (!stage) return null;
      scene.selectedStage = stage;
      scene.showPartySelect();
      scene.autoFillParty();
      const party = scene.partySlots.filter(sl => sl.hero).map(sl => sl.hero.id);
      scene.startBattle();
      return party;
    }, { chapter: CHAPTER, stageId: STAGE_ID });
    assert(Array.isArray(launched) && launched.length > 0, `${STAGE_ID} 출격 실행`, String(launched));
    assert(launched.some(id => OLYMPUS_HEROES.includes(id)), '파티에 올림푸스 전직영웅 편성', String(launched));

    // 4. 컷씬 전체 건너뛰기
    if (await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'), 8000)) {
      await page.evaluate(() => {
        window.game.scene.getScene('CutsceneScene')?.player?.skipAll?.();
      });
      await waitFor(page, () => !window.game?.scene.isActive('CutsceneScene'), 8000);
    }

    const battleUp = await waitFor(page, () => !!window.game?.scene.isActive('BattleScene'), 20000);
    assert(battleUp, '전투 진입');
    watchConsole = true; // 여기서부터 전투 구간

    // 5. 배틀러가 BattleUnit인가 = 판정이 BattleSystem을 지나는가
    await page.waitForTimeout(1500);
    const wiring = await page.evaluate(() => {
      const scene = window.game.scene.getScene('BattleScene');
      const unit = scene.allies?.[0];
      return {
        hasBattleSystem: !!scene.battleSystem,
        sharesAllies: scene.battleSystem?.allies === scene.allies,
        sharesEnemies: scene.battleSystem?.enemies === scene.enemies,
        unitHasTakeDamage: typeof unit?.takeDamage === 'function',
        unitHasCultState: !!unit?.cultState,
        cults: scene.allies.map(a => a.cult),
        moods: scene.allies.map(a => a.mood)
      };
    });
    assert(wiring.hasBattleSystem, 'BattleScene에 BattleSystem 부착');
    assert(wiring.sharesAllies && wiring.sharesEnemies, 'BattleSystem이 씬 배틀러 배열을 그대로 사용');
    assert(wiring.unitHasTakeDamage, '배틀러가 BattleUnit 계약(takeDamage) 보유');
    assert(wiring.unitHasCultState, '배틀러가 교단 런타임 상태(cultState) 보유');
    assert(wiring.cults.includes('olympus'), '아군 교단 소속 보존(olympus)', String(wiring.cults));
    assert(wiring.moods.includes('neutral'), '분위기 없는 기본영웅이 파티에 포함 (회귀 감시 조건)', String(wiring.moods));

    // 5-b. 수동 스킬 경로도 같은 판정을 지나는가 (executeManualSkill → resolveDamage)
    const manualStart = await page.evaluate(() => {
      const scene = window.game.scene.getScene('BattleScene');
      const attacker = scene.allies.find(a => a.isAlive);
      const target = scene.enemies.find(e => e.isAlive);
      if (!attacker || !target) return null;
      scene._e2eManualBefore = scene.enemies.reduce((sum, e) => sum + e.currentHp, 0);
      scene.executeManualSkill(attacker, target);
      return { skill: (attacker.skills.find(sk => sk.id === 'skill1') || attacker.skills[1])?.name || null };
    }).catch(err => ({ error: err.message }));
    await page.waitForTimeout(1200); // AoE 스킬은 대상마다 지연 호출로 퍼진다
    const manual = await page.evaluate(() => {
      const scene = window.game.scene.getScene('BattleScene');
      const after = scene.enemies.reduce((sum, e) => sum + e.currentHp, 0);
      return { before: scene._e2eManualBefore, after, damaged: after < scene._e2eManualBefore };
    }).catch(err => ({ error: err.message }));
    assert(manual && !manual.error && manual.damaged, '수동 스킬 발동이 실제 피해로 이어짐',
      JSON.stringify({ ...manualStart, ...manual }));

    // 6. 전투 관측 — 배속 3배로 올리고 Divine Charge / Lightning Strike 를 지켜본다
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('BattleScene');
      scene.battleSpeed = 3;
      scene.autoBattle = true;
    });

    let maxDivinity = 0;
    let lightningLogged = false;
    let captured = false;
    let anyBadge = false;
    let battleFinished = false;
    let lastTurn = 0;
    let lastSystemLog = [];
    const start = Date.now();

    while (Date.now() - start < OBSERVE_TIMEOUT_MS) {
      let snapshot;
      try {
        snapshot = await page.evaluate(() => {
          const scene = window.game.scene.getScene('BattleScene');
          if (!scene || !window.game.scene.isActive('BattleScene')) return { gone: true };
          const units = [...(scene.allies || []), ...(scene.enemies || [])];
          return {
            gone: false,
            turn: scene.turn,
            ended: !!scene.battleEnded,
            logs: scene.battleLogs || [],
            systemLog: (scene.battleSystem?.battleLog || []).slice(-40).map(e => e.message),
            divinity: Math.max(0, ...units.map(u => u.cultState?.divinity || 0)),
            badges: units.filter(u => {
              const st = u.cultState;
              if (!st) return false;
              return st.divinity > 0 || st.doom > 0 || st.barrier > 0 ||
                (st.runes || []).length > 0 || (st.statuses || []).length > 0;
            }).length
          };
        });
      } catch {
        // 결과 화면으로 넘어가며 실행 컨텍스트가 사라진 경우
        battleFinished = true;
        break;
      }

      if (snapshot.gone) { battleFinished = true; break; }

      maxDivinity = Math.max(maxDivinity, snapshot.divinity);
      lastTurn = snapshot.turn;
      lastSystemLog = snapshot.systemLog || lastSystemLog;
      anyBadge = anyBadge || snapshot.badges > 0;
      // 화면 로그는 한국어 표기(번개 심판), 판정 로그는 내부 토큰(lightning_strike)
      const hasLightning = (snapshot.logs || []).some(line => line.includes(LIGHTNING_SCREEN_LABEL));
      lightningLogged = lightningLogged ||
        hasLightning ||
        (snapshot.systemLog || []).some(line => line.includes('lightning_strike'));

      // 배지와 로그가 동시에 보이는 순간을 잡는다
      if (!captured && hasLightning && snapshot.badges > 0) {
        await page.screenshot({ path: new URL('battle-cult-live.png', SHOT_DIR).pathname.slice(1) });
        captured = true;
        console.log('   📸 docs/redesign/screenshots/after/battle-cult-live.png');
      }

      if (snapshot.ended) { battleFinished = true; }
      await page.waitForTimeout(200);
      if (battleFinished) break;
    }

    assert(maxDivinity > 0, 'Divine Charge 게이지가 실제로 누적됨', `max=${maxDivinity}`);
    assert(anyBadge, '교단 배지 조건(cultState 값) 발생');
    assert(lightningLogged, 'Lightning Strike가 전투 로그에 기록됨',
      `maxDivinity=${maxDivinity} lastTurn=${lastTurn} systemLogTail=${(lastSystemLog || []).slice(-6).join(' / ')}`);
    assert(captured, '배지 + Lightning Strike 로그 동시 캡처');

    // 7. 전투 완주 — 결과 화면 도달 (클리어 컷씬이 끼면 건너뛴다)
    for (let i = 0; i < 4; i += 1) {
      if (await page.evaluate(() => !!window.game?.scene.isActive('BattleResultScene')).catch(() => false)) break;
      if (await page.evaluate(() => !!window.game?.scene.isActive('CutsceneScene')).catch(() => false)) {
        await page.evaluate(() => window.game.scene.getScene('CutsceneScene')?.player?.skipAll?.());
      }
      await page.waitForTimeout(1500);
    }
    const resultUp = await waitFor(page, () => !!window.game?.scene.isActive('BattleResultScene'), 60000);
    const diag = await page.evaluate(() => {
      const scene = window.game.scene.getScene('BattleScene');
      return {
        active: window.game.scene.scenes.filter(sc => sc.scene.isActive()).map(sc => sc.scene.key),
        turn: scene?.turn ?? null,
        ended: scene?.battleEnded ?? null,
        processing: scene?.isProcessingTurn ?? null,
        alliesAlive: (scene?.allies || []).filter(a => a.isAlive).length,
        enemiesAlive: (scene?.enemies || []).filter(e => e.isAlive).length
      };
    }).catch(() => ({}));
    assert(resultUp, '전투 완주 → BattleResultScene 진입', JSON.stringify(diag));

    watchConsole = false;
    assert(vfxErrors.length === 0, '연출/상성 오류 0건 (neutral 분위기 유닛 포함)',
      [...new Set(vfxErrors)].slice(0, 3).join(' | '));
    const distinctIssues = [...new Set(consoleIssues.map(t => t.split(String.fromCharCode(10))[0]))];
    assert(distinctIssues.length === 0, '전투 구간 console error/warn 0건',
      distinctIssues.slice(0, 5).join(' | '));
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
