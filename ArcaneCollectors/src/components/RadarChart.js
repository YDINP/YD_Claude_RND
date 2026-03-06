import Phaser from 'phaser';
import { getRarityColors } from '../config/designSystem.js';
import { s } from '../config/gameConfig.js';

/**
 * RadarChart - 4축 레이더 차트 (HP, ATK, DEF, SPD)
 * 등급별 색상, 장비 미리보기, 평균치 비교선 지원
 */
export class RadarChart extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Object} stats - { hp, atk, def, spd }
   * @param {Object} options
   */
  constructor(scene, x, y, stats, options = {}) {
    super(scene, x, y);

    this.stats = stats;
    this.options = {
      radius: options.radius ?? s(80),
      rarity: options.rarity ?? 'N',
      maxStats: options.maxStats ?? { hp: 2000, atk: 500, def: 400, spd: 150 },
      showAverage: options.showAverage ?? false,
      averageStats: options.averageStats ?? null,
      previewStats: options.previewStats ?? null, // 장비 적용 후 스탯
      labelSize: options.labelSize ?? s(12),
      axisColor: options.axisColor ?? 0x64748B,
      axisAlpha: options.axisAlpha ?? 0.5
    };

    this.graphics = scene.add.graphics();
    this.add(this.graphics);

    this.draw();

    scene.add.existing(this);
  }

  draw() {
    this.graphics.clear();

    // Draw grid circles (25%, 50%, 75%, 100%)
    this.drawGrid();

    // Draw axes and labels
    this.drawAxes();

    // Draw average stats (회색 점선)
    if (this.options.showAverage && this.options.averageStats) {
      this.drawAveragePolygon();
    }

    // Draw main stats polygon (실선)
    this.drawStatsPolygon(this.stats, false);

    // Draw preview stats (점선 오버레이)
    if (this.options.previewStats) {
      this.drawStatsPolygon(this.options.previewStats, true);
    }
  }

  drawGrid() {
    const steps = [0.25, 0.5, 0.75, 1.0];
    steps.forEach(step => {
      this.graphics.lineStyle(s(1), this.options.axisColor, this.options.axisAlpha * 0.3);
      this.graphics.strokeCircle(0, 0, this.options.radius * step);
    });
  }

  drawAxes() {
    const axes = [
      { key: 'hp', angle: -Math.PI / 2, label: 'HP' },
      { key: 'atk', angle: 0, label: 'ATK' },
      { key: 'def', angle: Math.PI / 2, label: 'DEF' },
      { key: 'spd', angle: Math.PI, label: 'SPD' }
    ];

    axes.forEach(axis => {
      const endX = Math.cos(axis.angle) * this.options.radius;
      const endY = Math.sin(axis.angle) * this.options.radius;

      // Axis line
      this.graphics.lineStyle(s(1), this.options.axisColor, this.options.axisAlpha);
      this.graphics.lineBetween(0, 0, endX, endY);

      // Label
      const labelX = Math.cos(axis.angle) * (this.options.radius + s(20));
      const labelY = Math.sin(axis.angle) * (this.options.radius + s(20));

      const label = this.scene.add.text(labelX, labelY, axis.label, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: `${this.options.labelSize}px`,
        fontStyle: 'bold',
        color: '#94A3B8'
      }).setOrigin(0.5);

      this.add(label);
    });
  }

  drawStatsPolygon(stats, isDashed = false) {
    const axes = [
      { key: 'hp', angle: -Math.PI / 2 },
      { key: 'atk', angle: 0 },
      { key: 'def', angle: Math.PI / 2 },
      { key: 'spd', angle: Math.PI }
    ];

    const points = axes.map(axis => {
      const max = this.options.maxStats[axis.key] || 1;
      const value = stats[axis.key] || 0;
      const ratio = Math.min(value / max, 1);
      const distance = this.options.radius * ratio;

      return {
        x: Math.cos(axis.angle) * distance,
        y: Math.sin(axis.angle) * distance
      };
    });

    const rarityColors = getRarityColors(this.options.rarity);
    const fillColor = rarityColors.hex;
    const strokeColor = isDashed ? 0xFFFFFF : fillColor;

    // Fill area
    if (!isDashed) {
      this.graphics.fillStyle(fillColor, 0.3);
      this.graphics.beginPath();
      this.graphics.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach(p => this.graphics.lineTo(p.x, p.y));
      this.graphics.closePath();
      this.graphics.fillPath();
    }

    // Stroke polygon
    if (isDashed) {
      // Dashed line for preview
      this.graphics.lineStyle(s(2), strokeColor, 0.8);
      for (let i = 0; i < points.length; i++) {
        const start = points[i];
        const end = points[(i + 1) % points.length];
        this.drawDashedLine(start.x, start.y, end.x, end.y);
      }
    } else {
      // Solid line
      this.graphics.lineStyle(s(2), strokeColor, 1);
      this.graphics.beginPath();
      this.graphics.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach(p => this.graphics.lineTo(p.x, p.y));
      this.graphics.closePath();
      this.graphics.strokePath();
    }

    // Draw vertices
    points.forEach(point => {
      this.graphics.fillStyle(strokeColor, 1);
      this.graphics.fillCircle(point.x, point.y, isDashed ? s(3) : s(4));
    });
  }

  drawAveragePolygon() {
    if (!this.options.averageStats) return;

    const axes = [
      { key: 'hp', angle: -Math.PI / 2 },
      { key: 'atk', angle: 0 },
      { key: 'def', angle: Math.PI / 2 },
      { key: 'spd', angle: Math.PI }
    ];

    const points = axes.map(axis => {
      const max = this.options.maxStats[axis.key] || 1;
      const value = this.options.averageStats[axis.key] || 0;
      const ratio = Math.min(value / max, 1);
      const distance = this.options.radius * ratio;

      return {
        x: Math.cos(axis.angle) * distance,
        y: Math.sin(axis.angle) * distance
      };
    });

    // Gray dashed line for average
    this.graphics.lineStyle(s(1), 0x94A3B8, 0.6);
    for (let i = 0; i < points.length; i++) {
      const start = points[i];
      const end = points[(i + 1) % points.length];
      this.drawDashedLine(start.x, start.y, end.x, end.y, s(4), s(4));
    }
  }

  drawDashedLine(x1, y1, x2, y2, dashLength = s(5), gapLength = s(5)) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.floor(distance / (dashLength + gapLength));

    const stepX = dx / distance;
    const stepY = dy / distance;

    for (let i = 0; i < segments; i++) {
      const startX = x1 + stepX * i * (dashLength + gapLength);
      const startY = y1 + stepY * i * (dashLength + gapLength);
      const endX = startX + stepX * dashLength;
      const endY = startY + stepY * dashLength;

      this.graphics.lineBetween(startX, startY, endX, endY);
    }
  }

  /**
   * Update stats and redraw
   * @param {Object} stats
   * @param {Object} previewStats
   */
  updateStats(stats, previewStats = null) {
    this.stats = stats;
    if (previewStats) {
      this.options.previewStats = previewStats;
    }
    this.draw();
  }

  /**
   * Set rarity color
   * @param {string} rarity
   */
  setRarity(rarity) {
    this.options.rarity = rarity;
    this.draw();
  }
}
