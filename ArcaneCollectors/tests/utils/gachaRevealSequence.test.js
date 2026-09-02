/**
 * gachaRevealSequence.test.js — T-14
 * 소환 결과 5단계 연출의 시간축과 상태 전이. Phaser 렌더는 범위 밖이다.
 */
import { describe, it, expect } from 'vitest';
import {
  REVEAL_STAGE,
  STAGE_ORDER,
  STAGE_DURATION,
  FLIP_STAGGER,
  RARITY_ORDER,
  QUALITY_TIER,
  PARTICLE_BUDGET,
  rarityRank,
  bestRarity,
  hasCutin,
  cutinTargets,
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
} from '../../src/utils/gachaRevealSequence.js';

const r = (rarity, extra = {}) => ({ id: `c_${rarity}_${Math.random()}`, rarity, ...extra });
const tenPull = (best = 'SR') => [
  r('R'), r('R'), r('N'), r('R'), r('R'), r('R'), r('N'), r('R'), r('R'), r(best)
];

describe('등급 판정', () => {
  it('결과 중 최고 등급을 고른다', () => {
    expect(bestRarity([r('N'), r('SR'), r('R')])).toBe('SR');
    expect(bestRarity([r('R'), r('SSR'), r('SR')])).toBe('SSR');
  });

  it('빈 배열과 미상 등급은 N 으로 떨어진다', () => {
    expect(bestRarity([])).toBe('N');
    expect(bestRarity(null)).toBe('N');
    expect(bestRarity([{ rarity: 'LEGEND' }])).toBe('N');
    expect(rarityRank('LEGEND')).toBe(-1);
  });

  it('등급 서열은 N < R < SR < SSR 이다', () => {
    expect(RARITY_ORDER).toEqual(['N', 'R', 'SR', 'SSR']);
    expect(rarityRank('SSR')).toBeGreaterThan(rarityRank('SR'));
    expect(rarityRank('R')).toBeGreaterThan(rarityRank('N'));
  });

  it('컷인은 SSR 에서만 붙고 대상은 등장 순서를 지킨다', () => {
    const a = r('SSR', { name: '첫째' });
    const b = r('SSR', { name: '둘째' });
    expect(hasCutin([r('SR'), r('R')])).toBe(false);
    expect(hasCutin([r('R'), a])).toBe(true);
    expect(cutinTargets([r('R'), a, r('SR'), b]).map((x) => x.name)).toEqual(['첫째', '둘째']);
  });
});

