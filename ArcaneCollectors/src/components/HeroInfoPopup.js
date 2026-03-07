/**
 * HeroInfoPopup.js
 * 영웅 정보 팝업 오버레이 - 씬 전환 없이 인라인 표시
 * 레벨업, 진화, 스킬 강화 기능 포함
 * BUG-07: 레이아웃 확장 + 스킬 상세 표시
 * BUG-14: 등급별 배경색 차별화
 */
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, s, sf } from '../config/gameConfig.js';
import { Z_INDEX, RARITY_COLORS } from '../config/layoutConfig.js';
import { getCharacter } from '../data/index.ts';
import { SaveManager } from '../systems/SaveManager.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';
import navigationManager from '../systems/NavigationManager.js';

const CLASS_ICONS = { warrior: '⚔️', mage: '🔮', archer: '🏹', healer: '💚' };
const CLASS_NAMES = { warrior: '전사', mage: '마법사', archer: '궁수', healer: '힐러' };
const STAT_COLORS = {
  hp: 0x10B981, atk: 0xEF4444, def: 0x3B82F6, spd: 0xF59E0B
};
const STAT_LABELS = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD' };
const MAX_LEVELS = { N: 30, R: 40, SR: 50, SSR: 60 };

// BUG-14: 등급별 배경 그라데이션 색상
const RARITY_BG_GRADIENTS = {
  N: { top: 0x374151, bottom: 0x1F2937 },
  R: { top: 0x1E3A5F, bottom: 0x0F172A },
  SR: { top: 0x4C1D95, bottom: 0x1E1B4B },
  SSR: { top: 0x78350F, bottom: 0x451A03 }
};

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

    // PopupBase가 depth 2000 사용 → 중첩 팝업은 2100으로 그 위에 표시
    this.container = scene.add.container(0, 0).setDepth(2100);
    navigationManager.pushPopup('HeroInfoPopup', this);

    // --- Overlay ---
    const overlay = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.destroy());
    this.container.add(overlay);

    // --- Panel (BUG-07: 확장된 크기 400x650, 버튼 수용을 위해 높이 증가) ---
    const panelW = s(400);
    const panelH = s(650);
    const px = GAME_WIDTH / 2;
    const py = GAME_HEIGHT / 2;
    const left = px - panelW / 2;
    const top = py - panelH / 2;

    // BUG-14: 등급별 배경 그라데이션
    const gradient = RARITY_BG_GRADIENTS[rKey] || RARITY_BG_GRADIENTS.N;
    const panel = scene.add.graphics();

    // 그라데이션 효과를 위한 여러 레이어
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const ratio = i / steps;
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(gradient.top),
        Phaser.Display.Color.ValueToColor(gradient.bottom),
        steps,
        i
      );
      const c = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
      panel.fillStyle(c, 0.97);
      panel.fillRoundedRect(left, top + (panelH / steps) * i, panelW, panelH / steps + 2, s(16));
    }

    // 등급별 테두리 글로우
    const rarityStyle = RARITY_COLORS[rKey] || RARITY_COLORS.N;
    panel.lineStyle(s(3), rarityStyle.border, 1);
    panel.strokeRoundedRect(left, top, panelW, panelH, s(16));

    // SSR 등급은 추가 글로우 효과
    if (rKey === 'SSR' && rarityStyle.glow) {
      panel.lineStyle(s(6), rarityStyle.glow, 0.3);
      panel.strokeRoundedRect(left - s(3), top - s(3), panelW + s(6), panelH + s(6), s(18));
    }

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

    // === HEADER SECTION: Portrait + Name + Rarity ===
    const headerY = top + s(30);

    // 캐릭터 초상화 (HeroListScene과 동일한 방식: hero_${id} 텍스처 우선, 없으면 이모지 폴백)
    const avatarSize = s(60);
    const avatarCircle = scene.add.circle(px, headerY + avatarSize / 2, avatarSize / 2, rarityStyle.border, 0.3);
    avatarCircle.setStrokeStyle(s(3), rarityStyle.border);
    this.container.add(avatarCircle);

    const heroTextureKey = heroId && scene.textures.exists(`hero_${heroId}`) ? `hero_${heroId}` : null;
    if (heroTextureKey) {
      // HeroListScene과 동일한 텍스처 기반 초상화
      const portraitImg = scene.add.image(px, headerY + avatarSize / 2, heroTextureKey);
      portraitImg.setDisplaySize(avatarSize, avatarSize);
      this.container.add(portraitImg);
    } else {
      // 텍스처 없을 때 이모지 폴백 (기존 방식 유지)
      const iconText = scene.add.text(px, headerY + avatarSize / 2 - s(3), classIcon, {
        fontSize: sf(40)
      }).setOrigin(0.5);
      this.container.add(iconText);
    }

    // 이름 (아바타 아래)
    const nameText = scene.add.text(px, headerY + avatarSize + s(12), hero.name || '???', {
      fontSize: sf(18), fontFamily: 'Arial', fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);
    this.container.add(nameText);

    // 등급 배지 (좌상단)
    const rarityBadge = scene.add.graphics();
    rarityBadge.fillStyle(rarityStyle.border, 1);
    rarityBadge.fillRoundedRect(left + s(15), top + s(15), s(45), s(22), s(6));
    this.container.add(rarityBadge);
    const rarityLabel = scene.add.text(left + s(37.5), top + s(26), rKey, {
      fontSize: sf(12), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    this.container.add(rarityLabel);

    // 클래스 + 레벨 정보
    const infoLine = scene.add.text(px, headerY + avatarSize + s(32), `${className}  Lv.${level}/${maxLevel}`, {
      fontSize: sf(13), fontFamily: 'Arial', color: '#CBD5E1'
    }).setOrigin(0.5);
    this.container.add(infoLine);

    // 별 등급
    const starsText = scene.add.text(px, headerY + avatarSize + s(48), '★'.repeat(starCount) + '☆'.repeat(Math.max(0, 6 - starCount)), {
      fontSize: sf(14), color: `#${rarityStyle.border.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.container.add(starsText);

    // === STATS SECTION ===
    const statsY = top + s(160);
    const barWidth = s(240);
    const barHeight = s(14);

    // 섹션 타이틀
    const statsTitle = scene.add.text(left + s(20), statsY - s(5), '능력치', {
      fontSize: sf(14), fontFamily: 'Arial', fontStyle: 'bold', color: '#F1F5F9'
    });
    this.container.add(statsTitle);

    // Use ProgressionSystem stats for level-scaled values
    let leveledStats = stats;
    try {
      leveledStats = ProgressionSystem.getStatsAtLevel(heroId, level) || stats;
    } catch (e) { /* fallback to raw stats */ }
    const maxVal = Math.max(leveledStats.hp || 1, (leveledStats.atk || 1) * 5, (leveledStats.def || 1) * 3, 1500);

    ['hp', 'atk', 'def', 'spd'].forEach((key, i) => {
      const y = statsY + s(20) + i * s(28);
      const val = leveledStats[key] || 0;
      const ratio = Math.min(val / maxVal, 1);
      const color = STAT_COLORS[key];

      const label = scene.add.text(left + s(20), y, STAT_LABELS[key], {
        fontSize: sf(12), fontFamily: 'Arial', fontStyle: 'bold',
        color: `#${color.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5);
      this.container.add(label);

      const barBg = scene.add.rectangle(left + s(70) + barWidth / 2, y, barWidth, barHeight, 0x1E293B, 1);
      this.container.add(barBg);

      const fillW = Math.max(barWidth * ratio, s(3));
      const barFill = scene.add.rectangle(left + s(70) + fillW / 2, y, fillW, barHeight, color, 0.85);
      this.container.add(barFill);

      const valText = scene.add.text(left + s(70) + barWidth + s(10), y, val.toLocaleString(), {
        fontSize: sf(11), fontFamily: 'Arial', fontStyle: 'bold', color: '#E2E8F0'
      }).setOrigin(0, 0.5);
      this.container.add(valText);
    });

    // === COMBAT POWER ===
    let power = 0;
    try {
      power = ProgressionSystem.calculatePower({ ...hero, characterId: heroId, skillLevels: hero.skillLevels || [1, 1] });
    } catch (e) {
      power = Math.floor((leveledStats.hp || 0) / 10 + (leveledStats.atk || 0) + (leveledStats.def || 0) + (leveledStats.spd || 0));
    }
    const powerText = scene.add.text(px, statsY + s(135), `⚡ 전투력: ${power.toLocaleString()}`, {
      fontSize: sf(14), fontFamily: 'Arial', fontStyle: 'bold', color: '#FCD34D'
    }).setOrigin(0.5);
    this.container.add(powerText);

    // === SKILLS SECTION (BUG-07: 스킬 상세 표시) ===
    const skillsY = statsY + s(165);
    const skills = staticData?.skills || hero.skills || [];
    const skillLevels = hero.skillLevels || [1, 1, 1]; // [passive, skill1, skill2]

    const skillTitle = scene.add.text(left + s(20), skillsY, '스킬 정보', {
      fontSize: sf(14), fontFamily: 'Arial', fontStyle: 'bold', color: '#F1F5F9'
    });
    this.container.add(skillTitle);

    if (skills.length === 0) {
      const noSkill = scene.add.text(px, skillsY + s(35), '스킬 정보 없음', {
        fontSize: sf(11), fontFamily: 'Arial', color: '#64748B', align: 'center'
      }).setOrigin(0.5);
      this.container.add(noSkill);
    } else {
      // 스킬 표시 (최대 3개: basic, skill1, skill2)
      skills.slice(0, 3).forEach((skill, i) => {
        const sy = skillsY + s(25) + i * s(70);
        const sLv = skillLevels[i] || 1;

        // 스킬 배경 박스
        const skillBox = scene.add.graphics();
        skillBox.fillStyle(0x1E293B, 0.5);
        skillBox.fillRoundedRect(left + s(20), sy - s(5), panelW - s(40), s(60), s(8));
        skillBox.lineStyle(s(1), rarityStyle.border, 0.3);
        skillBox.strokeRoundedRect(left + s(20), sy - s(5), panelW - s(40), s(60), s(8));
        this.container.add(skillBox);

        // 스킬 이름 + 레벨
        const skillName = scene.add.text(left + s(30), sy + s(3), `${skill.name || '???'} Lv.${sLv}`, {
          fontSize: sf(12), fontFamily: 'Arial', fontStyle: 'bold', color: '#F1F5F9'
        });
        this.container.add(skillName);

        // 스킬 설명 (줄바꿈 처리)
        const maxDescWidth = panelW - s(60);
        const skillDesc = scene.add.text(left + s(30), sy + s(20), skill.description || '설명 없음', {
          fontSize: sf(10), fontFamily: 'Arial', color: '#94A3B8',
          wordWrap: { width: maxDescWidth, useAdvancedWrap: true }
        });
        this.container.add(skillDesc);

        // 스킬 강화 버튼 (레벨 10 미만일 때만)
        if (sLv < 10) {
          const enhCost = ProgressionSystem.getSkillEnhanceCost(sLv);
          const enhBtn = this._createSmallButton(
            scene,
            left + panelW - s(105),
            sy + s(25),
            `강화 ${enhCost.gold}G`,
            0x6366F1,
            () => {
              const result = ProgressionSystem.enhanceSkill(heroId, i);
              if (result.success) {
                this._showMessage(`스킬 강화 성공! Lv.${result.newLevel}`);
                this._refresh();
              } else {
                this._showMessage(result.error || '강화 실패');
              }
            }
          );
          this.container.add(enhBtn);
        }
      });
    }

    // === ACTION BUTTONS ===
    // 스킬 3개 * s(70) + 여백 = 최대 s(235) 사용 → skillsY 기준 s(250) 아래에서 시작
    // panelH 내부에 수용되도록 top + panelH - s(105) 이하로 제한
    const skillsAreaBottom = skillsY + (skills.length > 0 ? Math.min(skills.length, 3) * s(70) + s(30) : s(50));
    const btnY = Math.max(skillsAreaBottom, top + panelH - s(110));
    const btnW = s(170);
    const btnH = s(36);
    const btnGap = s(10);

    // Resources display (위쪽으로 이동)
    const gold = scene.registry?.get('gold') || 0;
    const resY = btnY - s(30);
    const resText = scene.add.text(px, resY, `💰 ${gold.toLocaleString()}   📕 ${scene.registry?.get('skillBooks') || 0}`, {
      fontSize: sf(11), fontFamily: 'Arial', color: '#CBD5E1'
    }).setOrigin(0.5);
    this.container.add(resText);

    // Level Up button
    const isMaxLevel = level >= maxLevel;
    const canLevelUp = !isMaxLevel && gold >= levelUpCost;

    const lvBtnColor = canLevelUp ? 0x10B981 : 0x334155;
    const lvBtn = this._createButton(
      scene,
      left + s(20),
      btnY,
      btnW,
      btnH,
      isMaxLevel ? '최대 레벨' : `레벨업 ${levelUpCost}G`,
      lvBtnColor,
      () => {
        if (isMaxLevel) { this._showMessage('최대 레벨입니다!'); return; }
        this._levelUp(heroId);
      }
    );
    this.container.add(lvBtn);

    // Auto Level Up button
    const autoColor = canLevelUp ? 0x3B82F6 : 0x334155;
    const autoBtn = this._createButton(
      scene,
      left + s(20) + btnW + btnGap,
      btnY,
      btnW,
      btnH,
      '자동 레벨업',
      autoColor,
      () => {
        if (isMaxLevel) { this._showMessage('최대 레벨입니다!'); return; }
        this._autoLevelUp(heroId);
      }
    );
    this.container.add(autoBtn);

    // Evolve button (below)
    const evoBtnY = btnY + btnH + s(8);
    const evoBtn = this._createButton(
      scene,
      left + s(20),
      evoBtnY,
      panelW - s(40),
      btnH,
      `⭐ 진화 (조각 필요)`,
      0x7C3AED,
      () => {
        this._evolve(heroId);
      }
    );
    this.container.add(evoBtn);

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
    const btn = scene.add.container(x, y);
    const bg = scene.add.rectangle(0, 0, w, h, color, 0.9)
      .setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(s(1), 0xFFFFFF, 0.2);
    const label = scene.add.text(0, 0, text, {
      fontSize: sf(12), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    btn.add([bg, label]);

    bg.on('pointerover', () => { bg.setAlpha(0.7); btn.setScale(1.02); });
    bg.on('pointerout', () => { bg.setAlpha(1); btn.setScale(1); });
    bg.on('pointerdown', callback);
    return btn;
  }

  _createSmallButton(scene, x, y, text, color, callback) {
    const btn = scene.add.container(x, y);
    const bg = scene.add.rectangle(0, 0, s(85), s(24), color, 0.85)
      .setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(s(1), 0xFFFFFF, 0.2);
    const label = scene.add.text(0, 0, text, {
      fontSize: sf(9), fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    btn.add([bg, label]);
    bg.on('pointerover', () => bg.setAlpha(0.7));
    bg.on('pointerout', () => bg.setAlpha(0.85));
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
    navigationManager.popPopup();
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
