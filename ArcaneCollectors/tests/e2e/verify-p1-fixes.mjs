/**
 * verify-p1-fixes.mjs — QA P1 수정 검증 (①②③④)
 * 임시 검증 스크립트. docs/qa/playtest/ 에 *-fixed.png 캡처를 남긴다.
 * 실행: node tests/e2e/verify-p1-fixes.mjs
 */
import { chromium } from 'playwright';
import * as L from './playtest-lib.mjs';

const {
  BASE_URL, safeEvaluate, tapWorld, findByLabel, waitForLabel, visibleTexts,
  activeScenes, shot, boot, guestLogin, closePopup, tapLabel,
} = L;

async function skipCutscenes(page, rounds = 5) {
  for (let r = 0; r < rounds; r += 1) {
    if (!(await activeScenes(page)).includes('CutsceneScene')) break;
    const skip = await findByLabel(page, '건너뛰기');
    if (skip) await tapWorld(page, skip.x, skip.y, 500);
    else await tapWorld(page, 540, 960, 300);
    await page.waitForTimeout(500);
  }
}

async function openMenu(page, category, item) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const cat = await findByLabel(page, category, { exact: true, sceneKeys: ['MainMenuScene'] });
    if (!cat) { await page.waitForTimeout(700); continue; }
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

    const save = JSON.parse(localStorage.getItem('arcane_collectors_save'));
    const ids = (save.characters || []).map((c) => c.id).filter(Boolean).slice(0, 4);
    if (ids.length) save.parties = [[...ids, null, null, null].slice(0, 4)];
    (save.characters || []).forEach((c) => { c.level = 20; });
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
  while (Date.now() - t0 < 90000) {
    const scenes = await activeScenes(page);
    if (scenes.includes('MainMenuScene')) break;
    if (scenes.includes('CutsceneScene')) { await skipCutscenes(page, 3); continue; }
    if (scenes.includes('LoginScene')) { await guestLogin(page); continue; }
    await page.waitForTimeout(500);
  }
  console.log('reload 후 활성 씬:', await activeScenes(page));
  await page.waitForTimeout(2500);
  await closePopup(page);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  console.log('=== ① ② ③ 무한의 탑: undefined 층/회 + 탭 겹침 + 적 ID 노출 ===');
  await prepareVeteran(page, { chapter: 3, tower: 15 });

  const ok = await openMenu(page, '도전', '무한탑');
  console.log('무한탑 팝업 열기:', ok);
  await page.waitForTimeout(1500);
  await shot(page, '07-content-b-tower-fixed');

  let texts = (await visibleTexts(page)).map((t) => t.text);
  console.log('무한탑 화면 텍스트:', JSON.stringify(texts));
  const hasUndefined = texts.some((t) => /undefined/i.test(t));
  console.log('undefined 노출:', hasUndefined, '(false 여야 정상)');
  const hasHighest = texts.some((t) => /최고 기록\s*:?\s*\d+층/.test(t));
  const hasClears = texts.some((t) => /총 클리어\s*:?\s*\d+회/.test(t));
  console.log('최고 기록 N층 표기:', hasHighest, '/ 총 클리어 N회 표기:', hasClears);
  const hasChallengeTab = await findByLabel(page, '도전');
  const hasSeasonTab = await findByLabel(page, '시즌');
  console.log('탭 라벨 "도전" 발견:', !!hasChallengeTab, '/ "시즌" 발견:', !!hasSeasonTab);
  const hasWolfId = texts.some((t) => /wolf_alpha|enemy_/.test(t));
  const hasWolfName = texts.some((t) => /알파\s*늑대/.test(t));
  console.log('적 내부 id(wolf_alpha) 노출:', hasWolfId, '(false 여야 정상)', '/ 한글 적 이름(알파 늑대) 노출:', hasWolfName);

  // 시즌 탭 전환 캡처 (탭 겹침 재확인)
  if (hasSeasonTab) {
    await tapWorld(page, hasSeasonTab.x, hasSeasonTab.y, 1200);
    await shot(page, '07-content-b2-tower-season-fixed');
    const seasonTexts = (await visibleTexts(page)).map((t) => t.text);
    console.log('시즌 탭 전환 후 텍스트:', JSON.stringify(seasonTexts.slice(0, 15)));
  }

  await closePopup(page);
  await page.waitForTimeout(800);

  console.log('\n=== ④ 인벤토리 장비 타입 (기타 → 실제 슬롯) ===');
  const invOk = await openMenu(page, '성장', '가방');
  console.log('가방 팝업 열기:', invOk);
  await page.waitForTimeout(1200);
  await shot(page, '05-growth-equipment-fixed');
  texts = (await visibleTexts(page)).map((t) => t.text);
  console.log('가방(장비 탭) 텍스트:', JSON.stringify(texts));
  const slotLabels = ['무기', '방어구', '악세서리', '유물', '방어', '악세'];
  const hasSlotLabel = texts.some((t) => slotLabels.some((s) => t.includes(s)));
  const allEtc = texts.filter((t) => t.includes('기타')).length;
  console.log('실제 슬롯 라벨(무기/방어구/악세서리/유물) 노출:', hasSlotLabel);
  console.log('"기타" 라벨 개수:', allEtc);

  await closePopup(page);
  await page.waitForTimeout(800);

  console.log('\n=== ③ 전투 보상 카드 아이템 내부 ID 노출 (exp_potion_s) ===');
  let start = null;
  for (const label of ['전투 시작', '보스전', '소탕']) {
    start = await findByLabel(page, label, { exact: true, sceneKeys: ['MainMenuScene'] });
    if (start) break;
  }
  console.log('전투 진입점:', start?.text);
  if (start) {
    await tapWorld(page, start.x, start.y, 2000);
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
    console.log('전투 화면 진입:', up);
    if (up) {
      await page.waitForTimeout(800);
      await safeEvaluate(page, (s) => window.game?.registry?.set?.('battleSpeed', s), 8);
      await tapLabel(page, 'AUTO OFF', { required: false, sceneKeys: ['BattleScene'] });
      const t0 = Date.now();
      let forced = false;
      while (Date.now() - t0 < 60000) {
        const scenes = await activeScenes(page);
        if (scenes.includes('BattleResultScene')) break;
        if (scenes.includes('CutsceneScene')) { await skipCutscenes(page, 2); continue; }
        if (!forced && Date.now() - t0 > 20000) {
          forced = await safeEvaluate(page, () => {
            const bs = window.game?.scene?.getScene?.('BattleScene');
            if (!bs || !window.game.scene.isActive('BattleScene') || bs.battleEnded) return false;
            (bs.enemies || []).forEach((e) => { if (e) { e.currentHp = 0; e.isAlive = false; } });
            bs.endBattle(true);
            return true;
          });
        }
        await tapLabel(page, 'AUTO OFF', { required: false, sceneKeys: ['BattleScene'] });
        await tapLabel(page, '다음 턴', { required: false, sceneKeys: ['BattleScene'] });
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(1000);
      const scenes = await activeScenes(page);
      console.log('결과 화면 도달:', scenes.includes('BattleResultScene'), scenes);
      if (scenes.includes('BattleResultScene')) {
        await shot(page, '01-onboarding-victory-reward-fixed');
        texts = (await visibleTexts(page)).map((t) => t.text);
        console.log('결과 화면 텍스트:', JSON.stringify(texts));
        const hasRawItemId = texts.some((t) => /exp_potion_s|exp_potion_m|exp_potion_l/.test(t));
        const hasKoreanItemName = texts.some((t) => /경험치\s*물약/.test(t));
        console.log('아이템 내부 id 노출:', hasRawItemId, '(false 여야 정상)', '/ 한글 이름(경험치 물약) 노출:', hasKoreanItemName);
      }
    }
  }

  await browser.close();
  console.log('\n=== 검증 스크립트 종료 ===');
})();
