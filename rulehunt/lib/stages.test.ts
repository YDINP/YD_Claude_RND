import { describe, it, expect } from 'vitest';
import { STAGES, TOTAL_STAGES, getStageRule, stageSeed } from './stages';
import { RULES } from './rules';

describe('스테이지 커리큘럼', () => {
  it('모든 규칙이 스테이지가 된다', () => {
    expect(TOTAL_STAGES).toBe(RULES.length);
    expect(STAGES.length).toBe(RULES.length);
  });

  it('난이도 오름차순으로 정렬된다', () => {
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].difficulty).toBeGreaterThanOrEqual(STAGES[i - 1].difficulty);
    }
  });

  it('getStageRule은 1-based', () => {
    expect(getStageRule(1)).toBe(STAGES[0]);
    expect(getStageRule(TOTAL_STAGES)).toBe(STAGES[TOTAL_STAGES - 1]);
    expect(getStageRule(0)).toBeNull();
    expect(getStageRule(TOTAL_STAGES + 1)).toBeNull();
  });

  it('첫 스테이지가 가장 쉽다', () => {
    expect(STAGES[0].difficulty).toBe(Math.min(...RULES.map((r) => r.difficulty)));
  });

  it('stageSeed는 결정론적', () => {
    expect(stageSeed(3)).toBe(stageSeed(3));
    expect(stageSeed(1)).not.toBe(stageSeed(2));
  });
});
