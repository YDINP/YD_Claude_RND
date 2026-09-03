/**
 * UIButton.js — 공통 버튼 팩토리 (9-slice 아트 + 읽히는 라벨)
 *
 * btn_primary/secondary/ghost 아트는 가운데가 밝은 장식판이다. 그 위에 흰 라벨을
 * 그대로 얹으면 대비가 3:1 아래로 떨어져 글자가 아트에 묻힌다. 이 팩토리는
 * 라벨 뒤에 어두운 캡슐(LABEL_PLATE)을 깔고 외곽선과 그림자를 함께 걸어
 * 아트가 무엇이든 라벨 대비 4.5:1 이상을 만든다.
 *
 * 두 가지 형태를 준다:
 *   createParts() — {frame, label, sub, hit} 를 낱개로. 호출부가 자식 순서를 계약으로
 *                   쓰는 곳(PopupBase 액션 바)에서 인덱스를 깨지 않고 쓸 수 있다.
 *   create()      — 같은 것을 Container 하나로 묶어서. 씬에서 버튼 하나를 다룰 때.
 *
 * 주의: designSystem/scaleConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { DESIGN } from '../config/designSystem.js';
import { s } from '../config/scaleConfig.js';
import { ts } from '../utils/textStyles.ts';
import { NineSliceFrame, LABEL_PLATE, computeLabelPlate } from './NineSliceFrame.js';
import { soundManager } from '../systems/SoundManager.js';

/** 버튼 변형 이름 */
export const BUTTON_VARIANT = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  GHOST: 'ghost'
};

/** 변형 → 9-slice 텍스처 키 */
export const BUTTON_TEXTURE = Object.freeze({
  primary: 'btn_primary',
  secondary: 'btn_secondary',
  ghost: 'btn_ghost'
});

/** 상태별 프레임 알파 */
export const BUTTON_ALPHA = Object.freeze({
  normal: 1,
  hover: 0.85,
  disabled: 0.45
});

/** 눌림 연출 */
export const PRESS_SCALE = 0.96;
export const PRESS_DURATION = 90;

/**
 * 비활성 보조 라벨 알파.
 *
 * 주 라벨은 비활성이어도 흐리게 하지 않는다. 알파를 낮추면 캡슐 위에서 대비가
 * 4.5:1 아래로 떨어져 "무슨 버튼인지 못 읽는" 상태가 된다(실측 1.00:1).
 * 비활성은 아트 알파 저하와 상호작용 차단으로 이미 충분히 읽힌다.
 */
export const DISABLED_SUB_ALPHA = 0.6;

/**
 * 프레임(또는 캡슐을 품은 컨테이너)에서 알파를 걸어야 할 대상을 고른다.
 * 캡슐이 있으면 아트에만 걸어 캡슐의 어둠을 지킨다.
 *
 * @param {Object} frame - NineSliceFrame.create() 반환값
 * @returns {Object} 알파를 걸 오브젝트
 */
export function frameAlphaTarget(frame) {
  return (frame && frame.artObject) ? frame.artObject : frame;
}

/**
 * 변형 이름을 9-slice 텍스처 키로 바꾼다 (순수 함수).
 * 이미 btn_ 로 시작하는 완성된 키를 주면 그대로 통과시킨다.
 *
 * @param {string} variant - 'primary' | 'secondary' | 'ghost' | 'btn_*'
 * @returns {string} 텍스처 키. 알 수 없으면 btn_primary
 */
export function resolveButtonTexture(variant) {
  if (typeof variant === 'string' && variant.startsWith('btn_')) return variant;
  return BUTTON_TEXTURE[variant] || BUTTON_TEXTURE.primary;
}

/**
 * 히트 영역 크기를 계산한다 (순수 함수).
 * 시각 크기와 무관하게 터치 타겟 하한(DESIGN.touch.minTarget)을 지킨다.
 *
 * @param {number} w - 버튼 시각 너비 (렌더 px)
 * @param {number} h - 버튼 시각 높이 (렌더 px)
 * @returns {{w:number,h:number}}
 */
export function computeHitSize(w, h) {
  const min = s(DESIGN.touch.minTarget);
  return { w: Math.max(w || 0, min), h: Math.max(h || 0, min) };
}

