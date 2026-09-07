/**
 * reward-grant-parity.mjs — 전투 승리 결과 화면에 "표시된" 보상이 실제로 세이브에
 * "지급된" 보상과 항상 같은지 대조하는 회귀 테스트.
 *
 * 배경 (QA P1 후속)
 *   `BattleScene.js`가 전투 승리 시 스테이지 보상 아이템을 결과 화면에 그대로 보여주면서도
 *   실제로는 확률조차 굴리지 않고 인벤토리에 넣지 않았다. `SaveManager.grantRewardItems()`
 *   가 "실제로 지급된 것만" 반환하고 그 반환값을 그대로 표시에 쓰도록 고쳤으므로, 이 테스트가
 *   깨지면 그 계약이 다시 깨진 것이다.
 *
 * 무엇을 대조하는가
 *   1) 결과 화면(BattleResultScene)의 `this.rewards.gold` == 실제 골드 증가분
 *   2) 결과 화면의 `this.rewards.items` (표시될 항목) == 전투 전후 인벤토리 diff
 *      (itemId·count 가 정확히 일치해야 한다 — 하나라도 표시만 되고 실제로 없으면 실패)
 *   3) 표시된 항목 수 == diff 항목 수 (표시 안 된 유령 지급도, 지급 안 된 유령 표시도 없어야 함)
 *
 * 결정성 확보
 *   실전투는 `exp_potion_s`(chance:0.3) 처럼 확률 보상이라 매번 아이템이 나오지 않는다.
 *   `Math.random` 을 전역으로 고정하면 Phaser/WebGL 초기화까지 건드려 부팅이 깨지므로
 *   그 방법은 쓰지 않는다. 대신 두 단계로 나눠 검증한다.
 *   ① 실제 전투 1회 — 골드/아이템 몇 개가 나오든 "표시==지급"이 항상 같은지 (일치성)
 *   ② `window.__TEST_API__.grantRewardItems()` 직접 호출 — chance:1 로 반드시 당첨시켜
 *      "그리고 실제로 지급될 수 있는지"(양성 경로)를 결정적으로 확인
 *
 * 실행: PLAYTEST_BASE_URL=http://localhost:3000 node tests/e2e/reward-grant-parity.mjs
 */
import { chromium } from 'playwright';
import * as L from './playtest-lib.mjs';

