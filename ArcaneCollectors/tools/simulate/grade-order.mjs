#!/usr/bin/env node
/**
 * ============================================================
 * BAL-04 등급 정합 검증 (grade-order.mjs)
 * ============================================================
 *
 * SSOT (전투력 공식 그대로 이식 — src/systems/ProgressionSystem.js):
 *   - getBaseStatsAtLevel  : L241-255  stats[key] = floor(base[key] + growth[key]*(level-1))
 *   - getStarBonus         : L502-512  bonusPercent=(stars-1)*5, spd = floor(bonusPercent/2)
 *   - getFinalStats        : L539-558  finalStats[key] = floor(stats[key]*(1+starBonus[key]/100))
 *                             (장비=0, 컬렉션=0 가정 — "장비 없음" 밴드 정의와 일치)
 *   - resolveSkillLevels   : L617-623  본 스크립트는 스킬Lv0 가정(설계 §3-1 "스킬Lv0" 밴드 정의)
 *   - calculatePower       : L632-649  floor(hp/10 + atk + def + spd + skillBonus)
 *   - MAX_LEVEL            : L14-19    N:30 / R:40 / SR:50 / SSR:60
 *   - DEFAULT_STARS_BY_RARITY: L42     N:1 / R:2 / SR:3 / SSR:4
 *
 * 등급 판정 (src/utils/rarityUtils.ts):
 *   - base-heroes.json 은 rarity 필드가 없음 → getRarityKey(undefined ?? 1) = 'N' (L59, LEGACY_NUM_TO_KEY[1])
 *   - ascended-heroes.json 은 rarity 문자열을 그대로 사용 (getRarityKey('SSR') = 'SSR')
 *
 * 목표 BP 밴드 (docs/balance/BALANCE_DESIGN_v1.md §3-1):
 *   SSR 1,000-1,400 / SR 800-1,000 / R 650-850 / Base N 500-750 (탱커 예외 허용)
 *
 * 실행: node tools/simulate/grade-order.mjs
 * 종료 코드: 검증 실패 시 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const baseHeroes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/base-heroes.json'), 'utf-8')).baseHeroes;
const ascendedHeroes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ascended-heroes.json'), 'utf-8')).ascendedHeroes;

const MAX_LEVEL = { N: 30, R: 40, SR: 50, SSR: 60 };
const DEFAULT_STARS_BY_RARITY = { N: 1, R: 2, SR: 3, SSR: 4 };
const STAT_KEYS = ['hp', 'atk', 'def', 'spd'];

function getBaseStatsAtLevel(base, growth, level) {
  const levelSteps = Math.max(1, level) - 1;
  const result = {};
  for (const key of STAT_KEYS) {
    result[key] = Math.floor((base[key] || 0) + (growth[key] || 0) * levelSteps);
  }
  return result;
}

function getStarBonus(stars) {
  const bonusPercent = (stars - 1) * 5;
  return { hp: bonusPercent, atk: bonusPercent, def: bonusPercent, spd: Math.floor(bonusPercent / 2) };
}

function calcMaxBP(hero, rarityKey) {
  const maxLevel = hero.maxLevel || MAX_LEVEL[rarityKey];
  const stats = getBaseStatsAtLevel(hero.stats, hero.growthStats, maxLevel);
  const stars = DEFAULT_STARS_BY_RARITY[rarityKey];
  const starBonus = getStarBonus(stars);

  const finalStats = {};
  for (const key of STAT_KEYS) {
    finalStats[key] = Math.floor(stats[key] * (1 + (starBonus[key] || 0) / 100));
  }

  const skillBonus = 0; // 스킬Lv0 가정 (설계 §3-1)
  return Math.floor(finalStats.hp / 10 + finalStats.atk + finalStats.def + finalStats.spd + skillBonus);
}

// ---------- 계산 ----------
const baseRows = baseHeroes.map(hero => {
  const rarityKey = 'N';
  return {
    id: hero.id,
    name: hero.name,
    rarity: rarityKey,
    maxLevel: hero.maxLevel || MAX_LEVEL.N,
    bp: calcMaxBP(hero, rarityKey)
  };
});

const ascendedRows = ascendedHeroes.map(hero => {
  const rarityKey = hero.rarity;
  return {
    id: hero.id,
    baseHeroId: hero.baseHeroId,
    name: hero.name,
    rarity: rarityKey,
    maxLevel: hero.maxLevel || MAX_LEVEL[rarityKey],
    bp: calcMaxBP(hero, rarityKey)
  };
});

// ---------- 출력 ----------
console.log('=== 기본영웅 (Base N, Lv30) ===');
baseRows
  .slice()
  .sort((a, b) => b.bp - a.bp)
  .forEach(r => console.log(`  ${r.id.padEnd(16)} ${r.name.padEnd(10)} BP=${r.bp}`));

console.log('\n=== 전직영웅 (등급별) ===');
for (const rarity of ['R', 'SR', 'SSR']) {
  console.log(`-- ${rarity} --`);
  ascendedRows
    .filter(r => r.rarity === rarity)
    .sort((a, b) => b.bp - a.bp)
    .forEach(r => console.log(`  ${r.id.padEnd(24)} ${r.name.padEnd(12)} BP=${r.bp}`));
}

// ---------- 검증 ----------
const failures = [];

// 1) SSR 최소 BP > SR 최대 BP (밴드 하한 원칙: SSR 최소 >= 1000, SR 최대 < 1000)
const ssrBPs = ascendedRows.filter(r => r.rarity === 'SSR').map(r => r.bp);
const srBPs = ascendedRows.filter(r => r.rarity === 'SR').map(r => r.bp);
const ssrMin = Math.min(...ssrBPs);
const srMax = Math.max(...srBPs);

console.log(`\n[검증 1] SSR 최소 BP(${ssrMin}) > SR 최대 BP(${srMax})?`);
if (ssrMin > srMax) {
  console.log('  PASS');
} else {
  failures.push(`SSR 최소(${ssrMin}) <= SR 최대(${srMax}) — 등급 역전 발생`);
  console.log('  FAIL');
}

console.log(`[검증 1-a] SSR 최소 BP(${ssrMin}) >= 1000 (설계 밴드 하한)?`);
if (ssrMin >= 1000) {
  console.log('  PASS');
} else {
  failures.push(`SSR 최소 BP ${ssrMin} < 1000`);
  console.log('  FAIL');
}

console.log(`[검증 1-b] SR 최대 BP(${srMax}) < 1000 (설계 밴드 상한)?`);
if (srMax < 1000) {
  console.log('  PASS');
} else {
  failures.push(`SR 최대 BP ${srMax} >= 1000`);
  console.log('  FAIL');
}

// 2) Lv30 기본영웅 < 대응 전직영웅 (만렙 기준) — baseHeroId로 그룹핑
console.log('\n[검증 2] 기본영웅 BP < 각 전직영웅(만렙) BP (base_omar 등 SR 하향 대상 포함)');
const baseById = new Map(baseRows.map(r => [r.id, r]));
let check2Fail = false;
for (const asc of ascendedRows) {
  const base = baseById.get(asc.baseHeroId);
  if (!base) continue;
  const ok = base.bp < asc.bp;
  if (!ok) {
    check2Fail = true;
    failures.push(`역전: ${base.id}(Lv30 BP=${base.bp}) >= ${asc.id}(만렙 BP=${asc.bp})`);
    console.log(`  FAIL  ${base.id}(${base.bp}) >= ${asc.id}(${asc.bp})`);
  }
}
if (!check2Fail) {
  console.log('  PASS  (전체 24개 전직영웅 역전 없음)');
}

// ---------- 결과 ----------
console.log('\n' + '='.repeat(60));
if (failures.length === 0) {
  console.log('전체 통과 (grade-order)');
  process.exit(0);
} else {
  console.log(`실패 ${failures.length}건:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
