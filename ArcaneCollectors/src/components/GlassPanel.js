/**
 * GlassPanel.js — 글래스 표면 컴포넌트 (REDESIGN_PLAN §2-3, T-05)
 *
 * Phaser 에는 CSS backdrop-blur 가 없다. postFX.addBlur() 는 모바일 GPU 에서
 * 프레임당 비용이 크고, 이 게임의 배경은 매 프레임 바뀌지 않는다.
 * 그래서 사전 블러 배경 페어링을 쓴다. 배경 1장당 원본과 블러본 2장을 굽고,
 * 패널 자리에 블러본을 같은 화면 좌표로 얹은 뒤 패널 사각형만 crop 한다.
 * 배경이 움직이지 않으므로 시차가 생기지 않는다.
 *
 * 아래에서 위로 5겹:
 *   1. bg_{scene}        원본 배경 (BackgroundFactory 담당, 이 컴포넌트 밖)
 *   2. bg_{scene}_blur   블러본을 패널 사각형으로 crop
 *   3. 틴트              #0D0F1A 반투명 라운드 사각형
 *   4. 림 라이트         상단 1px 흰색 a0.10 + 하단 1px 검정 a0.25
 *   5. 아웃라인          교단색 또는 brand.primary
 *
 * 블러본이 없거나 DESIGN.effects.useBlurBackdrop 이 false 면 2번을 건너뛰고
 * 3번의 알파를 fallbackTintAlpha 로 올린다. 결과는 반투명 단색 패널이다.
 *
 * 주의: gameConfig/designSystem 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { DESIGN, getGlassSpec } from '../config/designSystem.js';
import { GAME_WIDTH, GAME_HEIGHT, s } from '../config/scaleConfig.js';

/** 글래스 변형 이름 */
export const GLASS_VARIANT = {
  PANEL: 'panel',
  CARD: 'card',
  POPUP: 'popup',
  HUD: 'hud',
  SCRIM: 'scrim'
};

/** 블러 페어 텍스처 키 접미사 (tools/art/asset-spec.json conventions.blurPair) */
export const BLUR_SUFFIX = '_blur';

export class GlassPanel {
  // ------------------------------------------------------------------
  // 순수 함수 — Phaser 없이 단위 테스트 가능
  // ------------------------------------------------------------------

  /**
   * 배경 텍스처 키에 대응하는 블러본 키를 반환한다.
   * @param {string} bgKey - 예: bg_main
   * @returns {string|null} 예: bg_main_blur. 유효하지 않으면 null
   */
  static blurKeyFor(bgKey) {
    if (typeof bgKey !== 'string' || bgKey.length === 0) return null;
    if (bgKey.endsWith(BLUR_SUFFIX)) return bgKey;
    return bgKey + BLUR_SUFFIX;
  }

  /**
   * 변형과 백드롭 가용성으로 최종 렌더 스펙을 결정한다.
   * @param {Object} params
   * @param {string} params.variant - GLASS_VARIANT 값
   * @param {boolean} params.hasBlurTexture - 블러본 텍스처 존재 여부
   * @param {boolean} [params.useBlurBackdrop] - 전역 스위치. 생략 시 DESIGN.effects 값
   * @param {number|null} [params.tint] - 교단색 (Phaser hex). 없으면 brand.primary
   * @returns {Object} 해석된 렌더 스펙
   */
  static resolveSpec({ variant, hasBlurTexture, useBlurBackdrop, tint } = {}) {
    const name = Object.values(GLASS_VARIANT).includes(variant) ? variant : GLASS_VARIANT.PANEL;
    const spec = getGlassSpec(name);
    const globalSwitch = useBlurBackdrop === undefined
      ? DESIGN.effects.useBlurBackdrop !== false
      : !!useBlurBackdrop;
    const useBackdrop = globalSwitch && !!hasBlurTexture;

    let outline = null;
    if (spec.outline) {
      const accent = (spec.useCultOutline && typeof tint === 'number')
        ? tint
        : (spec.outline.color === null ? DESIGN.colors.brand.primary : spec.outline.color);
      outline = { width: spec.outline.width, color: accent, alpha: spec.outline.alpha };
    }

    return {
      variant: name,
      useBackdrop,
      tintColor: DESIGN.glass.tintColor,
      tintAlpha: useBackdrop ? spec.tintAlpha : spec.fallbackTintAlpha,
      outline,
      rim: spec.rim,
      radius: DESIGN.radius[spec.radius] ?? DESIGN.radius.md
    };
  }

  /**
   * 화면 좌표의 패널 사각형을 배경 이미지의 텍스처 좌표계 crop 사각형으로 변환한다.
   * setCrop 은 텍스처 로컬 좌표를 받으므로 cover-fit 배율과 오프셋을 되돌려야 한다.
   *
   * @param {{x:number,y:number,w:number,h:number}} panel - 화면 좌표계 사각형 (x,y 는 좌상단)
   * @param {Object} image - 화면에 놓인 배경 이미지 정보
   * @returns {{x:number,y:number,width:number,height:number}} 텍스처 좌표계 crop 사각형
   */
  static toCropRect(panel, image) {
    const scaleX = image.displayWidth / image.textureWidth;
    const scaleY = image.displayHeight / image.textureHeight;
    const left = image.centerX - image.displayWidth / 2;
    const top = image.centerY - image.displayHeight / 2;

    const rawX = (panel.x - left) / scaleX;
    const rawY = (panel.y - top) / scaleY;
    const rawW = panel.w / scaleX;
    const rawH = panel.h / scaleY;

    // 텍스처 밖으로 나가는 부분은 잘라낸다 (setCrop 은 음수나 초과를 허용하지 않는다)
    const x = Math.max(0, Math.min(rawX, image.textureWidth));
    const y = Math.max(0, Math.min(rawY, image.textureHeight));
    const width = Math.max(0, Math.min(rawX + rawW, image.textureWidth) - x);
    const height = Math.max(0, Math.min(rawY + rawH, image.textureHeight) - y);

    return { x, y, width, height };
  }

