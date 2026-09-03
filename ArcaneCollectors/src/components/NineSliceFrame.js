/**
 * NineSliceFrame.js — 9-slice 프레임 래퍼 (REDESIGN_PLAN §2-4, T-06)
 *
 * frame_* 와 btn_* 텍스처를 Phaser 네이티브 scene.add.nineslice() 로 늘려 그린다.
 * 코너값 테이블은 tools/art/asset-spec.json 의 postProcess 항목
 * ("9-slice left,right,top,bottom") 을 파싱해 이 파일에 내장한 것이다.
 * 원본 스펙이 바뀌면 parseNineSlice() 로 다시 뽑아 NINE_SLICE_TABLE 을 갱신한다.
 *
 * 최소 렌더 크기는 코너 합이다. 그보다 작게 그리면 코너끼리 겹쳐 형태가 무너진다.
 * 텍스처가 아직 없으면 Graphics 로 그린 폴백 프레임을 돌려준다. 아트가 준비되기 전에도
 * 레이아웃이 성립해야 하기 때문이다.
 *
 * 주의: designSystem 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { DESIGN } from '../config/designSystem.js';
import { s } from '../config/scaleConfig.js';

/** asset-spec.json postProcess 의 9-slice 표기 정규식 */
const NINE_SLICE_PATTERN = /9-slice\s+(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;

/**
 * asset-spec.json 의 postProcess 문자열에서 코너값을 뽑는다 (순수 함수).
 *
 * @param {string} line - 예: "9-slice 96,96,120,96"
 * @returns {{left:number,right:number,top:number,bottom:number,sliceable:boolean}|null}
 *          형식이 맞지 않으면 null. 네 값이 모두 0이면 sliceable=false (단일 스프라이트)
 */
export function parseNineSlice(line) {
  if (typeof line !== 'string') return null;
  const match = line.match(NINE_SLICE_PATTERN);
  if (!match) return null;
  const [left, right, top, bottom] = match.slice(1, 5).map(Number);
  return {
    left,
    right,
    top,
    bottom,
    sliceable: left + right + top + bottom > 0
  };
}

/**
 * 코너값 테이블. 값은 asset-spec.json 의 downscale 후 크기(src) 기준이다.
 * minW/minH 는 코너 합으로 파생된다 — getFrameSpec() 이 계산한다.
 */
export const NINE_SLICE_TABLE = {
  frame_panel:           { left: 96,  right: 96,  top: 96,  bottom: 96,  srcW: 512, srcH: 512 },
  frame_popup:           { left: 96,  right: 96,  top: 120, bottom: 96,  srcW: 512, srcH: 512 },
  frame_card_N:          { left: 64,  right: 64,  top: 64,  bottom: 64,  srcW: 512, srcH: 512 },
  frame_card_R:          { left: 64,  right: 64,  top: 64,  bottom: 64,  srcW: 512, srcH: 512 },
  frame_card_SR:         { left: 64,  right: 64,  top: 64,  bottom: 64,  srcW: 512, srcH: 512 },
  frame_card_SSR:        { left: 64,  right: 64,  top: 64,  bottom: 64,  srcW: 512, srcH: 512 },
  frame_hex:             { left: 0,   right: 0,   top: 0,   bottom: 0,   srcW: 256, srcH: 256 },
  panel_header_ornament: { left: 160, right: 160, top: 0,   bottom: 0,   srcW: 512, srcH: 64  },
  btn_primary:           { left: 72,  right: 72,  top: 40,  bottom: 40,  srcW: 512, srcH: 160 },
  btn_secondary:         { left: 72,  right: 72,  top: 40,  bottom: 40,  srcW: 512, srcH: 160 },
  btn_ghost:             { left: 72,  right: 72,  top: 40,  bottom: 40,  srcW: 512, srcH: 160 }
};

/** 등급 코드 → 카드 프레임 텍스처 키 */
export const CARD_FRAME_BY_RARITY = {
  N: 'frame_card_N',
  R: 'frame_card_R',
  SR: 'frame_card_SR',
  SSR: 'frame_card_SSR'
};

/**
 * 라벨 플레이트 규격 — btn_* 아트는 가운데가 밝은 장식판이라 흰 라벨이 묻힌다.
 * 라벨 자리만 어두운 캡슐로 눌러 대비를 확보한다. 값은 base px (s() 적용 대상).
 */
export const LABEL_PLATE = Object.freeze({
  /**
   * 캡슐 알파. 0.55 로 시작했으나 실측에서 4.19:1 이 나와 기준(4.5:1)에 못 미쳤다.
   * btn_primary 아트의 중앙부가 거의 흰색이라 0.55 로는 합성 결과가 충분히 어두워지지
   * 않는다. 흰 아트 위 최악 조건에서 약 7.6:1 이 나오는 0.72 로 올렸다.
   * 측정은 tests/e2e/button-contrast-smoke.mjs 가 한다.
   */
  alpha: 0.72,
  /** 라벨 좌우 여백 */
  padX: 14,
  /** 라벨 상하 여백 */
  padY: 6,
  /** 캡슐이 버튼 밖으로 나가지 않도록 남기는 안쪽 여백 */
  inset: 12,
  /** 라벨 외곽선 두께 — 캡슐 밖으로 삐져나온 글자를 붙잡는다 */
  strokeThickness: 2,
  /** 라벨 그림자 오프셋과 블러 */
  shadow: Object.freeze({ offsetX: 0, offsetY: 2, blur: 4, alpha: 0.85 })
});

/**
 * 라벨 플레이트 사각형을 계산한다 (순수 함수).
 *
 * 라벨 크기에 여백을 더한 캡슐을 만들되, 버튼 안쪽 여백을 넘지 않게 가둔다.
 * 라벨이 버튼보다 크면 캡슐은 버튼 폭에 맞춰 잘린다.
 *
 * @param {Object} params
 * @param {number} params.buttonW - 버튼 너비 (렌더 px)
 * @param {number} params.buttonH - 버튼 높이 (렌더 px)
 * @param {number} params.labelW - 라벨 실측 너비 (렌더 px)
 * @param {number} params.labelH - 라벨 실측 높이 (렌더 px)
 * @param {number} [params.padX] - 좌우 여백 (렌더 px)
 * @param {number} [params.padY] - 상하 여백 (렌더 px)
 * @param {number} [params.inset] - 버튼 안쪽 여백 (렌더 px)
 * @param {number} [params.offsetX] - 캡슐 중심의 가로 오프셋 (렌더 px). 라벨이 치우친 버튼용
 * @param {number} [params.offsetY] - 캡슐 중심의 세로 오프셋 (렌더 px)
 * @returns {{w:number,h:number,radius:number,offsetX:number,offsetY:number}|null} 라벨이 없으면 null
 */
export function computeLabelPlate({ buttonW, buttonH, labelW, labelH, padX, padY, inset, offsetX, offsetY }) {
  if (!(labelW > 0) || !(labelH > 0)) return null;

  const px = Number.isFinite(padX) ? padX : s(LABEL_PLATE.padX);
  const py = Number.isFinite(padY) ? padY : s(LABEL_PLATE.padY);
  const inner = Number.isFinite(inset) ? inset : s(LABEL_PLATE.inset);

  const maxW = Math.max(0, buttonW - inner * 2);
  const maxH = Math.max(0, buttonH - inner);

  const w = Math.min(labelW + px * 2, maxW || labelW + px * 2);
  const h = Math.min(labelH + py * 2, maxH || labelH + py * 2);

  return {
    w,
    h,
    radius: Math.min(h / 2, s(DESIGN.radius.md)),
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0
  };
}

export class NineSliceFrame {
  // ------------------------------------------------------------------
  // 순수 함수 — Phaser 없이 단위 테스트 가능
  // ------------------------------------------------------------------

  /**
   * 텍스처 키의 9-slice 스펙을 반환한다.
   * @param {string} key - 텍스처 키 (예: frame_popup)
   * @returns {{key:string,left:number,right:number,top:number,bottom:number,
   *            srcW:number,srcH:number,minW:number,minH:number,sliceable:boolean}|null}
   *          테이블에 없으면 null
   */
  static getFrameSpec(key) {
    const entry = NINE_SLICE_TABLE[key];
    if (!entry) return null;
    const minW = entry.left + entry.right;
    const minH = entry.top + entry.bottom;
    return {
      key,
      ...entry,
      minW,
      minH,
      sliceable: minW + minH > 0
    };
  }

  /**
   * 요청 크기를 최소 렌더 크기 이상으로 올린다.
   * 코너보다 작게 그리면 코너끼리 겹쳐 프레임이 뭉개진다.
   * 코너값은 512 원본 픽셀이자 렌더 픽셀이다 (에셋이 1080 렌더 기준으로 제작됨).
   * @param {string} key - 텍스처 키
   * @param {number} w - 요청 너비 (렌더 px)
   * @param {number} h - 요청 높이 (렌더 px)
   * @returns {{w:number,h:number,clamped:boolean}}
   */
  static clampSize(key, w, h) {
    const spec = NineSliceFrame.getFrameSpec(key);
    if (!spec) return { w, h, clamped: false };
    // 코너값은 이미 렌더(1080) 좌표계 픽셀이다. s() 를 다시 곱하지 않는다
    const outW = Math.max(w, spec.minW);
    const outH = Math.max(h, spec.minH);
    return { w: outW, h: outH, clamped: outW !== w || outH !== h };
  }

  /**
   * 폴백 프레임을 그려야 하는지 판정한다.
   * 텍스처가 없거나, 테이블에 없거나, 9-slice 대상이 아니면 폴백이다.
   * @param {Phaser.Scene} scene
   * @param {string} key - 텍스처 키
   * @returns {boolean}
   */
  static shouldFallback(scene, key) {
    const spec = NineSliceFrame.getFrameSpec(key);
    if (!spec || !spec.sliceable) return true;
    const textures = scene && scene.textures;
    if (!textures || typeof textures.exists !== 'function') return true;
    return !textures.exists(key);
  }

  // ------------------------------------------------------------------
  // Phaser 렌더
  // ------------------------------------------------------------------

  /**
   * 9-slice 프레임을 만든다. 원점은 프레임 중심이다.
   *
   * @param {Phaser.Scene} scene
   * @param {Object} options
   * @param {number} options.x - 중심 x (렌더 px)
   * @param {number} options.y - 중심 y (렌더 px)
   * @param {number} options.w - 너비 (렌더 px)
   * @param {number} options.h - 높이 (렌더 px)
   * @param {string} options.key - 텍스처 키 (NINE_SLICE_TABLE 의 이름)
   * @param {number|null} [options.tint] - 틴트 색 (Phaser hex). 폴백에서는 테두리 색이 된다
   * @param {number} [options.alpha] - 알파. 기본 1
   * @param {number} [options.depth] - depth
   * @param {{w:number,h:number,radius?:number}|null} [options.labelPlate] - 라벨 뒤 어두운 캡슐.
   *        주면 반환값이 [프레임, 캡슐] 을 담은 Container 가 된다. computeLabelPlate() 로 계산한다
   * @returns {Phaser.GameObjects.GameObject} nineslice 또는 폴백 Graphics.
   *          isFallback / frameSize 프로퍼티가 붙는다
   */
  static create(scene, options = {}) {
    const { x = 0, y = 0, w = 0, h = 0, key = '', tint = null, alpha = 1, depth, labelPlate = null } = options;
    const size = NineSliceFrame.clampSize(key, w, h);

    const spec = NineSliceFrame.getFrameSpec(key);
    const hasTexture = !!(scene && scene.textures && typeof scene.textures.exists === 'function'
      && scene.textures.exists(key));

    let object;
    if (spec && !spec.sliceable && hasTexture) {
      // 9-slice 대상이 아닌 단일 스프라이트(frame_hex 등)는 늘리지 않고 그대로 배치한다
      object = scene.add.image(x, y, key);
      if (typeof tint === 'number' && typeof object.setTint === 'function') object.setTint(tint);
      object.isFallback = false;
    } else if (NineSliceFrame.shouldFallback(scene, key)) {
      object = NineSliceFrame._createFallback(scene, x, y, size.w, size.h, tint);
    } else {
      object = NineSliceFrame._createNineSlice(scene, x, y, size.w, size.h, key, tint);
    }

    // 라벨 플레이트를 요청하면 프레임과 캡슐을 한 컨테이너로 묶어 돌려준다.
    // 호출부가 다루는 오브젝트 수가 늘지 않아야 기존 자식 인덱스 계약이 깨지지 않는다.
    if (labelPlate) {
      const plate = NineSliceFrame._createLabelPlate(scene, labelPlate);
      // 알파는 아트에만 건다. 캡슐까지 함께 흐려지면 비활성 버튼의 라벨 대비가
      // 1:1 까지 무너진다(실측). 비활성은 아트가 흐려지는 것으로 충분히 읽힌다
      object.setAlpha(alpha);
      object.setPosition(0, 0);
      const group = scene.add.container(x, y, [object, plate]);
      group.isFallback = object.isFallback;
      group.hasLabelPlate = true;
      group.artObject = object;
      return NineSliceFrame._finish(group, size, depth);
    }

    if (object.isFallback === undefined) object.isFallback = false;

    object.setAlpha(alpha);
    return NineSliceFrame._finish(object, size, depth);
  }

  /**
   * depth 와 크기 정보를 붙여 마무리한다.
   * @private
   */
  static _finish(object, size, depth) {
    if (typeof depth === 'number') object.setDepth(depth);
    object.frameSize = { w: size.w, h: size.h, clamped: size.clamped };
    return object;
  }

  /**
   * 라벨 뒤 어두운 캡슐. 컨테이너 로컬 원점(버튼 중심) 기준으로 그린다.
   * @private
   */
  static _createLabelPlate(scene, plate) {
    const radius = Number.isFinite(plate.radius)
      ? plate.radius
      : Math.min(plate.h / 2, s(DESIGN.radius.md));
    const cx = Number.isFinite(plate.offsetX) ? plate.offsetX : 0;
    const cy = Number.isFinite(plate.offsetY) ? plate.offsetY : 0;
    const graphics = scene.add.graphics();
    graphics.fillStyle(DESIGN.colors.bg.primary, LABEL_PLATE.alpha);
    graphics.fillRoundedRect(cx - plate.w / 2, cy - plate.h / 2, plate.w, plate.h, radius);
    return graphics;
  }

  /** @private */
  static _createNineSlice(scene, x, y, w, h, key, tint) {
    const spec = NineSliceFrame.getFrameSpec(key);
    const object = scene.add.nineslice(
      x, y, key, undefined, w, h,
      spec.left, spec.right, spec.top, spec.bottom
    );
    if (typeof tint === 'number' && typeof object.setTint === 'function') object.setTint(tint);
    object.isFallback = false;
    return object;
  }

  /**
   * 텍스처가 없을 때의 폴백. 라운드 사각형 테두리와 옅은 채움만 그린다.
   * @private
   */
  static _createFallback(scene, x, y, w, h, tint) {
    const color = typeof tint === 'number' ? tint : DESIGN.colors.brand.primary;
    const graphics = scene.add.graphics({ x, y });
    const radius = s(DESIGN.radius.lg);

    graphics.fillStyle(DESIGN.colors.bg.secondary, DESIGN.effects.panelAlpha);
    graphics.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    graphics.lineStyle(s(2), color, DESIGN.glass.panel.outline.alpha);
    graphics.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);

    graphics.isFallback = true;
    return graphics;
  }
}

export default NineSliceFrame;
