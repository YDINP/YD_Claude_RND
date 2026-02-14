import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

export class PopupBase {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.title = options.title || '';
    this.panelWidth = options.width || 680;
    this.panelHeight = options.height || 1100;
    this.container = null;
    this.contentContainer = null;
    this.isOpen = false;
    this.onCloseCallback = options.onClose || null;
  }

  show() {
    if (this.isOpen) return;
    this.isOpen = true;

    this.container = this.scene.add.container(0, 0).setDepth(2000);

    // Overlay
    const overlay = this.scene.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.hide());
    this.container.add(overlay);

    // Panel
    const px = GAME_WIDTH / 2;
    const py = GAME_HEIGHT / 2;
    const left = px - this.panelWidth / 2;
    const top = py - this.panelHeight / 2;

    const panel = this.scene.add.graphics();
    panel.fillStyle(0x0F172A, 0.98);
    panel.fillRoundedRect(left, top, this.panelWidth, this.panelHeight, 16);
    panel.lineStyle(2, COLORS.primary, 0.5);
    panel.strokeRoundedRect(left, top, this.panelWidth, this.panelHeight, 16);
    this.container.add(panel);

    // Panel blocker (prevent overlay close when clicking panel)
    const blocker = this.scene.add.rectangle(px, py, this.panelWidth, this.panelHeight)
      .setAlpha(0.001).setInteractive();
    this.container.add(blocker);

    // Header
    this.scene.add.text(px, top + 35, this.title, {
      fontSize: '24px', fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    this.container.add(this.container.last);

    // Close button
    const closeBtn = this.scene.add.text(left + this.panelWidth - 30, top + 20, '✕', {
      fontSize: '24px', color: '#94A3B8'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.hide());
    this.container.add(closeBtn);

    // Separator line
    const sep = this.scene.add.graphics();
    sep.lineStyle(1, COLORS.primary, 0.3);
    sep.lineBetween(left + 20, top + 60, left + this.panelWidth - 20, top + 60);
    this.container.add(sep);

    // Content area
    this.contentContainer = this.scene.add.container(0, 0);
    this.container.add(this.contentContainer);

    // Content area bounds for subclasses
    this.contentBounds = {
      left: left + 15,
      top: top + 70,
      right: left + this.panelWidth - 15,
      bottom: top + this.panelHeight - 15,
      width: this.panelWidth - 30,
      height: this.panelHeight - 85,
      centerX: px
    };

    // Build content (override in subclasses)
    this.buildContent();

    // Entrance animation
    this.container.setAlpha(0);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });
  }

  buildContent() {
    // Override in subclasses
  }

  hide() {
    if (!this.isOpen) return;
    this.isOpen = false; // 즉시 플래그 해제 → 중복 호출 방지

    if (!this.container || !this.scene?.tweens) {
      this.destroy();
      return;
    }

    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 150,
      ease: 'Power2',
      onComplete: () => {
        this.destroy();
      }
    });
  }

  destroy() {
    this.isOpen = false;
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }
    this.contentContainer = null;
    if (this.onCloseCallback) this.onCloseCallback();
  }

  // Helper: add text to content
  addText(x, y, text, style = {}) {
    const t = this.scene.add.text(x, y, text, {
      fontSize: '16px',
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF',
      ...style
    });
    this.contentContainer.add(t);
    return t;
  }

  // Helper: add button
  addButton(x, y, width, height, label, color, callback) {
    const bg = this.scene.add.rectangle(x, y, width, height, color, 1);
    bg.setStrokeStyle(1, 0xFFFFFF, 0.2);
    bg.setInteractive({ useHandCursor: true });

    const text = this.scene.add.text(x, y, label, {
      fontSize: '16px', fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    bg.on('pointerdown', callback);
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));

    this.contentContainer.add([bg, text]);
    return { bg, text };
  }
}
