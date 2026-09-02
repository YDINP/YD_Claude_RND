/**
 * cutscene-smoke.mjs — 컷씬 재생 e2e 실증 (T-C4 / T-Q1)
 *
 * 검증 내용
 *   게스트 로그인 → 스테이지 선택 → 1-1 출격
 *   → chapter_enter + stage_enter 컷씬이 CutsceneScene으로 뜨는지
 *   → 화면 탭으로 다음 줄이 진행되는지
 *   → [전체 건너뛰기]가 동작하고 시청 이력이 세이브에 남는지(스킵 무손실)
 *   → 컷씬 종료 후 전투로 진행되는지
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/cutscene-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = new URL('../../docs/story/screenshots/', import.meta.url);
/** 게임 해상도 = 뷰포트 (동일 종횡비 → 레터박스 없음, 좌표 변환이 단순 스케일) */
const VIEWPORT = { width: 720, height: 1280 };
const GAME_WIDTH = 1080;

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

/**
 * base 720×1280 좌표 → 페이지 좌표
 * Phaser의 `scale.canvasBounds` / `scale.displayScale`을 그대로 역산한다
 * (캔버스가 레터박스로 오프셋될 수 있으므로 단순 비례로 계산하면 어긋난다).
 */
async function tapPoint(page, baseX, baseY) {
  const gameScale = GAME_WIDTH / 720; // s()
  return page.evaluate(
    ({ gx, gy }) => {
      const scale = window.game.scale;
      return {
        x: scale.canvasBounds.x + gx / scale.displayScale.x,
        y: scale.canvasBounds.y + gy / scale.displayScale.y
      };
    },
    { gx: baseX * gameScale, gy: baseY * gameScale }
  );
}

async function run() {
  mkdirSync(SHOT_DIR, { recursive: true });
  const headless = !process.argv.includes('--headed');
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: VIEWPORT });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(`${err.name}: ${err.message}`));

  try {
    console.log(`\n=== 컷씬 재생 스모크 (${BASE_URL}) ===\n`);

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

    // 2. 스테이지 선택 진입 후 1-1 출격 (실제 startBattle 경로)
    await page.evaluate(() => {
      window.game.scene.getScene('MainMenuScene').scene.start('StageSelectScene');
    });
    const stageSelect = await waitFor(page, () => !!window.game?.scene.isActive('StageSelectScene'));
    assert(stageSelect, 'StageSelectScene 진입');
    await page.waitForTimeout(500);

    const launched = await page.evaluate(() => {
      const scene = window.game.scene.getScene('StageSelectScene');
      const stage = scene.generateStages(1).find((s) => s.id === '1-1');
      if (!stage) return false;
      scene.selectedStage = stage;
      scene.showPartySelect();
      scene.autoFillParty();
      scene.startBattle();
      return true;
    });
    assert(launched, '1-1 출격 실행');

    // 3. 컷씬이 떴는가
    const cutsceneUp = await waitFor(page, () => !!window.game?.scene.isActive('CutsceneScene'));
    assert(cutsceneUp, 'CutsceneScene 오버레이 표시');

    const queue = await page.evaluate(() => {
      const scene = window.game.scene.getScene('CutsceneScene');
      return scene?.player?.queue?.map((s) => s.id) || [];
    });
    assert(
      queue.join(',') === 'cs_ch1_enter,cs_1_1_enter',
      'chapter_enter → stage_enter 순으로 대기열 구성',
      queue.join(',')
    );

    const parentPaused = await page.evaluate(() => window.game.scene.isPaused('StageSelectScene'));
    assert(parentPaused, '호출 씬(StageSelectScene) 일시정지');

    await page.waitForTimeout(1200);
    await page.screenshot({ path: new URL('cutscene_1_1_intro.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/cutscene_1_1_intro.png');

    // 4. 탭으로 다음 줄 진행
    const beforeTap = await page.evaluate(() => window.game.scene.getScene('CutsceneScene').player.lineIndex);
    const center = await tapPoint(page, 360, 640);
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(200);
    await page.mouse.click(center.x, center.y);
    await page.waitForTimeout(300);
    const afterTap = await page.evaluate(() => window.game.scene.getScene('CutsceneScene').player.lineIndex);
    assert(afterTap > beforeTap, '탭으로 대사 진행', `${beforeTap} → ${afterTap}`);

    // 4-b. 캐릭터 대사 줄(대화박스 + 이름표 + 실루엣)까지 진행
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(400);
    }
    const speakerLine = await page.evaluate(() => {
      const player = window.game.scene.getScene('CutsceneScene').player;
      const line = player.queue[player.sceneIndex].lines[player.lineIndex];
      return { speaker: line.speaker, type: line.speakerType, hasSilhouette: !!player.silhouette.current };
    });
    assert(
      speakerLine.type !== 'narrator' && speakerLine.hasSilhouette,
      '캐릭터 대사에서 이름표·실루엣 표시',
      JSON.stringify(speakerLine)
    );
    await page.screenshot({ path: new URL('cutscene_1_1_dialogue.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/cutscene_1_1_dialogue.png');

    // 5. [전체 건너뛰기] 탭
    const skipAll = await tapPoint(page, 24 + 220 / 2, 1196 + 48 / 2);
    await page.mouse.click(skipAll.x, skipAll.y);
    await page.waitForTimeout(600);

    const cutsceneClosed = await waitFor(page, () => !window.game?.scene.isActive('CutsceneScene'));
    assert(cutsceneClosed, '전체 건너뛰기로 컷씬 종료');

    // 6. 스킵해도 시청 이력이 남는다 (무손실)
    const viewed = await page.evaluate(() => {
      const raw = localStorage.getItem('arcane_collectors_save');
      const save = raw ? JSON.parse(raw) : {};
      return {
        version: save.version,
        keys: Object.keys(save.story || {}).sort(),
        currentChapterStory: save.story?.currentChapterStory,
        lastViewedAt: save.story?.lastViewedAt,
        viewed: save.story?.viewedCutscenes || [],
        skipped: save.story?.skippedCutscenes || []
      };
    });
    assert(
      viewed.viewed.includes('cs_ch1_enter') && viewed.viewed.includes('cs_1_1_enter'),
      '스킵한 씬도 viewedCutscenes에 기록됨',
      JSON.stringify(viewed.viewed)
    );
    assert(
      viewed.skipped.includes('cs_ch1_enter') && viewed.skipped.includes('cs_1_1_enter'),
      'skippedCutscenes에도 기록됨',
      JSON.stringify(viewed.skipped)
    );

    // 6-b. 세이브 v2 story 섹션 4개 키가 온전히 유지된다
    assert(
      viewed.keys.join(',') === 'currentChapterStory,lastViewedAt,skippedCutscenes,viewedCutscenes',
      'save.story 4개 키 유지 (SaveManager v2 스키마)',
      `v${viewed.version} ${viewed.keys.join(',')}`
    );
    assert(
      viewed.currentChapterStory === 'chapter_1' && typeof viewed.lastViewedAt === 'number',
      'currentChapterStory / lastViewedAt 갱신',
      `${viewed.currentChapterStory} / ${viewed.lastViewedAt}`
    );

    // 7. 컷씬 종료 후 전투 진행
    const battleStarted = await waitFor(page, () => !!window.game?.scene.isActive('BattleScene'), 12000);
    assert(battleStarted, '컷씬 종료 후 전투 진입');
    await page.waitForTimeout(800);
    await page.screenshot({ path: new URL('cutscene_1_1_after_skip.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/cutscene_1_1_after_skip.png');

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
