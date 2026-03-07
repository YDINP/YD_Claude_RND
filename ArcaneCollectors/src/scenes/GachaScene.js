import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, CULT_COLORS, s, sf } from '../config/gameConfig.js';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';
import GameLogger from '../utils/GameLogger.js';
import { SaveManager } from '../systems/SaveManager.js';
import { GachaSystem } from '../systems/GachaSystem.js';
import { EquipmentSystem } from '../systems/EquipmentSystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import { getCharacter, normalizeHeroes } from '../data/index.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';
import energySystem from '../systems/EnergySystem.js';

export class GachaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GachaScene' });
    this.isAnimating = false;
    this.currentTab = 'hero'; // 'hero' or 'equipment'
  }

  create() {
    try {
    this.cameras.main.fadeIn(300);

    // 에너지 시스템 초기화 (MainMenuScene을 거치지 않고 진입한 경우 대비)
    const fullSaveData = SaveManager.load();
    energySystem.initialize(fullSaveData?.energy || null);

    // H-3: ParticleManager 초기화
    this.particles = new ParticleManager(this);

    this.createBackground();
    this.createHeader();
    this.createTabButtons();
    this.createBannerArea();
    this.createSummonButtons();
    this.createPityDisplay();
    } catch (error) {
      console.error('[GachaScene] create() 실패:', error);
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
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
        y: particle.y - Phaser.Math.Between(s(100), s(200)),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 6000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 2000)
      });
    }
  }

  createHeader() {
    // LAYOUT 통일: Header background (100px)
    this.add.rectangle(GAME_WIDTH / 2, s(50), GAME_WIDTH, s(100), COLORS.backgroundLight, 0.9);

    // Back button (좌상단 30, 50 위치, 50×40 터치 영역)
    const backBtn = this.add.container(s(30), s(50));
    const backBg = this.add.rectangle(0, 0, s(50), s(40), COLORS.backgroundLight, 0.8)
      .setInteractive({ useHandCursor: true });
    const backText = this.add.text(0, 0, '← 뒤로', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    backBtn.add([backBg, backText]);

    backBg.on('pointerdown', () => {
      if (this.isAnimating) return;
      navigationManager.goBack(this);
    });

    // Title — 리디자인: 그라디언트 느낌 타이틀 + 하단 구분선
    this.add.text(GAME_WIDTH / 2, s(45), '✨ 소환소', {
      fontSize: sf(30),
      fontFamily: 'Georgia, serif',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: s(3)
    }).setOrigin(0.5);
    // 헤더 하단 구분선 (accent color)
    this.add.rectangle(GAME_WIDTH / 2, s(97), GAME_WIDTH, s(3), COLORS.accent, 0.7);

    // Gems display
    let gemIcon;
    if (this.textures.exists('gem')) {
      gemIcon = this.add.image(GAME_WIDTH - s(80), s(50), 'gem').setScale(0.7);
    } else {
      gemIcon = this.add.text(GAME_WIDTH - s(80), s(50), '💎', { fontSize: sf(20) }).setOrigin(0.5);
    }
    const resources = SaveManager.getResources();
    const gems = resources.gems;
    this.registry.set('gems', gems); // sync registry
    this.gemText = this.add.text(GAME_WIDTH - s(55), s(50), gems.toLocaleString(), {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);
  }

  createTabButtons() {
    const tabY = s(120);
    const tabWidth = s(180);

    // Hero summon tab
    this.heroTab = this.add.container(GAME_WIDTH / 2 - tabWidth / 2 - s(10), tabY);
    const heroTabBg = this.add.rectangle(0, 0, tabWidth, s(50), COLORS.primary, 1);
    heroTabBg.setStrokeStyle(s(2), COLORS.text, 0.3);
    const heroTabText = this.add.text(0, 0, '⭐ 영웅 소환', {
      fontSize: sf(18),
      fontFamily: 'Noto Sans KR',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.heroTab.add([heroTabBg, heroTabText]);
    heroTabBg.setInteractive({ useHandCursor: true });

    // Equipment summon tab
    this.equipTab = this.add.container(GAME_WIDTH / 2 + tabWidth / 2 + s(10), tabY);
    const equipTabBg = this.add.rectangle(0, 0, tabWidth, s(50), COLORS.backgroundLight, 0.6);
    equipTabBg.setStrokeStyle(s(2), COLORS.textDark, 0.3);
    const equipTabText = this.add.text(0, 0, '⚔️ 장비 소환', {
      fontSize: sf(18),
      fontFamily: 'Noto Sans KR',
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
      this.heroTabBg.setStrokeStyle(s(2), COLORS.text, 0.3);
      this.heroTabText.setColor(`#${  COLORS.text.toString(16).padStart(6, '0')}`);
      this.heroTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate equipment tab
      this.equipTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.equipTabBg.setStrokeStyle(s(2), COLORS.textDark, 0.3);
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
      this.equipTabBg.setStrokeStyle(s(2), COLORS.text, 0.3);
      this.equipTabText.setColor(`#${  COLORS.text.toString(16).padStart(6, '0')}`);
      this.equipTabText.setStyle({ fontStyle: 'bold' });

      // Deactivate hero tab
      this.heroTabBg.setFillStyle(COLORS.backgroundLight, 0.6);
      this.heroTabBg.setStrokeStyle(s(2), COLORS.textDark, 0.3);
      this.heroTabText.setColor(`#${  COLORS.textDark.toString(16).padStart(6, '0')}`);
      this.heroTabText.setStyle({ fontStyle: 'normal' });

      this.showMessage('장비 소환 모드', COLORS.accent);
      // 장비 보장 정보 표시, 천장 카운터 숨김
      if (this.pityBar) this.pityBar.setVisible(false);
      if (this.pityText) this.pityText.setVisible(false);
      if (!this.equipGuaranteeText) {
        this.equipGuaranteeText = this.add.text(GAME_WIDTH / 2, s(710), '10연차 SR등급 이상 장비 1개 보장!', {
          fontSize: sf(13), fontFamily: 'Arial',
          color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
          fontStyle: 'bold'
        }).setOrigin(0.5);
      }
      this.equipGuaranteeText.setVisible(true);
    }
  }

  createBannerArea() {
    // ── 리디자인: 픽업배너 y값 s(20) 하향 ──
    const bannerY = s(280); // 기존 s(260) → s(280)

    // ── 배너 외곽 패널 (고급스러운 accent 테두리) ──
    const panelW = GAME_WIDTH - s(30);
    const panelH = s(230);
    const panel = this.add.graphics();
    // 다크 반투명 배경
    panel.fillStyle(0x0F172A, 0.92);
    panel.fillRoundedRect(GAME_WIDTH / 2 - panelW / 2, bannerY - panelH / 2, panelW, panelH, s(16));
    // accent 테두리
    panel.lineStyle(s(3), COLORS.accent, 0.9);
    panel.strokeRoundedRect(GAME_WIDTH / 2 - panelW / 2, bannerY - panelH / 2, panelW, panelH, s(16));
    // 내부 미묘한 inner glow
    panel.lineStyle(s(1), COLORS.accent, 0.3);
    panel.strokeRoundedRect(GAME_WIDTH / 2 - panelW / 2 + s(4), bannerY - panelH / 2 + s(4), panelW - s(8), panelH - s(8), s(12));

    // ── 배너 파티클 (내부) ──
    for (let i = 0; i < 12; i++) {
      const px = GAME_WIDTH / 2 - s(180) + Phaser.Math.Between(0, s(360));
      const py = bannerY - s(90) + Phaser.Math.Between(0, s(180));
      const particle = this.add.circle(px, py, Phaser.Math.FloatBetween(1, 2.5), COLORS.accent, 0.4);
      this.tweens.add({
        targets: particle,
        x: px + Phaser.Math.Between(s(-20), s(20)),
        y: py + Phaser.Math.Between(s(-20), s(20)),
        alpha: { from: 0.1, to: 0.6 },
        duration: Phaser.Math.Between(2000, 4000),
        yoyo: true,
        repeat: -1
      });
    }

    // ── 배너 타이틀 영역 (상단 강조 헤더) ──
    const titleBg = this.add.graphics();
    titleBg.fillStyle(COLORS.accent, 0.18);
    titleBg.fillRoundedRect(GAME_WIDTH / 2 - panelW / 2 + s(3), bannerY - panelH / 2 + s(3), panelW - s(6), s(44), { tl: s(13), tr: s(13), bl: 0, br: 0 });

    const bannerTitle = this.add.text(GAME_WIDTH / 2, bannerY - panelH / 2 + s(25), '✨ 발할라의 전사들 픽업! ✨', {
      fontSize: sf(20),
      fontFamily: 'Georgia, serif',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: s(3)
    }).setOrigin(0.5);

    this.tweens.add({
      targets: bannerTitle,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // ── 구분선 ──
    const divider = this.add.graphics();
    divider.lineStyle(s(1), COLORS.accent, 0.5);
    divider.lineBetween(GAME_WIDTH / 2 - panelW / 2 + s(20), bannerY - panelH / 2 + s(50), GAME_WIDTH / 2 + panelW / 2 - s(20), bannerY - panelH / 2 + s(50));

    // ── 픽업 캐릭터 영역 ──
    const charX = GAME_WIDTH / 2 - s(80);
    const charY = bannerY + s(20);

    // SSR 캐릭터 프레임 (화려한 accent 테두리)
    const charFrame = this.add.graphics();
    charFrame.lineStyle(s(3), COLORS.raritySSR, 1);
    charFrame.strokeRoundedRect(charX - s(50), charY - s(55), s(100), s(110), s(8));
    charFrame.lineStyle(s(1), COLORS.accent, 0.5);
    charFrame.strokeRoundedRect(charX - s(46), charY - s(51), s(92), s(102), s(6));
    // SSR 배경 그라디언트 느낌
    const charBg = this.add.graphics();
    charBg.fillStyle(COLORS.raritySSR, 0.08);
    charBg.fillRoundedRect(charX - s(50), charY - s(55), s(100), s(110), s(8));

    // Glow animation (charFrame)
    this.tweens.add({
      targets: charFrame,
      alpha: { from: 0.7, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1
    });

    // 픽업 배너: SSR 캐릭터 실제 이미지 표시 (폴백: hero_placeholder → 텍스트)
    const featuredTextureKey = (() => {
      const saveData = SaveManager.load();
      const ownedChars = saveData?.characters || [];
      const ssrChar = ownedChars.find(c => (c.rarity || '').toUpperCase() === 'SSR');
      if (ssrChar) {
        const key = `hero_${ssrChar.id || ssrChar.characterId}`;
        if (this.textures.exists(key)) return key;
      }
      return this.textures.exists('hero_placeholder') ? 'hero_placeholder' : null;
    })();

    let featuredChar;
    if (featuredTextureKey) {
      featuredChar = this.add.image(charX, charY - s(10), featuredTextureKey).setScale(1.1);
    } else {
      featuredChar = this.add.text(charX, charY - s(10), '👤', { fontSize: sf(52) }).setOrigin(0.5);
    }

    // SSR 뱃지
    const ssrBadge = this.add.graphics();
    ssrBadge.fillStyle(COLORS.raritySSR, 1);
    ssrBadge.fillRoundedRect(charX - s(22), charY + s(48), s(44), s(18), s(4));
    this.add.text(charX, charY + s(57), 'SSR 픽업!', {
      fontSize: sf(10), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    // 회전 glow 링
    const glowRing = this.add.graphics();
    glowRing.lineStyle(s(2), COLORS.raritySSR, 0.6);
    glowRing.strokeCircle(0, 0, s(58));
    glowRing.setPosition(charX, charY - s(5));
    this.tweens.add({
      targets: glowRing,
      rotation: Math.PI * 2,
      duration: 3500,
      repeat: -1,
      ease: 'Linear'
    });

    // ── 확률 정보 뱃지 영역 (우측) ──
    const rateX = GAME_WIDTH / 2 + s(60);
    const rateY = bannerY - s(10);

    // 확률 패널 배경
    const rateBg = this.add.graphics();
    rateBg.fillStyle(0x1E293B, 0.9);
    rateBg.fillRoundedRect(rateX - s(95), rateY - s(85), s(190), s(170), s(10));
    rateBg.lineStyle(s(1), COLORS.secondary, 0.4);
    rateBg.strokeRoundedRect(rateX - s(95), rateY - s(85), s(190), s(170), s(10));

    this.add.text(rateX, rateY - s(70), '소환 확률', {
      fontSize: sf(13), fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 확률 뱃지들
    const rates = [
      { label: 'SSR', rate: '3%', color: COLORS.raritySSR, bg: 0x1a120a },
      { label: 'SR', rate: '15%', color: COLORS.raritySR, bg: 0x120a1a },
      { label: 'R', rate: '82%', color: COLORS.rarityR || 0x3B82F6, bg: 0x0a0f1a },
    ];
    rates.forEach((r, i) => {
      const by = rateY - s(45) + i * s(40);
      // 뱃지 배경
      const bg = this.add.graphics();
      bg.fillStyle(r.bg, 1);
      bg.fillRoundedRect(rateX - s(88), by - s(14), s(176), s(28), s(5));
      bg.lineStyle(s(1), r.color, 0.6);
      bg.strokeRoundedRect(rateX - s(88), by - s(14), s(176), s(28), s(5));
      // 등급 라벨
      this.add.text(rateX - s(62), by, r.label, {
        fontSize: sf(13), fontFamily: 'Arial',
        color: `#${r.color.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
      // 구분자
      this.add.text(rateX, by, '|', {
        fontSize: sf(11), fontFamily: 'Arial',
        color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
      // 확률 값
      this.add.text(rateX + s(50), by, r.rate, {
        fontSize: sf(14), fontFamily: 'Arial',
        color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
    });

    // ── 천장 카운터 (배너 하단) ──
    const pityInfo = GachaSystem.getPityInfo();
    const counterY = bannerY + panelH / 2 - s(20);

    // 카운터 배경 라인
    const counterBg = this.add.graphics();
    counterBg.fillStyle(0x0F172A, 0.7);
    counterBg.fillRoundedRect(GAME_WIDTH / 2 - panelW / 2 + s(3), counterY - s(16), panelW - s(6), s(32), { tl: 0, tr: 0, bl: s(13), br: s(13) });

    this.bannerPityText = this.add.text(GAME_WIDTH / 2, counterY, `🔮 천장 카운터: ${pityInfo.current}/${pityInfo.threshold}  |  SSR ${pityInfo.currentSSRRate}`, {
      fontSize: sf(13),
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
  }

  createSummonButtons() {
    // UIX-3.4: 소환 버튼 위치 하단 BottomNav 위 (y=950 정도)
    const buttonY = s(950);

    // Single summon button — 리디자인: 보석 아이콘 + 비용 표기
    this.createSummonButton(GAME_WIDTH / 2 - s(110), buttonY, '💎 ×1 소환', 300, 1);

    // 10x summon button — 리디자인: 할인 비용 표기 (3,000→2,700)
    this.createSummonButton(GAME_WIDTH / 2 + s(110), buttonY, '💎 ×10 소환', 2700, 10, true);

    // Ticket summon buttons
    const ticketY = buttonY + s(40); // BottomNav(y=1160) 겹침 방지: 버튼 하단이 1160 이내
    const ticketResources = SaveManager.getResources();
    const ticketCount = ticketResources.summonTickets || 0;

    this.ticketText = this.add.text(GAME_WIDTH / 2, ticketY, `🎫 소환권: ${ticketCount}개`, {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Ticket single pull button
    const ticketBtn1 = this.add.container(GAME_WIDTH / 2 - s(110), ticketY + s(45));
    const ticketBg1 = this.add.rectangle(0, 0, s(180), s(50), COLORS.primary, 1);
    ticketBg1.setStrokeStyle(s(2), COLORS.accent, 0.5);
    ticketBg1.setInteractive({ useHandCursor: true });
    const ticketLabel1 = this.add.text(0, 0, '🎫 ×1 소환', {
      fontSize: sf(16), fontFamily: 'Arial',
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
    const ticketBtn10 = this.add.container(GAME_WIDTH / 2 + s(110), ticketY + s(45));
    const ticketBg10 = this.add.rectangle(0, 0, s(180), s(50), COLORS.primary, 1);
    ticketBg10.setStrokeStyle(s(2), COLORS.accent, 0.5);
    ticketBg10.setInteractive({ useHandCursor: true });
    const ticketLabel10 = this.add.text(0, 0, '🎫 ×10 소환', {
      fontSize: sf(16), fontFamily: 'Arial',
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

    // Button background — 리디자인: primary→accent 그라디언트 느낌 (이중 레이어)
    const bgColor = isPremium ? COLORS.secondary : COLORS.primary;
    const accentBorder = isPremium ? COLORS.accent : COLORS.secondary;

    // 외부 글로우 레이어 (rounded 느낌)
    const outerGlow = this.add.rectangle(0, 0, s(188), s(98), accentBorder, 0.25);
    outerGlow.setStrokeStyle(s(1), accentBorder, 0.5);
    btn.add(outerGlow);

    const bg = this.add.rectangle(0, 0, s(182), s(92), bgColor, 1);
    bg.setStrokeStyle(s(2), accentBorder, 0.9);
    bg.setInteractive({ useHandCursor: true });

    // Inner highlight (상단 하이라이트 — 그라디언트 느낌)
    const innerGlow = this.add.rectangle(0, s(-22), s(172), s(32), 0xffffff, 0.12);
    btn.add(innerGlow);

    // Button label
    const labelText = this.add.text(0, s(-20), label, {
      fontSize: sf(18),
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: s(2)
    }).setOrigin(0.5);

    // Cost display — 리디자인: 할인 표기 (10연차는 취소선 원가 표시)
    const costY = isPremium ? s(16) : s(20);
    const costContainer = this.add.container(0, costY);
    const costText = this.add.text(0, 0, `${cost.toLocaleString()} 💎`, {
      fontSize: sf(17),
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    costContainer.add([costText]);

    // 10연차 할인 표기 (3,000→2,700)
    if (isPremium) {
      const discountText = this.add.text(0, s(18), '(3,000 → 2,700 할인!)', {
        fontSize: sf(10),
        fontFamily: 'Arial',
        color: '#22c55e',
        fontStyle: 'italic'
      }).setOrigin(0.5);
      costContainer.add(discountText);
    }

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
      premiumGlow.lineStyle(s(4), COLORS.accent, 0.6);
      premiumGlow.strokeRect(s(-90), s(-45), s(180), s(90));
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
    const pityY = s(680);

    // GachaSystem에서 동적으로 가져오기
    const pityInfo = GachaSystem.getPityInfo();
    const pity = pityInfo.current;
    const pityMax = pityInfo.threshold;

    // ── 리디자인: 천장 카운터 섹션 패널 ──
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0F172A, 0.75);
    panelBg.fillRoundedRect(GAME_WIDTH / 2 - s(175), pityY - s(14), s(350), s(90), s(10));
    panelBg.lineStyle(s(1), COLORS.secondary, 0.35);
    panelBg.strokeRoundedRect(GAME_WIDTH / 2 - s(175), pityY - s(14), s(350), s(90), s(10));

    this.add.text(GAME_WIDTH / 2 - s(120), pityY, '🎯 천장 카운터', {
      fontSize: sf(13),
      fontFamily: 'Arial',
      color: `#${COLORS.textDark.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // Progress bar background (rounded)
    const barBg = this.add.graphics();
    barBg.fillStyle(COLORS.backgroundLight, 1);
    barBg.fillRoundedRect(GAME_WIDTH / 2 - s(150), pityY + s(18), s(300), s(18), s(9));

    // Progress bar fill (accent color)
    const progress = pityMax > 0 ? pity / pityMax : 0;
    const fillW = Math.max(s(18), s(300) * progress);
    const barFill = this.add.graphics();
    barFill.fillStyle(COLORS.secondary, 1);
    barFill.fillRoundedRect(GAME_WIDTH / 2 - s(150), pityY + s(18), fillW, s(18), s(9));
    this.pityBar = barFill; // updatePityUI 호환 (width tween 대신 redraw 방식)

    // Pity text (바 위)
    this.pityText = this.add.text(GAME_WIDTH / 2, pityY + s(27), `${pity}/${pityMax}`, {
      fontSize: sf(11),
      fontFamily: 'Arial',
      color: `#${COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Info text
    this.add.text(GAME_WIDTH / 2 + s(70), pityY, '90연 SSR 확정', {
      fontSize: sf(11),
      fontFamily: 'Arial',
      color: `#${COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0, 0.5);

    // ── "픽업 확률 상세 보기" 링크 텍스트 ──
    const detailLink = this.add.text(GAME_WIDTH / 2, pityY + s(52), '▼ 픽업 확률 상세 보기', {
      fontSize: sf(12),
      fontFamily: 'Arial',
      color: `#${COLORS.secondary.toString(16).padStart(6, '0')}`,
      fontStyle: 'italic'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    detailLink.on('pointerover', () => detailLink.setAlpha(0.7));
    detailLink.on('pointerout', () => detailLink.setAlpha(1));
    detailLink.on('pointerdown', () => {
      this.showMessage('SSR 3% | SR 15% | R 50% | N 32%\n천장(90연): SSR 확정 보장', COLORS.accent);
    });
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
        cult: charData?.cult ?? null,
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
        cult: charData?.cult ?? null,
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
      this.bannerPityText.setText(`🔮 천장 카운터: ${pityInfo.current}/${pityInfo.threshold}  |  SSR ${pityInfo.currentSSRRate}`);
    }
    if (this.pityText) {
      this.pityText.setText(`${pityInfo.current}/${pityInfo.threshold}`);
    }
    if (this.pityBar) {
      // Graphics 객체이므로 redraw 방식으로 업데이트
      const progress = pityInfo.threshold > 0 ? pityInfo.current / pityInfo.threshold : 0;
      const fillW = Math.max(s(18), s(300) * progress);
      const pityY = s(680);
      this.pityBar.clear();
      this.pityBar.fillStyle(COLORS.secondary, 1);
      this.pityBar.fillRoundedRect(GAME_WIDTH / 2 - s(150), pityY + s(18), fillW, s(18), s(9));
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
    circleGraphics.lineStyle(s(3), effectColor, 1);

    // 육각형 마법진 효과
    for (let ring = 0; ring < 3; ring++) {
      const radius = s(80) + ring * s(35);
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
      const particle = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, hasSSR ? s(5) : s(3), effectColor)
        .setDepth(52).setAlpha(0);
      particles.push(particle);

      this.tweens.add({
        targets: particle,
        x: GAME_WIDTH / 2 + Math.cos(angle) * s(180),
        y: GAME_HEIGHT / 2 + Math.sin(angle) * s(180),
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

    const resultBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - s(40), GAME_HEIGHT - s(200), COLORS.backgroundLight, 0.95);
    resultBg.setStrokeStyle(s(2), COLORS.accent);
    container.add(resultBg);

    const title = this.add.text(GAME_WIDTH / 2, s(150), '⚔️ 장비 소환 결과', {
      fontSize: sf(24),
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add(title);

    const cols = Math.min(5, results.length);
    const startX = GAME_WIDTH / 2 - ((cols - 1) * s(85)) / 2;
    const startY = s(250);

    results.forEach((equip, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * s(85);
      const y = startY + row * s(140);

      this.time.delayedCall(index * 80, () => {
        this.createEquipmentCard(container, x, y, equip);
      });
    });

    const closeBtn = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - s(120));
    const closeBg = this.add.rectangle(0, 0, s(150), s(50), COLORS.accent, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.add.text(0, 0, '확인', {
      fontSize: sf(18),
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

    const cardBg = this.add.rectangle(0, 0, s(75), s(120), COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(s(2), rarityColor);

    // 슬롯 아이콘
    const icon = this.add.text(0, s(-25), equip.slotIcon || '⚔️', {
      fontSize: sf(32)
    }).setOrigin(0.5);

    // 등급 배지
    const rarityBadge = this.add.rectangle(0, s(-55), s(30), s(18), rarityColor, 1);
    const rarityText = this.add.text(0, s(-55), equip.rarity, {
      fontSize: sf(10), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    // 슬롯 타입
    const slotText = this.add.text(0, s(15), equip.slotName || equip.slotType, {
      fontSize: sf(11), fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 장비 이름 (축약)
    const displayName = equip.name && equip.name.length > 6 ? `${equip.name.substring(0, 6)  }..` : (equip.name || '장비');
    const nameText = this.add.text(0, s(35), displayName, {
      fontSize: sf(9), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 주요 스탯 표시
    const mainStat = equip.stats ? Object.entries(equip.stats)[0] : null;
    const statLabel = mainStat ? `${mainStat[0]} +${Math.floor(mainStat[1])}` : '';
    const statText = this.add.text(0, s(50), statLabel, {
      fontSize: sf(9), fontFamily: 'Arial',
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
      const glow = this.add.circle(x, y, s(50), COLORS.raritySSR, 0.3);
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
    // 단일 소환: 등급별 차별화 연출, 10연차: 기존 로직 + 강화 결과 화면
    if (results.length === 1) {
      this.playGachaReveal(results[0]);
    } else {
      this._showMultiSummonAnimation(results);
    }
  }

  /**
   * 단일 소환 등급별 연출 메인 함수
   */
  playGachaReveal(result) {
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0);
    overlay.setDepth(50);

    // Step 1: 0.5초 페이드 다크
    this.tweens.add({
      targets: overlay,
      alpha: 0.85,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        // Step 2: 등급별 분기
        const rarity = result.rarity || 'N';
        if (rarity === 'SSR') {
          this.playSSRReveal(result, overlay);
        } else if (rarity === 'SR') {
          this.playSRReveal(result, overlay);
        } else if (rarity === 'R') {
          this.playRReveal(result, overlay);
        } else {
          this.playNReveal(result, overlay);
        }
      }
    });
  }

  /**
   * N등급 연출 — 0.3초 빠른 등장, 기본 색상 flash
   */
  playNReveal(result, overlay) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // 기본 플래시 (회색)
    this.cameras.main.flash(200, 120, 120, 120);

    // 빠른 카드 등장 (0.3초)
    this.time.delayedCall(300, () => {
      this._showSingleResultCard(result, overlay);
    });
  }

  /**
   * R등급 연출 — 0.8초 별빛 이펙트, 파란색 glow
   */
  playRReveal(result, overlay) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const rColor = COLORS.rarityR || 0x3B82F6;

    // 파란색 플래시
    this.cameras.main.flash(300, 59, 130, 246);

    // 별빛 파티클
    const stars = [];
    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2;
      const dist = s(80) + Phaser.Math.Between(0, s(60));
      const star = this.add.circle(cx, cy, s(3), rColor, 1).setDepth(52);
      stars.push(star);
      this.tweens.add({
        targets: star,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: { from: 1, to: 0 },
        scale: { from: 1, to: 0.2 },
        duration: 800,
        delay: i * 30,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy()
      });
    }

    // glow 원형
    const glow = this.add.circle(cx, cy, s(100), rColor, 0.2).setDepth(51);
    this.tweens.add({
      targets: glow,
      scale: { from: 0.3, to: 1.5 },
      alpha: { from: 0.4, to: 0 },
      duration: 800,
      ease: 'Power2',
      onComplete: () => glow.destroy()
    });

    // 0.8초 후 카드 등장
    this.time.delayedCall(800, () => {
      this._showSingleResultCard(result, overlay);
    });
  }

  /**
   * SR등급 연출 — 1.5초 교단 컬러 폭발, 화면 진동
   */
  playSRReveal(result, overlay) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const cultColor = (result.cult && CULT_COLORS[result.cult]) ? CULT_COLORS[result.cult] : (COLORS.raritySR || 0xA855F7);

    // 화면 진동
    this.cameras.main.shake(400, 0.006);

    // 교단 컬러 플래시
    const r = (cultColor >> 16) & 0xff;
    const g = (cultColor >> 8) & 0xff;
    const b = cultColor & 0xff;
    this.cameras.main.flash(400, r, g, b);

    // 폭발 링 이펙트
    for (let ring = 0; ring < 3; ring++) {
      const ringGraphics = this.add.graphics().setDepth(52);
      ringGraphics.lineStyle(s(3), cultColor, 1);
      ringGraphics.strokeCircle(cx, cy, s(50) + ring * s(30));
      ringGraphics.setScale(0).setAlpha(1);

      this.tweens.add({
        targets: ringGraphics,
        scale: 2.5,
        alpha: 0,
        duration: 1200,
        delay: ring * 150,
        ease: 'Cubic.easeOut',
        onComplete: () => ringGraphics.destroy()
      });
    }

    // 교단 컬러 파티클 버스트
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const particle = this.add.circle(cx, cy, s(4), cultColor, 1).setDepth(53);
      this.tweens.add({
        targets: particle,
        x: cx + Math.cos(angle) * s(160),
        y: cy + Math.sin(angle) * s(160),
        alpha: { from: 1, to: 0 },
        duration: 1200,
        delay: 200 + i * 20,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy()
      });
    }

    // H-3 ParticleManager 연동
    if (this.particles) {
      this.time.delayedCall(300, () => {
        this.particles.playRarityEffect('SR', cx, cy);
      });
    }

    // 1.5초 후 카드 등장
    this.time.delayedCall(1500, () => {
      this._showSingleResultCard(result, overlay);
    });
  }

  /**
   * SSR등급 연출 — 3.0초 서스펜스 빌드업
   *   0~1.5초: 화면 어두워짐 + 파티클
   *   1.5~2.0초: 교단 컬러 균열 이펙트
   *   2.0~3.0초: 전체 폭발 → 캐릭터 등장
   */
  playSSRReveal(result, overlay) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const cultColor = (result.cult && CULT_COLORS[result.cult]) ? CULT_COLORS[result.cult] : (COLORS.raritySSR || 0xF97316);
    const ssrColor = COLORS.raritySSR || 0xF97316;

    // Phase 1 (0~1.5초): 서서히 어두워짐 + 부유 파티클
    this.tweens.add({
      targets: overlay,
      alpha: 0.97,
      duration: 1500,
      ease: 'Power3'
    });

    // 서서히 나타나는 파티클들
    for (let i = 0; i < 20; i++) {
      const px = cx + Phaser.Math.Between(-s(150), s(150));
      const py = cy + Phaser.Math.Between(-s(200), s(200));
      const particle = this.add.circle(px, py + s(50), s(2), ssrColor, 0).setDepth(52);
      this.tweens.add({
        targets: particle,
        y: py,
        alpha: { from: 0, to: 0.7 },
        duration: 1500,
        delay: i * 70,
        ease: 'Sine.easeOut',
        onComplete: () => {}
      });
    }

    // Phase 2 (1.5~2.0초): 교단 컬러 균열 이펙트
    this.time.delayedCall(1500, () => {
      const crackGraphics = this.add.graphics().setDepth(54);
      crackGraphics.lineStyle(s(4), cultColor, 1);

      // 균열 선들 (중심에서 방사형)
      const crackCount = 8;
      for (let i = 0; i < crackCount; i++) {
        const angle = (i / crackCount) * Math.PI * 2;
        const len = s(100) + Phaser.Math.Between(0, s(80));
        crackGraphics.beginPath();
        crackGraphics.moveTo(cx, cy);
        // 지그재그 균열
        const midX = cx + Math.cos(angle + 0.2) * len * 0.5;
        const midY = cy + Math.sin(angle + 0.2) * len * 0.5;
        crackGraphics.lineTo(midX, midY);
        crackGraphics.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        crackGraphics.strokePath();
      }

      crackGraphics.setAlpha(0);
      this.tweens.add({
        targets: crackGraphics,
        alpha: { from: 0, to: 1 },
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          // 균열 발광
          this.tweens.add({
            targets: crackGraphics,
            alpha: { from: 1, to: 0.3 },
            duration: 200,
            yoyo: true,
            repeat: 1,
            onComplete: () => crackGraphics.destroy()
          });
        }
      });

      // 카메라 작은 흔들림 (긴장감)
      this.cameras.main.shake(300, 0.004);
    });

    // Phase 3 (2.0~3.0초): 전체 폭발 → 캐릭터 등장
    this.time.delayedCall(2000, () => {
      // 강력한 카메라 흔들림
      this.cameras.main.shake(600, 0.015);

      // 황금 플래시
      const r = (ssrColor >> 16) & 0xff;
      const g = (ssrColor >> 8) & 0xff;
      const b = ssrColor & 0xff;
      this.cameras.main.flash(500, r, g, b);

      // 광선 이펙트 (12방향)
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const ray = this.add.graphics().setDepth(55);
        ray.fillStyle(ssrColor, 0.8);
        ray.fillTriangle(0, 0, s(-8), s(-280), s(8), s(-280));
        ray.setPosition(cx, cy);
        ray.setRotation(angle);
        ray.setAlpha(0);

        this.tweens.add({
          targets: ray,
          alpha: { from: 0, to: 1 },
          scaleY: { from: 0.5, to: 1.5 },
          duration: 500,
          delay: i * 40,
          ease: 'Power2',
          yoyo: true,
          onComplete: () => ray.destroy()
        });
      }

      // 대규모 파티클 폭발
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const spd = s(150) + Phaser.Math.Between(0, s(100));
        const pColor = i % 3 === 0 ? cultColor : ssrColor;
        const particle = this.add.circle(cx, cy, s(5) + Phaser.Math.Between(0, s(3)), pColor, 1).setDepth(53);
        this.tweens.add({
          targets: particle,
          x: cx + Math.cos(angle) * spd,
          y: cy + Math.sin(angle) * spd,
          alpha: { from: 1, to: 0 },
          scale: { from: 1, to: 0 },
          duration: 900,
          delay: i * 15,
          ease: 'Cubic.easeOut',
          onComplete: () => particle.destroy()
        });
      }

      // H-3 ParticleManager 연동
      if (this.particles) {
        this.particles.playRarityEffect('SSR', cx, cy);
        if (result.mood) {
          this.time.delayedCall(300, () => {
            this.particles.playMoodEffect(result.mood, cx, cy, 'skill');
          });
        }
      }

      // 1.0초 후 카드 등장
      this.time.delayedCall(1000, () => {
        this._showSingleResultCard(result, overlay);
      });
    });
  }

  /**
   * 단일 소환 결과 카드 표시 (NEW! 배지 / 각성 소재 표시 포함)
   */
  _showSingleResultCard(result, overlay) {
    const container = this.add.container(0, 0).setDepth(60);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const rKey = getRarityKey(result.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const cultColor = (result.cult && CULT_COLORS[result.cult]) ? CULT_COLORS[result.cult] : rarityColor;

    // 카드 배경
    const cardW = s(200);
    const cardH = s(280);
    const cardBg = this.add.rectangle(cx, cy, cardW, cardH, COLORS.backgroundLight, 0.98);
    const borderColor = (rKey === 'SSR') ? (COLORS.raritySSR || 0xF97316) : (rKey === 'SR') ? cultColor : rarityColor;
    const borderThick = (rKey === 'SSR') ? s(4) : (rKey === 'SR') ? s(3) : s(2);
    cardBg.setStrokeStyle(borderThick, borderColor);
    container.add(cardBg);

    // 등급 배지
    const rarityBadge = this.add.rectangle(cx, cy - s(120), s(70), s(24), rarityColor, 1);
    const rarityText = this.add.text(cx, cy - s(120), rKey, {
      fontSize: sf(13), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add([rarityBadge, rarityText]);

    // 캐릭터 이미지 (실제 hero 텍스처 우선, 없으면 hero_placeholder 폴백)
    const singleResultTextureKey = (() => {
      const key = `hero_${result.id || result.characterId}`;
      if (result.id || result.characterId) {
        if (this.textures.exists(key)) return key;
      }
      return 'hero_placeholder';
    })();
    const heroImg = this.add.image(cx, cy - s(30), singleResultTextureKey).setScale(1.2);
    container.add(heroImg);

    // 별 표시
    const starCount = result.stars || getRarityNum(result.rarity) || rarityData.stars || 1;
    const starsText = this.add.text(cx, cy + s(70), '★'.repeat(starCount), {
      fontSize: sf(14), color: `#${(COLORS.accent || 0xFFD700).toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    container.add(starsText);

    // 캐릭터 이름
    const nameText = this.add.text(cx, cy + s(95), result.name || '???', {
      fontSize: sf(16), fontFamily: 'Arial',
      color: `#${(COLORS.text || 0xffffff).toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add(nameText);

    // NEW! 배지 또는 각성 소재 표시
    if (result.isNew) {
      const newBadge = this.add.rectangle(cx + s(75), cy - s(105), s(50), s(26), 0x22c55e, 1);
      const newText = this.add.text(cx + s(75), cy - s(105), 'NEW!', {
        fontSize: sf(11), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5);
      container.add([newBadge, newText]);
    } else {
      const shardCount = result.shardsGained || 1;
      const dupText = this.add.text(cx, cy + s(118), `→ 각성 소재 ×${shardCount}`, {
        fontSize: sf(12), fontFamily: 'Arial',
        color: `#${(COLORS.accent || 0xFFD700).toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);
      container.add(dupText);
    }

    // SSR/SR glow 효과
    if (rKey === 'SSR' || rKey === 'SR') {
      const glowColor = rKey === 'SSR' ? borderColor : cultColor;
      const glowCircle = this.add.circle(cx, cy, s(120), glowColor, 0.15).setDepth(59);
      container.add(glowCircle);
      container.sendToBack(glowCircle);
      this.tweens.add({
        targets: glowCircle,
        scale: { from: 0.9, to: 1.15 },
        alpha: { from: 0.2, to: 0 },
        duration: 1200,
        repeat: -1
      });
    }

    // 카드 등장 애니메이션
    container.setAlpha(0);
    container.setScale(0.5);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut'
    });

    // 버튼 영역
    const btnY = cy + s(165);

    // [계속 소환] 버튼
    const continueBtn = this.add.container(cx - s(90), btnY);
    const continueBg = this.add.rectangle(0, 0, s(150), s(50), COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const continueText = this.add.text(0, 0, '계속 소환', {
      fontSize: sf(16), fontFamily: 'Arial',
      color: `#${(COLORS.text || 0xffffff).toString(16).padStart(6, '0')}`, fontStyle: 'bold'
    }).setOrigin(0.5);
    continueBtn.add([continueBg, continueText]);
    container.add(continueBtn);

    // [확인] 버튼
    const confirmBtn = this.add.container(cx + s(90), btnY);
    const confirmBg = this.add.rectangle(0, 0, s(150), s(50), COLORS.accent || 0xFFD700, 1)
      .setInteractive({ useHandCursor: true });
    const confirmText = this.add.text(0, 0, '확인', {
      fontSize: sf(16), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);
    confirmBtn.add([confirmBg, confirmText]);
    container.add(confirmBtn);

    continueBg.on('pointerdown', () => {
      container.destroy();
      overlay.destroy();
      this.isAnimating = false;
      this.updatePityDisplay();
    });

    confirmBg.on('pointerdown', () => {
      container.destroy();
      overlay.destroy();
      this.isAnimating = false;
      this.updatePityDisplay();
    });
  }

  /**
   * 10연차 이상 소환 연출 (기존 로직 기반 강화)
   */
  _showMultiSummonAnimation(results) {
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
    circleGraphics.lineStyle(s(4), hasSSR ? COLORS.raritySSR : (hasSR ? COLORS.raritySR : COLORS.primary), 1);

    for (let i = 0; i < 3; i++) {
      circleGraphics.strokeCircle(GAME_WIDTH / 2, GAME_HEIGHT / 2, s(100) + i * s(30));
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
        hasSSR ? s(6) : s(4),
        particleColor
      ).setDepth(52).setAlpha(0);

      particles.push(particle);

      this.tweens.add({
        targets: particle,
        x: GAME_WIDTH / 2 + Math.cos(angle) * (hasSSR ? s(200) : s(150)),
        y: GAME_HEIGHT / 2 + Math.sin(angle) * (hasSSR ? s(200) : s(150)),
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
        ray.fillTriangle(0, 0, s(-10), s(-300), s(10), s(-300));
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
      const glow = this.add.circle(GAME_WIDTH / 2, GAME_HEIGHT / 2, s(150), COLORS.raritySR, 0.3);
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
      this.showTenPullResults(results, overlay);
    });
  }

  /**
   * 10연차 결과 화면 — 5×2 그리드, SSR/SR 강조 테두리, NEW! 배지, SSR 강조 영역
   */
  showTenPullResults(results, overlay) {
    const container = this.add.container(0, 0).setDepth(60);

    // 결과 배경
    const resultBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - s(40), GAME_HEIGHT - s(160), COLORS.backgroundLight, 0.96);
    resultBg.setStrokeStyle(s(2), COLORS.primary);
    container.add(resultBg);

    // 타이틀
    const hasSSR = results.some(r => r.rarity === 'SSR');
    const titleColor = hasSSR
      ? `#${(COLORS.raritySSR || 0xF97316).toString(16).padStart(6, '0')}`
      : `#${(COLORS.text || 0xffffff).toString(16).padStart(6, '0')}`;
    const titleText = hasSSR ? '✨ SSR 획득! ✨' : '소환 결과';

    const title = this.add.text(GAME_WIDTH / 2, s(120), titleText, {
      fontSize: sf(24),
      fontFamily: 'Georgia, serif',
      color: titleColor,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add(title);

    // SSR 획득 시 별도 강조 영역
    if (hasSSR) {
      const ssrHeroes = results.filter(r => r.rarity === 'SSR');
      const ssrBanner = this.add.rectangle(GAME_WIDTH / 2, s(160), GAME_WIDTH - s(60), s(50), COLORS.raritySSR || 0xF97316, 0.2);
      ssrBanner.setStrokeStyle(s(2), COLORS.raritySSR || 0xF97316, 0.8);
      container.add(ssrBanner);

      const ssrNames = ssrHeroes.map(h => h.name || '???').join(', ');
      const ssrHighlight = this.add.text(GAME_WIDTH / 2, s(160), `★ SSR: ${ssrNames} ★`, {
        fontSize: sf(14), fontFamily: 'Arial',
        color: `#${(COLORS.raritySSR || 0xF97316).toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
      container.add(ssrHighlight);

      // SSR 강조 타이틀 펄스 애니메이션
      this.tweens.add({
        targets: title,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // 5×2 카드 그리드
    const cols = 5;
    const cardSpacingX = s(82);
    const cardSpacingY = s(125);
    const gridStartX = GAME_WIDTH / 2 - ((cols - 1) * cardSpacingX) / 2;
    const gridStartY = hasSSR ? s(205) : s(190);

    results.forEach((hero, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = gridStartX + col * cardSpacingX;
      const y = gridStartY + row * cardSpacingY;

      this.time.delayedCall(index * 80, () => {
        this._createTenPullCard(container, x, y, hero);
      });
    });

    // 확인 버튼
    const closeBtn = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - s(100));
    const closeBg = this.add.rectangle(0, 0, s(180), s(52), COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.add.text(0, 0, '확인', {
      fontSize: sf(18), fontFamily: 'Arial',
      color: `#${(COLORS.text || 0xffffff).toString(16).padStart(6, '0')}`, fontStyle: 'bold'
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

  /**
   * 10연차 개별 카드 — SSR 금색, SR 교단 컬러 테두리, NEW! 배지
   */
  _createTenPullCard(container, x, y, hero) {
    const card = this.add.container(x, y);

    const rKey = getRarityKey(hero.rarity);
    const rarityData = RARITY[rKey] || RARITY.N;
    const rarityColor = rarityData.color;
    const cultColor = (hero.cult && CULT_COLORS[hero.cult]) ? CULT_COLORS[hero.cult] : rarityColor;

    // 등급별 테두리 색상
    let borderColor = rarityColor;
    let borderThick = s(2);
    if (rKey === 'SSR') {
      borderColor = COLORS.raritySSR || 0xF97316;
      borderThick = s(4);
    } else if (rKey === 'SR') {
      borderColor = cultColor;
      borderThick = s(3);
    }

    const cardBg = this.add.rectangle(0, 0, s(72), s(108), COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(borderThick, borderColor);

    // 히어로 이미지 (실제 hero 텍스처 우선, 없으면 hero_placeholder 폴백)
    const tenPullCardTextureKey = (() => {
      const key = `hero_${hero.id || hero.characterId}`;
      if ((hero.id || hero.characterId) && this.textures.exists(key)) return key;
      return 'hero_placeholder';
    })();
    const heroImg = this.add.image(0, s(-15), tenPullCardTextureKey).setScale(0.65);

    // 등급 배지
    const rarityBadge = this.add.rectangle(0, s(-47), s(32), s(18), rarityColor, 1);
    const rarityText = this.add.text(0, s(-47), rKey, {
      fontSize: sf(9), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5);

    // 별
    const starCount = hero.stars || getRarityNum(hero.rarity) || rarityData.stars || 1;
    const starsText = this.add.text(0, s(22), '★'.repeat(starCount), {
      fontSize: sf(8), color: `#${(COLORS.accent || 0xFFD700).toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // 이름
    const heroName = hero.name || '???';
    const displayName = heroName.length > 5 ? `${heroName.substring(0, 5)}..` : heroName;
    const nameText = this.add.text(0, s(38), displayName, {
      fontSize: sf(9), fontFamily: 'Arial',
      color: `#${(COLORS.text || 0xffffff).toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    card.add([cardBg, heroImg, rarityBadge, rarityText, starsText, nameText]);

    // NEW! 배지
    if (hero.isNew) {
      const newBadge = this.add.rectangle(s(25), s(-47), s(28), s(16), 0x22c55e, 1);
      const newText = this.add.text(s(25), s(-47), 'NEW', {
        fontSize: sf(7), fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0.5);
      card.add([newBadge, newText]);
    }

    container.add(card);

    // 등장 애니메이션
    card.setScale(0);
    this.tweens.add({
      targets: card,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut'
    });

    // SSR glow 효과
    if (rKey === 'SSR') {
      const glow = this.add.circle(x, y, s(45), COLORS.raritySSR || 0xF97316, 0.3);
      container.add(glow);
      container.sendToBack(glow);
      this.tweens.add({
        targets: glow,
        scale: { from: 0.8, to: 1.3 },
        alpha: { from: 0.5, to: 0 },
        duration: 1000,
        repeat: -1
      });
    }
  }

  showResults(results, overlay) {
    const container = this.add.container(0, 0).setDepth(60);

    // Results background
    const resultBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - s(40), GAME_HEIGHT - s(200), COLORS.backgroundLight, 0.95);
    resultBg.setStrokeStyle(s(2), COLORS.primary);
    container.add(resultBg);

    // Title
    const title = this.add.text(GAME_WIDTH / 2, s(150), '소환 결과', {
      fontSize: sf(24),
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    container.add(title);

    // Display heroes in grid
    const cols = Math.min(5, results.length);
    const startX = GAME_WIDTH / 2 - ((cols - 1) * s(85)) / 2;
    const startY = s(250);

    results.forEach((hero, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * s(85);
      const y = startY + row * s(130);

      this.time.delayedCall(index * 100, () => {
        this.createHeroCard(container, x, y, hero);
      });
    });

    // Close button
    const closeBtn = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - s(120));
    const closeBg = this.add.rectangle(0, 0, s(150), s(50), COLORS.primary, 1)
      .setInteractive({ useHandCursor: true });
    const closeText = this.add.text(0, 0, '확인', {
      fontSize: sf(18),
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
    const cardBg = this.add.rectangle(0, 0, s(75), s(110), COLORS.backgroundLight, 1);
    cardBg.setStrokeStyle(s(2), rarityColor);

    // Hero image (실제 hero 텍스처 우선, 없으면 hero_placeholder 폴백)
    const heroCardTextureKey = (() => {
      const key = `hero_${hero.id || hero.characterId}`;
      if ((hero.id || hero.characterId) && this.textures.exists(key)) return key;
      return 'hero_placeholder';
    })();
    const heroImg = this.add.image(0, s(-15), heroCardTextureKey).setScale(0.7);

    // Rarity indicator
    const rarityBg = this.add.rectangle(0, s(-50), s(30), s(18), rarityColor, 1);
    const rarityText = this.add.text(0, s(-50), rKey, {
      fontSize: sf(10),
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stars
    const starCount = hero.stars || getRarityNum(hero.rarity) || rarityData.stars || 1;
    const stars = this.add.text(0, s(25), '★'.repeat(starCount), {
      fontSize: sf(10),
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Name (truncated)
    const heroName = hero.name || '???';
    const name = heroName.length > 6 ? `${heroName.substring(0, 6)  }..` : heroName;
    const nameText = this.add.text(0, s(42), name, {
      fontSize: sf(10),
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
      const glow = this.add.circle(x, y, s(50), COLORS.raritySSR, 0.3);
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
      fontSize: sf(20),
      fontFamily: 'Arial',
      color: `#${  color.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${  COLORS.backgroundLight.toString(16).padStart(6, '0')}`,
      padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: msg,
      alpha: 0,
      y: msg.y - s(50),
      duration: 1500,
      delay: 500,
      onComplete: () => msg.destroy()
    });
  }
}
