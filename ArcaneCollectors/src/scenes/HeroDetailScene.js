import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, CULTS, CULT_COLORS, CULT_INFO, EQUIPMENT_SLOTS } from '../config/gameConfig.js';
import { getRarityKey } from '../utils/rarityUtils.js';
import { EvolutionSystem } from '../systems/EvolutionSystem.js';
import { EquipmentSystem } from '../systems/EquipmentSystem.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { SaveManager } from '../systems/SaveManager.js';
import transitionManager from '../utils/TransitionManager.js';

export class HeroDetailScene extends Phaser.Scene {
  constructor() {
    super({ key: 'HeroDetailScene' });
    this.hero = null;
    this.isLevelingUp = false;
    this.activeTweens = [];
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

    this.createBackground();
    this.createHeader();
    this.createHeroDisplay();
    this.createStatsPanel();
    this.createSkillsPanel();
    this.createActionButtons();
    this.createEquipmentSlots();
    } catch (error) {
      console.error('[HeroDetailScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
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
    this.add.rectangle(GAME_WIDTH / 2, 50, GAME_WIDTH, 100, COLORS.backgroundLight, 0.9);

    // Back button
    const backBtn = this.add.container(40, 50);
    const backBg = this.add.rectangle(0, 0, 60, 40, COLORS.backgroundLight, 0.8)
      .setInteractive({ useHandCursor: true });
    const backText = this.add.text(0, 0, '← 뒤로', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);

    backBg.on('pointerdown', () => {
      // PRD VFX-1.2: HeroDetail → HeroList = zoomOut
      transitionManager.zoomTransition(this, 'HeroListScene', {}, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'out', 300);
    });

    // Hero name and rarity
    const heroRarityKey = getRarityKey(this.hero.rarity);
    const rarityColor = (RARITY[heroRarityKey] || RARITY.N).color;
    this.add.text(GAME_WIDTH / 2, 40, this.hero.name, {
      fontSize: '22px',
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 65, `${heroRarityKey} · Lv.${this.hero.level}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  rarityColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Mood indicator (분위기)
    const moodKey = this.hero.mood || 'balanced';
    const moodColor = COLORS.primary;
    this.add.circle(GAME_WIDTH - 50, 50, 12, moodColor, 0.8);
    this.add.text(GAME_WIDTH - 50, 50, moodKey.substring(0, 2), {
      fontSize: '8px',
      fontFamily: 'Arial',
      color: '#ffffff'
    }).setOrigin(0.5);
  }

  createHeroDisplay() {
    // Character illustration area
    const displayY = 230;

    // Frame
    const frame = this.add.rectangle(GAME_WIDTH / 2, displayY, 180, 200, COLORS.backgroundLight, 0.3);
    const frameRarityColor = (RARITY[getRarityKey(this.hero.rarity)] || RARITY.N).color;
    frame.setStrokeStyle(3, frameRarityColor, 0.8);

    // Hero image
    const heroImg = this.add.image(GAME_WIDTH / 2, displayY, 'hero_placeholder');
    heroImg.setScale(2);

    // Idle animation
    this.tweens.add({
      targets: heroImg,
      y: displayY - 5,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Stars
    this.add.text(GAME_WIDTH / 2, displayY + 115, '★'.repeat(this.hero.stars || this.hero.rarity || 1), {
      fontSize: '20px',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Rarity glow for SSR
    if (this.hero.rarity === 'SSR') {
      const glow = this.add.circle(GAME_WIDTH / 2, displayY, 90, rarityColor, 0.2);
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
    const panelY = 420;

    // Panel background
    const panel = this.add.rectangle(GAME_WIDTH / 2, panelY, GAME_WIDTH - 40, 120, COLORS.backgroundLight, 0.8);
    panel.setStrokeStyle(1, COLORS.primary, 0.5);

    // Panel title
    this.add.text(40, panelY - 50, '능력치', {
      fontSize: '16px',
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

    const startY = panelY - 30;

    statData.forEach((stat, index) => {
      const y = startY + index * 28;

      // Stat name
      this.add.text(40, y, stat.key, {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0, 0.5);

      // Stat value
      this.add.text(90, y, stat.value.toString(), {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0, 0.5);

      // Stat bar background
      this.add.rectangle(280, y, 150, 12, COLORS.backgroundLight, 1).setOrigin(0, 0.5);

      // Stat bar fill
      const fillWidth = Math.min(150, (stat.value / stat.maxVal) * 150);
      this.add.rectangle(280, y, fillWidth, 10, stat.color, 1).setOrigin(0, 0.5);
    });

    // Total power
    const totalPower = stats.hp + stats.atk * 5 + stats.def * 3 + stats.spd * 2;
    this.add.text(GAME_WIDTH - 40, panelY + 45, `전투력: ${totalPower.toLocaleString()}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(1, 0.5);
  }

  createSkillsPanel() {
    const panelY = 560;

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

      this.add.text(x, y - 5, '⚔', {
        fontSize: '20px'
      }).setOrigin(0.5);

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
    const slotsY = 680;

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

      // Slot background with rarity color if equipped
      let bgColor = COLORS.backgroundLight;
      let bgAlpha = 0.6;
      if (equippedItem) {
        bgColor = RARITY[getRarityKey(equippedItem.rarity)]?.color || COLORS.backgroundLight;
        bgAlpha = 0.4;
      }

      const slotBg = this.add.rectangle(x, slotsY + 20, 65, 65, bgColor, bgAlpha);
      slotBg.setStrokeStyle(2, equippedItem ? RARITY[getRarityKey(equippedItem.rarity)]?.color || COLORS.textDark : COLORS.textDark, equippedItem ? 1 : 0.5);
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
        // Empty slot indicator
        this.add.text(x, slotsY + 15, '+', {
          fontSize: '22px',
          fontFamily: 'Arial',
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

      // Tooltip on hover
      if (equippedItem) {
        slotBg.on('pointerover', () => {
          const stats = equippedItem.baseStats || {};
          const statsText = Object.entries(stats).map(([k, v]) => `${k}: +${v}`).join('\n');
          this.showTooltip(x, slotsY - 30, `${equippedItem.name}\n${equippedItem.rarity} +${equippedItem.enhanceLevel || 0}\n${statsText}`);
        });

        slotBg.on('pointerout', () => {
          this.hideTooltip();
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
