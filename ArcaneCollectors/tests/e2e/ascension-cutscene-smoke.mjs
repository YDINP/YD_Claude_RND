/**
 * ascension-cutscene-smoke.mjs — 각인 흐름 컷씬 e2e 실증 (T-Q1 / T-C8)
 *
 * 검증 내용
 *   게스트 로그인 → 각인 팝업 진입
 *   → 기본영웅 선택 시 `evolve_gate` 컷씬이 기관 선택 화면 **앞에** 뜨는지
 *   → 컷씬 동안 부모 씬(MainMenuScene)이 pause 되어 팝업 입력이 막히는지
 *   → 각인 확정 직후 `hero_evolve` 컷씬이 뜨고, 종료 후 성공 화면으로 넘어가는지
 *   → 첫 각인 보증이 1회만 소모되고 세이브에 기록되는지
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/ascension-cutscene-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = new URL('../../docs/story/screenshots/', import.meta.url);
const VIEWPORT = { width: 720, height: 1280 };
const SAVE_KEY = 'arcane_collectors_save';

/** 아이리스 각인에 필요한 조각 수 (base-heroes.json fragmentsRequired) */
const IRIS_FRAGMENTS_REQUIRED = 30;

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
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

const shot = async (page, name) => {
  await page.screenshot({ path: new URL(name, SHOT_DIR).pathname.slice(1) });
  console.log(`   📸 docs/story/screenshots/${name}`);
};

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n=== 각인 컷씬 스모크 (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(3000);

    // 1. 게스트 로그인
    const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'));
    assert(loginReady, 'LoginScene 활성화');

    await page.evaluate(() => {
      window.game.scene.getScene('LoginScene')?._handleGuestLogin?.();
    });
    const mainMenu = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000);
    assert(mainMenu, '게스트 로그인 → MainMenuScene');

    // 2. 각인 재료 지급 (조각은 T-05 봉투 담당이므로 여기서는 직접 주입)
    await page.evaluate(
      ({ key, need }) => {
        const save = JSON.parse(localStorage.getItem(key));
        save.resources.characterShards = save.resources.characterShards || {};
        save.resources.characterShards.base_iris = need;
        localStorage.setItem(key, JSON.stringify(save));
      },
      { key: SAVE_KEY, need: IRIS_FRAGMENTS_REQUIRED }
    );

    // 3. 각인 팝업 진입
    await page.evaluate(() => {
      window.game.scene.getScene('MainMenuScene').openPopup('ascension');
    });
    await page.waitForTimeout(500);
    const popupOpen = await page.evaluate(
      () => !!window.game.scene.getScene('MainMenuScene').activePopup
    );
    assert(popupOpen, '각인 팝업(AscensionPopup) 열림');

    // 4. 기본영웅 선택 → evolve_gate 컷씬이 기관 선택 화면 앞에 뜬다
    const stepBeforeGate = await page.evaluate(
      () => window.game.scene.getScene('MainMenuScene').activePopup.currentStep
    );
    assert(stepBeforeGate === 1, '기본영웅 선택 단계(Step 1)', String(stepBeforeGate));

    const clicked = await page.evaluate(() => {
      const popup = window.game.scene.getScene('MainMenuScene').activePopup;
      // Step 1에서 입력을 가진 사각형은 영웅 목록 카드뿐이며, 첫 항목이 base_iris다
      const card = popup._stepObjects.find((o) => o && o.type === 'Rectangle' && o.input);
      if (!card) return false;
      card.emit('pointerdown');
      return true;
    });
    assert(clicked, '영웅 목록에서 base_iris 카드 탭');

    const gateUp = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'));
    assert(gateUp, 'evolve_gate 컷씬 표시');

    const gateInfo = await page.evaluate(() => {
      const cutscene = window.game.scene.getScene('CutsceneScene');
      const popup = window.game.scene.getScene('MainMenuScene').activePopup;
      return {
        queue: cutscene?.player?.queue?.map((s) => s.id) || [],
        parentPaused: window.game.scene.isPaused('MainMenuScene'),
        popupStep: popup.currentStep,
        selectedHero: popup.selectedBaseHero?.id || null
      };
    });
    assert(
      gateInfo.queue.join(',') === 'cs_evolve_gate_first',
      'cs_evolve_gate_first 단독 재생',
      gateInfo.queue.join(',')
    );
    assert(gateInfo.parentPaused, '컷씬 중 부모 씬(MainMenuScene) 일시정지 → 팝업 입력 차단');
    assert(gateInfo.popupStep === 1, '컷씬이 끝나기 전에는 기관 선택 화면으로 넘어가지 않음', String(gateInfo.popupStep));
    assert(gateInfo.selectedHero === 'base_iris', '선택된 기본영웅 = base_iris', String(gateInfo.selectedHero));

    await page.waitForTimeout(1000);
    await shot(page, 'cutscene_evolve_gate.png');

    // 5. 컷씬 종료 → 기관 선택 화면(Step 2)
    // 전체 건너뛰기 경로로 종료한다 (스킵해도 시청 이력이 남는지 함께 검증)
    await page.evaluate(() => window.game.scene.getScene('CutsceneScene').player.skipAll());
    const gateClosed = await waitFor(page, () => !window.game?.scene.isActive('CutsceneScene'));
    assert(gateClosed, 'evolve_gate 컷씬 종료');
    await page.waitForTimeout(400);

    const stepAfterGate = await page.evaluate(() => {
      const popup = window.game.scene.getScene('MainMenuScene').activePopup;
      return { step: popup.currentStep, resumed: !window.game.scene.isPaused('MainMenuScene') };
    });
    assert(stepAfterGate.resumed, '컷씬 종료 후 부모 씬 재개');
    assert(stepAfterGate.step === 2, '컷씬 종료 후 기관 선택 화면(Step 2) 진입', String(stepAfterGate.step));
    await shot(page, 'ascension_step2_institutions.png');

    // 6. olympus 루트 선택 → 확인 화면(Step 3)
    const routePicked = await page.evaluate(() => {
      const popup = window.game.scene.getScene('MainMenuScene').activePopup;
      const route = (popup.selectedBaseHero.ascensionRoutes || []).find((r) => r.cultId === 'olympus');
      if (!route) return false;
      popup.selectedRoute = route;
      popup.buildStep3();
      return popup.currentStep === 3;
    });
    assert(routePicked, 'olympus 루트 선택 → 확인 화면(Step 3)');

    // 7. 각인 실행 → hero_evolve 컷씬
    await page.evaluate(() => {
      window.game.scene.getScene('MainMenuScene').activePopup._executeAscension();
    });
    const evolveUp = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'));
    assert(evolveUp, '각인 확정 직후 hero_evolve 컷씬 표시');

    const evolveQueue = await page.evaluate(
      () => window.game.scene.getScene('CutsceneScene')?.player?.queue?.map((s) => s.id) || []
    );
    assert(
      evolveQueue.join(',') === 'cs_evolve_iris_olympus',
      'cs_evolve_iris_olympus 재생 (heroId + cultId 앵커 일치)',
      evolveQueue.join(',')
    );
    await page.waitForTimeout(1000);
    await shot(page, 'cutscene_hero_evolve_iris_olympus.png');

    // 8. 컷씬 종료 → 각인 성공 화면
    // 전체 건너뛰기 경로로 종료한다 (스킵해도 시청 이력이 남는지 함께 검증)
    await page.evaluate(() => window.game.scene.getScene('CutsceneScene').player.skipAll());
    const evolveClosed = await waitFor(page, () => !window.game?.scene.isActive('CutsceneScene'));
    assert(evolveClosed, 'hero_evolve 컷씬 종료');
    await page.waitForTimeout(500);
    await shot(page, 'ascension_success.png');

    // 9. 세이브 검증 — 전직 결과 + 첫 각인 보증 1회 소모
    const save = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SAVE_KEY);
    assert(
      (save.ascendedHeroes || []).some((h) => h.ascendedHeroId === 'asc_iris_olympus'),
      '전직영웅 asc_iris_olympus 획득',
      JSON.stringify(save.ascendedHeroes)
    );
    assert(
      save.onboarding?.firstAscensionGrantUsed === true &&
        save.onboarding?.firstAscensionCultId === 'olympus',
      '첫 각인 보증 소모 기록 (firstAscensionGrantUsed / firstAscensionCultId)',
      JSON.stringify(save.onboarding)
    );
    assert(
      (save.story?.viewedCutscenes || []).includes('cs_evolve_gate_first') &&
        (save.story?.viewedCutscenes || []).includes('cs_evolve_iris_olympus'),
      '두 컷씬 모두 viewedCutscenes에 기록',
      JSON.stringify(save.story?.viewedCutscenes)
    );

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