describe('단계 시퀀스', () => {
  it('SSR 이 없으면 cutin 단계가 시퀀스에서 통째로 빠진다', () => {
    expect(stageSequence(false)).toEqual([
      REVEAL_STAGE.CIRCLE, REVEAL_STAGE.PILLAR, REVEAL_STAGE.FLIP, REVEAL_STAGE.GRID
    ]);
    expect(stageSequence(true)).toEqual(STAGE_ORDER);
  });

  it('flip 길이는 카드 1장 + 남은 카드의 stagger 합이다', () => {
    expect(flipDuration(1)).toBe(STAGE_DURATION[REVEAL_STAGE.FLIP]);
    expect(flipDuration(10)).toBe(STAGE_DURATION[REVEAL_STAGE.FLIP] + FLIP_STAGGER * 9);
    expect(flipDuration(0)).toBe(0);
  });

  it('계획의 단계 구간은 빈틈 없이 이어지고 총 길이와 맞는다', () => {
    const plan = buildRevealPlan(tenPull('SSR'));
    let cursor = 0;
    plan.stages.forEach((stage) => {
      expect(stage.start).toBe(cursor);
      expect(stage.end).toBe(stage.start + stage.duration);
      cursor = stage.end;
    });
    expect(plan.totalDuration).toBe(cursor);
  });

  it('SSR 10연 총 길이가 온보딩 e2e 예산(6초)을 넉넉히 밑돈다', () => {
    const plan = buildRevealPlan(tenPull('SSR'));
    expect(plan.hasCutin).toBe(true);
    expect(plan.totalDuration).toBeLessThan(5000);
  });

  it('카드 공개 시각은 flip 시작에서 stagger 간격으로 늘어선다', () => {
    const plan = buildRevealPlan(tenPull());
    const flip = findStage(plan, REVEAL_STAGE.FLIP);
    expect(plan.cardReveals).toHaveLength(10);
    expect(plan.cardReveals[0].at).toBe(flip.start);
    expect(plan.cardReveals[9].at).toBe(flip.start + FLIP_STAGGER * 9);
  });

  it('경과 시간으로 현재 단계와 공개된 카드 수를 되찾는다', () => {
    const plan = buildRevealPlan(tenPull());
    const flip = findStage(plan, REVEAL_STAGE.FLIP);
    expect(stageAt(plan, 0)).toBe(REVEAL_STAGE.CIRCLE);
    expect(stageAt(plan, flip.start + 10)).toBe(REVEAL_STAGE.FLIP);
    expect(stageAt(plan, plan.totalDuration + 1)).toBe(REVEAL_STAGE.GRID);
    expect(revealedCount(plan, flip.start - 1)).toBe(0);
    expect(revealedCount(plan, flip.start)).toBe(1);
    expect(revealedCount(plan, plan.totalDuration)).toBe(10);
  });

  it('단발 소환은 cutin 이 없으면 4단계로 끝난다', () => {
    const plan = buildRevealPlan([r('R')]);
    expect(plan.count).toBe(1);
    expect(plan.stages.map((x) => x.id)).not.toContain(REVEAL_STAGE.CUTIN);
    expect(findStage(plan, REVEAL_STAGE.FLIP).duration).toBe(STAGE_DURATION[REVEAL_STAGE.FLIP]);
  });
});

describe('저사양 파티클 상한', () => {
  it('블러 백드롭이 꺼져 있으면 저품질로 판정한다', () => {
    expect(resolveQualityTier({ useBlurBackdrop: false })).toBe(QUALITY_TIER.LOW);
    expect(resolveQualityTier({ isMobile: true })).toBe(QUALITY_TIER.MEDIUM);
    expect(resolveQualityTier({ isMobile: true, pixelRatio: 3 })).toBe(QUALITY_TIER.LOW);
    expect(resolveQualityTier({})).toBe(QUALITY_TIER.HIGH);
  });

  it('파티클 수는 티어 상한을 넘지 않고 최소 1개는 남는다', () => {
    expect(resolveParticleBudget(QUALITY_TIER.HIGH, 'SSR')).toBe(PARTICLE_BUDGET.high);
    expect(resolveParticleBudget(QUALITY_TIER.LOW, 'SSR')).toBeLessThanOrEqual(PARTICLE_BUDGET.low);
    expect(resolveParticleBudget(QUALITY_TIER.LOW, 'N')).toBeGreaterThanOrEqual(1);
    expect(resolveParticleBudget('알수없음', 'SR')).toBeLessThanOrEqual(PARTICLE_BUDGET.medium);
  });

  it('계획이 품질 티어에 따른 파티클 상한을 함께 들고 있다', () => {
    const high = buildRevealPlan(tenPull('SSR'), { quality: QUALITY_TIER.HIGH });
    const low = buildRevealPlan(tenPull('SSR'), { quality: QUALITY_TIER.LOW });
    expect(high.particleCount).toBeGreaterThan(low.particleCount);
    expect(low.particleCount).toBeLessThanOrEqual(PARTICLE_BUDGET.low);
  });
});

