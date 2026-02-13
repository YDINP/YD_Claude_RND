import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
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
    this.createPlayerInfo();
    this.createTitle();
    this.createIdleBattleView();
    this.createIdleSummary();
    this.createCharacterDisplay();

    // === 콘텐츠 바로가기 버튼 ===
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
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  /**
   * 메뉴 버튼 배지 데이터 가져오기 (UIX-2.1.2)
   * @param {string} sceneKey - 씬 키
   * @returns {number} 배지에 표시할 개수
   */
  getBadgeData(sceneKey) {
    switch (sceneKey) {
      case 'HeroListScene':
        // 새로운 영웅 개수 (예: 레벨업 가능한 영웅)
        return 0; // TODO: 실제 로직 추가
      case 'QuestScene':
        // 미완료 퀘스트 개수
        return 0; // TODO: 실제 로직 추가
      case 'InventoryScene':
        // 새로운 아이템 개수
        return 0; // TODO: 실제 로직 추가
      case 'TowerScene':
        // 도전 가능한 층 수
        return 0; // TODO: 실제 로직 추가
      default:
        return 0;
    }
  }

  showOfflineRewardsPopup(rewards) {
    // Null defense for rewards object
    if (!rewards) {
      console.warn('[MainMenuScene] showOfflineRewardsPopup: rewards is null/undefined');
      return;
    }

    const safeRewards = {
      formattedDuration: rewards?.formattedDuration ?? '0분',
      gold: rewards?.gold ?? 0,
      exp: rewards?.exp ?? 0
    };

    // UIX-2.1.3: Refactored using Modal component
    const contentContainer = this.add.container(0, 0);

    // Duration text
    const durationText = this.add.text(0, -60, `${safeRewards.formattedDuration} 동안 모험했습니다!`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#94A3B8',
      align: 'center'
    }).setOrigin(0.5);

    // Gold reward with icon
    const goldReward = this.add.text(0, -15, `💰 골드: +${safeRewards.gold.toLocaleString()}`, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Exp reward with icon
    const expReward = this.add.text(0, 25, `⭐ 경험치: +${safeRewards.exp.toLocaleString()}`, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: `#${COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    contentContainer.add([durationText, goldReward, expReward]);

    // Create Modal
    const modal = new Modal(this, {
      title: '🎁 오프라인 보상',
      content: contentContainer,
      width: 350,
      height: 280,
      buttons: [
        {
          text: '받기',
          onClick: () => {
            // Claim rewards + lastOnline 갱신 (중복 방지)
            SaveManager.claimOfflineRewards();

            // registry 정리 (다른 씬에서 돌아와도 재표시 안 함)
            this.registry.remove('pendingOfflineRewards');
            this.showOfflineRewards = null;

            // Update registry (with null defense)
            const newResources = SaveManager.getResources() || {};
            this.registry.set('gems', newResources?.gems ?? 1500);
            this.registry.set('gold', newResources?.gold ?? 10000);

            // Show toast
            this.showToast('보상을 받았습니다!');
          }
        }
      ],
      closeOnOverlay: false
    });

    modal.show();
  }

  createBackground() {
    // Dark fantasy gradient background
    const graphics = this.add.graphics();

    // Base gradient
    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(15 + ratio * 10);
      const g = Math.floor(23 + ratio * 15);
      const b = Math.floor(42 + ratio * 20);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // Animated twinkling stars
    this._stars = [];
    for (let i = 0; i < 25; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(10, GAME_WIDTH - 10),
        Phaser.Math.Between(10, GAME_HEIGHT - 250),
        Phaser.Math.FloatBetween(1, 2.5),
        COLORS.text,
        Phaser.Math.FloatBetween(0.15, 0.5)
      );
      // Twinkle animation with random delay
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

    // Slow-drifting ambient particles (3 larger glowing orbs)
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

    // Mystic glow at bottom (pulsing)
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
    // Top bar background (Z_INDEX.UI)
    const topBar = this.add.rectangle(GAME_WIDTH / 2, 40, GAME_WIDTH, 80, COLORS.backgroundLight, 0.9);
    topBar.setDepth(Z_INDEX.UI);

    // Gems display - use texture if exists, else create placeholder (Z_INDEX.UI + 1)
    let gemIcon;
    if (this.textures.exists('gem')) {
      gemIcon = this.add.image(30, 40, 'gem').setScale(1).setDepth(Z_INDEX.UI + 1);
    } else {
      gemIcon = this.add.text(30, 40, '💎', { fontSize: '20px' }).setOrigin(0.5).setDepth(Z_INDEX.UI + 1);
    }

    const gems = this.registry.get('gems') || 1500;
    this.gemText = this.add.text(55, 40, gems.toLocaleString(), {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(Z_INDEX.UI + 1);

    // Gold display (Z_INDEX.UI + 1)
    let goldIcon;
    if (this.textures.exists('gold')) {
      goldIcon = this.add.image(150, 40, 'gold').setScale(1).setDepth(Z_INDEX.UI + 1);
    } else {
      goldIcon = this.add.text(150, 40, '🪙', { fontSize: '20px' }).setOrigin(0.5).setDepth(Z_INDEX.UI + 1);
    }

    const gold = this.registry.get('gold') || 10000;
    this.goldText = this.add.text(175, 40, gold.toLocaleString(), {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(Z_INDEX.UI + 1);

    // Energy display with EnergyBar component (UIX-2.1.1)
    const energyStatus = energySystem.getStatus() || {};
    this.energyBar = new EnergyBar(this);
    this.energyBar.create(430, 40);
    this.energyBar.update(energyStatus?.current ?? 0, energyStatus?.max ?? 100);

    // Energy recovery timer (UIX-2.1.1)
    const timeToRecover = energySystem.getTimeToNextRecovery?.() ?? 0;
    this.energyTimerText = this.add.text(560, 40, timeToRecover > 0 ? `+1 in ${formatTime(timeToRecover)}` : '', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#94A3B8',
      fontStyle: 'normal'
    }).setOrigin(0, 0.5).setDepth(Z_INDEX.UI + 1);

    // Settings button (Z_INDEX.UI + 1)
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
   * 플레이어 정보 표시 (레벨, 전투력, 스테이지)
   */
  createPlayerInfo() {
    const infoY = 90;
    const saveData = SaveManager.load();

    // 플레이어 레벨
    const playerLevel = saveData.player?.level || 1;
    const levelText = this.add.text(GAME_WIDTH / 2 - 100, infoY, `Lv.${playerLevel}`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(Z_INDEX.UI);

    // 파티 전투력
    const partyPower = this.idleSystem.getPartyPower();
    const powerText = this.add.text(GAME_WIDTH / 2, infoY, `⚔️ ${Math.floor(partyPower)}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(Z_INDEX.UI);

    // 현재 스테이지
    const currentStage = this.idleSystem.getCurrentStage();
    const stageText = this.add.text(GAME_WIDTH / 2 + 100, infoY, `${currentStage.chapter}-${currentStage.stage}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5).setDepth(Z_INDEX.UI);
  }

  createTitle() {
    // Game title (축소)
    const title = this.add.text(GAME_WIDTH / 2, 145, 'Arcane Collectors', {
      fontSize: '26px',
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Title glow effect
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.7 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * 자동 전투 미니뷰 생성
   */
  createIdleBattleView() {
    const viewY = 425; // 200~650px 중앙
    const viewWidth = 640;
    const viewHeight = 380;

    this.idleBattleView = new IdleBattleView(this, GAME_WIDTH / 2, viewY, viewWidth, viewHeight);
    this.idleBattleView.setDepth(Z_INDEX.UI - 1);

    // 현재 스테이지 정보 업데이트
    const currentStage = this.idleSystem.getCurrentStage();
    this.idleBattleView.updateStageInfo(currentStage.chapter, currentStage.stage, currentStage.name);

    // 파티 정보 업데이트
    const saveData = SaveManager.load();
    const parties = saveData.parties || [];
    const party = parties[0] || [];
    const partyHeroes = party.map(heroId => saveData.characters.find(c => c.id === heroId));
    this.idleBattleView.updateParty(partyHeroes);

    // 전투 사이클 시작
    this.idleBattleView.startBattleCycle();
  }

  /**
   * 방치 수익 요약 표시
   */
  createIdleSummary() {
    const summaryY = 680;

    // 배경
    const summaryBg = this.add.rectangle(GAME_WIDTH / 2, summaryY, 640, 60, COLORS.bgLight, 0.5);
    summaryBg.setStrokeStyle(1, COLORS.primary, 0.3);

    // 골드/시간
    const partyPower = this.idleSystem.getPartyPower();
    const rates = this.idleSystem.getIdleBattleRate(partyPower);
    const goldPerHour = Math.floor(rates.goldPerSec * 3600);
    const expPerHour = Math.floor(rates.expPerSec * 3600);

    const goldText = this.add.text(GAME_WIDTH / 2 - 150, summaryY, `💰 ${goldPerHour.toLocaleString()}/h`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // 경험치/시간
    const expText = this.add.text(GAME_WIDTH / 2, summaryY, `⭐ ${expPerHour.toLocaleString()}/h`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${COLORS.success.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // 현재 스테이지
    const currentStage = this.idleSystem.getCurrentStage();
    const stageLabel = this.add.text(GAME_WIDTH / 2 + 150, summaryY, `📍 ${currentStage.chapter}-${currentStage.stage}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
  }

  createCharacterDisplay() {
    // Main character display area (smaller, moved down) - 제거 (미니뷰로 대체)
    // 파티 미리보기는 IdleBattleView에서 표시됨
    return;

    const mainCharY = 820;
    const charDisplayBg = this.add.rectangle(GAME_WIDTH / 2, mainCharY, 220, 300, COLORS.backgroundLight, 0.4);
    charDisplayBg.setStrokeStyle(3, COLORS.primary, 0.6);

    // Get party heroes (first 4 from owned heroes)
    const ownedHeroes = this.registry.get('ownedHeroes') || [];
    const partyHeroes = ownedHeroes.slice(0, 4);

    // Main character (first in party or placeholder) - with null defense
    let mainChar;
    const mainHero = partyHeroes[0];

    if (mainHero && this.textures.exists('hero_placeholder')) {
      mainChar = this.add.image(GAME_WIDTH / 2, mainCharY - 20, 'hero_placeholder');
      mainChar.setScale(3);

      // Add hero name below (with null defense)
      const heroName = mainHero?.name ?? '알 수 없는 영웅';
      this.add.text(GAME_WIDTH / 2, mainCharY + 80, heroName, {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // Add level badge (with null defense)
      const heroLevel = mainHero?.level ?? 1;
      const levelBadge = this.add.rectangle(GAME_WIDTH / 2 - 80, mainCharY - 80, 60, 30, COLORS.primary, 0.9);
      levelBadge.setStrokeStyle(2, COLORS.text, 0.3);
      this.add.text(GAME_WIDTH / 2 - 80, mainCharY - 80, `Lv ${heroLevel}`, {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
    } else {
      mainChar = this.add.text(GAME_WIDTH / 2, mainCharY - 20, '👤', {
        fontSize: '120px'
      }).setOrigin(0.5);

      this.add.text(GAME_WIDTH / 2, mainCharY + 80, '영웅을 소환하세요!', {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
    }

    mainChar.setInteractive({ useHandCursor: true });

    // Idle floating animation
    this.tweens.add({
      targets: mainChar,
      y: mainChar.y - 10,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Subtle breathing scale effect
    const baseScaleX = mainChar.scaleX;
    const baseScaleY = mainChar.scaleY;
    this.tweens.add({
      targets: mainChar,
      scaleX: baseScaleX * 1.02,
      scaleY: baseScaleY * 1.02,
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Touch reaction with particle effect
    mainChar.on('pointerdown', () => {
      this.tweens.add({
        targets: mainChar,
        scaleX: baseScaleX * 1.1,
        scaleY: baseScaleY * 0.9,
        duration: 100,
        yoyo: true,
        ease: 'Back.easeOut'
      });

      // Sparkle particles on touch
      if (this.particles) {
        this.particles.playPreset('sparkle', GAME_WIDTH / 2, mainCharY - 20, {
          colors: [COLORS.primary, COLORS.accent, COLORS.text]
        });
      }

      // Show reaction text (Z_INDEX.UI + 10 for temporary floating text)
      const reactions = ['안녕!', '반가워!', '모험을 떠나자!', '오늘도 힘내!', '준비됐어!'];
      const reaction = Phaser.Math.RND.pick(reactions);
      const reactionText = this.add.text(GAME_WIDTH / 2, mainCharY - 160, reaction, {
        fontSize: '20px',
        fontFamily: 'Arial',
        color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
        backgroundColor: `#${  COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
        padding: { x: 15, y: 8 }
      }).setOrigin(0.5).setDepth(Z_INDEX.UI + 10);

      this.tweens.add({
        targets: reactionText,
        y: reactionText.y - 30,
        alpha: 0,
        duration: 1500,
        ease: 'Power2',
        onComplete: () => reactionText.destroy()
      });
    });

    // Sub characters display (party members 2-4) - 제거 (미니뷰에서 표시)
    if (false && partyHeroes.length > 1) {
      const subCharY = GAME_HEIGHT / 2 + 150;
      const spacing = 100;
      const subHeroes = partyHeroes.slice(1, 4);

      subHeroes.forEach((hero, index) => {
        const x = GAME_WIDTH / 2 - spacing + (index * spacing);

        // Sub character frame
        const frame = this.add.rectangle(x, subCharY, 80, 100, COLORS.backgroundLight, 0.5);
        frame.setStrokeStyle(2, COLORS.secondary, 0.6);

        // Sub character image or placeholder
        let subChar;
        if (this.textures.exists('hero_placeholder')) {
          subChar = this.add.image(x, subCharY - 10, 'hero_placeholder');
          subChar.setScale(0.8);
        } else {
          subChar = this.add.text(x, subCharY - 10, '👤', {
            fontSize: '40px'
          }).setOrigin(0.5);
        }

        // Mini level badge (with null defense)
        const subHeroLevel = hero?.level ?? 1;
        const miniLevel = this.add.text(x, subCharY + 35, `Lv${subHeroLevel}`, {
          fontSize: '11px',
          fontFamily: 'Arial',
          color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
          backgroundColor: `#${  COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
          padding: { x: 4, y: 2 }
        }).setOrigin(0.5);

        // Hover effect
        frame.setInteractive({ useHandCursor: true });
        frame.on('pointerover', () => {
          this.tweens.add({
            targets: [frame, subChar, miniLevel],
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 100,
            ease: 'Power2'
          });
        });

        frame.on('pointerout', () => {
          this.tweens.add({
            targets: [frame, subChar, miniLevel],
            scaleX: 1,
            scaleY: 1,
            duration: 100,
            ease: 'Power2'
          });
        });
      });
    }
  }

  createContentButtons() {
    const startY = 950;
    const buttons = [
      { icon: '\u{1F9B8}', label: '영웅', scene: 'HeroListScene' },
      { icon: '\u{1F465}', label: '파티편성', scene: 'PartyEditScene' },
      { icon: '\u{1F4DC}', label: '퀘스트', scene: 'QuestScene' },
      { icon: '\u{1F5FC}', label: '무한탑', scene: 'TowerScene' },
      { icon: '\u{1F4E6}', label: '가방', scene: 'InventoryScene' },
      { icon: '\u2699\uFE0F', label: '설정', scene: 'SettingsScene' },
    ];

    const cols = 3;
    const btnWidth = 105;
    const btnHeight = 75;
    const gapX = 12;
    const gapY = 10;
    const totalWidth = cols * btnWidth + (cols - 1) * gapX;
    const startX = (GAME_WIDTH - totalWidth) / 2 + btnWidth / 2;

    buttons.forEach((btn, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (btnWidth + gapX);
      const y = startY + row * (btnHeight + gapY);

      const container = this.add.container(x, y);

      // Button background
      const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, 0x1a1a3e, 0.8);
      bg.setStrokeStyle(1, 0x4444aa, 0.4);
      bg.setInteractive({ useHandCursor: true });

      // Icon
      const icon = this.add.text(0, -12, btn.icon, {
        fontSize: '28px'
      }).setOrigin(0.5);

      // Label
      const label = this.add.text(0, 22, btn.label, {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: '#ccccdd',
        fontStyle: 'bold'
      }).setOrigin(0.5);

      container.add([bg, icon, label]);

      // Badge system (UIX-2.1.2) - reference BottomNav.js setBadge() pattern
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

      // Hover effects
      bg.on('pointerover', () => {
        bg.setFillStyle(0x2a2a5e, 1);
        this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 100 });
      });
      bg.on('pointerout', () => {
        bg.setFillStyle(0x1a1a3e, 0.8);
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 });
      });
      bg.on('pointerdown', () => {
        // PRD VFX-1.2: Scene-specific transition mapping
        switch (btn.scene) {
          case 'StageSelectScene':
            transitionManager.slideTransition(this, btn.scene, {}, 'left');
            break;
          case 'HeroListScene':
          case 'InventoryScene':
          case 'QuestScene':
            transitionManager.slideTransition(this, btn.scene, {}, 'right');
            break;
          case 'SettingsScene':
            transitionManager.slideTransition(this, btn.scene, {}, 'up');
            break;
          default:
            transitionManager.fadeTransition(this, btn.scene);
            break;
        }
      });
    });
  }

  createBottomNavigation() {
    // BottomNav 컴포넌트 사용 (5탭: 홈/모험/가방/소환/더보기)
    this.bottomNav = new BottomNav(this, 'home');
  }

  showToast(message) {
    const toast = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, message, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${  COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setDepth(Z_INDEX.TOOLTIP);

    this.tweens.add({
      targets: toast,
      y: toast.y - 50,
      alpha: 0,
      duration: 1500,
      delay: 500,
      onComplete: () => toast.destroy()
    });
  }

  update() {
    // Update currency displays (with null defense)
    const gems = this.registry.get('gems') ?? 0;
    const gold = this.registry.get('gold') ?? 0;

    if (this.gemText) this.gemText.setText(gems.toLocaleString());
    if (this.goldText) this.goldText.setText(gold.toLocaleString());

    // 에너지 갱신 with EnergyBar (UIX-2.1.1)
    if (this.energyBar) {
      const es = energySystem.getStatus() || {};
      this.energyBar.update(es?.current ?? 0, es?.max ?? 100);
    }

    // 에너지 회복 타이머 갱신 (UIX-2.1.1)
    if (this.energyTimerText) {
      const timeToRecover = energySystem.getTimeToNextRecovery?.() ?? 0;
      this.energyTimerText.setText(timeToRecover > 0 ? `+1 in ${formatTime(timeToRecover)}` : '');
    }
  }
}
