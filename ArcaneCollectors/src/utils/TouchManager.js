/**
 * TouchManager.js - 모바일 터치 제스처 관리
 * H-8: Responsive & Mobile Touch UX
 *
 * 지원 제스처:
 * - swipe (left/right/up/down)
 * - longpress (500ms 홀드)
 * - doubletap (300ms 이내 2회 탭)
 *
 * 사용법:
 *   import { TouchManager } from '../utils/TouchManager.js';
 *   const touch = new TouchManager(this); // this = Phaser.Scene
 *   touch.on('swipeleft', (data) => { ... });
 *   touch.on('longpress', (data) => { ... });
 */

export class TouchManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.swipeThreshold = options.swipeThreshold ?? 50;
    this.swipeTimeLimit = options.swipeTimeLimit ?? 300;
    this.longPressTime = options.longPressTime ?? 500;
    this.doubleTapTime = options.doubleTapTime ?? 300;

    this._startX = 0;
    this._startY = 0;
    this._startTime = 0;
    this._longPressTimer = null;
    this._lastTapTime = 0;
    this._callbacks = {};
    this._enabled = true;

    this._setupListeners();
  }

  _setupListeners() {
    this.scene.input.on('pointerdown', this._onPointerDown, this);
    this.scene.input.on('pointerup', this._onPointerUp, this);
    this.scene.input.on('pointermove', this._onPointerMove, this);

    // Cleanup on scene shutdown
    this.scene.events.once('shutdown', () => this.destroy());
  }

  _onPointerDown(pointer) {
    if (!this._enabled) return;

    this._startX = pointer.x;
    this._startY = pointer.y;
    this._startTime = Date.now();
    this._isSwiping = false;

    // Start long-press timer
    this._longPressTimer = this.scene.time.delayedCall(this.longPressTime, () => {
      this._emit('longpress', {
        x: pointer.x,
        y: pointer.y,
        worldX: pointer.worldX,
        worldY: pointer.worldY
      });
      this._longPressTimer = null;
    });
  }

  _onPointerMove(pointer) {
    if (!this._enabled || !pointer.isDown) return;

    const dx = pointer.x - this._startX;
    const dy = pointer.y - this._startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Cancel long-press if finger moved too far
    if (dist > 15 && this._longPressTimer) {
      this._longPressTimer.remove();
      this._longPressTimer = null;
    }
  }

  _onPointerUp(pointer) {
    if (!this._enabled) return;

    // Cancel long-press
    if (this._longPressTimer) {
      this._longPressTimer.remove();
      this._longPressTimer = null;
    }

    const dx = pointer.x - this._startX;
    const dy = pointer.y - this._startY;
    const elapsed = Date.now() - this._startTime;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Swipe detection
    if (dist >= this.swipeThreshold && elapsed <= this.swipeTimeLimit) {
      const data = {
        direction: '',
        distance: dist,
        duration: elapsed,
        startX: this._startX,
        startY: this._startY,
        endX: pointer.x,
        endY: pointer.y
      };

      if (absDx > absDy) {
        data.direction = dx > 0 ? 'right' : 'left';
      } else {
        data.direction = dy > 0 ? 'down' : 'up';
      }

      this._emit('swipe', data);
      this._emit(`swipe${data.direction}`, data);
      return;
    }

    // Double-tap detection (only for short taps)
    if (dist < 15 && elapsed < 200) {
      const now = Date.now();
      if (now - this._lastTapTime < this.doubleTapTime) {
        this._emit('doubletap', {
          x: pointer.x,
          y: pointer.y,
          worldX: pointer.worldX,
          worldY: pointer.worldY
        });
        this._lastTapTime = 0;
      } else {
        this._lastTapTime = now;
      }
    }
  }

  /**
   * Register gesture callback
   * @param {string} event - 'swipe'|'swipeleft'|'swiperight'|'swipeup'|'swipedown'|'longpress'|'doubletap'
   * @param {Function} callback
   */
  on(event, callback) {
    if (!this._callbacks[event]) {
      this._callbacks[event] = [];
    }
    this._callbacks[event].push(callback);
    return this;
  }

  off(event, callback) {
    if (!this._callbacks[event]) return this;
    if (callback) {
      this._callbacks[event] = this._callbacks[event].filter(cb => cb !== callback);
    } else {
      delete this._callbacks[event];
    }
    return this;
  }

  _emit(event, data) {
    const cbs = this._callbacks[event];
    if (cbs) {
      cbs.forEach(cb => cb(data));
    }
  }

  enable() { this._enabled = true; }
  disable() { this._enabled = false; }

  destroy() {
    if (this.scene && this.scene.input) {
      this.scene.input.off('pointerdown', this._onPointerDown, this);
      this.scene.input.off('pointerup', this._onPointerUp, this);
      this.scene.input.off('pointermove', this._onPointerMove, this);
    }
    if (this._longPressTimer) {
      this._longPressTimer.remove();
      this._longPressTimer = null;
    }
    this._callbacks = {};
  }
}

/**
 * 디바이스 타입 감지 유틸리티
 */
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

/**
 * 터치 영역 최소 사이즈 보장 유틸리티 (44px 기준)
 * @param {number} size - 원본 사이즈
 * @returns {number} 최소 44px 이상 보장된 사이즈
 */
export function ensureTouchSize(size) {
  return Math.max(size, 44);
}

export default TouchManager;
