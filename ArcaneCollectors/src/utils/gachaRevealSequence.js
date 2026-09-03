/**
 * gachaRevealSequence.js — 소환 결과 연출 상태 머신 (순수 함수, Phaser 비의존)
 *
 * REDESIGN_PLAN §3-2 "결과 연출" 5단계를 시간축과 상태 전이로 기술한다.
 *   1. circle  소환진 등장
 *   2. pillar  등급 색 빛기둥
 *   3. flip    카드 뒤집기 (10연은 stagger 순차 공개)
 *   4. cutin   SSR 컷인 (SSR 이 없으면 시퀀스에서 통째로 빠진다)
 *   5. grid    결과 그리드 (종착)
 *
 * Phaser 를 import 하지 않는다. GachaResultOverlay.js 가 렌더를 맡고
 * 이 파일은 "언제 무엇이 보여야 하는가" 만 계산한다. vitest node 환경에서 검증한다.
 *
 * 시간 예산에 제약이 하나 있다. 온보딩 e2e(tests/e2e/onboarding-full.mjs T-05)가
 * 무료 10연 실행 후 6초 안에 결과의 [확인]을 탭한다. 그래서 SSR 컷인이 붙은
 * 10연의 totalDuration 이 6000ms 를 넉넉히 밑돌아야 한다 — 아래 기본값 합은 3710ms 다.
 *
 * 주의: 다른 설정 모듈을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

// ------------------------------------------------------------------
// 상수
// ------------------------------------------------------------------

/** 연출 단계 이름 */
export const REVEAL_STAGE = Object.freeze({
  CIRCLE: 'circle',
  PILLAR: 'pillar',
  FLIP: 'flip',
  CUTIN: 'cutin',
  GRID: 'grid'
});

/** 단계 진행 순서 (cutin 은 조건부로 빠진다) */
export const STAGE_ORDER = Object.freeze([
  REVEAL_STAGE.CIRCLE,
  REVEAL_STAGE.PILLAR,
  REVEAL_STAGE.FLIP,
  REVEAL_STAGE.CUTIN,
  REVEAL_STAGE.GRID
]);

/**
 * 단계별 기본 지속시간(ms).
 * flip 은 첫 카드 1장 기준이며 stagger 가 더해진다.
 * cutin 은 **대상 1명당** 시간이다. 여러 명이면 순차 재생으로 그만큼 늘어난다.
 */
export const STAGE_DURATION = Object.freeze({
  [REVEAL_STAGE.CIRCLE]: 800,
  [REVEAL_STAGE.PILLAR]: 500,
  [REVEAL_STAGE.FLIP]: 480,
  [REVEAL_STAGE.CUTIN]: 2200,
  [REVEAL_STAGE.GRID]: 0
});

/** 등급별 컷인 1회 길이(ms). SR 은 문장·대사를 뺀 간소판이라 짧다 */
export const CUTIN_DURATION = Object.freeze({
  SSR: 2200,
  SR: 1400
});

/** 한 번의 소환에서 연달아 재생할 컷인 상한 */
export const MAX_CUTIN_TARGETS = 3;

/** 10연 순차 공개 간격(ms) */
export const FLIP_STAGGER = 70;

/** 등급 서열 (낮은 것부터) */
export const RARITY_ORDER = Object.freeze(['N', 'R', 'SR', 'SSR']);

/**
 * 컷인이 붙는 등급.
 * SSR 은 전체 연출, SR 은 간소판이다. R/N 은 컷인 없이 그리드로 간다.
 */
export const CUTIN_RARITIES = Object.freeze(['SSR', 'SR']);

/** @deprecated CUTIN_RARITIES 를 쓸 것. 하위 호환용 별칭 */
export const CUTIN_RARITY = 'SSR';

/** 저사양 대비 품질 티어 */
export const QUALITY_TIER = Object.freeze({
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
});

/** 티어별 파티클 상한 (동시 존재 개수) */
export const PARTICLE_BUDGET = Object.freeze({
  [QUALITY_TIER.HIGH]: 48,
  [QUALITY_TIER.MEDIUM]: 26,
  [QUALITY_TIER.LOW]: 10
});

