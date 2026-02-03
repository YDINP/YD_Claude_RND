import Phaser from 'phaser';
import { COLORS } from '../config/gameConfig.js';

export class StatBar extends Phaser.GameObjects.Container {
  /**
   * Character stat display (HP bar, skill gauge, etc.)
   * @param {Phaser.Scene} scene - The scene this stat bar belongs to
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Total width of the stat bar
   * @param {Object} options - Configuration options
   */
  constructor(scene, x, y, width, options = {}) {
    super(scene, x, y);

    this.totalWidth = width;
    this.options = {
      label: options.label ?? '',
      maxValue: options.maxValue ?? 100,
      currentValue: options.currentValue ?? 100,
      color: options.color ?? COLORS.success,
      backgroundColor: options.backgroundColor ?? COLORS.backgroundLight,
      height: options.height ?? 16,
      labelWidth: options.labelWidth ?? 40,
      valueWidth: options.valueWidth ?? 60,
      showValue: options.showValue ?? true,
      animationDuration: options.animationDuration ?? 300
    };

    this.currentValue = this.options.currentValue;
    this.maxValue = this.options.maxValue;

    this.createLabel();
    this.createBar();
    if (this.options.showValue) {
      this.createValueText();
    }

    scene.add.existing(this);
  }

  createLabel() {
    if (!this.options.label) return;

    const labelX = -this.totalWidth / 2;

    this.labelText = this.scene.add.text(labelX, 0, this.options.label, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '12px',
      color: '#94A3B8'
    }).setOrigin(0, 0.5);

    this.add(this.labelText);
  }

  createBar() {
    const barStartX = -this.totalWidth / 2 + this.options.labelWidth;
    const barWidth = this.totalWidth - this.options.labelWidth - (this.options.showValue ? this.options.valueWidth : 0);
    const barHeight = this.options.height;

    this.barWidth = barWidth;
    this.barStartX = barStartX;

    // Background track
    this.barBackground = this.scene.add.graphics();
    this.barBackground.fillStyle(this.options.backgroundColor, 1);
    this.barBackground.fillRoundedRect(barStartX, -barHeight / 2, barWidth, barHeight, barHeight / 2);

    this.add(this.barBackground);

    // Fill bar
    this.barFill = this.scene.add.graphics();
    this.drawFill();
    this.add(this.barFill);
  }

  drawFill() {
    this.barFill.clear();

    const progress = this.maxValue > 0 ? this.currentValue / this.maxValue : 0;
    if (progress <= 0) return;

    const barHeight = this.options.height;
    const fillWidth = Math.max(this.barWidth * Math.min(progress, 1), barHeight);

    // Main fill
    this.barFill.fillStyle(this.options.color, 1);
    this.barFill.fillRoundedRect(this.barStartX, -barHeight / 2, fillWidth, barHeight, barHeight / 2);

    // Shine effect
    this.barFill.fillStyle(0xffffff, 0.25);
    this.barFill.fillRoundedRect(
      this.barStartX,
      -barHeight / 2,
      fillWidth,
      barHeight / 3,
      { tl: barHeight / 2, tr: barHeight / 2, bl: 0, br: 0 }
    );
  }

  createValueText() {
    const valueX = this.totalWidth / 2;

    this.valueText = this.scene.add.text(valueX, 0, `${this.currentValue}/${this.maxValue}`, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(1, 0.5);

    this.add(this.valueText);
  }

  updateValueText() {
    if (this.valueText) {
      this.valueText.setText(`${Math.round(this.currentValue)}/${Math.round(this.maxValue)}`);
    }
  }

  /**
   * Update the stat value
   * @param {number} current - Current value
   * @param {number} max - Optional new max value
   * @param {boolean} animate - Whether to animate the change
   */
  updateValue(current, max = null, animate = true) {
    if (max !== null) {
      this.maxValue = max;
    }

    const targetValue = Math.max(0, Math.min(current, this.maxValue));

    if (animate && this.options.animationDuration > 0) {
      this.scene.tweens.add({
        targets: this,
        currentValue: targetValue,
        duration: this.options.animationDuration,
        ease: 'Power2',
        onUpdate: () => {
          this.drawFill();
          this.updateValueText();
        }
      });
    } else {
      this.currentValue = targetValue;
      this.drawFill();
      this.updateValueText();
    }

    return this;
  }

  /**
   * Set the bar color
   * @param {number} color - New color
   */
  setColor(color) {
    this.options.color = color;
    this.drawFill();
    return this;
  }

  /**
   * Set the label text
   * @param {string} label - New label
   */
  setLabel(label) {
    if (this.labelText) {
      this.labelText.setText(label);
    }
    return this;
  }

  /**
   * Get current value
   * @returns {number}
   */
  getValue() {
    return this.currentValue;
  }

  /**
   * Get max value
   * @returns {number}
   */
  getMaxValue() {
    return this.maxValue;
  }

  /**
   * Get progress (0 to 1)
   * @returns {number}
   */
  getProgress() {
    return this.maxValue > 0 ? this.currentValue / this.maxValue : 0;
  }

  /**
   * Flash effect when value changes significantly
   */
  flash() {
    this.scene.tweens.add({
      targets: this.barFill,
      alpha: 0.5,
      duration: 100,
      yoyo: true,
      repeat: 2,
      ease: 'Power2'
    });

    return this;
  }
}
