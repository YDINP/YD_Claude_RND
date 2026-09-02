#!/usr/bin/env node
/**
 * ============================================================
 * BAL-07 전투 턴수 시뮬레이션 (combat-turns.mjs)
 * ============================================================
 *
 * 목표: 스테이지별 "권장 전투력 파티 vs 실제 스테이지 적" 전투를 시뮬레이션해
 * 소요 턴수가 설계 목표(일반 3-8턴, BALANCE_DESIGN_v1.md §6-1)를 만족하는지 검증한다.
 *
 * ── 실제 전투 엔진을 그대로 돌린다 ──────────────────────────────────
 * 예전 이 스크립트는 데미지식·AI·턴 루프를 "파일+라인 인용과 함께 이식"해 썼다.
 * BattleScene이 BattleSystem으로 판정을 위임한 지금은 이식본을 유지할 이유가 없다.
 * Vite의 SSR 로더(ssrLoadModule)로 src/systems/BattleSystem.js와
 * src/systems/BattleSceneAdapter.js를 그대로 불러 **실제 전투 코드**를 실행한다.
 * (순수 node는 .ts 확장자 해석과 JSON import attribute 때문에 이 체인을 못 읽는다.
 *  vitest가 쓰는 것과 같은 vite.config.js 리졸버를 그대로 재사용한다.)
 *
 * 턴 루프는 BattleScene.processTurn/executeBattlerAction과 같은 순서다:
 *   턴 시작 교단 훅 → 행동 결정(getAIAction+스마트타겟) → 시전 훅 → resolveDamage → 게이지
 * 대상 확장(AoE 0.7배)과 게이지 규칙은 BattleSceneAdapter의 함수를 공유한다.
 *
 * ── 단순화(명시) ──────────────────────────────────────────────────────
 * 교단 메커니즘은 이제 실제로 돈다. 다만 대표 파티에 교단을 부여하지 않으므로
 * (아래 makeAllyParty는 cult 없는 대표 유닛을 만든다) 아군 쪽 교단 효과는 발동하지 않는다.
 * 적은 enemies.json의 실제 데이터를 쓰므로 교단이 있으면 그대로 반영된다.
 * 아군 스킬2/궁극기/힐러는 대표 파티에 포함하지 않는다(스킬1까지만 — 설계 §3-1
 * "스킬Lv0" 밴드 정의보다는 여유를 준 실전형 가정). 이는 실전 대비 다소 보수적인
 * (턴수를 늘리는 방향의) 근사이며, 결과가 "너무 느림(>8턴)"으로 나오면 실제로는
 * 더 짧을 가능성이 있다는 점을 §9 해석 시 감안한다.
 *
 * ── 파티 전투력 가정 (중요) ──────────────────────────────────────────
 * 파티 전투력 = stage.recommendedPower 로 그대로 두면 안 된다. 실측 근거
 * (docs/story/SYSTEM_ONBOARDING_ECONOMY.md §1-5): 1-1(recommendedPower 100)에
 * 실제 진입하는 파티는 아이리스 Lv1 "단독" 403 전투력으로 이미 4.03×다.
 * recommendedPower는 UI 권장치일 뿐 "그 시점 실제 파티 전투력"이 아니다.
 * 대신 docs/balance/BALANCE_DESIGN_v1.md §4-1의 마일스톤 실측 앵커
 * (Day1/Day3/Day7/Day14/Day30 파티 전투력 추정치)와 위 온보딩 실측치를
 * 스테이지 인덱스(0=1-1 ~ 24=5-5)에 로그선형 보간해 각 스테이지의
 * "그 시점 파티 전투력"을 추정한다 (MILESTONE_ANCHORS, 하드코딩 값은
 * 전부 실제 설계 문서에서 인용 — 임의 생성 아님).
 * 개별 스탯은 base+ascended 34명 만렙 평균 비율로 배분(아래 STAT_SHARE, 본 스크립트가
 * grade-order.mjs와 동일 SSOT로 직접 산출 — 하드코딩 아님).
 *
 * 실행: node tools/simulate/combat-turns.mjs [--trials 60]
 * 종료 코드: 중앙값 턴수가 [3,8] 밖인 스테이지가 1개라도 있으면 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const trialsIdx = args.indexOf('--trials');
const TRIALS = trialsIdx >= 0 ? Number(args[trialsIdx + 1]) : 60;

const stagesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/stages.json'), 'utf-8'));
const enemiesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/enemies.json'), 'utf-8')).enemies;
const baseHeroes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/base-heroes.json'), 'utf-8')).baseHeroes;
const ascendedHeroes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ascended-heroes.json'), 'utf-8')).ascendedHeroes;

const enemyById = new Map(enemiesData.map(e => [e.id, e]));

// ---------- 실제 전투 코드 로드 (vite SSR — vitest와 동일한 리졸버) ----------
const viteServer = await createServer({
  root: ROOT,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true }
});
const {
  toBattleUnit,
  createSceneBattleSystem,
  decideSceneAction,
  expandActionTargets,
  applyGaugeAfterAction
} = await viteServer.ssrLoadModule('/src/systems/BattleSceneAdapter.js');

/** BattleSystem은 진행 상황을 console.log로 쏟아 낸다. 시뮬레이션 동안만 막는다 */
const realLog = console.log;
const silence = () => { console.log = () => {}; };
const unsilence = () => { console.log = realLog; };


