/**
 * CoachMark - 비강제 안내 말풍선 + 화살표 (T-C6)
 *
 * 설계 근거:
 *  - docs/story/UX_ONBOARDING_FLOW.md §5-1 — 안내 스텝은 **딤이 없다**. 다른 곳을 눌러도 전부 동작한다.
 *  - §6-3 코치마크 닫기 버튼 최소 탭 타겟 56x56(base)
 *  - UXI-09 — 말풍선은 **가변폭(base 240~560) + 최대 2줄**. 넘치면 sf(16) → sf(14) 자동 축소.
 *  - REDESIGN_PLAN §2-3 / T-24 — 말풍선 표면은 `glass.panel`(교단색 아웃라인, 없으면 brand.primary로
 *    자동 대체). 강조 링·화살표는 brand.accent(신성/보상 액센트) 한 색으로 통일해 "여기를 보라"는
 *    신호를 팔레트 안에서만 낸다.
 *
 * 주의: gameConfig/layoutConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { Z_INDEX } from '../../config/layoutConfig.js';
import { s } from '../../config/scaleConfig.js';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { GlassPanel, GLASS_VARIANT } from '../GlassPanel.js';
import { ts } from '../../utils/textStyles.ts';

/** 말풍선 폭 (base px) */
export const BUBBLE_WIDTH_BASE = { MIN: 240, MAX: 560 };
/** 본문 폰트 (base px) — 2줄 초과 시 축소 */
export const BUBBLE_FONT_BASE = { NORMAL: 16, SHRUNK: 14 };
/** 본문 최대 줄 수 */
export const BUBBLE_MAX_LINES = 2;
/** 닫기 버튼 탭 타겟 (base px) */
export const CLOSE_HIT_BASE = 56;

/** 화살표 기본 방향 후보 */
export const ARROW_DIRECTION = { UP: 'up', DOWN: 'down' };

