import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, s, sf } from '../../config/gameConfig.js';
import { Z_INDEX } from '../../config/layoutConfig.js';
import { GachaSystem } from '../../systems/GachaSystem.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { HeroAssetLoader } from '../../systems/HeroAssetLoader.js';
import { getCharacterOrHero } from '../../data/index.js';
import { getRarityKey, getRarityNum } from '../../utils/rarityUtils.js';
import { RateDisclosurePanel, renderRateTable } from './RateDisclosurePanel.js';
import { collectLiveRateRows } from '../../utils/gachaRateDisclosure.js';
import { TutorialTargetRegistry } from '../../systems/TutorialTargetRegistry.js';

/**
 * GachaPopup - 소환 팝업
 * 영웅/장비 소환, 천장 시스템, 결과 표시
 *
 * 온보딩 모드(T-05 첫 무료 10연, UXI-04): `new GachaPopup(scene, { onboarding: true }).show()`
 * 또는 `new GachaPopup(scene).open({ onboarding: true })` 로 호출한다.
 * 탭/단발 소환/장비 소환을 숨기고 첫 무료 10연 버튼만 노출하며, 확률 고지 패널을
 * 상시 임베드하고 닫기(✕/오버레이 클릭)를 잠근다.
 */
export class GachaPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '소환',
      width: s(680),
      height: s(1100),
      ...options
    });

    this.currentTab = 'hero'; // 'hero' or 'equipment'
    this.isAnimating = false;
    this.onboarding = !!options.onboarding;

    // Resource display references
    this.gemText = null;
    this.ticketText = null;
    this.pityBar = null;
    this.pityText = null;
    this.bannerPityText = null;
    this._ratePanel = null;
  }

  /**
   * 튜토리얼(T-05) 등 외부에서 옵션과 함께 팝업을 여는 편의 메서드.
   * @param {{ onboarding?: boolean }} options
   * @returns {GachaPopup} this (체이닝용)
   */
  open(options = {}) {
    if (options.onboarding !== undefined) this.onboarding = !!options.onboarding;
    this.show();
    return this;
  }

  buildContent() {
    // Top: Resource display
    this.createResourceDisplay();

    if (this.onboarding) {
      this._lockClose();
      this.buildOnboardingContent();
      return;
    }

    // Tab buttons
    this.createTabButtons();

    // Banner area
    this.createBannerArea();

    // Pity counter
    this.createPityDisplay();

    // Summon buttons
    this.createSummonButtons();

    // Rate disclosure entry point (nested popup)
    this.createRateInfoButton();
  }

  /** T-05 강제 스텝: ✕ 및 오버레이 클릭 닫기를 잠근다 (UX_ONBOARDING_FLOW §2-4 popupOptions.lockCloseButton) */
  _lockClose() {
    if (this.closeBtn) {
      this.closeBtn.disableInteractive();
      this.closeBtn.setAlpha(0.25);
    }
    if (this.overlay) {
      this.overlay.disableInteractive();
    }
  }

  /**
   * 강제 스텝이 끝나면 닫기를 다시 허용한다.
   * 잠금을 풀지 않으면 T-05 커밋 후에도 팝업을 닫을 수 없어 유저가 갇힌다(SPIKE §7-3 동일 취지).
   */
  unlockClose() {
    this.onboarding = false;
    if (this.closeBtn) {
      this.closeBtn.setInteractive({ useHandCursor: true });
      this.closeBtn.setAlpha(1);
    }
    if (this.overlay) {
      this.overlay.setInteractive();
    }
    return this;
  }

  /** 온보딩 모드 화면: 탭/단발/장비 숨김, 확률 고지 상시 노출, 첫 무료 10연 버튼만 */
  buildOnboardingContent() {
    const b = this.contentBounds;

    this.addText(b.centerX, b.top + s(30), '동료를 불러오세요', {
      fontSize: sf(20), fontStyle: 'bold', color: '#F8FAFC'
    }).setOrigin(0.5);

    this.addText(b.centerX, b.top + s(58), '처음 한 번은 완전히 무료입니다', {
      fontSize: sf(13), color: '#94A3B8'
    }).setOrigin(0.5);

    const rows = collectLiveRateRows();
    const { endY } = renderRateTable(this.scene, this.contentContainer, {
      left: b.left,
      top: b.top + s(95),
      width: b.width,
      rows,
      lineHeight: s(26)
    });

    const buttonY = Math.min(endY + s(55), b.bottom - s(70));
    this.createFreeTenPullButton(b.centerX, buttonY);
  }

  /** 첫 무료 10연 버튼 — "무료" 배지, 비용 0 표기. GachaSystem.pull()의 isFreeTenPull 판정을 그대로 재사용 */
  createFreeTenPullButton(x, y) {
    const gachaInfo = SaveManager.getGachaInfo();
    const alreadyUsed = !!gachaInfo.freeTenPullUsed;

    const { bg } = this.addButton(
      x, y, s(340), s(72),
      alreadyUsed ? '무료 10연 소환 완료' : '🎁 첫 무료 10연 소환',
      COLORS.secondary,
      () => this.performFreeTenPull()
    );

    // 튜토리얼 타깃 (T-05 강제 마스킹 홀)
    TutorialTargetRegistry.register('gacha.button.multi_ticket', bg, this.scene?.scene?.key);

    if (alreadyUsed) {
      bg.disableInteractive();
      bg.setAlpha(0.5);
    }

    this.addText(x + s(140), y - s(34), '무료', {
      fontSize: sf(13), fontStyle: 'bold', color: '#0F172A',
      backgroundColor: '#FACC15', padding: { x: s(8), y: s(3) }
    }).setOrigin(0.5);

    this.addText(x, y + s(48), '에너지 0 · 젬 0 · 티켓 0 소모', {
      fontSize: sf(12), color: '#64748B'
    }).setOrigin(0.5);
  }

  /** 확률 정보 진입점 — 일반 모드에서 RateDisclosurePanel을 중첩 팝업으로 연다 */
  createRateInfoButton() {
    const b = this.contentBounds;
    const y = b.top + s(750);
    const { bg } = this.addButton(b.centerX, y, s(220), s(44), '📋 확률 정보', COLORS.backgroundLight, () => {
      this.openRateDisclosure();
    });
    bg.setStrokeStyle(s(1), COLORS.primary, 0.6);
  }

  openRateDisclosure() {
    if (this._ratePanel) return;
    this._ratePanel = new RateDisclosurePanel(this.scene, {
      onClose: () => { this._ratePanel = null; }
    });
    this._ratePanel.show();
    if (this._ratePanel.container) {
      this._ratePanel.container.setDepth(Z_INDEX.POPUP_NESTED);
    }
  }

  createResourceDisplay() {
    const b = this.contentBounds;
    const resources = SaveManager.getResources();

    // Gems
    const gemIcon = this.scene.add.text(b.centerX - s(120), b.top + s(10), '💎', {
      fontSize: sf(20)
    }).setOrigin(0.5);
    this.gemText = this.addText(b.centerX - s(85), b.top + s(10), resources.gems.toLocaleString(), {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: '#FFD700'
    }).setOrigin(0, 0.5);

    // Tickets
    const ticketIcon = this.scene.add.text(b.centerX + s(20), b.top + s(10), '🎫', {
      fontSize: sf(20)
    }).setOrigin(0.5);
    this.ticketText = this.addText(b.centerX + s(55), b.top + s(10), `${resources.summonTickets}개`, {
      fontSize: sf(18),
      fontStyle: 'bold',
      color: '#87CEEB'
    }).setOrigin(0, 0.5);

    this.contentContainer.add([gemIcon, ticketIcon]);
  }

  createTabButtons() {
    const b = this.contentBounds;
    const tabY = b.top + s(50);
    const tabWidth = s(180);

    // Hero tab
    this.heroTab = this.scene.add.container(b.centerX - tabWidth / 2 - s(10), tabY);
    const heroTabBg = this.scene.add.rectangle(0, 0, tabWidth, s(40), COLORS.primary, 1);
    heroTabBg.setStrokeStyle(s(2), COLORS.text, 0.3);
    const heroTabText = this.scene.add.text(0, 0, '⭐ 영웅 소환', {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.heroTab.add([heroTabBg, heroTabText]);
    heroTabBg.setInteractive({ useHandCursor: true });

    // Equipment tab
    this.equipTab = this.scene.add.container(b.centerX + tabWidth / 2 + s(10), tabY);
    const equipTabBg = this.scene.add.rectangle(0, 0, tabWidth, s(40), COLORS.backgroundLight, 0.6);
    equipTabBg.setStrokeStyle(s(2), COLORS.textDark, 0.3);
    const equipTabText = this.scene.add.text(0, 0, '⚔️ 장비 소환', {
      fontSize: sf(16),
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
      this.heroTabBg.setStrokeStyle(s(2), COLORS.text, 0.3);
      this.heroTabText.setColor(`#${COLORS.text.toString(16).padStart(6, '0')}`);
      this.heroTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate equipment tab
      this.equipTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.equipTabBg.setStrokeStyle(s(2), COLORS.textDark, 0.3);
      this.equipTabText.setColor(`#${COLORS.textDark.toString(16).padStart(6, '0')}`);
      this.equipTabText.setStyle({ fontStyle: 'normal' });

      // Show/hide pity info
      if (this.pityBar) this.pityBar.setVisible(true);
      if (this.pityText) this.pityText.setVisible(true);
    } else {
      // Activate equipment tab
      this.equipTabBg.setFillStyle(COLORS.primary, 1);
      this.equipTabBg.setStrokeStyle(s(2), COLORS.text, 0.3);
      this.equipTabText.setColor(`#${COLORS.text.toString(16).padStart(6, '0')}`);
      this.equipTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate hero tab
      this.heroTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.heroTabBg.setStrokeStyle(s(2), COLORS.textDark, 0.3);
      this.heroTabText.setColor(`#${COLORS.textDark.toString(16).padStart(6, '0')}`);
      this.heroTabText.setStyle({ fontStyle: 'normal' });

      // Hide pity info (equipment doesn't use pity)
      if (this.pityBar) this.pityBar.setVisible(false);
      if (this.pityText) this.pityText.setVisible(false);
    }
  }

  createBannerArea() {
    const b = this.contentBounds;
    const bannerY = b.top + s(150);

    // Banner background
    const bannerBg = this.scene.add.rectangle(b.centerX, bannerY, b.width - s(40), s(200), COLORS.backgroundLight, 0.6);
    bannerBg.setStrokeStyle(s(3), COLORS.secondary, 0.8);
    this.contentContainer.add(bannerBg);

    // Banner title
    const bannerTitle = this.scene.add.text(b.centerX, bannerY - s(70), '✨ 발할라의 전사들 픽업! ✨', {
      fontSize: sf(18),
      fontFamily: 'Georgia, serif',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.contentContainer.add(bannerTitle);

    // Featured hero placeholder
    const featuredIcon = this.scene.add.text(b.centerX, bannerY - s(10), '👤', {
      fontSize: sf(60)
    }).setOrigin(0.5);
    this.contentContainer.add(featuredIcon);

    const featuredLabel = this.scene.add.text(b.centerX, bannerY + s(45), 'SSR 픽업!', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${COLORS.raritySSR.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.contentContainer.add(featuredLabel);

    // Rates info
    const ratesY = bannerY + s(80);
    const pityInfo = GachaSystem.getPityInfo();
    this.bannerPityText = this.scene.add.text(b.centerX, ratesY, `천장 카운터: ${pityInfo.current}/${pityInfo.threshold}`, {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.contentContainer.add(this.bannerPityText);

    const ratesText = this.scene.add.text(b.centerX, ratesY + s(20), `SSR ${pityInfo.currentSSRRate}  SR 15%  R 50%  N 32%`, {
      fontSize: sf(12),
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(ratesText);
  }

  createPityDisplay() {
    const b = this.contentBounds;
    const pityY = b.top + s(380);

    const pityInfo = GachaSystem.getPityInfo();
    const pity = pityInfo.current;
    const pityMax = pityInfo.threshold;

    const pityLabel = this.scene.add.text(b.centerX, pityY, '천장 카운터', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(pityLabel);

    // Progress bar background
    const barBg = this.scene.add.rectangle(b.centerX, pityY + s(30), s(300), s(20), COLORS.backgroundLight, 1);
    this.contentContainer.add(barBg);

    // Progress bar fill
    this.pityBar = this.scene.add.rectangle(
      b.centerX - s(150) + (s(300) * pity / pityMax) / 2,
      pityY + s(30),
      s(300) * pity / pityMax,
      s(16),
      COLORS.secondary,
      1
    ).setOrigin(0, 0.5);
    this.contentContainer.add(this.pityBar);

    // Pity text
    this.pityText = this.scene.add.text(b.centerX, pityY + s(30), `${pity}/${pityMax}`, {
      fontSize: sf(12),
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(this.pityText);

    // Info text
    const infoText = this.scene.add.text(b.centerX, pityY + s(60), '90회 소환 시 SSR 확정!', {
      fontSize: sf(12),
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(infoText);
  }

  createSummonButtons() {
    const b = this.contentBounds;
    const buttonY = b.top + s(500);

    // Gem summon buttons
    this.addButton(b.centerX - s(110), buttonY, s(180), s(80), '단일 소환\n💎 300', COLORS.primary, () => {
      this.performSummon(1, false);
    });

    this.addButton(b.centerX + s(110), buttonY, s(180), s(80), '10연차\n💎 2700', COLORS.secondary, () => {
      this.performSummon(10, false);
    });

    // Ticket summon buttons
    const ticketY = buttonY + s(100);
    const resources = SaveManager.getResources();

    this.ticketLabelText = this.scene.add.text(b.centerX, ticketY, `🎫 소환권: ${resources.summonTickets}개`, {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    this.contentContainer.add(this.ticketLabelText);

    this.addButton(b.centerX - s(110), ticketY + s(40), s(180), s(50), '🎫 ×1 소환', 0x2a5298, () => {
      this.performSummon(1, true);
    });

    this.addButton(b.centerX + s(110), ticketY + s(40), s(180), s(50), '🎫 ×10 소환', 0x2a5298, () => {
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
    const result = GachaSystem.pull(count, paymentType);
    this._handlePullResult(result);
  }

  /**
   * T-05 첫 무료 10연 — GachaSystem.pull()의 isFreeTenPull(count===10 && !freeTenPullUsed)
   * 내부 판정이 재화/에너지 체크를 자동으로 면제하므로, 여기서는 canPull() 사전 검사를
   * 하지 않는다(초기 재화가 0이어도 무료 10연은 항상 성립해야 함).
   */
  performFreeTenPull() {
    if (this.isAnimating) return;

    const gachaInfo = SaveManager.getGachaInfo();
    if (gachaInfo.freeTenPullUsed) {
      this.showToast('이미 사용한 무료 소환입니다', COLORS.danger);
      return;
    }

    this.isAnimating = true;
    const result = GachaSystem.pull(10, 'gems', { skipEnergyCheck: true });
    this._handlePullResult(result);
  }

  /** performSummon / performFreeTenPull 공용 결과 처리 (중복 제거) */
  _handlePullResult(result) {
    if (!result.success) {
      this.showToast(result.error, COLORS.danger);
      this.isAnimating = false;
      return;
    }

    // Update resource display (온보딩 모드에는 pity/ticket 라벨이 없을 수 있어 존재 확인)
    const resources = SaveManager.getResources();
    if (this.gemText) this.gemText.setText(resources.gems.toLocaleString());
    if (this.ticketText) this.ticketText.setText(`${resources.summonTickets}개`);
    if (this.ticketLabelText) {
      this.ticketLabelText.setText(`🎫 소환권: ${resources.summonTickets}개`);
    }

    // Update pity display
    this.updatePityUI(result.pityInfo);

    // Convert results to display format
    const results = result.results.map(r => {
      const charData = getCharacterOrHero(r.characterId);
      return {
        id: r.characterId,
        name: charData?.name || r.characterId,
        rarity: r.rarity,
        level: 1,
        stars: getRarityNum(r.rarity) || RARITY[getRarityKey(r.rarity)]?.stars || 1,
        stats: charData?.stats || { hp: 100, atk: 20, def: 10, spd: 10 },
        isNew: r.isNew,
        shardsGained: r.shardsGained,
        mood: charData?.mood || charData?.baseMood || 'brave',
        cult: charData?.cult || charData?.cultId || null,
        class: charData?.class || charData?.baseClass || 'warrior'
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
        width: s(300) * progress,
        x: this.contentBounds.centerX - s(150) + (s(300) * progress) / 2,
        duration: 300
      });
    }
  }

  showSummonAnimation(results) {
    // Create overlay
    // 주의: 이 오버레이와 결과 컨테이너는 팝업 컨테이너의 자식이 아니다.
    //       팝업만 닫으면 살아남아 전체 화면 입력을 삼키므로 인스턴스에 보관하고 destroy()에서 함께 정리한다.
    const overlay = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0);
    overlay.setDepth(3000);
    overlay.setInteractive();
    this._summonOverlay = overlay;

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
    circleGraphics.lineStyle(s(4), effectColor, 1);

    for (let i = 0; i < 3; i++) {
      circleGraphics.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, s(100) + i * s(30));
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
        hasSSR ? s(6) : s(4),
        effectColor
      ).setDepth(3002).setAlpha(0);

      particles.push(particle);

      this.scene.tweens.add({
        targets: particle,
        x: GAME_WIDTH / 2 + Math.cos(angle) * (hasSSR ? s(200) : s(150)),
        y: GAME_HEIGHT / 2 + Math.sin(angle) * (hasSSR ? s(200) : s(150)),
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
    // (결과 컨테이너는 아래에서 생성되는 즉시 인스턴스에 보관한다)
    const resultContainer = this.scene.add.container(0, 0).setDepth(3010);
    this._summonResult = resultContainer;

    // Results background
    const resultBg = this.scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - s(60), GAME_HEIGHT - s(300), COLORS.backgroundLight, 0.95);
    resultBg.setStrokeStyle(s(2), COLORS.primary);
    resultContainer.add(resultBg);

    // Title
    const title = this.scene.add.text(GAME_WIDTH / 2, s(200), '소환 결과', {
      fontSize: sf(24),
      fontFamily: 'Georgia, serif',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    resultContainer.add(title);

    // Display heroes in grid
    const cols = Math.min(5, results.length);
    const startX = GAME_WIDTH / 2 - ((cols - 1) * s(85)) / 2;
    const startY = s(300);

    results.forEach((hero, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * s(85);
      const y = startY + row * s(130);

      this.scene.time.delayedCall(index * 100, () => {
        this.createHeroCard(resultContainer, x, y, hero);
      });
    });

    // Close button
    const closeBtn = this.scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT - s(150));
    const closeBg = this.scene.add.rectangle(0, 0, s(150), s(50), COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.scene.add.text(0, 0, '확인', {
      fontSize: sf(18),
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    closeBtn.add([closeBg, closeText]);
    resultContainer.add(closeBtn);

    closeBg.on('pointerdown', () => {
      resultContainer.destroy();
      overlay.destroy();
      this._summonResult = null;
      this._summonOverlay = null;
      this.isAnimating = false;
    });
  }

  /** 결과 연출 잔여물 정리 — 남으면 depth 3000 오버레이가 모든 입력을 삼킨다 */
  _clearSummonOverlay() {
    if (this._summonResult) {
      this._summonResult.destroy();
      this._summonResult = null;
    }
    if (this._summonOverlay) {
      this._summonOverlay.destroy();
      this._summonOverlay = null;
    }
    this.isAnimating = false;
  }

  destroy() {
    this._clearSummonOverlay();
    super.destroy();
  }

  createHeroCard(container, x, y, hero) {
    const card = this.scene.add.container(x, y);

    // Card background with rarity color
    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const cardBg = this.scene.add.rectangle(0, 0, s(75), s(110), COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(s(2), rarityColor);

    // Hero image — IMG-3: 실제 포트레이트 우선, 없으면 온디맨드 플레이스홀더 (GachaScene.js와 동일 패턴)
    const fullData = getCharacterOrHero(hero.id) || hero;
    const texKey = HeroAssetLoader.ensureTexture(this.scene, fullData);
    const heroImg = this.scene.add.image(0, s(-15), texKey || 'hero_placeholder');
    if (texKey) {
      // 카드(s75×s110) 안에 맞추기 (포트레이트 종횡비 보존)
      const fitScale = Math.min(s(58) / heroImg.width, s(66) / heroImg.height);
      heroImg.setScale(fitScale);
    } else {
      heroImg.setScale(0.7);
    }

    // Rarity indicator
    const rarityBg = this.scene.add.rectangle(0, s(-50), s(30), s(18), rarityColor, 1);
    const rarityText = this.scene.add.text(0, s(-50), rKey, {
      fontSize: sf(10),
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stars
    const starCount = hero.stars || getRarityNum(hero.rarity) || rarityData.stars || 1;
    const stars = this.scene.add.text(0, s(25), '★'.repeat(starCount), {
      fontSize: sf(10),
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Name (truncated)
    const heroName = hero.name || '???';
    const name = heroName.length > 6 ? `${heroName.substring(0, 6)}..` : heroName;
    const nameText = this.scene.add.text(0, s(42), name, {
      fontSize: sf(10),
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
      const glow = this.scene.add.circle(x, y, s(50), COLORS.raritySSR, 0.3);
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
      fontSize: sf(18),
      fontFamily: 'Arial',
      color: `#${color.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(4000);

    this.scene.tweens.add({
      targets: toast,
      alpha: 0,
      y: toast.y - s(50),
      duration: 1500,
      delay: 500,
      onComplete: () => toast.destroy()
    });
  }
}