  /**
   * 중심 좌표와 크기로 좌상단 기준 사각형을 만든다.
   * @param {number} cx - 중심 x
   * @param {number} cy - 중심 y
   * @param {number} w - 너비
   * @param {number} h - 높이
   * @returns {{x:number,y:number,w:number,h:number}}
   */
  static toRect(cx, cy, w, h) {
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  // ------------------------------------------------------------------
  // Phaser 렌더
  // ------------------------------------------------------------------

  /**
   * 글래스 패널을 만든다. 반환 컨테이너의 원점은 패널 중심이다.
   *
   * @param {Phaser.Scene} scene
   * @param {Object} options
   * @param {number} options.x - 패널 중심 x (렌더 px)
   * @param {number} options.y - 패널 중심 y (렌더 px)
   * @param {number} options.w - 패널 너비 (렌더 px)
   * @param {number} options.h - 패널 높이 (렌더 px)
   * @param {string} [options.variant] - GLASS_VARIANT 값. 기본은 panel
   * @param {number|null} [options.tint] - 교단색 (Phaser hex). panel 변형의 아웃라인에 쓰인다
   * @param {string|null} [options.bgKey] - 배경 텍스처 키. 블러본은 bgKey + _blur
   * @param {number} [options.depth] - 컨테이너 depth
   * @param {number} [options.radius] - 라운드 반경 강제 지정 (렌더 px)
   * @returns {Phaser.GameObjects.Container} glassSpec 프로퍼티를 가진 컨테이너
   */
  static create(scene, options = {}) {
    const {
      x = 0, y = 0, w = 0, h = 0,
      variant = GLASS_VARIANT.PANEL,
      tint = null,
      bgKey = null,
      depth,
      radius
    } = options;

    const blurKey = GlassPanel.blurKeyFor(bgKey);
    const hasBlurTexture = !!(blurKey && scene.textures && scene.textures.exists(blurKey));
    const spec = GlassPanel.resolveSpec({ variant, hasBlurTexture, tint });
    const r = typeof radius === 'number' ? radius : s(spec.radius);

    const container = scene.add.container(x, y);
    if (typeof depth === 'number') container.setDepth(depth);

    const halfW = w / 2;
    const halfH = h / 2;

    // 2. 블러 백드롭 — 배경과 동일한 화면 좌표에 정렬한 뒤 패널 사각형만 crop
    if (spec.useBackdrop) {
      const backdrop = GlassPanel._createBackdrop(scene, blurKey, { x, y, w, h });
      if (backdrop) container.add(backdrop);
    }

    // 3. 틴트
    const tintLayer = scene.add.graphics();
    tintLayer.fillStyle(spec.tintColor, spec.tintAlpha);
    tintLayer.fillRoundedRect(-halfW, -halfH, w, h, r);
    container.add(tintLayer);

    // 4. 림 라이트
    if (spec.rim) {
      const rim = scene.add.graphics();
      const rimSpec = DESIGN.glass.rim;
      const t = s(rimSpec.thickness);
      if (spec.rim !== 'bottom') {
        rim.fillStyle(rimSpec.topColor, rimSpec.topAlpha);
        rim.fillRect(-halfW + r, -halfH, w - r * 2, t);
      }
      rim.fillStyle(rimSpec.bottomColor, rimSpec.bottomAlpha);
      rim.fillRect(-halfW + r, halfH - t, w - r * 2, t);
      container.add(rim);
    }

    // 5. 아웃라인
    if (spec.outline) {
      const outline = scene.add.graphics();
      outline.lineStyle(s(spec.outline.width), spec.outline.color, spec.outline.alpha);
      outline.strokeRoundedRect(-halfW, -halfH, w, h, r);
      container.add(outline);
    }

    container.glassSpec = spec;
    container.glassSize = { w, h, radius: r };
    return container;
  }

  /**
   * 블러 백드롭 이미지를 만든다. 실패하면 null 을 돌려 호출부가 틴트만 쓰게 한다.
   * @private
   */
  static _createBackdrop(scene, blurKey, panel) {
    const source = scene.textures.get(blurKey);
    const frame = source && source.getSourceImage ? source.getSourceImage() : null;
    if (!frame || !frame.width || !frame.height) return null;

    // 배경과 같은 cover-fit 규칙으로 화면 중앙에 놓는다
    const scale = Math.max(GAME_WIDTH / frame.width, GAME_HEIGHT / frame.height);
    const displayWidth = frame.width * scale;
    const displayHeight = frame.height * scale;

    // 컨테이너 로컬 좌표 = 화면 중앙 - 패널 중심
    const image = scene.add.image(GAME_WIDTH / 2 - panel.x, GAME_HEIGHT / 2 - panel.y, blurKey);
    image.setDisplaySize(displayWidth, displayHeight);

    const crop = GlassPanel.toCropRect(
      GlassPanel.toRect(panel.x, panel.y, panel.w, panel.h),
      {
        centerX: GAME_WIDTH / 2,
        centerY: GAME_HEIGHT / 2,
        displayWidth,
        displayHeight,
        textureWidth: frame.width,
        textureHeight: frame.height
      }
    );
    if (crop.width <= 0 || crop.height <= 0) {
      image.destroy();
      return null;
    }
    image.setCrop(crop.x, crop.y, crop.width, crop.height);
    return image;
  }
}

export default GlassPanel;
