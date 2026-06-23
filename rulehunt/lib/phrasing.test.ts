import { describe, it, expect } from 'vitest';
import {
  RULE_PHRASE,
  ALL_CHIPS,
  buildPalette,
  checkAnswer,
  answerFor,
  countCorrectPositions,
} from './phrasing';
import { RULES } from './rules';

describe('규칙 진술(단어 조합)', () => {
  it('모든 규칙에 정답 문장이 있다', () => {
    for (const r of RULES) {
      expect(RULE_PHRASE[r.id], `${r.id} 정답 누락`).toBeTruthy();
      expect(RULE_PHRASE[r.id].length).toBeGreaterThanOrEqual(2);
    }
  });

  it('정답 칩 안에 중복 텍스트가 없다 (탭 식별 가능)', () => {
    for (const r of RULES) {
      const a = RULE_PHRASE[r.id];
      expect(new Set(a).size, `${r.id} 정답 칩 중복`).toBe(a.length);
    }
  });

  it('정답 칩은 모두 전역 칩 풀에 포함된다', () => {
    for (const r of RULES) {
      for (const chip of RULE_PHRASE[r.id]) {
        expect(ALL_CHIPS).toContain(chip);
      }
    }
  });

  it('팔레트는 정답 칩을 모두 포함하고, 정답보다 크다', () => {
    for (const r of RULES) {
      const pal = buildPalette(r.id, 12345);
      for (const chip of RULE_PHRASE[r.id]) {
        expect(pal, `${r.id} 팔레트에 정답 칩 누락`).toContain(chip);
      }
      expect(pal.length).toBeGreaterThan(RULE_PHRASE[r.id].length);
      // 칩 텍스트 유일성
      expect(new Set(pal).size).toBe(pal.length);
    }
  });

  it('팔레트는 시드 결정론적', () => {
    expect(buildPalette('e1-red-circle', 7)).toEqual(buildPalette('e1-red-circle', 7));
  });

  it('checkAnswer: 어순 무관 — 같은 칩이면 순서 달라도 통과, 칩 틀리면 실패', () => {
    const id = 'e1-red-circle';
    expect(checkAnswer(id, answerFor(id))).toBe(true);
    // 어순이 달라도 같은 칩 집합이면 정답
    expect(checkAnswer(id, [...answerFor(id)].reverse())).toBe(true);
    // 칩이 틀리면 실패
    expect(checkAnswer(id, ['빨간 타일은', '사각형', '이어야 한다'])).toBe(false);
    // 칩 개수가 모자라면 실패
    expect(checkAnswer(id, answerFor(id).slice(0, 2))).toBe(false);
  });

  it('countCorrectPositions: 위치 일치 개수', () => {
    const id = 'e1-red-circle';
    const ans = answerFor(id); // ['빨간 타일은','원','이어야 한다']
    expect(countCorrectPositions(id, ans)).toBe(3);
    expect(countCorrectPositions(id, ['빨간 타일은', '사각형', '이어야 한다'])).toBe(2);
  });
});
