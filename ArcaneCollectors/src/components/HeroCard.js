import Phaser from 'phaser';
import { COLORS, RARITY, MOODS, CULT_COLORS } from '../config/gameConfig.js';
import { getRarityKey } from '../utils/helpers.js';
import { StarRating } from './StarRating.js';

export class HeroCard extends Phaser.GameObjects.Container {
  /**
   * Hero thumbnail card for grid display
   * @param {Phaser.Scene} scene - The scene this card belongs to
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {Object} heroData - Hero data object
   */
  constructor(scene, x, y, heroData) {
    super(scene, x, y);

    this.heroData = heroData;
    this.cardWidth = 100;
    this.cardHeight = 120;
    this.onTapCallback = null;

    this.createFrame();
    this.createPortrait();
    this.createMoodIcon();
    this.createStarRating();
    this.createNameLabel();
    this.createLevelBadge();
    this.setupInteraction();

    scene.add.existing(this);
  }

  createFrame() {
    const rarityConfig = RARITY[getRarityKey(this.heroData.rarity)] || RARITY.N;
    const frameColor = rarityConfig.color;

    this.frame = this.scene.add.graphics();

    // H-6.3: 교단(Cult) 기반 배경색 반영
    const cultColor = CULT_COLORS[this.heroData.cult] || COLORS.backgroundLight;
    this.frame.fillStyle(cultColor, 0.15);
    this.frame.fillRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight,
      8
    );

