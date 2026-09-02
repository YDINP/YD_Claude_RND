import { s, sf, BASE_WIDTH, GAME_HEIGHT, SCALE_FACTOR } from '../../config/scaleConfig.js';
import { DebugManager } from '../../systems/DebugManager.js';

/**
 * FAB 기본 좌표 (base 720×1280). REDESIGN_PLAN §3-1/§3-4 T-21 + 후속 조정.
 *
 * 지금까지 부딪힌 것들
 *  - 우상단 (GAME_WIDTH - s(40), s(120)) : 편성 버튼과 팝업 닫기 ✕(약 652,108)를 가렸다
 *  - 우하단 (660, 1200)                  : 영웅 상세 하단 액션바의 "진화" 버튼(y 1160~1232)과 겹쳤다
 *  - 좌상단 (60, 150)                    : 리디자인된 메인 메뉴의 파티 1번 아바타와 겹쳤다
 *
 * 좌하단 (40, 1000)은 수익 요약(y 900~952)과 메뉴 그리드(y 1046~) 사이의 좌측 여백이다.
 * 파티 패널·현재 모험 패널·액션바·팝업 ✕ 어느 것과도 만나지 않는다.
 */
export const FAB_BASE_POSITION = Object.freeze({ x: 40, y: 1000 });

/**
 * 이전 기본 좌표들. 저장된 값이 **직접 옮긴 적 없는 옛 기본값**이면
 * 새 기본값으로 1회 올려준다. 옛 기본값 그대로 두면 겹침이 그대로 남기 때문이다.
 * 사용자가 그 좌표로 직접 끌어다 놓은 경우도 한 번은 초기화되지만,
 * 다시 옮기면 그 값이 남으므로 되풀이되지 않는다.
 */
export const LEGACY_DEFAULT_POSITIONS = Object.freeze([
  Object.freeze({ x: 60, y: 150 }),
]);

/** 드래그로 옮긴 위치를 저장하는 키 (base 좌표로 저장한다) */
export const FAB_POSITION_STORAGE_KEY = 'arcane_debug_fab_pos';

/**
 * 드래그 이동 가능 범위 (base). 상단바 아래 ~ 화면 안쪽.
 * FAB 반지름(22)만큼 여백을 두어 화면 밖으로 나가지 않게 한다.
 */
export const FAB_BASE_BOUNDS = Object.freeze({
  minX: 30,
  maxX: BASE_WIDTH - 30,
  minY: 110,
  maxY: Math.round(GAME_HEIGHT / SCALE_FACTOR) - 30,
});

/** 탭으로 인정하는 최대 이동 거리 (base). 이보다 움직이면 드래그로 본다. */
export const TAP_MOVE_TOLERANCE = 6;

/** 평소 알파 — 화면을 가리지 않도록 반투명하게 둔다 */
export const ALPHA_IDLE = 0.55;
/** 만지는 동안(또는 패널이 열린 동안) 알파 */
export const ALPHA_ACTIVE = 1;

/** 평소 depth — 게임 UI 위 */
const DEPTH_NORMAL = 8000;
/**
 * 팝업이 열렸을 때의 depth — `PopupBase`의 컨테이너(2000) **아래**로 내려
 * FAB이 팝업을 가리지도, 팝업 입력을 가로채지도 않게 한다.
 */
const DEPTH_UNDER_POPUP = 1900;

/** 이 depth 이상인 표시 객체가 보이면 팝업이 떠 있는 것으로 본다 (`PopupBase` = 2000) */
const POPUP_DEPTH_THRESHOLD = 2000;

/** 상태 폴링 주기 (ms). 뱃지와 가림 판정을 함께 갱신한다. */
const POLL_INTERVAL_MS = 250;

/**
 * 디버그 UI를 붙여도 되는 빌드인지.
 * 프로덕션 번들에서는 localStorage 플래그가 켜져 있어도 **완전히 제외**한다(T-21).
 * @returns {boolean}
 */
export function isDebugUiAllowed() {
  try {
    return !(typeof import.meta !== 'undefined' && import.meta.env?.PROD);
  } catch {
    return true;
  }
}

/** base 좌표를 이동 가능 범위 안으로 자른다 */
export function clampFabPosition(pos) {
  const b = FAB_BASE_BOUNDS;
  const x = Number(pos?.x);
  const y = Number(pos?.y);
  return {
    x: Number.isFinite(x) ? Math.min(b.maxX, Math.max(b.minX, x)) : FAB_BASE_POSITION.x,
    y: Number.isFinite(y) ? Math.min(b.maxY, Math.max(b.minY, y)) : FAB_BASE_POSITION.y,
  };
}

/** 저장된 값이 옛 기본 좌표 그대로인지 */
export function isLegacyDefaultPosition(pos) {
  return LEGACY_DEFAULT_POSITIONS.some(
    (legacy) => Number(pos?.x) === legacy.x && Number(pos?.y) === legacy.y
  );
}

