import { describe, it, expect } from 'vitest';
import { generateExamples, hashSeed } from './examples';
import { hasViolation } from './engine';
import { RULES } from './rules';
import { SIZE } from './types';

describe('증거 예시 생성', () => {
  for (const rule of RULES) {
    it(`${rule.id} — ✓ 위반0 / ✗ 위반≥1, 개수 정확`, () => {
      const ex = generateExamples(rule, hashSeed(rule.id));
      expect(ex.valid.length, `${rule.id} valid 개수`).toBe(3);
      expect(ex.invalid.length, `${rule.id} invalid 개수`).toBe(2);
      for (const b of ex.valid) {
        expect(hasViolation(b, rule), `${rule.id} ✓ 예시에 위반 존재`).toBe(false);
      }
      for (const b of ex.invalid) {
        expect(hasViolation(b, rule), `${rule.id} ✗ 예시에 위반 없음`).toBe(true);
      }
    });
  }

  it('결정론적 — 같은 시드는 같은 예시', () => {
    const r = RULES[0];
    expect(JSON.stringify(generateExamples(r, 12345))).toBe(
      JSON.stringify(generateExamples(r, 12345))
    );
  });

  it('✓ 예시는 부분 보드 (전체 정답을 베낄 수 없음)', () => {
    for (const r of RULES) {
      const ex = generateExamples(r, hashSeed('partial:' + r.id));
      for (const b of ex.valid) {
        const filled = b.flat().filter(Boolean).length;
        expect(filled).toBeGreaterThan(0);
        expect(filled).toBeLessThan(SIZE * SIZE);
      }
    }
  });
});
