import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';
import { BottomNav } from '../components/BottomNav.js';
import { energySystem } from '../systems/EnergySystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';

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

    // Load current resources from SaveManager
    const resources = SaveManager.getResources();
    this.registry.set('gems', resources.gems);
    this.registry.set('gold', resources.gold);

    this.createBackground();
    this.createTopBar();
    this.createTitle();
    this.createCharacterDisplay();

    // === 콘텐츠 바로가기 버튼 ===
    this.createContentButtons();

    this.createBottomNavigation();

    // Show offline rewards popup if available
    if (this.showOfflineRewards && this.showOfflineRewards.gold > 0) {
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
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
  }

  showOfflineRewardsPopup(rewards) {
    // Overlay
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setDepth(50)
      .setInteractive();

    // Popup panel
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 320, 280, COLORS.backgroundLight, 1)
      .setDepth(51)
      .setStrokeStyle(2, COLORS.primary);

    // Title
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100, '🎁 오프라인 보상', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    // Duration
    const duration = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, `${rewards.formattedDuration} 동안 모험했습니다!`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setDepth(52);

    // Gold reward
    const goldText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, `💰 골드: +${rewards.gold.toLocaleString()}`, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setDepth(52);

    // Exp reward
    const expText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, `⭐ 경험치: +${rewards.exp.toLocaleString()}`, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#' + COLORS.success.toString(16).padStart(6, '0')
    }).setOrigin(0.5).setDepth(52);

    // Claim button
    const claimBtn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90, 200, 50, COLORS.primary)
      .setDepth(52)
      .setInteractive({ useHandCursor: true });

    const claimText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90, '받기', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#FFFFFF',
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(52);

    claimBtn.on('pointerover', () => claimBtn.setFillStyle(COLORS.secondary));
    claimBtn.on('pointerout', () => claimBtn.setFillStyle(COLORS.primary));

    claimBtn.on('pointerdown', () => {
      // Claim rewards
      SaveManager.claimOfflineRewards();

      // Update registry
      const newResources = SaveManager.getResources();
      this.registry.set('gems', newResources.gems);
      this.registry.set('gold', newResources.gold);

      // Animate and close
      this.tweens.add({
        targets: [overlay, panel, title, duration, goldText, expText, claimBtn, claimText],
        alpha: 0,
        duration: 300,
        onComplete: () => {
          overlay.destroy();
          panel.destroy();
          title.destroy();
          duration.destroy();
          goldText.destroy();
          expText.destroy();
          claimBtn.destroy();
          claimText.destroy();
        }
      });

      // Show toast
      this.showToast('보상을 받았습니다!');
    });
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
    // Top bar background
    const topBar = this.add.rectangle(GAME_WIDTH / 2, 40, GAME_WIDTH, 80, COLORS.backgroundLight, 0.9);
    topBar.setDepth(10);

    // Gems display - use texture if exists, else create placeholder
    let gemIcon;
    if (this.textures.exists('gem')) {
      gemIcon = this.add.image(30, 40, 'gem').setScale(1).setDepth(11);
    } else {
      gemIcon = this.add.text(30, 40, '💎', { fontSize: '20px' }).setOrigin(0.5).setDepth(11);
    }

    const gems = this.registry.get('gems') || 1500;
    this.gemText = this.add.text(55, 40, gems.toLocaleString(), {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(11);

    // Gold display
    let goldIcon;
    if (this.textures.exists('gold')) {
      goldIcon = this.add.image(150, 40, 'gold').setScale(1).setDepth(11);
    } else {
      goldIcon = this.add.text(150, 40, '🪙', { fontSize: '20px' }).setOrigin(0.5).setDepth(11);
    }

    const gold = this.registry.get('gold') || 10000;
    this.goldText = this.add.text(175, 40, gold.toLocaleString(), {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(11);

    // Energy display
    const energyStatus = energySystem.getStatus();
    this.add.text(300, 40, '⚡', { fontSize: '18px' }).setOrigin(0.5).setDepth(11);
    this.energyText = this.add.text(320, 40, `${energyStatus.current}/${energyStatus.max}`, {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#' + COLORS.success.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0, 0.5).setDepth(11);

    // Settings button
    const settingsBtn = this.add.rectangle(GAME_WIDTH - 40, 40, 40, 40, COLORS.backgroundLight, 0.8)
      .setDepth(11)
      .setInteractive({ useHandCursor: true });

    const settingsIcon = this.add.text(GAME_WIDTH - 40, 40, '⚙️', {
      fontSize: '24px'
    }).setOrigin(0.5).setDepth(11);

    settingsBtn.on('pointerover', () => settingsBtn.setFillStyle(COLORS.primary, 0.5));
    settingsBtn.on('pointerout', () => settingsBtn.setFillStyle(COLORS.backgroundLight, 0.8));
    settingsBtn.on('pointerdown', () => {
      this.showToast('설정 준비 중!');
    });
  }

  createTitle() {
    // Game title
    const title = this.add.text(GAME_WIDTH / 2, 120, 'Arcane Collectors', {
      fontSize: '32px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
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

  createCharacterDisplay() {
    // Main character display area (larger)
    const mainCharY = GAME_HEIGHT / 2 - 80;
    const charDisplayBg = this.add.rectangle(GAME_WIDTH / 2, mainCharY, 220, 300, COLORS.backgroundLight, 0.4);
    charDisplayBg.setStrokeStyle(3, COLORS.primary, 0.6);

    // Get party heroes (first 4 from owned heroes)
    const ownedHeroes = this.registry.get('ownedHeroes') || [];
    const partyHeroes = ownedHeroes.slice(0, 4);

    // Main character (first in party or placeholder)
    let mainChar;
    const mainHero = partyHeroes[0];

    if (mainHero && this.textures.exists('hero_placeholder')) {
      mainChar = this.add.image(GAME_WIDTH / 2, mainCharY - 20, 'hero_placeholder');
      mainChar.setScale(3);

      // Add hero name below
      this.add.text(GAME_WIDTH / 2, mainCharY + 80, mainHero.name, {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: '#' + COLORS.text.toString(16).padStart(6, '0'),
        fontStyle: 'bold'
      }).setOrigin(0.5);

      // Add level badge
      const levelBadge = this.add.rectangle(GAME_WIDTH / 2 - 80, mainCharY - 80, 60, 30, COLORS.primary, 0.9);
      levelBadge.setStrokeStyle(2, COLORS.text, 0.3);
      this.add.text(GAME_WIDTH / 2 - 80, mainCharY - 80, `Lv ${mainHero.level || 1}`, {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: '#' + COLORS.text.toString(16).padStart(6, '0'),
        fontStyle: 'bold'
      }).setOrigin(0.5);
    } else {
      mainChar = this.add.text(GAME_WIDTH / 2, mainCharY - 20, '👤', {
        fontSize: '120px'
      }).setOrigin(0.5);

      this.add.text(GAME_WIDTH / 2, mainCharY + 80, '영웅을 소환하세요!', {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
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

      // Show reaction text
      const reactions = ['안녕!', '반가워!', '모험을 떠나자!', '오늘도 힘내!', '준비됐어!'];
      const reaction = Phaser.Math.RND.pick(reactions);
      const reactionText = this.add.text(GAME_WIDTH / 2, mainCharY - 160, reaction, {
        fontSize: '20px',
        fontFamily: 'Arial',
        color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
        backgroundColor: '#' + COLORS.backgroundLight.toString(16).padStart(6, '0'),
        padding: { x: 15, y: 8 }
      }).setOrigin(0.5).setDepth(20);

      this.tweens.add({
        targets: reactionText,
        y: reactionText.y - 30,
        alpha: 0,
        duration: 1500,
        ease: 'Power2',
        onComplete: () => reactionText.destroy()
      });
    });

    // Sub characters display (party members 2-4)
    if (partyHeroes.length > 1) {
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

        // Mini level badge
        const miniLevel = this.add.text(x, subCharY + 35, `Lv${hero.level || 1}`, {
          fontSize: '11px',
          fontFamily: 'Arial',
          color: '#' + COLORS.text.toString(16).padStart(6, '0'),
          backgroundColor: '#' + COLORS.backgroundLight.toString(16).padStart(6, '0'),
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
    const startY = 920;
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
        this.cameras.main.fadeOut(200, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start(btn.scene);
        });
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
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      backgroundColor: '#' + COLORS.backgroundLight.toString(16).padStart(6, '0'),
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setDepth(100);

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
    // Update currency displays
    const gems = this.registry.get('gems') || 0;
    const gold = this.registry.get('gold') || 0;

    if (this.gemText) this.gemText.setText(gems.toLocaleString());
    if (this.goldText) this.goldText.setText(gold.toLocaleString());

    // 에너지 갱신
    if (this.energyText) {
      const es = energySystem.getStatus();
      this.energyText.setText(`${es.current}/${es.max}`);
    }
  }
}
