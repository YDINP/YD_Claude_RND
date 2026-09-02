#!/usr/bin/env node
/**
 * ============================================================
 * BAL-01 가챠 확률 / 피티 / 일일 재화 수지 시뮬레이션
 * ============================================================
 *
 * SSOT (이 스크립트에 하드코딩된 값의 출처 — 작성일 2026-08-25 워킹트리 기준,
 *       git 사용 금지 환경이므로 커밋 해시 대신 파일+라인으로 고정):
 *
 *   [G] src/systems/GachaSystem.js
 *      - RATES        : L14-L19   { SSR 0.015, SR 0.085, R 0.90, N 0 } (T-S2/GA-1: N풀 공백 대응,
 *          2026-09-02 N 60%를 R로 흡수 조정 — 상세: docs/story/SYSTEM_ONBOARDING_ECONOMY.md GA-1)
 *      - PITY_CONFIG  : L22-L27   { softPity 75, hardPity 90, softPityBonus 0.06, pickupPity 180 }
 *      - PITY_THRESHOLD=90(L30), SOFT_PITY_START=75(L31)
 *      - SINGLE_COST 300 / MULTI_COST 2700 / TICKET (L34-L37)
 *      - ENERGY_COST_PER_PULL 10 (L48)
 *      - determineRarity(currentPity) 로직 그대로 이식: L315-L351
 *          · currentPity >= 90            -> SSR 확정
 *          · pity >= 75                   -> ssrRate += (pity-75)*0.06 (cap 1.0)
 *                                            srRate = SR*0.8, rRate = R*0.9
 *          · 누적분포 순서 SSR -> SR -> R -> N
 *      - pull() 10연차 SR 보장: L267-L287 (10개 중 SR/SSR 없으면 result[9]를 SR로 재뽑기,
 *          재뽑기는 피티 카운터에 영향 없음)
 *      - determinePickupCharacter: L162-L183 (pickupPity>=180 또는 lost5050 이면 픽업 확정,
 *          pickupRate 기본 0.5 = 50/50)
 *
 *   [E] src/systems/EnergySystem.js
 *      - ENERGY_CONFIG L10-L17 : 최대 100 + 2*레벨, 5분당 1회복(=288/일), 젬충전 50젬->50에너지
 *      - STAGE_COSTS   L20-L24 : NORMAL 6 / ELITE 12 / BOSS 20
 *
 *   [S] src/data/stages.json (파밍 스테이지 보상 기준값)
 *      - ch2-3 normal: energyCost 6, gold 1500, exp 750  (L381-L411 부근)
 *
 *   [Q] src/data/quests.json 일일 퀘스트 보상 합계 (daily_001~005)
 *      - gems 20+10+30+50 = 110, gold 500+1000+300 = 1800
 *      - 주간 퀘스트 gems 100/150/100 -> 일 평균 약 50
 *
 *   참고: src/systems/PitySystem.js 는 별개의 "기본영웅 조각 피티"(soft 30/hard 50/base 3%)로
 *         본 시뮬 대상(캐릭터 가챠 천장)과 무관. 미반영.
 *
 * 실행: node tools/simulate/gacha-sim.mjs [--accounts 100] [--pulls 10000]
 */

// ---------- SSOT 상수 (위 주석 출처 그대로) ----------
const RATES = { SSR: 0.015, SR: 0.085, R: 0.90, N: 0 }; // [G] L14-19 (T-S2: N풀 공백 대응, N을 R로 흡수)
const PITY_CONFIG = { softPity: 75, hardPity: 90, softPityBonus: 0.06, pickupPity: 180 }; // [G] L22-27
const PITY_THRESHOLD = 90; // [G] L30
const SOFT_PITY_START = 75; // [G] L31

const GACHA = { SINGLE_COST: 300, MULTI_COST: 2700, ENERGY_COST_PER_PULL: 10 }; // [G] L34-48
const PICKUP_RATE = 0.5; // [G] determinePickupCharacter 의 banner.pickupRate 기본값

const ENERGY_CONFIG = {
  BASE_MAX_ENERGY: 100,
  ENERGY_PER_LEVEL: 2,
  RECOVERY_INTERVAL_MINUTES: 5,
  RECOVERY_AMOUNT: 1,
  GEM_CHARGE_COST: 50,
  GEM_CHARGE_AMOUNT: 50,
}; // [E] L10-17
const STAGE_COSTS = { NORMAL: 6, ELITE: 12, BOSS: 20 }; // [E] L20-24

