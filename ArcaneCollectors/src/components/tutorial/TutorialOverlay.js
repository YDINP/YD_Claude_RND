/**
 * TutorialOverlay - 튜토리얼 딤 + 홀 마스크 + 핸드포인터/펄스 링 (T-C6)
 *
 * 설계 근거:
 *  - docs/story/SPIKE_OVERLAY_INPUT.md §5, §6 — **같은 Scene 내 depth 3000 컨테이너**로 구현한다.
 *    별도 Scene 은 bringToTop 누락 / 고아 오버레이 / 크로스 씬 좌표 변환이라는 실패 모드를 새로 만든다.
 *  - 입력 구멍: 전체화면 Zone + 커스텀 hitAreaCallback. 구멍 안은 "재전달"이 아니라 **애초에 캡처하지 않는다**.
 *  - 시각 구멍: Graphics 딤 + Geometry Mask(invertAlpha). ERASE 는 하위 픽셀까지 지워 홀이 검게 뚫린다(실측).
 *  - globalTopOnly 는 기본값(true)을 유지한다. false 로 두면 차단이 아니라 이중 발화가 된다.
 *
 * 강제 스텝(F-1/F-2)만 딤을 쓴다. 안내 스텝은 딤 없이 코치마크만 띄운다(UX 문서 §5-1).
 *
 * 주의: gameConfig/layoutConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 *       Z_INDEX / COLORS 는 반드시 메서드 내부에서 읽는다.
 */
import { Z_INDEX } from '../../config/layoutConfig.js';
import { s } from '../../config/scaleConfig.js';

/** 딤 알파 기본값 (UX 문서 §5-1: 강제 구간 72%) */
export const DEFAULT_DIM_ALPHA = 0.72;

/** 홀 라운드 반경 (base px) */
const HOLE_RADIUS_BASE = 12;

/** 펄스 링 루프 주기 (ms, UX 문서 §2-2: 0.9초) */
const PULSE_DURATION = 900;

export class TutorialOverlay {
  /**
   * @param {Phaser.Scene} scene 오버레이를 붙일 씬 (팝업이 뜬 그 씬)
   */
  constructor(scene) {
    this.scene = scene;
    this.root = null;
    this.hole = null;
    this.blocker = null;
    this._dim = null;
    this._pulse = null;
    this._pulseTween = null;
    this._pointer = null;
    this._instruction = null;
    this._onBlockedTap = null;
    this._holeShape = null;
    this._holeMask = null;
    this._dimAlpha = DEFAULT_DIM_ALPHA;
  }

  /** 표시 중 여부 */
  get isVisible() {
    return !!this.root;
  }

  /**
   * 오버레이 표시.
   * @param {object} options
   * @param {{x:number,y:number,w:number,h:number}|null} options.hole 월드 좌표 홀. null 이면 전면 차단
   * @param {number} options.dimAlpha 딤 알파
   * @param {boolean} options.blockInput false 면 입력을 막지 않는다(안내 스텝)
   * @param {string|null} options.instructionText 지시문 (강제 스텝 20자 이내)
   * @param {boolean} options.pulse 홀 둘레 펄스 링 표시
   * @param {Function|null} options.onBlockedTap 구멍 밖 탭 콜백
   */
  show(options = {}) {
    const {
      hole = null,
      dimAlpha = DEFAULT_DIM_ALPHA,
      blockInput = true,
      instructionText = null,
      pulse = true,
      onBlockedTap = null,
    } = options;

    if (!this.scene || !this.scene.add) return this;

    this.hide();

    const W = this.scene.scale?.gameSize?.width ?? this.scene.sys?.game?.config?.width ?? 1080;
    const H = this.scene.scale?.gameSize?.height ?? this.scene.sys?.game?.config?.height ?? 1920;

    this.hole = hole ? { ...hole } : null;
    this._onBlockedTap = onBlockedTap;

    this.root = this.scene.add.container(0, 0).setDepth(Z_INDEX.TUTORIAL_MASK);

    // ---- 시각: 딤 + 마스크 홀 ----
    const dim = this.scene.add.graphics();
    this._drawDim(dim, W, H, dimAlpha);
    this.root.add(dim);
    this._dim = dim;

    // ---- 입력: 전체화면 Zone + 커스텀 hitArea ----
    if (blockInput) {
      const blocker = this.scene.add.zone(0, 0, W, H).setOrigin(0, 0);
      blocker.setInteractive((_hitArea, x, y) => !this._isInsideHole(x, y));
      blocker.on('pointerdown', () => {
        this.scene.events?.emit?.('tutorial:blockedTap', { hole: this.hole });
        if (typeof this._onBlockedTap === 'function') this._onBlockedTap();
      });
      this.root.add(blocker);
      this.blocker = blocker;
    }

    // ---- 연출: 펄스 링 + 핸드포인터 (색이 아니라 형태·움직임·밝기의 3중 부호화) ----
    if (this.hole && pulse) {
      this._createPulseRing();
      this._createHandPointer();
    }

    if (instructionText) {
      this._createInstruction(instructionText, W, H);
    }

    return this;
  }

