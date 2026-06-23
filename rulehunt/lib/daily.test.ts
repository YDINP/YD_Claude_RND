import { describe, it, expect } from 'vitest';
import { getDaily, kstDateParts, msUntilNextKstMidnight } from './daily';
import { buildShareText } from './share';
import { evaluate, solve } from './engine';

describe('데일리 시스템', () => {
  it('KST 날짜 변환 — UTC 15:00은 다음날 00:00 KST', () => {
    const utc = new Date('2026-06-23T15:30:00Z');
    const { dateStr, weekday } = kstDateParts(utc);
    expect(dateStr).toBe('2026-06-24');
    expect(weekday).toBe(3); // 2026-06-24 수요일
  });

  it('같은 시각이면 항상 같은 규칙 (결정론적)', () => {
    const t = new Date('2026-06-23T01:00:00Z');
    expect(getDaily(t).rule.id).toBe(getDaily(t).rule.id);
  });

  it('요일 테마에 맞는 규칙을 고른다 — 월요일=color', () => {
    // 2026-06-22 (월) KST
    const mon = new Date('2026-06-22T03:00:00Z');
    const d = getDaily(mon);
    expect(d.weekday).toBe(1);
    expect(d.rule.theme).toBe('color');
  });

  it('퍼즐 번호는 1 이상', () => {
    const d = getDaily(new Date('2026-06-23T03:00:00Z'));
    expect(d.puzzleNumber).toBeGreaterThanOrEqual(1);
  });

  it('자정까지 남은 시간은 0~24시간 범위', () => {
    const ms = msUntilNextKstMidnight(new Date('2026-06-23T03:00:00Z'));
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});

describe('공유 텍스트', () => {
  it('클리어 보드는 전부 🟩, 규칙 내용은 노출 안 함', () => {
    const d = getDaily(new Date('2026-06-23T03:00:00Z'));
    const sol = solve(d.rule)!;
    const fb = evaluate(sol, d.rule);
    const text = buildShareText({
      puzzleNumber: d.puzzleNumber,
      attempts: 3,
      streak: 5,
      cleared: true,
      feedback: fb,
    });
    expect(text).toContain('오늘의 규칙');
    expect(text).toContain('🟩');
    expect(text).not.toContain('🟥');
    expect(text).toContain('🔥 5일 연속');
    expect(text).not.toContain(d.rule.reveal);
  });
});
