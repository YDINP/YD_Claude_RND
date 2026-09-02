#!/usr/bin/env node
/**
 * ============================================================
 * BAL-06 무한의 탑 상한 검증 (tower-ceiling.mjs)
 * ============================================================
 *
 * (c) 탑 층별 recommendedPower 단조 증가 + 100층 값 + 최대 파티 전투력 대비 도달 가능 층 검증.
 *
 * 실행: node tools/simulate/tower-ceiling.mjs
 * 종료 코드: 실패 시 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMaxPartyPower } from './_maxParty.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const towerData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/tower.json'), 'utf-8'));
const ascendedHeroes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ascended-heroes.json'), 'utf-8')).ascendedHeroes;

const { maxPartyPower, top4 } = computeMaxPartyPower(ascendedHeroes);

console.log('=== 최대 성장 4인 파티 ===');
top4.forEach((r, i) => console.log(`  ${i + 1}. ${r.id.padEnd(24)} ${r.rarity.padEnd(4)} BP=${r.power}`));
console.log(`  합계(최대 파티 전투력) = ${maxPartyPower}`);
console.log('');

const floors = towerData.floors.slice().sort((a, b) => a.floor - b.floor);

// [검증 1] 100개 층 존재 + floor 값 1..100 연속
const failures = [];
if (floors.length !== 100) {
  failures.push(`floors 개수 ${floors.length} !== 100`);
}
floors.forEach((f, i) => {
  if (f.floor !== i + 1) failures.push(`floors[${i}].floor=${f.floor} (기대 ${i + 1})`);
});

// [검증 2] recommendedPower 단조 증가
console.log('=== 검증 2: recommendedPower 단조 증가 ===');
let monotonicOk = true;
for (let i = 1; i < floors.length; i++) {
  if (floors[i].recommendedPower <= floors[i - 1].recommendedPower) {
    monotonicOk = false;
    failures.push(
      `층 ${floors[i].floor}(${floors[i].recommendedPower}) <= 층 ${floors[i - 1].floor}(${floors[i - 1].recommendedPower}) — 단조 증가 위반`
    );
  }
}
console.log(monotonicOk ? '  PASS (전 구간 단조 증가)' : '  FAIL');

// [검증 3] 100층 값
console.log('\n=== 검증 3: 100층 recommendedPower ===');
const floor100 = floors.find(f => f.floor === 100);
const EXPECTED_FLOOR_100 = 13072; // 설계 v1.1 §9-3/§9-6: 400 + 128×99 (v1의 400+140×99=14,260에서 재재스케일)
console.log(`  실제=${floor100.recommendedPower}, 설계 기대값=${EXPECTED_FLOOR_100}`);
if (floor100.recommendedPower === EXPECTED_FLOOR_100) {
  console.log('  PASS');
} else {
  failures.push(`floor100.recommendedPower=${floor100.recommendedPower} !== 설계값 ${EXPECTED_FLOOR_100}`);
  console.log('  FAIL');
}

// [검증 4] 최대 파티 전투력으로 100층 달성 가능 여부
console.log(`\n=== 검증 4: 최대 파티(${maxPartyPower}) >= 100층 요구(${floor100.recommendedPower})? ===`);
if (maxPartyPower >= floor100.recommendedPower) {
  console.log(`  PASS (여유 ${(maxPartyPower - floor100.recommendedPower)}, ${(maxPartyPower / floor100.recommendedPower).toFixed(3)}×)`);
} else {
  const deficit = floor100.recommendedPower - maxPartyPower;
  failures.push(
    `최대 파티 전투력 ${maxPartyPower} < 100층 요구 ${floor100.recommendedPower} (부족 ${deficit}, ${(maxPartyPower / floor100.recommendedPower).toFixed(3)}×) — Max 파티도 탑 완주 불가`
  );
  console.log(`  FAIL (부족 ${deficit}, ${(maxPartyPower / floor100.recommendedPower).toFixed(3)}×)`);

  // 실제 도달 가능한 최고 층 계산
  const reachable = floors.filter(f => f.recommendedPower <= maxPartyPower);
  const highestReachable = reachable.length > 0 ? Math.max(...reachable.map(f => f.floor)) : 0;
  console.log(`  → 최대 파티로 실제 도달 가능한 최고 층: ${highestReachable}층 (요구 ${floors.find(f => f.floor === highestReachable)?.recommendedPower})`);
  const blockedFloors = floors.filter(f => f.recommendedPower > maxPartyPower).map(f => f.floor);
  console.log(`  → 도달 불가 층: ${blockedFloors[0]}~${blockedFloors[blockedFloors.length - 1]}층 (${blockedFloors.length}개 층)`);
}

console.log('\n' + '='.repeat(60));
if (failures.length === 0) {
  console.log('전체 통과 (tower-ceiling)');
  process.exit(0);
} else {
  console.log(`실패 ${failures.length}건:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
