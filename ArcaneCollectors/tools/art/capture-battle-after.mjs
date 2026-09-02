/**
 * capture-battle-after.mjs — T-17/T-18 리디자인 후 전투·전투결과 화면 캡처
 * 실행: node tools/art/capture-battle-after.mjs   (사전: vite dev 서버 기동)
 *
 * 출력: docs/redesign/screenshots/after/battle-*.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import path from 'path';

const BASE_URL = process.env.CAP_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('docs/redesign/screenshots/after');
mkdirSync(OUT, { recursive: true });

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
  const ok = await waitFor(page, `!!window.game && window.game.scene.isActive('${key}')`, 15000);
  return ok;
}

const STAGE_BATTLE = {
  id: '1-2',
  chapter: 1,
  name: '울창한 숲길',
  recommendedPower: 150,
  energyCost: 6,
  enemies: [
    { id: 'enemy_goblin', level: 2 },
    { id: 'enemy_goblin', level: 2 },
    { id: 'enemy_wolf', level: 1 }
  ],
  rewards: { gold: 120, exp: 60 }
};

const PARTY_STUB = [
  { id: 'hero_005', name: '아이리스', class: 'mage', cult: 'olympus', stats: { hp: 900, atk: 90, def: 65, spd: 95 },
    skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 30 }, { id: 'skill1', name: '뇌창', multiplier: 1.6, gaugeCost: 100, target: 'single', gaugeGain: 0 }] },
  { id: 'hero_006', name: '카산드라', class: 'warrior', cult: 'asgard', stats: { hp: 1100, atk: 70, def: 90, spd: 60 },
    skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 30 }, { id: 'skill1', name: '방패 밀치기', multiplier: 1.4, gaugeCost: 100, target: 'single', gaugeGain: 0 }] },
  { id: 'hero_007', name: '레이븐', class: 'archer', cult: 'yomi', stats: { hp: 780, atk: 110, def: 50, spd: 88 },
    skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 30 }, { id: 'skill1', name: '그림자 화살', multiplier: 1.7, gaugeCost: 100, target: 'single', gaugeGain: 0 }] },
  { id: 'hero_008', name: '세라핌', class: 'healer', cult: 'avalon', stats: { hp: 860, atk: 65, def: 70, spd: 72 },
    skills: [{ id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 30 }, { id: 'skill1', name: '치유의 빛', multiplier: 1.2, gaugeCost: 100, target: 'ally', gaugeGain: 0, isHeal: true }] }
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', e => log(`  [err] ${e.message.slice(0, 160)}`));

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitFor(page, 'document.querySelector("canvas") !== null', 25000);

  await waitFor(page, `window.game && window.game.scene.isActive('LoginScene')`, 20000);
  await page.evaluate(() => {
    const sc = window.game.scene.getScene('LoginScene');
    if (sc && sc._handleGuestLogin) sc._handleGuestLogin();
  });
  await waitFor(page, `window.game.scene.isActive('MainMenuScene')`, 25000);
  await page.waitForTimeout(2000);

  // --- 1. 전투 중 ---
  const okBattle = await startScene(page, 'BattleScene', {
    stage: STAGE_BATTLE, mode: 'normal', party: PARTY_STUB
  });
  if (!okBattle) throw new Error('BattleScene 진입 실패');
  await page.waitForTimeout(3600);   // 인트로(1.5s) + 1턴 진행
  await shot(page, 'battle-midfight');

  // --- 2. 교단 배지 표기 확인 (표시 전용. cultState 를 주입해 배지 렌더를 검증한다) ---
  const badgeCount = await page.evaluate(() => {
    const sc = window.game.scene.getScene('BattleScene');
    if (!sc || !sc.allies) return -1;
    if (sc.allies[0]) sc.allies[0].cultState = { divinity: 60, doom: 0, barrier: 0, runes: [], statuses: [] };
    if (sc.allies[1]) sc.allies[1].cultState = { divinity: 0, doom: 0, barrier: 180, runes: ['atk', 'def'], statuses: [] };
    if (sc.enemies[0]) sc.enemies[0].cultState = { divinity: 0, doom: 4, barrier: 0, runes: [], statuses: [{ type: 'curse', duration: 2 }] };
    [...sc.allies, ...sc.enemies].forEach(b => { if (b.cultState) sc.updateCultBadges(b); });
    return [...sc.allies, ...sc.enemies].filter(b => b.cultState).length;
  });
  log(`  [info] 교단 배지 주입 유닛 ${badgeCount}`);
  await page.waitForTimeout(600);
  await shot(page, 'battle-cultbadge');

  // --- 3. 승리 결과 ---
  const okWin = await startScene(page, 'BattleResultScene', {
    victory: true,
    stars: 3,
    rewards: { gold: 1240, exp: 360, items: [{ itemId: 'exp_potion_s', name: '경험치 물약', count: 2 }] },
    levelUpResults: [{ name: '아이리스', newLevel: 6, gained: 1 }],
    stage: { id: '2-3', chapter: 2, name: '무너진 성벽' },
    party: PARTY_STUB,
    turnCount: 14,
    aliveCount: 4,
    totalAllies: 4,
    mode: 'normal'
  });
  if (!okWin) throw new Error('승리 결과 진입 실패');
  await page.waitForTimeout(4500);   // 배경 지연 로드 완료까지
  await shot(page, 'battle-result-victory');

  // --- 4. 패배 결과 (보스 분기: StageWallRules 진단 + 재도전 정책) ---
  const okLose = await startScene(page, 'BattleResultScene', {
    victory: false,
    stars: 0,
    rewards: { gold: 0, exp: 0 },
    levelUpResults: [],
    stage: { id: '3-5', chapter: 3, name: '요미의 문지기', isBoss: true, energyCost: 20, recommendedPower: 12000 },
    party: PARTY_STUB,
    turnCount: 22,
    aliveCount: 0,
    totalAllies: 4,
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
