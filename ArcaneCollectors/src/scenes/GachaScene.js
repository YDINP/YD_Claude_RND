import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY } from '../config/gameConfig.js';
import { SaveManager } from '../systems/SaveManager.js';

export class GachaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GachaScene' });
    this.isAnimating = false;
    this.currentTab = 'hero'; // 'hero' or 'equipment'
  }

  create() {
    this.cameras.main.fadeIn(300);

    this.createBackground();
    this.createHeader();
    this.createTabButtons();
    this.createBannerArea();
    this.createSummonButtons();
    this.createPityDisplay();
  }

  createBackground() {
    // Dark mystical background
    const graphics = this.add.graphics();

    for (let y = 0; y < GAME_HEIGHT; y++) {
      const ratio = y / GAME_HEIGHT;
      const r = Math.floor(15 + ratio * 5);
      const g = Math.floor(10 + ratio * 10);
      const b = Math.floor(30 + ratio * 15);
      graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
      graphics.fillRect(0, y, GAME_WIDTH, 1);
    }

    // Floating particles
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT);
      const size = Phaser.Math.FloatBetween(1, 2);

      const particle = this.add.circle(x, y, size, COLORS.secondary, 0.4);

      this.tweens.add({
        targets: particle,
        y: particle.y - Phaser.Math.Between(100, 200),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 6000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 2000)
      });
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
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);

    backBg.on('pointerdown', () => {
      if (this.isAnimating) return;
      this.cameras.main.fadeOut(200);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MainMenuScene');
      });
    });

    // Title
    this.add.text(GAME_WIDTH / 2, 50, '소환', {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Gems display
    let gemIcon;
    if (this.textures.exists('gem')) {
      gemIcon = this.add.image(GAME_WIDTH - 80, 50, 'gem').setScale(0.7);
    } else {
      gemIcon = this.add.text(GAME_WIDTH - 80, 50, '💎', { fontSize: '20px' }).setOrigin(0.5);
    }
    const gems = this.registry.get('gems') || 1000;
    this.gemText = this.add.text(GAME_WIDTH - 55, 50, gems.toLocaleString(), {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);
  }

  createTabButtons() {
    const tabY = 120;
    const tabWidth = 180;

    // Hero summon tab
    this.heroTab = this.add.container(GAME_WIDTH / 2 - tabWidth / 2 - 10, tabY);
    const heroTabBg = this.add.rectangle(0, 0, tabWidth, 50, COLORS.primary, 1);
    heroTabBg.setStrokeStyle(2, COLORS.text, 0.3);
    const heroTabText = this.add.text(0, 0, '⭐ 영웅 소환', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.heroTab.add([heroTabBg, heroTabText]);
    heroTabBg.setInteractive({ useHandCursor: true });

    // Equipment summon tab
    this.equipTab = this.add.container(GAME_WIDTH / 2 + tabWidth / 2 + 10, tabY);
    const equipTabBg = this.add.rectangle(0, 0, tabWidth, 50, COLORS.backgroundLight, 0.6);
    equipTabBg.setStrokeStyle(2, COLORS.textDark, 0.3);
    const equipTabText = this.add.text(0, 0, '⚔️ 장비 소환', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5);
    this.equipTab.add([equipTabBg, equipTabText]);
    equipTabBg.setInteractive({ useHandCursor: true });

    // Tab switching logic
    heroTabBg.on('pointerdown', () => {
      if (this.currentTab === 'hero' || this.isAnimating) return;
      this.switchTab('hero');
    });

    equipTabBg.on('pointerdown', () => {
      if (this.currentTab === 'equipment' || this.isAnimating) return;
      this.switchTab('equipment');
    });

    // Store references for tab switching
    this.heroTabBg = heroTabBg;
    this.heroTabText = heroTabText;
    this.equipTabBg = equipTabBg;
    this.equipTabText = equipTabText;
  }

  switchTab(tab) {
    this.currentTab = tab;

    if (tab === 'hero') {
      // Activate hero tab
      this.heroTabBg.setFillStyle(COLORS.primary, 1);
      this.heroTabBg.setStrokeStyle(2, COLORS.text, 0.3);
      this.heroTabText.setColor('#' + COLORS.text.toString(16).padStart(6, '0'));
      this.heroTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate equipment tab
      this.equipTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.equipTabBg.setStrokeStyle(2, COLORS.textDark, 0.3);
      this.equipTabText.setColor('#' + COLORS.textDark.toString(16).padStart(6, '0'));
      this.equipTabText.setStyle({ fontStyle: 'normal' });

      this.showMessage('영웅 소환 모드', COLORS.primary);
    } else {
      // Activate equipment tab
      this.equipTabBg.setFillStyle(COLORS.primary, 1);
      this.equipTabBg.setStrokeStyle(2, COLORS.text, 0.3);
      this.equipTabText.setColor('#' + COLORS.text.toString(16).padStart(6, '0'));
      this.equipTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate hero tab
      this.heroTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.heroTabBg.setStrokeStyle(2, COLORS.textDark, 0.3);
      this.heroTabText.setColor('#' + COLORS.textDark.toString(16).padStart(6, '0'));
      this.heroTabText.setStyle({ fontStyle: 'normal' });

      this.showMessage('장비 소환 모드 (준비 중)', COLORS.accent);
    }
  }

  createBannerArea() {
    // Banner container
    const bannerY = 260;

    // Banner frame with gradient
    const bannerBg = this.add.rectangle(GAME_WIDTH / 2, bannerY, GAME_WIDTH - 40, 240, COLORS.backgroundLight, 0.6);
    bannerBg.setStrokeStyle(3, COLORS.secondary, 0.8);

    // Animated background particles
    for (let i = 0; i < 15; i++) {
      const px = GAME_WIDTH / 2 - 200 + Phaser.Math.Between(0, 400);
      const py = bannerY - 100 + Phaser.Math.Between(0, 200);
      const particle = this.add.circle(px, py, Phaser.Math.FloatBetween(1, 3), COLORS.accent, 0.5);

      this.tweens.add({
        targets: particle,
        x: px + Phaser.Math.Between(-30, 30),
        y: py + Phaser.Math.Between(-30, 30),
        alpha: { from: 0.2, to: 0.6 },
        duration: Phaser.Math.Between(2000, 4000),
        yoyo: true,
        repeat: -1
      });
    }

    // Banner title with glow
    const bannerTitle = this.add.text(GAME_WIDTH / 2, bannerY - 90, '✨ 발할라의 전사들 픽업! ✨', {
      fontSize: '22px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
      stroke: '#' + COLORS.backgroundLight.toString(16).padStart(6, '0'),
      strokeThickness: 4
    }).setOrigin(0.5);

    this.tweens.add({
      targets: bannerTitle,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Rate up characters (placeholders)
    const featured = this.add.container(GAME_WIDTH / 2, bannerY);

    const featuredBg = this.add.rectangle(0, 0, 120, 120, COLORS.raritySR, 0.3);
    featuredBg.setStrokeStyle(3, COLORS.raritySSR);

    let featuredChar;
    if (this.textures.exists('hero_placeholder')) {
      featuredChar = this.add.image(0, -10, 'hero_placeholder').setScale(1.2);
    } else {
      featuredChar = this.add.text(0, -10, '👤', { fontSize: '60px' }).setOrigin(0.5);
    }

    const featuredLabel = this.add.text(0, 55, 'SSR 픽업!', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.raritySSR.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    featured.add([featuredBg, featuredChar, featuredLabel]);

    // Glow animation
    this.tweens.add({
      targets: featuredBg,
      alpha: { from: 0.3, to: 0.7 },
      duration: 1000,
      yoyo: true,
      repeat: -1
    });

    // Rotating glow effect
    const glow = this.add.graphics();
    glow.lineStyle(3, COLORS.raritySSR, 0.5);
    glow.strokeCircle(GAME_WIDTH / 2, bannerY, 70);
    this.tweens.add({
      targets: glow,
      rotation: Math.PI * 2,
      duration: 3000,
      repeat: -1,
      ease: 'Linear'
    });

    // Rates info with color coding
    const ratesY = bannerY + 100;
    this.add.text(GAME_WIDTH / 2, ratesY - 10, '천장 카운터: 87/90', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, ratesY + 10, 'SSR 1.5%  SR 15%  R 50%  N 33.5%', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5);
  }

  createSummonButtons() {
    const buttonY = 550;

    // Single summon button
    this.createSummonButton(GAME_WIDTH / 2 - 110, buttonY, '단일 소환', 300, 1);

    // 10x summon button
    this.createSummonButton(GAME_WIDTH / 2 + 110, buttonY, '10연차', 2700, 10, true);

    // Free ticket info
    this.add.text(GAME_WIDTH / 2, buttonY + 55, '🎫 소환권: 5개 보유 중', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0')
    }).setOrigin(0.5);
  }

  createSummonButton(x, y, label, cost, count, isPremium = false) {
    const btn = this.add.container(x, y);

    // Button background with gradient effect
    const bgColor = isPremium ? COLORS.secondary : COLORS.primary;
    const bg = this.add.rectangle(0, 0, 180, 90, bgColor, 1);
    bg.setStrokeStyle(3, COLORS.text, 0.4);
    bg.setInteractive({ useHandCursor: true });

    // Inner glow
    const innerGlow = this.add.rectangle(0, -20, 170, 35, 0xffffff, 0.15);
    btn.add(innerGlow);

    // Button label
    const labelText = this.add.text(0, -18, label, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5);

    // Cost display
    const costContainer = this.add.container(0, 20);
    let gemIcon;
    if (this.textures.exists('gem')) {
      gemIcon = this.add.image(-35, 0, 'gem').setScale(0.6);
    } else {
      gemIcon = this.add.text(-35, 0, '💎', { fontSize: '18px' }).setOrigin(0.5);
    }
    const costText = this.add.text(0, 0, cost.toLocaleString(), {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);
    costContainer.add([gemIcon, costText]);

    btn.add([bg, labelText, costContainer]);

    // Interactions with enhanced effects
    bg.on('pointerover', () => {
      bg.setFillStyle(bgColor, 0.85);
      this.tweens.add({
        targets: btn,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 150,
        ease: 'Back.easeOut'
      });
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(bgColor, 1);
      this.tweens.add({
        targets: btn,
        scaleX: 1,
        scaleY: 1,
        duration: 150,
        ease: 'Power2'
      });
    });

    bg.on('pointerdown', () => {
      if (this.isAnimating) return;

      // Check if equipment summon is disabled
      if (this.currentTab === 'equipment') {
        this.showMessage('장비 소환은 준비 중입니다!', COLORS.accent);
        return;
      }

      const gems = this.registry.get('gems') || 0;
      if (gems < cost) {
        this.showMessage('보석이 부족합니다!', COLORS.danger);
        return;
      }

      // Button press animation
      this.tweens.add({
        targets: btn,
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 100,
        yoyo: true,
        ease: 'Power2'
      });

      // Deduct gems
      const newGems = gems - cost;
      this.registry.set('gems', newGems);
      this.gemText.setText(newGems.toLocaleString());

      // Save gems to localStorage
      const saveData = SaveManager.load();
      saveData.resources.gems = newGems;
      SaveManager.save(saveData);

      // Perform summon
      this.performSummon(count);
    });

    // Premium glow effect
    if (isPremium) {
      const premiumGlow = this.add.graphics();
      premiumGlow.lineStyle(4, COLORS.accent, 0.6);
      premiumGlow.strokeRect(-90, -45, 180, 90);
      btn.add(premiumGlow);
      btn.sendToBack(premiumGlow);

      this.tweens.add({
        targets: premiumGlow,
        alpha: { from: 0.3, to: 0.8 },
        duration: 800,
        yoyo: true,
        repeat: -1
      });
    }
  }

  createPityDisplay() {
    const pityY = 680;

    // Pity counter
    const pity = this.registry.get('pityCounter') || 0;
    const pityMax = 90;

    this.add.text(GAME_WIDTH / 2, pityY, '천장 카운터', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#' + COLORS.textDark.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    // Progress bar background
    this.add.rectangle(GAME_WIDTH / 2, pityY + 30, 300, 20, COLORS.backgroundLight, 1);

    // Progress bar fill
    this.pityBar = this.add.rectangle(
      GAME_WIDTH / 2 - 150 + (300 * pity / pityMax) / 2,
      pityY + 30,
      300 * pity / pityMax,
      16,
      COLORS.secondary,
      1
    ).setOrigin(0, 0.5);

    // Pity text
    this.pityText = this.add.text(GAME_WIDTH / 2, pityY + 30, `${pity}/${pityMax}`, {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    // Info text
    this.add.text(GAME_WIDTH / 2, pityY + 60, '90회 소환 시 SSR 확정!', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0')
    }).setOrigin(0.5);
  }

  performSummon(count) {
    this.isAnimating = true;

    // Get results
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(this.rollGacha());
    }

    // Show summon animation
    this.showSummonAnimation(results);
  }

  rollGacha() {
    let pity = this.registry.get('pityCounter') || 0;
    pity++;

    const roll = Math.random() * 100;
    let rarity;

    // Pity system - guaranteed SSR at 90
    if (pity >= 90) {
      rarity = 'SSR';
      pity = 0;
    } else if (roll < 3) {
      rarity = 'SSR';
      pity = 0; // Reset pity on SSR
    } else if (roll < 18) {
      rarity = 'SR';
    } else if (roll < 68) {
      rarity = 'R';
    } else {
      rarity = 'N';
    }

    this.registry.set('pityCounter', pity);

    // Generate hero
    const elements = ['fire', 'water', 'wind', 'light', 'dark'];
    const element = Phaser.Math.RND.pick(elements);
    const heroId = `hero_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const hero = {
      id: heroId,
      name: this.generateHeroName(rarity),
      rarity: rarity,
      element: element,
      level: 1,
      stars: RARITY[rarity].stars,
      stats: this.generateStats(rarity),
      skills: []
    };

    // Add to owned heroes (registry for in-memory)
    const owned = this.registry.get('ownedHeroes') || [];
    owned.push(hero);
    this.registry.set('ownedHeroes', owned);

    // Save to localStorage for persistence
    const saveData = SaveManager.load();
    saveData.characters.push({
      instanceId: hero.id,
      characterId: hero.id,
      name: hero.name,
      rarity: hero.rarity,
      element: hero.element,
      level: hero.level,
      exp: 0,
      stars: hero.stars,
      stats: hero.stats,
      skills: hero.skills,
      equipped: null
    });
    saveData.gacha.pityCounter = this.registry.get('pityCounter') || 0;
    saveData.gacha.totalPulls = (saveData.gacha.totalPulls || 0) + 1;
    SaveManager.save(saveData);

    return hero;
  }

  generateHeroName(rarity) {
    const prefixes = {
      SSR: ['전설의 ', '신성한 ', '불멸의 ', '황금의 '],
      SR: ['숙련된 ', '고귀한 ', '뛰어난 ', '용감한 '],
      R: ['견습 ', '젊은 ', '유망한 ', ''],
      N: ['평범한 ', '신입 ', '초보 ', '']
    };

    const names = ['전사', '마법사', '궁수', '성기사', '암살자', '힐러', '무도가', '정령사'];

    const prefix = Phaser.Math.RND.pick(prefixes[rarity]);
    const name = Phaser.Math.RND.pick(names);

    return prefix + name;
  }

  generateStats(rarity) {
    const multipliers = { N: 1, R: 1.3, SR: 1.6, SSR: 2 };
    const mult = multipliers[rarity];

    return {
      hp: Math.floor(500 * mult + Phaser.Math.Between(0, 100)),
      atk: Math.floor(100 * mult + Phaser.Math.Between(0, 30)),
      def: Math.floor(80 * mult + Phaser.Math.Between(0, 20)),
      spd: Math.floor(50 + Phaser.Math.Between(0, 30))
    };
  }

  showSummonAnimation(results) {
    // Darken background
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0);
    overlay.setDepth(50);

    this.tweens.add({
      targets: overlay,
      alpha: 0.9,
      duration: 400,
      ease: 'Power2'
    });

    // Check for SSR in results
    const hasSSR = results.some(hero => hero.rarity === 'SSR');
    const hasSR = results.some(hero => hero.rarity === 'SR');

    // Enhanced magic circle animation
    const circleGraphics = this.add.graphics().setDepth(51);
    circleGraphics.lineStyle(4, hasSSR ? COLORS.raritySSR : (hasSR ? COLORS.raritySR : COLORS.primary), 1);

    for (let i = 0; i < 3; i++) {
      circleGraphics.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 100 + i * 30);
    }

    circleGraphics.setAlpha(0).setScale(0);

    this.tweens.add({
      targets: circleGraphics,
      scale: 1.5,
      alpha: 1,
      rotation: Math.PI * 2,
      duration: 1500,
      ease: 'Cubic.easeOut'
    });

    // Burst particles based on rarity
    const particles = [];
    const particleCount = hasSSR ? 40 : (hasSR ? 30 : 20);
    const particleColor = hasSSR ? COLORS.raritySSR : (hasSR ? COLORS.raritySR : COLORS.primary);

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const particle = this.add.circle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        hasSSR ? 6 : 4,
        particleColor
      ).setDepth(52).setAlpha(0);

      particles.push(particle);

      this.tweens.add({
        targets: particle,
        x: GAME_WIDTH / 2 + Math.cos(angle) * (hasSSR ? 200 : 150),
        y: GAME_HEIGHT / 2 + Math.sin(angle) * (hasSSR ? 200 : 150),
        alpha: { from: 1, to: 0 },
        duration: hasSSR ? 1500 : 1000,
        delay: 400 + i * (hasSSR ? 30 : 50),
        ease: 'Cubic.easeOut'
      });
    }

    // SSR Special effect - screen flash
    if (hasSSR) {
      const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0);
      flash.setDepth(55);

      this.tweens.add({
        targets: flash,
        alpha: { from: 0, to: 0.7, to: 0 },
        duration: 600,
        delay: 800,
        ease: 'Power2',
        onComplete: () => flash.destroy()
      });

      // Screen shake
      this.cameras.main.shake(300, 0.01);

      // Rainbow rays
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const ray = this.add.graphics().setDepth(53);
        ray.fillStyle(COLORS.raritySSR, 0.6);
        ray.fillTriangle(0, 0, -10, -300, 10, -300);
        ray.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2);
        ray.setRotation(angle);
        ray.setAlpha(0);

        this.tweens.add({
          targets: ray,
          alpha: { from: 0, to: 1, to: 0 },
          scaleY: { from: 0.5, to: 1.5 },
          duration: 1000,
          delay: 700 + i * 50,
          ease: 'Power2',
          onComplete: () => ray.destroy()
        });
      }
    }

    // SR effect - purple glow
    if (hasSR && !hasSSR) {
      const glow = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 150, COLORS.raritySR, 0.3);
      glow.setDepth(51);

      this.tweens.add({
        targets: glow,
        scale: { from: 0.5, to: 2 },
        alpha: { from: 0.5, to: 0 },
        duration: 1200,
        delay: 500,
        ease: 'Power2',
        onComplete: () => glow.destroy()
      });

      // Mini shake
      this.cameras.main.shake(200, 0.005);
    }

    // Show results after animation
    const animDuration = hasSSR ? 2500 : 2000;
    this.time.delayedCall(animDuration, () => {
      circleGraphics.destroy();
      particles.forEach(p => p.destroy());
      this.showResults(results, overlay);
    });
  }

  showResults(results, overlay) {
    const container = this.add.container(0, 0).setDepth(60);

    // Results background
    const resultBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 40, GAME_HEIGHT - 200, COLORS.backgroundLight, 0.95);
    resultBg.setStrokeStyle(2, COLORS.primary);
    container.add(resultBg);

    // Title
    const title = this.add.text(GAME_WIDTH / 2, 150, '소환 결과', {
      fontSize: '24px',
      fontFamily: 'Georgia, serif',
      color: '#' + COLORS.text.toString(16).padStart(6, '0'),
      fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add(title);

    // Display heroes in grid
    const cols = Math.min(5, results.length);
    const startX = GAME_WIDTH / 2 - ((cols - 1) * 85) / 2;
    const startY = 250;

    results.forEach((hero, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * 85;
      const y = startY + row * 130;

      this.time.delayedCall(index * 100, () => {
        this.createHeroCard(container, x, y, hero);
      });
    });

    // Close button
    const closeBtn = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 120);
    const closeBg = this.add.rectangle(0, 0, 150, 50, COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.add.text(0, 0, '확인', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    closeBtn.add([closeBg, closeText]);
    container.add(closeBtn);

    closeBg.on('pointerdown', () => {
      container.destroy();
      overlay.destroy();
      this.isAnimating = false;
      this.updatePityDisplay();
    });
  }

  createHeroCard(container, x, y, hero) {
    const card = this.add.container(x, y);

    // Card background with rarity color
    const rarityColor = RARITY[hero.rarity].color;
    const cardBg = this.add.rectangle(0, 0, 75, 110, COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(2, rarityColor);

    // Hero image
    const heroImg = this.add.image(0, -15, 'hero_placeholder').setScale(0.7);

    // Rarity indicator
    const rarityBg = this.add.rectangle(0, -50, 30, 18, rarityColor, 1);
    const rarityText = this.add.text(0, -50, hero.rarity, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stars
    const stars = this.add.text(0, 25, '★'.repeat(hero.stars), {
      fontSize: '10px',
      color: '#' + COLORS.accent.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    // Name (truncated)
    const name = hero.name.length > 6 ? hero.name.substring(0, 6) + '..' : hero.name;
    const nameText = this.add.text(0, 42, name, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#' + COLORS.text.toString(16).padStart(6, '0')
    }).setOrigin(0.5);

    card.add([cardBg, heroImg, rarityBg, rarityText, stars, nameText]);
    container.add(card);

    // Entrance animation
    card.setScale(0);
    this.tweens.add({
      targets: card,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut'
    });

    // SSR special effect
    if (hero.rarity === 'SSR') {
      const glow = this.add.circle(x, y, 50, COLORS.raritySSR, 0.3);
      container.add(glow);
      container.sendToBack(glow);

      this.tweens.add({
        targets: glow,
        scale: { from: 0.8, to: 1.2 },
        alpha: { from: 0.5, to: 0 },
        duration: 1000,
        repeat: -1
      });
    }
  }

  updatePityDisplay() {
    const pity = this.registry.get('pityCounter') || 0;
    const pityMax = 90;

    this.tweens.add({
      targets: this.pityBar,
      x: GAME_WIDTH / 2 - 150 + (300 * pity / pityMax) / 2,
      width: 300 * pity / pityMax,
      duration: 300
    });

    this.pityText.setText(`${pity}/${pityMax}`);
  }

  showMessage(text, color = COLORS.text) {
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, text, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#' + color.toString(16).padStart(6, '0'),
      backgroundColor: '#' + COLORS.backgroundLight.toString(16).padStart(6, '0'),
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