/** 등급별 파티클 배율 — 상한에 곱해 최종 개수를 만든다 */
export const RARITY_PARTICLE_SCALE = Object.freeze({
  N: 0.35,
  R: 0.5,
  SR: 0.75,
  SSR: 1
});

// ------------------------------------------------------------------
// 등급
// ------------------------------------------------------------------

/**
 * 등급 서열 인덱스. 알 수 없는 값은 -1.
 * @param {string} rarity
 * @returns {number}
 */
export function rarityRank(rarity) {
  return RARITY_ORDER.indexOf(rarity);
}

/**
 * 결과 배열에서 최고 등급을 고른다.
 * @param {Array<{rarity:string}>} results
 * @returns {string} 등급 코드. 빈 배열이나 미상은 'N'
 */
export function bestRarity(results) {
  if (!Array.isArray(results) || results.length === 0) return 'N';
  let bestIndex = -1;
  results.forEach((entry) => {
    const rank = rarityRank(entry && entry.rarity);
    if (rank > bestIndex) bestIndex = rank;
  });
  return bestIndex < 0 ? 'N' : RARITY_ORDER[bestIndex];
}

/**
 * 컷인을 재생해야 하는가. 최고 등급이 SSR 이거나 SR 이면 재생한다.
 * @param {Array<{rarity:string}>} results
 * @returns {boolean}
 */
export function hasCutin(results) {
  return CUTIN_RARITIES.includes(bestRarity(results));
}

/**
 * 컷인 대상 목록. 등장 순서를 보존한다.
 *
 * SSR 이 있으면 **SSR 전부**를 순차 재생한다(§10연에서 SSR 2장 이상이면 순차).
 * SSR 이 없고 SR 만 있으면 **첫 SR 한 명**만 간소판으로 재생한다 —
 * 10연은 SR 이상 1장이 보장돼 있어 전부 재생하면 매번 길어진다.
 * 상한은 MAX_CUTIN_TARGETS 다.
 *
 * @param {Array<{rarity:string}>} results
 * @returns {Array<Object>}
 */
export function cutinTargets(results) {
  if (!Array.isArray(results)) return [];
  const best = bestRarity(results);
  if (!CUTIN_RARITIES.includes(best)) return [];

  const matches = results.filter((entry) => entry && entry.rarity === best);
  if (best === 'SR') return matches.slice(0, 1);
  return matches.slice(0, MAX_CUTIN_TARGETS);
}

/**
 * 컷인 단계 전체 길이. 대상 1명당 등급별 시간을 곱한다.
 *
 * @param {Array<Object>} results
 * @param {number} [perTarget] - 1명당 길이 강제 지정 (캡처·테스트용)
 * @returns {number} ms. 대상이 없으면 0
 */
export function cutinDuration(results, perTarget) {
  const targets = cutinTargets(results);
  if (targets.length === 0) return 0;
  const best = bestRarity(results);
  const unit = Number.isFinite(perTarget)
    ? perTarget
    : (CUTIN_DURATION[best] ?? STAGE_DURATION[REVEAL_STAGE.CUTIN]);
  return unit * targets.length;
}

// ------------------------------------------------------------------
// 품질 · 파티클 상한
// ------------------------------------------------------------------

/**
 * 실행 환경에서 품질 티어를 정한다 (순수 — 판정에 필요한 값을 인자로 받는다).
 *
 * @param {Object} [env]
 * @param {boolean} [env.useBlurBackdrop] - DESIGN.effects.useBlurBackdrop. false 면 저사양 신호
 * @param {boolean} [env.isMobile] - 모바일 기기 여부
 * @param {number} [env.pixelRatio] - devicePixelRatio
 * @returns {string} QUALITY_TIER 값
 */
