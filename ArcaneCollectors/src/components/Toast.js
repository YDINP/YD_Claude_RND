import Phaser from 'phaser';
import { COLORS, GAME_WIDTH } from '../config/gameConfig.js';

/**
 * Toast notification system
 * Static class for showing temporary notification messages
 */
export class Toast {
  static activeToasts = [];
  static toastHeight = 40;
  static toastSpacing = 10;
  static startY = 70; // Below top bar

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
    super(scene, GAME_WIDTH / 2, -50);

    this.message = message;
    this.type = type;
    this.duration = duration;

    this.createBackground();
    this.createIcon();
    this.createText();
    this.animate();

    this.setDepth(2000);
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
    const width = GAME_WIDTH - 40;
    const height = Toast.toastHeight;
    const color = this.getTypeColor();

    this.background = this.scene.add.graphics();

    // Shadow
    this.background.fillStyle(0x000000, 0.3);
    this.background.fillRoundedRect(-width / 2 + 2, -height / 2 + 2, width, height, 8);

    // Main background
    this.background.fillStyle(COLORS.backgroundLight, 0.95);
    this.background.fillRoundedRect(-width / 2, -height / 2, width, height, 8);

    // Left color stripe
    this.background.fillStyle(color, 1);
    this.background.fillRoundedRect(-width / 2, -height / 2, 6, height, { tl: 8, tr: 0, bl: 8, br: 0 });

    this.add(this.background);
  }

  createIcon() {
    const iconX = -GAME_WIDTH / 2 + 40;
    const iconSize = 20;
    const color = this.getTypeColor();

    this.icon = this.scene.add.graphics();

    switch (this.type) {
      case 'success':
        // Checkmark
        this.icon.lineStyle(3, color, 1);
        this.icon.beginPath();
        this.icon.moveTo(iconX - 6, 0);
        this.icon.lineTo(iconX - 2, 5);
        this.icon.lineTo(iconX + 7, -5);
        this.icon.strokePath();
        break;

      case 'error':
        // X mark
        this.icon.lineStyle(3, color, 1);
        this.icon.lineBetween(iconX - 5, -5, iconX + 5, 5);
        this.icon.lineBetween(iconX + 5, -5, iconX - 5, 5);
        break;

      case 'info':
      default:
        // Info circle with i
        this.icon.lineStyle(2, color, 1);
        this.icon.strokeCircle(iconX, 0, 8);
        this.icon.fillStyle(color, 1);
        this.icon.fillCircle(iconX, -4, 2);
        this.icon.fillRect(iconX - 1, -1, 2, 7);
        break;
    }

    this.add(this.icon);
  }

  createText() {
    const textX = -GAME_WIDTH / 2 + 65;

    this.text = this.scene.add.text(textX, 0, this.message, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '14px',
      color: '#FFFFFF',
      wordWrap: { width: GAME_WIDTH - 120 }
    }).setOrigin(0, 0.5);

    this.add(this.text);
  }

  setY(y) {
    this.targetY = y;
    return this;
  }

  animate() {
    // Slide in from top with bounce
    this.setScale(0.9);
    this.scene.tweens.add({
      targets: this,
      y: this.targetY || Toast.startY,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut'
    });

    // Auto-hide after duration
    this.scene.time.delayedCall(this.duration, () => {
      this.hide();
    });
  }

  hide() {
    // Slide out to the right with fade
    this.scene.tweens.add({
      targets: this,
      x: GAME_WIDTH + 200,
      alpha: 0,
      scaleX: 0.8,
      scaleY: 0.8,
      duration: 300,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.emit('hidden');
        this.destroy();
      }
    });
  }
}
