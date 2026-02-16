import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, s, sf } from '../config/gameConfig.js';

export class TopBar extends Phaser.GameObjects.Container {
  /**
   * Resource display bar at top of screen
   * @param {Phaser.Scene} scene - The scene this top bar belongs to
   */
  constructor(scene) {
    super(scene, GAME_WIDTH / 2, 0);

    this.barHeight = s(50);
    this.gems = 0;
    this.gold = 0;

    this.createBackground();
    this.createResourceDisplays();

    // Set depth to ensure it's on top
    this.setDepth(100);

    scene.add.existing(this);
  }

  createBackground() {
    this.background = this.scene.add.graphics();

    // Main background
    this.background.fillStyle(0x000000, 0.8);
    this.background.fillRect(-GAME_WIDTH / 2, 0, GAME_WIDTH, this.barHeight);

    // Top subtle glow
    this.background.fillStyle(COLORS.primary, 0.1);
    this.background.fillRect(-GAME_WIDTH / 2, 0, GAME_WIDTH, this.barHeight * 0.3);

    // Bottom border with glow
    this.background.lineStyle(s(2), COLORS.primary, 0.6);
    this.background.lineBetween(-GAME_WIDTH / 2, this.barHeight, GAME_WIDTH / 2, this.barHeight);

    // Neon glow line below
    this.background.lineStyle(s(4), COLORS.primary, 0.2);
    this.background.lineBetween(-GAME_WIDTH / 2, this.barHeight + s(1), GAME_WIDTH / 2, this.barHeight + s(1));

    this.add(this.background);
  }

  createResourceDisplays() {
    const iconSize = s(24);
    const startX = -GAME_WIDTH / 2 + s(20);
    const centerY = this.barHeight / 2;

    // Gems display
    this.gemsIcon = this.createResourceIcon(startX, centerY, COLORS.secondary, 'gem');
    this.add(this.gemsIcon);

    this.gemsText = this.scene.add.text(startX + iconSize + s(8), centerY, '0', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: sf(16),
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0, 0.5);
    this.add(this.gemsText);

    // Gold display
    const goldX = startX + s(120);
    this.goldIcon = this.createResourceIcon(goldX, centerY, COLORS.accent, 'coin');
    this.add(this.goldIcon);

    this.goldText = this.scene.add.text(goldX + iconSize + s(8), centerY, '0', {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: sf(16),
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0, 0.5);
    this.add(this.goldText);

    // Player level / Settings area on right
    const rightX = GAME_WIDTH / 2 - s(50);
    this.settingsBtn = this.createSettingsButton(rightX, centerY);
    this.add(this.settingsBtn);
  }

  createResourceIcon(x, y, color, type) {
    const graphics = this.scene.add.graphics();
    const size = s(20);

    if (type === 'gem') {
      // Diamond shape
      graphics.fillStyle(color, 1);
      graphics.beginPath();
      graphics.moveTo(x, y - size / 2);
      graphics.lineTo(x + size / 2, y);
      graphics.lineTo(x, y + size / 2);
      graphics.lineTo(x - size / 2, y);
      graphics.closePath();
      graphics.fillPath();

      // Inner highlight
      graphics.fillStyle(0xffffff, 0.3);
      graphics.beginPath();
      graphics.moveTo(x, y - size / 3);
      graphics.lineTo(x + size / 4, y);
      graphics.lineTo(x, y + size / 4);
      graphics.lineTo(x - size / 4, y);
      graphics.closePath();
      graphics.fillPath();
    } else if (type === 'coin') {
      // Circle coin
      graphics.fillStyle(color, 1);
      graphics.fillCircle(x, y, size / 2);

      // Inner ring
      graphics.lineStyle(s(2), 0xffffff, 0.4);
      graphics.strokeCircle(x, y, size / 3);
    }

    return graphics;
  }

  createSettingsButton(x, y) {
    const btn = this.scene.add.graphics();
    const size = s(24);

    // Gear icon representation
    btn.fillStyle(COLORS.textDark, 1);
    btn.fillCircle(x, y, size / 2);

    btn.fillStyle(COLORS.backgroundLight, 1);
    btn.fillCircle(x, y, size / 3);

    // Make interactive
    const hitArea = new Phaser.Geom.Circle(x, y, size / 2);
    btn.setInteractive(hitArea, Phaser.Geom.Circle.Contains);

    btn.on('pointerdown', () => {
      this.emit('settings');
    });

    return btn;
  }

  /**
   * Update resource display
   * @param {number} gems - Current gem count
   * @param {number} gold - Current gold count
   */
  updateResources(gems, gold) {
    this.gems = gems;
    this.gold = gold;

    this.gemsText.setText(this.formatNumber(gems));
    this.goldText.setText(this.formatNumber(gold));

    return this;
  }

  /**
   * Update only gems
   * @param {number} gems - Current gem count
   */
  setGems(gems) {
    this.gems = gems;
    this.gemsText.setText(this.formatNumber(gems));
    return this;
  }

  /**
   * Update only gold
   * @param {number} gold - Current gold count
   */
  setGold(gold) {
    this.gold = gold;
    this.goldText.setText(this.formatNumber(gold));
    return this;
  }

  /**
   * Format large numbers with K/M suffix
   * @param {number} num - Number to format
   * @returns {string} Formatted number string
   */
  formatNumber(num) {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)  }M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)  }K`;
    }
    return num.toString();
  }

  /**
   * Animate resource change (flash effect)
   * @param {string} type - 'gems' or 'gold'
   */
  flashResource(type) {
    const text = type === 'gems' ? this.gemsText : this.goldText;
    const originalScale = 1;

    this.scene.tweens.add({
      targets: text,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 100,
      yoyo: true,
      ease: 'Power2'
    });

    return this;
  }
}
