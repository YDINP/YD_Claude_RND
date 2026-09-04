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
/** 마이그레이션 전 레거시 세이브가 쓰던 id (portrait-mapping.json → hero_001~004) */
const LEGACY_HEROES = ['char_1', 'char_2', 'char_3', 'char_4'];
/** MECH-03 확인용 — 네이처 전직영웅(Growth Ring 스택이 매 턴 쌓여 GROW 배지가 뜬다) */
const NATURE_HERO = 'asc_sol_nature';
/** 지급 대상 전체 */
const GRANT_HEROES = [...OLYMPUS_HEROES, NATURE_HERO];
/** MECH-03 배지 약어 (battleLayout CULT_BADGE_DEFS) */
const GROWTH_BADGE_LABEL = 'GROW';
/** 전투 관측 상한 (배속 3배 기준 충분) */
const OBSERVE_TIMEOUT_MS = 90000;
/** 관측용 스테이지 — Divine Charge(기본 7타) 가 찰 만큼 길게 버티는 구간 */
// 1-4는 만렙 전직영웅 4인에게 너무 짧아(4턴) Divine Charge(기본 7타)가 차기 전에 끝나고,
// 3-1은 반대로 파티가 전멸한다. 2-3이 관측 창을 안정적으로 열어 준다.
const CHAPTER = Number(process.env.CULT_SMOKE_CHAPTER || 2);
const STAGE_ID = process.env.CULT_SMOKE_STAGE || '2-3';
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

async function waitFor(page, fn, timeout = 30000) {
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

/**
 * 떠 있는 컷씬을 모두 건너뛴다.
 * 세이브가 있는 상태로 재기동하면 프롤로그 컷씬이 MainMenuScene을 일시정지시킨 채
 * 유지되어 `isActive('MainMenuScene')`가 false가 된다.
 *
 * @param {import('playwright').Page} page
 * @param {number} [rounds]
 */
async function skipCutscenes(page, rounds = 6) {
  for (let i = 0; i < rounds; i += 1) {
    const up = await page.evaluate(() => !!window.game?.scene.isActive('CutsceneScene')).catch(() => false);
    if (!up) return;
    // player가 아직 붙기 전이면 skipAll이 없다 — 그때는 실제 사용자 동작(화면 탭)으로 넘긴다
    const skipped = await page.evaluate(() => {
      const player = window.game?.scene.getScene('CutsceneScene')?.player;
      if (typeof player?.skipAll !== 'function') return false;
      player.skipAll();
      return true;
    }).catch(() => false);
    if (!skipped) {
      await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2).catch(() => {});
    }
    await page.waitForTimeout(600);
  }
}

/**
 * 전투 화면의 아군 표시가 실제 포트레이트 이미지인지 검사한다.
 * 캔버스 플레이스홀더나 벡터 아이콘 텍스처(icon_*)가 섞이면 실패로 본다.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{units:Array, cards:Array}>}
 */