/**
 * 저장된 FAB 위치(base 좌표)를 읽는다. 없거나 깨졌으면 기본 위치.
 * 옛 기본값이 저장돼 있으면 새 기본값으로 올리고 저장까지 마친다(1회 마이그레이션).
 * @returns {{x: number, y: number}}
 */
export function loadFabPosition() {
  try {
    const raw = localStorage.getItem(FAB_POSITION_STORAGE_KEY);
    if (!raw) return { ...FAB_BASE_POSITION };

    const stored = JSON.parse(raw);
    if (isLegacyDefaultPosition(stored)) {
      return saveFabPosition(FAB_BASE_POSITION);
    }
    return clampFabPosition(stored);
  } catch {
    return { ...FAB_BASE_POSITION };
  }
}

/** FAB 위치(base 좌표)를 저장한다. 실패해도 조용히 넘어간다(디버그 편의 기능). */
export function saveFabPosition(pos) {
  try {
    const clamped = clampFabPosition(pos);
    localStorage.setItem(FAB_POSITION_STORAGE_KEY, JSON.stringify(clamped));
    return clamped;
  } catch {
    return clampFabPosition(pos);
  }
}

export class DebugFAB {
  constructor(scene) {
    this.scene = scene;
    this.isOpen = false;
    this.onToggle = null; // 콜백: 패널 열기/닫기
    this._pointerDownTime = 0;
    this._pointerDownPos = null;
    this._dragged = false;
    this._coveredByPopup = false;
    this._create();
  }

