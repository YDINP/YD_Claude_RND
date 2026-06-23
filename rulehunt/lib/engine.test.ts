import { describe, it, expect } from 'vitest';
import {
  createBoard,
  placeTile,
  filledCount,
  isFull,
  evaluate,
  isClear,
  starRating,
} from './engine';
import { getRuleById } from './rules';

describe('보드 조작', () => {
  it('빈 보드는 5x5 전부 null', () => {
    const b = createBoard();
    expect(b.length).toBe(5);
    expect(b.every((row) => row.length === 5 && row.every((c) => c === null))).toBe(true);
    expect(filledCount(b)).toBe(0);
    expect(isFull(b)).toBe(false);
  });

  it('placeTile은 불변 — 원본 보드를 바꾸지 않는다', () => {
    const b = createBoard();
    const b2 = placeTile(b, 0, 0, { color: 'red', shape: 'circle' });
    expect(b[0][0]).toBeNull();
    expect(b2[0][0]).toEqual({ color: 'red', shape: 'circle' });
    expect(filledCount(b2)).toBe(1);
  });
});

describe('피드백 평가', () => {
  const rule = getRuleById('e5-no-yellow')!; // 노랑 금지

  it('빈 칸은 null, 준수=true, 위반=false', () => {
    let b = createBoard();
    b = placeTile(b, 0, 0, { color: 'red', shape: 'circle' }); // OK
    b = placeTile(b, 0, 1, { color: 'yellow', shape: 'square' }); // 위반
    const fb = evaluate(b, rule);
    expect(fb[0][0]).toBe(true);
    expect(fb[0][1]).toBe(false);
    expect(fb[1][1]).toBeNull();
  });
});

describe('클리어 판정', () => {
  const rule = getRuleById('e5-no-yellow')!;

  it('가득 차고 위반 없으면 클리어', () => {
    const b = createBoard();
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) b[r][c] = { color: 'red', shape: 'circle' };
    expect(isClear(b, rule)).toBe(true);
  });

  it('한 칸이라도 비면 클리어 아님', () => {
    const b = createBoard();
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) b[r][c] = { color: 'red', shape: 'circle' };
    b[2][2] = null;
    expect(isClear(b, rule)).toBe(false);
  });

  it('가득 찼어도 위반 있으면 클리어 아님', () => {
    const b = createBoard();
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) b[r][c] = { color: 'red', shape: 'circle' };
    b[2][2] = { color: 'yellow', shape: 'circle' };
    expect(isClear(b, rule)).toBe(false);
  });
});

describe('별 등급', () => {
  it('제출 횟수에 따라 1~3성 (적을수록 고수)', () => {
    expect(starRating(1)).toBe(3);
    expect(starRating(2)).toBe(3);
    expect(starRating(3)).toBe(2);
    expect(starRating(5)).toBe(2);
    expect(starRating(6)).toBe(1);
    expect(starRating(99)).toBe(1);
  });
});
