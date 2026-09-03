import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, s, sf } from '../config/gameConfig.js';
import { Z_INDEX } from '../config/layoutConfig.js';

/**
 * Toast notification system
 * Static class for showing temporary notification messages
 */
export class Toast {
  static activeToasts = [];

  // 아래 세 값은 static getter다.
  // static 필드로 두면 클래스 정의 시점(= 모듈 초기화)에 s()가 실행되는데,
  // s()는 scaleConfig의 SCALE_FACTOR(const)를 읽는다.
  // gameConfig.js가 씬들을 먼저 import하고 scaleConfig를 나중에 가져오므로,
  // 씬 그래프에 속한 모듈이 모듈 초기화 시점에 s()를 부르면 TDZ로 부팅이 실패한다.
  /** @returns {number} 토스트 높이 */
  static get toastHeight() { return s(40); }
  /** @returns {number} 토스트 간격 */
  static get toastSpacing() { return s(10); }
  /** @returns {number} 첫 토스트 Y 좌표 (상단바 아래) */
  static get startY() { return s(70); }

  /**
   * Show a toast notification
   * @param {Phaser.Scene} scene - The scene to show toast in
   * @param {string} message - Message to display
   * @param {string} type - Toast type: 'success', 'error', 'info'
   * @param {number} duration - Duration in ms (default 2000)
   */
  static show(scene, message, type = 'info', duration = 2000) {
    const toast = new ToastInstance(scene, message, type, duration);

    // Calculate Y position based on active toasts
    const y = Toast.startY + Toast.activeToasts.length * (Toast.toastHeight + Toast.toastSpacing);
    toast.setY(y);

    Toast.activeToasts.push(toast);

    // Remove from active list when hidden
    toast.once('hidden', () => {
      const index = Toast.activeToasts.indexOf(toast);
      if (index > -1) {
        Toast.activeToasts.splice(index, 1);
        // Reposition remaining toasts
        Toast.repositionToasts(scene);
      }
    });

    return toast;
  }

  /**
   * Show success toast
   */
  static success(scene, message, duration = 2000) {
    return Toast.show(scene, message, 'success', duration);
  }

  /**
   * Show error toast
   */
  static error(scene, message, duration = 3000) {
    return Toast.show(scene, message, 'error', duration);
  }

  /**
   * Show info toast
   */
  static info(scene, message, duration = 2000) {
    return Toast.show(scene, message, 'info', duration);
  }

  /**
   * Clear all active toasts
   */
  static clearAll(scene) {
    Toast.activeToasts.forEach(toast => toast.hide());
    Toast.activeToasts = [];
  }

  /**
   * Reposition toasts after one is removed
   */
  static repositionToasts(scene) {
    Toast.activeToasts.forEach((toast, index) => {
      const targetY = Toast.startY + index * (Toast.toastHeight + Toast.toastSpacing);
      scene.tweens.add({
        targets: toast,
        y: targetY,
        duration: 200,
        ease: 'Power2'
      });
    });
  }
}

/**
 * Individual toast instance
 */
class ToastInstance extends Phaser.GameObjects.Container {
  constructor(scene, message, type, duration) {
    super(scene, GAME_WIDTH / 2, s(-50));

    this.message = message;
    this.type = type;
    this.duration = duration;

    this.createBackground();
    this.createIcon();
    this.createText();
    this.animate();

    // 팝업(POPUP_BASE 2000)보다 낮다. 2000 으로 두면 팝업과 같은 층에 놓여
    // 영웅 상세 같은 팝업 위로 토스트가 뚫고 나온다.
    this.setDepth(Z_INDEX.TOAST);
    scene.add.existing(this);
  }

  getTypeColor() {
    switch (this.type) {
      case 'success':
        return COLORS.success;
      case 'error':
        return COLORS.danger;
      case 'info':
      default:
        return COLORS.primary;
    }
  }

  createBackground() {
    const width = GAME_WIDTH - s(40);
    const height = Toast.toastHeight;
    const color = this.getTypeColor();

    this.background = this.scene.add.graphics();

    // Shadow
    this.background.fillStyle(0x000000, 0.3);
    this.background.fillRoundedRect(-width / 2 + s(2), -height / 2 + s(2), width, height, s(8));

    // Main background
    this.background.fillStyle(COLORS.backgroundLight, 0.95);
    this.background.fillRoundedRect(-width / 2, -height / 2, width, height, s(8));

    // Left color stripe
    this.background.fillStyle(color, 1);
    this.background.fillRoundedRect(-width / 2, -height / 2, s(6), height, { tl: s(8), tr: 0, bl: s(8), br: 0 });

    this.add(this.background);
  }

  createIcon() {
    const iconX = -GAME_WIDTH / 2 + s(40);
    const iconSize = s(20);
    const color = this.getTypeColor();

    this.icon = this.scene.add.graphics();

    switch (this.type) {
      case 'success':
        // Checkmark
        this.icon.lineStyle(s(3), color, 1);
        this.icon.beginPath();
        this.icon.moveTo(iconX - s(6), 0);
        this.icon.lineTo(iconX - s(2), s(5));
        this.icon.lineTo(iconX + s(7), s(-5));
        this.icon.strokePath();
        break;

      case 'error':
        // X mark
        this.icon.lineStyle(s(3), color, 1);
        this.icon.lineBetween(iconX - s(5), s(-5), iconX + s(5), s(5));
        this.icon.lineBetween(iconX + s(5), s(-5), iconX - s(5), s(5));
        break;

      case 'info':
      default:
        // Info circle with i
        this.icon.lineStyle(s(2), color, 1);
        this.icon.strokeCircle(iconX, 0, s(8));
        this.icon.fillStyle(color, 1);
        this.icon.fillCircle(iconX, s(-4), s(2));
        this.icon.fillRect(iconX - s(1), s(-1), s(2), s(7));
        break;
    }

    this.add(this.icon);
  }

  createText() {
    const textX = -GAME_WIDTH / 2 + s(65);

    this.text = this.scene.add.text(textX, 0, this.message, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: sf(14),
      color: '#FFFFFF',
      wordWrap: { width: GAME_WIDTH - s(120) }
    }).setOrigin(0, 0.5);

    this.add(this.text);
  }

  setY(y) {
    this.targetY = y;
    return this;
  }

  animate() {
    // PRD VFX-4.6: Slide up from below target + fade in (200ms)
    const targetY = this.targetY || Toast.startY;
    this.y = targetY + s(50); // Start 50px below target
    this.setAlpha(0);

    this.scene.tweens.add({
      targets: this,
      y: targetY,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });

    // Auto-hide after duration
    this.scene.time.delayedCall(this.duration, () => {
      this.hide();
    });
  }

  hide() {
    if (this._hiding) return;
    this._hiding = true;

    // PRD VFX-4.6: Slide up + fade out (200ms)
    this.scene.tweens.add({
      targets: this,
      y: this.y - s(20),
      alpha: 0,
      duration: 200,
      ease: 'Power2',
      onComplete: () => {
        this.emit('hidden');
        this.destroy();
      }
    });
  }
}