/**
 * 라벨 텍스트 스타일을 만든다 (순수 함수).
 *
 * 캡슐만으로는 글자 끝이 아트에 닿는 경우가 남는다. 외곽선과 그림자를 함께 걸어
 * 캡슐 밖으로 나간 획도 배경과 분리되게 한다.
 *
 * @param {string} token - 타이포 토큰 ('body', 'subtitle', 'label' 등)
 * @param {Object} [options]
 * @param {boolean} [options.disabled] - 비활성 여부 (색은 바꾸지 않는다. 하위호환용 인자)
 * @param {string} [options.color] - 색 강제 지정
 * @param {boolean} [options.bold] - 굵게
 * @returns {Object} Phaser 텍스트 스타일
 */
export function resolveLabelStyle(token, options = {}) {
  const { disabled = false, color, bold = false } = options;
  const style = ts(token, {
    // 비활성이어도 라벨색은 낮추지 않는다. 어두운 캡슐 위에서 text.secondary 는
    // 대비 3:1 아래로 떨어진다(실측). 비활성 신호는 아트 알파가 맡는다
    color: color || DESIGN.colors.text.primary,
    stroke: '#0D0F1A',
    strokeThickness: s(LABEL_PLATE.strokeThickness),
    shadow: {
      offsetX: s(LABEL_PLATE.shadow.offsetX),
      offsetY: s(LABEL_PLATE.shadow.offsetY),
      color: '#0D0F1A',
      blur: s(LABEL_PLATE.shadow.blur),
      stroke: true,
      fill: true
    }
  });
  if (bold) style.fontStyle = 'bold';
  return style;
}

export class UIButton {
  /**
   * 버튼 구성 요소를 낱개로 만든다.
   *
   * 반환 순서는 {frame, label, hit} 이며 sub 라벨이 있으면 label 다음에 온다.
   * `objects` 는 화면에 얹을 순서대로 정렬된 배열이다.
   *
   * @param {Phaser.Scene} scene
   * @param {Object} options
   * @param {number} options.x - 중심 x (렌더 px)
   * @param {number} options.y - 중심 y (렌더 px)
   * @param {number} options.w - 너비 (렌더 px)
   * @param {number} options.h - 높이 (렌더 px)
   * @param {string} options.label - 라벨 문구
   * @param {string} [options.variant] - BUTTON_VARIANT 값 또는 btn_* 텍스처 키
   * @param {number|null} [options.tint] - 프레임 틴트 (Phaser hex)
   * @param {string} [options.token] - 라벨 타이포 토큰. 기본 'body'
   * @param {string} [options.labelColor] - 라벨 색 강제 지정
   * @param {number} [options.labelOffsetX] - 라벨과 캡슐의 가로 오프셋 (렌더 px)
   * @param {boolean} [options.bold] - 라벨 굵게
   * @param {string|null} [options.sub] - 보조 라벨 (수량·비용 등)
   * @param {string} [options.subToken] - 보조 라벨 토큰. 기본 'caption'
   * @param {boolean} [options.disabled] - 비활성 상태. 아트만 흐려지고 라벨은 읽히는 채로 남는다
   * @param {Function|null} [options.onClick] - 클릭 콜백
   * @param {boolean} [options.sound] - 클릭음 재생. 기본 false
   * @param {number} [options.depth] - 기준 depth. 주면 frame/label/hit 이 순서대로 쌓인다
   * @param {boolean} [options.plate] - 라벨 캡슐 사용. 기본 true
   * @returns {Object} {frame, label, sub, hit, objects, setEnabled, setLabel, setSubLabel}
   */
  static createParts(scene, options = {}) {
    const {
      x = 0, y = 0, w = 0, h = 0,
      label = '',
      variant = BUTTON_VARIANT.PRIMARY,
      tint = null,
      token = 'body',
      labelColor,
      labelOffsetX = 0,
      bold = false,
      sub = null,
      subToken = 'caption',
      disabled = false,
      onClick = null,
      sound = false,
      depth,
      plate = true
    } = options;

    const hasSub = typeof sub === 'string' && sub.length > 0;
    const labelX = x + labelOffsetX;
    const labelY = hasSub ? y - s(14) : y;

    // 캡슐 크기를 알려면 라벨을 먼저 재야 한다. 순서는 아래에서 depth 로 바로잡는다
    const labelText = scene.add.text(labelX, labelY, label,
      resolveLabelStyle(token, { disabled, color: labelColor, bold })).setOrigin(0.5);

    const subText = hasSub
      ? scene.add.text(labelX, y + s(16), sub,
        resolveLabelStyle(subToken, { disabled, color: labelColor })).setOrigin(0.5).setAlpha(0.9)
      : null;

    const plateRect = plate
      ? computeLabelPlate({
        buttonW: w,
        buttonH: h,
        labelW: Math.max(labelText.width, subText ? subText.width : 0),
        labelH: subText
          ? (subText.y + subText.height / 2) - (labelText.y - labelText.height / 2)
          : labelText.height,
        offsetX: labelOffsetX,
        offsetY: hasSub ? 0 : labelY - y
      })
      : null;

    const frame = NineSliceFrame.create(scene, {
      x, y, w, h,
      key: resolveButtonTexture(variant),
      tint,
      alpha: disabled ? BUTTON_ALPHA.disabled : BUTTON_ALPHA.normal,
      labelPlate: plateRect
    });

    const hitSize = computeHitSize(w, h);
    const hit = scene.add.rectangle(x, y, hitSize.w, hitSize.h, 0xffffff, 0);

    if (disabled) subText?.setAlpha(DISABLED_SUB_ALPHA);

    // 라벨이 프레임보다 뒤에 만들어졌으므로 쌓임 순서를 명시적으로 되돌린다
    if (Number.isFinite(depth)) {
      frame.setDepth(depth);
      labelText.setDepth(depth + 1);
      subText?.setDepth(depth + 1);
      hit.setDepth(depth + 2);
    } else {
      scene.children.bringToTop(labelText);
      if (subText) scene.children.bringToTop(subText);
      scene.children.bringToTop(hit);
    }

    const parts = {
      frame,
      label: labelText,
      sub: subText,
      hit,
      disabled,
      objects: [frame, labelText, subText, hit].filter(Boolean)
    };

    UIButton._bindInteraction(scene, parts, { onClick, sound });

    parts.setEnabled = (enabled) => UIButton.setEnabled(scene, parts, enabled, { onClick, sound });
    parts.setLabel = (text) => { labelText.setText(text); return parts; };
    parts.setSubLabel = (text) => { if (subText) subText.setText(text); return parts; };

    return parts;
  }

