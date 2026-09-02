#!/usr/bin/env node
/**
 * ============================================================
 * BAL-07 전투 턴수 시뮬레이션 (combat-turns.mjs)
 * ============================================================
 *
 * 목표: 스테이지별 "권장 전투력 파티 vs 실제 스테이지 적" 전투를 시뮬레이션해
 * 소요 턴수가 설계 목표(일반 3-8턴, BALANCE_DESIGN_v1.md §6-1)를 만족하는지 검증한다.
 *
 * ── 왜 BattleSystem.js를 직접 import하지 않는가 ──────────────────────
 * src/systems/BattleSystem.js → src/systems/SaveManager.js → src/utils/GameLogger.js
 * 로 이어지는 임포트 체인이 .ts 확장자 파일을 확장자 없이 참조하며, 이 해석은
 * Vite/Vitest의 리졸버에 의존한다. 순수 `node` 실행에서는 해석되지 않는다
 * (tools/simulate/gacha-sim.mjs가 동일한 이유로 GachaSystem.js를 직접 import하지
 * 않고 SSOT 값을 이식한 전례를 따른다). 따라서 이 스크립트는 실제 전투 로직을
 * "파일+라인 인용과 함께 그대로 이식"한다 — 재량으로 새 공식을 만들지 않는다.
 *
 * SSOT (실제 시스템에서 그대로 이식, 인용):
 *   - src/systems/BattleSystem.js
 *       calculateDamage()      L1070-1119 (ATK×배율 → DEF 감쇠 → 분위기 → 크리 → 분산)
 *       getMoodBonus()         L1127-1158 (분위기 상성 매트릭스, ±20%)
 *       getAIAction()          L1165-1223 (스킬 게이지 충분 시 skill1 우선, 아니면 기본공격)
 *       selectTarget()         L1230-1236 (최소 HP 타겟)
 *       BattleUnit.critRate/critDmg 기본값 L336-337 (0.05 / 1.5)
 *       BasicAttackStrategy    L32-57  (게이지 충전, PowerStrikeStrategy L84 게이지 소비→0)
 *       processTurn/getNextUnit L700-832 (라운드 1바퀴 = turnCount 1 증가, maxTurns=30 L517)
 *   - src/data/index.ts calculateEnemyStats() L380-391 (base + growth×(level-1), floor 없음)
 *   - src/scenes/BattleScene.js L296-301 (적 스킬 kit: basic mult1.0/gaugeCost0/gaugeGain30
 *       + enemyData.skills 각각 mult1.3/gaugeCost40)
 *   - 아군 스킬 kit: ascended-heroes.json 24명 평균값으로 대표 파티 구성
 *       (basic gaugeGain 25, skill1 multiplier 1.80/gaugeCost 100 — 본 스크립트에서 직접 집계)
 *
 * ── 단순화(명시) ──────────────────────────────────────────────────────
 * CultMechanicsSystem(방어막/룬/상태이상)은 모델링하지 않는다(교단 배율=1 고정).
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
const MOOD_ADVANTAGE = {
  brave: ['wild', 'cunning'],
  fierce: ['brave', 'noble'],
  wild: ['fierce', 'mystic'],
  calm: ['devoted', 'fierce'],
  stoic: ['calm', 'wild'],
  devoted: ['stoic', 'brave'],
  cunning: ['mystic', 'calm'],
  noble: ['cunning', 'devoted'],
  mystic: ['noble', 'stoic']
};

function getMoodBonus(attackerMood, defenderMood) {
  if (!attackerMood || !defenderMood || attackerMood === defenderMood) return 0;
  if (attackerMood === 'neutral' || defenderMood === 'neutral') return 0;
  const advantages = MOOD_ADVANTAGE[attackerMood];
  if (!advantages) return 0;
  if (advantages.includes(defenderMood)) return 0.2;
  const defAdv = MOOD_ADVANTAGE[defenderMood];
  if (defAdv && defAdv.includes(attackerMood)) return -0.2;
  return 0;
}

function makeAllyParty(partyPower) {
  const perHero = partyPower / 4;
  const party = [];
  for (let i = 0; i < 4; i++) {
    const hp = Math.max(1, Math.floor(10 * perHero * STAT_SHARE.hp));
    const atk = Math.max(1, Math.floor(perHero * STAT_SHARE.atk));
    const def = Math.max(0, Math.floor(perHero * STAT_SHARE.def));
    const spd = Math.max(1, Math.floor(perHero * STAT_SHARE.spd));
    party.push({
      id: `ally_${i}`,
      isEnemy: false,
      maxHp: hp,
      currentHp: hp,
      atk,
      def,
      spd,
      mood: MOODS[i % MOODS.length],
      critRate: 0.05,
      critDmg: 1.5,
      skillGauge: 0,
      skills: { basic: ALLY_SKILLS.basic, skill1: ALLY_SKILLS.skill1 },
      isAlive: true
    });
  }
  return party;
}

function makeEnemies(stage) {
  return stage.enemies.map((def, i) => {
    const enemyData = enemyById.get(def.id);
    if (!enemyData) {
      throw new Error(`enemies.json에 ${def.id}가 없습니다 (stage ${stage.id})`);
    }
    const level = def.level || 1;
    const lvSteps = level - 1;
    const hp = enemyData.stats.hp + enemyData.growthStats.hp * lvSteps;
    const atk = enemyData.stats.atk + enemyData.growthStats.atk * lvSteps;
    const edef = enemyData.stats.def + enemyData.growthStats.def * lvSteps;
    const spd = enemyData.stats.spd + enemyData.growthStats.spd * lvSteps;
    const extraSkills = (enemyData.skills || []).map(sId => ({
      id: sId, multiplier: 1.3, gaugeCost: 40, target: 'single'
    }));
    return {
      id: `${def.id}_${i}`,
      isEnemy: true,
      maxHp: hp,
      currentHp: hp,
      atk,
      def: edef,
      spd,
      mood: enemyData.mood || 'brave',
      critRate: 0.05,
      critDmg: 1.5,
      skillGauge: 0,
      skills: {
        basic: { id: 'basic', multiplier: 1.0, gaugeCost: 0, gaugeGain: 30, target: 'single' },
        skill1: extraSkills[0] || null
      },
      isAlive: true
    };
  });
}

function calculateDamage(attacker, target, skill) {
  let baseDamage = attacker.atk * skill.multiplier;
  const defReduction = Math.min(0.9, target.def / 1000);
  baseDamage *= (1 - defReduction);
  const moodBonus = getMoodBonus(attacker.mood, target.mood);
  baseDamage *= (1 + moodBonus);
  const isCrit = Math.random() < attacker.critRate;
  if (isCrit) baseDamage *= attacker.critDmg;
  const variance = 0.9 + Math.random() * 0.2;
  return Math.max(1, Math.floor(baseDamage * variance));
}

function selectTarget(targets) {
  return targets.reduce((min, cur) => (cur.currentHp < min.currentHp ? cur : min));
}

function decideAction(unit) {
  const skill1 = unit.skills.skill1;
  if (skill1 && unit.skillGauge >= (skill1.gaugeCost || 100)) {
    return skill1;
  }
  return unit.skills.basic;
}

/**
 * 전투 1회 시뮬레이션. BattleSystem.processTurn/getNextUnit 의미론 그대로:
 * 라운드 1바퀴(살아있는 전원 1회 행동) = turnCount 1 증가. maxTurns=30.
 * @returns {{ outcome: 'victory'|'defeat'|'timeout', turns: number }}
 */
function simulateBattle(allies, enemies) {
  const MAX_TURNS = 30;
  let turnCount = 0;

  while (turnCount < MAX_TURNS) {
    const allUnits = [...allies, ...enemies].filter(u => u.isAlive);
    const order = allUnits.slice().sort((a, b) => b.spd - a.spd);

    for (const unit of order) {
      if (!unit.isAlive) continue;
      const targets = (unit.isEnemy ? allies : enemies).filter(t => t.isAlive);
      if (targets.length === 0) break;

      const skill = decideAction(unit);
      const target = selectTarget(targets);
      const dmg = calculateDamage(unit, target, skill);
      target.currentHp = Math.max(0, target.currentHp - dmg);
      if (target.currentHp <= 0) target.isAlive = false;

      if (skill.id === 'basic') {
        unit.skillGauge = Math.min(100, unit.skillGauge + (skill.gaugeGain || 25));
      } else {
        unit.skillGauge = 0;
      }

      if (enemies.every(e => !e.isAlive)) return { outcome: 'victory', turns: turnCount + 1 };
      if (allies.every(a => !a.isAlive)) return { outcome: 'defeat', turns: turnCount + 1 };
    }

    turnCount++;
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
