#!/usr/bin/env node
/**
 * ============================================================
 * BAL-08 Day1~3 재화 수급 재검산 (economy-flow.mjs)
 * ============================================================
 *
 * 밸런스 v1 변경(stages.json 5-4/5-5, tower.json, ascended-heroes.json SR/SSR
 * 일부)이 온보딩 경제(Day1~3)에 파급 효과가 없는지 재검산한다.
 * 대상 데이터(챕터1~3 초반, quests.json, 초기 지급 자원)는 이번 변경 범위 밖이므로
 * 이 스크립트는 "회귀가 없다"를 확인하는 재검산이며, 결과는
 * docs/story/SYSTEM_ONBOARDING_ECONOMY.md §3 (Day1~3 시뮬레이션)과 대조한다.
 *
 * SSOT (하드코딩 상수는 전부 코드/문서 인용):
 *   - src/systems/SaveManager.js getDefaultSave() L59-99
 *       gold:10000 / gems:1500 / summonTickets:10 / spiritStones:6 / institutionSeal:1
 *   - src/data/stages.json chapters[].stages[].rewards.gold, firstClearRewards.gems (SSOT 직접 로드)
 *   - src/data/quests.json dailyQuests[].rewards, achievementQuests[achieve_001~003].rewards (SSOT 직접 로드)
 *   - 온보딩 전용 1회성 소모(재화 외 자원이라 stages/quests JSON에 없음 — 문서 인용):
 *       docs/story/SYSTEM_ONBOARDING_ECONOMY.md §3-2 "소모" 행:
 *         Day1: 10연(티켓10, 젬0) / 오마르 각성(조각30+정령석3, 젬0) /
 *               아이리스 각인(각인서1+에센스30+불꽃3, 젬0) / 스킬강화 1회(-골드1000)
 *       → 이번 재검산에서 젬에 영향을 주는 소모는 Day3의 2차 10연(-2700젬)뿐.
 *
 * 검증 항목 (팀리드 지시 패턴: tools/simulate/gacha-sim.mjs):
 *   1. Day1~3 전 구간 gold/gems 잔액이 마이너스로 떨어지지 않는다
 *   2. Day2 종료 시점 gems < 2700 (두 번째 10연이 Day3 전에 열리면 안 됨 — 의도된 페이싱)
 *   3. Day3 종료 시점(2차 10연 실행 전) gems >= 2700 (두 번째 10연 성립)
 *
 * 실행: node tools/simulate/economy-flow.mjs
 * 종료 코드: 실패 시 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const stagesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/stages.json'), 'utf-8'));
const questsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/quests.json'), 'utf-8'));

const flatStages = [];
for (const chapter of stagesData.chapters) {
  for (const stage of chapter.stages) flatStages.push(stage);
}
const stageById = new Map(flatStages.map(s => [s.id, s]));
const achieveById = new Map(questsData.achievementQuests.map(a => [a.id, a]));

// ---------- SSOT 상수 ----------
const INITIAL = { gold: 10000, gems: 1500 }; // SaveManager.js L68-70

const DAILY_QUEST_TOTAL = questsData.dailyQuests.reduce(
  (acc, q) => ({ gems: acc.gems + (q.rewards.gems || 0), gold: acc.gold + (q.rewards.gold || 0) }),
  { gems: 0, gold: 0 }
);

function stageFirstClear(ids) {
  return ids.reduce(
    (acc, id) => {
      const st = stageById.get(id);
      if (!st) throw new Error(`stages.json에 ${id}가 없습니다`);
      return {
        gems: acc.gems + (st.firstClearRewards?.gems || 0),
        gold: acc.gold + (st.rewards?.gold || 0)
      };
    },
    { gems: 0, gold: 0 }
  );
}

function achieveReward(id) {
  const a = achieveById.get(id);
  if (!a) throw new Error(`quests.json achievementQuests에 ${id}가 없습니다`);
  return { gems: a.rewards.gems || 0, gold: a.rewards.gold || 0 };
}

// ---------- Day1 ----------
const day1Stages = stageFirstClear(['1-1', '1-2', '1-3', '1-4', '1-5']);
const day1Achieve = ['achieve_001', 'achieve_002', 'achieve_003'].map(achieveReward);
const day1AchieveTotal = day1Achieve.reduce((a, b) => ({ gems: a.gems + b.gems, gold: a.gold + b.gold }), { gems: 0, gold: 0 });

// Day1 소모(젬 영향 없음, 골드만) — 문서 §3-2 "스킬강화 1회" 인용
const DAY1_GOLD_SINK = 1000;

let gems = INITIAL.gems;
let gold = INITIAL.gold;
const ledger = [];

function apply(label, delta) {
  gems += delta.gems || 0;
  gold += delta.gold || 0;
  ledger.push({ label, gems, gold });
}

apply('초기 지급', { gems: 0, gold: 0 });
apply('Day1: 챕터1 첫클리어(1-1~1-5)', day1Stages);
apply('Day1: 일일퀘스트', DAILY_QUEST_TOTAL);
apply('Day1: 업적(achieve_001~003)', day1AchieveTotal);
apply('Day1: 스킬강화 소모', { gems: 0, gold: -DAY1_GOLD_SINK });
const day1End = { gems, gold };

// ---------- Day2 ----------
const day2Stages = stageFirstClear(['2-1', '2-2', '2-3', '2-4']);
apply('Day2: 챕터2 첫클리어(2-1~2-4)', day2Stages);
apply('Day2: 일일퀘스트', DAILY_QUEST_TOTAL);
const day2End = { gems, gold };

// ---------- Day3 ----------
const day3Stages = stageFirstClear(['2-5', '3-1', '3-2']);
apply('Day3: 첫클리어(2-5, 3-1, 3-2)', day3Stages);
apply('Day3: 일일퀘스트', DAILY_QUEST_TOTAL);
const day3BeforePull = { gems, gold };

const SECOND_MULTI_PULL_COST = 2700; // GachaSystem.MULTI_COST (문서 §1-4 인용, 젬 소모)
const canSecondPull = gems >= SECOND_MULTI_PULL_COST;
if (canSecondPull) {
  apply('Day3: 두 번째 10연 실행', { gems: -SECOND_MULTI_PULL_COST, gold: 0 });
}
const day3End = { gems, gold };

// ---------- 출력 ----------
console.log('=== 재화 흐름 (Day1~3) ===');
ledger.forEach(l => console.log(`  ${l.label.padEnd(28)} gems=${String(l.gems).padStart(6)}  gold=${String(l.gold).padStart(8)}`));

console.log('\n=== 체크포인트 ===');
console.log(`  Day1 종료: gems=${day1End.gems}, gold=${day1End.gold}`);
console.log(`  Day2 종료: gems=${day2End.gems}, gold=${day2End.gold}`);
console.log(`  Day3 종료(2차 10연 전): gems=${day3BeforePull.gems}, gold=${day3BeforePull.gold}`);
console.log(`  Day3 종료(2차 10연 후): gems=${day3End.gems}, gold=${day3End.gold}`);

console.log('\n=== docs/story/SYSTEM_ONBOARDING_ECONOMY.md §3 대조 ===');
const REFERENCE = {
  day1: { gems: 2150, gold: 13070 },
  day2: { gems: 2490, gold: null }, // 문서는 "~18,000" 근사치만 제공
  day3BeforePull: { gems: 2870, gold: null }
};
console.log(`  Day1 문서값 gems=${REFERENCE.day1.gems}/gold=${REFERENCE.day1.gold} vs 실측 gems=${day1End.gems}/gold=${day1End.gold}`);
console.log(`  Day2 문서값 gems=${REFERENCE.day2.gems} vs 실측 gems=${day2End.gems}`);
console.log(`  Day3(전) 문서값 gems=${REFERENCE.day3BeforePull.gems} vs 실측 gems=${day3BeforePull.gems}`);

// ---------- 검증 ----------
const failures = [];

console.log('\n=== 검증 1: 전 구간 잔액 비음수 ===');
const allNonNegative = ledger.every(l => l.gems >= 0 && l.gold >= 0);
if (allNonNegative) {
  console.log('  PASS');
} else {
  failures.push('일부 시점에서 gems 또는 gold가 음수');
  console.log('  FAIL');
  ledger.filter(l => l.gems < 0 || l.gold < 0).forEach(l => console.log(`    - ${l.label}: gems=${l.gems}, gold=${l.gold}`));
}

console.log(`\n=== 검증 2: Day2 종료 gems(${day2End.gems}) < 2700 (조기 10연 방지) ===`);
if (day2End.gems < SECOND_MULTI_PULL_COST) {
  console.log('  PASS');
} else {
  failures.push(`Day2 종료 gems ${day2End.gems} >= 2700 — 두 번째 10연이 의도보다 일찍 열림`);
  console.log('  FAIL');
}

console.log(`\n=== 검증 3: Day3 종료(전) gems(${day3BeforePull.gems}) >= 2700 (두 번째 10연 성립) ===`);
if (canSecondPull) {
  console.log('  PASS');
} else {
  failures.push(`Day3 종료(전) gems ${day3BeforePull.gems} < 2700 — 두 번째 10연 미성립`);
  console.log('  FAIL');
}

console.log(`\n=== 검증 4: 문서(SYSTEM_ONBOARDING_ECONOMY.md) 수치와 일치 (Day1 gems/gold, Day2/Day3 gems) ===`);
const docMatch =
  day1End.gems === REFERENCE.day1.gems &&
  day1End.gold === REFERENCE.day1.gold &&
  day2End.gems === REFERENCE.day2.gems &&
  day3BeforePull.gems === REFERENCE.day3BeforePull.gems;
if (docMatch) {
  console.log('  PASS — 밸런스 v1 변경이 Day1~3 경제에 영향 없음을 확인 (문서와 완전 일치)');
} else {
  failures.push('실측치가 SYSTEM_ONBOARDING_ECONOMY.md 문서값과 불일치 — 회귀 발생 가능성');
  console.log('  FAIL');
}

console.log('\n' + '='.repeat(60));
if (failures.length === 0) {
  console.log('전체 통과 (economy-flow)');
  process.exit(0);
} else {
  console.log(`실패 ${failures.length}건:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
