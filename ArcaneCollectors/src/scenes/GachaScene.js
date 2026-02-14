import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY } from '../config/gameConfig.js';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';
import GameLogger from '../utils/GameLogger.js';
import { SaveManager } from '../systems/SaveManager.js';
import { GachaSystem } from '../systems/GachaSystem.js';
import { EquipmentSystem } from '../systems/EquipmentSystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import { getCharacter, normalizeHeroes } from '../data/index.js';
import { BottomNav } from '../components/BottomNav.js';
import transitionManager from '../utils/TransitionManager.js';

export class GachaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GachaScene' });
    this.isAnimating = false;
    this.currentTab = 'hero'; // 'hero' or 'equipment'
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);

    // H-3: ParticleManager 초기화
    this.particles = new ParticleManager(this);

    this.createBackground();
    this.createHeader();
    this.createTabButtons();
    this.createBannerArea();
    this.createSummonButtons();
    this.createPityDisplay();

    this.bottomNav = new BottomNav(this, 'gacha');
    } catch (error) {
      console.error('[GachaScene] create() 실패:', error);
      this.add.text(360, 640, '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: '20px', fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  createBackground() {
    // ART-1: 배경 텍스처 사용 (폴백: 기존 그래디언트)
    if (this.textures.exists('bg_gacha')) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'bg_gacha').setOrigin(0.5);
    } else {
      // Fallback: Dark mystical background
      const graphics = this.add.graphics();

      for (let y = 0; y < GAME_HEIGHT; y++) {
        const ratio = y / GAME_HEIGHT;
        const r = Math.floor(15 + ratio * 5);
        const g = Math.floor(10 + ratio * 10);
        const b = Math.floor(30 + ratio * 15);
        graphics.fillStyle(Phaser.Display.Color.GetColor(r, g, b), 1);
        graphics.fillRect(0, y, GAME_WIDTH, 1);
      }
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
    // LAYOUT 통일: Header background (100px)
    this.add.rectangle(GAME_WIDTH / 2, 50, GAME_WIDTH, 100, COLORS.backgroundLight, 0.9);

    // Back button (좌상단 30, 50 위치, 50×40 터치 영역)
    const backBtn = this.add.container(30, 50);
    const backBg = this.add.rectangle(0, 0, 50, 40, COLORS.backgroundLight, 0.8)
      .setInteractive({ useHandCursor: true });
    const backText = this.add.text(0, 0, '← 뒤로', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);

    backBg.on('pointerdown', () => {
      if (this.isAnimating) return;
      transitionManager.fadeTransition(this, 'MainMenuScene');
    });

    // Title
    this.add.text(GAME_WIDTH / 2, 50, '소환', {
      fontSize: '28px',
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Gems display
    let gemIcon;
    if (this.textures.exists('gem')) {
      gemIcon = this.add.image(GAME_WIDTH - 80, 50, 'gem').setScale(0.7);
    } else {
      gemIcon = this.add.text(GAME_WIDTH - 80, 50, '💎', { fontSize: '20px' }).setOrigin(0.5);
    }
    const resources = SaveManager.getResources();
    const gems = resources.gems;
    this.registry.set('gems', gems); // sync registry
    this.gemText = this.add.text(GAME_WIDTH - 55, 50, gems.toLocaleString(), {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
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
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
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
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
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
      this.heroTabText.setColor(`#${  COLORS.text.toString(16).padStart(6, '0')}`);
      this.heroTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate equipment tab
      this.equipTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.equipTabBg.setStrokeStyle(2, COLORS.textDark, 0.3);
      this.equipTabText.setColor(`#${  COLORS.textDark.toString(16).padStart(6, '0')}`);
      this.equipTabText.setStyle({ fontStyle: 'normal' });

      this.showMessage('영웅 소환 모드', COLORS.primary);
      // 천장 카운터 표시
      if (this.pityBar) this.pityBar.setVisible(true);
      if (this.pityText) this.pityText.setVisible(true);
      if (this.equipGuaranteeText) this.equipGuaranteeText.setVisible(false);
    } else {
      // Activate equipment tab
      this.equipTabBg.setFillStyle(COLORS.primary, 1);
      this.equipTabBg.setStrokeStyle(2, COLORS.text, 0.3);
      this.equipTabText.setColor(`#${  COLORS.text.toString(16).padStart(6, '0')}`);
      this.equipTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate hero tab
      this.heroTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.heroTabBg.setStrokeStyle(2, COLORS.textDark, 0.3);
      this.heroTabText.setColor(`#${  COLORS.textDark.toString(16).padStart(6, '0')}`);
      this.heroTabText.setStyle({ fontStyle: 'normal' });

      this.showMessage('장비 소환 모드', COLORS.accent);
      // 장비 보장 정보 표시, 천장 카운터 숨김
      if (this.pityBar) this.pityBar.setVisible(false);
      if (this.pityText) this.pityText.setVisible(false);
      if (!this.equipGuaranteeText) {
        this.equipGuaranteeText = this.add.text(GAME_WIDTH / 2, 710, '10연차 SR등급 이상 장비 1개 보장!', {
          fontSize: '13px', fontFamily: 'Arial',
          color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
          fontStyle: 'bold'
        }).setOrigin(0.5);
      }
      this.equipGuaranteeText.setVisible(true);
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
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: `#${  COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
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
      color: `#${  COLORS.raritySSR.toString(16).padStart(6, '0')}`,
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

    // Rates info with dynamic pity counter
    const ratesY = bannerY + 100;
    const pityInfo = GachaSystem.getPityInfo();
    this.bannerPityText = this.add.text(GAME_WIDTH / 2, ratesY - 10, `천장 카운터: ${pityInfo.current}/${pityInfo.threshold}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, ratesY + 10, `SSR ${pityInfo.currentSSRRate}  SR 15%  R 50%  N 32%`, {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
  }

  createSummonButtons() {
    // UIX-3.4: 소환 버튼 위치 하단 BottomNav 위 (y=950 정도)
    const buttonY = 950;

    // Single summon button
    this.createSummonButton(GAME_WIDTH / 2 - 110, buttonY, '단일 소환', 300, 1);

    // 10x summon button
    this.createSummonButton(GAME_WIDTH / 2 + 110, buttonY, '10연차', 2700, 10, true);

    // Ticket summon buttons
    const ticketY = buttonY + 40; // BottomNav(y=1160) 겹침 방지: 버튼 하단이 1160 이내
    const ticketResources = SaveManager.getResources();
    const ticketCount = ticketResources.summonTickets || 0;

    this.ticketText = this.add.text(GAME_WIDTH / 2, ticketY, `🎫 소환권: ${ticketCount}개`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Ticket single pull button
    const ticketBtn1 = this.add.container(GAME_WIDTH / 2 - 110, ticketY + 45);
    const ticketBg1 = this.add.rectangle(0, 0, 180, 50, 0x2a5298, 1);
    ticketBg1.setStrokeStyle(2, COLORS.accent, 0.5);
    ticketBg1.setInteractive({ useHandCursor: true });
    const ticketLabel1 = this.add.text(0, 0, '🎫 ×1 소환', {
      fontSize: '16px', fontFamily: 'Arial',
      color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    ticketBtn1.add([ticketBg1, ticketLabel1]);

    ticketBg1.on('pointerdown', () => {
      if (this.isAnimating) return;
      const res = SaveManager.getResources();
      if (res.summonTickets < 1) {
        this.showMessage('소환권이 부족합니다!', COLORS.danger);
        return;
      }
      if (this.currentTab === 'equipment') {
        this.performEquipmentPullWithTickets(1);
      } else {
        this.performTicketPull(1);
      }
    });

    // Ticket 10-pull button
    const ticketBtn10 = this.add.container(GAME_WIDTH / 2 + 110, ticketY + 45);
    const ticketBg10 = this.add.rectangle(0, 0, 180, 50, 0x2a5298, 1);
    ticketBg10.setStrokeStyle(2, COLORS.accent, 0.5);
    ticketBg10.setInteractive({ useHandCursor: true });
    const ticketLabel10 = this.add.text(0, 0, '🎫 ×10 소환', {
      fontSize: '16px', fontFamily: 'Arial',
      color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    ticketBtn10.add([ticketBg10, ticketLabel10]);

    ticketBg10.on('pointerdown', () => {
      if (this.isAnimating) return;
      const res = SaveManager.getResources();
      if (res.summonTickets < 10) {
        this.showMessage('소환권이 부족합니다! (10장 필요)', COLORS.danger);
        return;
      }
      if (this.currentTab === 'equipment') {
        this.performEquipmentPullWithTickets(10);
      } else {
        this.performTicketPull(10);
      }
    });
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
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
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
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
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

      // 보석 부족 체크
      const cost = count === 1 ? 300 : 2700;
      const resources = SaveManager.getResources();
      if (resources.gems < cost) {
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

      if (this.currentTab === 'equipment') {
        this.performEquipmentPull(count, cost);
      } else {
        // GachaSystem으로 소환 가능 여부 재확인
        if (!GachaSystem.canPull(count, 'gems')) {
          this.showMessage('보석이 부족합니다!', COLORS.danger);
          return;
        }
        this.performGachaPull(count);
      }
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

    // GachaSystem에서 동적으로 가져오기
    const pityInfo = GachaSystem.getPityInfo();
    const pity = pityInfo.current;
    const pityMax = pityInfo.threshold;

    this.add.text(GAME_WIDTH / 2, pityY, '천장 카운터', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
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
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Info text
    this.add.text(GAME_WIDTH / 2, pityY + 60, '90회 소환 시 SSR 확정!', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
  }

  performSummon(count) {
    // 레거시 호환: performGachaPull로 위임
    this.performGachaPull(count);
  }

  /**
   * GachaSystem을 통한 소환 실행
   */
  performGachaPull(count) {
    this.isAnimating = true;
    GameLogger.log('GACHA', `소환 ${count}회 (gems)`, { pityBefore: GachaSystem.getPityInfo().current });

    // GachaSystem.pull()로 실제 소환
    const pullResult = GachaSystem.pull(count, 'gems');

    if (!pullResult.success) {
      this.showMessage(pullResult.error, COLORS.danger);
      this.isAnimating = false;
      return;
    }

    // 젬 UI 업데이트
    const resources = SaveManager.getResources();
    this.registry.set('gems', resources.gems);
    if (this.gemText) {
      this.gemText.setText(resources.gems.toLocaleString());
    }

    // 결과를 씬 UI용 형식으로 변환
    const results = pullResult.results.map(r => {
      const charData = getCharacter(r.characterId);
      return {
        id: r.characterId,
        name: charData?.name || r.characterId,
        rarity: r.rarity,
        level: 1,
        stars: getRarityNum(r.rarity) || RARITY[getRarityKey(r.rarity)]?.stars || 1,
        stats: charData?.stats || { hp: 100, atk: 20, def: 10, spd: 10 },
        isNew: r.isNew,
        shardsGained: r.shardsGained,
        mood: charData?.mood || 'brave',
        cult: charData?.cult || 'olympus',
        class: charData?.class || 'warrior'
      };
    });

    // registry에 소유 캐릭터 업데이트 (정규화 적용)
    const owned = normalizeHeroes(SaveManager.getOwnedCharacters());
    this.registry.set('ownedHeroes', owned);

    // 천장 카운터 UI 업데이트
    this.updatePityUI(pullResult.pityInfo);

    GameLogger.log('GACHA', `결과: ${results.map(r => `${r.name  }(${  r.rarity  })`).join(', ')}`);

    // Show summon animation
    this.showSummonAnimation(results);
  }

  performTicketPull(count) {
    this.isAnimating = true;

    const result = GachaSystem.pull(count, 'tickets');
    if (!result.success) {
      this.showMessage(result.error || '소환 실패', COLORS.danger);
      this.isAnimating = false;
      return;
    }

    // Update ticket display
    const updatedResources = SaveManager.getResources();
    if (this.ticketText) this.ticketText.setText(`🎫 소환권: ${updatedResources.summonTickets}개`);

    // 결과를 씬 UI용 형식으로 변환
    const results = result.results.map(r => {
      const charData = getCharacter(r.characterId);
      return {
        id: r.characterId,
        name: charData?.name || r.characterId,
        rarity: r.rarity,
        level: 1,
        stars: getRarityNum(r.rarity) || RARITY[getRarityKey(r.rarity)]?.stars || 1,
        stats: charData?.stats || { hp: 100, atk: 20, def: 10, spd: 10 },
        isNew: r.isNew,
        shardsGained: r.shardsGained,
        mood: charData?.mood || 'brave',
        cult: charData?.cult || 'olympus',
        class: charData?.class || 'warrior'
      };
    });

    // registry에 소유 캐릭터 업데이트 (정규화 적용)
    const owned = normalizeHeroes(SaveManager.getOwnedCharacters());
    this.registry.set('ownedHeroes', owned);

    // 천장 카운터 UI 업데이트
    this.updatePityUI(result.pityInfo);

    // Show summon animation
    this.showSummonAnimation(results);
  }

  performEquipmentPullWithTickets(count) {
    const res = SaveManager.getResources();
    const ticketCost = count === 10 ? 10 : 1;
    if (res.summonTickets < ticketCost) {
      this.showMessage('소환권이 부족합니다!', COLORS.danger);
      return;
    }

    this.isAnimating = true;
    SaveManager.spendSummonTickets(ticketCost);

    const results = [];
    for (let i = 0; i < count; i++) {
      const rarityRoll = Math.random();
      let rarity, color;
      if (rarityRoll < 0.03) { rarity = 'SSR'; color = 0xFFD700; }
      else if (rarityRoll < 0.15) { rarity = 'SR'; color = 0xAA44FF; }
      else { rarity = 'R'; color = 0x4488FF; }

      const slots = ['weapon', 'armor', 'accessory', 'boots'];
      const slot = slots[Math.floor(Math.random() * slots.length)];
      results.push({
        id: `equip_${Date.now()}_${i}`,
        name: `${rarity} ${slot === 'weapon' ? '무기' : slot === 'armor' ? '방어구' : slot === 'accessory' ? '장신구' : '신발'}`,
        rarity, slot, color,
        stats: { atk: Math.floor(Math.random() * 50) + 10, def: Math.floor(Math.random() * 30) + 5 }
      });
    }

    const updatedResources = SaveManager.getResources();
    if (this.ticketText) this.ticketText.setText(`🎫 소환권: ${updatedResources.summonTickets}개`);

    this.showEquipmentResults(results);
  }

  /**
   * 천장 카운터 UI 업데이트
   */
  updatePityUI(pityInfo) {
    if (this.bannerPityText) {
      this.bannerPityText.setText(`천장 카운터: ${pityInfo.current}/${pityInfo.threshold}`);
    }
    if (this.pityText) {
      this.pityText.setText(`${pityInfo.current}/${pityInfo.threshold}`);
    }
    if (this.pityBar) {
      const progress = pityInfo.current / pityInfo.threshold;
      this.tweens.add({
        targets: this.pityBar,
        width: 300 * progress,
        duration: 300
      });
    }
  }

  /**
   * 장비 가챠 소환 실행
   */
  performEquipmentPull(count, cost) {
    this.isAnimating = true;

    // SaveManager API로 보석 차감
    SaveManager.spendGems(cost);

    // 젬 UI 업데이트 (SaveManager에서 최신값 조회)
    const resources = SaveManager.getResources();
    this.registry.set('gems', resources.gems);
    if (this.gemText) {
      this.gemText.setText(resources.gems.toLocaleString());
    }

    // 장비 등급 결정 및 생성
    const EQUIP_RATES = { SSR: 0.015, SR: 0.085, R: 0.30, N: 0.60 };
    const SLOT_TYPES = ['weapon', 'armor', 'accessory', 'relic'];
    const SLOT_NAMES = { weapon: '무기', armor: '방어구', accessory: '악세서리', relic: '유물' };
    const SLOT_ICONS = { weapon: '⚔️', armor: '🛡️', accessory: '💍', relic: '🔮' };

    const results = [];
    let guaranteeSR = count >= 10; // 10연차 SR 이상 1회 보장

    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      let rarity;
      if (roll < EQUIP_RATES.SSR) {
        rarity = 'SSR';
        guaranteeSR = false;
      } else if (roll < EQUIP_RATES.SSR + EQUIP_RATES.SR) {
        rarity = 'SR';
        guaranteeSR = false;
      } else if (roll < EQUIP_RATES.SSR + EQUIP_RATES.SR + EQUIP_RATES.R) {
        rarity = 'R';
      } else {
        rarity = 'N';
      }

      // 10연차 마지막인데 SR 이상이 없으면 보장
      if (i === count - 1 && guaranteeSR) {
        rarity = 'SR';
      }

      const slotType = Phaser.Math.RND.pick(SLOT_TYPES);
      const equipment = EquipmentSystem.createEquipment(slotType, rarity);

      results.push({
        ...equipment,
        slotName: SLOT_NAMES[slotType],
        slotIcon: SLOT_ICONS[slotType]
      });
    }

    // 소환 연출
    this.showEquipmentAnimation(results);
  }

  showEquipmentAnimation(results) {
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0);
    overlay.setDepth(50);

    this.tweens.add({
      targets: overlay,
      alpha: 0.9,
      duration: 400,
      ease: 'Power2'
    });

    const hasSSR = results.some(e => e.rarity === 'SSR');
    const hasSR = results.some(e => e.rarity === 'SR');

    // 장비 소환 이펙트 (기어/톱니 모양)
    const circleGraphics = this.add.graphics().setDepth(51);
    const effectColor = hasSSR ? COLORS.raritySSR : (hasSR ? COLORS.raritySR : COLORS.accent);
    circleGraphics.lineStyle(3, effectColor, 1);

    // 육각형 마법진 효과
    for (let ring = 0; ring < 3; ring++) {
      const radius = 80 + ring * 35;
      const sides = 6;
      circleGraphics.beginPath();
      for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
        const px = GAME_WIDTH / 2 + Math.cos(angle) * radius;
        const py = GAME_HEIGHT / 2 + Math.sin(angle) * radius;
        if (i === 0) circleGraphics.moveTo(px, py);
        else circleGraphics.lineTo(px, py);
      }
      circleGraphics.strokePath();
    }

    circleGraphics.setAlpha(0).setScale(0);

    this.tweens.add({
      targets: circleGraphics,
      scale: 1.3,
      alpha: 1,
      rotation: Math.PI / 3,
      duration: 1200,
      ease: 'Cubic.easeOut'
    });

    // 파티클 버스트
    const particleCount = hasSSR ? 35 : 20;
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const particle = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, hasSSR ? 5 : 3, effectColor)
        .setDepth(52).setAlpha(0);
      particles.push(particle);

      this.tweens.add({
        targets: particle,
        x: GAME_WIDTH / 2 + Math.cos(angle) * 180,
        y: GAME_HEIGHT / 2 + Math.sin(angle) * 180,
        alpha: { from: 1, to: 0 },
        duration: 1200,
        delay: 300 + i * 25,
        ease: 'Cubic.easeOut'
      });
    }

    if (hasSSR) {
      const flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xFFD700, 0);
      flash.setDepth(55);
      this.tweens.add({
        targets: flash,
        alpha: { from: 0, to: 0.5 },
        duration: 400,
        delay: 600,
        yoyo: true,
        onComplete: () => flash.destroy()
      });
      this.cameras.main.shake(250, 0.008);
    }

    const animDuration = hasSSR ? 2200 : 1600;
    this.time.delayedCall(animDuration, () => {
      circleGraphics.destroy();
      particles.forEach(p => p.destroy());
      this.showEquipmentResults(results, overlay);
    });
  }

  showEquipmentResults(results, overlay) {
    const container = this.add.container(0, 0).setDepth(60);

    const resultBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 40, GAME_HEIGHT - 200, COLORS.backgroundLight, 0.95);
    resultBg.setStrokeStyle(2, COLORS.accent);
    container.add(resultBg);

    const title = this.add.text(GAME_WIDTH / 2, 150, '⚔️ 장비 소환 결과', {
      fontSize: '24px',
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add(title);

    const cols = Math.min(5, results.length);
    const startX = GAME_WIDTH / 2 - ((cols - 1) * 85) / 2;
    const startY = 250;

    results.forEach((equip, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * 85;
      const y = startY + row * 140;

      this.time.delayedCall(index * 80, () => {
        this.createEquipmentCard(container, x, y, equip);
      });
    });

    const closeBtn = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 120);
    const closeBg = this.add.rectangle(0, 0, 150, 50, COLORS.accent, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.add.text(0, 0, '확인', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    closeBtn.add([closeBg, closeText]);
    container.add(closeBtn);

    closeBg.on('pointerdown', () => {
      container.destroy();
      overlay.destroy();
      this.isAnimating = false;
    });
  }

  createEquipmentCard(container, x, y, equip) {
    const card = this.add.container(x, y);
    const rarityColor = COLORS.rarity[equip.rarity] || COLORS.rarityN;

    const cardBg = this.add.rectangle(0, 0, 75, 120, COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(2, rarityColor);

    // 슬롯 아이콘
    const icon = this.add.text(0, -25, equip.slotIcon || '⚔️', {
      fontSize: '32px'
    }).setOrigin(0.5);

    // 등급 배지
    const rarityBadge = this.add.rectangle(0, -55, 30, 18, rarityColor, 1);
    const rarityText = this.add.text(0, -55, equip.rarity, {
      fontSize: '10px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    // 슬롯 타입
    const slotText = this.add.text(0, 15, equip.slotName || equip.slotType, {
      fontSize: '11px', fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 장비 이름 (축약)
    const displayName = equip.name && equip.name.length > 6 ? `${equip.name.substring(0, 6)  }..` : (equip.name || '장비');
    const nameText = this.add.text(0, 35, displayName, {
      fontSize: '9px', fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 주요 스탯 표시
    const mainStat = equip.stats ? Object.entries(equip.stats)[0] : null;
    const statLabel = mainStat ? `${mainStat[0]} +${Math.floor(mainStat[1])}` : '';
    const statText = this.add.text(0, 50, statLabel, {
      fontSize: '9px', fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    card.add([cardBg, icon, rarityBadge, rarityText, slotText, nameText, statText]);
    container.add(card);

    card.setScale(0);
    this.tweens.add({
      targets: card,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut'
    });

    if (equip.rarity === 'SSR') {
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

    // H-3: ParticleManager 기반 등급별 파티클 추가
    if (this.particles) {
      const bestRarity = hasSSR ? 'SSR' : (hasSR ? 'SR' : 'R');
      const cx = GAME_WIDTH / 2;
      const cy = GAME_HEIGHT / 2;

      // 등급별 소환 파티클
      this.time.delayedCall(500, () => {
        this.particles.playRarityEffect(bestRarity, cx, cy);
      });

      // 최고 등급 캐릭터의 분위기(Mood) 파티클 수렴 (H-3.2)
      const bestHero = results.find(h => h.rarity === bestRarity);
      if (bestHero?.mood) {
        this.time.delayedCall(1000, () => {
          this.particles.playMoodEffect(bestHero.mood, cx, cy, 'skill');
        });
      }
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
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
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
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
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
    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const cardBg = this.add.rectangle(0, 0, 75, 110, COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(2, rarityColor);

    // Hero image
    const heroImg = this.add.image(0, -15, 'hero_placeholder').setScale(0.7);

    // Rarity indicator
    const rarityBg = this.add.rectangle(0, -50, 30, 18, rarityColor, 1);
    const rarityText = this.add.text(0, -50, rKey, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stars
    const starCount = hero.stars || getRarityNum(hero.rarity) || rarityData.stars || 1;
    const stars = this.add.text(0, 25, '★'.repeat(starCount), {
      fontSize: '10px',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Name (truncated)
    const heroName = hero.name || '???';
    const name = heroName.length > 6 ? `${heroName.substring(0, 6)  }..` : heroName;
    const nameText = this.add.text(0, 42, name, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
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
    const pityInfo = GachaSystem.getPityInfo();
    this.updatePityUI(pityInfo);
  }

  shutdown() {
    if (this.bottomNav) { this.bottomNav.destroy(); this.bottomNav = null; }
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
    if (this.particles) {
      this.particles.destroy();
      this.particles = null;
    }
  }

  showMessage(text, color = COLORS.text) {
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, text, {
      fontSize: '20px',
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
