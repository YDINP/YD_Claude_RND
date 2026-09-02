/**
 * GlassPanel.test.js — T-05
 * 글래스 규칙(REDESIGN_PLAN §2-3)의 순수 계산만 다룬다. Phaser 렌더는 범위 밖이다.
 */
import { describe, it, expect } from 'vitest';
import { GlassPanel, GLASS_VARIANT, BLUR_SUFFIX } from '../../src/components/GlassPanel.js';
import { DESIGN } from '../../src/config/designSystem.js';

describe('GlassPanel.blurKeyFor', () => {
  it('배경 키에 _blur 접미사를 붙인다', () => {
    expect(GlassPanel.blurKeyFor('bg_main')).toBe(`bg_main${BLUR_SUFFIX}`);
  });

  it('이미 블러 키면 두 번 붙이지 않는다', () => {
    expect(GlassPanel.blurKeyFor('bg_main_blur')).toBe('bg_main_blur');
  });

  it('빈 값이나 문자열이 아니면 null 이다', () => {
    expect(GlassPanel.blurKeyFor('')).toBeNull();
    expect(GlassPanel.blurKeyFor(null)).toBeNull();
    expect(GlassPanel.blurKeyFor(undefined)).toBeNull();
  });
});

describe('GlassPanel.resolveSpec — 알파 값 표', () => {
  it('다섯 변형이 문서의 틴트 알파를 그대로 쓴다', () => {
    const expected = { panel: 0.55, card: 0.62, popup: 0.78, hud: 0.70, scrim: 0.72 };
    Object.entries(expected).forEach(([variant, alpha]) => {
      expect(GlassPanel.resolveSpec({ variant, hasBlurTexture: true }).tintAlpha).toBe(alpha);
    });
  });

  it('블러본이 없으면 백드롭을 건너뛰고 틴트 알파를 올린다', () => {
    const withBlur = GlassPanel.resolveSpec({ variant: GLASS_VARIANT.PANEL, hasBlurTexture: true });
    const without = GlassPanel.resolveSpec({ variant: GLASS_VARIANT.PANEL, hasBlurTexture: false });

    expect(withBlur.useBackdrop).toBe(true);
    expect(without.useBackdrop).toBe(false);
    expect(without.tintAlpha).toBe(0.88);
    expect(without.tintAlpha).toBeGreaterThan(withBlur.tintAlpha);
  });

  it('전역 스위치를 끄면 블러본이 있어도 백드롭을 쓰지 않는다', () => {
    const spec = GlassPanel.resolveSpec({
      variant: GLASS_VARIANT.POPUP,
      hasBlurTexture: true,
      useBlurBackdrop: false
    });
    expect(spec.useBackdrop).toBe(false);
    expect(spec.tintAlpha).toBe(DESIGN.glass.popup.fallbackTintAlpha);
  });

  it('panel 은 교단색을 아웃라인에 쓰고, 없으면 brand.primary 로 떨어진다', () => {
    const tinted = GlassPanel.resolveSpec({
      variant: GLASS_VARIANT.PANEL,
      hasBlurTexture: true,
      tint: DESIGN.colors.cult.valhalla
    });
    const plain = GlassPanel.resolveSpec({ variant: GLASS_VARIANT.PANEL, hasBlurTexture: true });

    expect(tinted.outline.color).toBe(DESIGN.colors.cult.valhalla);
    expect(plain.outline.color).toBe(DESIGN.colors.brand.primary);
  });

  it('card 는 교단색을 무시하고 흰색 1px 테두리를 유지한다', () => {
    const spec = GlassPanel.resolveSpec({
      variant: GLASS_VARIANT.CARD,
      hasBlurTexture: true,
      tint: DESIGN.colors.cult.yomi
    });
    expect(spec.outline).toEqual({ width: 1, color: 0xFFFFFF, alpha: 0.12 });
  });

  it('hud 와 scrim 은 아웃라인이 없다', () => {
    expect(GlassPanel.resolveSpec({ variant: GLASS_VARIANT.HUD, hasBlurTexture: true }).outline).toBeNull();
    expect(GlassPanel.resolveSpec({ variant: GLASS_VARIANT.SCRIM, hasBlurTexture: true }).outline).toBeNull();
  });

  it('알 수 없는 변형은 panel 로 폴백한다', () => {
    expect(GlassPanel.resolveSpec({ variant: 'nope', hasBlurTexture: true }).variant).toBe(GLASS_VARIANT.PANEL);
    expect(GlassPanel.resolveSpec({}).variant).toBe(GLASS_VARIANT.PANEL);
  });

  it('틴트 색은 언제나 bg.primary 다', () => {
    Object.values(GLASS_VARIANT).forEach((variant) => {
      expect(GlassPanel.resolveSpec({ variant, hasBlurTexture: true }).tintColor)
        .toBe(DESIGN.colors.bg.primary);
    });
  });
});

describe('GlassPanel.toCropRect — 블러 백드롭 정렬', () => {
  // 1082x1581 원본을 1080x1920 화면에 cover-fit 한 상태 (세로 기준 x1.2144)
  const image = {
    centerX: 540,
    centerY: 960,
    displayWidth: 1082 * (1920 / 1581),
    displayHeight: 1920,
    textureWidth: 1082,
    textureHeight: 1581
  };

  it('화면 중앙의 패널은 텍스처 중앙을 crop 한다', () => {
    const crop = GlassPanel.toCropRect({ x: 540 - 300, y: 960 - 100, w: 600, h: 200 }, image);
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;
    expect(centerX).toBeCloseTo(image.textureWidth / 2, 3);
    expect(centerY).toBeCloseTo(image.textureHeight / 2, 3);
  });

  it('crop 크기는 화면 크기를 배율로 나눈 값이다', () => {
    const scale = image.displayHeight / image.textureHeight;
    const crop = GlassPanel.toCropRect({ x: 300, y: 400, w: 480, h: 240 }, image);
    expect(crop.width).toBeCloseTo(480 / scale, 3);
    expect(crop.height).toBeCloseTo(240 / scale, 3);
  });

  it('텍스처 밖으로 나가는 부분은 잘라내 음수가 나오지 않는다', () => {
    const crop = GlassPanel.toCropRect({ x: -500, y: -500, w: 400, h: 400 }, image);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.width).toBeGreaterThanOrEqual(0);
    expect(crop.height).toBeGreaterThanOrEqual(0);
  });

  it('crop 은 텍스처 경계를 넘지 않는다', () => {
    const crop = GlassPanel.toCropRect({ x: 900, y: 1800, w: 600, h: 600 }, image);
    expect(crop.x + crop.width).toBeLessThanOrEqual(image.textureWidth + 1e-6);
    expect(crop.y + crop.height).toBeLessThanOrEqual(image.textureHeight + 1e-6);
  });
});

describe('GlassPanel.toRect', () => {
  it('중심 좌표를 좌상단 기준 사각형으로 바꾼다', () => {
    expect(GlassPanel.toRect(540, 960, 600, 200)).toEqual({ x: 240, y: 860, w: 600, h: 200 });
  });
});
