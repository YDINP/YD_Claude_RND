/**
 * HeroInfoPopup.js
 * 영웅 정보 팝업 오버레이 - 씬 전환 없이 인라인 표시
 * 레벨업, 진화, 스킬 강화 기능 포함
 */
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, s, sf } from '../config/gameConfig.js';
import { Z_INDEX } from '../config/layoutConfig.js';
import { getCharacter } from '../data/index.ts';
import { SaveManager } from '../systems/SaveManager.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';

const CLASS_ICONS = { warrior: '⚔️', mage: '🔮', archer: '🏹', healer: '💚' };
const CLASS_NAMES = { warrior: '전사', mage: '마법사', archer: '궁수', healer: '힐러' };
const STAT_COLORS = {
  hp: 0x10B981, atk: 0xEF4444, def: 0x3B82F6, spd: 0xF59E0B
};
const STAT_LABELS = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD' };
const MAX_LEVELS = { N: 30, R: 40, SR: 50, SSR: 60 };

export class HeroInfoPopup {
  constructor(scene) {
    this.scene = scene;
    this.container = null;
    this.heroId = null;
  }

  show(heroId) {
    if (this.container) this._destroyImmediate();
    this.heroId = heroId;

    const scene = this.scene;
    const saveData = SaveManager.load();
    const charData = (saveData?.characters || []).find(c => c.id === heroId || c.characterId === heroId);
    const staticData = getCharacter(heroId);
    if (!staticData && !charData) return;

    const hero = { ...staticData, ...charData, id: heroId };
    const stats = hero.stats || {};
    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const level = hero.level || 1;
    const starCount = hero.stars || getRarityNum(hero.rarity) || 1;
    const classIcon = CLASS_ICONS[hero.class] || '❓';
    const className = CLASS_NAMES[hero.class] || '???';
    const maxLevel = MAX_LEVELS[rKey] || 60;
    const levelUpCost = level * 100;

    this.container = scene.add.container(0, 0).setDepth(Z_INDEX.MODAL + 10);

    // --- Overlay ---
    const overlay = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.destroy());
    this.container.add(overlay);

    // --- Panel ---
    const panelW = s(620);
    const panelH = s(820);
    const px = GAME_WIDTH / 2;
    const py = GAME_HEIGHT / 2;
    const left = px - panelW / 2;
    const top = py - panelH / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(0x0F172A, 0.97);
    panel.fillRoundedRect(left, top, panelW, panelH, s(16));
    panel.lineStyle(s(2), rarityColor, 0.6);
    panel.strokeRoundedRect(left, top, panelW, panelH, s(16));
    this.container.add(panel);

    // Block panel clicks from closing
    const blocker = scene.add.rectangle(px, py, panelW, panelH).setAlpha(0.001).setInteractive();
    this.container.add(blocker);

