import Phaser from 'phaser';
import { getHPColor } from '../config/designSystem.js';

/**
 * EnhancedHPBar - 고도화된 HP 바
 * - 그라데이션 (초록/노랑/빨강)
 * - 데미지/힐 애니메이션 (후행 바)
 * - 스킬 게이지 바
 * - 버프/디버프 아이콘
 */
export class EnhancedHPBar extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {Object} options
   */
  constructor(scene, x, y, width, options = {}) {
    super(scene, x, y);

    this.barWidth = width;
    this.options = {
      height: options.height ?? 12,
      currentHP: options.currentHP ?? 100,
      maxHP: options.maxHP ?? 100,
      currentSkill: options.currentSkill ?? 0,
      maxSkill: options.maxSkill ?? 100,
      showSkillBar: options.showSkillBar ?? true,
      showBuffIcons: options.showBuffIcons ?? true,
      backgroundColor: options.backgroundColor ?? 0x1E293B,
      skillColor: options.skillColor ?? 0x3B82F6,
      delayDuration: options.delayDuration ?? 500,
      animationDuration: options.animationDuration ?? 300
    };

    this.currentHP = this.options.currentHP;
    this.maxHP = this.options.maxHP;
    this.currentSkill = this.options.currentSkill;
    this.maxSkill = this.options.maxSkill;

    // Delayed HP for smooth damage animation
    this.delayedHP = this.currentHP;

    this.buffs = []; // Array of { type: 'buff' | 'debuff', icon: string, duration: number }

    this.createBackground();
    this.createDelayedBar(); // 후행 감소 바
    this.createMainBar();
    if (this.options.showSkillBar) {
      this.createSkillBar();
    }
    if (this.options.showBuffIcons) {
      this.createBuffContainer();
    }

    scene.add.existing(this);
  }

  createBackground() {
    this.background = this.scene.add.graphics();
    this.background.fillStyle(this.options.backgroundColor, 1);
    this.background.fillRoundedRect(
      -this.barWidth / 2,
      -this.options.height / 2,
      this.barWidth,
      this.options.height,
      this.options.height / 2
    );
    this.add(this.background);
  }

  createDelayedBar() {
    // 후행 감소 바 (빨간색 또는 힐 시 초록색)
    this.delayedBar = this.scene.add.graphics();
    this.add(this.delayedBar);
  }

  createMainBar() {
    this.mainBar = this.scene.add.graphics();
    this.add(this.mainBar);
    this.drawMainBar();
  }

  drawMainBar() {
    this.mainBar.clear();

    const percent = this.maxHP > 0 ? this.currentHP / this.maxHP : 0;
    if (percent <= 0) return;

    const fillWidth = Math.max(this.barWidth * Math.min(percent, 1), this.options.height);
    const color = getHPColor(percent);

    // Gradient fill
    const gradient = this.createGradient(color, percent);
    this.mainBar.fillStyle(gradient, 1);
    this.mainBar.fillRoundedRect(
      -this.barWidth / 2,
      -this.options.height / 2,
      fillWidth,
      this.options.height,
      this.options.height / 2
    );

    // Shine effect
    this.mainBar.fillStyle(0xffffff, 0.25);
    this.mainBar.fillRoundedRect(
      -this.barWidth / 2,
      -this.options.height / 2,
      fillWidth,
      this.options.height / 3,
      { tl: this.options.height / 2, tr: this.options.height / 2, bl: 0, br: 0 }
    );
  }

  drawDelayedBar() {
    this.delayedBar.clear();

    const percent = this.maxHP > 0 ? this.delayedHP / this.maxHP : 0;
    if (percent <= 0) return;

    const fillWidth = Math.max(this.barWidth * Math.min(percent, 1), this.options.height);
    const color = this.delayedHP < this.currentHP ? 0x22C55E : 0xEF4444; // 힐: 초록, 데미지: 빨강

    this.delayedBar.fillStyle(color, 0.5);
    this.delayedBar.fillRoundedRect(
      -this.barWidth / 2,
      -this.options.height / 2,
      fillWidth,
      this.options.height,
      this.options.height / 2
    );
  }

  createGradient(baseColor, percent) {
    // Simple gradient approximation - return base color
    // For true gradients, we'd need shaders or multiple rectangles
    return baseColor;
  }

  createSkillBar() {
    const skillY = this.options.height / 2 + 6;
    const skillHeight = 4;

    // Skill bar background
    this.skillBackground = this.scene.add.graphics();
    this.skillBackground.fillStyle(this.options.backgroundColor, 0.8);
    this.skillBackground.fillRoundedRect(
      -this.barWidth / 2,
      skillY - skillHeight / 2,
      this.barWidth,
      skillHeight,
      skillHeight / 2
    );
    this.add(this.skillBackground);

    // Skill bar fill
    this.skillBar = this.scene.add.graphics();
    this.add(this.skillBar);
    this.drawSkillBar();
  }

  drawSkillBar() {
    if (!this.skillBar) return;

    this.skillBar.clear();

    const percent = this.maxSkill > 0 ? this.currentSkill / this.maxSkill : 0;
    if (percent <= 0) return;

    const skillY = this.options.height / 2 + 6;
    const skillHeight = 4;
    const fillWidth = Math.max(this.barWidth * Math.min(percent, 1), skillHeight);

    this.skillBar.fillStyle(this.options.skillColor, 1);
    this.skillBar.fillRoundedRect(
      -this.barWidth / 2,
      skillY - skillHeight / 2,
      fillWidth,
      skillHeight,
      skillHeight / 2
    );

    // Glow when full
    if (percent >= 1) {
      this.skillBar.fillStyle(0xFFFFFF, 0.4);
      this.skillBar.fillRoundedRect(
        -this.barWidth / 2,
        skillY - skillHeight / 2,
        fillWidth,
        skillHeight / 3,
        { tl: skillHeight / 2, tr: skillHeight / 2, bl: 0, br: 0 }
      );
    }
  }

  createBuffContainer() {
    this.buffContainer = this.scene.add.container(this.barWidth / 2 + 10, 0);
    this.add(this.buffContainer);
  }

  /**
   * Update HP value
   * @param {number} current
   * @param {number} max
   * @param {boolean} animate
   */
  updateHP(current, max = null, animate = true) {
    if (max !== null) {
      this.maxHP = max;
    }

    const oldHP = this.currentHP;
    const targetHP = Math.max(0, Math.min(current, this.maxHP));

    if (animate && this.options.animationDuration > 0) {
      // Immediate update for main bar
      this.currentHP = targetHP;
      this.drawMainBar();

      // Delayed update for trailing bar
      this.scene.tweens.add({
        targets: this,
        delayedHP: targetHP,
        duration: this.options.animationDuration,
        delay: this.options.delayDuration,
        ease: 'Power2',
        onUpdate: () => {
          this.drawDelayedBar();
        }
      });

      // Show damage/heal number
      if (oldHP !== targetHP) {
        this.showHPChange(targetHP - oldHP);
      }
    } else {
      this.currentHP = targetHP;
      this.delayedHP = targetHP;
      this.drawMainBar();
      this.drawDelayedBar();
    }

    return this;
  }

  showHPChange(delta) {
    const isHeal = delta > 0;
    const color = isHeal ? '#22C55E' : '#EF4444';
    const text = isHeal ? `+${Math.abs(delta)}` : `-${Math.abs(delta)}`;

    const changeText = this.scene.add.text(0, -this.options.height - 5, text, {
      fontFamily: '"Noto Sans KR", sans-serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: color,
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    this.add(changeText);

    this.scene.tweens.add({
      targets: changeText,
      y: changeText.y - 20,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => changeText.destroy()
    });
  }

  /**
   * Update skill gauge
   * @param {number} current
   * @param {number} max
   */
  updateSkill(current, max = null) {
    if (max !== null) {
      this.maxSkill = max;
    }

    this.currentSkill = Math.max(0, Math.min(current, this.maxSkill));
    this.drawSkillBar();

    return this;
  }

  /**
   * Add buff/debuff icon
   * @param {Object} buff - { type: 'buff' | 'debuff', icon: string, duration: number }
   */
  addBuff(buff) {
    this.buffs.push(buff);
    this.updateBuffIcons();
    return this;
  }

  /**
   * Remove buff by icon name
   * @param {string} icon
   */
  removeBuff(icon) {
    this.buffs = this.buffs.filter(b => b.icon !== icon);
    this.updateBuffIcons();
    return this;
  }

  updateBuffIcons() {
    if (!this.buffContainer) return;

    this.buffContainer.removeAll(true);

    this.buffs.forEach((buff, index) => {
      const iconX = index * 18;
      const iconSize = 14;

      const iconBg = this.scene.add.circle(iconX, 0, iconSize / 2, buff.type === 'buff' ? 0x3B82F6 : 0xF97316, 0.9);
      this.buffContainer.add(iconBg);

      const iconText = this.scene.add.text(iconX, 0, buff.icon, {
        fontSize: '10px'
      }).setOrigin(0.5);
      this.buffContainer.add(iconText);
    });
  }

  /**
   * Get current HP
   * @returns {number}
   */
  getHP() {
    return this.currentHP;
  }

  /**
   * Get HP percent
   * @returns {number}
   */
  getHPPercent() {
    return this.maxHP > 0 ? this.currentHP / this.maxHP : 0;
  }

  /**
   * Get skill gauge percent
   * @returns {number}
   */
  getSkillPercent() {
    return this.maxSkill > 0 ? this.currentSkill / this.maxSkill : 0;
  }
}
