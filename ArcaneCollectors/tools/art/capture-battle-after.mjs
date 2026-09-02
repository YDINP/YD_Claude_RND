/**
 * capture-battle-after.mjs — T-17/T-18 리디자인 후 전투·전투결과 화면 캡처
 * 실행: node tools/art/capture-battle-after.mjs   (사전: vite dev 서버 기동)
 *
 * 출력: docs/redesign/screenshots/after/battle-*.png
 *
 * 파티는 세이브에 실제 영웅 4인을 주입해 만든다. 예전 판본은 가짜 영웅 id 를
 * BattleScene 에 직접 넘겼는데, 그런 id 는 portrait-mapping.json 에 없으므로
 * HeroAssetLoader 가 플레이스홀더 캔버스를 굽는다. 그러면 캡처만 보고
 * "전투 씬이 포트레이트를 못 쓴다"고 오해하게 된다 — 실제 로스터로 찍는다.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/redesign/screenshots/after');
mkdirSync(OUT, { recursive: true });

const SAVE_KEY = 'arcane_collectors_save';
/** portrait-mapping.json 에 등재된 실제 영웅 4인 (클래스가 서로 다르다) */
const PARTY_HEROES = ['asc_iris_olympus', 'asc_sera_avalon', 'asc_kai_yomi', 'asc_luca_asgard'];
const HERO_LEVEL = 40;
/** 관측용 스테이지 — 아군이 한 턴에 전멸하지 않을 만큼 짧고 적이 셋이다 */
const CHAPTER = 1;
const STAGE_ID = '1-2';

const log = (...a) => console.log(...a);
const saved = [];

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  saved.push(name);
  log(`  [shot] ${name}.png`);
}

async function waitFor(page, fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await page.evaluate(fn)) return true; } catch { /* retry */ }
    await page.waitForTimeout(150);
  }
  return false;
}

async function startScene(page, key, data = null) {
  await page.evaluate(({ key, data }) => {
    if (!window.game) return;
    const g = window.game;
    g.scene.getScenes(true).forEach(sc => { if (sc.scene.key !== key) g.scene.stop(sc.scene.key); });
    g.scene.start(key, data || undefined);
  }, { key, data });
  return waitFor(page, `!!window.game && window.game.scene.isActive('${key}')`, 15000);
}

