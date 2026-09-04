/**
 * onboarding-realbattle.mjs — 온보딩 실파티의 챕터 1 승률을 "실제 BattleScene"에서 측정한다.
 *
 * `tools/simulate/combat-turns.mjs --onboarding` 은 BattleSystem API 만 순수 호출하는
 * 시뮬레이션이라 씬 연출·시너지·턴 진행 같은 실제 경로를 지나지 않는다. 이 스모크는 같은
 * 파티 스펙(ONBOARDING_PARTY_SPEC)으로 진짜 씬을 돌려 두 결과를 대조할 수 있게 한다.
 * 시뮬레이터가 통과인데 실제로는 지는 상황(BALANCE_DESIGN_v1.md §9-10)을 잡는 것이 목적이다.
 *
 * 사전 조건: 개발 서버 실행 중
 * 실행: SMOKE_BASE_URL=http://localhost:3000 TRIALS=10 node tests/e2e/onboarding-realbattle.mjs
 * 판정: 1-1~1-5 전부 승률 100% 여야 한다(온보딩은 지는 구간이 없어야 한다).
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const VIEWPORT = { width: 720, height: 1280 };
const SAVE_KEY = 'arcane_collectors_save';
const TRIALS = Number(process.env.TRIALS || 15);

/** combat-turns.mjs ONBOARDING_PARTY_SPEC 와 동일 */
const SPEC = {
  '1-1': [{ id: 'base_iris', level: 1 }],
  '1-2': [{ id: 'base_iris', level: 1 }],
  '1-3': [{ id: 'base_iris', level: 2 }],
  '1-4': [{ id: 'base_iris', level: 2 }, { id: 'base_omar', level: 1 }],
  '1-5': [{ id: 'base_iris', level: 2 }, { id: 'base_omar', level: 1 }]
};

const waitFor = async (page, fn, t = 30000) => {
  const s = Date.now();
  while (Date.now() - s < t) {
    try { if (await page.evaluate(fn)) return true; } catch { /* 컨텍스트 전환 */ }
    await page.waitForTimeout(120);
  }
  return false;
};

const skipCut = async (page, rounds = 6) => {
  for (let i = 0; i < rounds; i += 1) {
    const up = await page.evaluate(() => !!window.game?.scene.isActive('CutsceneScene')).catch(() => false);
    if (!up) return;
    const ok = await page.evaluate(() => {
      const p = window.game?.scene.getScene('CutsceneScene')?.player;
      if (typeof p?.skipAll !== 'function') return false;
      p.skipAll(); return true;
    }).catch(() => false);
    if (!ok) await page.mouse.click(360, 640).catch(() => {});
    await page.waitForTimeout(400);
  }
};

console.log('브라우저 기동...');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: VIEWPORT });
await page.goto(BASE_URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await waitFor(page, () => !!window.game);
await waitFor(page, () => !!window.game?.scene.isActive('LoginScene'));
await page.evaluate(() => window.game?.scene.getScene('LoginScene')?._handleGuestLogin?.());
await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene') || !!window.game?.scene.isActive('CutsceneScene'), 30000);
await skipCut(page);
const menuUp = await waitFor(page, () => !!window.game?.scene.isActive('MainMenuScene'), 30000);
console.log(`메인메뉴 진입: ${menuUp}`);

const rows = [];
for (const [stageId, spec] of Object.entries(SPEC)) {
  let wins = 0;
  const turns = [];
  for (let t = 0; t < TRIALS; t += 1) {
    const started = await page.evaluate(async ({ key, stageId, spec }) => {
      const g = window.game;
      const save = JSON.parse(localStorage.getItem(key) || '{}');
      save.characters = spec.map((s, i) => ({
        id: s.id, instanceId: `${s.id}_probe_${i}`, characterId: s.id,
        level: s.level, exp: 0, stars: 3, skillLevels: [1, 1, 1],
        equipped: null, equipment: { weapon: null, armor: null, accessory: null }
      }));
      save.parties = [spec.map(s => s.id)];
      localStorage.setItem(key, JSON.stringify(save));

      const { normalizeHeroes } = await import('/src/data/index.ts');
      const party = normalizeHeroes(save.characters);
      g.registry.set('ownedHeroes', party);

      const { getStage } = await import('/src/data/index.ts');
      const found = getStage('chapter_1', stageId);
      if (!found) return null;
      const stage = { ...found, chapter: 1 };

      g.registry.set('autoBattle', true);
      g.registry.set('battleSpeed', 8);
      g.scene.getScenes(true).forEach(sc => g.scene.stop(sc.scene.key));
      g.scene.start('BattleScene', { stage, party });
      return { party: party.map(h => `${h.id} lv${h.level} hp${h.stats.hp} atk${h.stats.atk}`), stage: stage.id };
    }, { key: SAVE_KEY, stageId, spec });

    if (!started) { console.log(`${stageId} 스테이지 데이터 없음`); break; }
    if (t === 0) console.log(`${stageId} 파티: ${started.party.join(' | ')}`);
    else process.stdout.write('.');

    // 보스 스테이지는 진입 컷씬(boss_before)이 먼저 뜬다 — 건너뛰며 기다린다
    let up = false;
    const enterBy = Date.now() + 25000;
    while (Date.now() < enterBy) {
      up = await page.evaluate(() => !!window.game?.scene.isActive('BattleScene')).catch(() => false);
      if (up) break;
      await skipCut(page, 2);
      await page.waitForTimeout(300);
    }
    if (!up) { console.log(`${stageId} #${t} 전투 진입 실패`); continue; }
    await page.evaluate(() => {
      const sc = window.game?.scene.getScene('BattleScene');
      if (sc) { sc.battleSpeed = 8; sc.autoBattle = true; }
    });

    let result = null;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      result = await page.evaluate(() => {
        const sc = window.game?.scene.getScene('BattleScene');
        if (!sc) return { gone: true };
        if (!sc.battleEnded) return null;
        return {
          turn: sc.turn,
          won: (sc.enemies || []).every(e => !e.isAlive),
          allies: (sc.allies || []).filter(a => a.isAlive).length
        };
      }).catch(() => ({ gone: true }));
      if (result) break;
      await page.waitForTimeout(150);
    }
    if (!result || result.gone) { console.log(`${stageId} #${t} 관측 실패`); continue; }
    if (result.won) wins += 1;
    turns.push(result.turn);
  }
  const sorted = [...turns].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  rows.push({ stageId, wins, trials: turns.length, median, min: sorted[0] ?? null, max: sorted[sorted.length - 1] ?? null });
}

console.log('\n스테이지  승률      중앙값턴  최소-최대  시행');
for (const r of rows) {
  const rate = r.trials ? ((r.wins / r.trials) * 100).toFixed(1) : '-';
  console.log(`${r.stageId.padEnd(9)} ${String(rate).padStart(6)}%  ${String(r.median).padStart(6)}  ${String(r.min)}-${String(r.max)}  ${r.trials}`);
}
await browser.close();

const failures = rows.filter(r => r.trials === 0 || r.wins !== r.trials);
if (failures.length > 0) {
  console.log(`
결과: ${rows.length - failures.length} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`
결과: ${rows.length} passed, 0 failed`);