    // --- Close button ---
    const closeBtn = scene.add.text(left + panelW - s(25), top + s(18), '✕', {
      fontSize: sf(22), color: '#94A3B8'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.destroy());
    closeBtn.on('pointerover', () => closeBtn.setColor('#FFFFFF'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#94A3B8'));
    this.container.add(closeBtn);

    // === HEADER: Name + Rarity badge ===
    const nameText = scene.add.text(px, top + s(40), hero.name || '???', {
      fontSize: sf(22), fontFamily: 'Arial', fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);
    this.container.add(nameText);

    const rarityBadge = scene.add.graphics();
    rarityBadge.fillStyle(rarityColor, 1);
    rarityBadge.fillRoundedRect(left + s(18), top + s(28), s(42), s(22), s(6));
    this.container.add(rarityBadge);
    const rarityLabel = scene.add.text(left + s(39), top + s(39), rKey, {
      fontSize: sf(12), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    this.container.add(rarityLabel);

    // === AVATAR ===
    const avatarY = top + s(110);
    const avatarCircle = scene.add.circle(px, avatarY, s(42), rarityColor, 0.3);
    avatarCircle.setStrokeStyle(s(2), rarityColor);
    this.container.add(avatarCircle);
    const iconText = scene.add.text(px, avatarY - s(3), classIcon, {
      fontSize: sf(36)
    }).setOrigin(0.5);
    this.container.add(iconText);

    // Class + Level + Stars
    const infoLine = scene.add.text(px, avatarY + s(50), `${className}  Lv.${level}/${maxLevel}`, {
      fontSize: sf(14), fontFamily: 'Arial', color: '#94A3B8'
    }).setOrigin(0.5);
    this.container.add(infoLine);
    const starsText = scene.add.text(px, avatarY + s(70), '★'.repeat(starCount) + '☆'.repeat(Math.max(0, 6 - starCount)), {
      fontSize: sf(14), color: `#${COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.container.add(starsText);

    // === STATS BARS ===
    const statsY = top + s(235);
    const barWidth = s(180);
    const barHeight = s(12);
    // Use ProgressionSystem stats for level-scaled values
    let leveledStats = stats;
    try {
      leveledStats = ProgressionSystem.getStatsAtLevel(heroId, level) || stats;
    } catch (e) { /* fallback to raw stats */ }
    const maxVal = Math.max(leveledStats.hp || 1, (leveledStats.atk || 1) * 5, (leveledStats.def || 1) * 3, 1500);

    ['hp', 'atk', 'def', 'spd'].forEach((key, i) => {
      const y = statsY + i * s(32);
      const val = leveledStats[key] || 0;
      const ratio = Math.min(val / maxVal, 1);
      const color = STAT_COLORS[key];

      const label = scene.add.text(left + s(35), y, STAT_LABELS[key], {
        fontSize: sf(13), fontFamily: 'Arial', fontStyle: 'bold',
        color: `#${color.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5);
      this.container.add(label);

      const barBg = scene.add.rectangle(left + s(100) + barWidth / 2, y, barWidth, barHeight, 0x334155, 1);
      this.container.add(barBg);

      const fillW = Math.max(barWidth * ratio, s(3));
      const barFill = scene.add.rectangle(left + s(100) + fillW / 2, y, fillW, barHeight, color, 0.8);
      this.container.add(barFill);

      const valText = scene.add.text(left + s(100) + barWidth + s(12), y, val.toLocaleString(), {
        fontSize: sf(12), fontFamily: 'Arial', fontStyle: 'bold', color: '#E2E8F0'
      }).setOrigin(0, 0.5);
      this.container.add(valText);
    });

    // === COMBAT POWER (ProgressionSystem 통일 공식) ===
    let power = 0;
    try {
      power = ProgressionSystem.calculatePower({ ...hero, characterId: heroId, skillLevels: hero.skillLevels || [1, 1] });
    } catch (e) {
      // Fallback: hp/10 + atk + def + spd
      power = Math.floor((leveledStats.hp || 0) / 10 + (leveledStats.atk || 0) + (leveledStats.def || 0) + (leveledStats.spd || 0));
    }
    const powerText = scene.add.text(px + s(100), statsY + s(50), `⚡ ${power.toLocaleString()}`, {
      fontSize: sf(18), fontFamily: 'Arial', fontStyle: 'bold', color: '#F59E0B'
    }).setOrigin(0.5);
    this.container.add(powerText);

    // === SKILLS ===
    const skillsY = statsY + s(140);
    const skills = staticData?.skills || hero.skills || [];
    const skillLevels = hero.skillLevels || [1, 1];

    const skillTitle = scene.add.text(left + s(35), skillsY, '스킬', {
      fontSize: sf(14), fontFamily: 'Arial', fontStyle: 'bold', color: '#CBD5E1'
    });
    this.container.add(skillTitle);

    if (skills.length === 0) {
      const noSkill = scene.add.text(px, skillsY + s(28), '스킬 정보 없음', {
        fontSize: sf(12), fontFamily: 'Arial', color: '#64748B'
      }).setOrigin(0.5);
      this.container.add(noSkill);
    } else {
      skills.slice(0, 2).forEach((skill, i) => {
        const sx = left + s(40) + i * s(280);
        const sy = skillsY + s(28);
        const sLv = skillLevels[i + 1] || 1;
        const skillName = scene.add.text(sx, sy, `${skill.icon || '🔥'} ${skill.name || '???'} Lv.${sLv}`, {
          fontSize: sf(12), fontFamily: 'Arial', fontStyle: 'bold', color: '#E2E8F0'
        });
        this.container.add(skillName);
        const skillDesc = scene.add.text(sx, sy + s(18), (skill.description || '').substring(0, 25), {
          fontSize: sf(10), fontFamily: 'Arial', color: '#94A3B8'
        });
        this.container.add(skillDesc);

        // Skill enhance button
        if (sLv < 10) {
          const enhCost = ProgressionSystem.getSkillEnhanceCost(sLv);
          const enhBtn = this._createSmallButton(scene, sx + s(200), sy + s(8), `강화 (${enhCost.gold}G)`, 0x6366F1, () => {
            const result = ProgressionSystem.enhanceSkill(heroId, i + 1);
            if (result.success) {
              this._showMessage(`스킬 강화! Lv.${result.newLevel}`);
              this._refresh();
            } else {
              this._showMessage(result.error);
            }
          });
          this.container.add(enhBtn);
        }
      });
    }

    // === ACTION BUTTONS ===
    const btnY = top + panelH - s(80);
    const btnW = s(160);
    const btnH = s(42);
    const btnGap = s(15);

    // Level Up button
    const isMaxLevel = level >= maxLevel;
    const gold = scene.registry?.get('gold') || 0;
    const canLevelUp = !isMaxLevel && gold >= levelUpCost;

    const lvBtnColor = canLevelUp ? 0x10B981 : 0x334155;
    const lvBtn = this._createButton(scene, px - btnW - btnGap / 2, btnY, btnW, btnH,
      isMaxLevel ? '최대 레벨' : `레벨업 (${levelUpCost}G)`, lvBtnColor, () => {
        if (isMaxLevel) { this._showMessage('최대 레벨입니다!'); return; }
        this._levelUp(heroId);
      });
    this.container.add(lvBtn);

    // Auto Level Up button
    const autoColor = canLevelUp ? 0x3B82F6 : 0x334155;
    const autoBtn = this._createButton(scene, px + btnGap / 2, btnY, btnW, btnH,
      '자동 레벨업', autoColor, () => {
        if (isMaxLevel) { this._showMessage('최대 레벨입니다!'); return; }
        this._autoLevelUp(heroId);
      });
    this.container.add(autoBtn);

    // Evolve button (below)
    const evoBtnY = btnY + btnH + s(10);
    const evoBtn = this._createButton(scene, px - btnW / 2, evoBtnY, btnW * 2 + btnGap, btnH,
      `⭐ 진화 (조각 필요)`, 0x7C3AED, () => {
        this._evolve(heroId);
      });
    this.container.add(evoBtn);

    // === Resources display ===
    const resY = top + panelH - s(160);
    const resText = scene.add.text(left + s(35), resY, `💰 ${gold.toLocaleString()}   📕 ${scene.registry?.get('skillBooks') || 0}`, {
      fontSize: sf(12), fontFamily: 'Arial', color: '#94A3B8'
    });
    this.container.add(resText);

    // --- Entrance animation ---
    this.container.setAlpha(0);
    scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: 200,
      ease: 'Power2'
    });
  }

  _levelUp(heroId) {
    const scene = this.scene;
    const saveData = SaveManager.load();
    const charData = (saveData?.characters || []).find(c => c.id === heroId || c.characterId === heroId);
    if (!charData) return;

    const gold = scene.registry?.get('gold') || 0;
    const cost = (charData.level || 1) * 100;
    const rKey = getRarityKey(charData.rarity);
    const maxLevel = MAX_LEVELS[rKey] || 60;

    if (charData.level >= maxLevel) {
      this._showMessage('최대 레벨입니다!');
      return;
    }
    if (gold < cost) {
      this._showMessage(`골드 부족! (${cost} 필요)`);
      return;
    }

    // Deduct gold, increase level & stats
    scene.registry.set('gold', gold - cost);
    charData.level = (charData.level || 1) + 1;
    charData.stats = charData.stats || {};
    charData.stats.hp = Math.floor((charData.stats.hp || 800) * 1.05);
    charData.stats.atk = Math.floor((charData.stats.atk || 80) * 1.03);
    charData.stats.def = Math.floor((charData.stats.def || 40) * 1.03);
    charData.stats.spd = Math.floor((charData.stats.spd || 95) * 1.01);

    // Save
    SaveManager.updateCharacter(heroId, {
      level: charData.level,
      stats: charData.stats
    });
    const sd = SaveManager.load();
    sd.resources.gold = scene.registry.get('gold');
    SaveManager.save(sd);

    // Update registry heroes
    const heroes = scene.registry.get('ownedHeroes') || [];
    const idx = heroes.findIndex(h => h.id === heroId);
    if (idx >= 0) {
      heroes[idx] = { ...heroes[idx], ...charData };
      scene.registry.set('ownedHeroes', heroes);
    }

    this._showMessage(`Lv.${charData.level}! 레벨업 성공`);
    this._refresh();
  }

  _autoLevelUp(heroId) {
    const scene = this.scene;
    let leveled = 0;

    for (let i = 0; i < 50; i++) {
      const saveData = SaveManager.load();
      const charData = (saveData?.characters || []).find(c => c.id === heroId || c.characterId === heroId);
      if (!charData) break;

      const gold = scene.registry?.get('gold') || 0;
      const cost = (charData.level || 1) * 100;
      const rKey = getRarityKey(charData.rarity);
      const maxLevel = MAX_LEVELS[rKey] || 60;

      if (charData.level >= maxLevel || gold < cost) break;

      scene.registry.set('gold', gold - cost);
      charData.level = (charData.level || 1) + 1;
      charData.stats = charData.stats || {};
      charData.stats.hp = Math.floor((charData.stats.hp || 800) * 1.05);
      charData.stats.atk = Math.floor((charData.stats.atk || 80) * 1.03);
      charData.stats.def = Math.floor((charData.stats.def || 40) * 1.03);
      charData.stats.spd = Math.floor((charData.stats.spd || 95) * 1.01);

      SaveManager.updateCharacter(heroId, { level: charData.level, stats: charData.stats });
      leveled++;
    }

    if (leveled > 0) {
      const sd = SaveManager.load();
      sd.resources.gold = scene.registry.get('gold');
      SaveManager.save(sd);

      const heroes = scene.registry.get('ownedHeroes') || [];
      const charData = (sd?.characters || []).find(c => c.id === heroId);
      const idx = heroes.findIndex(h => h.id === heroId);
      if (idx >= 0 && charData) {
        heroes[idx] = { ...heroes[idx], ...charData };
        scene.registry.set('ownedHeroes', heroes);
      }

      this._showMessage(`+${leveled} 레벨업! Lv.${charData?.level}`);
      this._refresh();
    } else {
      this._showMessage('레벨업 불가 (골드 부족 / 최대 레벨)');
    }
  }

  _evolve(heroId) {
    const result = ProgressionSystem.evolve(heroId);
    if (result.success) {
      this._showMessage(`⭐ 진화 성공! ${result.newStars}성`);
      this._refresh();
    } else {
      this._showMessage(result.error || '진화 실패');
    }
  }

  _refresh() {
    if (this.heroId) {
      this.scene.time.delayedCall(300, () => this.show(this.heroId));
    }
  }

  _showMessage(text) {
    const scene = this.scene;
    const msg = scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(50), text, {
      fontSize: sf(16), fontFamily: 'Arial', fontStyle: 'bold',
      color: '#FFFFFF', backgroundColor: '#1E293B',
      padding: { x: s(16), y: s(8) }
    }).setOrigin(0.5).setDepth(Z_INDEX.TOOLTIP + 10);

    scene.tweens.add({
      targets: msg,
      y: msg.y - s(40),
      alpha: 0,
      duration: 1200,
      delay: 600,
      onComplete: () => msg.destroy()
    });
  }

  _createButton(scene, x, y, w, h, text, color, callback) {
    const btn = scene.add.container(x + w / 2, y + h / 2);
    const bg = scene.add.rectangle(0, 0, w, h, color, 0.9)
      .setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(s(1), 0xFFFFFF, 0.2);
    const label = scene.add.text(0, 0, text, {
      fontSize: sf(13), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    btn.add([bg, label]);

    bg.on('pointerover', () => { bg.setAlpha(0.7); btn.setScale(1.03); });
    bg.on('pointerout', () => { bg.setAlpha(1); btn.setScale(1); });
    bg.on('pointerdown', callback);
    return btn;
  }

  _createSmallButton(scene, x, y, text, color, callback) {
    const btn = scene.add.container(x, y);
    const bg = scene.add.rectangle(0, 0, s(90), s(22), color, 0.8)
      .setInteractive({ useHandCursor: true });
    const label = scene.add.text(0, 0, text, {
      fontSize: sf(10), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    btn.add([bg, label]);
    bg.on('pointerdown', callback);
    return btn;
  }

  _destroyImmediate() {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
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