  /**
   * 버튼을 Container 하나로 만든다. 원점은 버튼 중심이다.
   *
   * @param {Phaser.Scene} scene
   * @param {Object} options - createParts() 와 동일
   * @returns {Phaser.GameObjects.Container} uiButton 프로퍼티로 파트 접근
   */
  static create(scene, options = {}) {
    const { x = 0, y = 0, depth } = options;
    const parts = UIButton.createParts(scene, { ...options, x: 0, y: 0, depth: undefined });

    const container = scene.add.container(x, y, parts.objects);
    if (Number.isFinite(depth)) container.setDepth(depth);
    container.uiButton = parts;
    container.setEnabled = (enabled) => { parts.setEnabled(enabled); return container; };
    container.setLabel = (text) => { parts.setLabel(text); return container; };
    return container;
  }

  /**
   * 히트 영역에 상태 반응을 건다. 비활성이면 상호작용을 끈다.
   * @private
   */
  static _bindInteraction(scene, parts, { onClick, sound }) {
    const { frame, label, sub, hit } = parts;
    hit.removeAllListeners();

    if (parts.disabled) {
      hit.disableInteractive();
      return;
    }

    const art = frameAlphaTarget(frame);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => art.setAlpha?.(BUTTON_ALPHA.hover));
    hit.on('pointerout', () => art.setAlpha?.(BUTTON_ALPHA.normal));
    hit.on('pointerdown', (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      if (sound) soundManager.playSFX('button_click');
      const targets = [frame, label, sub].filter(Boolean);
      scene.tweens.add({
        targets,
        scaleX: PRESS_SCALE,
        scaleY: PRESS_SCALE,
        duration: PRESS_DURATION,
        yoyo: true
      });
      if (onClick) onClick();
    });
  }

  /**
   * 활성·비활성 상태를 바꾼다.
   *
   * @param {Phaser.Scene} scene
   * @param {Object} parts - createParts() 반환값
   * @param {boolean} enabled
   * @param {Object} [handlers] - {onClick, sound}. 재활성 시 다시 걸 콜백
   * @returns {Object} parts
   */
  static setEnabled(scene, parts, enabled, handlers = {}) {
    parts.disabled = !enabled;
    frameAlphaTarget(parts.frame).setAlpha?.(enabled ? BUTTON_ALPHA.normal : BUTTON_ALPHA.disabled);
    parts.sub?.setAlpha(enabled ? 0.9 : DISABLED_SUB_ALPHA);
    UIButton._bindInteraction(scene, parts, handlers);
    return parts;
  }
}

export default UIButton;