async function inspectAllyPortraits(page) {
  return page.evaluate(() => {
    const g = window.game;
    const scene = g?.scene.getScene('BattleScene');
    // 재기동/씬 전환 중이면 검사할 대상 자체가 없다 — 빈 결과로 안전 종료한다
    if (!g || !scene) return { units: [], cards: [] };
    const describe = (image) => {
      const key = image?.texture?.key ?? null;
      if (!key || !g.textures.exists(key)) return { key, ok: false, reason: 'missing' };
      const src = g.textures.get(key).source[0];
      const isCanvas = src?.image?.tagName === 'CANVAS';
      const isVector = key.startsWith('icon_') || key.startsWith('vec_');
      return {
        key,
        w: src?.width ?? 0,
        h: src?.height ?? 0,
        ok: !isCanvas && !isVector,
        reason: isCanvas ? 'canvas' : (isVector ? 'vector' : 'image')
      };
    };
    return {
      units: (scene.allySprites || []).map(c => describe(c.getData('sprite'))),
      cards: (scene.skillCards || []).map(c => describe(c.getData('portrait')))
    };
  });
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
    // 부팅 시간은 머신 부하에 따라 크게 흔들린다(측정 13초+). 고정 대기 대신 준비를 기다린다.
    await waitFor(page, () => !!window.game);

    // 1. 게스트 로그인
    const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'));
    assert(loginReady, 'LoginScene 활성화');
    await page.evaluate(() => window.game?.scene.getScene('LoginScene')?._handleGuestLogin?.());
    assert(await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 30000),
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
    }, { key: SAVE_KEY, heroes: GRANT_HEROES, level: HERO_LEVEL });
    assert(GRANT_HEROES.every(id => granted.includes(id)), '전직영웅 3인 지급(올림푸스 2 + 네이처 1)', granted.join(','));

    await page.reload();
    await waitFor(page, () => !!window.game);
    // 자동 로그인이면 LoginScene을 건너뛴다 — 둘 중 어느 쪽이든 뜰 때까지만 기다린다
    await waitFor(page, () => !!window.game?.scene.isActive('LoginScene') ||
      !!window.game?.scene.getScene('MainMenuScene')?.scene.isActive() ||
      !!window.game?.scene.isActive('CutsceneScene'), 30000);
    if (await page.evaluate(() => !!window.game?.scene.isActive('LoginScene')).catch(() => false)) {
      await page.evaluate(() => window.game?.scene.getScene('LoginScene')?._handleGuestLogin?.());
    }
    await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene') ||
      !!window.game?.scene.isActive('CutsceneScene'), 30000);
    await skipCutscenes(page);
    assert(await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 30000),
      '재기동 후 MainMenuScene 복귀');

    // 3. 출격
    await page.evaluate(() => {
      window.game?.scene.getScene('MainMenuScene')?.scene.start('StageSelectScene');
    });
    assert(await waitFor(page, () => !!window.game?.scene.isActive('StageSelectScene')), 'StageSelectScene 진입');
    await page.waitForTimeout(600);

    const launched = await page.evaluate(({ chapter, stageId }) => {
      const scene = window.game?.scene.getScene('StageSelectScene');
      if (!scene) return null;
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
    assert(launched.includes(NATURE_HERO), '파티에 네이처 전직영웅 편성 (MECH-03)', String(launched));

    // 4. 컷씬을 건너뛰며 전투 진입을 기다린다 — 챕터/스테이지 진입 컷씬이 연달아 뜰 수 있다
    let battleUp = false;
    const enterDeadline = Date.now() + 60000;
    while (Date.now() < enterDeadline) {
      battleUp = await page.evaluate(() => !!window.game?.scene.isActive('BattleScene')).catch(() => false);
      if (battleUp) break;

      const cutsceneUp = await page.evaluate(() => !!window.game?.scene.isActive('CutsceneScene')).catch(() => false);
      if (cutsceneUp) {
        await skipCutscenes(page, 3);
      } else {
        // 컷씬도 없고 전투도 아니면 출격 자체가 삼켜진 것이다 — 한 번 더 눌러 본다
        await page.evaluate(() => {
          const scene = window.game?.scene.getScene('StageSelectScene');
          if (scene?.scene.isActive() && scene.selectedStage) scene.startBattle();
        }).catch(() => {});
      }
      await page.waitForTimeout(700);
    }
    const enterDiag = battleUp ? '' : JSON.stringify(await page.evaluate(() => ({
      active: window.game?.scene.scenes.filter(sc => sc.scene.isActive()).map(sc => sc.scene.key),
      energy: window.game?.registry.get('energy') ?? null,
      message: window.game?.scene.getScene('StageSelectScene')?.messageText?.text ?? null
    })).catch(() => ({})));
    assert(battleUp, '전투 진입', enterDiag);
    // 진입에 실패하면 이후 검증은 전부 의미가 없다 — 실패 하나로 끝낸다
    if (!battleUp) throw new Error(`전투 진입 실패 ${enterDiag}`);
    watchConsole = true; // 여기서부터 전투 구간

    // 5. 배틀러가 BattleUnit인가 = 판정이 BattleSystem을 지나는가
    await page.waitForTimeout(1500);
    const wiring = await page.evaluate(() => {
      const scene = window.game?.scene.getScene('BattleScene');
      if (!scene) return { gone: true, cults: [], moods: [] };
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

    // 5-a. 아군 표시가 벡터 아이콘·플레이스홀더가 아니라 실제 포트레이트인가 (v2 신규 세이브)
    const portraits = await inspectAllyPortraits(page);
    const badUnits = portraits.units.filter(u => !u.ok);
    const badCards = portraits.cards.filter(c => !c.ok);
    assert(portraits.units.length > 0 && badUnits.length === 0,
      '[v2] 아군 배틀러가 실제 포트레이트 이미지',
      JSON.stringify(portraits.units));
    assert(portraits.cards.length > 0 && badCards.length === 0,
      '[v2] 하단 스킬카드가 실제 포트레이트 이미지 (벡터 아이콘 아님)',
      JSON.stringify(portraits.cards));

    // 5-b. 수동 스킬 경로도 같은 판정을 지나는가 (executeManualSkill → resolveDamage)
    const manualStart = await page.evaluate(() => {
      const scene = window.game?.scene.getScene('BattleScene');
      if (!scene) return null;
      // 기본영웅은 스킬이 없다 — skill1을 실제로 가진 아군을 고른다
      const hasSkill1 = (u) => !!(u.skills || []).find(sk => sk.id === 'skill1') || (u.skills || []).length > 1;
      const attacker = scene.allies.find(a => a.isAlive && hasSkill1(a)) || scene.allies.find(a => a.isAlive);
      const target = scene.enemies.find(e => e.isAlive);
      if (!attacker || !target) return null;
      scene._e2eManualBefore = scene.enemies.reduce((sum, e) => sum + e.currentHp, 0);
      scene.executeManualSkill(attacker, target);
      return { skill: (attacker.skills.find(sk => sk.id === 'skill1') || attacker.skills[1])?.name || null };
    }).catch(err => ({ error: err.message }));
    await page.waitForTimeout(1200); // AoE 스킬은 대상마다 지연 호출로 퍼진다
    const manual = await page.evaluate(() => {
      const scene = window.game?.scene.getScene('BattleScene');
      if (!scene) return { error: 'BattleScene 없음' };
      const after = scene.enemies.reduce((sum, e) => sum + e.currentHp, 0);
      return { before: scene._e2eManualBefore, after, damaged: after < scene._e2eManualBefore };
    }).catch(err => ({ error: err.message }));
    assert(manual && !manual.error && manual.damaged, '수동 스킬 발동이 실제 피해로 이어짐',
      JSON.stringify({ ...manualStart, ...manual }));

    // 6. 전투 관측 — 배속 3배로 올리고 Divine Charge / Lightning Strike 를 지켜본다
    await page.evaluate(() => {
      const scene = window.game?.scene.getScene('BattleScene');
      if (!scene) return;
      scene.battleSpeed = 3;
      scene.autoBattle = true;
    });

    let maxDivinity = 0;
    const seenBadgeLabels = new Set();
    let lightningLogged = false;
    let captured = false;
    let anyBadge = false;
    let battleFinished = false;
    let lastTurn = 0;
    let lastSystemLog = [];
    /** 화면 로그에 뜬 전체 줄 (스킬 키값 노출 감시용) */
    const seenLogLines = new Set();
    const start = Date.now();

    while (Date.now() - start < OBSERVE_TIMEOUT_MS) {
      let snapshot;
      try {
        snapshot = await page.evaluate(() => {
          const scene = window.game?.scene.getScene('BattleScene');
          if (!scene || !window.game?.scene.isActive('BattleScene')) return { gone: true };
          const units = [...(scene.allies || []), ...(scene.enemies || [])];
          return {
            gone: false,
            turn: scene.turn,
            ended: !!scene.battleEnded,
            logs: scene.battleLogs || [],
            systemLog: (scene.battleSystem?.battleLog || []).slice(-40).map(e => e.message),
            divinity: Math.max(0, ...units.map(u => u.cultState?.divinity || 0)),
            maxGrowth: Math.max(0, ...units.map(u => u.cultState?.growth || 0)),
            // 실제로 화면에 그려진 배지 텍스트 (BattleScene.renderCultBadges)
            badgeLabels: [...(scene.allySprites || []), ...(scene.enemySprites || [])]
              .filter(Boolean)
              .flatMap(c => (c.getData?.('badgeLayer')?.list || [])
                .filter(o => typeof o.text === 'string')
                .map(o => o.text)),
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
      (snapshot.logs || []).forEach(line => seenLogLines.add(line));
      (snapshot.badgeLabels || []).forEach(label => seenBadgeLabels.add(label));
      lastTurn = snapshot.turn;
      lastSystemLog = snapshot.systemLog || lastSystemLog;
      anyBadge = anyBadge || snapshot.badges > 0;
      // 화면 로그는 한국어 표기(뇌격 심판), 판정 로그는 내부 토큰(lightning_strike).
      // 화면 로그 대역은 2줄만 남으므로, 발동 순간 포착은 잘리지 않는 판정 로그로 잡는다.
      const hasLightning = (snapshot.logs || []).some(line => line.includes(LIGHTNING_SCREEN_LABEL));
      const systemLightning = (snapshot.systemLog || []).some(line => line.includes('lightning_strike'));
      const justFired = systemLightning && !lightningLogged;
      lightningLogged = lightningLogged || hasLightning || systemLightning;

      // 배지와 로그가 동시에 보이는 순간을 잡는다.
      // 화면 로그 대역은 2줄만 유지하므로 짧은 간격으로 훑어야 놓치지 않는다.
      const badgeVisible = snapshot.badges > 0 || (snapshot.badgeLabels || []).length > 0;
      if (!captured && (hasLightning || justFired) && badgeVisible) {
        await page.screenshot({ path: new URL('battle-cult-live.png', SHOT_DIR).pathname.slice(1) });
        captured = true;
        console.log('   📸 docs/redesign/screenshots/after/battle-cult-live.png');
      }

      if (snapshot.ended) { battleFinished = true; }
      await page.waitForTimeout(120);
      if (battleFinished) break;
    }

    assert(maxDivinity > 0, 'Divine Charge 게이지가 실제로 누적됨', `max=${maxDivinity}`);
    assert(anyBadge, '교단 배지 조건(cultState 값) 발생');
    assert([...seenBadgeLabels].some(label => label.startsWith(GROWTH_BADGE_LABEL)),
      'MECH-03 네이처 배지(GROW)가 화면에 실제로 표시됨', [...seenBadgeLabels].join(' | '));
    assert(lightningLogged, 'Lightning Strike가 전투 로그에 기록됨',
      `maxDivinity=${maxDivinity} lastTurn=${lastTurn} systemLogTail=${(lastSystemLog || []).slice(-6).join(' / ')}`);
    assert(captured, '배지 + Lightning Strike 로그 동시 캡처');

    // 7. 전투 완주 — 결과 화면 도달 (클리어 컷씬이 끼면 건너뛴다)
    for (let i = 0; i < 4; i += 1) {
      if (await page.evaluate(() => !!window.game?.scene.isActive('BattleResultScene')).catch(() => false)) break;
      await skipCutscenes(page, 2);
      await page.waitForTimeout(1500);
    }
    const resultUp = await waitFor(page, () => !!window.game?.scene.isActive('BattleResultScene'), 60000);
    const diag = await page.evaluate(() => {
      const scene = window.game?.scene.getScene('BattleScene');
      return {
        active: (window.game?.scene.scenes || []).filter(sc => sc.scene.isActive()).map(sc => sc.scene.key),
        turn: scene?.turn ?? null,
        ended: scene?.battleEnded ?? null,
        processing: scene?.isProcessingTurn ?? null,
        alliesAlive: (scene?.allies || []).filter(a => a.isAlive).length,
        enemiesAlive: (scene?.enemies || []).filter(e => e.isAlive).length
      };
    }).catch(() => ({}));
    assert(resultUp, '전투 완주 → BattleResultScene 진입', JSON.stringify(diag));

    watchConsole = false;

    // 스킬 id가 표시명 자리에 새면 `skill_talon_strike` 같은 토큰이 로그에 그대로 뜬다
    const idLikeToken = /(^|\s)[a-z0-9]+(_[a-z0-9]+)+(\s|!|$)/;
    const leakedLines = [...seenLogLines].filter(line => idLikeToken.test(line));
    assert(seenLogLines.size > 0, '전투 로그 수집됨', `${seenLogLines.size}줄`);
    const skillLines = [...seenLogLines].filter(line => line.includes('의 ') && !line.includes('기본 공격'));
    console.log(`   로그 표본: ${(skillLines.length ? skillLines : [...seenLogLines]).slice(0, 5).join(' / ')}`);
    assert(leakedLines.length === 0, '전투 로그에 스킬 키값(밑줄 토큰) 노출 0건',
      leakedLines.slice(0, 3).join(' | '));

    assert(vfxErrors.length === 0, '연출/상성 오류 0건 (neutral 분위기 유닛 포함)',
      [...new Set(vfxErrors)].slice(0, 3).join(' | '));
    const distinctIssues = [...new Set(consoleIssues.map(t => t.split(String.fromCharCode(10))[0]))];
    assert(distinctIssues.length === 0, '전투 구간 console error/warn 0건',
      distinctIssues.slice(0, 5).join(' | '));
    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));

    // 9. 레거시(v1) 세이브 회귀 — char_1~4 로만 구성된 파티도 실제 포트레이트로 올라오는가.
    //    이 id 들은 portrait-mapping.json 이 hero_001~004 로 잇지만, 마이그레이션 전
    //    세이브는 PreloadScene 의 로스터에 없어 플레이스홀더가 먼저 구워질 수 있다.
    watchConsole = false;
    await page.evaluate(({ key, heroes }) => {
      const save = JSON.parse(localStorage.getItem(key) || '{}');
      save.characters = heroes.map((id, index) => ({
        id,
        instanceId: `${id}_legacy_${index}`,
        characterId: id,
        level: 30,
        exp: 0,
        stars: 3,
        skillLevels: [1, 1, 1],
        equipped: null,
        equipment: { weapon: null, armor: null, accessory: null }
      }));
      save.parties = [{ heroIds: heroes }];
      localStorage.setItem(key, JSON.stringify(save));
    }, { key: SAVE_KEY, heroes: LEGACY_HEROES });

    await page.reload();
    // 재기동 직후에는 window.game 이 아직 없다. 존재를 먼저 기다려야
    // 아래 evaluate 들이 undefined 접근으로 터지지 않는다.
    await waitFor(page, () => !!window.game, 25000);
    if (await page.evaluate(() => !!window.game?.scene.isActive('LoginScene')).catch(() => false)) {
      await page.evaluate(() => window.game?.scene.getScene('LoginScene')?._handleGuestLogin?.());
    }
    await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 25000);

    await page.evaluate(() => {
      const g = window.game;
      if (!g) return;
      g.scene.getScenes(true).forEach(sc => { if (sc.scene.key !== 'BattleScene') g.scene.stop(sc.scene.key); });
      g.scene.start('BattleScene', {
        stage: { id: '1-2', chapter: 1, name: '울창한 숲길', enemies: [{ id: 'enemy_goblin', level: 2 }] }
      });
    });
    const legacyBattle = await waitFor(page, () => !!window.game?.scene.isActive('BattleScene'), 20000);
    assert(legacyBattle, '[v1] 레거시 세이브로 전투 진입');
    await page.waitForTimeout(3000);

    const legacy = await inspectAllyPortraits(page);
    assert(legacy.units.length > 0 && legacy.units.every(u => u.ok),
      '[v1] 레거시 char_1~4 아군이 실제 포트레이트 이미지',
      JSON.stringify(legacy.units));
    assert(legacy.cards.length > 0 && legacy.cards.every(c => c.ok),
      '[v1] 레거시 하단 스킬카드가 실제 포트레이트 이미지',
      JSON.stringify(legacy.cards));
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
