/**
 * HeroInfoPopup.js
 * 영웅 정보 팝업 오버레이 - 씬 전환 없이 인라인 표시
 */
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY } from '../config/gameConfig.js';
import { Z_INDEX } from '../config/layoutConfig.js';
import { getCharacter } from '../data/index.ts';
import { SaveManager } from '../systems/SaveManager.js';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';

const CLASS_ICONS = { warrior: '⚔️', mage: '🔮', archer: '🏹', healer: '💚' };
const CLASS_NAMES = { warrior: '전사', mage: '마법사', archer: '궁수', healer: '힐러' };
const STAT_COLORS = {
  hp: 0x10B981, atk: 0xEF4444, def: 0x3B82F6, spd: 0xF59E0B
};
const STAT_LABELS = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD' };

export class HeroInfoPopup {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
  }

  show(heroId) {
    if (this.container) this.destroy();

    const scene = this.scene;
    const saveData = SaveManager.load();
    const charData = (saveData?.characters || []).find(c => c.id === heroId || c.characterId === heroId);
    const staticData = getCharacter(heroId);
    if (!staticData && !charData) return;

    const hero = { ...staticData, ...charData, id: heroId };
    const stats = staticData?.stats || charData?.stats || {};

    this.container = scene.add.container(0, 0).setDepth(Z_INDEX.MODAL + 10);

    // --- Overlay ---
    const overlay = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.destroy());
    this.container.add(overlay);

    // --- Panel ---
    const panelW = 580;
    const panelH = 620;
    const px = GAME_WIDTH / 2;
    const py = GAME_HEIGHT / 2;
    const left = px - panelW / 2;
    const top = py - panelH / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(0x0F172A, 0.97);
    panel.fillRoundedRect(left, top, panelW, panelH, 16);
    panel.lineStyle(2, COLORS.primary, 0.6);
    panel.strokeRoundedRect(left, top, panelW, panelH, 16);
    this.container.add(panel);

    // Block panel clicks from closing
    const blocker = scene.add.rectangle(px, py, panelW, panelH).setAlpha(0.001).setInteractive();
    this.container.add(blocker);

    // --- Close button ---
    const closeBtn = scene.add.text(left + panelW - 25, top + 18, '✕', {
      fontSize: '22px', color: '#94A3B8'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.destroy());
    closeBtn.on('pointerover', () => closeBtn.setColor('#FFFFFF'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#94A3B8'));
    this.container.add(closeBtn);

    // --- Hero Header ---
    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const classIcon = CLASS_ICONS[hero.class] || '❓';
    const className = CLASS_NAMES[hero.class] || '???';
    const starCount = hero.stars || getRarityNum(hero.rarity) || 1;
    const level = hero.level || 1;

    // Name
    const nameText = scene.add.text(px, top + 45, hero.name || '???', {
      fontSize: '22px', fontFamily: 'Arial', fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);
    this.container.add(nameText);

    // Rarity badge
    const rarityBadge = scene.add.graphics();
    rarityBadge.fillStyle(rarityColor, 1);
    rarityBadge.fillRoundedRect(left + 20, top + 33, 40, 22, 6);
    const rarityLabel = scene.add.text(left + 40, top + 44, rKey, {
      fontSize: '12px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    this.container.add(rarityBadge);
    this.container.add(rarityLabel);

    // --- Avatar area ---
    const avatarY = top + 130;
    const avatarCircle = scene.add.circle(px, avatarY, 50, rarityColor, 0.3);
    avatarCircle.setStrokeStyle(2, rarityColor);
    this.container.add(avatarCircle);

    const iconText = scene.add.text(px, avatarY - 5, classIcon, {
      fontSize: '40px'
    }).setOrigin(0.5);
    this.container.add(iconText);

    // Class + Level
    const infoText = scene.add.text(px, avatarY + 60, `${classIcon} ${className}  Lv.${level}`, {
      fontSize: '15px', fontFamily: 'Arial', color: '#94A3B8'
    }).setOrigin(0.5);
    this.container.add(infoText);

    // Stars
    const starsText = scene.add.text(px, avatarY + 82, '★'.repeat(starCount), {
      fontSize: '16px', color: `#${COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.container.add(starsText);

    // --- Stats Bars ---
    const statsY = top + 280;
    const barWidth = 200;
    const barHeight = 14;
    const maxVal = Math.max(stats.hp || 1, stats.atk || 1, stats.def || 1, stats.spd || 1, 1000);

    ['hp', 'atk', 'def', 'spd'].forEach((key, i) => {
      const y = statsY + i * 38;
      const val = stats[key] || 0;
      const ratio = Math.min(val / maxVal, 1);
      const color = STAT_COLORS[key];

      // Label
      const label = scene.add.text(left + 40, y, STAT_LABELS[key], {
        fontSize: '14px', fontFamily: 'Arial', fontStyle: 'bold',
        color: `#${color.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5);
      this.container.add(label);

      // Bar background
      const barBg = scene.add.rectangle(left + 110 + barWidth / 2, y, barWidth, barHeight, 0x334155, 1);
      this.container.add(barBg);

      // Bar fill
      const fillW = Math.max(barWidth * ratio, 4);
      const barFill = scene.add.rectangle(left + 110 + fillW / 2, y, fillW, barHeight, color, 0.8);
      this.container.add(barFill);

      // Value
      const valText = scene.add.text(left + 110 + barWidth + 15, y, val.toLocaleString(), {
        fontSize: '13px', fontFamily: 'Arial', fontStyle: 'bold', color: '#E2E8F0'
      }).setOrigin(0, 0.5);
      this.container.add(valText);
    });

    // Combat Power
    const power = (stats.hp || 0) + (stats.atk || 0) * 5 + (stats.def || 0) * 3 + (stats.spd || 0) * 2;
    const powerText = scene.add.text(px, statsY + 160, `⚡ 전투력: ${Math.floor(power * (level || 1) * (1 + starCount * 0.2)).toLocaleString()}`, {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold', color: '#F59E0B'
    }).setOrigin(0.5);
    this.container.add(powerText);

    // --- Skills ---
    const skillsY = statsY + 200;
    const skills = staticData?.skills || hero.skills || [];

    const skillTitle = scene.add.text(left + 40, skillsY, '스킬', {
      fontSize: '14px', fontFamily: 'Arial', fontStyle: 'bold', color: '#94A3B8'
    });
    this.container.add(skillTitle);

    if (skills.length === 0) {
      const noSkill = scene.add.text(px, skillsY + 30, '스킬 정보 없음', {
        fontSize: '13px', fontFamily: 'Arial', color: '#64748B'
      }).setOrigin(0.5);
      this.container.add(noSkill);
    } else {
      skills.slice(0, 2).forEach((skill, i) => {
        const sx = left + 60 + i * 260;
        const sy = skillsY + 35;
        const skillName = scene.add.text(sx, sy, `${skill.icon || '🔥'} ${skill.name || '???'}`, {
          fontSize: '13px', fontFamily: 'Arial', fontStyle: 'bold', color: '#E2E8F0'
        });
        this.container.add(skillName);

        const skillDesc = scene.add.text(sx, sy + 20, (skill.description || '').substring(0, 20), {
          fontSize: '11px', fontFamily: 'Arial', color: '#94A3B8'
        });
        this.container.add(skillDesc);
      });
    }

    // --- Entrance animation ---
    this.container.setAlpha(0);
    scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });
  }

  destroy() {
    if (!this.container) return;
    const container = this.container;
    this.container = null;

    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      duration: 150,
      ease: 'Power2',
      onComplete: () => container.destroy()
    });
  }

  isVisible() {
    return this.container !== null;
  }
}