export function resolveQualityTier(env = {}) {
  const { useBlurBackdrop = true, isMobile = false, pixelRatio = 1 } = env;
  if (useBlurBackdrop === false) return QUALITY_TIER.LOW;
  if (isMobile && pixelRatio > 2) return QUALITY_TIER.LOW;
  if (isMobile) return QUALITY_TIER.MEDIUM;
  return QUALITY_TIER.HIGH;
}

/**
 * 파티클 개수 상한. 티어 상한에 등급 배율을 곱하고 1개 이상을 보장한다.
 * @param {string} quality - QUALITY_TIER 값
 * @param {string} rarity - 등급 코드
 * @returns {number} 정수 개수
 */
export function resolveParticleBudget(quality, rarity) {
  const cap = PARTICLE_BUDGET[quality] ?? PARTICLE_BUDGET[QUALITY_TIER.MEDIUM];
  const scale = RARITY_PARTICLE_SCALE[rarity] ?? RARITY_PARTICLE_SCALE.N;
  return Math.max(1, Math.round(cap * scale));
}

// ------------------------------------------------------------------
// 시퀀스 계획
// ------------------------------------------------------------------

/**
 * 실제로 재생할 단계 목록. 컷인이 없으면 cutin 을 빼고 돌려준다.
 * @param {boolean} withCutin
 * @returns {string[]}
 */
export function stageSequence(withCutin) {
  return STAGE_ORDER.filter((id) => id !== REVEAL_STAGE.CUTIN || withCutin);
}

/**
 * flip 단계의 총 길이. 카드 1장 뒤집기 + 마지막 카드까지의 stagger.
 * @param {number} count - 카드 수
 * @param {number} base - 카드 1장 뒤집기 시간
 * @param {number} stagger - 카드 간 간격
 * @returns {number} ms
 */
export function flipDuration(count, base = STAGE_DURATION[REVEAL_STAGE.FLIP], stagger = FLIP_STAGGER) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (n === 0) return 0;
  return base + stagger * (n - 1);
}

/**
 * 연출 계획을 만든다. 단계별 시작·종료 시각(ms)과 카드 공개 시각이 확정된다.
 *
 * @param {Array<{rarity:string}>} results - 소환 결과
 * @param {Object} [options]
 * @param {number} [options.stagger] - 카드 간 간격. 기본 FLIP_STAGGER
 * @param {string} [options.quality] - QUALITY_TIER 값. 기본 high
 * @param {Object} [options.durations] - 단계별 지속시간 덮어쓰기
 * @returns {{best:string, count:number, hasCutin:boolean, cutinTargets:Array, cutinUnit:number,
 *            stagger:number, quality:string,
 *            particleCount:number, stages:Array<{id:string,start:number,duration:number,end:number}>,
 *            cardReveals:Array<{index:number,at:number}>, totalDuration:number}}
 */
export function buildRevealPlan(results, options = {}) {
  const list = Array.isArray(results) ? results : [];
  const count = list.length;
  const stagger = Number.isFinite(options.stagger) ? options.stagger : FLIP_STAGGER;
  const quality = PARTICLE_BUDGET[options.quality] ? options.quality : QUALITY_TIER.HIGH;
  const durations = { ...STAGE_DURATION, ...(options.durations || {}) };

  const best = bestRarity(list);
  const withCutin = hasCutin(list);
  const targets = cutinTargets(list);
  const ids = stageSequence(withCutin);

  // 컷인 1명당 길이 — durations 로 덮어쓰지 않았으면 등급별 기본값을 쓴다
  const cutinUnit = (options.durations && Number.isFinite(options.durations[REVEAL_STAGE.CUTIN]))
    ? options.durations[REVEAL_STAGE.CUTIN]
    : (CUTIN_DURATION[best] ?? durations[REVEAL_STAGE.CUTIN]);

  let cursor = 0;
  const stages = ids.map((id) => {
    let duration;
    if (id === REVEAL_STAGE.FLIP) {
      duration = flipDuration(count, durations[REVEAL_STAGE.FLIP], stagger);
    } else if (id === REVEAL_STAGE.CUTIN) {
      duration = cutinUnit * targets.length;
    } else {
      duration = durations[id] ?? 0;
    }
    const stage = { id, start: cursor, duration, end: cursor + duration };
    cursor += duration;
    return stage;
  });

  const flipStage = stages.find((stage) => stage.id === REVEAL_STAGE.FLIP);
  const flipStart = flipStage ? flipStage.start : 0;
  const cardReveals = list.map((_, index) => ({ index, at: flipStart + index * stagger }));

  return {
    best,
    count,
    hasCutin: withCutin,
    cutinTargets: targets,
    cutinUnit: withCutin ? cutinUnit : 0,
    stagger,
    quality,
    particleCount: resolveParticleBudget(quality, best),
    stages,
    cardReveals,
    totalDuration: cursor
  };
}

