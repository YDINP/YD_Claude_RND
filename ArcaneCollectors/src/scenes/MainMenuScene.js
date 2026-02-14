import { COLORS, GAME_WIDTH, GAME_HEIGHT, LAYOUT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
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
import { getCharacter, calculatePower, getStage, getChapterStages } from '../data/index.ts';
import { HeroInfoPopup } from '../components/HeroInfoPopup.js';
import { ProgressionSystem } from '../systems/ProgressionSystem.js';
import { GachaPopup } from '../components/popups/GachaPopup.js';
import { HeroListPopup } from '../components/popups/HeroListPopup.js';
import { PartyEditPopup } from '../components/popups/PartyEditPopup.js';
import { QuestPopup } from '../components/popups/QuestPopup.js';
import { TowerPopup } from '../components/popups/TowerPopup.js';
import { InventoryPopup } from '../components/popups/InventoryPopup.js';
import { SettingsPopup } from '../components/popups/SettingsPopup.js';

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

    // Initialize energy system (에너지 회복 시작)
    const fullSaveData = SaveManager.load();
    energySystem.initialize(fullSaveData?.energy || null);

    // Hero info popup instance
    this.heroPopup = new HeroInfoPopup(this);

    this.createBackground();
    this.createTopBar();
    this.createPartyDisplay();
    this.createCombatPowerDisplay();
    this.createAdventurePanel();
    this.createIdleBattleView();
    this.createIdleSummary();
    this.createBottomMenu();

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
    if (this.heroPopup) {
      this.heroPopup.destroy();
      this.heroPopup = null;
    }
    if (this.idleSystem) {
      this.idleSystem = null;
    }
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
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
    this.energyTimerText = this.add.text(540, 40, timeToRecover > 0 ? `+1 in ${formatTime(timeToRecover)}` : '', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#94A3B8',
      fontStyle: 'normal'
    }).setOrigin(0, 0.5).setDepth(Z_INDEX.UI + 1);

    // Energy gem charge button (💎+)
    const chargeBtn = this.add.text(620, 40, '💎+', {
      fontSize: '14px', fontFamily: 'Arial', fontStyle: 'bold',
      color: '#A78BFA', backgroundColor: '#1E293B',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(Z_INDEX.UI + 1).setInteractive({ useHandCursor: true });
    chargeBtn.on('pointerdown', () => this.chargeEnergyWithGems());
    chargeBtn.on('pointerover', () => chargeBtn.setColor('#C4B5FD'));
    chargeBtn.on('pointerout', () => chargeBtn.setColor('#A78BFA'));

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

    const panelY = 105;
    const panel = this.add.graphics();
    panel.fillStyle(0x1E293B, 0.9);
    panel.fillRoundedRect(20, panelY, GAME_WIDTH - 40, 150, 12);

    this.add.text(40, panelY + 10, '내 파티', {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold',
      color: '#F8FAFC'
    });

    // 파티 편성 바로가기 버튼
    const editBtn = this.add.container(GAME_WIDTH - 60, panelY + 18);
    const editBg = this.add.rectangle(0, 0, 60, 26, COLORS.primary, 0.8)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(1, 0x818CF8);
    const editText = this.add.text(0, 0, '편성', {
      fontSize: '12px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);
    editBtn.add([editBg, editText]);
    editBg.on('pointerdown', () => {
      transitionManager.fadeTransition(this, 'PartyEditScene', { returnTo: 'MainMenuScene' });
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

      // Circular avatar background (클릭 가능)
      const avatar = this.add.circle(x, y, 32, color, 0.9)
        .setInteractive({ useHandCursor: true });

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

      // 영웅 클릭 → 팝업 정보
      avatar.on('pointerdown', () => {
        this.heroPopup?.show(heroId);
      });
      avatar.on('pointerover', () => avatar.setScale(1.1));
      avatar.on('pointerout', () => avatar.setScale(1));
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
      try {
        totalPower += ProgressionSystem.calculatePower({
          ...charData,
          characterId: heroId,
          skillLevels: charData.skillLevels || [1, 1]
        });
      } catch (e) {
        // Fallback
        const stats = charData.stats || {};
        totalPower += Math.floor((stats.hp || 0) / 10 + (stats.atk || 0) + (stats.def || 0) + (stats.spd || 0));
      }
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

    // Check if party exists
    const parties = saveData?.parties || [];
    const rawParty = parties[0];
    const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const partyHeroes = party.map(heroId => (saveData.characters || []).find(c => c.id === heroId)).filter(Boolean);
    const hasParty = partyHeroes.length > 0;

    // Sweep availability check
    const clearedStages = progress.clearedStages || {};
    const canSweep = Object.keys(clearedStages).length > 0 && hasParty;
    const energy = saveData?.resources?.energy ?? 50;

    // Sweep button
    const sweepBtnX = 40;
    const sweepBtnW = GAME_WIDTH / 2 - 60;
    const sweepBtn = this.add.graphics();
    sweepBtn.fillStyle(canSweep ? 0x10B981 : 0x334155, 1);
    sweepBtn.fillRoundedRect(sweepBtnX, panelY + 80, sweepBtnW, 50, 10);
    const sweepBtnText = this.add.text(sweepBtnX + sweepBtnW / 2, panelY + 105, `⚡ 소탕 (10🔋)`, {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    const sweepHit = this.add.rectangle(sweepBtnX + sweepBtnW / 2, panelY + 105, sweepBtnW, 50)
      .setAlpha(0.001);

    if (canSweep) {
      sweepHit.setInteractive({ useHandCursor: true });
      sweepHit.on('pointerdown', () => {
        this.performSweep();
      });
    } else {
      sweepBtnText.setAlpha(0.5);
    }

    // Boss battle button
    const bossBtnX = GAME_WIDTH / 2 + 20;
    const bossBtnW = GAME_WIDTH / 2 - 60;
    const bossBtn = this.add.graphics();
    bossBtn.fillStyle(hasParty ? 0xEF4444 : 0x334155, 1);
    bossBtn.fillRoundedRect(bossBtnX, panelY + 80, bossBtnW, 50, 10);
    const bossBtnText = this.add.text(bossBtnX + bossBtnW / 2, panelY + 105, '🗡️ 보스전 도전', {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    const bossHit = this.add.rectangle(bossBtnX + bossBtnW / 2, panelY + 105, bossBtnW, 50)
      .setAlpha(0.001);

    if (hasParty) {
      bossHit.setInteractive({ useHandCursor: true });
      bossHit.on('pointerdown', () => {
        this.prepareBossBattle();
      });
    } else {
      bossBtnText.setAlpha(0.5);
    }

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
   * Prepare boss battle with full party and stage data
   */
  prepareBossBattle() {
    const currentStage = this.idleSystem.getCurrentStage();
    const chapterId = `chapter_${currentStage.chapter || 1}`;

    // 현재 챕터의 보스 스테이지 찾기
    const chapterStages = getChapterStages(chapterId) || [];
    const bossStage = chapterStages.find(s => s.isBoss);
    const stage = bossStage || getStage(chapterId, `${currentStage.chapter || 1}-${currentStage.stage || 1}`);

    // 파티 로드
    const saveData = SaveManager.load();
    const parties = saveData?.parties || [];
    const rawParty = parties[0];
    const heroIds = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const party = heroIds.map(id => {
      const charData = (saveData?.characters || []).find(c => c.id === id || c.characterId === id);
      const staticData = getCharacter(id);
      if (!charData && !staticData) return null;
      return { ...staticData, ...charData, id, stats: staticData?.stats || charData?.stats };
    }).filter(Boolean);

    if (party.length === 0) {
      this.showToast('파티를 먼저 편성해주세요!');
      return;
    }

    transitionManager.slideTransition(this, 'BattleScene', {
      stage: stage || { id: stageId, name: `스테이지 ${stageId}`, enemies: [], rewards: { gold: 200, exp: 100 } },
      party,
      mode: 'boss'
    }, 'right');
  }

  /**
   * Perform sweep (auto-clear) of current stage
   */
  chargeEnergyWithGems() {
    const saveData = SaveManager.load();
    if (!saveData) return;
    const gems = saveData.resources?.gems ?? 0;

    if (gems < 50) {
      this.showToast('보석이 부족합니다! (필요: 50💎)');
      return;
    }

    const result = energySystem.chargeWithGems(saveData.resources);
    if (result.success) {
      SaveManager.save(saveData);
      this.registry.set('gems', saveData.resources.gems);
      this.showToast(`에너지 충전! +${result.energyGained}🔋 (-${result.gemsSpent}💎)`);
    } else {
      this.showToast(result.message || '충전 실패');
    }
  }

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
   * IdleBattleView (y=580~880, expanded)
   */
  createIdleBattleView() {
    const viewY = 580;
    const viewWidth = 640;
    const viewHeight = 300;

    this.idleBattleView = new IdleBattleView(this, GAME_WIDTH / 2, viewY, viewWidth, viewHeight);
    this.idleBattleView.setDepth(Z_INDEX.UI - 1);

    const currentStage = this.idleSystem.getCurrentStage();
    this.idleBattleView.updateStageInfo(currentStage.chapter || 1, currentStage.stage || 1, currentStage.name || '슬라임 평원');

    const saveData = SaveManager.load();
    const parties = saveData.parties || [];
    const rawParty = parties[0];
    const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
    const partyHeroes = party.map(heroId => (saveData.characters || []).find(c => c.id === heroId)).filter(Boolean);

    // Check if party is empty
    const hasParty = partyHeroes.length > 0;

    if (hasParty) {
      this.idleBattleView.updateParty(partyHeroes);
      this.idleBattleView.startBattleCycle();
    } else {
      // Show empty party message
      this.idleBattleView.showEmptyPartyMessage();
    }
  }

  /**
   * Idle income summary (y=900)
   */
  createIdleSummary() {
    const summaryY = 900;

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

  createBottomMenu() {
    const menuItems = [
      { icon: '🎲', label: '소환', popupKey: 'gacha' },
      { icon: '🦸', label: '영웅', popupKey: 'herolist' },
      { icon: '👥', label: '파티', popupKey: 'partyedit' },
      { icon: '📜', label: '퀘스트', popupKey: 'quest' },
      { icon: '🗼', label: '무한탑', popupKey: 'tower' },
      { icon: '📦', label: '가방', popupKey: 'inventory' },
      { icon: '⚙️', label: '설정', popupKey: 'settings' },
    ];

    const cols = 4;
    const btnSize = 80;
    const gapX = 20;
    const gapY = 10;
    const startY = 990;
    const totalWidth = cols * btnSize + (cols - 1) * gapX;
    const startX = (GAME_WIDTH - totalWidth) / 2 + btnSize / 2;

    menuItems.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnSize + gapX);
      const y = startY + row * (btnSize + gapY);

      // Circle background
      const bg = this.add.graphics();
      bg.fillStyle(0x1E293B, 0.9);
      bg.fillCircle(x, y - 8, 32);
      bg.lineStyle(2, COLORS.primary, 0.3);
      bg.strokeCircle(x, y - 8, 32);

      // Icon
      const icon = this.add.text(x, y - 10, item.icon, {
        fontSize: '28px'
      }).setOrigin(0.5);

      // Label
      const label = this.add.text(x, y + 22, item.label, {
        fontSize: '11px', fontFamily: '"Noto Sans KR", sans-serif',
        color: '#94A3B8'
      }).setOrigin(0.5);

      // Hit area
      const hitArea = this.add.rectangle(x, y + 5, btnSize, btnSize + 10)
        .setAlpha(0.001).setInteractive({ useHandCursor: true });

      hitArea.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(0x334155, 1);
        bg.fillCircle(x, y - 8, 34);
        bg.lineStyle(2, COLORS.primary, 0.6);
        bg.strokeCircle(x, y - 8, 34);
      });
      hitArea.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(0x1E293B, 0.9);
        bg.fillCircle(x, y - 8, 32);
        bg.lineStyle(2, COLORS.primary, 0.3);
        bg.strokeCircle(x, y - 8, 32);
      });
      hitArea.on('pointerdown', () => {
        this.openPopup(item.popupKey);
      });
    });
  }

  openPopup(key) {
    // 이미 열린 팝업이 있으면 무시
    if (this.activePopup) return;

    const popups = {
      gacha: GachaPopup,
      herolist: HeroListPopup,
      partyedit: PartyEditPopup,
      quest: QuestPopup,
      tower: TowerPopup,
      inventory: InventoryPopup,
      settings: SettingsPopup,
    };
    const PopupClass = popups[key];
    if (PopupClass) {
      const popup = new PopupClass(this, {
        onClose: () => {
          this.activePopup = null;
          this.refreshAfterPopup();
        }
      });
      this.activePopup = popup;
      popup.show();
    }
  }

  refreshAfterPopup() {
    // 부분 갱신으로 변경: 전체 씬 재시작 대신 필요한 부분만 업데이트
    // scene.restart() 제거 → 깜빡임 없이 부드러운 갱신

    // 1. 자원 표시 갱신 (상단바)
    const resources = SaveManager.getResources() || {};
    this.registry.set('gems', resources?.gems ?? 1500);
    this.registry.set('gold', resources?.gold ?? 10000);

    // 2. 파티 전투력 갱신
    if (this.powerText) {
      const partyPower = this.idleSystem.getPartyPower();
      this.powerText.setText(`⚔ ${Math.floor(partyPower).toLocaleString()}`);
    }

    // 3. IdleBattleView 파티 갱신 (파티 편성 변경 시)
    if (this.idleBattleView) {
      const saveData = SaveManager.load();
      const parties = saveData?.parties || [];
      const rawParty = parties[0];
      const party = rawParty?.heroIds || (Array.isArray(rawParty) ? rawParty : []);
      const partyHeroes = party.map(heroId => (saveData.characters || []).find(c => c.id === heroId)).filter(Boolean);

      if (partyHeroes.length > 0) {
        this.idleBattleView.updateParty(partyHeroes);
        // 전투 사이클이 멈춰있다면 재시작
        if (!this.idleBattleView.battleCycleTimer) {
          this.idleBattleView.startBattleCycle();
        }
      }
    }

    // 4. 퀘스트 배지 갱신 (필요 시)
    // TODO: 퀘스트 시스템이 추가되면 배지 갱신 로직 추가
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

    // 방치 전투 진행 체크
    if (this.idleSystem) {
      const battleResult = this.idleSystem.updateProgress(this.game.loop.delta);
      if (battleResult) {
        // 스테이지 진행 체크
        if (battleResult.stageAdvanced) {
          const currentStage = this.idleSystem.getCurrentStage();
          this.showToast(`챕터 ${currentStage.chapter}-${currentStage.stage} 클리어!`);
          // IdleBattleView 스테이지 정보 업데이트
          if (this.idleBattleView) {
            this.idleBattleView.updateStageInfo(
              currentStage.chapter,
              currentStage.stage,
              currentStage.name
            );
          }
        }
      }
    }
  }
}