// ---------- 대표 아군 스탯 비율 (34명 만렙 기준, grade-order.mjs와 동일 SSOT) ----------
const MAX_LEVEL = { N: 30, R: 40, SR: 50, SSR: 60 };
const DEFAULT_STARS_BY_RARITY = { N: 1, R: 2, SR: 3, SSR: 4 };
const STAT_KEYS = ['hp', 'atk', 'def', 'spd'];

function finalStatsAtMax(stats, growth, maxLevel, rarityKey) {
  const steps = maxLevel - 1;
  const base = {};
  for (const k of STAT_KEYS) base[k] = Math.floor((stats[k] || 0) + (growth[k] || 0) * steps);
  const stars = DEFAULT_STARS_BY_RARITY[rarityKey];
  const bonusPercent = (stars - 1) * 5;
  const starBonus = { hp: bonusPercent, atk: bonusPercent, def: bonusPercent, spd: Math.floor(bonusPercent / 2) };
  const final = {};
  for (const k of STAT_KEYS) final[k] = Math.floor(base[k] * (1 + starBonus[k] / 100));
  return final;
}

function computeStatShares() {
  const shares = [];
  baseHeroes.forEach(h => {
    const f = finalStatsAtMax(h.stats, h.growthStats, h.maxLevel || 30, 'N');
    const power = f.hp / 10 + f.atk + f.def + f.spd;
    shares.push({ hp: f.hp / 10 / power, atk: f.atk / power, def: f.def / power, spd: f.spd / power });
  });
  ascendedHeroes.forEach(h => {
    const f = finalStatsAtMax(h.stats, h.growthStats, h.maxLevel, h.rarity);
    const power = f.hp / 10 + f.atk + f.def + f.spd;
    shares.push({ hp: f.hp / 10 / power, atk: f.atk / power, def: f.def / power, spd: f.spd / power });
  });
  const avg = key => shares.reduce((s, x) => s + x[key], 0) / shares.length;
  return { hp: avg('hp'), atk: avg('atk'), def: avg('def'), spd: avg('spd') };
}

const STAT_SHARE = computeStatShares();

// 마일스톤 앵커: [스테이지 flatIndex(0=1-1), 파티 전투력]
// 403  = base_iris Lv1 단독 전투력 (SYSTEM_ONBOARDING_ECONOMY.md §1-5 실측, 1-1 진입 시점)
// 1600 = Day1 마일스톤 파티 (BALANCE_DESIGN_v1.md §4-1, "달성 가능 스테이지 1-3")
// 4200 = Day3 마일스톤 파티 (동 문서, 달성 가능 스테이지 2-4)
// 7500 = Day7 마일스톤 파티 (동 문서, 달성 가능 스테이지 4-4)
// 10500= Day14 마일스톤 파티 (동 문서, 달성 가능 스테이지 5-2)
// 13000= Day30 마일스톤 파티 (동 문서, 5-5 직전 — 문서도 "0.963× 3.7% 부족"으로 명시)
const MILESTONE_ANCHORS = [
  [0, 403],
  [2, 1600],
  [8, 4200],
  [18, 7500],
  [21, 10500],
  [24, 13000]
];

function partyPowerForStageIndex(index) {
  const anchors = MILESTONE_ANCHORS;
  if (index <= anchors[0][0]) return anchors[0][1];
  if (index >= anchors[anchors.length - 1][0]) return anchors[anchors.length - 1][1];
  for (let k = 0; k < anchors.length - 1; k++) {
    const [i0, v0] = anchors[k];
    const [i1, v1] = anchors[k + 1];
    if (index >= i0 && index <= i1) {
      const t = (index - i0) / (i1 - i0);
      return Math.exp(Math.log(v0) + (Math.log(v1) - Math.log(v0)) * t);
    }
  }
  return anchors[anchors.length - 1][1];
}

