/**
 * GachaScene.js — 소환 화면 (REDESIGN_PLAN §3-2, T-12)
 *
 * 이전 화면은 배너 자리에 플레이스홀더 상자가 있고 y≈580~1300(base) 720px 이 비어 있었으며,
 * 하단 4버튼이 소환권 안내 텍스트를 덮었다. 이번 재배치는 화면을 7개 세로 밴드로 나눈다.
 *
 *   탭 → 배너(픽업 일러스트 + 전신) → 확률 고지 → 천장 → 젬 소환 → 티켓 소환 → 확률 정보
 *
 * 밴드 높이는 `utils/gachaBannerLayout.js`(Phaser 비의존 순수 모듈)가 계산한다.
 * GachaPopup 이 같은 함수를 더 짧은 높이로 호출해 두 화면이 같은 규칙을 공유한다.
 * 결과 연출은 `components/GachaResultOverlay.js`(T-14) 가 맡는다 — 이 씬은 오버레이를
 * 자기 shutdown() 에서 반드시 정리한다. 남으면 전면 레이어가 모든 입력을 삼킨다.
 *
 * 확률·천장·비용 수치는 전부 GachaSystem SSOT 에서 읽는다. 하드코딩 금지.
 *
 * 주의: gameConfig/designSystem 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, s, sf } from '../config/gameConfig.js';
import { DESIGN } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';
import GameLogger from '../utils/GameLogger.js';
import { SaveManager } from '../systems/SaveManager.js';
import { GachaSystem } from '../systems/GachaSystem.js';
import { EquipmentSystem } from '../systems/EquipmentSystem.js';
import { ParticleManager } from '../systems/ParticleManager.js';
import { getCharacterOrHero, normalizeHeroes } from '../data/index.js';
import navigationManager from '../systems/NavigationManager.js';
import { Z_INDEX } from '../config/layoutConfig.js';
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { GlassPanel, GLASS_VARIANT } from '../components/GlassPanel.js';
import { NineSliceFrame } from '../components/NineSliceFrame.js';
import { GachaBannerPanel } from '../components/GachaBannerPanel.js';
import { GachaResultOverlay } from '../components/GachaResultOverlay.js';
import { computeGachaLayout, computeButtonRow } from '../utils/gachaBannerLayout.js';
import { RateDisclosurePanel } from '../components/popups/RateDisclosurePanel.js';

/** 상단바 높이 (base px) */
const HEADER_H = 80;

