import { COLORS, GAME_WIDTH, GAME_HEIGHT, LAYOUT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { BottomNav } from '../components/BottomNav.js';
import { energySystem } from '../systems/EnergySystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import transitionManager from '../utils/TransitionManager.js';
import { safeGet, safeCall } from '../utils/safeAccess.js';
import { Z_INDEX } from '../config/layoutConfig.js';
import EnergyBar from '../components/EnergyBar.js';
import { Modal } from '../components/Modal.js';
import { formatTime } from '../utils/colorUtils.js';
import { IdleProgressSystem } from '../systems/IdleProgressSystem.js';
import { IdleBattleView } from '../components/IdleBattleView.js';
import { getCharacter, calculatePower } from '../data/index.ts';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  init(data) {
    this.showOfflineRewards = data?.showOfflineRewards || null;
  }

  create() {
    try {
    this.cameras.main.fadeIn(400);

    // Initialize ParticleManager for dynamic effects
    this.particles = new ParticleManager(this);

    // Initialize IdleProgressSystem
    this.idleSystem = new IdleProgressSystem(this);

    // Load current resources from SaveManager (with null defense)
    const resources = SaveManager.getResources() || {};
    this.registry.set('gems', resources?.gems ?? 1500);
    this.registry.set('gold', resources?.gold ?? 10000);

    this.createBackground();
    this.createTopBar();
    this.createPartyDisplay();
    this.createCombatPowerDisplay();
    this.createAdventurePanel();
    this.createIdleBattleView();
    this.createIdleSummary();

    // === Content shortcut buttons ===
    this.createContentButtons();

    this.createBottomNavigation();

    // Show offline rewards popup if available (with null defense)
    if (this.showOfflineRewards && (this.showOfflineRewards?.gold ?? 0) > 0) {
      this.time.delayedCall(500, () => {
        this.showOfflineRewardsPopup(this.showOfflineRewards);
      });
    }
    } catch (error) {
      console.error('[MainMenuScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  shutdown() {
    if (this.particles) {
      this.particles.destroy();
      this.particles = null;
    }
    if (this._starTimer) {
      this._starTimer.remove();
      this._starTimer = null;
    }
    if (this.energyBar) {
      this.energyBar.destroy();
      this.energyBar = null;
    }
    if (this.idleBattleView) {
      this.idleBattleView.destroy();
      this.idleBattleView = null;
    }
    if (this.idleSystem) {
      this.idleSystem = null;
    }
    if (this.bottomNav) {
      this.bottomNav.destroy();
      this.bottomNav = null;
    }
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  /**
   * Badge data for menu buttons (UIX-2.1.2)
   */
  getBadgeData(sceneKey) {
    switch (sceneKey) {
      case 'HeroListScene':
        return 0;
      case 'QuestScene':
        return 0;
      case 'InventoryScene':
        return 0;
      case 'TowerScene':
        return 0;
      default:
        return 0;
    }
  }

  showOfflineRewardsPopup(rewards) {
    if (!rewards) {
      console.warn('[MainMenuScene] showOfflineRewardsPopup: rewards is null/undefined');
      return;
    }

    const safeRewards = {
      formattedDuration: rewards?.formattedDuration ?? '0분',
      gold: rewards?.gold ?? 0,
      exp: rewards?.exp ?? 0
    };

    const contentContainer = this.add.container(0, 0);

    const durationText = this.add.text(0, -60, `${safeRewards.formattedDuration} 동안 모험했습니다!`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#94A3B8',
      align: 'center'
    }).setOrigin(0.5);

    const goldReward = this.add.text(0, -15, `💰 골드: +${safeRewards.gold.toLocaleString()}`, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const expReward = this.add.text(0, 25, `⭐ 경험치: +${safeRewards.exp.toLocaleString()}`, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: `#${COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    contentContainer.add([durationText, goldReward, expReward]);

    const modal = new Modal(this, {
      title: '🎁 오프라인 보상',
      content: contentContainer,
      width: 350,
      height: 280,
      buttons: [
        {
          text: '받기',
          onClick: () => {
            SaveManager.claimOfflineRewards();
            this.registry.remove('pendingOfflineRewards');
            this.showOfflineRewards = null;
            const newResources = SaveManager.getResources() || {};
            this.registry.set('gems', newResources?.gems ?? 1500);
            this.registry.set('gold', newResources?.gold ?? 10000);
            this.showToast('보상을 받았습니다!');
          }
        }
      ],
      closeOnOverlay: false
    });

    modal.show();
  }

  createBackground() {
    // ART-1: Background texture (fallback: gradient)
    if (this.textures.exists('bg_main')) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_main').setOrigin(0.5);
      this._stars = [];
      for (let i = 0; i < 10; i++) {
        const star = this.add.circle(
          Phaser.Math.Between(10, GAME_WIDTH - 10),
          Phaser.Math.Between(10, GAME_HEIGHT - 250),
          Phaser.Math.FloatBetween(1, 2),
          0xFFFFFF,
          Phaser.Math.FloatBetween(0.3, 0.7)
        );
        this.tweens.add({
          targets: star,
          alpha: { from: star.alpha, to: 0.1 },
          duration: Phaser.Math.Between(1500, 3000),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
        this._stars.push(star);
      }
    } else {
      const graphics = this.add.graphics();
      for (let y = 0; y < GAME_HEIGHT; y++) {
        const ratio = y / GAME_HEIGHT;
        const r = Math.floor(15 + ratio * 10);
        const g = Math.floor(23 + ratio * 15);
        const b = Math.floor(42 + ratio * 20);
        graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
        graphics.fillRect(0, y, GAME_WIDTH, 1);
      }

      this._stars = [];
      for (let i = 0; i < 25; i++) {
        const star = this.add.circle(
          Phaser.Math.Between(10, GAME_WIDTH - 10),
          Phaser.Math.Between(10, GAME_HEIGHT - 250),
          Phaser.Math.FloatBetween(1, 2.5),
          COLORS.text,
          Phaser.Math.FloatBetween(0.15, 0.5)
        );
        this.tweens.add({
          targets: star,
          alpha: { from: star.alpha, to: Phaser.Math.FloatBetween(0.05, 0.3) },
          duration: Phaser.Math.Between(1500, 3500),
          yoyo: true,
          repeat: -1,
          delay: Phaser.Math.Between(0, 2000),
          ease: 'Sine.easeInOut'
        });
        this._stars.push(star);
      }
    }

    for (let i = 0; i < 3; i++) {
      const orb = this.add.circle(
        Phaser.Math.Between(50, GAME_WIDTH - 50),
        Phaser.Math.Between(100, GAME_HEIGHT - 300),
        Phaser.Math.Between(4, 8),
        COLORS.primary,
        0.08
      );
      this.tweens.add({
        targets: orb,
        x: orb.x + Phaser.Math.Between(-60, 60),
        y: orb.y + Phaser.Math.Between(-40, 40),
        alpha: { from: 0.08, to: 0.15 },
        duration: Phaser.Math.Between(6000, 10000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    const glowGraphics = this.add.graphics();
    glowGraphics.fillStyle(COLORS.primary, 0.1);
    glowGraphics.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT, GAME_WIDTH, 300);
    this.tweens.add({
      targets: glowGraphics,
      alpha: { from: 1, to: 0.5 },
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  createTopBar() {
    const topBar = this.add.rectangle(GAME_WIDTH / 2, 40, GAME_WIDTH, 80, COLORS.backgroundLight, 0.9);
    topBar.setDepth(Z_INDEX.UI);

    const saveData = SaveManager.load();
    const playerLevel = saveData.player?.level || 1;
    const levelBadge = this.add.rectangle(40, 40, 55, 30, COLORS.primary, 0.9)
      .setDepth(Z_INDEX.UI + 1);
    levelBadge.setStrokeStyle(1, COLORS.text, 0.3);
    this.levelBadgeText = this.add.text(40, 40, `Lv.${playerLevel}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(Z_INDEX.UI + 1);

    let gemIcon;
    if (this.textures.exists('gem')) {
      gemIcon = this.add.image(100, 40, 'gem').setScale(1).setDepth(Z_INDEX.UI + 1);
    } else {
      gemIcon = this.add.text(100, 40, '💎', { fontSize: '20px' }).setOrigin(0.5).setDepth(Z_INDEX.UI + 1);
    }

    const gems = this.registry.get('gems') || 1500;
    this.gemText = this.add.text(125, 40, gems.toLocaleString(), {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(Z_INDEX.UI + 1);

    let goldIcon;
    if (this.textures.exists('gold')) {
      goldIcon = this.add.image(220, 40, 'gold').setScale(1).setDepth(Z_INDEX.UI + 1);
    } else {
      goldIcon = this.add.text(220, 40, '🪙', { fontSize: '20px' }).setOrigin(0.5).setDepth(Z_INDEX.UI + 1);
    }

    const gold = this.registry.get('gold') || 10000;
    this.goldText = this.add.text(245, 40, gold.toLocaleString(), {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(Z_INDEX.UI + 1);

    const energyStatus = energySystem.getStatus() || {};
    this.energyBar = new EnergyBar(this);
    this.energyBar.create(430, 40);
    this.energyBar.update(energyStatus?.current ?? 0, energyStatus?.max ?? 100);

    const timeToRecover = energySystem.getTimeToNextRecovery?.() ?? 0;
    this.energyTimerText = this.add.text(560, 40, timeToRecover > 0 ? `+1 in ${formatTime(timeToRecover)}` : '', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#94A3B8',
      fontStyle: 'normal'
    }).setOrigin(0, 0.5).setDepth(Z_INDEX.UI + 1);

    const partyPower = this.idleSystem.getPartyPower();
    this.powerText = this.add.text(GAME_WIDTH - 90, 40, `⚔ ${Math.floor(partyPower).toLocaleString()}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(1, 0.5).setDepth(Z_INDEX.UI + 1);

    const settingsBtn = this.add.rectangle(GAME_WIDTH - 40, 40, 40, 40, COLORS.backgroundLight, 0.8)
      .setDepth(Z_INDEX.UI + 1)
      .setInteractive({ useHandCursor: true });

    const settingsIcon = this.add.text(GAME_WIDTH - 40, 40, '⚙️', {
      fontSize: '24px'
    }).setOrigin(0.5).setDepth(Z_INDEX.UI + 1);

    settingsBtn.on('pointerover', () => settingsBtn.setFillStyle(COLORS.primary, 0.5));
    settingsBtn.on('pointerout', () => settingsBtn.setFillStyle(COLORS.backgroundLight, 0.8));
    settingsBtn.on('pointerdown', () => {
      this.showToast('설정 준비 중!');
    });
  }

  /**
   * WS-3: Party hero display (y=110~270)
   */
  createPartyDisplay() {
    const saveData = SaveManager.load();
    const parties = saveData?.parties || [];
    // PartyManager 형식: {heroIds: [...]} 또는 레거시 배열 형식 둘 다 지원
    const rawParty = parties[0];
    const partyIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const characters = saveData?.characters || [];

    const panelY = 110;
    const panel = this.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(20, panelY, GAME_WIDTH - 40, 155, 12);

    this.add.text(40, panelY + 10, '내 파티', {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold',
      color: '#F8FAFC'
    });

    const classColors = { warrior: 0xEF4444, mage: 0x8B5CF6, archer: 0x10B981, healer: 0x3B82F6 };
    const classIcons = { warrior: '⚔️', mage: '🔮', archer: '🏹', healer: '💚' };

    // Calculate slot positions for 4 heroes evenly across panel
    const slotWidth = (GAME_WIDTH - 80) / 4;

    partyIds.forEach((heroId, i) => {
      const charData = characters.find(c => c.id === heroId || c.characterId === heroId);
      const staticData = getCharacter(heroId);
      const x = 40 + slotWidth / 2 + i * slotWidth;
      const y = panelY + 90;

      const charClass = staticData?.class || charData?.class || 'warrior';
      const color = classColors[charClass] || 0x64748B;

      // Circular avatar background
      this.add.circle(x, y, 32, color, 0.9);

      // Class icon
      this.add.text(x, y - 5, classIcons[charClass] || '❓', {
        fontSize: '24px'
      }).setOrigin(0.5);

      // Name (max 4 chars)
      const name = (staticData?.name || charData?.name || '???').substring(0, 4);
      this.add.text(x, y + 40, name, {
        fontSize: '12px', fontFamily: 'Arial', color: '#F8FAFC'
      }).setOrigin(0.5);

      // Level
      const level = charData?.level || 1;
      this.add.text(x, y + 55, `Lv.${level}`, {
        fontSize: '11px', fontFamily: 'Arial', color: '#94A3B8'
      }).setOrigin(0.5);
    });

    // If party is empty, show placeholder
    if (partyIds.length === 0) {
      this.add.text(GAME_WIDTH / 2, panelY + 80, '파티를 편성해주세요!', {
        fontSize: '16px', fontFamily: 'Arial', color: '#94A3B8'
      }).setOrigin(0.5);
    }
  }

  /**
   * WS-3: Combat power + difficulty display (y=280~350)
   */
  createCombatPowerDisplay() {
    const saveData = SaveManager.load();
    const power = this.calculateCombatPower(saveData);
    const difficulty = this.getDifficulty(power);

    const panelY = 280;
    const panel = this.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(20, panelY, GAME_WIDTH - 40, 65, 12);

    // Combat power number
    this.add.text(40, panelY + 20, `⚡ 전투력: ${power.toLocaleString()}`, {
      fontSize: '20px', fontFamily: 'Arial', fontStyle: 'bold',
      color: '#F59E0B'
    });

    // Difficulty badge
    const diffColors = {
      '쉬움': 0x10B981, '보통': 0x3B82F6, '어려움': 0xF59E0B,
      '매우어려움': 0xEF4444, '극한': 0x7C3AED
    };
    const badge = this.add.graphics();
    badge.fillStyle(diffColors[difficulty.label] || 0x3B82F6, 1);
    badge.fillRoundedRect(GAME_WIDTH - 160, panelY + 15, 120, 35, 8);
    this.add.text(GAME_WIDTH - 100, panelY + 32, difficulty.label, {
      fontSize: '15px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
  }

  /**
   * Calculate party combat power from save data
   */
  calculateCombatPower(saveData) {
    const parties = saveData?.parties || [];
    const rawParty = parties[0];
    const partyIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const characters = saveData?.characters || [];

    let totalPower = 0;
    partyIds.forEach(heroId => {
      const charData = characters.find(c => c.id === heroId || c.characterId === heroId);
      if (!charData) return;
      const staticData = getCharacter(heroId);
      if (!staticData) return;

      const stats = staticData.stats;
      if (!stats) return;
      const level = charData.level || 1;
      const starMult = 1 + (charData.stars || 1) * 0.2;
      const basePower = (stats.hp + stats.atk * 2 + stats.def + stats.spd);
      totalPower += Math.floor(basePower * level * starMult);
    });
    return totalPower || 400;
  }

  /**
   * Get difficulty label based on combat power vs recommended power
   */
  getDifficulty(power) {
    const currentStage = this.idleSystem.getCurrentStage();
    const chapter = currentStage.chapter || 1;
    const stage = currentStage.stage || 1;
    const recommended = chapter * 500 + stage * 100;

    const ratio = power / recommended;
    if (ratio >= 2.0) return { label: '쉬움', color: 0x10B981 };
    if (ratio >= 1.3) return { label: '보통', color: 0x3B82F6 };
    if (ratio >= 0.8) return { label: '어려움', color: 0xF59E0B };
    if (ratio >= 0.5) return { label: '매우어려움', color: 0xEF4444 };
    return { label: '극한', color: 0x7C3AED };
  }

  /**
   * WS-3: Adventure panel with sweep + boss battle (y=360~560)
   */
  createAdventurePanel() {
    const panelY = 360;
    const panel = this.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(20, panelY, GAME_WIDTH - 40, 190, 12);

    const saveData = SaveManager.load();
    const progress = saveData?.progress || {};

    // Current stage info
    const currentStage = this.idleSystem.getCurrentStage();
    this.add.text(40, panelY + 15, '🗺️ 현재 모험', {
      fontSize: '18px', fontFamily: 'Arial', fontStyle: 'bold', color: '#F8FAFC'
    });
    this.add.text(40, panelY + 45, `챕터 ${currentStage.chapter || 1} - 스테이지 ${currentStage.chapter || 1}-${currentStage.stage || 1}`, {
      fontSize: '14px', fontFamily: 'Arial', color: '#94A3B8'
    });

    // Sweep availability check
    const clearedStages = progress.clearedStages || {};
    const canSweep = Object.keys(clearedStages).length > 0;
    const energy = saveData?.resources?.energy ?? 50;

    // Sweep button
    const sweepBtnX = 40;
    const sweepBtnW = GAME_WIDTH / 2 - 60;
    const sweepBtn = this.add.graphics();
    sweepBtn.fillStyle(canSweep ? 0x10B981 : 0x334155, 1);
    sweepBtn.fillRoundedRect(sweepBtnX, panelY + 80, sweepBtnW, 50, 10);
    this.add.text(sweepBtnX + sweepBtnW / 2, panelY + 105, `⚡ 소탕 (10🔋)`, {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    const sweepHit = this.add.rectangle(sweepBtnX + sweepBtnW / 2, panelY + 105, sweepBtnW, 50)
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    sweepHit.on('pointerdown', () => {
      if (!canSweep) {
        this.showToast('클리어한 스테이지가 없습니다!');
        return;
      }
      this.performSweep();
    });

    // Boss battle button
    const bossBtnX = GAME_WIDTH / 2 + 20;
    const bossBtnW = GAME_WIDTH / 2 - 60;
    const bossBtn = this.add.graphics();
    bossBtn.fillStyle(0xEF4444, 1);
    bossBtn.fillRoundedRect(bossBtnX, panelY + 80, bossBtnW, 50, 10);
    this.add.text(bossBtnX + bossBtnW / 2, panelY + 105, '🗡️ 보스전 도전', {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    const bossHit = this.add.rectangle(bossBtnX + bossBtnW / 2, panelY + 105, bossBtnW, 50)
      .setAlpha(0.001).setInteractive({ useHandCursor: true });
    bossHit.on('pointerdown', () => {
      transitionManager.slideTransition(this, 'BattleScene', {
        stageId: `${currentStage.chapter || 1}-${currentStage.stage || 1}`,
        mode: 'boss'
      }, 'right');
    });

    // Energy display (EnergySystem 시간 회복 반영)
    const esStatus = energySystem.getStatus() || {};
    const currentEnergy = esStatus.current ?? 0;
    const maxEnergy = esStatus.max ?? 100;
    this.add.text(40, panelY + 150, `🔋 에너지: ${currentEnergy}/${maxEnergy}`, {
      fontSize: '13px', fontFamily: 'Arial',
      color: currentEnergy >= 10 ? '#10B981' : '#EF4444'
    });

    // Stage name
    this.add.text(GAME_WIDTH - 40, panelY + 150, `📍 ${currentStage.name || '슬라임 평원'}`, {
      fontSize: '13px', fontFamily: 'Arial', color: '#94A3B8'
    }).setOrigin(1, 0);
  }

  /**
   * Perform sweep (auto-clear) of current stage
   */
  performSweep() {
    // EnergySystem을 통한 에너지 소모 (시간 회복 자동 적용)
    const result = energySystem.consumeEnergy(10);
    if (!result.success) {
      this.showToast('에너지가 부족합니다!');
      return;
    }

    const goldReward = Phaser.Math.Between(50, 150);
    const expReward = Phaser.Math.Between(20, 60);

    const data = SaveManager.load();
    if (data) {
      data.resources.gold = (data.resources.gold || 0) + goldReward;
      data.statistics = data.statistics || {};
      data.statistics.totalGoldEarned = (data.statistics.totalGoldEarned || 0) + goldReward;
      SaveManager.save(data);

      this.registry.set('gold', data.resources.gold);
      this.registry.set('gems', data.resources.gems);
    }

    this.showToast(`소탕 완료! 💰${goldReward} ✨${expReward}EXP`);

    // Refresh scene after 1.5s
    this.time.delayedCall(1500, () => this.scene.restart());
  }

  /**
   * IdleBattleView (y=570~720, smaller)
   */
  createIdleBattleView() {
    const viewY = 645;
    const viewWidth = 640;
    const viewHeight = 260;

    this.idleBattleView = new IdleBattleView(this, GAME_WIDTH / 2, viewY, viewWidth, viewHeight);
    this.idleBattleView.setDepth(Z_INDEX.UI - 1);

    const currentStage = this.idleSystem.getCurrentStage();
    this.idleBattleView.updateStageInfo(currentStage.chapter || 1, currentStage.stage || 1, currentStage.name || '슬라임 평원');

    const saveData = SaveManager.load();
    const parties = saveData.parties || [];
    const rawParty = parties[0];
    const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const partyHeroes = party.map(heroId => (saveData.characters || []).find(c => c.id === heroId));
    this.idleBattleView.updateParty(partyHeroes);

    this.idleBattleView.startBattleCycle();
  }

  /**
   * Idle income summary (y=780)
   */
  createIdleSummary() {
    const summaryY = 790;

    const summaryBg = this.add.rectangle(GAME_WIDTH / 2, summaryY, 640, 50, COLORS.bgLight, 0.5);
    summaryBg.setStrokeStyle(1, COLORS.primary, 0.3);

    const partyPower = this.idleSystem.getPartyPower();
    const rates = this.idleSystem.getIdleBattleRate(partyPower);
    const goldPerHour = Math.floor((rates.goldPerSec || 0) * 3600);
    const expPerHour = Math.floor((rates.expPerSec || 0) * 3600);

    this.add.text(GAME_WIDTH / 2 - 150, summaryY, `💰 ${goldPerHour.toLocaleString()}/h`, {
      fontSize: '15px', fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, summaryY, `⭐ ${expPerHour.toLocaleString()}/h`, {
      fontSize: '15px', fontFamily: 'Arial',
      color: `#${COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    const currentStage = this.idleSystem.getCurrentStage();
    this.add.text(GAME_WIDTH / 2 + 150, summaryY, `📍 ${currentStage.chapter || 1}-${currentStage.stage || 1}`, {
      fontSize: '13px', fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
  }

  /**
   * Content shortcut buttons (y=830~) - adventure removed, 7 buttons
   */
  createContentButtons() {
    const startY = 830;
    // WS-3: 7 buttons (adventure removed, handled in adventure panel above)
    const buttons = [
      { icon: '🎲', label: '소환', scene: 'GachaScene', texture: 'icon_dice' },
      { icon: '\u{1F9B8}', label: '영웅', scene: 'HeroListScene', texture: 'icon_hero' },
      { icon: '\u{1F465}', label: '파티편성', scene: 'PartyEditScene', texture: 'icon_party' },
      { icon: '\u{1F4DC}', label: '퀘스트', scene: 'QuestScene', texture: 'icon_quest' },
      { icon: '\u{1F5FC}', label: '무한탑', scene: 'TowerScene', texture: 'icon_tower' },
      { icon: '\u{1F4E6}', label: '가방', scene: 'InventoryScene', texture: 'icon_bag' },
      { icon: '\u2699\uFE0F', label: '설정', scene: 'SettingsScene', texture: 'icon_settings' },
    ];

    const cols = 4;
    const btnWidth = 150;
    const btnHeight = 65;
    const gapX = 10;
    const gapY = 10;
    const totalWidth = cols * btnWidth + (cols - 1) * gapX;
    const startX = (GAME_WIDTH - totalWidth) / 2 + btnWidth / 2;

    buttons.forEach((btn, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnWidth + gapX);
      const y = startY + row * (btnHeight + gapY);

      const container = this.add.container(x, y);

      const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0x1a1a3e, 0.8);
      bg.setStrokeStyle(1, 0x4444aa, 0.4);
      bg.setInteractive({ useHandCursor: true });

      let iconObj;
      if (btn.texture && this.textures.exists(btn.texture)) {
        iconObj = this.add.image(0, -12, btn.texture).setScale(0.8);
      } else {
        iconObj = this.add.text(0, -12, btn.icon, {
          fontSize: '28px'
        }).setOrigin(0.5);
      }

      const label = this.add.text(0, 22, btn.label, {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: '#ccccdd',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      container.add([bg, iconObj, label]);

      const badgeCount = this.getBadgeData(btn.scene);
      if (badgeCount > 0) {
        const badgeX = btnWidth / 2 - 12;
        const badgeY = -btnHeight / 2 + 8;

        const badge = this.add.graphics();
        badge.fillStyle(COLORS.danger, 1);
        const badgeWidth = badgeCount > 99 ? 28 : badgeCount > 9 ? 22 : 16;
        badge.fillRoundedRect(badgeX - badgeWidth / 2, badgeY - 8, badgeWidth, 16, 8);

        const badgeText = this.add.text(badgeX, badgeY, badgeCount > 99 ? '99+' : badgeCount.toString(), {
          fontFamily: 'Arial',
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#FFFFFF'
        }).setOrigin(0.5);

        container.add([badge, badgeText]);
        container.badge = badge;
        container.badgeText = badgeText;
      }

      bg.on('pointerover', () => {
        bg.setFillStyle(0x2a2a5e, 1);
        this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 100 });
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(0x1a1a3e, 0.8);
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 });
      });
      bg.on('pointerdown', () => {
        switch (btn.scene) {
          case 'HeroListScene':
          case 'InventoryScene':
          case 'QuestScene':
            transitionManager.slideTransition(this, btn.scene, {}, 'right');
            break;
          case 'SettingsScene':
            transitionManager.slideTransition(this, btn.scene, {}, 'up');
            break;
          case 'PartyEditScene':
            transitionManager.fadeTransition(this, btn.scene, { returnTo: 'MainMenuScene' });
            break;
          default:
            transitionManager.fadeTransition(this, btn.scene);
            break;
        }
      });
    });
  }

  createBottomNavigation() {
    this.bottomNav = new BottomNav(this, 'home');
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, 500, message, {
      fontSize: '18px',
      fontFamily: '"Noto Sans KR", Arial, sans-serif',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setDepth(Z_INDEX.TOOLTIP);

    this.tweens.add({
      targets: toast,
      y: toast.y - 50,
      alpha: 0,
      duration: 1500,
      delay: 800,
      onComplete: () => toast.destroy()
    });
  }

  update() {
    const gems = this.registry.get('gems') ?? 0;
    const gold = this.registry.get('gold') ?? 0;

    if (this.gemText) this.gemText.setText(gems.toLocaleString());
    if (this.goldText) this.goldText.setText(gold.toLocaleString());

    if (this.energyBar) {
      const es = energySystem.getStatus() || {};
      this.energyBar.update(es?.current ?? 0, es?.max ?? 100);
    }

    if (this.energyTimerText) {
      const timeToRecover = energySystem.getTimeToNextRecovery?.() ?? 0;
      this.energyTimerText.setText(timeToRecover > 0 ? `+1 in ${formatTime(timeToRecover)}` : '');
    }
  }
}
