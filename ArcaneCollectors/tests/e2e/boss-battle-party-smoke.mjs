/**
 * boss-battle-party-smoke.mjs — 로비 [보스전] 파티 스탯 SSOT 회귀 테스트 (P0)
 *
 * 배경
 *   `MainMenuScene.prepareBossBattle()`이 legacy `getCharacter()`(characters.json 전용)로
 *   파티를 재구성해 base_/asc_ 접두 ID(예: base_iris)를 못 찾고, 전투에 `name:"base_iris"`,
 *   `maxHp:100`, `atk:12` 같은 껍데기 폴백 유닛이 들어가던 결함(P0). 원인 수정만으로는
 *   부족하다 — static 데이터를 찾더라도 레벨1 원본 템플릿 스탯을 그대로 꽂으면 레벨 20
 *   아이리스가 레벨 1 스탯으로 싸운다. 이 스모크는 그 두 결함을 모두 잡는다.
 *
 * 검증 내용
 *   1) 신규 게스트 → base_iris를 레벨업(경험치 대량 지급)
 *   2) 로비 [보스전] 진입(prepareBossBattle, 실제 버튼과 동일한 경로)
 *   3) BattleScene.party / allies의 스탯이 ProgressionSystem.getFinalStats() 결과와 일치
 *      (합격 기준 — 팀리드 요청)
 *   4) 이름이 ID 노출("base_iris")이 아니라 실제 표시명으로 뜬다
 *
 * 사전 조건: 개발 서버 실행 중 (npm run dev → http://localhost:3000)
 * 실행: node tests/e2e/boss-battle-party-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';

import { blockHmr } from './hmr-guard.mjs';
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
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

async function waitFor(page, fn, timeout = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

async function run() {
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });

  await blockHmr(page, BASE_URL);
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n=== 보스전 파티 스탯 SSOT 스모크 (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(3000);

    const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'));
    assert(loginReady, 'LoginScene 활성화');
    if (!loginReady) throw new Error('부팅 실패');

    await page.evaluate(() => window.game.scene.getScene('LoginScene')._handleGuestLogin());
    const mainMenuReady = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'));
    assert(mainMenuReady, '신규 게스트 로그인 → MainMenuScene');
    await page.waitForTimeout(800);

    // 신규 게스트는 MainMenuScene 진입 즉시 온보딩 튜토리얼(T-01 chapter_enter 등)이
    // 자동 재생되며 CutsceneScene이 씬을 계속 점유한다. 이 스모크는 튜토리얼이 아니라
    // "이미 튜토리얼을 끝낸 유저가 보스전 버튼을 누른" 시나리오(P0 리포트 그대로)를
    // 재현하는 게 목적이므로, 세이브에 tutorial.completed=true 를 심고 재부팅해 건너뛴다.
    // (onboarding-full.mjs가 튜토리얼 자체의 컷씬 흐름은 이미 별도로 검증한다)
    await page.evaluate(async () => {
      const { SaveManager } = await import('/src/systems/SaveManager.js');
      const save = SaveManager.load();
      save.tutorial = save.tutorial || {};
      save.tutorial.completed = true;
      save.tutorial.completedAt = Date.now();
      SaveManager.save(save);
    });
    await page.reload();
    await page.waitForTimeout(3000);
    if (await page.evaluate(() => !!window.game?.scene.isActive('LoginScene'))) {
      await page.evaluate(() => window.game.scene.getScene('LoginScene')._handleGuestLogin());
    }
    const reloaded = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'));
    assert(reloaded, '튜토리얼 완료 세이브로 재부팅 → MainMenuScene');
    await page.waitForTimeout(800);
    const cutsceneBlocking = await page.evaluate(() => !!window.game?.scene.isActive('CutsceneScene'));
    assert(!cutsceneBlocking, '온보딩 컷씬이 더 이상 자동 재생되지 않음(튜토리얼 완료 처리됨)');

    // 레벨 1 그대로면 "레벨1 원본 템플릿 스탯"과 "getFinalStats() 결과"가 우연히 같아져
    // 두 번째 결함(스탯 소스 미통일)을 못 잡는다. 버그 리포트의 Lv.20 시나리오를 재현한다.
    const leveledUp = await page.evaluate(async () => {
      const { ProgressionSystem } = await import('/src/systems/ProgressionSystem.js');
      const result = ProgressionSystem.addExp('base_iris', 999999);
      return result;
    });
    assert(leveledUp?.success && leveledUp.newLevel > 1, 'base_iris 레벨업 성공', JSON.stringify(leveledUp));

    // registry.ownedHeroes는 로그인 시점 스냅샷이라 addExp()만으로는 갱신되지 않는다.
    // 실제 플레이에서는 성장 화면(HeroDetailScene)이 레벨업 직후 이 registry를 다시 채운다
    // (HeroDetailScene.js — 레벨업/진화 후 registry.set('ownedHeroes', ...)). 그 흐름을 재현한다.
    await page.evaluate(async () => {
      const { normalizeHeroes } = await import('/src/data/index.js');
      const { SaveManager } = await import('/src/systems/SaveManager.js');
      const save = SaveManager.load();
      window.game.scene.getScene('MainMenuScene').registry.set('ownedHeroes', normalizeHeroes(save.characters || []));
    });

    const expected = await page.evaluate(async () => {
      const { ProgressionSystem } = await import('/src/systems/ProgressionSystem.js');
      const { SaveManager } = await import('/src/systems/SaveManager.js');
      const owned = SaveManager.getCharacter('base_iris');
      return { stats: ProgressionSystem.getFinalStats(owned), level: owned.level };
    });
    assert(expected.stats && expected.stats.hp > 0, 'ProgressionSystem.getFinalStats() 기준값 확보', JSON.stringify(expected));

    // --- 로비 [보스전] 진입 (실제 버튼과 동일한 경로: MainMenuScene.prepareBossBattle) ---
    await page.evaluate(() => {
      window.game.scene.getScene('MainMenuScene').prepareBossBattle();
    });
    // 1-5는 boss_before 스토리 컷씬(cs_1_5_boss_before)이 있어, 파티/전투유닛이 이미
    // 계산된 뒤에도 BattleScene이 컷씬 뒤로 일시정지될 수 있다(isActive는 false가 됨).
    // 이 스모크는 컷씬 자체가 아니라 파티 스탯 계산이 관심사이므로, 씬이 만들어지고
    // allies가 채워졌는지로 판정한다(pause 여부와 무관).
    const battleReady = await waitFor(
      page,
      () => {
        const scene = window.game?.scene.getScene('BattleScene');
        return !!(scene && Array.isArray(scene.allies) && scene.allies.length > 0);
      },
      20000
    );
    assert(battleReady, '보스전 진입 → BattleScene 파티/전투유닛 생성');
    if (!battleReady) throw new Error('보스전 진입 실패');
    await page.waitForTimeout(500);

    const battleSnapshot = await page.evaluate(() => {
      const scene = window.game.scene.getScene('BattleScene');
      return {
        mode: scene.mode,
        party: (scene.party || []).map((h) => ({
          id: h.id, name: h.name, level: h.level, stats: h.stats
        })),
        allies: (scene.allies || []).map((a) => ({
          id: a.id, name: a.name, level: a.level,
          maxHp: a.maxHp, atk: a.atk, def: a.def, spd: a.spd
        }))
      };
    });

    assert(battleSnapshot.mode === 'boss', '보스전 모드로 진입', battleSnapshot.mode);

    const irisParty = battleSnapshot.party.find((h) => h.id === 'base_iris');
    assert(!!irisParty, '파티에 base_iris 포함', JSON.stringify(battleSnapshot.party.map((h) => h.id)));
    assert(irisParty && irisParty.name !== 'base_iris' && irisParty.name !== '???',
      '이름이 ID 노출 없이 실제 표시명으로 해석됨', JSON.stringify(irisParty?.name));
    assert(irisParty && irisParty.level === expected.level,
      `파티 레벨이 실제 레벨(${expected.level})과 일치`, JSON.stringify(irisParty?.level));

    // 합격 기준: BattleScene.party 스탯이 ProgressionSystem.getFinalStats()와 일치
    const statsMatch = irisParty && ['hp', 'atk', 'def', 'spd'].every(
      (key) => Number(irisParty.stats?.[key]) === Number(expected.stats[key])
    );
    assert(statsMatch, 'party 스탯 == ProgressionSystem.getFinalStats()',
      `실제=${JSON.stringify(irisParty?.stats)} 기대=${JSON.stringify(expected.stats)}`);

    const irisAlly = battleSnapshot.allies.find((a) => a.id === 'base_iris');
    assert(!!irisAlly, '전투 유닛(allies)에 base_iris 포함', JSON.stringify(battleSnapshot.allies.map((a) => a.id)));
    assert(irisAlly && irisAlly.maxHp === expected.stats.hp,
      `전투 유닛 maxHp(${irisAlly?.maxHp}) == getFinalStats().hp(${expected.stats.hp})`);
    assert(irisAlly && irisAlly.atk === expected.stats.atk,
      `전투 유닛 atk(${irisAlly?.atk}) == getFinalStats().atk(${expected.stats.atk})`);

    // 회귀 재현 확인: 예전 버그 값(maxHp:100, atk:12, name:'base_iris')이 아니어야 한다
    assert(irisAlly && irisAlly.maxHp !== 100, '버그 재현 값(maxHp:100)이 아님', String(irisAlly?.maxHp));
    assert(irisAlly && irisAlly.atk !== 12, '버그 재현 값(atk:12)이 아님', String(irisAlly?.atk));

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
