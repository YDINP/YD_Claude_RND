/**
 * PopupBase.test.js — T-20
 * 팝업 4슬롯(헤더/요약/콘텐츠/액션바) 배치 계산만 다룬다. Phaser 렌더는 범위 밖이다.
 * 검증 대상은 `src/utils/popupLayout.js` 의 순수 함수와, 그것이 재현하는
 * 레거시 `contentBounds` 값이다.
 */
import { describe, it, expect } from 'vitest';
import {
  POPUP_SLOT,
  LEGACY_SLOT,
  ACTION_VARIANT,
  MAX_ACTIONS,
  makeBounds,
  computePopupSlots,
  computeActionSlots,
  computeSummaryColumns,
  normalizeActions,
  normalizeSummary,
  resolveActionStyle
} from '../../src/utils/popupLayout.js';
import { s } from '../../src/config/scaleConfig.js';

/** 렌더 좌표계 화면 크기 */
const SCREEN_W = 1080;
const SCREEN_H = 1920;

/** PopupBase 생성자 기본값과 같은 패널 크기 */
const PANEL_W = s(680);
const PANEL_H = s(1100);

/** PopupBase.recomputeLayout() 이 넘기는 것과 같은 인자를 만든다 */
function legacyArgs(overrides = {}) {
  const spec = LEGACY_SLOT;
  return {
    screenWidth: SCREEN_W,
    screenHeight: SCREEN_H,
    width: PANEL_W,
    height: PANEL_H,
    headerHeight: s(spec.headerHeight),
    summaryHeight: 0,
    actionBarHeight: 0,
    padX: s(spec.padX),
    padBottom: s(spec.padBottom),
    dividerLift: s(spec.dividerLift),
    dividerInset: s(spec.dividerInset),
    underline: s(spec.underline),
    closeInsetX: s(spec.closeInsetX),
    closeInsetY: s(spec.closeInsetY),
    closeHit: s(spec.closeHit),
    titleAlign: spec.titleAlign,
    titlePadX: s(spec.titlePadX),
    titleOffsetY: s(spec.titleOffsetY),
    ...overrides
  };
}

describe('makeBounds', () => {
  it('좌상단·크기에서 8개 키를 모두 채운다', () => {
    expect(makeBounds(100, 200, 300, 400)).toEqual({
      left: 100, top: 200, right: 400, bottom: 600,
      width: 300, height: 400, centerX: 250, centerY: 400
    });
  });

  it('NaN·undefined 를 0 으로 흡수해 좌표를 오염시키지 않는다', () => {
    const b = makeBounds(undefined, NaN, 100, 50);
    expect(b.left).toBe(0);
    expect(b.top).toBe(0);
    expect(b.centerY).toBe(25);
    expect(Number.isNaN(b.centerX)).toBe(false);
  });

  it('음수 크기는 0 으로 잘린다', () => {
    const b = makeBounds(0, 0, -50, -10);
    expect(b.width).toBe(0);
    expect(b.height).toBe(0);
  });
});

