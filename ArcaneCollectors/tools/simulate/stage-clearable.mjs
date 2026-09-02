#!/usr/bin/env node
/**
 * ============================================================
 * BAL-05 스테이지 도달 가능성 검증 (stage-clearable.mjs)
 * ============================================================
 *
 * 최대 성장 4인 파티 전투력(_maxParty.mjs, docs/BALANCE_REPORT.md §5-2 방법론)이
 * src/data/stages.json 전 25스테이지의 recommendedPower × 1.05 이상인지 검증한다.
 * (팀리드 지시 명세: "최대 파티 전투력 ≥ 모든 스테이지 requirePower×1.05")
 *
 * 실행: node tools/simulate/stage-clearable.mjs
 * 종료 코드: 실패 시 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMaxPartyPower } from './_maxParty.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const stagesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/stages.json'), 'utf-8'));
const ascendedHeroes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ascended-heroes.json'), 'utf-8')).ascendedHeroes;

const MARGIN = 1.05;

const { maxPartyPower, top4 } = computeMaxPartyPower(ascendedHeroes);

console.log('=== 최대 성장 4인 파티 (만렙·6성·풀스킬·SSR+15 풀장비·풀컬렉션) ===');
top4.forEach((r, i) => console.log(`  ${i + 1}. ${r.id.padEnd(24)} ${r.rarity.padEnd(4)} BP=${r.power}`));
console.log(`  합계(최대 파티 전투력) = ${maxPartyPower}`);
console.log('');

const flatStages = [];
for (const chapter of stagesData.chapters) {
  for (const stage of chapter.stages) {
    flatStages.push({ id: stage.id, recommendedPower: stage.recommendedPower });
  }
}

console.log(`=== 스테이지별 판정 (기준: 최대 파티 ${maxPartyPower} ≥ 요구 × ${MARGIN}) ===`);
const failures = [];
flatStages.forEach(stage => {
  const threshold = Math.ceil(stage.recommendedPower * MARGIN);
  const ratio = maxPartyPower / stage.recommendedPower;
  const pass = maxPartyPower >= threshold;
  if (!pass) failures.push(stage);
  console.log(
    `  ${pass ? 'PASS' : 'FAIL'}  ${stage.id.padEnd(6)} 요구=${String(stage.recommendedPower).padStart(6)}  ` +
    `×1.05=${String(threshold).padStart(6)}  비율=${ratio.toFixed(3)}×`
  );
});

console.log('\n' + '='.repeat(60));
if (failures.length === 0) {
  console.log(`전체 통과 (stage-clearable) — 25/25 스테이지 도달 가능`);
  process.exit(0);
} else {
  console.log(`실패 ${failures.length}건 (25개 중):`);
  failures.forEach(s => {
    const ratio = maxPartyPower / s.recommendedPower;
    console.log(`  - ${s.id}: 요구 ${s.recommendedPower}, 최대 파티 ${maxPartyPower} (${ratio.toFixed(3)}×, 1.05 미달)`);
  });
  process.exit(1);
}