const FARM_STAGE = { id: 'ch2-3-normal', energyCost: 6, gold: 1500, exp: 750 }; // [S]
const DAILY_GEMS = 110; // [Q]
const DAILY_GOLD = 1800; // [Q]
const WEEKLY_GEMS_PER_DAY = Math.round((100 + 150 + 100) / 7); // [Q] = 50

// ---------- 결정론적 RNG (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- [G] determineRarity L315-351 완전 이식 ----------
function determineRarity(currentPity, rng) {
  // 90연차 확정 천장
  if (currentPity >= PITY_THRESHOLD) return 'SSR';

  // 소프트 천장 (75연차 이후 SSR 확률 증가: 매 회 +6%)
  let ssrRate = RATES.SSR;
  if (currentPity >= SOFT_PITY_START) {
    const extraRate = (currentPity - SOFT_PITY_START) * PITY_CONFIG.softPityBonus;
    ssrRate = Math.min(ssrRate + extraRate, 1);
  }

  const roll = rng();
  let cumulative = 0;

  cumulative += ssrRate;
  if (roll < cumulative) return 'SSR';

  // 소프트 천장 시 SR*0.8, R*0.9
  const srRate = currentPity >= SOFT_PITY_START ? RATES.SR * 0.8 : RATES.SR;
  cumulative += srRate;
  if (roll < cumulative) return 'SR';

  const rRate = currentPity >= SOFT_PITY_START ? RATES.R * 0.9 : RATES.R;
  cumulative += rRate;
  if (roll < cumulative) return 'R';

  return 'N';
}

// ---------- 픽업 캐릭터 판정 이식 ([G] determinePickupCharacter L162-183) ----------
/**
 * 코드상 pickupPityCounter 는 어디에서도 증가되지 않는다(SaveManager.updateGachaCounter 미처리).
 * 본 시뮬은 "_meta 주석 및 isPickupGuaranteed의 remaining 계산(180-counter)"이 의도한
 * **누적 뽑기 횟수 기반** 해석을 채택한다: 픽업 획득 시 0으로 리셋, 픽업 없이 180 도달 시 다음 SSR 픽업 확정.
 */
function rollPickup(pickupState, rng) {
  const { lost5050, pickupPityCount } = pickupState;

  if (lost5050 || pickupPityCount >= PITY_CONFIG.pickupPity) {
    return { isPickup: true, guaranteed: true };
  }
  if (rng() < PICKUP_RATE) return { isPickup: true, guaranteed: false };
  return { isPickup: false, guaranteed: false };
}

// ---------- 계정 단위 시뮬레이션 ----------
/**
 * @param {Function} rng 시드 RNG
 * @param {number} totalPulls 총 뽑기 수
 * @param {'multi'|'single'} mode 10연차 배치(=SR 보장 적용) 여부
 */
function simulateAccount(rng, totalPulls, mode) {
  const counts = { SSR: 0, SR: 0, R: 0, N: 0 };
  let pity = 0;
  let pullIndex = 0;

  let firstSSRAt = null;
  let hardPityHits = 0; // pity === 90 에서 SSR 나온 횟수
  let maxGap = 0; // SSR 사이 최대 간격(=하드피티 도달 직전까지 간 최장 거리 포함)

  // 픽업 상태 (표준 픽업 배너 가정)
  const pickupState = { lost5050: false, pickupPityCount: 0 };
  let firstPickupAt = null;
  let pickupCount = 0;
  let guaranteedPickups = 0;

  while (pullIndex < totalPulls) {
    const batchSize = mode === 'multi' ? 10 : 1;
    const batch = [];

    for (let i = 0; i < batchSize && pullIndex < totalPulls; i++) {
      pity++; // [G] pull(): currentPity++ 후 판정
      pullIndex++;

      const rarity = determineRarity(pity, rng);

      pickupState.pickupPityCount++;

      if (rarity === 'SSR') {
        counts.SSR++;
        if (firstSSRAt === null) firstSSRAt = pullIndex;
        maxGap = Math.max(maxGap, pity);
        if (pity >= PITY_THRESHOLD) hardPityHits++;
        pity = 0; // [G] SSR 시 천장 초기화

        const pk = rollPickup(pickupState, rng);
        if (pk.isPickup) {
          pickupCount++;
          if (pk.guaranteed) guaranteedPickups++;
          pickupState.lost5050 = false;
          pickupState.pickupPityCount = 0;
          if (firstPickupAt === null) firstPickupAt = pullIndex;
        } else {
          pickupState.lost5050 = true; // 다음 SSR 픽업 확정
        }
      } else {
        counts[rarity]++;
        batch.push(rarity);
        continue;
      }
      batch.push(rarity);
    }

    // [G] 10연차 SR 보장 (L267-287): SR/SSR 없으면 마지막 결과를 SR로 교체, 피티 무영향
    if (mode === 'multi' && batch.length === 10) {
      const hasSrPlus = batch.some((r) => r === 'SR' || r === 'SSR');
      if (!hasSrPlus) {
        // T-S2: RATES 변경(R 90%/N 0%)으로 교체 대상이 더 이상 N이라는 보장이 없으므로
        // 실제 마지막 결과의 등급(batch[9])에서 차감한다 (기존엔 N 하드코딩 차감 → RATES 변경 후 음수 버그 발생)
        const replacedRarity = batch[9];
        counts[replacedRarity]--;
        counts.SR++;
      }
    }
  }

  return {
    counts,
    firstSSRAt,
    hardPityHits,
    maxGap,
    firstPickupAt,
    pickupCount,
    guaranteedPickups,
  };
}

