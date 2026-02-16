import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, CULTS, CULT_COLORS, CULT_INFO, EQUIPMENT_SLOTS, MOODS, s, sf } from '../config/gameConfig.js';
import { RARITY_COLORS } from '../config/layoutConfig.js';
import { getRarityKey } from '../utils/rarityUtils.js';
import { EvolutionSystem } from '../systems/EvolutionSystem.js';
import { EquipmentSystem } from '../systems/EquipmentSystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { SaveManager } from '../systems/SaveManager.js';
import transitionManager from '../utils/TransitionManager.js';
import uiRenderer from '../renderers/UIRenderer.js';
import characterRenderer from '../renderers/CharacterRenderer.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import { RadarChart } from '../components/RadarChart.js';
import navigationManager from '../systems/NavigationManager.js';

export class HeroDetailScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HeroDetailScene' });
    this.hero = null;
    this.isLevelingUp = false;
    this.activeTweens = [];
    this._loadedHeroId = null; // RES-ABS-4: 로드된 히어로 추적
  }

  init(data) {
    this.heroId = data?.heroId;
    this.isLevelingUp = false;
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);

    // Find hero data
    const heroes = this.registry.get('ownedHeroes') || [];
    this.hero = heroes.find(h => h.id === this.heroId);

    if (!this.hero) {
      this.scene.start('HeroListScene');
      return;
    }

    // RES-ABS-4: 단일 히어로 카드 동적 로드
    this._loadedHeroId = this.hero.id;
    if (characterRenderer.useAssets) {
      characterRenderer.preloadAssets(this, [this.hero], { ids: [this.hero.id], types: ['card'] });
      this.load.start();
      this.load.once('complete', () => {
        this.initUI();
      });
    } else {
      this.initUI();
    }
    } catch (error) {
      console.error('[HeroDetailScene] create() 실패:', error);
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  initUI() {
    this.createBackground();
    this.createHeader();
    this.createHeroDisplay();
    this.createStatsPanel();
    this.createSkillsPanel();
    this.createActionButtons();
    this.createEquipmentSlots();
  }

  createBackground() {
    // Gradient background
    const graphics = this.add.graphics();

    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const baseColor = Phaser.Display.Color.IntegerToColor(COLORS.background);
      const accentColor = Phaser.Display.Color.IntegerToColor(COLORS.primary);

      const r = Math.floor(baseColor.red + (accentColor.red - baseColor.red) * ratio * 0.2);
      const g = Math.floor(baseColor.green + (accentColor.green - baseColor.green) * ratio * 0.2);
      const b = Math.floor(baseColor.blue + (accentColor.blue - baseColor.blue) * ratio * 0.2);

      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }
  }

  createHeader() {
    // Header background
    this.add.rectangle(GAME_WIDTH / 2, s(50), GAME_WIDTH, s(100), COLORS.backgroundLight, 0.9);

    // Back button
    const backBtn = this.add.container(s(40), s(50));
    const backBg = this.add.rectangle(0, 0, s(60), s(40), COLORS.backgroundLight, 0.8)
      .setInteractive({ useHandCursor: true });
    const backText = this.add.text(0, 0, '← 뒤로', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);

    backBg.on('pointerdown', () => {
      navigationManager.goBack(this);
    });

    // Hero name and rarity
    const heroRarityKey = getRarityKey(this.hero.rarity);
    const rarityColor = (RARITY[heroRarityKey] || RARITY.N).color;
    this.add.text(GAME_WIDTH / 2, s(40), this.hero.name, {
      fontSize: sf(22),
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, s(65), `${heroRarityKey} · Lv.${this.hero.level}`, {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  rarityColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Mood indicator (분위기) - 실제 mood 색상 사용
    const moodKey = this.hero.mood || 'balanced';
    const moodInfo = MOODS[moodKey];
    const moodColor = moodInfo?.color || COLORS.primary;
    const moodName = moodInfo?.name || moodKey.substring(0, 2);
    this.add.circle(GAME_WIDTH - s(50), s(50), s(14), moodColor, 0.8);
    this.add.text(GAME_WIDTH - s(50), s(50), moodName.substring(0, 2), {
      fontSize: sf(9),
      fontFamily: 'Arial',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  createHeroDisplay() {
    // Character illustration area
    const displayY = s(230);

    // Frame with RARITY_COLORS
    const heroRKey = getRarityKey(this.hero.rarity);
    const frameRarityColorSet = RARITY_COLORS[heroRKey] || RARITY_COLORS.N;
    const frame = this.add.rectangle(GAME_WIDTH / 2, displayY, s(180), s(200), frameRarityColorSet.bg, 0.3);
    frame.setStrokeStyle(s(3), frameRarityColorSet.border, 0.8);

    // Hero image
    const heroImg = this.add.image(GAME_WIDTH / 2, displayY, 'hero_placeholder');
    heroImg.setScale(2);

    // Idle animation
    this.tweens.add({
      targets: heroImg,
      y: displayY - s(5),
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Stars
    this.add.text(GAME_WIDTH / 2, displayY + s(115), '★'.repeat(this.hero.stars || this.hero.rarity || 1), {
      fontSize: sf(20),
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Rarity glow for SSR+ (rarity 4+ or key 'SSR'/'UR')
    if (frameRarityColorSet.glow) {
      const glow = this.add.circle(GAME_WIDTH / 2, displayY, s(90), frameRarityColorSet.glow, 0.2);
      this.tweens.add({
        targets: glow,
        scale: { from: 0.9, to: 1.1 },
        alpha: { from: 0.3, to: 0.1 },
        duration: 1500,
        yoyo: true,
        repeat: -1
      });
    }
  }

  createStatsPanel() {
    const panelY = s(420);

    // UIX-2.3.1: Increased panel height for radar chart
    const panelHeight = s(220);

    // Panel background
    const panel = this.add.rectangle(GAME_WIDTH / 2, panelY + s(50), GAME_WIDTH - s(40), panelHeight, COLORS.backgroundLight, 0.8);
    panel.setStrokeStyle(1, COLORS.primary, 0.5);

    // Panel title
    this.add.text(s(40), panelY - s(50), '능력치', {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    });

    // Stats
    const stats = this.hero.stats || { hp: 0, atk: 0, def: 0, spd: 0 };
    const statData = [
      { key: 'HP', value: stats.hp, color: COLORS.success, maxVal: 2000 },
      { key: 'ATK', value: stats.atk, color: COLORS.danger, maxVal: 500 },
      { key: 'DEF', value: stats.def, color: COLORS.primary, maxVal: 400 },
      { key: 'SPD', value: stats.spd, color: COLORS.accent, maxVal: 150 }
    ];

    const startY = panelY - s(30);

    statData.forEach((stat, index) => {
      const y = startY + index * s(28);

      // Stat name
      this.add.text(s(40), y, stat.key, {
        fontSize: sf(13),
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5);

      // Stat value
      this.add.text(s(90), y, stat.value.toString(), {
        fontSize: sf(13),
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0, 0.5);

      // Stat bar background
      this.add.rectangle(s(280), y, s(150), s(12), COLORS.backgroundLight, 1).setOrigin(0, 0.5);

      // Stat bar fill
      const fillWidth = Math.min(s(150), (stat.value / stat.maxVal) * s(150));
      this.add.rectangle(s(280), y, fillWidth, s(10), stat.color, 1).setOrigin(0, 0.5);
    });

    // Total power
    const totalPower = stats.hp + stats.atk * 5 + stats.def * 3 + stats.spd * 2;
    this.add.text(GAME_WIDTH - s(40), panelY + s(45), `전투력: ${totalPower.toLocaleString()}`, {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(1, 0.5);

    // UIX-2.3.1: Add radar chart
    const heroRarityKey = getRarityKey(this.hero.rarity);

    // Calculate average stats for same rarity (mock data)
    const averageStats = this.calculateAverageStats(heroRarityKey);

    this.radarChart = new RadarChart(this, GAME_WIDTH / 2, panelY + s(120), stats, {
      radius: s(70),
      rarity: heroRarityKey,
      maxStats: { hp: 2000, atk: 500, def: 400, spd: 150 },
      showAverage: true,
      averageStats: averageStats,
      previewStats: null // Will be set when equipment is selected
    });
  }

  /**
   * UIX-2.3.1: Calculate average stats for same rarity heroes
   */
  calculateAverageStats(rarity) {
    const heroes = this.registry.get('ownedHeroes') || [];
    const sameRarityHeroes = heroes.filter(h => getRarityKey(h.rarity) === rarity);

    if (sameRarityHeroes.length === 0) {
      return { hp: 0, atk: 0, def: 0, spd: 0 };
    }

    const sum = sameRarityHeroes.reduce((acc, h) => ({
      hp: acc.hp + (h.stats?.hp || 0),
      atk: acc.atk + (h.stats?.atk || 0),
      def: acc.def + (h.stats?.def || 0),
      spd: acc.spd + (h.stats?.spd || 0)
    }), { hp: 0, atk: 0, def: 0, spd: 0 });

    return {
      hp: Math.floor(sum.hp / sameRarityHeroes.length),
      atk: Math.floor(sum.atk / sameRarityHeroes.length),
      def: Math.floor(sum.def / sameRarityHeroes.length),
      spd: Math.floor(sum.spd / sameRarityHeroes.length)
    };
  }

  createSkillsPanel() {
    // UIX-2.3.1: Adjusted Y position for larger stats panel
    const panelY = 660;

    // Panel background
    const panel = this.add.rectangle(GAME_WIDTH / 2, panelY, GAME_WIDTH - 40, 100, COLORS.backgroundLight, 0.8);
    panel.setStrokeStyle(1, COLORS.primary, 0.5);

    // Panel title
    this.add.text(40, panelY - 40, '스킬', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    });

    // Skills (generate placeholder skills with enhancement capability)
    const skillLevels = this.hero.skillLevels || [1, 1];
    const skills = this.hero.skills && this.hero.skills.length > 0 ? this.hero.skills : [
      { name: '기본 공격', description: '적에게 100% 피해를 입힌다' },
      { name: '특수 공격', description: '적에게 150% 피해를 입힌다' }
    ];

    skills.forEach((skill, index) => {
      const x = 60 + index * 200;
      const y = panelY;
      const skillLevel = skillLevels[index] || 1;
      const maxSkillLevel = 10;

      // Skill icon placeholder
      const iconBg = this.add.rectangle(x, y, 45, 45, COLORS.primary, 0.5);
      iconBg.setStrokeStyle(2, COLORS.primary);
      iconBg.setInteractive({ useHandCursor: true });

      const skillIcon = uiRenderer.renderIcon(this, x, y - 5, { type: 'stat', key: 'atk', size: 20 });
      this.add.existing(skillIcon);

      this.add.text(x, y + 18, `Lv.${skillLevel}/${maxSkillLevel}`, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      // Skill name
      this.add.text(x + 35, y - 15, skill.name, {
        fontSize: '11px',
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0, 0.5);

      // Skill description
      const desc = skill.description || '스킬 설명';
      this.add.text(x + 35, y + 2, desc.length > 12 ? `${desc.substring(0, 12)  }..` : desc, {
        fontSize: '9px',
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5);

      // Skill enhance button
      if (skillLevel < maxSkillLevel) {
        const enhanceBtn = this.add.container(x + 120, y + 15);
        const enhanceBg = this.add.rectangle(0, 0, 50, 22, COLORS.success, 0.9)
          .setInteractive({ useHandCursor: true });
        const enhanceText = this.add.text(0, 0, '강화', {
          fontSize: '10px',
          fontFamily: 'Arial',
          color: '#ffffff'
        }).setOrigin(0.5);

        enhanceBtn.add([enhanceBg, enhanceText]);

        enhanceBg.on('pointerdown', () => {
          this.enhanceSkill(index);
        });
      }

      // Tooltip on hover
      iconBg.on('pointerover', () => {
        const damageBonus = (skillLevel - 1) * 5;
        const enhancedDesc = `${skill.name}\n${skill.description}\n데미지 보너스: +${damageBonus}%`;
        this.showTooltip(x, y - 60, enhancedDesc);
      });

      iconBg.on('pointerout', () => {
        this.hideTooltip();
      });
    });
  }

  enhanceSkill(skillIndex) {
    const gold = this.registry.get('gold') || 0;
    const skillBooks = this.registry.get('skillBooks') || 0;
    const currentLevel = (this.hero.skillLevels || [1, 1])[skillIndex] || 1;

    // Calculate cost
    const goldCost = currentLevel * currentLevel * 1000;
    const bookCost = Math.ceil(Math.pow(1.5, currentLevel - 1));

    if (gold < goldCost) {
      this.showMessage(`골드가 부족합니다! (${goldCost} 필요)`);
      return;
    }

    if (skillBooks < bookCost) {
      this.showMessage(`스킬북이 부족합니다! (${bookCost} 필요)`);
      return;
    }

    // Deduct resources
    this.registry.set('gold', gold - goldCost);
    this.registry.set('skillBooks', skillBooks - bookCost);

    // Upgrade skill
    if (!this.hero.skillLevels) {
      this.hero.skillLevels = [1, 1];
    }
    this.hero.skillLevels[skillIndex] = currentLevel + 1;

    // Update registry
    const heroes = this.registry.get('ownedHeroes') || [];
    const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
    if (heroIndex >= 0) {
      heroes[heroIndex] = this.hero;
      this.registry.set('ownedHeroes', heroes);
    }
    this.persistHeroData();

    this.showMessage(`스킬 Lv.${currentLevel + 1} 달성!`, COLORS.success);

    // Soft refresh without full scene restart
    this.time.delayedCall(300, () => {
      this.scene.restart({ heroId: this.heroId });
    });
  }

  createEquipmentSlots() {
    // UIX-2.3.1: Adjusted Y position for larger stats panel
    const slotsY = 780;

    // Equipment title
    this.add.text(40, slotsY - 25, '장비', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    });

    // 4 equipment slots: weapon, armor, accessory, relic
    const slots = [
      { key: 'weapon', name: '무기', icon: '⚔' },
      { key: 'armor', name: '방어구', icon: '🛡' },
      { key: 'accessory', name: '악세서리', icon: '💍' },
      { key: 'relic', name: '유물', icon: '✨' }
    ];

    const startX = GAME_WIDTH / 2 - 135;
    const equipped = this.hero.equipment || {};

    slots.forEach((slot, index) => {
      const x = startX + index * 90;

      // Get equipped item if any
      const equippedItem = equipped[slot.key];

      // Slot background with rarity color if equipped (RARITY_COLORS 적용)
      let bgColor = COLORS.bgPanel;
      let bgAlpha = 0.4;
      let borderColor = COLORS.textDark;
      let borderAlpha = 0.3;

      if (equippedItem) {
        const eqRKey = getRarityKey(equippedItem.rarity);
        const eqColorSet = RARITY_COLORS[eqRKey] || RARITY_COLORS.N;
        bgColor = eqColorSet.bg;
        bgAlpha = 0.5;
        borderColor = eqColorSet.border;
        borderAlpha = 1;
      }

      const slotBg = this.add.rectangle(x, slotsY + 20, 65, 65, bgColor, bgAlpha);
      slotBg.setStrokeStyle(2, borderColor, borderAlpha);
      slotBg.setInteractive({ useHandCursor: true });

      // Slot content
      if (equippedItem) {
        // Show equipped item
        this.add.text(x, slotsY + 10, slot.icon, {
          fontSize: '18px'
        }).setOrigin(0.5);

        this.add.text(x, slotsY + 30, `+${equippedItem.enhanceLevel || 0}`, {
          fontSize: '10px',
          fontFamily: 'Arial',
          fontStyle: 'bold',
          color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
        }).setOrigin(0.5);
      } else {
        // Empty slot - 반투명 타입 아이콘 + '+' 표시
        this.add.text(x, slotsY + 10, slot.icon, {
          fontSize: '20px',
          alpha: 0.25
        }).setOrigin(0.5).setAlpha(0.25);

        this.add.text(x, slotsY + 32, '+', {
          fontSize: '14px',
          fontFamily: 'Arial',
          fontStyle: 'bold',
          color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
        }).setOrigin(0.5);
      }

      // Slot label
      this.add.text(x, slotsY + 58, slot.name, {
        fontSize: '10px',
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      slotBg.on('pointerdown', () => {
        if (equippedItem) {
          this.showEquipmentOptions(slot.key, equippedItem, x, slotsY);
        } else {
          this.showEquipmentList(slot.key);
        }
      });

      // UIX-2.3.1: Tooltip on hover + radar chart preview
      if (equippedItem) {
        slotBg.on('pointerover', () => {
          const stats = equippedItem.stats || {};
          const statsText = Object.entries(stats).map(([k, v]) => `${k}: +${v}`).join('\n');
          this.showTooltip(x, slotsY - 30, `${equippedItem.name}\n${equippedItem.rarity} +${equippedItem.enhanceLevel || 0}\n${statsText}`);

          // Show preview on radar chart
          const previewStats = { ...this.hero.stats };
          if (stats.hp) previewStats.hp += stats.hp;
          if (stats.atk) previewStats.atk += stats.atk;
          if (stats.def) previewStats.def += stats.def;
          if (stats.spd) previewStats.spd += stats.spd;

          if (this.radarChart) {
            this.radarChart.updateStats(this.hero.stats, previewStats);
          }
        });

        slotBg.on('pointerout', () => {
          this.hideTooltip();

          // Clear preview
          if (this.radarChart) {
            this.radarChart.updateStats(this.hero.stats, null);
          }
        });
      }
    });
  }

  showEquipmentOptions(slotKey, equipment, x, y) {
    // Simple popup for now - unequip option
    const popup = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(100);

    const bg = this.add.rectangle(0, 0, 200, 150, COLORS.backgroundLight, 0.95);
    bg.setStrokeStyle(2, COLORS.primary);

    const title = this.add.text(0, -55, equipment.name, {
      fontSize: '14px',
      fontFamily: 'Arial',
      fontStyle: 'bold',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    const unequipBtn = this.add.rectangle(0, 0, 120, 35, COLORS.danger, 0.9)
      .setInteractive({ useHandCursor: true });
    const unequipText = this.add.text(0, 0, '장비 해제', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#ffffff'
    }).setOrigin(0.5);

    const closeBtn = this.add.rectangle(0, 50, 120, 35, COLORS.textDark, 0.9)
      .setInteractive({ useHandCursor: true });
    const closeText = this.add.text(0, 50, '닫기', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#ffffff'
    }).setOrigin(0.5);

    popup.add([bg, title, unequipBtn, unequipText, closeBtn, closeText]);

    unequipBtn.on('pointerdown', () => {
      // Unequip item
      if (!this.hero.equipment) this.hero.equipment = {};
      this.hero.equipment[slotKey] = null;

      // Update registry
      const heroes = this.registry.get('ownedHeroes') || [];
      const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
      if (heroIndex >= 0) {
        heroes[heroIndex] = this.hero;
        this.registry.set('ownedHeroes', heroes);
      }
      this.persistHeroData();

      popup.destroy();
      this.showMessage('장비 해제 완료!');
      this.time.delayedCall(200, () => {
        this.scene.restart({ heroId: this.heroId });
      });
    });

    closeBtn.on('pointerdown', () => {
      popup.destroy();
    });
  }

  showEquipmentList(slotKey) {
    // Show available equipment for this slot
    this.showMessage(`${EQUIPMENT_SLOTS[slotKey]?.name || slotKey} 장비 선택 준비 중!`);
  }

  createActionButtons() {
    const buttonY = GAME_HEIGHT - 60;

    // Level up button
    this.createActionButton(GAME_WIDTH / 4, buttonY, '레벨업', COLORS.success, () => {
      this.levelUpHero();
    });

    // Auto Level button (quick level up)
    this.createActionButton(GAME_WIDTH / 2, buttonY, '자동 레벨업', COLORS.primary, () => {
      this.autoLevelUp();
    });

    // Evolution button - check if can evolve
    const canEvolve = !EvolutionSystem.isMaxRarity(this.hero.rarity);
    const evolveColor = canEvolve ? COLORS.secondary : COLORS.textDark;

    this.createActionButton(GAME_WIDTH * 3 / 4, buttonY, '진화', evolveColor, () => {
      this.evolveHero();
    });
  }

  autoLevelUp() {
    const gold = this.registry.get('gold') || 0;
    let totalLevels = 0;
    let totalCost = 0;

    // Level up as many times as affordable
    while (true) {
      const cost = this.hero.level * 100;
      if (gold - totalCost < cost) break;

      totalCost += cost;
      this.hero.level++;
      totalLevels++;

      // Apply stat increases
      this.hero.stats.hp = Math.floor(this.hero.stats.hp * 1.05);
      this.hero.stats.atk = Math.floor(this.hero.stats.atk * 1.03);
      this.hero.stats.def = Math.floor(this.hero.stats.def * 1.03);
      this.hero.stats.spd = Math.floor(this.hero.stats.spd * 1.01);

      // Check max level
      const maxLevels = { N: 30, R: 40, SR: 50, SSR: 60 };
      if (this.hero.level >= (maxLevels[this.hero.rarity] || 60)) break;
    }

    if (totalLevels === 0) {
      this.showMessage('골드가 부족합니다!');
      return;
    }

    // Deduct gold
    this.registry.set('gold', gold - totalCost);

    // Update registry
    const heroes = this.registry.get('ownedHeroes') || [];
    const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
    if (heroIndex >= 0) {
      heroes[heroIndex] = this.hero;
      this.registry.set('ownedHeroes', heroes);
    }
    this.persistHeroData();

    this.showMessage(`+${totalLevels} 레벨! (Lv.${this.hero.level})`, COLORS.success);

    this.time.delayedCall(300, () => {
      this.scene.restart({ heroId: this.heroId });
    });
  }

  evolveHero() {
    // Check if already max rarity
    if (EvolutionSystem.isMaxRarity(this.hero.rarity)) {
      this.showMessage('이미 최고 등급입니다!');
      return;
    }

    // Get evolution cost
    const cost = EvolutionSystem.getEvolutionCost(this.hero.rarity);
    const gold = this.registry.get('gold') || 0;
    const shards = this.registry.get(`shards_${this.hero.id}`) || 0;

    // Check requirements
    if (gold < cost.gold) {
      this.showMessage(`골드가 부족합니다! (${cost.gold} 필요)`);
      return;
    }

    if (shards < cost.shards) {
      this.showMessage(`조각이 부족합니다! (${shards}/${cost.shards})`);
      return;
    }

    // Show evolution preview popup
    this.showEvolutionPreview(cost, shards);
  }

  showEvolutionPreview(cost, currentShards) {
    const preview = EvolutionSystem.previewEvolution(this.hero.id);
    if (!preview) {
      this.showMessage('진화 정보를 불러올 수 없습니다!');
      return;
    }

    const popup = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(100);

    const bg = this.add.rectangle(0, 0, 280, 220, COLORS.backgroundLight, 0.95);
    bg.setStrokeStyle(2, COLORS.secondary);

    const title = this.add.text(0, -90, '진화 확인', {
      fontSize: '16px',
      fontFamily: 'Arial',
      fontStyle: 'bold',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    const rarityText = this.add.text(0, -60, `${preview.currentRarity} → ${preview.nextRarity}`, {
      fontSize: '20px',
      fontFamily: 'Arial',
      fontStyle: 'bold',
      color: `#${  RARITY[preview.nextRarity].color.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    const statsText = this.add.text(0, -20,
      `HP: +${preview.statGain.hp}  ATK: +${preview.statGain.atk}\nDEF: +${preview.statGain.def}  SPD: +${preview.statGain.spd}`, {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: `#${  COLORS.success.toString(16).padStart(6, '0')}`,
      align: 'center'
    }).setOrigin(0.5);

    const costText = this.add.text(0, 25,
      `비용: ${cost.gold} 골드 / ${cost.shards} 조각`, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    const confirmBtn = this.add.rectangle(-50, 75, 90, 35, COLORS.secondary, 0.9)
      .setInteractive({ useHandCursor: true });
    const confirmText = this.add.text(-50, 75, '진화', {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#ffffff'
    }).setOrigin(0.5);

    const cancelBtn = this.add.rectangle(50, 75, 90, 35, COLORS.textDark, 0.9)
      .setInteractive({ useHandCursor: true });
    const cancelText = this.add.text(50, 75, '취소', {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#ffffff'
    }).setOrigin(0.5);

    popup.add([bg, title, rarityText, statsText, costText, confirmBtn, confirmText, cancelBtn, cancelText]);

    confirmBtn.on('pointerdown', () => {
      popup.destroy();
      this.executeEvolution(cost, preview);
    });

    cancelBtn.on('pointerdown', () => {
      popup.destroy();
    });
  }

  executeEvolution(cost, preview) {
    const gold = this.registry.get('gold') || 0;
    const shards = this.registry.get(`shards_${this.hero.id}`) || 0;

    // Deduct resources
    this.registry.set('gold', gold - cost.gold);
    this.registry.set(`shards_${this.hero.id}`, shards - cost.shards);

    // Apply evolution
    this.hero.rarity = preview.nextRarity;
    this.hero.stats.hp = preview.previewStats.hp;
    this.hero.stats.atk = preview.previewStats.atk;
    this.hero.stats.def = preview.previewStats.def;
    this.hero.stats.spd = preview.previewStats.spd;

    // Boost skill levels
    if (this.hero.skillLevels && preview.skillBoost > 0) {
      this.hero.skillLevels = this.hero.skillLevels.map(lv => Math.min(10, lv + preview.skillBoost));
    }

    this.hero.evolutionCount = (this.hero.evolutionCount || 0) + 1;

    // Update registry
    const heroes = this.registry.get('ownedHeroes') || [];
    const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
    if (heroIndex >= 0) {
      heroes[heroIndex] = this.hero;
      this.registry.set('ownedHeroes', heroes);
    }
    this.persistHeroData();

    // Show success animation
    this.showEvolutionSuccess(preview.nextRarity);
  }

  showEvolutionSuccess(newRarity) {
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, RARITY[newRarity].color, 0.8)
      .setDepth(150);

    const successText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `${newRarity} 진화 성공!`, {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5).setDepth(151);

    this.tweens.add({
      targets: [flash, successText],
      alpha: 0,
      duration: 1500,
      delay: 800,
      onComplete: () => {
        flash.destroy();
        successText.destroy();
        this.scene.restart({ heroId: this.heroId });
      }
    });
  }

  createActionButton(x, y, label, color, callback) {
    const btn = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, 130, 45, color, 1);
    bg.setStrokeStyle(2, COLORS.text, 0.2);
    bg.setInteractive({ useHandCursor: true });

    const text = this.add.text(0, 0, label, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    btn.add([bg, text]);

    bg.on('pointerover', () => {
      bg.setFillStyle(color, 0.8);
      btn.setScale(1.05);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(color, 1);
      btn.setScale(1);
    });

    bg.on('pointerdown', () => {
      this.tweens.add({
        targets: btn,
        scale: 0.95,
        duration: 50,
        yoyo: true
      });
      callback();
    });

    return btn;
  }

  levelUpHero() {
    // Prevent multiple level up clicks during animation
    if (this.isLevelingUp) {
      return;
    }

    const gold = this.registry.get('gold') || 0;
    const cost = this.hero.level * 100;

    if (gold < cost) {
      this.showMessage(`골드가 부족합니다! (${cost} 필요)`);
      return;
    }

    // Check max level
    const maxLevels = { N: 30, R: 40, SR: 50, SSR: 60 };
    if (this.hero.level >= (maxLevels[this.hero.rarity] || 60)) {
      this.showMessage('최대 레벨입니다!');
      return;
    }

    this.isLevelingUp = true;

    // Deduct gold and level up
    this.registry.set('gold', gold - cost);
    this.hero.level++;

    // Increase stats
    this.hero.stats.hp = Math.floor(this.hero.stats.hp * 1.05);
    this.hero.stats.atk = Math.floor(this.hero.stats.atk * 1.03);
    this.hero.stats.def = Math.floor(this.hero.stats.def * 1.03);
    this.hero.stats.spd = Math.floor(this.hero.stats.spd * 1.01);

    // Update registry
    const heroes = this.registry.get('ownedHeroes') || [];
    const heroIndex = heroes.findIndex(h => h.id === this.hero.id);
    if (heroIndex >= 0) {
      heroes[heroIndex] = this.hero;
      this.registry.set('ownedHeroes', heroes);
    }
    this.persistHeroData();

    // Show success animation without full scene restart
    this.showLevelUpEffect();
  }

  showLevelUpEffect() {
    // Stop any existing tweens to prevent flicker
    this.stopAllActiveTweens();

    // Level up flash effect (subtle)
    const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.success, 0.3)
      .setDepth(100);

    const levelText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, `Lv.${this.hero.level}!`, {
      fontSize: '32px',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      color: `#${  COLORS.success.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(101);

    const tween = this.tweens.add({
      targets: [flash, levelText],
      alpha: 0,
      y: levelText.y - 30,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        flash.destroy();
        levelText.destroy();

        // Refresh scene with fade transition
        this.cameras.main.fadeOut(150, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.isLevelingUp = false;
          this.scene.restart({ heroId: this.heroId });
        });
      }
    });

    this.activeTweens.push(tween);
  }

  stopAllActiveTweens() {
    this.activeTweens.forEach(tween => {
      if (tween && tween.isPlaying && tween.isPlaying()) {
        tween.stop();
      }
    });
    this.activeTweens = [];
  }

  showTooltip(x, y, text) {
    this.hideTooltip();

    this.tooltip = this.add.container(x, y).setDepth(100);

    const bg = this.add.rectangle(0, 0, 150, 60, COLORS.backgroundLight, 0.95);
    bg.setStrokeStyle(1, COLORS.primary);

    const tooltipText = this.add.text(0, 0, text, {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      align: 'center',
      wordWrap: { width: 140 }
    }).setOrigin(0.5);

    this.tooltip.add([bg, tooltipText]);
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  /**
   * 영웅 데이터를 SaveManager에 영속화
   */
  persistHeroData() {
    try {
      if (this.hero && this.hero.id) {
        SaveManager.updateCharacter(this.hero.id, {
          level: this.hero.level,
          exp: this.hero.exp || 0,
          rarity: this.hero.rarity,
          stats: this.hero.stats,
          skillLevels: this.hero.skillLevels,
          evolutionCount: this.hero.evolutionCount || 0,
          equipment: this.hero.equipment || null
        });
      }
      // 골드/스킬북/조각 등 리소스도 동기화
      const saveData = SaveManager.load();
      const gold = this.registry.get('gold');
      if (gold !== undefined) {
        saveData.resources.gold = gold;
      }
      const skillBooks = this.registry.get('skillBooks');
      if (skillBooks !== undefined) {
        saveData.resources.skillBooks = skillBooks;
      }
      // 조각(shards) 동기화
      if (this.hero && this.hero.id) {
        const shards = this.registry.get(`shards_${this.hero.id}`);
        if (shards !== undefined) {
          if (!saveData.resources.characterShards) {
            saveData.resources.characterShards = {};
          }
          saveData.resources.characterShards[this.hero.id] = shards;
        }
      }
      SaveManager.save(saveData);
    } catch (e) {
      console.warn('[HeroDetail] Save error:', e.message);
    }
  }

  shutdown() {
    // RES-ABS-4: 메모리 해제
    if (this._loadedHeroId) {
      HeroAssetLoader.unloadTextures(this, [this._loadedHeroId]);
    }

    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
    this.stopAllActiveTweens();
  }

  showMessage(text, color = COLORS.text) {
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, text, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${  color.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${  COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: msg,
      alpha: 0,
      y: msg.y - 50,
      duration: 1500,
      delay: 500,
      onComplete: () => msg.destroy()
    });
  }
}