describe('computePopupSlots — 레거시 contentBounds 재현 (하위 호환)', () => {
  const slots = computePopupSlots(legacyArgs());

  // 리디자인 이전 PopupBase.show() 가 계산하던 값
  const left = SCREEN_W / 2 - PANEL_W / 2;
  const top = SCREEN_H / 2 - PANEL_H / 2;

  it('콘텐츠 left/top/right/bottom 이 이전 값과 같다', () => {
    expect(slots.content.left).toBe(left + s(15));
    expect(slots.content.top).toBe(top + s(70));
    expect(slots.content.right).toBe(left + PANEL_W - s(15));
    expect(slots.content.bottom).toBe(top + PANEL_H - s(15));
  });

  it('콘텐츠 height 가 이전 값(panelHeight - s(85))과 같다', () => {
    expect(slots.content.height).toBe(PANEL_H - s(85));
  });

  it('centerX 는 이전과 같고 centerY 가 새로 생겼다 (NaN 결함 해소)', () => {
    expect(slots.content.centerX).toBe(SCREEN_W / 2);
    expect(slots.content.centerY).toBe((slots.content.top + slots.content.bottom) / 2);
    expect(Number.isFinite(slots.content.centerY)).toBe(true);
  });

  it('구분선이 패널 상단 +s(60), 좌우 s(20) 안쪽에 놓인다', () => {
    expect(slots.divider.y).toBe(top + s(60));
    expect(slots.divider.left).toBe(left + s(20));
    expect(slots.divider.right).toBe(left + PANEL_W - s(20));
    expect(slots.divider.underline).toBe(0);
  });

  it('닫기 ✕ 가 패널 우상단 (right - s(30), top + s(20)) 에 놓인다', () => {
    expect(slots.close.x).toBe(left + PANEL_W - s(30));
    expect(slots.close.y).toBe(top + s(20));
  });

  it('타이틀이 패널 상단 +s(35) 의 가로 중앙에 놓인다', () => {
    expect(slots.header.title.align).toBe('center');
    expect(slots.header.title.x).toBe(SCREEN_W / 2);
    expect(slots.header.title.y).toBe(top + s(35));
    expect(slots.header.title.originX).toBe(0.5);
  });

  it('요약·액션바를 안 쓰면 슬롯이 null 이다', () => {
    expect(slots.summary).toBeNull();
    expect(slots.actions).toBeNull();
  });
});

describe('computePopupSlots — 요약·액션바가 콘텐츠를 밀어낸다', () => {
  const base = computePopupSlots(legacyArgs());
  const withSummary = computePopupSlots(legacyArgs({ summaryHeight: s(112) }));
  const withActions = computePopupSlots(legacyArgs({ actionBarHeight: s(88) }));
  const withBoth = computePopupSlots(legacyArgs({ summaryHeight: s(112), actionBarHeight: s(88) }));

  it('요약 슬롯이 헤더 바로 아래에 붙고 콘텐츠 상단을 내린다', () => {
    expect(withSummary.summary.top).toBe(base.header.bottom);
    expect(withSummary.content.top).toBe(withSummary.summary.bottom);
    expect(withSummary.content.height).toBe(base.content.height - s(112));
  });

  it('액션바가 패널 바닥 여백 위에 붙고 콘텐츠 하단을 올린다', () => {
    expect(withActions.actions.bottom).toBe(base.content.bottom);
    expect(withActions.content.bottom).toBe(withActions.actions.top);
    expect(withActions.content.height).toBe(base.content.height - s(88));
  });

  it('둘 다 있으면 콘텐츠가 두 높이만큼 줄고 어떤 슬롯과도 겹치지 않는다', () => {
    expect(withBoth.content.height).toBe(base.content.height - s(112) - s(88));
    expect(withBoth.content.top).toBeGreaterThanOrEqual(withBoth.summary.bottom);
    expect(withBoth.content.bottom).toBeLessThanOrEqual(withBoth.actions.top);
    expect(withBoth.summary.top).toBeGreaterThanOrEqual(withBoth.header.bottom);
  });

  it('슬롯 합이 패널 높이를 넘지 않는다', () => {
    const used = withBoth.header.height + withBoth.summary.height
      + withBoth.content.height + withBoth.actions.height;
    expect(used).toBeLessThanOrEqual(withBoth.panel.height);
  });
});