// ---------- 통계 유틸 ----------
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))];
}
function pct(x, digits = 3) {
  return `${(x * 100).toFixed(digits)}%`;
}

// ---------- 해석해(이론 기대치): ±0.5%p 편차 판정 기준선 ----------
function analyticExpectations() {
  // fail(p) = pity p 에서 SSR 미획득 확률 (determineRarity 의 ssrRate 역산)
  const ssrRateAt = (p) => {
    if (p >= PITY_THRESHOLD) return 1;
    if (p >= SOFT_PITY_START) return Math.min(RATES.SSR + (p - SOFT_PITY_START) * PITY_CONFIG.softPityBonus, 1);
    return RATES.SSR;
  };

  let survival = 1; // s(p-1): 직전까지 생존 확률
  const survivalAt = []; // survivalAt[p] = s(p) = p회 연속 실패 확률
  for (let p = 1; p <= PITY_THRESHOLD; p++) {
    survival *= 1 - ssrRateAt(p);
    survivalAt[p] = survival;
  }

  // 사이클 길이 기댓값 E[L] = Σ_{p=1..90} s(p-1)
  let eCycle = 0;
  let prevSurvival = 1;
  for (let p = 1; p <= PITY_THRESHOLD; p++) {
    eCycle += prevSurvival;
    prevSurvival = survivalAt[p];
  }
  const effSSRRate = 1 / eCycle;
  const pHardPity = survivalAt[PITY_THRESHOLD - 1]; // 89연차까지 전부 실패할 확률

  return { eCycle, effSSRRate, pHardPity };
}

