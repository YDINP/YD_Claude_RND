/**
 * CoachMark.test.js
 * T-C6 — 말풍선 가변폭 규정(UXI-09)과 배치 계산. Phaser 렌더는 다루지 않는다.
 */
import { describe, it, expect } from 'vitest';
import {
  CoachMark,
  BUBBLE_WIDTH_BASE,
  BUBBLE_FONT_BASE,
  BUBBLE_MAX_LINES,
  ARROW_DIRECTION,
} from '../../src/components/tutorial/CoachMark.js';

describe('CoachMark 말풍선 계산', () => {
  it('짧은 문구는 최소 폭을 유지한다', () => {
    const { widthBase, fontBase } = CoachMark.measure('각인 메뉴가 열렸습니다');
    expect(widthBase).toBe(BUBBLE_WIDTH_BASE.MIN);
    expect(fontBase).toBe(BUBBLE_FONT_BASE.NORMAL);
  });

  it('폭은 base 240~560 사이로 제한된다', () => {
    const long = CoachMark.measure('A'.repeat(400));
    expect(long.widthBase).toBeLessThanOrEqual(BUBBLE_WIDTH_BASE.MAX);
    expect(long.widthBase).toBeGreaterThanOrEqual(BUBBLE_WIDTH_BASE.MIN);
  });

  it('2줄을 넘기면 폰트를 sf(16) → sf(14) 로 축소한다', () => {
    const shrunk = CoachMark.measure('A'.repeat(200));
    expect(shrunk.fontBase).toBe(BUBBLE_FONT_BASE.SHRUNK);
  });

  it('한국어 안내 문구는 2줄 안에 들어간다', () => {
    ['이제 1-4에 다시 도전하세요', '파티를 편성하세요 (자동 편성 가능)', '게임을 꺼도 동료들이 계속 싸웁니다'].forEach((text) => {
      expect(CoachMark.measure(text).lines).toBeLessThanOrEqual(BUBBLE_MAX_LINES);
    });
  });

  it('대상 위에 공간이 있으면 위쪽에 두고 아래를 가리킨다', () => {
    const placement = CoachMark.resolvePlacement({ x: 0, y: 900, w: 120, h: 135 }, 120, 1920, 30);
    expect(placement.direction).toBe(ARROW_DIRECTION.DOWN);
    expect(placement.y).toBe(750);
  });

  it('대상이 화면 최상단이면 아래에 두고 위를 가리킨다', () => {
    const placement = CoachMark.resolvePlacement({ x: 0, y: 10, w: 120, h: 60 }, 120, 1920, 30);
    expect(placement.direction).toBe(ARROW_DIRECTION.UP);
    expect(placement.y).toBe(100);
  });

  it('대상이 없으면 화면 하단에 배치한다', () => {
    const placement = CoachMark.resolvePlacement(null, 120, 1920, 30);
    expect(placement.y).toBeGreaterThan(1920 / 2);
  });
});
