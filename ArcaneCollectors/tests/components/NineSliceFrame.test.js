/**
 * NineSliceFrame.test.js — T-06
 * 코너값 파싱과 폴백 판정(REDESIGN_PLAN §2-4). Phaser 렌더는 범위 밖이다.
 */
import { describe, it, expect } from 'vitest';
import {
  NineSliceFrame,
  parseNineSlice,
  NINE_SLICE_TABLE,
  CARD_FRAME_BY_RARITY
} from '../../src/components/NineSliceFrame.js';

/** scene.textures.exists 만 흉내 내는 최소 스텁 */
function stubScene(existingKeys = []) {
  return { textures: { exists: (key) => existingKeys.includes(key) } };
}

describe('parseNineSlice — asset-spec.json postProcess 파싱', () => {
  it('네 코너값을 좌·우·상·하 순서로 읽는다', () => {
    expect(parseNineSlice('9-slice 96,96,120,96')).toEqual({
      left: 96, right: 96, top: 120, bottom: 96, sliceable: true
    });
  });

  it('공백이 섞여도 파싱한다', () => {
    expect(parseNineSlice('9-slice 72, 72 , 40,40').left).toBe(72);
  });

  it('꼬리 주석이 붙어도 앞의 숫자만 읽는다', () => {
    const parsed = parseNineSlice('9-slice 160,160,0,0 (가로 3-slice)');
    expect(parsed).toMatchObject({ left: 160, right: 160, top: 0, bottom: 0, sliceable: true });
  });

  it('네 값이 모두 0이면 9-slice 대상이 아니다', () => {
    expect(parseNineSlice('9-slice 0,0,0,0 (9-slice 미사용, 단일 스프라이트)').sliceable).toBe(false);
  });

  it('9-slice 표기가 없는 줄은 null 이다', () => {
    expect(parseNineSlice('downscale 512')).toBeNull();
    expect(parseNineSlice(null)).toBeNull();
  });
});

describe('NineSliceFrame.getFrameSpec — 내장 코너 테이블', () => {
  it('문서의 최소 렌더 크기를 코너 합으로 재현한다', () => {
    const expected = {
      frame_panel: [192, 192],
      frame_popup: [192, 216],
      frame_card_SSR: [128, 128],
      btn_primary: [144, 80]
    };
    Object.entries(expected).forEach(([key, [minW, minH]]) => {
      const spec = NineSliceFrame.getFrameSpec(key);
      expect([spec.minW, spec.minH]).toEqual([minW, minH]);
    });
  });

  it('테이블에 없는 키는 null 이다', () => {
    expect(NineSliceFrame.getFrameSpec('frame_unknown')).toBeNull();
  });

  it('등급별 카드 프레임이 모두 테이블에 있다', () => {
    Object.values(CARD_FRAME_BY_RARITY).forEach((key) => {
      expect(NINE_SLICE_TABLE[key]).toBeDefined();
    });
  });

  it('버튼 3종은 같은 코너값을 공유한다', () => {
    const keys = ['btn_primary', 'btn_secondary', 'btn_ghost'];
    const corners = keys.map((key) => {
      const { left, right, top, bottom } = NineSliceFrame.getFrameSpec(key);
      return [left, right, top, bottom].join(',');
    });
    expect(new Set(corners).size).toBe(1);
  });
});

describe('NineSliceFrame.clampSize', () => {
  it('최소 크기보다 작으면 끌어올리고 표시를 남긴다', () => {
    const result = NineSliceFrame.clampSize('frame_popup', 100, 100);
    expect(result).toEqual({ w: 192, h: 216, clamped: true });
  });

  it('충분히 크면 값을 건드리지 않는다', () => {
    expect(NineSliceFrame.clampSize('frame_panel', 600, 400))
      .toEqual({ w: 600, h: 400, clamped: false });
  });

  it('테이블에 없는 키는 요청 크기를 그대로 돌려준다', () => {
    expect(NineSliceFrame.clampSize('frame_unknown', 10, 10))
      .toEqual({ w: 10, h: 10, clamped: false });
  });
});

describe('NineSliceFrame.shouldFallback', () => {
  it('텍스처가 있고 9-slice 대상이면 폴백하지 않는다', () => {
    expect(NineSliceFrame.shouldFallback(stubScene(['frame_panel']), 'frame_panel')).toBe(false);
  });

  it('텍스처가 없으면 폴백한다', () => {
    expect(NineSliceFrame.shouldFallback(stubScene([]), 'frame_panel')).toBe(true);
  });

  it('테이블에 없는 키는 텍스처가 있어도 폴백한다', () => {
    expect(NineSliceFrame.shouldFallback(stubScene(['frame_unknown']), 'frame_unknown')).toBe(true);
  });

  it('9-slice 대상이 아닌 단일 스프라이트는 늘리지 않는다', () => {
    expect(NineSliceFrame.shouldFallback(stubScene(['frame_hex']), 'frame_hex')).toBe(true);
    expect(NineSliceFrame.getFrameSpec('frame_hex').sliceable).toBe(false);
  });

  it('scene 이 텍스처 매니저를 갖고 있지 않으면 폴백한다', () => {
    expect(NineSliceFrame.shouldFallback({}, 'frame_panel')).toBe(true);
  });
});