// ---------- 메인: 가챠 몬테카를로 ----------
function runGachaSim(accounts, pullsPerAccount) {
  console.log('='.repeat(72));
  console.log(`BAL-01 가챠 시뮬레이션 — ${accounts}계정 × ${pullsPerAccount.toLocaleString()}회`);
  console.log(
    `설정: RATES SSR ${(RATES.SSR * 100).toFixed(1)}% / SR ${(RATES.SR * 100).toFixed(1)}% / R ${(RATES.R * 100).toFixed(0)}% / N ${(RATES.N * 100).toFixed(0)}%, softPity ${SOFT_PITY_START}(+${PITY_CONFIG.softPityBonus * 100}%/회), hardPity ${PITY_THRESHOLD}, pickupPity ${PITY_CONFIG.pickupPity}`
  );
  console.log('='.repeat(72));

  const an = analyticExpectations();
  console.log(
    `\n■ 이론 기대치 (해석해, 단발 기준)\n  SSR 사이클 길이 기대값 E[L] = ${an.eCycle.toFixed(2)}연차\n  실효 SSR 출현율(피티 포함) = ${pct(an.effSSRRate)} (표기 확률 ${pct(RATES.SSR)} 대비 +${((an.effSSRRate - RATES.SSR) * 100).toFixed(3)}%p)\n  하드피티(90연차) 도달 확률/사이클 = ${(an.pHardPity * 100).toExponential(2)}%`
  );

  const modes = [
    { key: 'multi', label: '10연차 모드 (SR 보장 적용)' },
    { key: 'single', label: '단발 모드 (보장 없음, 대조군)' },
  ];

  for (const { key, label } of modes) {
    const totals = { SSR: 0, SR: 0, R: 0, N: 0 };
    const firstSSRs = [];
    let hardPityTotal = 0;
    let maxGapGlobal = 0;
    const firstPickups = [];
    let pickupTotal = 0;
    let guarPickupTotal = 0;
    let overHardPityViolations = 0;

    for (let acc = 0; acc < accounts; acc++) {
      const rng = mulberry32(0xacce ^ (acc * 2654435761) ^ (key === 'multi' ? 1 : 0));
      const r = simulateAccount(rng, pullsPerAccount, key);
      for (const k of Object.keys(totals)) totals[k] += r.counts[k];
      if (r.firstSSRAt !== null) firstSSRs.push(r.firstSSRAt);
      hardPityTotal += r.hardPityHits;
      maxGapGlobal = Math.max(maxGapGlobal, r.maxGap);
      if (r.maxGap > PITY_THRESHOLD) overHardPityViolations++;
      if (r.firstPickupAt !== null) firstPickups.push(r.firstPickupAt);
      pickupTotal += r.pickupCount;
      guarPickupTotal += r.guaranteedPickups;
    }

    const grand = pullsPerAccount * accounts;
    console.log(`\n■ ${label}`);
    console.log(`  총 뽑기: ${grand.toLocaleString()}회`);
    console.log(
      `  출현율  SSR ${pct(totals.SSR / grand)} | SR ${pct(totals.SR / grand)} | R ${pct(totals.R / grand)} | N ${pct(totals.N / grand)}`
    );
    console.log(
      `  (단순 누적 확률 기준 SSR ${pct(RATES.SSR)} 대비 실측 편차 ${(totals.SSR / grand - RATES.SSR) * 100 >= 0 ? '+' : ''}${((totals.SSR / grand - RATES.SSR) * 100).toFixed(3)}%p — 소프트/하드 피티 포함 효과)`
    );
    const devVsTheory = ((totals.SSR / grand - an.effSSRRate) * 100).toFixed(3);
    const pass = Math.abs(totals.SSR / grand - an.effSSRRate) <= 0.005;
    console.log(
      `  이론 실효율(해석해) 대비 편차: ${devVsTheory.startsWith('-') || devVsTheory === '0.000' ? devVsTheory : '+' + devVsTheory}%p → ±0.5%p 판정: ${pass ? 'PASS' : 'FAIL'}`
    );
    console.log(
      `  첫 SSR 도달: 평균 ${mean(firstSSRs).toFixed(1)}회 / 중앙값 ${median(firstSSRs)}회 / P95 ${percentile(firstSSRs, 95)}회 / 최대 ${Math.max(...firstSSRs)}회`
    );
    console.log(
      `  하드피티(90연차) 도달 SSR: ${hardPityTotal}건 (${pct(hardPityTotal / totals.SSR)} of all SSR)`
    );
    console.log(
      `  천장 검증: SSR 없이 연속 ${PITY_THRESHOLD}회 초과 뽑기 위반 = ${overHardPityViolations}건 (기대값 0), 관측 최장 무SSR 간격 = ${maxGapGlobal}연차`
    );

    const pickupPerAcc = pickupTotal / accounts;
    console.log(
      `  픽업: 계정당 평균 ${pickupPerAcc.toFixed(1)}회 획득 (그중 확정 판정 ${guarPickupTotal}건) | 첫 픽업 도달 평균 ${mean(firstPickups).toFixed(1)} / P95 ${percentile(firstPickups, 95)} / 최대 ${Math.max(...firstPickups)}회`
    );
    console.log(
      `  180픽업피티 검증: 첫 픽업이 ${PITY_CONFIG.pickupPity}회 내 획득한 계정 ${pct(firstPickups.filter((p) => p <= PITY_CONFIG.pickupPity).length / accounts)}`
    );
  }
}