async function skipCutsceneIfAny(page) {
  if (!await waitFor(page, `!!window.game && window.game.scene.isActive('CutsceneScene')`, 6000)) return;
  await page.evaluate(() => window.game.scene.getScene('CutsceneScene')?.player?.skipAll?.());
  await waitFor(page, `!window.game.scene.isActive('CutsceneScene')`, 10000);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', e => log(`  [err] ${e.message.slice(0, 160)}`));

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, 'document.querySelector("canvas") !== null', 25000);

  await waitFor(page, `window.game && window.game.scene.isActive('LoginScene')`, 25000);
  await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
  await waitFor(page, `window.game.scene.isActive('MainMenuScene')`, 30000);

  // --- 실제 영웅 4인 지급 후 재기동 ---
  await page.evaluate(({ key, heroes, level }) => {
    const save = JSON.parse(localStorage.getItem(key) || '{}');
    save.characters = save.characters || [];
    heroes.forEach((id, index) => {
      if (save.characters.some(c => c.characterId === id)) return;
      save.characters.push({
        id,
        instanceId: `${id}_cap_${index}`,
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
  }, { key: SAVE_KEY, heroes: PARTY_HEROES, level: HERO_LEVEL });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, 'document.querySelector("canvas") !== null', 25000);
  if (await page.evaluate(() => !!window.game?.scene.isActive('LoginScene'))) {
    await page.evaluate(() => window.game.scene.getScene('LoginScene')?._handleGuestLogin?.());
  }
  await waitFor(page, `window.game.scene.isActive('MainMenuScene')`, 30000);
  await page.waitForTimeout(1500);

  // --- 1. 전투 중 (실플레이 경로: 스테이지 선택 → 자동 편성 → 출격) ---
  await startScene(page, 'StageSelectScene');
  await page.waitForTimeout(800);
  const launched = await page.evaluate(({ chapter, stageId }) => {
    const scene = window.game.scene.getScene('StageSelectScene');
    const stage = scene.generateStages(chapter).find(st => st.id === stageId);
    if (!stage) return null;
    scene.selectedStage = stage;
    scene.showPartySelect();
    scene.autoFillParty();
    const party = scene.partySlots.filter(sl => sl.hero).map(sl => sl.hero.id);
    scene.startBattle();
    return party;
  }, { chapter: CHAPTER, stageId: STAGE_ID });
  log(`  [info] 출격 파티 ${JSON.stringify(launched)}`);

  await skipCutsceneIfAny(page);
  if (!await waitFor(page, `window.game.scene.isActive('BattleScene')`, 20000)) {
    throw new Error('BattleScene 진입 실패');
  }
  await page.waitForTimeout(3600);   // 인트로(1.5s) + 1턴 진행

  // 아군 스프라이트가 실제 포트레이트인지(플레이스홀더 캔버스가 아닌지) 확인
  const portraits = await page.evaluate(() => {
    const g = window.game;
    const sc = g.scene.getScene('BattleScene');
    return (sc.allySprites || []).map(container => {
      const sprite = container.getData('sprite');
      const key = sprite?.texture?.key;
      const src = key && g.textures.exists(key) ? g.textures.get(key).source[0] : null;
      return {
        key,
        isCanvas: !!(src?.image?.tagName === 'CANVAS'),
        w: src?.width ?? 0,
        h: src?.height ?? 0
      };
    });
  });
  const real = portraits.filter(p => p.key && !p.isCanvas);
  log(`  [check] 아군 스프라이트 ${portraits.length}개 / 실포트레이트 ${real.length}개`);
  portraits.forEach(p => log(`          ${p.key} ${p.w}x${p.h} ${p.isCanvas ? '(플레이스홀더)' : '(실이미지)'}`));
  if (portraits.length === 0 || real.length !== portraits.length) {
    throw new Error(`아군 포트레이트 검증 실패: ${JSON.stringify(portraits)}`);
  }

  await shot(page, 'battle-midfight');

  // --- 2. 교단 배지 표기 (BattleSystem 이 실제로 채우는 값에 더해 미구현 항목을 주입해 렌더 검증) ---
  const badgeCount = await page.evaluate(() => {
    const sc = window.game.scene.getScene('BattleScene');
    if (!sc || !sc.allies) return -1;
    if (sc.allies[0]) Object.assign(sc.allies[0].cultState ??= {}, { divinity: 60 });
    if (sc.allies[1]) Object.assign(sc.allies[1].cultState ??= {}, { barrier: 180, runes: ['atk', 'def'] });
    if (sc.enemies[0]) Object.assign(sc.enemies[0].cultState ??= {}, { doom: 4, statuses: [{ type: 'curse', duration: 2 }] });
    [...sc.allies, ...sc.enemies].forEach(b => { if (b.cultState) sc.updateCultBadges(b); });
    return [...sc.allies, ...sc.enemies].filter(b => b.cultState).length;
  });
  log(`  [info] 교단 배지 표기 유닛 ${badgeCount}`);
  await page.waitForTimeout(600);
  await shot(page, 'battle-cultbadge');

  const partyStub = await page.evaluate(() => {
    const sc = window.game.scene.getScene('BattleScene');
    return (sc.allies || []).map(a => ({ id: a.id, name: a.name, class: a.class, stats: a.stats }));
  });

  // --- 3. 승리 결과 ---
  const okWin = await startScene(page, 'BattleResultScene', {
    victory: true,
    stars: 3,
    rewards: { gold: 1240, exp: 360, items: [{ itemId: 'exp_potion_s', name: '경험치 물약', count: 2 }] },
    levelUpResults: [{ name: partyStub[0]?.name, newLevel: HERO_LEVEL + 1, gained: 1 }],
    stage: { id: '2-3', chapter: 2, name: '무너진 성벽' },
    party: partyStub,
    turnCount: 14,
    aliveCount: partyStub.length,
    totalAllies: partyStub.length,
    mode: 'normal'
  });
  if (!okWin) throw new Error('승리 결과 진입 실패');
  await skipCutsceneIfAny(page);
  await page.waitForTimeout(4500);   // 배경 지연 로드 완료까지
  await shot(page, 'battle-result-victory');

  // --- 4. 패배 결과 (보스 분기: StageWallRules 진단 + 재도전 정책) ---
  const okLose = await startScene(page, 'BattleResultScene', {
    victory: false,
    stars: 0,
    rewards: { gold: 0, exp: 0 },
    levelUpResults: [],
    stage: { id: '3-5', chapter: 3, name: '요미의 문지기', isBoss: true, energyCost: 20, recommendedPower: 12000 },
    party: partyStub,
    turnCount: 22,
    aliveCount: 0,
    totalAllies: partyStub.length,
    mode: 'boss',
    enemyHpRemainRatio: 0.18
  });
  if (!okLose) throw new Error('패배 결과 진입 실패');
  await page.waitForTimeout(4500);   // 배경 지연 로드 완료까지
  await shot(page, 'battle-result-defeat');

  log(`\nTOTAL ${saved.length} -> ${OUT}`);
  log(saved.join(', '));
} finally {
  await browser.close();
}
