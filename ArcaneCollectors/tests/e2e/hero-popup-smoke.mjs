/**
 * hero-popup-smoke.mjs — 영웅 성장 흐름 회귀 스모크 (라이브 P0/P1)
 *
 * 사용자가 실제 플레이에서 만난 결함 셋을 브라우저에서 그대로 재현하고,
 * 고쳐진 뒤에는 재현되지 않음을 확인한다.
 *
 *   A. 진화 버튼 → `Cannot read properties of null (reading 'gold')`
 *      기본 영웅(base_*)에는 rarity 필드가 없어 진화 비용 조회가 null 로 떨어졌다.
 *   B. 영웅 목록 팝업 → 상세 씬 → 뒤로 → 같은 팝업이 다시 열리지 않음
 *      씬 재시작 뒤에도 파괴된 팝업 참조가 남아 `openPopup` 가드가 안 풀렸다.
 *   C. 레벨업할 때마다 화면 전체가 다시 그려짐
 *      이제 바뀐 숫자만 갈아끼운다 — 씬 재시작 카운터가 그대로여야 한다.
 *
 * 사전 조건: 개발 서버 실행 중 (npm run dev → http://localhost:3000)
 * 실행: node tests/e2e/hero-popup-smoke.mjs [--headed]
 * 종료 코드: 실패 시 1
 */
import { chromium } from 'playwright';
import { blockHmr } from './hmr-guard.mjs';
import {
  findByLabel, waitForLabel, waitForLabelGone, tapLabel, tapWorld, activeScenes, visibleTexts,
  readSave, isIgnored
} from './playtest-lib.mjs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const VIEWPORT = { width: 720, height: 1280 };

/** 레벨업 연타 횟수 */
const LEVEL_UP_TAPS = 10;

/**
 * 기본영웅(base_*)의 표시 등급. `src/utils/rarityUtils.ts` 의 BASE_HERO_RARITY 와 같아야 한다.
 * base-heroes.json 에 rarity 가 없는 것은 의도이고(GDD §2-1 계층), 데이터 접근자가 이 값을 얹는다.
 */
const RARITY_OF_BASE_HERO = 'R';

// ============================================================
// 세이브 픽스처 — 기본 영웅 4인, 재화·조각 충분, 튜토리얼 완주
// ============================================================

const BASE_IDS = ['base_iris', 'base_sera', 'base_luca', 'base_kai'];

const heroRecord = (id, level, stars, extra = {}) => ({
  id, instanceId: `${id}_smoke`, characterId: id, level, exp: 0, stars,
  skillLevels: [1, 1, 1], equipped: null,
  equipment: { weapon: null, armor: null, accessory: null },
  constellation: 0, acquiredAt: 1700000000000, ...extra
});

function smokeSave() {
  return {
    version: 2,
    player: { name: '스모크', level: 30, exp: 0 },
    resources: {
      gold: 5000000, gems: 30000, summonTickets: 10, skillBooks: 60, spiritStones: 40,
      characterShards: Object.fromEntries(BASE_IDS.map((id) => [id, 120])),
      cultEssence: { olympus: 300 }, institutionSeal: 15, awakeningFlame: 20
    },
    characters: [
      ...BASE_IDS.map((id) => heroRecord(id, 5, 3, { isBaseHero: true })),
      heroRecord('asc_iris_olympus', 20, 5, { isAscended: true })
    ],
    parties: [BASE_IDS],
    inventory: [],
    progress: { currentChapter: 'chapter_2', clearedStages: { '1-1': 3, '1-2': 3, '1-3': 3 }, towerFloor: 5, totalBattles: 50 },
    gacha: { pityCounter: 10, totalPulls: 30, freeTenPullUsed: true },
    quests: { daily: {}, dailyProgress: {}, lastReset: null },
    settings: { bgmVolume: 0, sfxVolume: 0, autoSkip: true, battleSpeed: 2 },
    tutorial: {
      currentStep: 'T-12', skippedSteps: [], skipped: false, completed: true,
      completedSteps: ['T-01', 'T-02', 'T-03', 'T-04', 'T-05', 'T-06', 'T-07', 'T-08', 'T-09', 'T-10', 'T-11', 'T-12']
    },
    story: { viewedCutscenes: ['prologue', 'chapter_1_intro'], skippedCutscenes: [], currentChapterStory: 'chapter_2' },
    onboarding: {
      grantVersion: 2, starterHeroGranted: true, starterHeroId: 'base_iris',
      freeMultiPullUsed: true, firstAscensionGrantUsed: true, firstAscensionCultId: 'olympus',
      unlockedMenus: ['herolist', 'partyedit', 'ascension', 'quest', 'inventory', 'gacha',
        'collection', 'tower', 'eventdungeon', 'pvp', 'guild', 'friends', 'raid'],
      idleIntroShown: true
    },
    baseHeroes: BASE_IDS.map((id) => ({ baseHeroId: id, fragmentCount: 90, openedRoutes: [] })),
    ascendedHeroes: [{
      ascendedHeroId: 'asc_iris_olympus', baseHeroId: 'base_iris',
      cultId: 'olympus', rarity: 'SSR', obtainedAt: 1700000000000
    }],
    collections: {},
    lastOnline: Date.now() - 600000,
    lastLogoutTime: Date.now() - 600000,
    createdAt: Date.now() - 8640000000
  };
}

