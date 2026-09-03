/**
 * UIButton.test.js — 공통 버튼 팩토리
 * 라벨 가독성 규칙(캡슐·외곽선·그림자)과 터치 하한의 순수 계산만 다룬다.
 * Phaser 렌더는 tests/e2e/button-contrast-smoke.mjs 가 실측으로 맡는다.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveButtonTexture,
  computeHitSize,
  resolveLabelStyle,
  frameAlphaTarget,
  BUTTON_TEXTURE,
  BUTTON_ALPHA,
  DISABLED_SUB_ALPHA
} from '../../src/components/UIButton.js';
import { computeLabelPlate, LABEL_PLATE } from '../../src/components/NineSliceFrame.js';
import { DESIGN } from '../../src/config/designSystem.js';
import { s } from '../../src/config/scaleConfig.js';

describe('resolveButtonTexture', () => {
  it('변형 이름을 btn_* 텍스처 키로 바꾼다', () => {
    expect(resolveButtonTexture('primary')).toBe('btn_primary');
    expect(resolveButtonTexture('secondary')).toBe('btn_secondary');
    expect(resolveButtonTexture('ghost')).toBe('btn_ghost');
  });

  it('이미 완성된 키는 그대로 통과시킨다', () => {
    expect(resolveButtonTexture('btn_ghost')).toBe('btn_ghost');
  });

  it('알 수 없는 이름은 primary 로 떨어진다', () => {
    expect(resolveButtonTexture('nope')).toBe(BUTTON_TEXTURE.primary);
    expect(resolveButtonTexture(undefined)).toBe(BUTTON_TEXTURE.primary);
  });
});

describe('computeHitSize — 터치 타겟은 시각 크기와 분리된다', () => {
  it('작은 버튼도 히트 영역은 최소 크기를 지킨다', () => {
    const min = s(DESIGN.touch.minTarget);
    expect(computeHitSize(20, 20)).toEqual({ w: min, h: min });
  });

  it('큰 버튼은 시각 크기를 그대로 쓴다', () => {
    expect(computeHitSize(400, 96)).toEqual({ w: 400, h: 96 });
  });

  it('가로만 좁은 버튼은 가로만 올린다', () => {
    const min = s(DESIGN.touch.minTarget);
    expect(computeHitSize(30, 200)).toEqual({ w: min, h: 200 });
  });
});

describe('resolveLabelStyle — 캡슐 밖으로 나간 획도 붙잡는다', () => {
  it('외곽선과 그림자를 함께 건다', () => {
    const style = resolveLabelStyle('body');
    expect(style.stroke).toBe('#0D0F1A');
    expect(style.strokeThickness).toBe(s(LABEL_PLATE.strokeThickness));
    expect(style.shadow.blur).toBe(s(LABEL_PLATE.shadow.blur));
    expect(style.shadow.fill).toBe(true);
  });

  it('기본 라벨색은 text.primary 다', () => {
    expect(resolveLabelStyle('body').color).toBe(DESIGN.colors.text.primary);
  });

  it('비활성이어도 라벨색을 낮추지 않는다 — 어두운 캡슐 위에서 text.secondary 는 3:1 아래다', () => {
    expect(resolveLabelStyle('body', { disabled: true }).color).toBe(DESIGN.colors.text.primary);
  });

  it('색을 지정하면 그대로 쓴다', () => {
    expect(resolveLabelStyle('body', { disabled: true, color: '#10B981' }).color).toBe('#10B981');
  });

  it('토큰의 서체를 유지한다', () => {
    expect(resolveLabelStyle('num.md').fontFamily).toContain('Roboto Mono');
    expect(resolveLabelStyle('display.lg').fontFamily).toContain('Orbitron');
  });

  it('bold 옵션이 굵기를 덮어쓴다', () => {
    expect(resolveLabelStyle('body').fontStyle).toBe('normal');
    expect(resolveLabelStyle('body', { bold: true }).fontStyle).toBe('bold');
  });
});

describe('computeLabelPlate — 라벨 뒤 어두운 캡슐', () => {
  it('라벨 크기에 여백을 더한다', () => {
    const plate = computeLabelPlate({ buttonW: 400, buttonH: 96, labelW: 100, labelH: 30 });
    expect(plate.w).toBe(100 + s(LABEL_PLATE.padX) * 2);
    expect(plate.h).toBe(30 + s(LABEL_PLATE.padY) * 2);
  });

  it('버튼 안쪽 여백을 넘지 않는다', () => {
    const buttonW = 200;
    const plate = computeLabelPlate({ buttonW, buttonH: 80, labelW: 400, labelH: 30 });
    expect(plate.w).toBe(buttonW - s(LABEL_PLATE.inset) * 2);
    expect(plate.w).toBeLessThan(buttonW);
  });

  it('라벨이 없으면 캡슐도 없다', () => {
    expect(computeLabelPlate({ buttonW: 400, buttonH: 96, labelW: 0, labelH: 0 })).toBeNull();
    expect(computeLabelPlate({ buttonW: 400, buttonH: 96, labelW: 100, labelH: 0 })).toBeNull();
  });

  it('반경은 캡슐 높이의 절반을 넘지 않는다', () => {
    const plate = computeLabelPlate({ buttonW: 400, buttonH: 96, labelW: 100, labelH: 4 });
    expect(plate.radius).toBeLessThanOrEqual(plate.h / 2);
  });

  it('오프셋을 주면 캡슐 중심이 따라 움직인다', () => {
    const plate = computeLabelPlate({ buttonW: 400, buttonH: 96, labelW: 60, labelH: 24, offsetX: 12 });
    expect(plate.offsetX).toBe(12);
    expect(plate.offsetY).toBe(0);
  });

  it('알파는 실측으로 4.5:1 을 넘기는 0.72 다', () => {
    // 0.55 에서는 흰 아트 위 실측이 4.19:1 로 기준 미달이었다
    expect(LABEL_PLATE.alpha).toBe(0.72);
    expect(LABEL_PLATE.alpha).toBeLessThan(1);
  });
});

describe('상태 상수', () => {
  it('비활성은 아트를 낮추고 보조 라벨만 흐려진다', () => {
    expect(BUTTON_ALPHA.disabled).toBeLessThan(BUTTON_ALPHA.normal);
    expect(DISABLED_SUB_ALPHA).toBeLessThan(1);
  });

  it('호버는 비활성보다 약한 변화다', () => {
    expect(BUTTON_ALPHA.hover).toBeGreaterThan(BUTTON_ALPHA.disabled);
    expect(BUTTON_ALPHA.hover).toBeLessThan(BUTTON_ALPHA.normal);
  });
});

describe('frameAlphaTarget — 캡슐은 흐려지면 안 된다', () => {
  it('캡슐을 품은 컨테이너면 아트에만 알파를 건다', () => {
    const art = { name: 'art' };
    expect(frameAlphaTarget({ artObject: art })).toBe(art);
  });

  it('캡슐이 없으면 프레임 자신에 건다', () => {
    const frame = { name: 'frame' };
    expect(frameAlphaTarget(frame)).toBe(frame);
  });

  it('값이 없어도 터지지 않는다', () => {
    expect(frameAlphaTarget(null)).toBeNull();
  });
});
