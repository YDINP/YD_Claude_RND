/**
 * MenuGridGate.test.js
 * T-11 — 메뉴 그리드 열 수 규칙 (4열 → 5열 대응).
 *
 * SSOT: docs/redesign/REDESIGN_PLAN.md §3-1 / docs/story/UX_ONBOARDING_FLOW.md §6-1, §2-6
 */
import { describe, it, expect } from 'vitest';
import {
  MenuGridGate,
  MAX_COLUMNS,
  WIDE_LABEL_MAX_COLUMNS,
  LABEL_FONT_BASE,
} from '../../src/systems/MenuGridGate.js';

describe('메뉴 그리드 열 수', () => {
  it('13개는 5열 3행으로 놓여 고아 행이 생기지 않는다', () => {
    // 4열이면 4/4/4/1 — 마지막 행에 1개만 남는다
    expect(MenuGridGate.getColumnCount(13)).toBe(5);
    expect(MenuGridGate.getRowCount(13)).toBe(3);
    expect(13 % MenuGridGate.getColumnCount(13)).not.toBe(1);
  });

  it('5개 이하는 한 줄에 전부 놓아 라벨과 탭 타겟을 키운다', () => {
    expect(MenuGridGate.getColumnCount(1)).toBe(1);
    expect(MenuGridGate.getColumnCount(3)).toBe(3);
    expect(MenuGridGate.getColumnCount(5)).toBe(5);
    expect(MenuGridGate.getRowCount(5)).toBe(1);
  });

  it('첫 세션 종료 시점의 7개는 4열(4/3)로 균형을 맞춘다', () => {
    // UX §2-6: 1-5 클리어 시 그리드는 7개. 5열이면 5/2 로 마지막 행이 헐거워진다.
    expect(MenuGridGate.getColumnCount(7)).toBe(4);
    expect(MenuGridGate.getRowCount(7)).toBe(2);
    expect(MenuGridGate.getColumnCount(8)).toBe(4);
  });

  it('0개면 그리드를 그리지 않는다 (신규 유저 첫 화면)', () => {
    expect(MenuGridGate.getColumnCount(0)).toBe(0);
    expect(MenuGridGate.getRowCount(0)).toBe(0);
    expect(MenuGridGate.shouldRenderGrid(0)).toBe(false);
    expect(MenuGridGate.shouldRenderGrid(2)).toBe(true);
  });

  it('라벨 폰트는 항목 수가 아니라 실제 열 수를 따른다', () => {
    expect(MAX_COLUMNS).toBe(5);
    expect(WIDE_LABEL_MAX_COLUMNS).toBe(4);
    // 4열 이하 → 크게, 5열 → 좁으니 작게
    expect(MenuGridGate.getLabelFontSize(7)).toBe(LABEL_FONT_BASE.WIDE);
    expect(MenuGridGate.getLabelFontSize(13)).toBe(LABEL_FONT_BASE.DENSE);
  });

  it('온보딩 노출 추이(0 → 2 → 3 → 4 → 7 → 13)가 전부 유효한 열 수를 낸다', () => {
    [0, 2, 3, 4, 7, 13].forEach((count) => {
      const cols = MenuGridGate.getColumnCount(count);
      expect(cols).toBeLessThanOrEqual(MAX_COLUMNS);
      expect(cols).toBeLessThanOrEqual(Math.max(count, 0));
      if (count > 0) expect(cols).toBeGreaterThan(0);
    });
  });
});