/** 문서 로드 전에 게스트 세션 + 세이브를 심는다 */
function seed({ saveData }) {
  try { localStorage.clear(); } catch { /* storage 차단 환경 무시 */ }
  const user = { id: 'guest_hero_smoke', nickname: 'QA', isGuest: true, createdAt: new Date().toISOString() };
  localStorage.setItem('arcane_collectors_guest_user_guest', JSON.stringify(user));
  localStorage.setItem('arcane_collectors_session_guest', JSON.stringify({ user, isGuest: true, loginAt: new Date().toISOString() }));
  localStorage.setItem('arcane_auth', JSON.stringify({ userId: user.id, authType: 'guest', autoLogin: true, lastLogin: Date.now() }));
  localStorage.setItem('arcane_debug_enabled', 'true');
  localStorage.setItem('arcane_collectors_save', JSON.stringify(saveData));
}

// ============================================================

async function run() {
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // 공유 dev 서버 격리 — 남이 소스를 저장해도 이 페이지는 리로드되지 않는다.
  // 실증: node tests/e2e/hmr-guard-verify.mjs
  await blockHmr(page, BASE_URL);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !isIgnored(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => { if (!isIgnored(e.message)) errors.push(`PAGEERROR: ${e.message.slice(0, 300)}`); });

  let passed = 0;
  let failed = 0;
  const assert = (condition, name, detail = '') => {
    if (condition) { passed += 1; console.log(`✅ ${name}`); }
    else { failed += 1; console.log(`❌ ${name}${detail ? ` — ${detail}` : ''}`); }
  };

  const detailScene = () => page.evaluate(() => {
    const scene = window.game?.scene?.getScene?.('HeroDetailScene');
    return scene ? { createCount: scene.createCount ?? null, level: scene.hero?.level ?? null } : null;
  });
  const menuState = () => page.evaluate(() => {
    const scene = window.game?.scene?.getScene?.('MainMenuScene');
    return { hasActivePopup: !!scene?.activePopup, key: scene?.activePopupKey ?? null };
  });

  try {
    console.log(`\n=== 영웅 성장 흐름 스모크 (${BASE_URL}) ===\n`);

    await page.addInitScript(seed, { saveData: smokeSave() });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    if (await waitForLabel(page, '게스트로 시작', {}, 40000)) {
      await tapLabel(page, '게스트로 시작');
    }
    for (let i = 0; i < 80; i += 1) {
      const scenes = await activeScenes(page);
      if (scenes.includes('MainMenuScene')) break;
      if (scenes.includes('CutsceneScene')) await tapWorld(page, 540, 960, 200);
      else await page.waitForTimeout(300);
    }
    // 로비 판정은 하단 도크로 한다 — 상단 파티 패널은 성소 개편으로 사라졌다
    const lobbyReady = await waitForLabel(page, '성장', {}, 20000);
    assert(!!lobbyReady, '로비 진입');

    // ------------------------------------------------------------
    // 1) 영웅 목록 팝업 → 영웅 정보 팝업 → 상세 씬
    // ------------------------------------------------------------
    await tapLabel(page, '성장', { settle: 900 });
    const heroMenu = await waitForLabel(page, '영웅', {}, 8000);
    assert(!!heroMenu, '성장 도크에 영웅 메뉴가 있다');
    await tapWorld(page, heroMenu.x, heroMenu.y, 1500);

    const listOpened = await waitForLabel(page, '아이리스', { minDepth: 2000 }, 8000);
    assert(!!listOpened, '영웅 목록 팝업이 열린다');
    await tapWorld(page, listOpened.x, listOpened.y, 1500);

    const detailButton = await waitForLabel(page, '상세 보기', {}, 8000);
    assert(!!detailButton, '영웅 정보 팝업이 열린다');
    await tapWorld(page, detailButton.x, detailButton.y, 2000);

    let onDetail = false;
    for (let i = 0; i < 20; i += 1) {
      if ((await activeScenes(page)).includes('HeroDetailScene')) { onDetail = true; break; }
      await page.waitForTimeout(300);
    }
    assert(onDetail, '영웅 상세 씬 진입', (await activeScenes(page)).join(','));
    await page.waitForTimeout(800);

    // 같은 영웅이 화면마다 다른 등급으로 보이지 않는다 (등급 정규화 회귀 방지)
    const detailTexts = await visibleTexts(page);
    const subtitleRarity = detailTexts
      .map((t) => t.text.match(/^(N|R|SR|SSR) · Lv\.\d+$/))
      .find(Boolean)?.[1];
    assert(subtitleRarity === RARITY_OF_BASE_HERO,
      `상세 씬 부제가 ${RARITY_OF_BASE_HERO} 등급으로 뜬다`,
      detailTexts.filter((t) => t.text.includes('Lv.')).map((t) => t.text).join(' | '));
    assert(detailTexts.some((t) => t.text === RARITY_OF_BASE_HERO),
      `리본 등급 배지가 ${RARITY_OF_BASE_HERO} 다`);

    // ------------------------------------------------------------
    // 2) [C] 레벨업 연타 — 씬 재시작 없이 숫자만 바뀐다
    // ------------------------------------------------------------
    const before = await detailScene();
    const beforeTexts = await visibleTexts(page);
    const readPower = (texts) => {
      const index = texts.findIndex((t) => t.text === '전투력');
      return index >= 0 ? texts[index + 1]?.text : null;
    };
    const powerBefore = readPower(beforeTexts);

    const levelButton = await findByLabel(page, '레벨업', { exact: true });
    assert(!!levelButton, '레벨업 버튼이 있다');

    for (let i = 0; i < LEVEL_UP_TAPS; i += 1) {
      await tapWorld(page, levelButton.x, levelButton.y, 220);
    }
    await page.waitForTimeout(1200);

    const after = await detailScene();
    const save = await readSave(page);
    const irisLevel = (save?.characters || []).find((c) => c.id === 'base_iris')?.level ?? 0;

    assert(irisLevel >= (before?.level ?? 0) + LEVEL_UP_TAPS,
      `레벨업 ${LEVEL_UP_TAPS}회 연타가 모두 반영된다`,
      `${before?.level} → ${irisLevel}`);
    assert(after?.createCount === before?.createCount,
      '레벨업이 씬을 다시 그리지 않는다 (씬 재시작 카운터 불변)',
      `${before?.createCount} → ${after?.createCount}`);

    const afterTexts = await visibleTexts(page);
    const powerAfter = readPower(afterTexts);
    assert(!!powerAfter && powerAfter !== powerBefore,
      '전투력 텍스트가 갱신된다', `${powerBefore} → ${powerAfter}`);
    assert(afterTexts.some((t) => t.text === `Lv.${irisLevel} / 30`),
      '레벨 텍스트가 갱신된다', `Lv.${irisLevel} / 30`);
    assert(afterTexts.length === beforeTexts.length,
      '화면 구성은 그대로다 (텍스트 개수 불변)',
      `${beforeTexts.length} → ${afterTexts.length}`);

    // ------------------------------------------------------------
    // 3) [A] 진화 버튼 — 콘솔 에러 0
    // ------------------------------------------------------------
    const errorsBeforeEvolve = errors.length;
    const evolveButton = await findByLabel(page, '진화', { exact: true });
    assert(!!evolveButton, '진화 버튼이 있다');
    await tapWorld(page, evolveButton.x, evolveButton.y, 1500);

    const newErrors = errors.slice(errorsBeforeEvolve);
    assert(newErrors.length === 0, '진화 버튼 클릭 시 콘솔 에러 0', newErrors.join(' | '));

    const evolveTexts = await visibleTexts(page);
    const textOf = (re) => evolveTexts.find((t) => re.test(t.text))?.text || '';
    assert(evolveTexts.some((t) => t.text === '진화 확인'),
      '재화가 충분하면 진화 미리보기가 뜬다 (기본 영웅도)',
      evolveTexts.map((t) => t.text).join(' | ').slice(0, 200));

    // 등급을 테스트에 박아 두지 않는다. 화면이 약속한 값을 읽어 세이브와 대조한다.
    const transition = textOf(/^\s*\w+\s*→\s*\w+\s*$/);
    const [fromRarity, toRarity] = transition.split('→').map((part) => part.trim());
    assert(fromRarity === RARITY_OF_BASE_HERO,
      `기본 영웅은 어느 화면에서나 ${RARITY_OF_BASE_HERO} 등급이다`, transition);
    assert(!!toRarity, '다음 등급을 보여준다', transition);
    assert(evolveTexts.some((t) => /HP \+[1-9]/.test(t.text)),
      '미리보기 스탯 증가분이 0 이 아니다 — 세이브에 스탯이 없는 기본 영웅이다');

    const costText = textOf(/골드\s*·\s*\d+\s*조각/);
    const costMatch = costText.match(/([\d,]+)\s*골드\s*·\s*(\d+)\s*조각/) || [];
    const costGold = Number((costMatch[1] || '0').replace(/,/g, ''));
    const costShards = Number(costMatch[2] || 0);
    assert(costGold > 0 && costShards > 0, '미리보기가 비용을 표시한다', costText);

    // 미리보기의 '진화' 버튼이 액션 바의 것보다 위 층에 있다 (depth 내림차순 첫 항목)
    const confirm = await findByLabel(page, '진화', { exact: true });
    const goldBefore = save?.resources?.gold ?? 0;
    const shardsBefore = save?.resources?.characterShards?.base_iris ?? 0;
    if (confirm) await tapWorld(page, confirm.x, confirm.y, 3000);
    await page.waitForTimeout(2000);

    const afterEvolve = await readSave(page);
    const iris = (afterEvolve?.characters || []).find((c) => c.id === 'base_iris');
    assert(iris?.rarity === toRarity, `진화가 실제로 등급을 올린다 (${transition})`, String(iris?.rarity));
    assert(afterEvolve?.resources?.gold === goldBefore - costGold,
      '차감된 골드가 화면에 표시된 비용과 같다',
      `${goldBefore} → ${afterEvolve?.resources?.gold} (표시 ${costGold})`);
    assert(afterEvolve?.resources?.characterShards?.base_iris === shardsBefore - costShards,
      '차감된 조각이 화면에 표시된 비용과 같다 — 조각은 세이브에서 읽는다',
      `${shardsBefore} → ${afterEvolve?.resources?.characterShards?.base_iris} (표시 ${costShards})`);
    assert(errors.slice(errorsBeforeEvolve).length === 0, '진화 전 구간 콘솔 에러 0',
      errors.slice(errorsBeforeEvolve).join(' | '));

    // ------------------------------------------------------------
    // 4) [B] 뒤로 → 같은 팝업 재오픈
    // ------------------------------------------------------------
    const back = await findByLabel(page, '←', { exact: true });
    assert(!!back, '뒤로 버튼이 있다');
    await tapWorld(page, back.x, back.y, 2500);
    assert((await activeScenes(page)).includes('MainMenuScene'), '로비 복귀');
    await waitForLabel(page, '성장', {}, 15000);

    const stateAfterBack = await menuState();
    assert(stateAfterBack.hasActivePopup === false,
      '로비 복귀 시 팝업 소유권이 비어 있다',
      JSON.stringify(stateAfterBack));

    await tapLabel(page, '성장', { settle: 900, required: false });
    const heroMenu2 = await waitForLabel(page, '영웅', {}, 8000);
    if (heroMenu2) await tapWorld(page, heroMenu2.x, heroMenu2.y, 1800);
    const listReopened = await waitForLabel(page, '아이리스', { minDepth: 2000 }, 8000);
    assert(!!listReopened, '레벨업 후에도 영웅 목록 팝업이 다시 열린다');

    // 영웅 정보 팝업도 닫았다 다시 열린다
    if (listReopened) {
      await tapWorld(page, listReopened.x, listReopened.y, 1200);
      assert(!!(await waitForLabel(page, '상세 보기', {}, 8000)), '목록에서 영웅 정보 팝업이 열린다');

      // 닫기는 중첩 팝업(정보)이 목록보다 위 층이라 depth 내림차순 첫 항목이 정보 팝업의 것이다
      const closeBtn = await findByLabel(page, '닫기', { exact: true });
      if (closeBtn) await tapWorld(page, closeBtn.x, closeBtn.y, 1500);
      const closed = await waitForLabelGone(page, '상세 보기', {}, 8000);
      assert(closed, '영웅 정보 팝업이 닫힌다');

      const card = await waitForLabel(page, '아이리스', { minDepth: 2000 }, 8000);
      if (card) await tapWorld(page, card.x, card.y, 1500);
      assert(!!(await waitForLabel(page, '상세 보기', {}, 8000)),
        '영웅 정보 팝업도 닫고 다시 열린다');
    }

    // ------------------------------------------------------------
    // 5) [P2-5] 영웅 카드 텍스처 캐시 미스 → 결국 실제 포트레이트로 승격된다
    //    (필터/정렬로 카드가 재생성될 때, 부팅 프리로드가 아직 못 받아온 영웅은
    //    캔버스 플레이스홀더(이니셜 글자)로 영구히 굳던 결함의 회귀 테스트)
    // ------------------------------------------------------------
    const cacheMissResult = await page.evaluate(() => {
      const mm = window.game.scene.getScene('MainMenuScene');
      mm.openPopup('herolist');
      const pop = mm.activePopup;
      if (!pop || !pop.scene) return { ok: false, reason: 'no-popup' };

      const key = 'hero_base_iris';
      const scene = pop.scene;
      // 부팅 프리로드가 이미 받아온 실제 포트레이트를 지워 "캐시 미스" 상태를 재현한다
      if (scene.textures.exists(key)) scene.textures.remove(key);

      // refreshGrid()는 필터 변경 여부와 무관하게 매번 카드를 통째로 다시 만든다 —
      // createHeroCard()가 HeroAssetLoader.ensureTexture()를 다시 호출하는 지점이다.
      // (이 시점에는 앞 섹션에서 아이리스를 진화시켜 등급이 바뀌어 있을 수 있으므로
      // 필터 값 자체는 건드리지 않는다 — 필터로 걸러지면 카드가 아예 안 만들어진다)
      pop.refreshGrid();

      const rebuilt = scene.textures.exists(key);
      const tex = rebuilt ? scene.textures.get(key) : null;
      return {
        ok: true,
        rebuilt,
        isPlaceholderRightAfter: tex ? !!tex.__heroPlaceholder : null
      };
    });
    assert(cacheMissResult.ok, '영웅 목록 팝업에서 텍스처 캐시 미스를 재현할 수 있다',
      JSON.stringify(cacheMissResult));
    assert(cacheMissResult.rebuilt,
      '캐시가 비어도 카드 재생성 시 플레이스홀더가 즉시 채워진다 (화면이 비지 않는다)');
    assert(cacheMissResult.isPlaceholderRightAfter === true,
      '재생성 직후에는 아직 플레이스홀더다 (승격은 비동기)');

    // 승격은 브라우저 Image 로 백그라운드에서 온다 — 로컬 dev 서버 기준 충분한 유예
    await page.waitForTimeout(2500);
    const upgraded = await page.evaluate(() => {
      const key = 'hero_base_iris';
      if (!window.game.textures.exists(key)) return null;
      return !window.game.textures.get(key).__heroPlaceholder;
    });
    assert(upgraded === true,
      '캐시가 비었던 영웅 카드가 결국 실제 포트레이트로 바뀐다 (플레이스홀더로 굳지 않는다)',
      `upgraded=${upgraded}`);

    assert(errors.length === 0, '전 구간 콘솔 에러 0', errors.join(' | '));
  } catch (error) {
    failed += 1;
    console.log(`❌ 예외 — ${error.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} 통과 / ${failed} 실패\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