/**
 * 계획에서 단계 정보를 찾는다.
 * @param {Object} plan - buildRevealPlan 결과
 * @param {string} stageId
 * @returns {{id:string,start:number,duration:number,end:number}|null}
 */
export function findStage(plan, stageId) {
  if (!plan || !Array.isArray(plan.stages)) return null;
  return plan.stages.find((stage) => stage.id === stageId) || null;
}

/**
 * 경과 시간에 해당하는 단계 id.
 * @param {Object} plan
 * @param {number} elapsed - ms
 * @returns {string} 마지막 단계를 넘어서면 grid
 */
export function stageAt(plan, elapsed) {
  if (!plan || !Array.isArray(plan.stages) || plan.stages.length === 0) return REVEAL_STAGE.GRID;
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const hit = plan.stages.find((stage) => t < stage.end);
  return hit ? hit.id : REVEAL_STAGE.GRID;
}

/**
 * 경과 시간까지 공개된 카드 수.
 * @param {Object} plan
 * @param {number} elapsed - ms
 * @returns {number} 0..count
 */
export function revealedCount(plan, elapsed) {
  if (!plan || !Array.isArray(plan.cardReveals)) return 0;
  const t = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  return plan.cardReveals.filter((entry) => t >= entry.at).length;
}

// ------------------------------------------------------------------
// 상태 머신
// ------------------------------------------------------------------

/**
 * 초기 상태.
 * @param {Object} plan
 * @returns {{stageId:string, stageIndex:number, revealed:number, skipped:boolean, done:boolean}}
 */
export function createRevealState(plan) {
  const stages = plan && Array.isArray(plan.stages) ? plan.stages : [];
  return {
    stageId: stages.length > 0 ? stages[0].id : REVEAL_STAGE.GRID,
    stageIndex: 0,
    revealed: 0,
    skipped: false,
    done: stages.length === 0
  };
}

/**
 * 종착(grid) 여부.
 * @param {Object} state
 * @returns {boolean}
 */
export function isTerminal(state) {
  return !!state && state.stageId === REVEAL_STAGE.GRID;
}

/**
 * 스킵 가능 여부. 종착 단계에서는 스킵할 것이 없다.
 * @param {Object} state
 * @returns {boolean}
 */
export function canSkip(state) {
  return !isTerminal(state);
}

/**
 * 다음 단계로 넘긴다. flip 을 벗어나면 모든 카드가 공개된 것으로 확정한다.
 * @param {Object} state
 * @param {Object} plan
 * @returns {Object} 새 상태 (입력을 변경하지 않는다)
 */
export function advance(state, plan) {
  const stages = plan && Array.isArray(plan.stages) ? plan.stages : [];
  if (!state || stages.length === 0) return createRevealState(plan);
  if (isTerminal(state)) return { ...state, done: true };

  const nextIndex = Math.min(state.stageIndex + 1, stages.length - 1);
  const nextId = stages[nextIndex].id;
  const passedFlip = nextIndex > stages.findIndex((stage) => stage.id === REVEAL_STAGE.FLIP);

  return {
    ...state,
    stageId: nextId,
    stageIndex: nextIndex,
    revealed: passedFlip ? plan.count : state.revealed,
    done: nextId === REVEAL_STAGE.GRID
  };
}