const {
  BASE_URL, safeEvaluate, tapWorld, findByLabel, activeScenes, boot, guestLogin, tapLabel, visibleTexts,
  passCutscene, shot,
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

let failed = 0;
function check(cond, label, detail = '') {
  const mark = cond ? '✅' : '❌';
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed += 1;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  console.log(`=== 보상 표시==지급 대조 (${BASE_URL}) ===\n`);

  await boot(page);
  await guestLogin(page);
  await page.waitForTimeout(1500);

  await safeEvaluate(page, () => {
    const d = window.debug;
    d.unlockAllCharacters();
    d.maxResources();
    d.autoOptimalParty();
    d._refreshHeroRegistry();
  });
  await page.waitForTimeout(500);

  // 신규 게스트 계정은 프롤로그 컷신(1/8 페이지 등)부터 시작한다 — [건너뛰기] 한 번으로
  // 전체 컷신이 끝난다(확인창 없음). 혹시 연속 컷신이 더 있으면 반복한다.
  for (let round = 0; round < 5; round += 1) {
    if (!(await activeScenes(page)).includes('CutsceneScene')) break;
    const skip = await findByLabel(page, '건너뛰기');
    if (skip) {
      await tapWorld(page, skip.x, skip.y, 600);
    } else {
      await passCutscene(page, 40);
    }
    await page.waitForTimeout(800);
  }

  // 전투 전 스냅샷
  const before = await safeEvaluate(page, () => {
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
    return {
      gold: save.resources?.gold || 0,
      items: save.inventory?.items || [],
    };
  });
  console.log('전투 전 골드:', before.gold, '/ 아이템 수:', before.items.length);

  // 로비 → [전투 시작]
  const start = await findByLabel(page, '전투 시작', { exact: true, sceneKeys: ['MainMenuScene'] })
    || await findByLabel(page, '전투 시작 (', { sceneKeys: ['MainMenuScene'] });
  check(!!start, '로비에 전투 진입점 노출');
  if (!start) {
    const texts = (await visibleTexts(page)).map((t) => t.text);
    console.log('로비 텍스트:', JSON.stringify(texts));
    await browser.close(); process.exit(1);
  }

  await tapWorld(page, start.x, start.y, 2000);
  await skipCutscenes(page, 3);

  const entered = await (async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      if ((await activeScenes(page)).includes('BattleScene')) return true;
      await skipCutscenes(page, 1);
      await page.waitForTimeout(400);
    }
    return false;
  })();
  check(entered, '전투 화면 진입');
  if (!entered) { await browser.close(); process.exit(1); }

  const stageId = await safeEvaluate(page, () => window.game.scene.getScene('BattleScene')?.stage?.id);
  console.log('진입한 스테이지:', stageId);

  await page.waitForTimeout(600);
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

  const reachedResult = (await activeScenes(page)).includes('BattleResultScene');
  check(reachedResult, '결과 화면 도달');
  if (!reachedResult) { await browser.close(); process.exit(1); }
  await shot(page, '04-battle-reward-grant-parity-fixed');

  // 결과 화면에 실제로 "표시"되는 rewards 객체를 그대로 읽는다 (BattleResultScene.rewards).
  const displayed = await safeEvaluate(page, () => {
    const scene = window.game.scene.getScene('BattleResultScene');
    return {
      victory: scene?.victory,
      gold: scene?.rewards?.gold || 0,
      items: (scene?.rewards?.items || []).map((i) => ({ id: i.id, count: i.count })),
    };
  });
  console.log('결과 화면 표시 보상:', JSON.stringify(displayed));

  const after = await safeEvaluate(page, () => {
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
    return {
      gold: save.resources?.gold || 0,
      items: save.inventory?.items || [],
    };
  });
  console.log('전투 후 골드:', after.gold, '/ 아이템 수:', after.items.length);

  check(displayed.victory === true, '승리로 종료');

  // ① 골드: 표시값 == 실제 증가분
  const goldDelta = after.gold - before.gold;
  check(displayed.gold === goldDelta, '표시 골드 == 실제 골드 증가분', `표시=${displayed.gold}, 실제증가=${goldDelta}`);

  // ② 아이템: 표시된 각 항목이 인벤토리 diff 에 정확히 존재해야 한다 (itemId·count 일치)
  const beforeMap = new Map(before.items.map((i) => [i.itemId, i.count || 1]));
  const afterMap = new Map(after.items.map((i) => [i.itemId, i.count || 1]));
  const diffEntries = [];
  afterMap.forEach((count, itemId) => {
    const prevCount = beforeMap.get(itemId) || 0;
    if (count > prevCount) diffEntries.push({ id: itemId, count: count - prevCount });
  });
  console.log('인벤토리 실제 증가분:', JSON.stringify(diffEntries));

  check(displayed.items.length === diffEntries.length,
    '표시된 아이템 개수 == 실제 인벤토리 증가 항목 개수',
    `표시=${displayed.items.length}, 실제=${diffEntries.length}`);

  displayed.items.forEach((d) => {
    const match = diffEntries.find((e) => e.id === d.id && e.count === d.count);
    check(!!match, `표시된 "${d.id}" x${d.count} 가 실제 인벤토리 증가분과 일치`);
  });

  diffEntries.forEach((e) => {
    const match = displayed.items.find((d) => d.id === e.id && d.count === e.count);
    check(!!match, `실제로 늘어난 "${e.id}" x${e.count} 가 결과 화면에도 표시됨(유령 지급 없음)`);
  });

  // ③ 양성 경로 — chance:1 로 반드시 당첨시켜 실제로 지급될 수 있는지 결정적으로 확인.
  //   ①②는 확률에 따라 우연히 0개가 나와도 "일치"는 통과하므로, 이 단계가 없으면
  //   "지급 로직 자체가 항상 빈 배열만 반환해도" 테스트가 속아 넘어갈 수 있다.
  console.log('\n--- 양성 경로: chance:1 강제 지급 ---');
  const beforeDeterministic = await safeEvaluate(page, () => {
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
    const items = save.inventory?.items || [];
    const potion = items.find((i) => i.itemId === 'exp_potion_s');
    return { count: potion?.count || 0 };
  });

  const grantResult = await safeEvaluate(page, () => {
    return window.__TEST_API__.grantRewardItems([{ id: 'exp_potion_s', chance: 1, count: 2 }]);
  });
  console.log('grantRewardItems() 반환값:', JSON.stringify(grantResult));

  const afterDeterministic = await safeEvaluate(page, () => {
    const save = JSON.parse(localStorage.getItem('arcane_collectors_save') || '{}');
    const items = save.inventory?.items || [];
    const potion = items.find((i) => i.itemId === 'exp_potion_s');
    return { count: potion?.count || 0 };
  });

  check(Array.isArray(grantResult) && grantResult.length === 1 && grantResult[0].id === 'exp_potion_s' && grantResult[0].count === 2,
    'chance:1 지급 시 반환값에 exp_potion_s x2 포함', JSON.stringify(grantResult));
  check(afterDeterministic.count - beforeDeterministic.count === 2,
    'chance:1 지급 후 실제 인벤토리도 +2 증가',
    `이전=${beforeDeterministic.count}, 이후=${afterDeterministic.count}`);

  // 알 수 없는 id — 지급도 표시도 없어야 한다 (데이터 없는 아이템을 있는 척 지급 금지)
  const unknownResult = await safeEvaluate(page, () => {
    return window.__TEST_API__.grantRewardItems([{ id: 'nonexistent_item_xyz', chance: 1, count: 1 }]);
  });
  check(Array.isArray(unknownResult) && unknownResult.length === 0,
    '알 수 없는 아이템 id 는 지급 생략(빈 배열 반환)', JSON.stringify(unknownResult));

  await browser.close();

  console.log(`\n결과: ${failed === 0 ? '전부 일치' : `${failed}건 불일치`}`);
  process.exit(failed === 0 ? 0 : 1);
})();