    // 기본 배경 오버레이
    this.frame.fillStyle(COLORS.backgroundLight, 0.85);
    this.frame.fillRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight,
      8
    );

    // Top shine
    this.frame.fillStyle(0xffffff, 0.08);
    this.frame.fillRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight * 0.3,
      { tl: 8, tr: 8, bl: 0, br: 0 }
    );

    // H-6.1: 하단 교단색 그라데이션 힌트
    this.frame.fillStyle(cultColor, 0.2);
    this.frame.fillRoundedRect(
      -this.cardWidth / 2,
      this.cardHeight / 2 - this.cardHeight * 0.25,
      this.cardWidth,
      this.cardHeight * 0.25,
      { tl: 0, tr: 0, bl: 8, br: 8 }
    );

    // Rarity border with enhanced thickness
    const borderWidth = this.heroData.rarity === 'SSR' ? 4 : (this.heroData.rarity === 'SR' ? 3 : 2);
    this.frame.lineStyle(borderWidth, frameColor, 1);
    this.frame.strokeRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight,
      8
    );

    // Rarity glow effect (for SR and SSR)
    if (this.heroData.rarity === 'SR' || this.heroData.rarity === 'SSR') {
      const glowGraphics = this.scene.add.graphics();
      glowGraphics.fillStyle(frameColor, 0.25);
      glowGraphics.fillRoundedRect(
        -this.cardWidth / 2 - 3,
        -this.cardHeight / 2 - 3,
        this.cardWidth + 6,
        this.cardHeight + 6,
        10
      );
      this.add(glowGraphics);
      this.sendToBack(glowGraphics);

      // Animated glow for SSR
      if (this.heroData.rarity === 'SSR') {
        this.scene.tweens.add({
          targets: glowGraphics,
          alpha: { from: 0.25, to: 0.5 },
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    }

    this.add(this.frame);
  }

  createPortrait() {
    const portraitSize = 70;
    const portraitY = -this.cardHeight / 2 + 10 + portraitSize / 2;

    // Portrait background/placeholder
    this.portrait = this.scene.add.graphics();
    this.portrait.fillStyle(COLORS.background, 1);
    this.portrait.fillRoundedRect(
      -portraitSize / 2,
      portraitY - portraitSize / 2,
      portraitSize,
      portraitSize,
      6
    );

    // Try to load portrait image
    const portraitKey = `hero_${this.heroData.id}`;
    if (this.scene.textures.exists(portraitKey)) {
      this.portraitImage = this.scene.add.image(0, portraitY, portraitKey);
      this.portraitImage.setDisplaySize(portraitSize - 4, portraitSize - 4);
      this.add(this.portraitImage);
    } else {
      // Placeholder with first letter of name
      const initial = this.heroData.name ? this.heroData.name.charAt(0) : '?';
      this.placeholder = this.scene.add.text(0, portraitY, initial, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: '32px',
        fontStyle: 'bold',
        color: '#64748B'
      }).setOrigin(0.5);
      this.add(this.placeholder);
    }

    this.add(this.portrait);
    this.sendToBack(this.portrait);
  }

  createMoodIcon() {
    if (!this.heroData.mood) return;

    const moodConfig = MOODS[this.heroData.mood];
    if (!moodConfig) return;

    const iconSize = 20;
    const iconX = this.cardWidth / 2 - iconSize / 2 - 6;
    const iconY = -this.cardHeight / 2 + iconSize / 2 + 6;

    this.moodIcon = this.scene.add.graphics();

    // Circle background
    this.moodIcon.fillStyle(0x000000, 0.6);
    this.moodIcon.fillCircle(iconX, iconY, iconSize / 2 + 2);

    // Mood color
    this.moodIcon.fillStyle(moodConfig.color, 1);
    this.moodIcon.fillCircle(iconX, iconY, iconSize / 2);

    this.add(this.moodIcon);
  }

  createNameLabel() {
    if (!this.heroData.name) return;
    const nameY = this.cardHeight / 2 - 14;
    this.nameLabel = this.scene.add.text(0, nameY, this.heroData.name, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '9px',
      color: '#E2E8F0'
    }).setOrigin(0.5);
    this.add(this.nameLabel);
  }

  createStarRating() {
    const rarityConfig = RARITY[getRarityKey(this.heroData.rarity)] || RARITY.N;
    const starCount = rarityConfig.stars;
    const starY = this.cardHeight / 2 - 30;

    this.stars = new StarRating(this.scene, 0, starY, starCount, 5);
    this.add(this.stars);
  }

  createLevelBadge() {
    const level = this.heroData.level || 1;
    const badgeX = -this.cardWidth / 2 + 18;
    const badgeY = -this.cardHeight / 2 + 14;

    this.levelBadge = this.scene.add.graphics();

    // Badge background
    this.levelBadge.fillStyle(0x000000, 0.7);
    this.levelBadge.fillRoundedRect(badgeX - 14, badgeY - 10, 28, 18, 4);

    this.add(this.levelBadge);

    // Level text
    this.levelText = this.scene.add.text(badgeX, badgeY, `Lv${level}`, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#FFFFFF'
    }).setOrigin(0.5);

    this.add(this.levelText);
  }

  setupInteraction() {
    const hitArea = new Phaser.Geom.Rectangle(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight
    );

    this.setSize(this.cardWidth, this.cardHeight);
    this.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    this.on('pointerover', () => {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 100,
        ease: 'Power2'
      });
    });

    this.on('pointerout', () => {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
        ease: 'Power2'
      });
    });

    this.on('pointerdown', () => {
      this.scene.tweens.add({
        targets: this,
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 50,
        ease: 'Power2'
      });
    });

    this.on('pointerup', () => {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
        ease: 'Back.easeOut'
      });

      if (this.onTapCallback) {
        this.onTapCallback(this.heroData);
      }
    });
  }

  /**
   * Set tap callback
   * @param {Function} callback - Function(heroData)
   */
  onTap(callback) {
    this.onTapCallback = callback;
    return this;
  }

  /**
   * Update hero data and refresh display
   * @param {Object} heroData - New hero data
   */
  setHeroData(heroData) {
    this.heroData = heroData;

    // Update level
    this.levelText.setText(`Lv${heroData.level || 1}`);

    // Update stars if rarity changed
    const rarityConfig = RARITY[getRarityKey(heroData.rarity)] || RARITY.N;
    this.stars.setStars(rarityConfig.stars);

    return this;
  }

  /**
   * Show selection state
   * @param {boolean} selected - Whether card is selected
   */
  setSelected(selected) {
    if (selected) {
      this.frame.lineStyle(3, COLORS.success, 1);
      this.frame.strokeRoundedRect(
        -this.cardWidth / 2,
        -this.cardHeight / 2,
        this.cardWidth,
        this.cardHeight,
        8
      );
    } else {
      // Redraw with original rarity color
      const rarityConfig = RARITY[getRarityKey(this.heroData.rarity)] || RARITY.N;
      this.frame.lineStyle(3, rarityConfig.color, 1);
      this.frame.strokeRoundedRect(
        -this.cardWidth / 2,
        -this.cardHeight / 2,
        this.cardWidth,
        this.cardHeight,
        8
      );
    }

    return this;
  }
}