describe('computePopupSlots — 리디자인 규격 (§3-6)', () => {
  it('문서의 슬롯 높이 표를 그대로 쓴다', () => {
    expect(POPUP_SLOT.headerHeight).toBe(88);
    expect(POPUP_SLOT.summaryHeight).toBe(112);
    expect(POPUP_SLOT.actionBarHeight).toBe(88);
    expect(POPUP_SLOT.margin).toBe(32);
    expect(POPUP_SLOT.panelWidth).toBe(720 - POPUP_SLOT.margin * 2);
    expect(POPUP_SLOT.closeHit).toBe(72);
  });

  it('타이틀 좌정렬이면 origin 0 이고 x 가 패널 좌측 여백에 붙는다', () => {
    const slots = computePopupSlots({
      screenWidth: 720, screenHeight: 1280,
      width: POPUP_SLOT.panelWidth, height: POPUP_SLOT.panelHeight,
      headerHeight: POPUP_SLOT.headerHeight,
      padX: POPUP_SLOT.padX,
      titleAlign: 'left', titlePadX: POPUP_SLOT.titlePadX
    });
    // 패널은 화면 중앙에 놓인다. 문서 ASCII 는 y 64~1248(위 64 / 아래 32)로 그려져 있으나
    // 같은 문서의 규칙표는 "여백 32px 균일"이라 서로 어긋난다. 중앙 정렬을 택했다.
    const expectedTop = (1280 - POPUP_SLOT.panelHeight) / 2;
    expect(slots.panel.left).toBe(POPUP_SLOT.margin);
    expect(slots.panel.top).toBe(expectedTop);
    expect(slots.header.title.align).toBe('left');
    expect(slots.header.title.originX).toBe(0);
    expect(slots.header.title.x).toBe(POPUP_SLOT.margin + POPUP_SLOT.titlePadX);
    expect(slots.header.title.y).toBe(expectedTop + POPUP_SLOT.headerHeight / 2);
  });

  it('언더라인 두께가 divider 로 전달된다', () => {
    const slots = computePopupSlots({
      screenWidth: 720, screenHeight: 1280,
      width: 656, height: 1184,
      headerHeight: 88, underline: 3
    });
    expect(slots.divider.underline).toBe(3);
    expect(slots.divider.y).toBe(slots.header.bottom);
  });
});

describe('normalizeActions', () => {
  it('라벨 없는 항목을 버린다', () => {
    const out = normalizeActions([{ label: '수령' }, { onClick: () => {} }, { label: '' }, null]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('수령');
  });

  it('알 수 없는 variant 는 primary 로 채운다', () => {
    const out = normalizeActions([{ label: 'A', variant: 'danger' }, { label: 'B', variant: 'ghost' }]);
    expect(out[0].variant).toBe('primary');
    expect(out[1].variant).toBe('ghost');
  });

  it('onClick 이 함수가 아니면 null 로 만든다', () => {
    const out = normalizeActions([{ label: 'A', onClick: 'nope' }]);
    expect(out[0].onClick).toBeNull();
  });

  it('개수를 MAX_ACTIONS 로 자른다', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `버튼${i}` }));
    expect(normalizeActions(many)).toHaveLength(MAX_ACTIONS);
  });

  it('배열이 아니면 빈 배열이다', () => {
    expect(normalizeActions(null)).toEqual([]);
    expect(normalizeActions('전체 수령')).toEqual([]);
  });
});

describe('resolveActionStyle', () => {
  it('세 변형이 btn_* 텍스처 키로 매핑된다', () => {
    expect(resolveActionStyle('primary').textureKey).toBe('btn_primary');
    expect(resolveActionStyle('secondary').textureKey).toBe('btn_secondary');
    expect(resolveActionStyle('ghost').textureKey).toBe('btn_ghost');
  });

  it('강조 등급이 primary > secondary > ghost 순이다', () => {
    expect(ACTION_VARIANT.primary.emphasis).toBe('high');
    expect(ACTION_VARIANT.secondary.emphasis).toBe('medium');
    expect(ACTION_VARIANT.ghost.emphasis).toBe('low');
  });

  it('알 수 없는 이름은 primary 로 폴백한다', () => {
    expect(resolveActionStyle('없는변형')).toBe(ACTION_VARIANT.primary);
    expect(resolveActionStyle(undefined)).toBe(ACTION_VARIANT.primary);
  });
});