/** 밴드 영역의 상하 여백 (base px) */
const BAND_TOP = 88;
const BAND_BOTTOM_PAD = 30;

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

    // §3-2 세로 밴드. 상단바 아래부터 화면 하단 여백까지를 7밴드로 나눈다
    this.layout = computeGachaLayout({
      top: BAND_TOP,
      height: 1280 - BAND_TOP - BAND_BOTTOM_PAD
    });

    this.createBackground();
    this.createHeader();
    this.createTabButtons();
    this.createBannerArea();
    this.createRateSummary();
    this.createPityDisplay();
    this.createSummonButtons();
    this.createRateInfoButton();
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
    // bg_gacha 는 asset-manifest lazyTextures 다. 없으면 BackgroundFactory 가
    // 프로시저럴 폴백을 깔고 뒤에서 실제 아트를 불러와 교체한다.
    // bg_gacha 는 금빛 제단 일러스트라 기본 딤(0.35)으로는 패널 사이로 새어 나와
    // 화면이 어지러워진다. 소환 화면만 딤을 올려 배경을 장소감으로만 남긴다.
    this.sceneBg = BackgroundFactory.createSceneBg(this, 'gacha', { dimAlpha: 0.62 });

    // 떠다니는 신성 입자 — 저사양에서는 절반으로 줄인다
    const budget = DESIGN.effects.useBlurBackdrop === false ? 14 : 28;
    for (let i = 0; i < budget; i++) {
      const particle = this.add.circle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT),
        Phaser.Math.FloatBetween(1, 2.4),
        DESIGN.colors.brand.primary,
        0.35
      ).setDepth(2);

      this.tweens.add({
        targets: particle,
        y: particle.y - Phaser.Math.Between(s(120), s(240)),
        alpha: 0,
        duration: Phaser.Math.Between(3200, 6400),
        repeat: -1,
        delay: Phaser.Math.Between(0, 2200)
      });
    }
  }

  createHeader() {
    const h = s(HEADER_H);
    const glass = GlassPanel.create(this, {
      x: GAME_WIDTH / 2, y: h / 2, w: GAME_WIDTH, h,
      variant: GLASS_VARIANT.HUD,
      tint: DESIGN.colors.brand.primary,
      bgKey: this.sceneBg && this.sceneBg.hasImage ? this.sceneBg.textureKey : null
    });
    glass.setDepth(Z_INDEX.TOP_BAR);

    // 뒤로 — 터치 타겟 72×72 (§2-5)
    const backHit = this.add.rectangle(s(44), h / 2, s(72), s(72), 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(Z_INDEX.TOP_BAR + 1);
    this.add.text(s(44), h / 2, '\u2190', ts('title', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setDepth(Z_INDEX.TOP_BAR + 1);

    backHit.on('pointerdown', () => {
      if (this.isAnimating) return;
      navigationManager.goBack(this);
    });

    this.add.text(GAME_WIDTH / 2, h / 2, '소환', ts('display.lg', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setDepth(Z_INDEX.TOP_BAR + 1);

    // 젬 — 고정폭 숫자라 값이 갱신돼도 좌우로 흔들리지 않는다
    const resources = SaveManager.getResources();
    this.registry.set('gems', resources.gems);
    this.gemText = this.add.text(GAME_WIDTH - s(24), h / 2, resources.gems.toLocaleString(), ts('num.md', {
      color: '#' + DESIGN.colors.brand.accent.toString(16).padStart(6, '0')
    })).setOrigin(1, 0.5).setDepth(Z_INDEX.TOP_BAR + 1);
  }

  createTabButtons() {
    const band = this.layout.bands.tabs;
    const slots = computeButtonRow({ width: 720, margin: 20, gap: 12, ratio: [1, 1], y: band.y, h: band.h });

    const make = (slot, label) => {
      const bg = this.add.graphics().setDepth(Z_INDEX.PANELS);
      const text = this.add.text(s(slot.centerX), s(band.centerY), label, ts('subtitle', {
        color: DESIGN.colors.text.secondary
      })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
      const hit = this.add.rectangle(
        s(slot.centerX), s(band.centerY),
        s(slot.w), Math.max(s(band.h), s(DESIGN.touch.minTarget)), 0xffffff, 0
      ).setInteractive({ useHandCursor: true }).setDepth(Z_INDEX.PANEL_BUTTONS);
      return { bg, text, hit, slot };
    };

    this.heroTabUI = make(slots[0], '영웅 소환');
    this.equipTabUI = make(slots[1], '장비 소환');

    this.heroTabUI.hit.on('pointerdown', () => {
      if (this.currentTab === 'hero' || this.isAnimating) return;
      this.switchTab('hero');
    });
    this.equipTabUI.hit.on('pointerdown', () => {
      if (this.currentTab === 'equipment' || this.isAnimating) return;
      this.switchTab('equipment');
    });

    this._paintTabs();
  }

  /** @private 활성 탭에만 배너 교단색 언더라인이 붙는다 (Cult Tint) */
  _paintTabs() {
    const band = this.layout.bands.tabs;
    const accent = this.bannerPanel ? this.bannerPanel.accentColor : DESIGN.colors.brand.primary;

    [
      { ui: this.heroTabUI, active: this.currentTab === 'hero' },
      { ui: this.equipTabUI, active: this.currentTab === 'equipment' }
    ].forEach(({ ui, active }) => {
      if (!ui) return;
      const x = s(ui.slot.x);
      const w = s(ui.slot.w);
      const top = s(band.y);
      const h = s(band.h);

      ui.bg.clear();
      ui.bg.fillStyle(DESIGN.colors.bg.secondary, active ? 0.92 : 0.45);
      ui.bg.fillRoundedRect(x, top, w, h, s(DESIGN.radius.md));
      if (active) {
        ui.bg.fillStyle(accent, 0.95);
        ui.bg.fillRect(x + s(14), top + h - s(3), w - s(28), s(3));
      }
      ui.text.setColor(active ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary);
      ui.text.setStyle({ fontStyle: active ? 'bold' : 'normal' });
    });
  }

  switchTab(tab) {
    this.currentTab = tab;
    this._paintTabs();

    const showPity = tab === 'hero';
    [this.pityBar, this.pityText, this.pityLabel, this.pityInfoText, this.pityTrack].forEach((obj) => {
      if (obj && obj.setVisible) obj.setVisible(showPity);
    });
    if (this.equipGuaranteeText) this.equipGuaranteeText.setVisible(!showPity);
    this.showMessage(showPity ? '영웅 소환 모드' : '장비 소환 모드',
      showPity ? DESIGN.colors.brand.primary : DESIGN.colors.brand.accent);
  }

  /** 배너 — 픽업 일러스트 + 전신 시트 + 배너 탭 스트립 + 재화 칩 */
  createBannerArea() {
    const band = this.layout.bands.banner;

    this.bannerPanel = new GachaBannerPanel(this, {
      x: GAME_WIDTH / 2,
      y: s(band.centerY),
      w: s(680),
      h: s(band.h),
      bgKey: this.sceneBg && this.sceneBg.hasImage ? this.sceneBg.textureKey : null,
      onSelect: () => this._paintTabs()
    });
    this.bannerPanel.container.setDepth(Z_INDEX.PANELS);
    this._paintTabs();
  }

  /** 확률 고지 요약 (BLK-07). 수치는 GachaSystem.RATES SSOT 에서만 읽는다 */
  createRateSummary() {
    const band = this.layout.bands.rates;

    GlassPanel.create(this, {
      x: GAME_WIDTH / 2, y: s(band.centerY), w: s(680), h: s(band.h),
      variant: GLASS_VARIANT.CARD,
      tint: this.bannerPanel ? this.bannerPanel.accentColor : DESIGN.colors.brand.primary
    }).setDepth(Z_INDEX.PANELS);

    const left = s(44);
    const right = s(676);

    this.add.text(left, s(band.y + 28), '등급별 제공 확률', ts('label', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5).setDepth(Z_INDEX.PANEL_CONTENT);

    const pct = (v) => Math.round((v || 0) * 10000) / 100 + '%';
    const grades = ['SSR', 'SR', 'R', 'N'].filter((g) => (GachaSystem.RATES[g] || 0) > 0);
    grades.forEach((grade, index) => {
      const x = left + ((right - left) * (index + 0.5)) / grades.length;
      const color = (RARITY[grade] && RARITY[grade].color) || COLORS.text;
      this.add.text(x, s(band.y + 66), grade, ts('caption', {
        color: '#' + color.toString(16).padStart(6, '0'), fontStyle: 'bold'
      })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
      this.add.text(x, s(band.y + 96), pct(GachaSystem.RATES[grade]), ts('num.md', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
    });

    // 장비 탭 보장 안내는 같은 자리에 겹치지 않게 밴드 하단에 붙인다
    this.equipGuaranteeText = this.add.text(GAME_WIDTH / 2, s(band.bottom - 14),
      '10연차 SR 이상 장비 1개 보장', ts('caption', {
        color: '#' + DESIGN.colors.brand.accent.toString(16).padStart(6, '0')
      })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT).setVisible(false);
  }

  /** 천장 — GachaSystem.getPityInfo() SSOT */
  createPityDisplay() {
    const band = this.layout.bands.pity;
    const info = GachaSystem.getPityInfo();

    GlassPanel.create(this, {
      x: GAME_WIDTH / 2, y: s(band.centerY), w: s(680), h: s(band.h),
      variant: GLASS_VARIANT.CARD,
      tint: DESIGN.colors.brand.accent
    }).setDepth(Z_INDEX.PANELS);

    this.pityLabel = this.add.text(s(44), s(band.y + 26), '천장 카운터', ts('label', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5).setDepth(Z_INDEX.PANEL_CONTENT);

    this.pityText = this.add.text(s(676), s(band.y + 26), info.current + ' / ' + info.threshold, ts('num.md', {
      color: DESIGN.colors.text.primary
    })).setOrigin(1, 0.5).setDepth(Z_INDEX.PANEL_CONTENT);

    this.pityFillLeft = s(44);
    this.pityFillMax = s(632);
    this.pityBarY = s(band.y + band.h - 26);

    this.pityTrack = this.add.graphics().setDepth(Z_INDEX.PANEL_CONTENT);
    this.pityTrack.fillStyle(DESIGN.colors.track, 1);
    this.pityTrack.fillRoundedRect(this.pityFillLeft, this.pityBarY - s(8), this.pityFillMax, s(16), s(8));
    // 카운터가 0 일 때도 트랙이 보여야 "차오르는 자리" 라는 게 읽힌다
    this.pityTrack.lineStyle(s(1), DESIGN.colors.brand.accent, 0.3);
    this.pityTrack.strokeRoundedRect(this.pityFillLeft, this.pityBarY - s(8), this.pityFillMax, s(16), s(8));

    this.pityBar = this.add.graphics().setDepth(Z_INDEX.PANEL_CONTENT + 1);
    this._paintPityBar(info.current / info.threshold);

    this.pityInfoText = this.add.text(GAME_WIDTH / 2, s(band.y + 26),
      info.threshold + '회 소환 시 SSR 확정', ts('caption', {
        color: '#' + DESIGN.colors.brand.accent.toString(16).padStart(6, '0')
      })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);
  }

  /** @private */
  _paintPityBar(ratio) {
    if (!this.pityBar) return;
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    this.pityBar.clear();
    if (clamped <= 0) return;
    this.pityBar.fillStyle(DESIGN.colors.brand.accent, 1);
    this.pityBar.fillRoundedRect(
      this.pityFillLeft, this.pityBarY - s(8), this.pityFillMax * clamped, s(16), s(8)
    );
  }

  /** 젬 2버튼(2:3) + 티켓 2버튼. 밴드가 분리돼 있어 안내 텍스트를 덮지 않는다 */
  createSummonButtons() {
    const gems = this.layout.bands.gems;
    const tickets = this.layout.bands.tickets;
    const resources = SaveManager.getResources();
    const held = resources.summonTickets || 0;

    const gemSlots = computeButtonRow({ width: 720, margin: 20, gap: 14, ratio: [2, 3], y: gems.y, h: gems.h });
    this.createSummonButton({
      slot: gemSlots[0], band: gems, variant: 'btn_secondary', tint: DESIGN.colors.brand.secondary,
      label: '단일 소환', sub: GachaSystem.SINGLE_COST.toLocaleString() + ' 젬',
      onClick: () => this.onGemButton(1)
    });
    this.createSummonButton({
      slot: gemSlots[1], band: gems, variant: 'btn_primary', tint: DESIGN.colors.brand.primary,
      label: '10연차', sub: GachaSystem.MULTI_COST.toLocaleString() + ' 젬 · SR 이상 확정',
      onClick: () => this.onGemButton(10)
    });

    const ticketSlots = computeButtonRow({ width: 720, margin: 20, gap: 14, ratio: [2, 3], y: tickets.y, h: tickets.h });
    this.ticketSingleLabel = this.createSummonButton({
      slot: ticketSlots[0], band: tickets, variant: 'btn_ghost', tint: DESIGN.colors.brand.primary,
      label: '티켓 ×1', sub: '보유 ' + held + '장',
      onClick: () => this.onTicketButton(1)
    });
    this.ticketMultiLabel = this.createSummonButton({
      slot: ticketSlots[1], band: tickets, variant: 'btn_ghost', tint: DESIGN.colors.brand.primary,
      label: '티켓 ×10', sub: '보유 ' + held + '장',
      onClick: () => this.onTicketButton(10)
    });

    // 레거시 참조 호환 — 이전 코드가 this.ticketText 로 보유 수량을 갱신했다
    this.ticketText = this.ticketMultiLabel;
  }

  /**
   * 9-slice 소환 버튼 1개.
   * @returns {Phaser.GameObjects.Text} 보조 라벨 (보유 수량 갱신용)
   */
  createSummonButton({ slot, band, variant, tint, label, sub, onClick }) {
    const cx = s(slot.centerX);
    const cy = s(band.centerY);
    const w = s(slot.w);
    const h = s(band.h);

    const frame = NineSliceFrame.create(this, { x: cx, y: cy, w, h, key: variant, tint });
    frame.setDepth(Z_INDEX.PANELS);

    const main = this.add.text(cx, cy - s(14), label, ts('subtitle', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);

    // 밝은 btn_primary 위에서 text.secondary 는 뭉개진다. 보조 라벨도 본문색을 쓰고 알파로만 낮춘다
    const subText = this.add.text(cx, cy + s(16), sub, ts('caption', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setAlpha(0.85).setDepth(Z_INDEX.PANEL_CONTENT);

    const hit = this.add.rectangle(
      cx, cy, Math.max(w, s(DESIGN.touch.minTarget)), Math.max(h, s(DESIGN.touch.minTarget)), 0xffffff, 0
    ).setInteractive({ useHandCursor: true }).setDepth(Z_INDEX.PANEL_BUTTONS);

    hit.on('pointerover', () => { if (frame.setAlpha) frame.setAlpha(0.85); });
    hit.on('pointerout', () => { if (frame.setAlpha) frame.setAlpha(1); });
    hit.on('pointerdown', () => {
      if (this.isAnimating) return;
      this.tweens.add({ targets: [frame, main, subText], scale: 0.97, duration: 90, yoyo: true });
      onClick();
    });

    return subText;
  }

  /** 젬 소환 버튼 — 비용 검사는 GachaSystem SSOT 로 한다 */
  onGemButton(count) {
    const cost = count === 10 ? GachaSystem.MULTI_COST : GachaSystem.SINGLE_COST * count;
    if (this.currentTab === 'equipment') {
      const resources = SaveManager.getResources();
      if (resources.gems < cost) {
        this.showMessage('보석이 부족합니다!', COLORS.danger);
        return;
      }
      this.performEquipmentPull(count, cost);
      return;
    }

    if (!GachaSystem.canPull(count, 'gems')) {
      this.showMessage('보석이 부족합니다!', COLORS.danger);
      return;
    }
    this.performGachaPull(count);
  }

  /** 티켓 소환 버튼 */
  onTicketButton(count) {
    const needed = count === 10 ? GachaSystem.TICKET_MULTI : GachaSystem.TICKET_SINGLE * count;
    const resources = SaveManager.getResources();
    if ((resources.summonTickets || 0) < needed) {
      this.showMessage('소환권이 부족합니다! (' + needed + '장 필요)', COLORS.danger);
      return;
    }
    if (this.currentTab === 'equipment') {
      this.performEquipmentPullWithTickets(count);
    } else {
      this.performTicketPull(count);
    }
  }

  /** 확률 정보 진입점 (GA-4 법적 요구) — 상시 노출. RateDisclosurePanel 을 중첩 팝업으로 연다 */
  createRateInfoButton() {
    const band = this.layout.bands.info;
    const cy = s(band.centerY);

    const frame = NineSliceFrame.create(this, {
      x: GAME_WIDTH / 2, y: cy, w: s(340), h: s(band.h),
      key: 'btn_ghost', tint: DESIGN.colors.brand.primary
    });
    frame.setDepth(Z_INDEX.PANELS);

    this.add.text(GAME_WIDTH / 2, cy, '확률 및 천장 상세 보기', ts('label', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setDepth(Z_INDEX.PANEL_CONTENT);

    const hit = this.add.rectangle(
      GAME_WIDTH / 2, cy, s(340), Math.max(s(band.h), s(DESIGN.touch.minTarget)), 0xffffff, 0
    ).setInteractive({ useHandCursor: true }).setDepth(Z_INDEX.PANEL_BUTTONS);
    hit.on('pointerdown', () => this.openRateDisclosure());
  }

  openRateDisclosure() {
    if (this._ratePanel) return;
    this._ratePanel = new RateDisclosurePanel(this, {
      onClose: () => { this._ratePanel = null; }
    });
    this._ratePanel.show();
    if (this._ratePanel.container) {
      this._ratePanel.container.setDepth(Z_INDEX.POPUP_NESTED);
    }
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
    this.refreshResourceUI();

    // 결과를 씬 UI용 형식으로 변환
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

    this.refreshResourceUI();

    this.showEquipmentResults(results);
  }

  /**
   * 천장 카운터 UI 업데이트
   */
  updatePityUI(pityInfo) {
    if (!pityInfo) return;
    if (this.pityText) {
      this.pityText.setText(pityInfo.current + ' / ' + pityInfo.threshold);
    }
    this._paintPityBar(pityInfo.current / pityInfo.threshold);
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

  /**
   * 결과 연출 (T-14 GachaResultOverlay).
   * 오버레이는 씬 루트의 depth 3010 전면 레이어다. 반드시 인스턴스에 보관하고
   * shutdown() 에서 정리한다 — 남으면 모든 입력을 삼킨다.
   */
  showSummonAnimation(results) {
    this._clearResultOverlay();

    // 최고 등급 파티클은 오버레이가 자체 예산으로 그린다.
    // ParticleManager 는 분위기(Mood) 연출만 얹어 두 연출이 겹치지 않게 한다.
    const order = ['N', 'R', 'SR', 'SSR'];
    const best = results.reduce(
      (acc, hero) => (order.indexOf(hero.rarity) > order.indexOf(acc) ? hero.rarity : acc),
      'N'
    );
    const bestHero = results.find((hero) => hero.rarity === best);
    if (this.particles && bestHero && bestHero.mood) {
      this.time.delayedCall(1400, () => {
        if (!this.sys || !this.sys.isActive() || !this.particles) return;
        this.particles.playMoodEffect(bestHero.mood, GAME_WIDTH / 2, s(660), 'skill');
      });
    }

    this.resultOverlay = new GachaResultOverlay(this, {
      onPullAgain: () => this.onGemButton(results.length === 10 ? 10 : 1),
      onClose: () => {
        this.resultOverlay = null;
        this.isAnimating = false;
        this.updatePityDisplay();
        this.refreshResourceUI();
      }
    });
    this.resultOverlay.show(results);
  }

  /** 재화 표시 갱신 — 상단바 젬, 배너 칩, 티켓 버튼의 보유 수량 */
  refreshResourceUI() {
    const resources = SaveManager.getResources();
    this.registry.set('gems', resources.gems);
    if (this.gemText) this.gemText.setText(resources.gems.toLocaleString());
    if (this.bannerPanel) this.bannerPanel.refreshResources();
    const label = '보유 ' + (resources.summonTickets || 0) + '장';
    if (this.ticketSingleLabel) this.ticketSingleLabel.setText(label);
    if (this.ticketMultiLabel) this.ticketMultiLabel.setText(label);
  }

  /** @private 결과 연출 잔여물 정리 */
  _clearResultOverlay() {
    if (this.resultOverlay) {
      const overlay = this.resultOverlay;
      this.resultOverlay = null;
      overlay.destroy();
    }
    this.isAnimating = false;
  }

  updatePityDisplay() {
    const pityInfo = GachaSystem.getPityInfo();
    this.updatePityUI(pityInfo);
  }

  shutdown() {
    this._clearResultOverlay();
    if (this.bannerPanel) {
      this.bannerPanel.destroy();
      this.bannerPanel = null;
    }
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
    // 화면 중앙은 배너가 쓰므로 토스트는 소환 버튼 위 여백에 띄운다
    const msg = this.add.text(GAME_WIDTH / 2, s(940), text, {
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
