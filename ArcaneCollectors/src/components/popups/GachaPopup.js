import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY } from '../../config/gameConfig.js';
import { GachaSystem } from '../../systems/GachaSystem.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { getCharacter } from '../../data/index.js';
import { getRarityKey, getRarityNum } from '../../utils/rarityUtils.js';

/**
 * GachaPopup - 소환 팝업
 * 영웅/장비 소환, 천장 시스템, 결과 표시
 */
export class GachaPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '소환',
      width: 680,
      height: 1100,
      ...options
    });

    this.currentTab = 'hero'; // 'hero' or 'equipment'
    this.isAnimating = false;

    // Resource display references
    this.gemText = null;
    this.ticketText = null;
    this.pityBar = null;
    this.pityText = null;
    this.bannerPityText = null;
  }

  buildContent() {
    const b = this.contentBounds;

    // Top: Resource display
    this.createResourceDisplay();

    // Tab buttons
    this.createTabButtons();

    // Banner area
    this.createBannerArea();

    // Pity counter
    this.createPityDisplay();

    // Summon buttons
    this.createSummonButtons();
  }

  createResourceDisplay() {
    const b = this.contentBounds;
    const resources = SaveManager.getResources();

    // Gems
    const gemIcon = this.scene.add.text(b.centerX - 120, b.top + 10, '💎', {
      fontSize: '20px'
    }).setOrigin(0.5);
    this.gemText = this.addText(b.centerX - 85, b.top + 10, resources.gems.toLocaleString(), {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#FFD700'
    }).setOrigin(0, 0.5);

    // Tickets
    const ticketIcon = this.scene.add.text(b.centerX + 20, b.top + 10, '🎫', {
      fontSize: '20px'
    }).setOrigin(0.5);
    this.ticketText = this.addText(b.centerX + 55, b.top + 10, `${resources.summonTickets}개`, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#87CEEB'
    }).setOrigin(0, 0.5);

    this.contentContainer.add([gemIcon, ticketIcon]);
  }

  createTabButtons() {
    const b = this.contentBounds;
    const tabY = b.top + 50;
    const tabWidth = 180;

    // Hero tab
    this.heroTab = this.scene.add.container(b.centerX - tabWidth / 2 - 10, tabY);
    const heroTabBg = this.scene.add.rectangle(0, 0, tabWidth, 40, COLORS.primary, 1);
    heroTabBg.setStrokeStyle(2, COLORS.text, 0.3);
    const heroTabText = this.scene.add.text(0, 0, '⭐ 영웅 소환', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.heroTab.add([heroTabBg, heroTabText]);
    heroTabBg.setInteractive({ useHandCursor: true });

    // Equipment tab
    this.equipTab = this.scene.add.container(b.centerX + tabWidth / 2 + 10, tabY);
    const equipTabBg = this.scene.add.rectangle(0, 0, tabWidth, 40, COLORS.backgroundLight, 0.6);
    equipTabBg.setStrokeStyle(2, COLORS.textDark, 0.3);
    const equipTabText = this.scene.add.text(0, 0, '⚔️ 장비 소환', {
      fontSize: '16px',
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.equipTab.add([equipTabBg, equipTabText]);
    equipTabBg.setInteractive({ useHandCursor: true });

    // Store references
    this.heroTabBg = heroTabBg;
    this.heroTabText = heroTabText;
    this.equipTabBg = equipTabBg;
    this.equipTabText = equipTabText;

    // Tab interactions
    heroTabBg.on('pointerdown', () => {
      if (this.currentTab === 'hero' || this.isAnimating) return;
      this.switchTab('hero');
    });

    equipTabBg.on('pointerdown', () => {
      if (this.currentTab === 'equipment' || this.isAnimating) return;
      this.switchTab('equipment');
    });

    this.contentContainer.add([this.heroTab, this.equipTab]);
  }

  switchTab(tab) {
    this.currentTab = tab;

    if (tab === 'hero') {
      // Activate hero tab
      this.heroTabBg.setFillStyle(COLORS.primary, 1);
      this.heroTabBg.setStrokeStyle(2, COLORS.text, 0.3);
      this.heroTabText.setColor(`#${COLORS.text.toString(16).padStart(6, '0')}`);
      this.heroTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate equipment tab
      this.equipTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.equipTabBg.setStrokeStyle(2, COLORS.textDark, 0.3);
      this.equipTabText.setColor(`#${COLORS.textDark.toString(16).padStart(6, '0')}`);
      this.equipTabText.setStyle({ fontStyle: 'normal' });

      // Show/hide pity info
      if (this.pityBar) this.pityBar.setVisible(true);
      if (this.pityText) this.pityText.setVisible(true);
    } else {
      // Activate equipment tab
      this.equipTabBg.setFillStyle(COLORS.primary, 1);
      this.equipTabBg.setStrokeStyle(2, COLORS.text, 0.3);
      this.equipTabText.setColor(`#${COLORS.text.toString(16).padStart(6, '0')}`);
      this.equipTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate hero tab
      this.heroTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.heroTabBg.setStrokeStyle(2, COLORS.textDark, 0.3);
      this.heroTabText.setColor(`#${COLORS.textDark.toString(16).padStart(6, '0')}`);
      this.heroTabText.setStyle({ fontStyle: 'normal' });

      // Hide pity info (equipment doesn't use pity)
      if (this.pityBar) this.pityBar.setVisible(false);
      if (this.pityText) this.pityText.setVisible(false);
    }
  }

  createBannerArea() {
    const b = this.contentBounds;
    const bannerY = b.top + 150;

    // Banner background
    const bannerBg = this.scene.add.rectangle(b.centerX, bannerY, b.width - 40, 200, COLORS.backgroundLight, 0.6);
    bannerBg.setStrokeStyle(3, COLORS.secondary, 0.8);
    this.contentContainer.add(bannerBg);

    // Banner title
    const bannerTitle = this.scene.add.text(b.centerX, bannerY - 70, '✨ 발할라의 전사들 픽업! ✨', {
      fontSize: '18px',
      fontFamily: 'Georgia, serif',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.contentContainer.add(bannerTitle);

    // Featured hero placeholder
    const featuredIcon = this.scene.add.text(b.centerX, bannerY - 10, '👤', {
      fontSize: '60px'
    }).setOrigin(0.5);
    this.contentContainer.add(featuredIcon);

    const featuredLabel = this.scene.add.text(b.centerX, bannerY + 45, 'SSR 픽업!', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.raritySSR.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.contentContainer.add(featuredLabel);

    // Rates info
    const ratesY = bannerY + 80;
    const pityInfo = GachaSystem.getPityInfo();
    this.bannerPityText = this.scene.add.text(b.centerX, ratesY, `천장 카운터: ${pityInfo.current}/${pityInfo.threshold}`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.contentContainer.add(this.bannerPityText);

    const ratesText = this.scene.add.text(b.centerX, ratesY + 20, `SSR ${pityInfo.currentSSRRate}  SR 15%  R 50%  N 32%`, {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(ratesText);
  }

  createPityDisplay() {
    const b = this.contentBounds;
    const pityY = b.top + 380;

    const pityInfo = GachaSystem.getPityInfo();
    const pity = pityInfo.current;
    const pityMax = pityInfo.threshold;

    const pityLabel = this.scene.add.text(b.centerX, pityY, '천장 카운터', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(pityLabel);

    // Progress bar background
    const barBg = this.scene.add.rectangle(b.centerX, pityY + 30, 300, 20, COLORS.backgroundLight, 1);
    this.contentContainer.add(barBg);

    // Progress bar fill
    this.pityBar = this.scene.add.rectangle(
      b.centerX - 150 + (300 * pity / pityMax) / 2,
      pityY + 30,
      300 * pity / pityMax,
      16,
      COLORS.secondary,
      1
    ).setOrigin(0, 0.5);
    this.contentContainer.add(this.pityBar);

    // Pity text
    this.pityText = this.scene.add.text(b.centerX, pityY + 30, `${pity}/${pityMax}`, {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(this.pityText);

    // Info text
    const infoText = this.scene.add.text(b.centerX, pityY + 60, '90회 소환 시 SSR 확정!', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(infoText);
  }

  createSummonButtons() {
    const b = this.contentBounds;
    const buttonY = b.top + 500;

    // Gem summon buttons
    this.addButton(b.centerX - 110, buttonY, 180, 80, '단일 소환\n💎 300', COLORS.primary, () => {
      this.performSummon(1, false);
    });

    this.addButton(b.centerX + 110, buttonY, 180, 80, '10연차\n💎 2700', COLORS.secondary, () => {
      this.performSummon(10, false);
    });

    // Ticket summon buttons
    const ticketY = buttonY + 100;
    const resources = SaveManager.getResources();

    const ticketLabel = this.scene.add.text(b.centerX, ticketY, `🎫 소환권: ${resources.summonTickets}개`, {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(ticketLabel);

    this.addButton(b.centerX - 110, ticketY + 40, 180, 50, '🎫 ×1 소환', 0x2a5298, () => {
      this.performSummon(1, true);
    });

    this.addButton(b.centerX + 110, ticketY + 40, 180, 50, '🎫 ×10 소환', 0x2a5298, () => {
      this.performSummon(10, true);
    });
  }

  performSummon(count, useTickets) {
    if (this.isAnimating) return;

    const paymentType = useTickets ? 'tickets' : 'gems';

    // Check resources
    if (!GachaSystem.canPull(count, paymentType)) {
      const message = useTickets ? '소환권이 부족합니다!' : '보석이 부족합니다!';
      this.showToast(message, COLORS.danger);
      return;
    }

    this.isAnimating = true;

    // Perform pull
    const result = GachaSystem.pull(count, paymentType);

    if (!result.success) {
      this.showToast(result.error, COLORS.danger);
      this.isAnimating = false;
      return;
    }

    // Update resource display
    const resources = SaveManager.getResources();
    this.gemText.setText(resources.gems.toLocaleString());
    this.ticketText.setText(`${resources.summonTickets}개`);

    // Update pity display
    this.updatePityUI(result.pityInfo);

    // Convert results to display format
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

    // Show animation and results
    this.showSummonAnimation(results);
  }

  updatePityUI(pityInfo) {
    if (this.bannerPityText) {
      this.bannerPityText.setText(`천장 카운터: ${pityInfo.current}/${pityInfo.threshold}`);
    }
    if (this.pityText) {
      this.pityText.setText(`${pityInfo.current}/${pityInfo.threshold}`);
    }
    if (this.pityBar) {
      const progress = pityInfo.current / pityInfo.threshold;
      this.scene.tweens.add({
        targets: this.pityBar,
        width: 300 * progress,
        x: this.contentBounds.centerX - 150 + (300 * progress) / 2,
        duration: 300
      });
    }
  }

  showSummonAnimation(results) {
    // Create overlay
    const overlay = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0);
    overlay.setDepth(3000);
    overlay.setInteractive();

    this.scene.tweens.add({
      targets: overlay,
      alpha: 0.9,
      duration: 400,
      ease: 'Power2'
    });

    // Check for SSR/SR
    const hasSSR = results.some(hero => hero.rarity === 'SSR');
    const hasSR = results.some(hero => hero.rarity === 'SR');

    // Magic circle effect
    const circleGraphics = this.scene.add.graphics().setDepth(3001);
    const effectColor = hasSSR ? COLORS.raritySSR : (hasSR ? COLORS.raritySR : COLORS.primary);
    circleGraphics.lineStyle(4, effectColor, 1);

    for (let i = 0; i < 3; i++) {
      circleGraphics.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 100 + i * 30);
    }

    circleGraphics.setAlpha(0).setScale(0);

    this.scene.tweens.add({
      targets: circleGraphics,
      scale: 1.5,
      alpha: 1,
      rotation: Math.PI * 2,
      duration: 1500,
      ease: 'Cubic.easeOut'
    });

    // Particles
    const particles = [];
    const particleCount = hasSSR ? 40 : (hasSR ? 30 : 20);

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const particle = this.scene.add.circle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        hasSSR ? 6 : 4,
        effectColor
      ).setDepth(3002).setAlpha(0);

      particles.push(particle);

      this.scene.tweens.add({
        targets: particle,
        x: GAME_WIDTH / 2 + Math.cos(angle) * (hasSSR ? 200 : 150),
        y: GAME_HEIGHT / 2 + Math.sin(angle) * (hasSSR ? 200 : 150),
        alpha: { from: 1, to: 0 },
        duration: hasSSR ? 1500 : 1000,
        delay: 400 + i * (hasSSR ? 30 : 50),
        ease: 'Cubic.easeOut'
      });
    }

    // SSR flash effect
    if (hasSSR) {
      const flash = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0);
      flash.setDepth(3005);

      this.scene.tweens.add({
        targets: flash,
        alpha: { from: 0, to: 0.7 },
        duration: 600,
        delay: 800,
        yoyo: true,
        onComplete: () => flash.destroy()
      });

      this.scene.cameras.main.shake(300, 0.01);
    }

    // Show results after animation
    const animDuration = hasSSR ? 2500 : 2000;
    this.scene.time.delayedCall(animDuration, () => {
      circleGraphics.destroy();
      particles.forEach(p => p.destroy());
      this.showResults(results, overlay);
    });
  }

  showResults(results, overlay) {
    const resultContainer = this.scene.add.container(0, 0).setDepth(3010);

    // Results background
    const resultBg = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 60, GAME_HEIGHT - 300, COLORS.backgroundLight, 0.95);
    resultBg.setStrokeStyle(2, COLORS.primary);
    resultContainer.add(resultBg);

    // Title
    const title = this.scene.add.text(GAME_WIDTH / 2, 200, '소환 결과', {
      fontSize: '24px',
      fontFamily: 'Georgia, serif',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    resultContainer.add(title);

    // Display heroes in grid
    const cols = Math.min(5, results.length);
    const startX = GAME_WIDTH / 2 - ((cols - 1) * 85) / 2;
    const startY = 300;

    results.forEach((hero, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * 85;
      const y = startY + row * 130;

      this.scene.time.delayedCall(index * 100, () => {
        this.createHeroCard(resultContainer, x, y, hero);
      });
    });

    // Close button
    const closeBtn = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 150);
    const closeBg = this.scene.add.rectangle(0, 0, 150, 50, COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.scene.add.text(0, 0, '확인', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    closeBtn.add([closeBg, closeText]);
    resultContainer.add(closeBtn);

    closeBg.on('pointerdown', () => {
      resultContainer.destroy();
      overlay.destroy();
      this.isAnimating = false;
    });
  }

  createHeroCard(container, x, y, hero) {
    const card = this.scene.add.container(x, y);

    // Card background with rarity color
    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const cardBg = this.scene.add.rectangle(0, 0, 75, 110, COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(2, rarityColor);

    // Hero image placeholder
    const heroImg = this.scene.add.text(0, -15, '👤', { fontSize: '40px' }).setOrigin(0.5);

    // Rarity indicator
    const rarityBg = this.scene.add.rectangle(0, -50, 30, 18, rarityColor, 1);
    const rarityText = this.scene.add.text(0, -50, rKey, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stars
    const starCount = hero.stars || getRarityNum(hero.rarity) || rarityData.stars || 1;
    const stars = this.scene.add.text(0, 25, '★'.repeat(starCount), {
      fontSize: '10px',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Name (truncated)
    const heroName = hero.name || '???';
    const name = heroName.length > 6 ? `${heroName.substring(0, 6)}..` : heroName;
    const nameText = this.scene.add.text(0, 42, name, {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    card.add([cardBg, heroImg, rarityBg, rarityText, stars, nameText]);
    container.add(card);

    // Entrance animation
    card.setScale(0);
    this.scene.tweens.add({
      targets: card,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut'
    });

    // SSR special effect
    if (hero.rarity === 'SSR') {
      const glow = this.scene.add.circle(x, y, 50, COLORS.raritySSR, 0.3);
      container.add(glow);
      container.sendToBack(glow);

      this.scene.tweens.add({
        targets: glow,
        scale: { from: 0.8, to: 1.2 },
        alpha: { from: 0.5, to: 0 },
        duration: 1000,
        repeat: -1
      });
    }
  }

  showToast(text, color = COLORS.text) {
    const toast = this.scene.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, text, {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: `#${color.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5).setDepth(4000);

    this.scene.tweens.add({
      targets: toast,
      alpha: 0,
      y: toast.y - 50,
      duration: 1500,
      delay: 500,
      onComplete: () => toast.destroy()
    });
  }
}