// 아군 스킬1 평균 (ascended-heroes.json 24명 실측 — BAL-BLK03 팀리드 세션에서 산출)
function computeAllySkillKit() {
  let basicGain = [];
  let s1Mult = [];
  let s1Gauge = [];
  ascendedHeroes.forEach(hero => {
    const basic = hero.skills.find(s => s.id === 'basic');
    const s1 = hero.skills.find(s => s.id === 'skill1');
    if (basic) basicGain.push(basic.gaugeGain);
    if (s1) {
      s1Mult.push(s1.multiplier);
      s1Gauge.push(s1.gaugeCost);
    }
  });
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    basic: { id: 'basic', multiplier: 1.0, gaugeGain: Math.round(avg(basicGain)), target: 'single' },
    skill1: { id: 'skill1', multiplier: Number(avg(s1Mult).toFixed(2)), gaugeCost: Math.round(avg(s1Gauge)), target: 'single' }
  };
}
const ALLY_SKILLS = computeAllySkillKit();

const MOODS = ['brave', 'fierce', 'wild', 'calm', 'stoic', 'devoted', 'cunning', 'noble', 'mystic'];

/** 대표 아군 4인 — 교단 없음(cult=null), 스킬은 24명 평균 킷 */
function makeAllyParty(partyPower) {
  const perHero = partyPower / 4;
  const party = [];
  for (let i = 0; i < 4; i++) {
    const hp = Math.max(1, Math.floor(10 * perHero * STAT_SHARE.hp));
    const atk = Math.max(1, Math.floor(perHero * STAT_SHARE.atk));
    const def = Math.max(0, Math.floor(perHero * STAT_SHARE.def));
    const spd = Math.max(1, Math.floor(perHero * STAT_SHARE.spd));
    party.push(toBattleUnit({
      id: `sim_ally_${i}`,
      name: `아군${i}`,
      isAlly: true,
      position: i,
      mood: MOODS[i % MOODS.length],
      stats: { hp, atk, def, spd },
      skills: [ALLY_SKILLS.basic, ALLY_SKILLS.skill1],
      source: { id: `sim_ally_${i}` }
    }));
  }
  return party;
}

/** 스테이지 적 — enemies.json 실데이터 + BattleScene과 같은 스킬 킷 구성 */
function makeEnemies(stage) {
  return stage.enemies.map((def, i) => {
    const enemyData = enemyById.get(def.id);
    if (!enemyData) {
      throw new Error(`enemies.json에 ${def.id}가 없습니다 (stage ${stage.id})`);
    }
    const level = def.level || 1;
    const lvSteps = level - 1;
    return toBattleUnit({
      id: def.id,
      name: enemyData.name || def.id,
      isAlly: false,
      position: i,
      level,
      mood: enemyData.mood || 'brave',
      stats: {
        hp: enemyData.stats.hp + enemyData.growthStats.hp * lvSteps,
        atk: enemyData.stats.atk + enemyData.growthStats.atk * lvSteps,
        def: enemyData.stats.def + enemyData.growthStats.def * lvSteps,
        spd: enemyData.stats.spd + enemyData.growthStats.spd * lvSteps
      },
      skills: [
        { id: 'basic', name: '기본 공격', multiplier: 1.0, gaugeCost: 0, target: 'single', gaugeGain: 30 },
        ...(enemyData.skills || []).map(sId => ({
          id: sId, name: sId, multiplier: 1.3, gaugeCost: 40, target: 'single', gaugeGain: 0
        }))
      ],
      isBoss: def.isBoss || enemyData.type === 'boss',
      source: enemyData
    });
  });
}

/**
 * 전투 1회 시뮬레이션 — BattleScene.processTurn/executeBattlerAction과 같은 순서로
 * 실제 BattleSystem API만 호출한다. 라운드 1바퀴 = turnCount 1 증가, maxTurns=30.
 * @returns {{ outcome: 'victory'|'defeat'|'timeout', turns: number }}
 */