describe('상태 머신', () => {
  it('초기 상태는 첫 단계이고 공개된 카드가 없다', () => {
    const plan = buildRevealPlan(tenPull());
    const state = createRevealState(plan);
    expect(state.stageId).toBe(REVEAL_STAGE.CIRCLE);
    expect(state.revealed).toBe(0);
    expect(state.skipped).toBe(false);
    expect(isTerminal(state)).toBe(false);
    expect(canSkip(state)).toBe(true);
  });

  it('advance 는 입력 상태를 바꾸지 않고 새 상태를 돌려준다', () => {
    const plan = buildRevealPlan(tenPull());
    const first = createRevealState(plan);
    const second = advance(first, plan);
    expect(first.stageId).toBe(REVEAL_STAGE.CIRCLE);
    expect(second.stageId).toBe(REVEAL_STAGE.PILLAR);
    expect(second).not.toBe(first);
  });

  it('flip 을 벗어나면 카드가 전부 공개된 것으로 확정된다', () => {
    const plan = buildRevealPlan(tenPull('SSR'));
    let state = createRevealState(plan);
    state = advance(state, plan); // pillar
    state = advance(state, plan); // flip
    expect(state.revealed).toBe(0);
    state = advance(state, plan); // cutin
    expect(state.stageId).toBe(REVEAL_STAGE.CUTIN);
    expect(state.revealed).toBe(10);
  });

  it('마지막 단계에서 advance 를 더 불러도 grid 에 머문다', () => {
    const plan = buildRevealPlan([r('R')]);
    let state = createRevealState(plan);
    for (let i = 0; i < 8; i++) state = advance(state, plan);
    expect(state.stageId).toBe(REVEAL_STAGE.GRID);
    expect(state.done).toBe(true);
    expect(canSkip(state)).toBe(false);
  });

  it('카드 1장 공개는 flip 단계에서만 카운트가 오른다', () => {
    const plan = buildRevealPlan(tenPull());
    let state = createRevealState(plan);
    expect(revealNextCard(state, plan).revealed).toBe(0); // circle 단계
    state = advance(advance(state, plan), plan);          // flip
    state = revealNextCard(state, plan);
    expect(state.revealed).toBe(1);
  });

  it('일괄 공개는 카드만 전부 열고 단계는 그대로 둔다', () => {
    const plan = buildRevealPlan(tenPull());
    let state = advance(advance(createRevealState(plan), plan), plan); // flip
    state = revealAllCards(state, plan);
    expect(state.revealed).toBe(10);
    expect(state.stageId).toBe(REVEAL_STAGE.FLIP);
    expect(state.skipped).toBe(false);
  });

  it('스킵은 어느 단계에서든 grid 로 직행하고 skipped 를 남긴다', () => {
    const plan = buildRevealPlan(tenPull('SSR'));
    const skipped = skipToGrid(createRevealState(plan), plan);
    expect(skipped.stageId).toBe(REVEAL_STAGE.GRID);
    expect(skipped.revealed).toBe(10);
    expect(skipped.skipped).toBe(true);
    expect(isTerminal(skipped)).toBe(true);
  });

  it('빈 결과는 즉시 종료 상태다', () => {
    const plan = buildRevealPlan([]);
    const state = createRevealState(plan);
    expect(plan.count).toBe(0);
    expect(state.stageId).toBe(REVEAL_STAGE.CIRCLE);
    expect(skipToGrid(state, plan).revealed).toBe(0);
  });
});

describe('결과 그리드 배치', () => {
  it('10연은 5열 2행이고 행마다 가로 중앙 정렬된다', () => {
    const layout = gridLayout(10, { cols: 5, cellW: 128, cellH: 182, centerX: 360, top: 566 });
    expect(layout.cols).toBe(5);
    expect(layout.rows).toBe(2);
    const row0 = layout.positions.filter((p) => p.row === 0).map((p) => p.x);
    const mid = row0.reduce((a, b) => a + b, 0) / row0.length;
    expect(mid).toBeCloseTo(360, 5);
  });

  it('마지막 행이 덜 찼어도 왼쪽으로 쏠리지 않는다', () => {
    const layout = gridLayout(7, { cols: 5, cellW: 100, centerX: 360 });
    const lastRow = layout.positions.filter((p) => p.row === 1);
    expect(lastRow).toHaveLength(2);
    const mid = lastRow.reduce((a, p) => a + p.x, 0) / lastRow.length;
    expect(mid).toBeCloseTo(360, 5);
  });

  it('카드가 열 수보다 적으면 열이 카드 수로 줄어든다', () => {
    expect(gridLayout(1, { cols: 5 }).cols).toBe(1);
    expect(gridLayout(3, { cols: 5 }).rows).toBe(1);
    expect(gridLayout(0).positions).toEqual([]);
  });
});
