/**
 * CoachMark - 비강제 안내 말풍선 + 화살표 (T-C6)
 *
 * 설계 근거:
 *  - docs/story/UX_ONBOARDING_FLOW.md §5-1 — 안내 스텝은 **딤이 없다**. 다른 곳을 눌러도 전부 동작한다.
 *  - §6-3 코치마크 닫기 버튼 최소 탭 타겟 56x56(base)
 *  - UXI-09 — 말풍선은 **가변폭(base 240~560) + 최대 2줄**. 넘치면 sf(16) → sf(14) 자동 축소.
 *
 * 주의: gameConfig/layoutConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { Z_INDEX } from '../../config/layoutConfig.js';
import { s } from '../../config/scaleConfig.js';

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

    const label = this.scene.add.text(0, 0, text, {
      fontSize: `${s(metrics.fontBase)}px`,
      fontFamily: '"Noto Sans KR", Arial',
      color: '#F8FAFC',
      align: 'left',
      wordWrap: { width: bubbleW - padding * 2 },
    }).setOrigin(0, 0);

    const bubbleH = Math.max(label.height + padding * 2, s(56));

    // 대상 위/아래 중 화면에 여유가 있는 쪽에 배치한다
    const placement = CoachMark.resolvePlacement(this.target, bubbleH, H, s(20));
    const cx = this.target ? this.target.x + this.target.w / 2 : W / 2;
    const bubbleX = Math.min(Math.max(cx - bubbleW / 2, s(20)), W - bubbleW - s(20));
    const bubbleY = placement.y;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x0f172a, 0.94);
    bg.fillRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, s(12));
    bg.lineStyle(s(2), 0x6366f1, 0.9);
    bg.strokeRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, s(12));
    this.root.add(bg);

    label.setPosition(bubbleX + padding, bubbleY + padding);
    this.root.add(label);

    // 대상 강조 테두리 (딤 없이 테두리만 — 안내는 명령이 아니다)
    if (this.target) {
      const ring = this.scene.add.graphics();
      ring.lineStyle(s(3), 0x6366f1, 0.9);
      ring.strokeRoundedRect(this.target.x, this.target.y, this.target.w, this.target.h, s(10));
      this.root.add(ring);

      const arrow = this.scene.add.text(
        cx,
        placement.direction === ARROW_DIRECTION.DOWN ? bubbleY + bubbleH : bubbleY,
        placement.direction === ARROW_DIRECTION.DOWN ? '▼' : '▲',
        { fontSize: `${s(18)}px`, color: '#6366F1' }
      ).setOrigin(0.5, placement.direction === ARROW_DIRECTION.DOWN ? 0 : 1);
      this.root.add(arrow);
    }

    if (showClose) {
      const closeX = bubbleX + bubbleW - s(CLOSE_HIT_BASE) / 2 - s(4);
      const closeY = bubbleY + s(CLOSE_HIT_BASE) / 2 - s(4);
      const closeText = this.scene.add.text(closeX, closeY, '✕', {
        fontSize: `${s(18)}px`,
        color: '#94A3B8',
      }).setOrigin(0.5);
      const closeHit = this.scene.add
        .rectangle(closeX, closeY, s(CLOSE_HIT_BASE), s(CLOSE_HIT_BASE))
        .setAlpha(0.001)
        .setInteractive({ useHandCursor: true });
      closeHit.on('pointerdown', () => this.dismiss());
      this.root.add(closeText);
      this.root.add(closeHit);
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