  /** 홀 위치 갱신 (spotlight_sequence 등 홀이 움직이는 스텝) */
  moveHole(hole) {
    if (!this.root) return this;
    this.hole = hole ? { ...hole } : null;

    const W = this.scene.scale?.gameSize?.width ?? 1080;
    const H = this.scene.scale?.gameSize?.height ?? 1920;
    if (this._dim) {
      const alpha = this._dimAlpha ?? DEFAULT_DIM_ALPHA;
      this._clearHoleMask();
      this._dim.clear();
      this._drawDim(this._dim, W, H, alpha);
    }

    if (this._pulse) {
      this._destroyPulse();
      if (this.hole) this._createPulseRing();
    }
    if (this._pointer) {
      this._pointer.destroy();
      this._pointer = null;
      if (this.hole) this._createHandPointer();
    }
    return this;
  }

  /** 오버레이 제거. 팝업 dim 리스너를 건드렸다면 호출부가 여기서 복구해야 한다. */
  hide() {
    this._destroyPulse();
    this._clearHoleMask();
    if (this.root) {
      this.root.destroy(true);
    }
    this.root = null;
    this.blocker = null;
    this._dim = null;
    this._pointer = null;
    this._instruction = null;
    this.hole = null;
    this._onBlockedTap = null;
    return this;
  }

  /** 씬 종료 시 정리 */
  destroy() {
    this.hide();
    this.scene = null;
  }

  // ==================== 내부 ====================

  /** 홀 내부 판정 — Zone(origin 0,0) 콜백의 x,y 는 월드 좌표와 일치한다 */
  _isInsideHole(x, y) {
    const hole = this.hole;
    if (!hole) return false;
    return x >= hole.x && x <= hole.x + hole.w && y >= hole.y && y <= hole.y + hole.h;
  }

  /**
   * 딤 + 시각 구멍.
   * BlendModes.ERASE 는 프레임버퍼의 하위 픽셀(=강조해야 할 버튼)까지 함께 지워
   * 홀이 검게 뚫린다. 그래서 스파이크가 함께 제시한 **Geometry Mask(invertAlpha)** 를 쓴다.
   * 마스크는 입력에 관여하지 않으므로(SPIKE §2-5) 입력 구멍은 Zone 콜백이 그대로 담당한다.
   */
  _drawDim(dim, W, H, alpha) {
    this._dimAlpha = alpha;
    dim.fillStyle(0x000000, alpha);
    dim.fillRect(0, 0, W, H);

    if (!this.hole) return;

    const shape = this.scene.make.graphics({ add: false });
    shape.fillStyle(0xffffff, 1);
    shape.fillRoundedRect(this.hole.x, this.hole.y, this.hole.w, this.hole.h, s(HOLE_RADIUS_BASE));

    const mask = shape.createGeometryMask();
    mask.invertAlpha = true;   // 홀 안쪽에는 딤을 그리지 않는다
    dim.setMask(mask);

    this._holeShape = shape;
    this._holeMask = mask;
  }

  _clearHoleMask() {
    if (this._dim) this._dim.clearMask();
    if (this._holeMask) {
      this._holeMask.destroy();
      this._holeMask = null;
    }
    if (this._holeShape) {
      this._holeShape.destroy();
      this._holeShape = null;
    }
  }

  _createPulseRing() {
    const hole = this.hole;
    if (!hole) return;

    const ring = this.scene.add.graphics();
    ring.lineStyle(s(3), 0xffffff, 0.9);
    ring.strokeRoundedRect(hole.x, hole.y, hole.w, hole.h, s(HOLE_RADIUS_BASE));
    ring.setDepth(Z_INDEX.TUTORIAL_CONTENT);
    this.root.add(ring);
    this._pulse = ring;

    // 애니메이션 감소 설정에서도 정적 테두리는 남는다
    if (this.scene.tweens?.add) {
      this._pulseTween = this.scene.tweens.add({
        targets: ring,
        alpha: { from: 1, to: 0.25 },
        duration: PULSE_DURATION,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  _createHandPointer() {
    const hole = this.hole;
    if (!hole) return;

    const pointer = this.scene.add.text(
      hole.x + hole.w / 2,
      hole.y + hole.h + s(14),
      '👆',
      { fontSize: `${s(34)}px` }
    ).setOrigin(0.5, 0).setDepth(Z_INDEX.TUTORIAL_CONTENT);

    this.root.add(pointer);
    this._pointer = pointer;

    if (this.scene.tweens?.add) {
      this.scene.tweens.add({
        targets: pointer,
        y: pointer.y + s(8),
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  _createInstruction(text, W, H) {
    const hole = this.hole;
    // 홀을 가리지 않도록 홀 위쪽에 배치하고, 공간이 없으면 화면 중앙 하단으로 내린다
    let y = hole ? hole.y - s(52) : H - s(280);
    if (y < s(120)) y = hole ? hole.y + hole.h + s(70) : H - s(280);

    const label = this.scene.add.text(W / 2, y, text, {
      fontSize: `${s(20)}px`,
      fontFamily: '"Noto Sans KR", Arial',
      fontStyle: 'bold',
      color: '#F8FAFC',
      align: 'center',
      wordWrap: { width: s(600) },
    }).setOrigin(0.5).setDepth(Z_INDEX.TUTORIAL_CONTENT);

    this.root.add(label);
    this._instruction = label;
  }

  _destroyPulse() {
    if (this._pulseTween) {
      this._pulseTween.remove?.();
      this._pulseTween = null;
    }
    if (this._pulse) {
      this._pulse.destroy();
      this._pulse = null;
    }
  }
}

export default TutorialOverlay;