  _create() {
    // 프로덕션 빌드에서는 아무것도 그리지 않는다. 인스턴스는 껍데기로 남고
    // show/hide/destroy 는 옵셔널 체이닝 덕에 그대로 안전하다.
    if (!isDebugUiAllowed()) return;

    // 마지막으로 끌어다 놓은 위치를 복원한다. 없으면 기본 좌상단.
    this.basePos = loadFabPosition();
    const x = s(this.basePos.x);
    const y = s(this.basePos.y);
    const size = s(44);

    // 배경 원
    this.bg = this.scene.add.circle(x, y, size / 2, 0x1a1a2e, 0.9)
      .setDepth(DEPTH_NORMAL)
      .setInteractive({ useHandCursor: true, draggable: true })
      .setStrokeStyle(s(2), 0x6366F1);

    // 아이콘 텍스트
    this.icon = this.scene.add.text(x, y, '🐛', {
      fontSize: sf(20), fontFamily: 'Arial'
    }).setOrigin(0.5).setDepth(DEPTH_NORMAL + 1);

    // 활성 치트 뱃지 (빨간 원 + 숫자)
    this.badge = this.scene.add.circle(x + s(14), y - s(14), s(10), 0xEF4444)
      .setDepth(DEPTH_NORMAL + 2).setVisible(false);
    this.badgeText = this.scene.add.text(x + s(14), y - s(14), '0', {
      fontSize: sf(10), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(DEPTH_NORMAL + 3).setVisible(false);

    this._bindInput();
    this.setActiveAlpha(false);

    // 뱃지 + 팝업 가림 상태 폴링
    this.updateTimer = this.scene.time.addEvent({
      delay: POLL_INTERVAL_MS,
      loop: true,
      callback: () => {
        this.updateBadge();
        this.updateDepth();
      }
    });

    this.updateBadge();
    this.updateDepth();
  }

  /**
   * 알파 전환. 평소에는 반투명해서 아래 UI가 비치고, 만지는 동안·패널이 열린 동안만 또렷해진다.
   * @param {boolean} active
   */
  setActiveAlpha(active) {
    if (!this.bg) return;
    const alpha = active || this.isOpen ? ALPHA_ACTIVE : ALPHA_IDLE;
    this.bg.setAlpha(alpha);
    this.icon.setAlpha(alpha);
    this.badge.setAlpha(alpha);
    this.badgeText.setAlpha(alpha);
  }

  /** 탭(패널 토글)과 드래그(위치 이동)를 구분해 바인딩한다 */
  _bindInput() {
    this.bg.on('pointerover', () => this.setActiveAlpha(true));
    this.bg.on('pointerout', () => this.setActiveAlpha(false));

    this.bg.on('pointerdown', (pointer) => {
      this._pointerDownTime = pointer.downTime;
      this._pointerDownPos = { x: pointer.x, y: pointer.y };
      this._dragged = false;
      this.setActiveAlpha(true);
    });

    this.bg.on('drag', (pointer, dragX, dragY) => {
      const start = this._pointerDownPos;
      if (start) {
        const moved = Math.hypot(pointer.x - start.x, pointer.y - start.y);
        if (moved > s(TAP_MOVE_TOLERANCE)) this._dragged = true;
      }
      if (!this._dragged) return;
      this.setPositionBase({ x: dragX / SCALE_FACTOR, y: dragY / SCALE_FACTOR });
    });

    this.bg.on('dragend', () => {
      if (this._dragged) this.basePos = saveFabPosition(this.basePos);
      this.setActiveAlpha(false);
    });

    this.bg.on('pointerup', (pointer) => {
      const elapsed = pointer.upTime - this._pointerDownTime;
      // 끌어서 옮긴 것은 탭이 아니다. 옮길 때마다 패널이 열리면 못 쓴다.
      if (this._dragged) {
        this._dragged = false;
        this.setActiveAlpha(false);
        return;
      }
      if (elapsed < 800) {
        // 짧은 탭: 패널 토글
        this.isOpen = !this.isOpen;
        if (this.onToggle) this.onToggle(this.isOpen);
        this._updateVisual();
      }
      // 패널이 열려 있으면 또렷하게 유지한다(_updateVisual 이후에 판단)
      this.setActiveAlpha(false);
    });
  }

  /**
   * base 좌표로 위치를 옮긴다(범위 밖은 잘라낸다). 저장은 하지 않는다.
   * @param {{x: number, y: number}} pos base 720×1280 기준 좌표
   */
  setPositionBase(pos) {
    if (!this.bg) return;
    this.basePos = clampFabPosition(pos);
    const x = s(this.basePos.x);
    const y = s(this.basePos.y);
    this.bg.setPosition(x, y);
    this.icon.setPosition(x, y);
    this.badge.setPosition(x + s(14), y - s(14));
    this.badgeText.setPosition(x + s(14), y - s(14));
  }

  /**
   * 팝업이 떠 있으면 FAB을 팝업 아래로 내린다.
   * `PopupBase`는 depth 2000 컨테이너를 쓰므로 그보다 높은 표시 객체가 보이는지로 판정한다.
   * NavigationManager를 참조하지 않는 이유: 그쪽은 TransitionManager → gameConfig(전 씬 import)
   * 순환에 물려 있어 디버그 컴포넌트가 끌어오면 부팅 TDZ 위험이 생긴다.
   */
  updateDepth() {
    if (!this.bg) return;
    const covered = this._isCoveredByOverlay();
    if (covered === this._coveredByPopup) return;

    this._coveredByPopup = covered;
    const base = covered ? DEPTH_UNDER_POPUP : DEPTH_NORMAL;
    this.bg.setDepth(base);
    this.icon.setDepth(base + 1);
    this.badge.setDepth(base + 2);
    this.badgeText.setDepth(base + 3);
  }

  /** 화면에 팝업급(depth ≥ 2000) 표시 객체가 있는지 */
  _isCoveredByOverlay() {
    const list = this.scene?.children?.list;
    if (!Array.isArray(list)) return false;
    return list.some((obj) => {
      if (!obj || obj === this.bg || obj === this.icon || obj === this.badge || obj === this.badgeText) {
        return false;
      }
      return obj.visible !== false && (obj.depth || 0) >= POPUP_DEPTH_THRESHOLD;
    });
  }

  updateBadge() {
    if (!this.bg) return;
    const count = this._getActiveCheatCount();
    if (count > 0) {
      this.badge.setVisible(true).setAlpha(this.bg.alpha);
      this.badgeText.setVisible(true).setAlpha(this.bg.alpha).setText(String(count));
      this.bg.setStrokeStyle(s(2), 0xEF4444);
    } else {
      this.badge.setVisible(false);
      this.badgeText.setVisible(false);
      this.bg.setStrokeStyle(s(2), 0x6366F1);
    }
  }

  _getActiveCheatCount() {
    let count = 0;
    if (DebugManager.invincible) count++;
    if (DebugManager.oneHitKill) count++;
    if (DebugManager.infiniteEnergy) count++;
    if (DebugManager.freeGachaMode) count++;
    if (DebugManager.forcePickupMode) count++;
    if (DebugManager.alwaysMoodAdvantage) count++;
    if (DebugManager.battleSpeedMultiplier > 1) count++;
    return count;
  }

  _updateVisual() {
    if (!this.bg) return;
    if (this.isOpen) {
      this.icon.setText('✕');
      this.bg.setFillStyle(0xEF4444, 0.9);
    } else {
      this.icon.setText('🐛');
      this.bg.setFillStyle(0x1a1a2e, 0.9);
    }
  }

  show() {
    this.bg?.setVisible(true);
    this.icon?.setVisible(true);
    this.updateBadge();
  }

  hide() {
    this.bg?.setVisible(false);
    this.icon?.setVisible(false);
    this.badge?.setVisible(false);
    this.badgeText?.setVisible(false);
  }

  destroy() {
    this.bg?.destroy();
    this.icon?.destroy();
    this.badge?.destroy();
    this.badgeText?.destroy();
    this.updateTimer?.destroy();
  }
}
