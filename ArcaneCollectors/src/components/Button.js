import Phaser from 'phaser';
import { COLORS } from '../config/gameConfig.js';
import { DESIGN } from '../config/designSystem.js';

export class Button extends Phaser.GameObjects.Container {
  /**
   * Gradient button with hover/click states
   * @param {Phaser.Scene} scene - The scene this button belongs to
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Button width
   * @param {number} height - Button height
   * @param {string} text - Button label text
   * @param {Object} options - Configuration options
   */
  constructor(scene, x, y, width, height, text, options = {}) {
    super(scene, x, y);

    this.buttonWidth = width;
    this.buttonHeight = height;
    this.options = {
      color: options.color ?? COLORS.primary,
      hoverColor: options.hoverColor ?? COLORS.secondary,
      onClick: options.onClick ?? null,
      fontSize: options.fontSize ?? 18,
      cornerRadius: options.cornerRadius ?? 8,
      disabled: options.disabled ?? false,
      style: options.style ?? 'primary' // 'primary', 'secondary', 'danger', 'success'
    };

    // Style-based color mapping
    if (this.options.style === 'secondary') {
      this.options.color = COLORS.secondary;
      this.options.hoverColor = COLORS.primary;
    } else if (this.options.style === 'danger') {
      this.options.color = COLORS.danger;
      this.options.hoverColor = Phaser.Display.Color.ValueToColor(COLORS.danger).lighten(20).color;
    } else if (this.options.style === 'success') {
      this.options.color = COLORS.success;
      this.options.hoverColor = Phaser.Display.Color.ValueToColor(COLORS.success).lighten(20).color;
    }

    this.isEnabled = !this.options.disabled;
    this.isHovered = false;
    this.isPressed = false;

    this.createBackground();
    this.createGlow();
    this.createText(text);
    this.setupInteraction();

    scene.add.existing(this);
  }

  createBackground() {
    this.background = this.scene.add.graphics();
    this.drawBackground(this.options.color);
    this.add(this.background);
  }

  drawBackground(color, isPressed = false) {
    this.background.clear();

    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const r = this.options.cornerRadius;

    // Create gradient effect - lighter top, darker bottom
    const lighterColor = Phaser.Display.Color.ValueToColor(color);
    lighterColor.lighten(20);
    const darkerColor = Phaser.Display.Color.ValueToColor(color);
    darkerColor.darken(20);

    // Draw shadow
    if (!isPressed) {
      this.background.fillStyle(0x000000, 0.3);
      this.background.fillRoundedRect(-w/2 + 2, -h/2 + 4, w, h, r);
    }

    // Draw main button body
    this.background.fillStyle(darkerColor.color, 1);
    this.background.fillRoundedRect(-w/2, -h/2, w, h, r);

    // Draw lighter top portion for gradient effect
    this.background.fillStyle(lighterColor.color, 1);
    this.background.fillRoundedRect(-w/2, -h/2, w, h * 0.5, { tl: r, tr: r, bl: 0, br: 0 });

    // Draw border
    this.background.lineStyle(2, 0xffffff, 0.2);
    this.background.strokeRoundedRect(-w/2, -h/2, w, h, r);
  }

  createGlow() {
    this.glow = this.scene.add.graphics();
    this.glow.setAlpha(0);
    this.add(this.glow);
    this.sendToBack(this.glow);

    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const r = this.options.cornerRadius;

    // Draw glow effect
    this.glow.fillStyle(this.options.hoverColor, 0.4);
    this.glow.fillRoundedRect(-w/2 - 4, -h/2 - 4, w + 8, h + 8, r + 4);
  }

  createText(text) {
    this.label = this.scene.add.text(0, 0, text, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: `${this.options.fontSize}px`,
      fontStyle: 'bold',
      color: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 1
    }).setOrigin(0.5);
    this.add(this.label);
  }

  setupInteraction() {
    // 최소 터치 영역 44x44px 보장
    const minTouch = DESIGN.touch.minSize;
    const hitW = Math.max(this.buttonWidth, minTouch);
    const hitH = Math.max(this.buttonHeight, minTouch);

    const hitArea = new Phaser.Geom.Rectangle(
      -hitW / 2,
      -hitH / 2,
      hitW,
      hitH
    );

    this.setSize(hitW, hitH);
    this.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    this.on('pointerover', this.onPointerOver, this);
    this.on('pointerout', this.onPointerOut, this);
    this.on('pointerdown', this.onPointerDown, this);
    this.on('pointerup', this.onPointerUp, this);
  }

  onPointerOver() {
    if (!this.isEnabled) return;
    this.isHovered = true;
    this.drawBackground(this.options.hoverColor);

    // Show glow
    this.scene.tweens.add({
      targets: this.glow,
      alpha: 1,
      duration: 150,
      ease: 'Power2'
    });
  }

  onPointerOut() {
    if (!this.isEnabled) return;
    this.isHovered = false;
    this.isPressed = false;
    this.setScale(1);
    this.drawBackground(this.options.color);

    // Hide glow
    this.scene.tweens.add({
      targets: this.glow,
      alpha: 0,
      duration: 150,
      ease: 'Power2'
    });
  }

  onPointerDown() {
    if (!this.isEnabled) return;
    this.isPressed = true;

    // Scale down effect
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.95,
      scaleY: 0.95,
      duration: 50,
      ease: 'Power2'
    });

    this.drawBackground(this.options.hoverColor, true);
  }

  onPointerUp() {
    if (!this.isEnabled) return;

    // Scale back
    this.scene.tweens.add({
      targets: this,
      scaleX: 1,
      scaleY: 1,
      duration: 100,
      ease: 'Back.easeOut'
    });

    if (this.isPressed && this.options.onClick) {
      this.options.onClick();
    }

    this.isPressed = false;
    this.drawBackground(this.isHovered ? this.options.hoverColor : this.options.color);
  }

  /**
   * Enable or disable the button
   * @param {boolean} enabled - Whether the button should be enabled
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;

    if (!enabled) {
      this.setAlpha(0.5);
      this.glow.setAlpha(0);
      this.drawBackground(COLORS.textDark);
    } else {
      this.setAlpha(1);
      this.drawBackground(this.options.color);
    }

    return this;
  }

  /**
   * Update button text
   * @param {string} text - New button text
   */
  setText(text) {
    this.label.setText(text);
    return this;
  }

  /**
   * Update onClick callback
   * @param {Function} callback - New callback function
   */
  setOnClick(callback) {
    this.options.onClick = callback;
    return this;
  }
}