function simulateBattle(allies, enemies) {
  const battleSystem = createSceneBattleSystem(allies, enemies);
  const MAX_TURNS = battleSystem.maxTurns;

  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    battleSystem.turnCount = turn;
    battleSystem.calculateTurnOrder();

    for (const unit of battleSystem.turnOrder.filter(u => u.isAlive)) {
      if (!unit.isAlive) continue;

      const cultTurn = battleSystem.applyCultTurnStart(unit);
      if (!unit.isAlive || cultTurn.blocked) continue;

      const action = decideSceneAction(battleSystem, unit);
      if (!action) break;

      battleSystem.applyCultSkillUse(unit, action.targets, action.skill);

      const { targets, multiplier } = expandActionTargets(battleSystem, unit, action);
      for (const target of targets) {
        if (!target.isAlive) continue;
        battleSystem.resolveDamage(unit, target, { ...action.skill, multiplier });
      }
      applyGaugeAfterAction(unit, action);

      if (battleSystem.isVictory()) return { outcome: 'victory', turns: turn };
      if (battleSystem.isDefeat()) return { outcome: 'defeat', turns: turn };
    }
  }

  return { outcome: 'timeout', turns: MAX_TURNS };
}

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---------- 메인 ----------
console.log(`대표 스탯 비율(STAT_SHARE, 34명 만렙 평균): hp=${STAT_SHARE.hp.toFixed(3)} atk=${STAT_SHARE.atk.toFixed(3)} def=${STAT_SHARE.def.toFixed(3)} spd=${STAT_SHARE.spd.toFixed(3)}`);
console.log(`아군 대표 스킬킷: basic(gaugeGain=${ALLY_SKILLS.basic.gaugeGain}) / skill1(mult=${ALLY_SKILLS.skill1.multiplier}, gaugeCost=${ALLY_SKILLS.skill1.gaugeCost})`);
console.log(`시행 횟수: 스테이지당 ${TRIALS}회\n`);

const flatStages = [];
for (const chapter of stagesData.chapters) {
  for (const stage of chapter.stages) flatStages.push(stage);
}

const results = [];
silence(); // BattleSystem의 진행 로그를 시뮬레이션 동안만 막는다
flatStages.forEach((stage, index) => {
  const partyPower = partyPowerForStageIndex(index);
  const turnsList = [];
  let victories = 0, defeats = 0, timeouts = 0;

  for (let t = 0; t < TRIALS; t++) {
    const allies = makeAllyParty(partyPower);
    const enemies = makeEnemies(stage);
    const { outcome, turns } = simulateBattle(allies, enemies);
    if (outcome === 'victory') { victories++; turnsList.push(turns); }
    else if (outcome === 'defeat') defeats++;
    else timeouts++;
  }

  const med = median(turnsList);
  results.push({
    id: stage.id,
    recommendedPower: stage.recommendedPower,
    partyPower: Math.round(partyPower),
    ratio: partyPower / stage.recommendedPower,
    enemyCount: stage.enemies.length,
    isBossLike: stage.enemies.length === 1,
    medianTurns: med,
    minTurns: turnsList.length ? Math.min(...turnsList) : null,
    maxTurns: turnsList.length ? Math.max(...turnsList) : null,
    victories,
    defeats,
    timeouts
  });
});
unsilence();
await viteServer.close();

console.log('스테이지  요구BP  파티BP  비율   중앙값턴  최소-최대  승/패/시간초과  판정');
const failures = [];
results.forEach(r => {
  const inRange = r.medianTurns !== null && r.medianTurns >= 3 && r.medianTurns <= 8;
  const pass = inRange;
  if (!pass) failures.push(r);
  console.log(
    `${r.id.padEnd(8)} ${String(r.recommendedPower).padStart(6)}  ${String(r.partyPower).padStart(6)}  ${r.ratio.toFixed(2)}x  ` +
    `${r.medianTurns === null ? ' N/A ' : String(r.medianTurns).padStart(5)}   ` +
    `${r.minTurns ?? '-'}-${r.maxTurns ?? '-'}      ` +
    `${r.victories}/${r.defeats}/${r.timeouts}          ${pass ? 'PASS' : 'FAIL'}`
  );
});

console.log('\n' + '='.repeat(70));
if (failures.length === 0) {
  console.log(`전체 통과 (combat-turns) — 25/25 스테이지 중앙값 턴수 3~8 범위`);
  process.exit(0);
} else {
  console.log(`목표(3~8턴) 이탈 ${failures.length}건:`);
  failures.forEach(r => {
    const label = r.medianTurns === null ? '전승 없음(전패/시간초과)' : r.medianTurns < 3 ? '너무 빠름' : '너무 느림';
    console.log(`  - ${r.id} (요구 ${r.recommendedPower}): 중앙값 ${r.medianTurns ?? 'N/A'}턴, 승${r.victories}/패${r.defeats}/초과${r.timeouts} — ${label}`);
  });
  process.exit(1);
}
