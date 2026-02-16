import Phaser from 'phaser';
import { COLORS, s } from '../config/gameConfig.js';

export class StarRating extends Phaser.GameObjects.Container {
  /**
   * Star display for rarity rating
   * @param {Phaser.Scene} scene - The scene this rating belongs to
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} count - Number of filled stars
   * @param {number} maxStars - Maximum number of stars (default 5)
   * @param {Object} options - Configuration options
   */
  constructor(scene, x, y, count, maxStars = 5, options = {}) {
    super(scene, x, y);

    this.filledCount = count;
    this.maxStars = maxStars;
    this.options = {
      starSize: options.starSize ?? s(12),
      spacing: options.spacing ?? s(2),
      filledColor: options.filledColor ?? COLORS.accent,
      emptyColor: options.emptyColor ?? 0x4B5563,
      outlineColor: options.outlineColor ?? null
    };

    this.stars = [];
    this.createStars();

    scene.add.existing(this);
  }

  createStars() {
    const { starSize, spacing, filledColor, emptyColor } = this.options;
    const totalWidth = (starSize + spacing) * this.maxStars - spacing;
    const startX = -totalWidth / 2 + starSize / 2;

    for (let i = 0; i < this.maxStars; i++) {
      const x = startX + i * (starSize + spacing);
      const isFilled = i < this.filledCount;
      const star = this.createStar(x, 0, starSize, isFilled ? filledColor : emptyColor);
      this.stars.push(star);
      this.add(star);
    }
  }

  createStar(cx, cy, size, color) {
    const graphics = this.scene.add.graphics();
    this.drawStar(graphics, cx, cy, 5, size / 2, size / 4, color);

    if (this.options.outlineColor !== null) {
      graphics.lineStyle(s(1), this.options.outlineColor, 1);
      this.strokeStar(graphics, cx, cy, 5, size / 2, size / 4);
    }

    return graphics;
  }

  drawStar(graphics, cx, cy, spikes, outerRadius, innerRadius, color) {
    graphics.fillStyle(color, 1);
    graphics.beginPath();

    let rot = -Math.PI / 2;
    const step = Math.PI / spikes;

    graphics.moveTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);

    for (let i = 0; i < spikes; i++) {
      rot += step;
      graphics.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
      rot += step;
      graphics.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
    }

    graphics.closePath();
    graphics.fillPath();
  }

  strokeStar(graphics, cx, cy, spikes, outerRadius, innerRadius) {
    graphics.beginPath();

    let rot = -Math.PI / 2;
    const step = Math.PI / spikes;

    graphics.moveTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);

    for (let i = 0; i < spikes; i++) {
      rot += step;
      graphics.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
      rot += step;
      graphics.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
    }

    graphics.closePath();
    graphics.strokePath();
  }

  /**
   * Update the number of filled stars
   * @param {number} count - New number of filled stars
   * @param {boolean} animate - Whether to animate the change
   */
  setStars(count, animate = false) {
    this.filledCount = Math.max(0, Math.min(count, this.maxStars));

    const { starSize, spacing, filledColor, emptyColor } = this.options;
    const totalWidth = (starSize + spacing) * this.maxStars - spacing;
    const startX = -totalWidth / 2 + starSize / 2;

    this.stars.forEach((star, i) => {
      const isFilled = i < this.filledCount;
      const targetColor = isFilled ? filledColor : emptyColor;
      const x = startX + i * (starSize + spacing);

      star.clear();
      this.drawStar(star, x, 0, 5, starSize / 2, starSize / 4, targetColor);

      if (this.options.outlineColor !== null) {
        star.lineStyle(s(1), this.options.outlineColor, 1);
        this.strokeStar(star, x, 0, 5, starSize / 2, starSize / 4);
      }

      // Animate pop effect for newly filled stars
      if (animate && isFilled) {
        this.scene.tweens.add({
          targets: star,
          scaleX: 1.3,
          scaleY: 1.3,
          duration: 100,
          delay: i * 50,
          yoyo: true,
          ease: 'Power2'
        });
      }
    });

    return this;
  }

  /**
   * Get current star count
   * @returns {number} Number of filled stars
   */
  getStars() {
    return this.filledCount;
  }

  /**
   * Set star colors
   * @param {number} filledColor - Color for filled stars
   * @param {number} emptyColor - Color for empty stars
   */
  setColors(filledColor, emptyColor) {
    this.options.filledColor = filledColor;
    this.options.emptyColor = emptyColor;
    this.setStars(this.filledCount);
    return this;
  }
}