// ---------- 메인: 일일 재화 수지 ----------
function runDailyEconomy(playerLevel) {
  console.log('\n' + '='.repeat(72));
  console.log(`일일 재화 수지 시뮬 (무과금, 플레이어 Lv.${playerLevel} 가정)`);
  console.log('='.repeat(72));

  const maxEnergy =
    ENERGY_CONFIG.BASE_MAX_ENERGY + playerLevel * ENERGY_CONFIG.ENERGY_PER_LEVEL; // [E] getMaxEnergy
  const regenPerDay =
    (24 * 60 * ENERGY_CONFIG.RECOVERY_AMOUNT) / ENERGY_CONFIG.RECOVERY_INTERVAL_MINUTES; // = 288

  // 에너지 가용량: 보수적(캡 도달 후 방치) = maxEnergy, 낙관적(수시 접속 소진) = regenPerDay
  const scenarios = [
    { label: '보수적 (캡 160 도달 후 방치)', usable: Math.min(maxEnergy, regenPerDay) },
    { label: '낙관적 (하루 288 회복 전량 활용)', usable: regenPerDay },
  ];

  const stageGoldPerEnergy = FARM_STAGE.gold / FARM_STAGE.energyCost;
  const stageExpPerEnergy = FARM_STAGE.exp / FARM_STAGE.energyCost;

  console.log(
    `\n최대 에너지 ${maxEnergy} (=100+2×${playerLevel}) | 자연 회복 잠재량 ${regenPerDay}/일 (5분당 1)`
  );
  console.log(
    `파밍 스테이지: ${FARM_STAGE.id} (에너지 ${FARM_STAGE.energyCost} → 골드 ${FARM_STAGE.gold}, EXP ${FARM_STAGE.exp})`
  );
  console.log(`  환산: 골드 ${stageGoldPerEnergy}/에너지, EXP ${stageExpPerEnergy}/에너지`);

  for (const sc of scenarios) {
    const runs = Math.floor(sc.usable / STAGE_COSTS.NORMAL);
    const gold = runs * FARM_STAGE.gold;
    const exp = runs * FARM_STAGE.exp;
    console.log(
      `\n■ ${sc.label}: 가용 에너지 ${sc.usable}/일`
    );
    console.log(
      `  일반 스테이지 ${runs}회 가능 (비용 ${STAGE_COSTS.NORMAL}/회) → 골드 +${gold.toLocaleString()}, EXP +${exp.toLocaleString()}`
    );
    console.log(
      `  + 일일 퀘스트 골드 ${DAILY_GOLD.toLocaleString()} → 합계 골드 +${(gold + DAILY_GOLD).toLocaleString()}/일`
    );
    console.log(
      `  남는 에너지: ${sc.usable - runs * STAGE_COSTS.NORMAL}`
    );
  }

  // 가챠 경제
  const gemsPerDay = DAILY_GEMS + WEEKLY_GEMS_PER_DAY; // 110 + 50
  const daysPerMulti = GACHA.MULTI_COST / gemsPerDay;
  console.log(`\n가챠 재화 수지:`);
  console.log(
    `  젬 수입 ${gemsPerDay}/일 (일간 퀘스트 ${DAILY_GEMS} + 주간 퀘스트 일평균 ${WEEKLY_GEMS_PER_DAY}) | 10연 비용 ${GACHA.MULTI_COST}`
  );
  console.log(`  → 10연 1회 충족까지 약 ${daysPerMulti.toFixed(1)}일 (월 약 ${(30 / daysPerMulti).toFixed(1)}회 10연)`);

  const multiEnergy = 10 * GACHA.ENERGY_COST_PER_PULL; // PRD-3: pull당 에너지 10
  const opportunityStages = multiEnergy / STAGE_COSTS.NORMAL;
  const opportunityGold = opportunityStages * FARM_STAGE.gold;
  console.log(
    `  주의(PR D-3): 가챠는 젬과 별개로 뽑기 1회당 에너지 ${GACHA.ENERGY_COST_PER_PULL} 소모 → 10연 시 에너지 ${multiEnergy} 추가 소모`
  );
  console.log(
    `  → 기회비용: 일반 스테이지 ${opportunityStages.toFixed(1)}회 포기 ≈ 골드 ${opportunityGold.toLocaleString()}/10연`
  );

  // 젬→에너지→가챠 우회 경로
  const energyPerGemCharge = ENERGY_CONFIG.GEM_CHARGE_AMOUNT / ENERGY_CONFIG.GEM_CHARGE_COST; // 1/젬
  console.log(
    `  보석 에너지 충전: 50젬→50에너지 (${energyPerGemCharge.toFixed(2)}에너지/젬) — 젬을 직접 뽑기에 쓰는 것(${GACHA.SINGLE_COST}/1회=${(1 / GACHA.SINGLE_COST).toFixed(4)}뽑기/젬)보다 에너지 경유가 유리한지는 파밍 가치에 종속`
  );

  // 첫 클리어 일괄 수령액(참고, 일회성): stages.json ch1~ch2 firstClearRewards gems 합계
  const firstClearGems = 30 + 30 + 30 + 50 + 100 + 50 + 50 + 80 + 50 + 150; // ch1 10스테이지
  console.log(
    `  (참고) ch1 전 스테이지 첫 클리어 젬 일괄 +${firstClearGems} — 신규 유저 초기 10연 부스팅 요인`
  );
}

// ---------- 진입점 ----------
const args = process.argv.slice(2);
function argValue(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : def;
}

const ACCOUNTS = argValue('--accounts', 100);
const PULLS = argValue('--pulls', 10000);
const PLAYER_LEVEL = argValue('--level', 30);

runGachaSim(ACCOUNTS, PULLS);
runDailyEconomy(PLAYER_LEVEL);
console.log('\n완료.');
