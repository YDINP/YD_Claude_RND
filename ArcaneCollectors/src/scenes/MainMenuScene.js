import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  init(data) {
    this.showOfflineRewards = data?.showOfflineRewards || null;
  }

  create() {
    this.cameras.main.fadeIn(300);

    // Load current resources from SaveManager
    const resources = SaveManager.getResources();
    this.registry.set('gems', resources.gems);
    this.registry.set('gold', resources.gold);

    this.createBackground();
    this.createTopBar();
    this.createTitle();
    this.createCharacterDisplay();
    this.createBottomNavigation();

    // Show offline rewards popup if available
    if (this.showOfflineRewards && this.showOfflineRewards.gold > 0) {
      this.time.delayedCall(500, () => {
        this.showOfflineRewardsPopup(this.showOfflineRewards);
      });
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

    // Decorative particles/stars
    for (let i = 0; i < 30; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT - 200);
      const size = Phaser.Math.FloatBetween(1, 3);
      const alpha = Phaser.Math.FloatBetween(0.2, 0.6);

      graphics.fillStyle(COLORS.text, alpha);
      graphics.fillCircle(x, y, size);
    }

    // Mystic glow at bottom
    const glowGraphics = this.add.graphics();
    glowGraphics.fillStyle(COLORS.primary, 0.1);
    glowGraphics.fillEllipse(GAME_WIDTH / 2, GAME_HEIGHT, GAME_WIDTH, 300);
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

    // Idle animation
    this.tweens.add({
      targets: mainChar,
      y: mainChar.y - 10,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Touch reaction
    mainChar.on('pointerdown', () => {
      this.tweens.add({
        targets: mainChar,
        scaleX: mainChar.scaleX * 1.1,
        scaleY: mainChar.scaleY * 0.9,
        duration: 100,
        yoyo: true,
        ease: 'Back.easeOut'
      });

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

  createBottomNavigation() {
    const navY = GAME_HEIGHT - 60;
    const navHeight = 100;

    // Navigation background
    const navBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 50, GAME_WIDTH, navHeight, COLORS.backgroundLight, 0.95);
    navBg.setDepth(10);

    // Navigation buttons
    const navItems = [
      { key: 'adventure', label: '모험', icon: '⚔️', scene: 'StageSelectScene' },
      { key: 'summon', label: '소환', icon: '✨', scene: 'GachaScene' },
      { key: 'heroes', label: '영웅', icon: '👥', scene: 'HeroListScene' },
      { key: 'menu', label: '메뉴', icon: '☰', scene: null }
    ];

    const buttonWidth = GAME_WIDTH / navItems.length;

    navItems.forEach((item, index) => {
      const x = buttonWidth * index + buttonWidth / 2;

      // Button container
      const btn = this.add.container(x, navY).setDepth(11);

      // Button background
      const btnBg = this.add.rectangle(0, 0, buttonWidth - 10, 80, 0x000000, 0)
        .setInteractive({ useHandCursor: true });

      // Icon
      const icon = this.add.text(0, -15, item.icon, {
        fontSize: '28px'
      }).setOrigin(0.5);

      // Label
      const label = this.add.text(0, 20, item.label, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
      }).setOrigin(0.5);

      btn.add([btnBg, icon, label]);

      // Interactions
      btnBg.on('pointerover', () => {
        icon.setScale(1.2);
        label.setStyle({ color: '#' + COLORS.text.toString(16).padStart(6, '0') });
      });

      btnBg.on('pointerout', () => {
        icon.setScale(1);
        label.setStyle({ color: '#' + COLORS.textDark.toString(16).padStart(6, '0') });
      });

      btnBg.on('pointerdown', () => {
        this.tweens.add({
          targets: btn,
          scaleX: 0.9,
          scaleY: 0.9,
          duration: 50,
          yoyo: true
        });

        if (item.scene) {
          // Save before transitioning
          const data = SaveManager.load();
          data.lastOnline = Date.now();
          SaveManager.save(data);

          this.cameras.main.fadeOut(200, 0, 0, 0);
          this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start(item.scene);
          });
        } else {
          this.showToast('준비 중입니다!');
        }
      });
    });
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
  }
}