/**
 * flip 진행 중 카드 1장을 공개한다. flip 단계가 아니면 상태를 그대로 돌려준다.
 * @param {Object} state
 * @param {Object} plan
 * @returns {Object}
 */
export function revealNextCard(state, plan) {
  if (!state || state.stageId !== REVEAL_STAGE.FLIP) return state;
  const total = plan && Number.isFinite(plan.count) ? plan.count : 0;
  return { ...state, revealed: Math.min(state.revealed + 1, total) };
}

/**
 * 일괄 공개 — flip 단계의 남은 카드를 한 번에 공개한다.
 * 단계 자체는 넘기지 않는다(공개 후 컷인/그리드로 자연 진행).
 * @param {Object} state
 * @param {Object} plan
 * @returns {Object}
 */
export function revealAllCards(state, plan) {
  if (!state) return state;
  const total = plan && Number.isFinite(plan.count) ? plan.count : 0;
  return { ...state, revealed: total };
}

/**
 * 스킵 — 연출을 건너뛰고 결과 그리드로 직행한다.
 * @param {Object} state
 * @param {Object} plan
 * @returns {Object}
 */
export function skipToGrid(state, plan) {
  const stages = plan && Array.isArray(plan.stages) ? plan.stages : [];
  const total = plan && Number.isFinite(plan.count) ? plan.count : 0;
  return {
    ...(state || {}),
    stageId: REVEAL_STAGE.GRID,
    stageIndex: Math.max(0, stages.length - 1),
    revealed: total,
    skipped: true,
    done: true
  };
}

// ------------------------------------------------------------------
// 그리드 배치
// ------------------------------------------------------------------

/**
 * 결과 카드 그리드 좌표. 행 단위로 가로 중앙 정렬한다(마지막 행이 왼쪽으로 쏠리지 않는다).
 *
 * @param {number} count - 카드 수
 * @param {Object} [options]
 * @param {number} [options.cols] - 열 수. 기본 5 (카드 수보다 크면 카드 수로 줄인다)
 * @param {number} [options.cellW] - 카드 가로 피치
 * @param {number} [options.cellH] - 카드 세로 피치
 * @param {number} [options.centerX] - 그리드 중심 x
 * @param {number} [options.top] - 첫 행 중심 y
 * @returns {{cols:number, rows:number, width:number, height:number,
 *            positions:Array<{index:number,row:number,col:number,x:number,y:number}>}}
 */
export function gridLayout(count, options = {}) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const {
    cols: requestedCols = 5,
    cellW = 120,
    cellH = 168,
    centerX = 360,
    top = 0
  } = options;

  if (n === 0) return { cols: 0, rows: 0, width: 0, height: 0, positions: [] };

  const cols = Math.max(1, Math.min(Math.floor(requestedCols), n));
  const rows = Math.ceil(n / cols);

  const positions = [];
  for (let index = 0; index < n; index++) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const inRow = Math.min(cols, n - row * cols);
    const rowWidth = (inRow - 1) * cellW;
    positions.push({
      index,
      row,
      col,
      x: centerX - rowWidth / 2 + col * cellW,
      y: top + row * cellH
    });
  }

  return {
    cols,
    rows,
    width: (cols - 1) * cellW,
    height: (rows - 1) * cellH,
    positions
  };
}

export default {
  REVEAL_STAGE,
  STAGE_ORDER,
  STAGE_DURATION,
  CUTIN_DURATION,
  CUTIN_RARITIES,
  MAX_CUTIN_TARGETS,
  FLIP_STAGGER,
  QUALITY_TIER,
  PARTICLE_BUDGET,
  bestRarity,
  hasCutin,
  cutinTargets,
  cutinDuration,
  resolveQualityTier,
  resolveParticleBudget,
  stageSequence,
  flipDuration,
  buildRevealPlan,
  findStage,
  stageAt,
  revealedCount,
  createRevealState,
  isTerminal,
  canSkip,
  advance,
  revealNextCard,
  revealAllCards,
  skipToGrid,
  gridLayout
};
