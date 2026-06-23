import { describe, it, expect } from 'vitest';
import { RULES, getRuleById } from './rules';
import { solve, isClear, isFull, hasViolation, createBoard } from './engine';
import { SIZE } from './types';

describe('규칙 풀 무결성', () => {
  it('22개 규칙 (초급7·중급7·고급6·전문가2)', () => {
    expect(RULES.length).toBe(22);
    expect(RULES.filter((r) => r.grade === 'easy').length).toBe(7);
    expect(RULES.filter((r) => r.grade === 'medium').length).toBe(7);
    expect(RULES.filter((r) => r.grade === 'hard').length).toBe(6);
    expect(RULES.filter((r) => r.grade === 'expert').length).toBe(2);
  });

  it('모든 규칙은 양의 난이도를 가진다', () => {
    for (const r of RULES) expect(r.difficulty).toBeGreaterThan(0);
  });

  it('모든 규칙 id가 고유하다', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('모든 규칙은 3단계 힌트와 reveal 문구를 가진다', () => {
    for (const r of RULES) {
      expect(r.hints).toHaveLength(3);
      r.hints.forEach((h) => expect(h.length).toBeGreaterThan(0));
      expect(r.reveal.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });

  it('getRuleById가 동작한다', () => {
    expect(getRuleById('e1-red-circle')?.grade).toBe('easy');
    expect(getRuleById('nope')).toBeUndefined();
  });
});

describe('모든 규칙은 풀이 가능하다 (솔버)', () => {
  for (const rule of RULES) {
    it(`${rule.id} — 가득 찬 클리어 보드가 존재`, () => {
      const sol = solve(rule);
      expect(sol, `${rule.id} 풀이 불가`).not.toBeNull();
      expect(isFull(sol!)).toBe(true);
      // 불변식: 풀린 보드는 위반 0 → 클리어
      expect(hasViolation(sol!, rule)).toBe(false);
      expect(isClear(sol!, rule)).toBe(true);
    });
  }
});

describe('규칙은 자명하지 않다 (위반 가능)', () => {
  for (const rule of RULES) {
    it(`${rule.id} — 위반을 만들 수 있는 배치가 존재`, () => {
      // 솔버 해의 한 칸을 모든 타일로 바꿔보며 위반이 발생하는 경우가 있는지 확인
      const sol = solve(rule)!;
      let foundViolation = false;
      const COLORS = ['red', 'blue', 'yellow', 'green'] as const;
      const SHAPES = ['circle', 'triangle', 'square', 'star'] as const;
      outer: for (let r = 0; r < SIZE && !foundViolation; r++) {
        for (let c = 0; c < SIZE; c++) {
          for (const color of COLORS) {
            for (const shape of SHAPES) {
              sol[r][c] = { color, shape };
              if (hasViolation(sol, rule)) {
                foundViolation = true;
                break outer;
              }
            }
          }
        }
      }
      expect(foundViolation, `${rule.id} 은(는) 어떤 배치든 통과 — 자명함`).toBe(true);
    });
  }
});

describe('빈 보드는 클리어가 아니다', () => {
  it('createBoard는 클리어 상태가 아님', () => {
    const b = createBoard();
    for (const rule of RULES) {
      expect(isClear(b, rule)).toBe(false);
    }
  });
});
