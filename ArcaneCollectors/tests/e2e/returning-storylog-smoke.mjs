/**
 * returning-storylog-smoke.mjs — 복귀 유저 카드 · 도감 이야기 탭 e2e 실증 (T-Q4 / T-Q5 / T-25)
 *
 * 검증 내용
 *   게스트 로그인 → 23일 이탈 세이브 주입 → 재진입
 *   → ReturningPlayerCard 가 뜨는지 (티어 7d, 컷씬 자동 재생 없음)
 *   → 도감 '이야기' 탭 → StoryLogPopup 목록/잠금/스킵 배지가 그려지는지
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 node tests/e2e/returning-storylog-smoke.mjs [--headed]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const SHOT_DIR = new URL('../../docs/story/screenshots/', import.meta.url);
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

async function waitFor(page, fn, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
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

  try {
    console.log(`\n=== 복귀 카드 · 이야기 탭 스모크 (${BASE_URL}) ===\n`);

    await page.goto(BASE_URL);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(3000);

    const loginReady = await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'));
    assert(loginReady, 'LoginScene 활성화');

    await page.evaluate(() => {
      window.game.scene.getScene('LoginScene')?._handleGuestLogin?.();
    });
    assert(
      await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000),
      '게스트 로그인 → MainMenuScene'
    );

    // 23일 이탈 + 진행도/이야기 이력을 주입한다 (SaveManager 를 직접 쓴다)
    await page.evaluate(() => {
      const key = 'arcane_collectors_save';
      const save = JSON.parse(localStorage.getItem(key));
      const DAY = 24 * 60 * 60 * 1000;
      save.lastOnline = Date.now() - 23 * DAY;
      save.lastLogoutTime = save.lastOnline;
      save.progress.clearedStages = { '1-1': 3, '1-2': 2, '1-3': 2, '1-4': 1, '2-1': 1, '2-2': 1, '2-3': 1, '2-4': 2 };
      save.progress.totalBattles = 40;
      save.tutorial = { ...(save.tutorial || {}), completed: true, currentStep: null };
      save.story = {
        viewedCutscenes: ['cs_ch1_enter', 'cs_1_1_enter', 'cs_1_1_clear', 'cs_1_2_enter', 'cs_1_3_enter', 'cs_first_hero_iris'],
        skippedCutscenes: ['cs_1_2_enter', 'cs_1_3_enter'],
        currentChapterStory: 'chapter_2',
        lastViewedAt: Date.now() - 23 * DAY,
      };
      save.quests = {
        daily: {
          daily_001: { completed: true, claimed: false },
          daily_002: { completed: true, claimed: false },
          daily_003: { completed: false, claimed: false },
        },
      };
      save.resources.characterShards = { base_iris: 30 };
      save.onboarding = { ...(save.onboarding || {}), returningPlayerTier: null, lastReturnRewardAt: null };
      localStorage.setItem(key, JSON.stringify(save));
    });

    await page.reload();
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      window.game.scene.getScene('LoginScene')?._handleGuestLogin?.();
    });
    assert(
      await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 15000),
      '복귀 세이브로 MainMenuScene 재진입'
    );

    const cardUp = await waitFor(
      page,
      () => !!window.game?.scene.getScene('MainMenuScene')?.returningCard?.visible,
      8000
    );
    assert(cardUp, '복귀 유저 카드 표시');

    const summary = await page.evaluate(
      () => window.game.scene.getScene('MainMenuScene').returningCard?.summary || null
    );
    assert(summary?.tier === '7d', '이탈 23일 → 7d 티어', String(summary?.tier));
    assert(summary?.daysAway === 23, '이탈 일수 23일 표기', String(summary?.daysAway));
    assert(summary?.gift?.gems === 300, '7~30일 구간 보상(젬 300)', String(summary?.gift?.gems));
    assert(summary?.story?.missedStories === 2, '놓친 이야기 2편 집계', String(summary?.story?.missedStories));
    assert(summary?.quests?.unclaimed === 2, '미수령 보상 2개 집계', String(summary?.quests?.unclaimed));
    assert(summary?.offlineCapHours === 24, 'ISS-01 확정 상한 24h 반영', String(summary?.offlineCapHours));

    // 복귀 유저에게 컷씬을 자동 재생하지 않는다 (UX §5-3)
    const cutsceneAuto = await page.evaluate(() => window.game.scene.isActive('CutsceneScene'));
    assert(!cutsceneAuto, '복귀 시 컷씬을 자동 재생하지 않음');

    await page.waitForTimeout(400);
    await page.screenshot({ path: new URL('returning_player_card.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/returning_player_card.png');

    // 카드를 닫고 도감 → 이야기 탭
    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').returningCard?.hide());
    await page.waitForTimeout(300);

    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').openPopup('collection'));
    assert(
      await waitFor(page, () => window.game.scene.getScene('MainMenuScene')?.activePopup?.isOpen === true),
      '도감(CollectionPopup) 열림'
    );

    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').activePopup.openTab('storylog'));
    const logUp = await waitFor(
      page,
      () => window.game.scene.getScene('MainMenuScene')?.activePopup?.constructor?.name === 'StoryLogPopup',
      8000
    );
    assert(logUp, "도감 '이야기' 탭 → StoryLogPopup 진입");

    const log = await page.evaluate(() => {
      const popup = window.game.scene.getScene('MainMenuScene').activePopup;
      return { log: popup?.log || null, summary: popup?.summary || null };
    });
    const ch1 = log.log?.groups?.find((g) => g.id === 'chapter_1');
    const ch2 = log.log?.groups?.find((g) => g.id === 'chapter_2');
    assert(ch1 && !ch1.locked && ch1.viewedCount === 5, '챕터 1 시청 5편 노출', String(ch1?.viewedCount));
    assert(ch2?.locked === true && ch2?.title === '???', '미시청 챕터는 제목까지 잠금');
    assert(log.summary?.skippedText === '놓친 이야기 2편', '놓친 이야기 요약 표시', log.summary?.skippedText);
    assert(
      ch1?.entries?.filter((e) => e.skipped).length === 2,
      '스킵한 컷씬 2편에 배지',
      String(ch1?.entries?.filter((e) => e.skipped).length)
    );

    await page.waitForTimeout(400);
    await page.screenshot({ path: new URL('story_log_popup.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/story_log_popup.png');

    // 탭은 양방향이어야 한다 — '영웅'으로 되돌아갈 수 있는지
    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').activePopup.openTab('collection'));
    assert(
      await waitFor(
        page,
        () => window.game.scene.getScene('MainMenuScene')?.activePopup?.constructor?.name === 'CollectionPopup',
        8000
      ),
      "'영웅' 탭으로 되돌아감"
    );
    await page.evaluate(() => window.game.scene.getScene('MainMenuScene').activePopup.hide());
    await page.waitForTimeout(400);

    // T-Q3: 1-4 벽 경고 (진입은 막지 않는다)
    await page.evaluate(() => {
      window.game.scene.getScene('MainMenuScene').scene.start('StageSelectScene');
    });
    assert(
      await waitFor(page, () => !!window.game?.scene.isActive('StageSelectScene')),
      'StageSelectScene 진입'
    );
    await page.waitForTimeout(500);

    const wall = await page.evaluate(() => {
      const scene = window.game.scene.getScene('StageSelectScene');
      const stage = scene.generateStages(1).find((s) => s.id === '1-4');
      scene.selectedStage = stage;
      scene.showPartySelect();
      // 문서가 확정한 1인 파티 전투력(약 430)을 그대로 넣는다.
      // autoFillParty 의 실측값은 ISS-03(전투력 공식 2개 병존) 때문에 스테이지 선택 화면에서
      // 부풀어 나오므로, 벽 판정 자체를 검증하려면 기준값을 명시해야 한다.
      scene.updateWallWarning(430);
      return {
        recommended: stage.recommendedPower,
        warningVisible: scene.wallWarningText.visible,
        warningText: scene.wallWarningText.text,
        ctaVisible: scene.wallCtaText.visible,
        ctaText: scene.wallCtaText.text,
        ctaKey: scene._wallCtaKey,
      };
    });
    assert(wall.recommended === 500, '1-4 권장 전투력 500', String(wall.recommended));
    assert(wall.warningVisible === true, '1-4 진입 전 전투력 부족 경고 표시');
    assert(/권장 500/.test(wall.warningText), '권장 전투력 대비 비율 노출', wall.warningText);
    assert(wall.ctaVisible === true && wall.ctaKey === 'ascension', '각인 유도 CTA 노출', `${wall.ctaText}/${wall.ctaKey}`);

    // 충분한 전투력이면 경고가 사라진다 (막지 않는 진행 + 불필요한 겁주기 금지)
    const cleared = await page.evaluate(() => {
      const scene = window.game.scene.getScene('StageSelectScene');
      scene.updateWallWarning(9999);
      return { warningVisible: scene.wallWarningText.visible, ctaVisible: scene.wallCtaText.visible };
    });
    assert(!cleared.warningVisible && !cleared.ctaVisible, '전투력이 충분하면 경고를 띄우지 않음');

    // T-Q3: 보스 패배 화면 — 진단 1줄 + 반복 실패 유도 + 에너지 50% 환급(LV-01)
    const beforeEnergy = await page.evaluate(async () => {
      const { energySystem } = await import('/src/systems/EnergySystem.js');
      window.__energySystem = energySystem;
      return energySystem.getCurrentEnergy();
    });

    await page.evaluate(() => {
      const scene = window.game.scene.getScene('StageSelectScene');
      const boss = scene.generateStages(1).find((s) => s.id === '1-5');
      // 이 스테이지에서 이미 2번 졌다고 가정 → 이번 패배가 3회째(소환 유도 임계)
      scene.registry.set('stageFailCounts', { '1-5': 2 });
      scene.scene.start('BattleResultScene', {
        victory: false,
        stage: boss,
        party: [],
        turnCount: 18,
        aliveCount: 0,
        totalAllies: 1,
        enemyHpRemainRatio: 0.42,
      });
    });
    assert(
      await waitFor(page, () => !!window.game?.scene.isActive('BattleResultScene')),
      'BattleResultScene(패배) 진입'
    );
    await page.waitForTimeout(700);

    const defeat = await page.evaluate(() => {
      const scene = window.game.scene.getScene('BattleResultScene');
      return {
        guidance: scene.defeatGuidance,
        failCount: (scene.registry.get('stageFailCounts') || {})['1-5'],
        energy: window.__energySystem.getCurrentEnergy(),
        labels: scene.children.list
          .filter((o) => o.type === 'Text')
          .map((o) => o.text),
      };
    });
    assert(defeat.failCount === 3, '연속 패배 횟수 누적', String(defeat.failCount));
    assert(defeat.guidance?.repeatStep?.action === 'gacha', '3회 실패 → 소환 유도 단계', String(defeat.guidance?.repeatStep?.action));
    assert(
      defeat.labels.includes('소환하러 가기'),
      '반복 실패 CTA 버튼 노출',
      defeat.labels.join(' / ')
    );
    assert(/권장 전투력 1,000/.test(defeat.guidance?.diagnosis || ''), '패배 진단 1줄 노출', defeat.guidance?.diagnosis);
    assert(defeat.guidance?.progressText === '적 체력 42% 남음', '남은 적 체력 표시', defeat.guidance?.progressText);
    assert(defeat.guidance?.energyRefund === 10, '보스 패배 에너지 50% 환급 계산', String(defeat.guidance?.energyRefund));
    assert(defeat.energy - beforeEnergy === 10, '환급 에너지가 실제로 지급됨', `${beforeEnergy} → ${defeat.energy}`);
    assert(defeat.guidance?.replayCutsceneOnRetry === false, 'R4: 재도전 시 boss_before 미재생');

    await page.screenshot({ path: new URL('battle_defeat_guidance.png', SHOT_DIR).pathname.slice(1) });
    console.log('   📸 docs/story/screenshots/battle_defeat_guidance.png');

    assert(pageErrors.length === 0, '처리되지 않은 예외 0건', pageErrors.join(' | '));
  } catch (error) {
    failed += 1;
    console.log(`❌ 예외: ${error.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