describe('computeActionSlots', () => {
  const rect = makeBounds(0, 1000, 656, 88);

  it('버튼 1개는 여백을 뺀 폭 전부를 쓴다', () => {
    const [only] = computeActionSlots(1, rect, { gap: 16, padX: 24, height: 64 });
    expect(only.w).toBe(656 - 48);
    expect(only.centerX).toBe(rect.centerX);
    expect(only.h).toBe(64);
  });

  it('버튼 3개가 간격을 두고 균등 분할된다', () => {
    const slots = computeActionSlots(3, rect, { gap: 16, padX: 24, height: 64 });
    expect(slots).toHaveLength(3);
    const totalW = slots.reduce((sum, sl) => sum + sl.w, 0);
    expect(totalW + 16 * 2 + 24 * 2).toBeCloseTo(656, 6);
    expect(slots[1].x - (slots[0].x + slots[0].w)).toBeCloseTo(16, 6);
    expect(slots[0].w).toBeCloseTo(slots[2].w, 6);
  });

  it('모든 버튼이 액션바 세로 중앙에 정렬된다', () => {
    computeActionSlots(4, rect, { gap: 16, padX: 24, height: 64 }).forEach((sl) => {
      expect(sl.centerY).toBe(rect.centerY);
      expect(sl.y).toBe(rect.centerY - 32);
    });
  });

  it('height 를 안 주면 액션바 높이를 그대로 쓴다', () => {
    const [only] = computeActionSlots(1, rect, { gap: 0, padX: 0 });
    expect(only.h).toBe(88);
  });

  it('개수가 0 이하거나 rect 가 없으면 빈 배열이다', () => {
    expect(computeActionSlots(0, rect)).toEqual([]);
    expect(computeActionSlots(2, null)).toEqual([]);
  });
});

describe('normalizeSummary / computeSummaryColumns', () => {
  it('문자열 하나는 라벨 없는 단일 항목이 된다', () => {
    expect(normalizeSummary('수집 루트 0 / 24')).toEqual([{ label: '', value: '수집 루트 0 / 24' }]);
  });

  it('숫자 value 를 문자열로 바꾼다', () => {
    expect(normalizeSummary([{ label: '공명', value: 0 }])).toEqual([{ label: '공명', value: '0' }]);
  });

  it('null·빈 문자열은 빈 배열이다', () => {
    expect(normalizeSummary(null)).toEqual([]);
    expect(normalizeSummary('')).toEqual([]);
    expect(normalizeSummary(undefined)).toEqual([]);
  });

  it('항목 개수만큼 열을 균등 분할하고 중심 x 를 돌려준다', () => {
    const rect = makeBounds(0, 200, 600, 112);
    const cols = computeSummaryColumns(3, rect, { padX: 0 });
    expect(cols.map((c) => c.centerX)).toEqual([100, 300, 500]);
    cols.forEach((c) => expect(c.centerY).toBe(rect.centerY));
  });

  it('좌우 여백이 열 폭에서 빠진다', () => {
    const rect = makeBounds(0, 200, 600, 112);
    const cols = computeSummaryColumns(2, rect, { padX: 50 });
    expect(cols[0].left).toBe(50);
    expect(cols[0].width).toBe(250);
    expect(cols[1].centerX).toBe(425);
  });
});

describe('LEGACY_SLOT 상수', () => {
  it('리디자인 이전 하드코딩 값을 그대로 담는다', () => {
    expect(LEGACY_SLOT.headerHeight).toBe(70);
    expect(LEGACY_SLOT.padX).toBe(15);
    expect(LEGACY_SLOT.padBottom).toBe(15);
    expect(LEGACY_SLOT.titleOffsetY).toBe(35);
    expect(LEGACY_SLOT.dividerInset).toBe(20);
    expect(LEGACY_SLOT.summaryHeight).toBe(0);
    expect(LEGACY_SLOT.actionBarHeight).toBe(0);
  });
});
