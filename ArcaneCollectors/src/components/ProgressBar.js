import Phaser from 'phaser';
import { COLORS } from '../config/gameConfig.js';

export class ProgressBar extends Phaser.GameObjects.Container {
  /**
   * Generic progress bar component
   * @param {Phaser.Scene} scene - The scene this bar belongs to
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Bar width
   * @param {number} height - Bar height
   * @param {Object} options - Configuration options
   */
  constructor(scene, x, y, width, height, options = {}) {
    super(scene, x, y);

    this.barWidth = width;
    this.barHeight = height;
    this.options = {
      backgroundColor: options.backgroundColor ?? 0x1E293B,
      fillColor: options.fillColor ?? COLORS.primary,
      borderColor: options.borderColor ?? null,
      borderWidth: options.borderWidth ?? 0,
      cornerRadius: options.cornerRadius ?? height / 2,
      showText: options.showText ?? false,
      textFormat: options.textFormat ?? 'percent', // 'percent', 'value', 'both'
      maxValue: options.maxValue ?? 100,
      animationDuration: options.animationDuration ?? 300
    };

    this.currentProgress = 0;
    this.currentValue = 0;

    this.createBackground();
    this.createFill();
    if (this.options.showText) {
      this.createText();
    }

    scene.add.existing(this);
  }

  createBackground() {
    this.background = this.scene.add.graphics();

    // Background track
    this.background.fillStyle(this.options.backgroundColor, 1);
    this.background.fillRoundedRect(
      -this.barWidth / 2,
      -this.barHeight / 2,
      this.barWidth,
      this.barHeight,
      this.options.cornerRadius
    );

    // Optional border
    if (this.options.borderColor !== null) {
      this.background.lineStyle(this.options.borderWidth, this.options.borderColor, 1);
      this.background.strokeRoundedRect(
        -this.barWidth / 2,
        -this.barHeight / 2,
        this.barWidth,
        this.barHeight,
        this.options.cornerRadius
      );
    }

    this.add(this.background);
  }

  createFill() {
    this.fill = this.scene.add.graphics();
    this.add(this.fill);
  }

  drawFill(progress) {
    this.fill.clear();

    if (progress <= 0) return;

    const fillWidth = Math.max(this.barWidth * Math.min(progress, 1), this.options.cornerRadius * 2);

    // Fill bar
    this.fill.fillStyle(this.options.fillColor, 1);
    this.fill.fillRoundedRect(
      -this.barWidth / 2,
      -this.barHeight / 2,
      fillWidth,
      this.barHeight,
      this.options.cornerRadius
    );

    // Shine effect
    this.fill.fillStyle(0xffffff, 0.2);
    this.fill.fillRoundedRect(
      -this.barWidth / 2,
      -this.barHeight / 2,
      fillWidth,
      this.barHeight / 3,
      { tl: this.options.cornerRadius, tr: this.options.cornerRadius, bl: 0, br: 0 }
    );
  }

  createText() {
    this.valueText = this.scene.add.text(0, 0, '0%', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: `${Math.max(this.barHeight - 4, 10)}px`,
      fontStyle: 'bold',
      color: '#FFFFFF',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add(this.valueText);
  }

  updateText() {
    if (!this.options.showText || !this.valueText) return;

    let text;
    switch (this.options.textFormat) {
      case 'value':
        text = `${Math.round(this.currentValue)}/${this.options.maxValue}`;
        break;
      case 'both':
        text = `${Math.round(this.currentValue)}/${this.options.maxValue} (${Math.round(this.currentProgress * 100)}%)`;
        break;
      case 'percent':
      default:
        text = `${Math.round(this.currentProgress * 100)}%`;
        break;
    }

    this.valueText.setText(text);
  }

  /**
   * Set progress (0 to 1)
   * @param {number} progress - Progress value between 0 and 1
   * @param {boolean} animate - Whether to animate the change
   */
  setProgress(progress, animate = true) {
    const targetProgress = Math.max(0, Math.min(progress, 1));

    if (animate && this.options.animationDuration > 0) {
      // Animate progress
      const startProgress = this.currentProgress;
      const startValue = this.currentValue;
      const targetValue = targetProgress * this.options.maxValue;

      this.scene.tweens.add({
        targets: this,
        currentProgress: targetProgress,
        currentValue: targetValue,
        duration: this.options.animationDuration,
        ease: 'Power2',
        onUpdate: () => {
          this.drawFill(this.currentProgress);
          this.updateText();
        }
      });
    } else {
      this.currentProgress = targetProgress;
      this.currentValue = targetProgress * this.options.maxValue;
      this.drawFill(targetProgress);
      this.updateText();
    }

    return this;
  }

  /**
   * Set value (auto-calculates progress)
   * @param {number} value - Current value
   * @param {number} maxValue - Optional new max value
   * @param {boolean} animate - Whether to animate the change
   */
  setValue(value, maxValue = null, animate = true) {
    if (maxValue !== null) {
      this.options.maxValue = maxValue;
    }

    const progress = this.options.maxValue > 0 ? value / this.options.maxValue : 0;
    this.currentValue = value;
    return this.setProgress(progress, animate);
  }

  /**
   * Set fill color
   * @param {number} color - New fill color
   */
  setFillColor(color) {
    this.options.fillColor = color;
    this.drawFill(this.currentProgress);
    return this;
  }

  /**
   * Get current progress (0 to 1)
   * @returns {number} Current progress
   */
  getProgress() {
    return this.currentProgress;
  }

  /**
   * Get current value
   * @returns {number} Current value
   */
  getValue() {
    return this.currentValue;
  }
}
