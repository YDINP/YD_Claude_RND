/**
 * TouchManager.ts - 모바일 터치 제스처 관리
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

export interface TouchManagerOptions {
  swipeThreshold?: number;
  swipeTimeLimit?: number;
  longPressTime?: number;
  doubleTapTime?: number;
}

export interface SwipeData {
  direction: string;
  distance: number;
  duration: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface TapData {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
}

export type GestureEvent = 'swipe' | 'swipeleft' | 'swiperight' | 'swipeup' | 'swipedown' | 'longpress' | 'doubletap';
export type GestureCallback = (data: SwipeData | TapData) => void;

export class TouchManager {
  private scene: Phaser.Scene;
  private swipeThreshold: number;
  private swipeTimeLimit: number;
  private longPressTime: number;
  private doubleTapTime: number;

  private _startX: number = 0;
  private _startY: number = 0;
  private _startTime: number = 0;
  private _longPressTimer: Phaser.Time.TimerEvent | null = null;
  private _lastTapTime: number = 0;
  private _callbacks: Record<string, GestureCallback[]> = {};
  private _enabled: boolean = true;
  private _isSwiping: boolean = false;

  constructor(scene: Phaser.Scene, options: TouchManagerOptions = {}) {
    this.scene = scene;
    this.swipeThreshold = options.swipeThreshold ?? 50;
    this.swipeTimeLimit = options.swipeTimeLimit ?? 300;
    this.longPressTime = options.longPressTime ?? 500;
    this.doubleTapTime = options.doubleTapTime ?? 300;

    this._setupListeners();
  }

  private _setupListeners(): void {
    this.scene.input.on('pointerdown', this._onPointerDown, this);
    this.scene.input.on('pointerup', this._onPointerUp, this);
    this.scene.input.on('pointermove', this._onPointerMove, this);

    // Cleanup on scene shutdown
    this.scene.events.once('shutdown', () => this.destroy());
  }

  private _onPointerDown(pointer: Phaser.Input.Pointer): void {
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

  private _onPointerMove(pointer: Phaser.Input.Pointer): void {
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

  private _onPointerUp(pointer: Phaser.Input.Pointer): void {
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
      const data: SwipeData = {
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
      this._emit(`swipe${data.direction}` as GestureEvent, data);
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
   * @param event - 'swipe'|'swipeleft'|'swiperight'|'swipeup'|'swipedown'|'longpress'|'doubletap'
   * @param callback
   */
  on(event: GestureEvent, callback: GestureCallback): this {
    if (!this._callbacks[event]) {
      this._callbacks[event] = [];
    }
    this._callbacks[event].push(callback);
    return this;
  }

  off(event: GestureEvent, callback?: GestureCallback): this {
    if (!this._callbacks[event]) return this;
    if (callback) {
      this._callbacks[event] = this._callbacks[event].filter(cb => cb !== callback);
    } else {
      delete this._callbacks[event];
    }
    return this;
  }

  private _emit(event: string, data: SwipeData | TapData): void {
    const cbs = this._callbacks[event];
    if (cbs) {
      cbs.forEach(cb => cb(data));
    }
  }

  enable(): void { this._enabled = true; }
  disable(): void { this._enabled = false; }

  destroy(): void {
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
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

/**
 * 터치 영역 최소 사이즈 보장 유틸리티 (44px 기준)
 * @param size - 원본 사이즈
 * @returns 최소 44px 이상 보장된 사이즈
 */
export function ensureTouchSize(size: number): number {
  return Math.max(size, 44);
}

export default TouchManager;