export class CoachMark {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.target = null;
    this.closeHit = null;
    this._autoDismissEvent = null;
    this._onDismiss = null;
  }

  get isVisible() {
    return !!this.root;
  }

  /**
   * 말풍선 표시.
   * @param {object} options
   * @param {string} options.text 안내 문구 (안내 스텝 40자 이내)
   * @param {{x:number,y:number,w:number,h:number}|null} options.target 하이라이트 대상 월드 바운드
   * @param {number} options.autoDismissMs 0이면 자동 소멸 없음
   * @param {boolean} options.showClose 닫기 버튼 표시
   * @param {Function|null} options.onDismiss 닫힘 콜백
   */
  show(options = {}) {
    const {
      text = '',
      target = null,
      autoDismissMs = 0,
      showClose = true,
      onDismiss = null,
      onTargetTap = null,
    } = options;

    if (!this.scene || !this.scene.add) return this;

    this.hide();
    this.target = target ? { ...target } : null;
    this._onDismiss = onDismiss;

    const W = this.scene.scale?.gameSize?.width ?? 1080;
    const H = this.scene.scale?.gameSize?.height ?? 1920;

    this.root = this.scene.add.container(0, 0).setDepth(Z_INDEX.TUTORIAL_CONTENT);

    const metrics = CoachMark.measure(text);
    const bubbleW = s(metrics.widthBase);
    const padding = s(16);

    // 본문 폰트는 measure() 가 고른 base(16=body, 14=label)를 그대로 타이포 토큰에 매핑한다
    const typoToken = metrics.fontBase === BUBBLE_FONT_BASE.SHRUNK ? 'label' : 'body';
    const label = this.scene.add.text(0, 0, text, ts(typoToken, {
      align: 'left',
      wordWrap: { width: bubbleW - padding * 2 },
    })).setOrigin(0, 0);

    const bubbleH = Math.max(label.height + padding * 2, s(56));

    // 대상 위/아래 중 화면에 여유가 있는 쪽에 배치한다
    const placement = CoachMark.resolvePlacement(this.target, bubbleH, H, s(20));
    const cx = this.target ? this.target.x + this.target.w / 2 : W / 2;
    const bubbleX = Math.min(Math.max(cx - bubbleW / 2, s(20)), W - bubbleW - s(20));
    const bubbleY = placement.y;

    // 글래스 규칙(§2-3) — panel 변형은 교단색 아웃라인을 지원하고, 교단색이 없으면
    // GlassPanel 자체가 brand.primary 로 대체한다(GlassPanel.resolveSpec)
    const bubble = GlassPanel.create(this.scene, {
      x: bubbleX + bubbleW / 2,
      y: bubbleY + bubbleH / 2,
      w: bubbleW,
      h: bubbleH,
      variant: GLASS_VARIANT.PANEL,
    });
    this.root.add(bubble);

    label.setPosition(bubbleX + padding, bubbleY + padding);
    this.root.add(label);

    // 대상 강조 테두리 (딤 없이 테두리만 — 안내는 명령이 아니다)
    if (this.target) {
      const ring = this.scene.add.graphics();
      ring.lineStyle(s(3), DESIGN.colors.brand.accent, 0.9);
      ring.strokeRoundedRect(this.target.x, this.target.y, this.target.w, this.target.h, s(10));
      this.root.add(ring);

      // 강조 영역을 코치마크 위에서 직접 누를 수 있게 한다.
      // 코치마크는 팝업 레이어(2000)보다 위(3010)라, 아래 레이어가 입력을 삼켜도 안내가 동작한다.
      if (typeof onTargetTap === 'function') {
        const tapZone = this.scene.add
          .zone(this.target.x, this.target.y, this.target.w, this.target.h)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true });
        tapZone.on('pointerdown', () => onTargetTap());
        this.root.add(tapZone);
        this.targetTapZone = tapZone;
      }

      const arrow = this.scene.add.text(
        cx,
        placement.direction === ARROW_DIRECTION.DOWN ? bubbleY + bubbleH : bubbleY,
        placement.direction === ARROW_DIRECTION.DOWN ? '▼' : '▲',
        { fontSize: `${s(18)}px`, color: hexToCSS(DESIGN.colors.brand.accent) }
      ).setOrigin(0.5, placement.direction === ARROW_DIRECTION.DOWN ? 0 : 1);
      this.root.add(arrow);
    }

    if (showClose) {
      const closeX = bubbleX + bubbleW - s(CLOSE_HIT_BASE) / 2 - s(4);
      const closeY = bubbleY + s(CLOSE_HIT_BASE) / 2 - s(4);
      const closeText = this.scene.add.text(closeX, closeY, '✕', {
        fontSize: `${s(18)}px`,
        color: DESIGN.colors.text.secondary,
      }).setOrigin(0.5);
      const closeHit = this.scene.add
        .rectangle(closeX, closeY, s(CLOSE_HIT_BASE), s(CLOSE_HIT_BASE))
        .setAlpha(0.001)
        .setInteractive({ useHandCursor: true });
      closeHit.on('pointerdown', () => this.dismiss());
      this.root.add(closeText);
      this.root.add(closeHit);
      this.closeHit = closeHit;   // 좌표 탭 테스트/자동화가 찾을 수 있게 보관
    }

    if (autoDismissMs > 0 && this.scene.time?.delayedCall) {
      this._autoDismissEvent = this.scene.time.delayedCall(autoDismissMs, () => this.dismiss());
    }

    return this;
  }

  /** 닫기 (콜백 1회 호출) */
  dismiss() {
    const callback = this._onDismiss;
    this.hide();
    if (typeof callback === 'function') callback();
    return this;
  }

  hide() {
    if (this._autoDismissEvent) {
      this._autoDismissEvent.remove?.(false);
      this._autoDismissEvent = null;
    }
    if (this.root) this.root.destroy(true);
    this.root = null;
    this.target = null;
    this.closeHit = null;
    this.targetTapZone = null;
    this._onDismiss = null;
    return this;
  }

  destroy() {
    this.hide();
    this.scene = null;
  }

  // ==================== 순수 계산 (테스트 대상) ====================

  /**
   * 문구 길이로 말풍선 폭·폰트를 결정한다 (UXI-09 가변폭 규정).
   * @param {string} text
   * @returns {{widthBase:number, fontBase:number, lines:number}}
   */
  static measure(text) {
    const length = (text || '').length;
    const { MIN, MAX } = BUBBLE_WIDTH_BASE;

    // 한글 기준 글자 폭 ≈ 폰트 크기. 2줄 안에 들어가는 최소 폭을 고른다.
    let fontBase = BUBBLE_FONT_BASE.NORMAL;
    let widthBase = Math.ceil((length * fontBase) / BUBBLE_MAX_LINES) + 40;
    widthBase = Math.min(Math.max(widthBase, MIN), MAX);

    let lines = CoachMark.estimateLines(length, widthBase, fontBase);
    if (lines > BUBBLE_MAX_LINES) {
      fontBase = BUBBLE_FONT_BASE.SHRUNK;
      lines = CoachMark.estimateLines(length, widthBase, fontBase);
    }

    return { widthBase, fontBase, lines };
  }

  /** 폭·폰트로 줄 수 추정 */
  static estimateLines(length, widthBase, fontBase) {
    const usable = widthBase - 32;
    const perLine = Math.max(Math.floor(usable / fontBase), 1);
    return Math.max(Math.ceil(length / perLine), 1);
  }

  /**
   * 대상 기준 말풍선 배치 방향 결정.
   * 위쪽에 여유가 있으면 위에 두고 아래를 가리키게 한다.
   */
  static resolvePlacement(target, bubbleH, screenH, margin) {
    if (!target) {
      return { y: Math.max(screenH - bubbleH - margin * 4, margin), direction: ARROW_DIRECTION.DOWN };
    }
    const above = target.y - bubbleH - margin;
    if (above >= margin) {
      return { y: above, direction: ARROW_DIRECTION.DOWN };
    }
    const below = target.y + target.h + margin;
    const clamped = Math.min(below, Math.max(screenH - bubbleH - margin, margin));
    return { y: clamped, direction: ARROW_DIRECTION.UP };
  }
}

export default CoachMark;
