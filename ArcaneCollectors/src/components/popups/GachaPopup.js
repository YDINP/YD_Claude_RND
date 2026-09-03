/**
 * GachaPopup — 소환 팝업 (REDESIGN_PLAN §3-2, T-12)
 *
 * 이전 화면은 배너 자리에 회색 플레이스홀더가 있고 그 아래 720px(base)이 비어 있었으며,
 * 하단 4버튼이 소환권 안내 텍스트를 덮었다. 이번 재배치는 화면을 7개 세로 밴드로 나눈다.
 *
 *   탭 → 배너(픽업 일러스트 + 전신) → 확률 고지 → 천장 → 젬 소환 → 티켓 소환 → 확률 정보
 *
 * 밴드 높이는 `utils/gachaBannerLayout.js`(순수 모듈)가 계산한다. 같은 함수를
 * GachaScene 이 더 큰 높이로 호출해 두 화면이 같은 규칙을 공유한다.
 *
 * ## 보존해야 하는 계약
 * - **온보딩 모드** (`open({ onboarding: true })`, UXI-04 / 튜토리얼 T-05):
 *   탭·단발·장비를 숨기고 무료 10연 버튼만 노출하며, 확률 고지를 상시 임베드하고
 *   닫기(✕/오버레이)를 잠근다. 버튼은 `gacha.button.multi_ticket` 로 등록돼
 *   튜토리얼 마스킹 홀의 기준이 된다.
 * - **확률/천장 수치는 GachaSystem SSOT** 에서만 읽는다. 하드코딩 금지.
 * - **결과 오버레이는 팝업 라이프사이클에 묶는다.** GachaResultOverlay 는 씬 루트의
 *   depth 3010 전면 레이어다. 팝업만 닫고 남기면 전체 화면 입력을 삼킨다.
 *   destroy() 가 반드시 정리한다.
 *
 * ## 배너·장비 라우팅 (해소됨)
 * '장비 소환' 탭은 `GachaSystem.pullEquipment()`(equipment.json 카탈로그 SSOT)로,
 * '영웅 소환' 탭은 `GachaSystem.pull(count, paymentType, { bannerId })`로 각각 라우팅된다.
 * 배너 스트립에서 고른 `bannerPanel.selectedId`가 그대로 pull에 전달되어 픽업 배너의
 * `determinePickupCharacter()` 판정을 태운다. 결과 연출(GachaResultOverlay)은 캐릭터/장비를
 * 구분해 카드를 그린다 — 장비는 실제 아트가 없어 아이콘(이모지) 폴백을 쓴다.
 */
import { PopupBase } from '../PopupBase.js';
import { COLORS, GAME_WIDTH, RARITY, SCALE_FACTOR, s, sf } from '../../config/gameConfig.js';
import { DESIGN } from '../../config/designSystem.js';
import { ts } from '../../utils/textStyles.ts';
import { Z_INDEX } from '../../config/layoutConfig.js';
import { GachaSystem } from '../../systems/GachaSystem.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { getCharacterOrHero } from '../../data/index.js';
import { getRarityKey, getRarityNum } from '../../utils/rarityUtils.js';
import { RateDisclosurePanel, renderRateTable } from './RateDisclosurePanel.js';
import { collectLiveRateRows } from '../../utils/gachaRateDisclosure.js';
import { TutorialTargetRegistry } from '../../systems/TutorialTargetRegistry.js';
import { GlassPanel, GLASS_VARIANT } from '../GlassPanel.js';
import { NineSliceFrame } from '../NineSliceFrame.js';
import { UIButton } from '../UIButton.js';
import { GachaBannerPanel } from '../GachaBannerPanel.js';
import { GachaResultOverlay } from '../GachaResultOverlay.js';
import { computeGachaLayout, computeButtonRow } from '../../utils/gachaBannerLayout.js';
import { POPUP_SLOT, pickActionChild } from '../../utils/popupLayout.js';

/** 렌더 px → base px */
const toBase = (px) => px / SCALE_FACTOR;

/** 헤더 타이틀 */
const TITLE = '소환';

/** 온보딩 무료 10연 버튼이 놓이는 액션 바 순번 — 튜토리얼 타깃 재등록용 */
const FREE_PULL_ACTION_INDEX = 0;

export class GachaPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.brand.accent,
      ...options
    });

    this.currentTab = 'hero'; // 'hero' or 'equipment'
    this.isAnimating = false;
    this.onboarding = !!options.onboarding;

    // 표시 참조
    this.pityBar = null;
    this.pityText = null;
    this.pityFillMax = 0;
    this.pityFillLeft = 0;
    this.bannerPanel = null;
    this.resultOverlay = null;
    this._ratePanel = null;
    this._rateSummaryTexts = [];
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

  // ================================================================
  // 구축
  // ================================================================

  buildContent() {
    // 헤더/요약/액션 슬롯을 먼저 확정한다. 셋 다 콘텐츠 높이를 바꾸므로
    // 밴드 계산(computeGachaLayout)보다 반드시 앞에 와야 한다.
    this.setTitle(TITLE);
    this.applySummary();
    this.applyActions();

    const b = this.contentBounds;

    // 밴드 배치는 base 좌표계에서 계산하고 그릴 때 s() 로 옮긴다
    this.layout = computeGachaLayout({
      top: toBase(b.top),
      height: toBase(b.height),
      showTabs: !this.onboarding
    });

    if (this.onboarding) {
      this._lockClose();
      this.buildOnboardingContent();
      return;
    }

    this.createTabButtons();
    this.createBannerArea();
    this.createRateSummary();
    this.createPityDisplay();
    this.createSummonButtons();
    this.createLegalNote();
  }

  /**
   * 슬롯 2 — 보유 젬 · 소환권 · 천장.
   * 수치는 SaveManager / GachaSystem SSOT 에서만 읽는다 (하드코딩 금지).
   */
  applySummary() {
    const resources = SaveManager.getResources();
    const pity = GachaSystem.getPityInfo();
    if (this.onboarding) {
      this.setSummary([
        { label: '비용', value: '무료' },
        { label: '천장', value: `${pity.current} / ${pity.threshold}` }
      ]);
      return;
    }
    this.setSummary([
      { label: '젬', value: (resources.gems || 0).toLocaleString() },
      { label: '소환권', value: `${resources.summonTickets || 0}장` },
      { label: '천장', value: `${pity.current} / ${pity.threshold}` }
    ]);
  }

  /**
   * 슬롯 4 — 액션 바.
   * 온보딩에서는 무료 10연 버튼 하나만 남고, 그 버튼이 튜토리얼 마스킹 홀의 기준
   * (`gacha.button.multi_ticket`)이 된다. 일반 모드에서는 확률 고지 진입점이 온다.
   */
  applyActions() {
    if (this.onboarding) {
      const gachaInfo = SaveManager.getGachaInfo();
      const alreadyUsed = !!gachaInfo.freeTenPullUsed;
      this.setActions([{
        label: alreadyUsed ? '무료 10연 소환 완료' : '첫 무료 10연 소환',
        variant: 'primary',
        disabled: alreadyUsed,
        onClick: () => this.performFreeTenPull()
      }]);
      this.registerFreePullTarget();
      return;
    }

    this.setActions([{
      label: '확률 및 천장 상세 보기',
      variant: 'ghost',
      onClick: () => this.scene.time.delayedCall(0, () => this.openRateDisclosure())
    }]);
  }

  /** 무료 10연 버튼을 튜토리얼 타깃으로 다시 등록한다 (T-05 강제 마스킹 홀) */
  registerFreePullTarget() {
    const btn = pickActionChild(this.actionContainer?.list, FREE_PULL_ACTION_INDEX);
    if (!btn) return;
    TutorialTargetRegistry.register('gacha.button.multi_ticket', btn, this.scene?.scene?.key);
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

  // ----------------------------------------------------------------
  // 온보딩 모드 (T-05)
  // ----------------------------------------------------------------

  /** 온보딩 화면: 탭/단발/장비 숨김, 확률 고지 상시 노출, 첫 무료 10연 버튼만 */
  buildOnboardingContent() {
    const b = this.contentBounds;

    this.addText(b.centerX, b.top + s(30), '동료를 불러오세요', ts('title', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5);

    this.addText(b.centerX, b.top + s(62), '처음 한 번은 완전히 무료입니다', ts('label', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0.5);

    // 픽업 배너 — 무엇을 뽑는지 보여주지 않으면 무료 소환이 성의 없이 읽힌다
    const bannerH = s(300);
    const bannerY = b.top + s(104) + bannerH / 2;
    this.bannerPanel = new GachaBannerPanel(this.scene, {
      x: b.centerX,
      y: bannerY,
      w: b.width - s(8),
      h: bannerH,
      showStrip: false,
      showResources: false,
      bgKey: 'bg_main'
    });
    this.contentContainer.add(this.bannerPanel.container);

    const rows = collectLiveRateRows();
    const { endY } = renderRateTable(this.scene, this.contentContainer, {
      left: b.left + s(16),
      top: bannerY + bannerH / 2 + s(34),
      width: b.width - s(32),
      rows,
      lineHeight: s(26)
    });

    // 무료 10연 버튼은 액션 바(슬롯 4)로 옮겼다. 비용 표기만 콘텐츠에 남긴다.
    const noteY = Math.min(endY + s(34), b.bottom - s(20));
    this.addText(b.centerX, noteY, '에너지 0 · 젬 0 · 티켓 0 소모', ts('caption', {
      color: DESIGN.colors.text.muted
    })).setOrigin(0.5);
  }

  // ----------------------------------------------------------------
  // 일반 모드
  // ----------------------------------------------------------------

  /** 영웅/장비 탭. 히트 영역은 터치 하한(48 base)을 지킨다 */
  createTabButtons() {
    const band = this.layout.bands.tabs;
    const b = this.contentBounds;
    const y = s(band.centerY);
    const slots = computeButtonRow({
      width: toBase(b.width),
      margin: 0,
      gap: 10,
      ratio: [1, 1],
      y: band.y,
      h: band.h
    });

    const make = (slot, label, active) => {
      const cx = b.left + s(slot.centerX);
      const bg = this.scene.add.graphics();
      const text = this.scene.add.text(cx, y, label, ts('subtitle', {
        color: active ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary
      })).setOrigin(0.5);
      const hit = this.scene.add.rectangle(
        cx, y, s(slot.w), Math.max(s(band.h), s(DESIGN.touch.minTarget)), 0xffffff, 0
      ).setInteractive({ useHandCursor: true });

      this.contentContainer.add([bg, text, hit]);
      return { bg, text, hit, slot };
    };

    this.heroTabUI = make(slots[0], '영웅 소환', true);
    this.equipTabUI = make(slots[1], '장비 소환', false);

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

  /** @private 탭 표면. 활성 탭만 아래에 교단·브랜드색 언더라인이 붙는다 */
  _paintTabs() {
    const band = this.layout.bands.tabs;
    const b = this.contentBounds;
    const accent = this.bannerPanel ? this.bannerPanel.accentColor : DESIGN.colors.brand.primary;

    [
      { ui: this.heroTabUI, active: this.currentTab === 'hero' },
      { ui: this.equipTabUI, active: this.currentTab === 'equipment' }
    ].forEach(({ ui, active }) => {
      if (!ui) return;
      const x = b.left + s(ui.slot.x);
      const w = s(ui.slot.w);
      const top = s(band.y);
      const h = s(band.h);

      ui.bg.clear();
      ui.bg.fillStyle(DESIGN.colors.bg.secondary, active ? 0.92 : 0.45);
      ui.bg.fillRoundedRect(x, top, w, h, s(DESIGN.radius.md));
      if (active) {
        ui.bg.fillStyle(accent, 0.95);
        ui.bg.fillRect(x + s(12), top + h - s(3), w - s(24), s(3));
      }
      ui.text.setColor(active ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary);
      ui.text.setStyle({ fontStyle: active ? 'bold' : 'normal' });
    });
  }

  switchTab(tab) {
    this.currentTab = tab;
    this._paintTabs();

    // 천장은 영웅 소환에만 있다
    const showPity = tab === 'hero';
    [this.pityBar, this.pityText, this.pityLabel, this.pityInfoText].forEach((obj) => {
      if (obj && obj.setVisible) obj.setVisible(showPity);
    });
    if (this.equipNoteText) this.equipNoteText.setVisible(!showPity);
  }

  /** 배너 — 픽업 일러스트 + 전신 시트 + 배너 탭 스트립 + 재화 칩 */
  createBannerArea() {
    const band = this.layout.bands.banner;
    const b = this.contentBounds;

    this.bannerPanel = new GachaBannerPanel(this.scene, {
      x: b.centerX,
      y: s(band.centerY),
      w: b.width - s(8),
      h: s(band.h),
      bgKey: 'bg_main',
      onSelect: () => this._paintTabs()
    });
    this.contentContainer.add(this.bannerPanel.container);
    this._paintTabs();
  }

  /** 확률 고지 요약 — BLK-07. 수치는 GachaSystem SSOT 에서만 읽는다 */
  createRateSummary() {
    const band = this.layout.bands.rates;
    const b = this.contentBounds;

    const glass = GlassPanel.create(this.scene, {
      x: b.centerX, y: s(band.centerY), w: b.width - s(8), h: s(band.h),
      variant: GLASS_VARIANT.CARD,
      tint: this.bannerPanel ? this.bannerPanel.accentColor : DESIGN.colors.brand.primary
    });
    this.contentContainer.add(glass);

    const left = b.left + s(20);
    const right = b.right - s(20);

    this.contentContainer.add(this.scene.add.text(left, s(band.y + 24), '등급별 제공 확률', ts('label', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5));

    this.contentContainer.add(this.scene.add.text(right, s(band.y + 24), '상세 ▸', ts('label', {
      color: `#${DESIGN.colors.brand.primary.toString(16).padStart(6, '0')}`
    })).setOrigin(1, 0.5));

    // 등급 행만 뽑아 한 줄로 편다. 고정폭(num.md)이라 자릿수가 흔들리지 않는다
    const rarityRows = collectLiveRateRows().filter((row) => row.type === 'rarity');
    const usable = (right - left);
    rarityRows.forEach((row, index) => {
      const x = left + (usable * (index + 0.5)) / Math.max(1, rarityRows.length);
      const color = RARITY[row.grade]?.color ?? COLORS.text;
      this.contentContainer.add(this.scene.add.text(x, s(band.y + 56), row.grade, ts('caption', {
        color: `#${color.toString(16).padStart(6, '0')}`, fontStyle: 'bold'
      })).setOrigin(0.5));
      this.contentContainer.add(this.scene.add.text(x, s(band.y + 80), `${row.ratePercent}%`, ts('num.md', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0.5));
    });
  }

  /** 천장 — GachaSystem.getPityInfo() SSOT */
  createPityDisplay() {
    const band = this.layout.bands.pity;
    const b = this.contentBounds;
    const info = GachaSystem.getPityInfo();

    const glass = GlassPanel.create(this.scene, {
      x: b.centerX, y: s(band.centerY), w: b.width - s(8), h: s(band.h),
      variant: GLASS_VARIANT.CARD,
      tint: DESIGN.colors.brand.accent
    });
    this.contentContainer.add(glass);

    const left = b.left + s(20);
    const barLeft = left;
    const barW = b.width - s(48);
    const barY = s(band.y + band.h - 20);

    this.pityLabel = this.scene.add.text(left, s(band.y + 22), '천장 카운터', ts('label', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5);

    this.pityText = this.scene.add.text(b.right - s(20), s(band.y + 22),
      `${info.current} / ${info.threshold}`, ts('num.md', {
        color: DESIGN.colors.text.primary
      })).setOrigin(1, 0.5);

    const track = this.scene.add.graphics();
    track.fillStyle(DESIGN.colors.bg.surface, 1);
    track.fillRoundedRect(barLeft, barY - s(7), barW, s(14), s(7));
    // 카운터가 0 일 때도 트랙이 보여야 "차오르는 자리" 라는 게 읽힌다
    track.lineStyle(s(1), DESIGN.colors.brand.accent, 0.3);
    track.strokeRoundedRect(barLeft, barY - s(7), barW, s(14), s(7));

    this.pityFillLeft = barLeft;
    this.pityFillMax = barW;
    this.pityBar = this.scene.add.graphics();
    this._paintPityBar(info.current / info.threshold);

    this.pityInfoText = this.scene.add.text(b.centerX, s(band.y + 22),
      `${info.threshold}회 소환 시 SSR 확정`, ts('caption', {
        color: `#${DESIGN.colors.brand.accent.toString(16).padStart(6, '0')}`
      })).setOrigin(0.5);

    this.contentContainer.add([this.pityLabel, this.pityText, track, this.pityBar, this.pityInfoText]);
  }

  /** @private */
  _paintPityBar(ratio) {
    if (!this.pityBar) return;
    const band = this.layout.bands.pity;
    const barY = s(band.y + band.h - 20);
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    this.pityBar.clear();
    if (clamped <= 0) return;
    this.pityBar.fillStyle(DESIGN.colors.brand.accent, 1);
    this.pityBar.fillRoundedRect(this.pityFillLeft, barY - s(7), this.pityFillMax * clamped, s(14), s(7));
  }

  /** 젬 2버튼(2:3) + 티켓 2버튼. 텍스트를 덮지 않도록 밴드가 분리돼 있다 */
  createSummonButtons() {
    const b = this.contentBounds;
    const gems = this.layout.bands.gems;
    const tickets = this.layout.bands.tickets;
    const width = toBase(b.width);
    const resources = SaveManager.getResources();

    const gemSlots = computeButtonRow({ width, margin: 4, gap: 12, ratio: [2, 3], y: gems.y, h: gems.h });
    this._summonButton({
      slot: gemSlots[0], band: gems, variant: 'btn_secondary',
      tint: DESIGN.colors.brand.secondary,
      label: '단일 소환', sub: `${GachaSystem.SINGLE_COST.toLocaleString()} 젬`,
      onClick: () => this.performSummon(1, false)
    });
    this._summonButton({
      slot: gemSlots[1], band: gems, variant: 'btn_primary',
      tint: DESIGN.colors.brand.primary,
      label: '10연차', sub: `${GachaSystem.MULTI_COST.toLocaleString()} 젬 · SR 이상 확정`,
      onClick: () => this.performSummon(10, false)
    });

    const ticketSlots = computeButtonRow({ width, margin: 4, gap: 12, ratio: [2, 3], y: tickets.y, h: tickets.h });
    this.ticketSingleLabel = this._summonButton({
      slot: ticketSlots[0], band: tickets, variant: 'btn_ghost',
      tint: DESIGN.colors.brand.primary,
      label: '티켓 ×1', sub: `보유 ${resources.summonTickets || 0}장`,
      onClick: () => this.performSummon(1, true)
    });
    this.ticketMultiLabel = this._summonButton({
      slot: ticketSlots[1], band: tickets, variant: 'btn_ghost',
      tint: DESIGN.colors.brand.primary,
      label: '티켓 ×10', sub: `보유 ${resources.summonTickets || 0}장`,
      onClick: () => this.performSummon(10, true)
    });

    // 장비 탭 안내 — 탭 전환 시에만 보인다
    this.equipNoteText = this.scene.add.text(b.centerX, s(gems.y - 10),
      '장비 소환은 소환 화면에서 이용할 수 있습니다', ts('caption', {
        color: DESIGN.colors.text.muted
      })).setOrigin(0.5).setVisible(false);
    this.contentContainer.add(this.equipNoteText);
  }

  /**
   * @private 9-slice 소환 버튼 1개.
   * @returns {Phaser.GameObjects.Text} 보조 라벨 (보유 수량 갱신용)
   */
  _summonButton({ slot, band, variant, tint, label, sub, onClick }) {
    const b = this.contentBounds;
    const cx = b.left + s(slot.centerX);
    const cy = s(band.centerY);
    const w = s(slot.w);
    const h = s(band.h);

    // 밝은 btn_primary 판 위라 라벨 캡슐 없이는 두 줄 다 묻힌다. UIButton 이 캡슐을 건다
    const button = UIButton.createParts(this.scene, {
      x: cx, y: cy, w, h,
      label,
      sub,
      variant,
      tint,
      token: 'subtitle',
      subToken: 'caption',
      onClick
    });

    this.contentContainer.add(button.objects);
    return button.sub;
  }

  /**
   * 확률 고지 법정 문구 — 상시 노출 (BLK-07).
   * 상세 보기 버튼은 액션 바(슬롯 4)로 올라갔고, 이 자리에는 근거 문구만 남는다.
   */
  createLegalNote() {
    const band = this.layout.bands.info;
    const b = this.contentBounds;
    const note = this.scene.add.text(b.centerX, s(band.centerY),
      '확률 표시는 게임물관리위원회 확률형 아이템 표시 기준을 따릅니다', ts('caption', {
        color: DESIGN.colors.text.muted
      })).setOrigin(0.5);
    this.contentContainer.add(note);
  }

  openRateDisclosure() {
    if (this._ratePanel) return;
    this._ratePanel = new RateDisclosurePanel(this.scene, {
      bannerId: this.bannerPanel ? this.bannerPanel.selectedId : null,
      onClose: () => { this._ratePanel = null; }
    });
    this._ratePanel.show();
    if (this._ratePanel.container) {
      this._ratePanel.container.setDepth(Z_INDEX.POPUP_NESTED);
    }
  }

  // ================================================================
  // 소환 실행
  // ================================================================

  performSummon(count, useTickets) {
    if (this.isAnimating) return;

    // 장비 탭은 별개 SSOT(GachaSystem.pullEquipment)로 라우팅한다 —
    // 과거엔 탭과 무관하게 항상 영웅 풀로 나갔다(파일 상단 "알려진 제약" 참고, 이번에 해소됨).
    if (this.currentTab === 'equipment') {
      this.performEquipmentSummon(count, useTickets);
      return;
    }

    const paymentType = useTickets ? 'tickets' : 'gems';

    if (!GachaSystem.canPull(count, paymentType)) {
      const message = useTickets ? '소환권이 부족합니다!' : '보석이 부족합니다!';
      this.showToast(message, COLORS.danger);
      return;
    }

    this.isAnimating = true;
    const bannerId = this.bannerPanel ? this.bannerPanel.selectedId : null;
    const result = GachaSystem.pull(count, paymentType, { bannerId });
    this._handlePullResult(result, () => this.performSummon(count, useTickets));
  }

  /** 장비 소환 — GachaSystem.pullEquipment() SSOT. 천장 UI 갱신은 필요 없다(장비엔 천장 없음) */
  performEquipmentSummon(count, useTickets) {
    this.isAnimating = true;
    const paymentType = useTickets ? 'tickets' : 'gems';
    const result = GachaSystem.pullEquipment(count, paymentType);

    if (!result.success) {
      this.showToast(result.error, COLORS.danger);
      this.isAnimating = false;
      return;
    }

    this.refreshResourceUI();
    const results = result.results.map((r) => ({
      id: r.equipmentId,
      type: 'equipment',
      name: r.name,
      rarity: r.rarity,
      slotType: r.slotType,
      slotIcon: r.slotIcon,
      stats: r.stats,
      isNew: true
    }));
    this.showSummonAnimation(results, () => this.performEquipmentSummon(count, useTickets));
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

    // 온보딩엔 배너 선택 UI가 없다(showStrip:false) — 유저가 배너를 고른 적이 없으므로
    // 표준 배너(픽업 없음)로 고정한다. bannerPanel.selectedId를 그대로 넘기면 온보딩
    // 배너 패널이 기본 선택한 활성 픽업 배너로 라우팅돼 T-05 무료 10연 결과가 달라진다.
    this.isAnimating = true;
    const result = GachaSystem.pull(10, 'gems', { skipEnergyCheck: true, bannerId: 'standard' });
    this._handlePullResult(result, null);
  }

  /** performSummon / performFreeTenPull 공용 결과 처리 (중복 제거) */
  _handlePullResult(result, onPullAgain) {
    if (!result.success) {
      this.showToast(result.error, COLORS.danger);
      this.isAnimating = false;
      return;
    }

    this.refreshResourceUI();
    this.updatePityUI(result.pityInfo);

    const results = result.results.map((r) => {
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

    this.showSummonAnimation(results, onPullAgain);
  }

  /** 재화 표시 갱신 — 배너 칩과 티켓 버튼의 보유 수량 */
  refreshResourceUI() {
    const resources = SaveManager.getResources();
    this.applySummary();
    if (this.bannerPanel) this.bannerPanel.refreshResources();
    const label = `보유 ${resources.summonTickets || 0}장`;
    if (this.ticketSingleLabel) this.ticketSingleLabel.setText(label);
    if (this.ticketMultiLabel) this.ticketMultiLabel.setText(label);
  }

  updatePityUI(pityInfo) {
    if (!pityInfo) return;
    if (this.pityText) this.pityText.setText(`${pityInfo.current} / ${pityInfo.threshold}`);
    this._paintPityBar(pityInfo.current / pityInfo.threshold);
  }

  /**
   * 결과 연출 (T-14 GachaResultOverlay).
   * 오버레이는 씬 루트의 전면 레이어이므로 반드시 인스턴스에 보관하고 destroy() 에서 정리한다.
   * 남으면 depth 3010 오버레이가 모든 입력을 삼킨다.
   */
  showSummonAnimation(results, onPullAgain = null) {
    this._clearSummonOverlay();

    this.resultOverlay = new GachaResultOverlay(this.scene, {
      onPullAgain: onPullAgain && !this.onboarding ? onPullAgain : null,
      onClose: () => {
        this.resultOverlay = null;
        this.isAnimating = false;
      }
    });
    this.resultOverlay.show(results);
  }

  /** 결과 연출 잔여물 정리 — 남으면 전면 오버레이가 모든 입력을 삼킨다 */
  _clearSummonOverlay() {
    if (this.resultOverlay) {
      const overlay = this.resultOverlay;
      this.resultOverlay = null;
      overlay.destroy();
    }
    this.isAnimating = false;
  }

  /**
   * 팝업이 닫힐 때 결과 연출을 어떻게 할 것인가.
   *
   * 튜토리얼 T-05 는 무료 10연이 세이브에 기록되는 즉시 스텝을 커밋하고,
   * `TutorialFlow._releaseLockedPopup()` 이 약 1초 안에 이 팝업을 닫는다.
   * 그때 결과 연출까지 같이 부수면 유저는 자기가 무엇을 뽑았는지 못 본다
   * (온보딩 e2e 의 `[T-05] 소환 결과 [확인] 탭으로 연출 종료` 가 이 지점을 잡는다).
   *
   * 그래서 **연출이 아직 살아 있으면 파괴하지 않고 소유권만 놓는다**.
   * 고아가 되어 입력을 영구히 삼키던 과거의 결함은 오버레이 쪽에서 세 겹으로 막는다.
   *   1. [확인] 버튼이 시작과 동시에 존재한다 (카드 공개 후 활성)
   *   2. 스크림 탭·[건너뛰기] 가 1단계부터 항상 살아 있다
   *   3. 오버레이가 씬의 shutdown/destroy 에 스스로를 걸어 둔다
   */
  _detachSummonOverlay() {
    const overlay = this.resultOverlay;
    this.resultOverlay = null;
    this.isAnimating = false;
    if (!overlay || overlay.destroyed) return;
    overlay.onClose = null;   // 파괴된 팝업의 콜백을 다시 부르지 않는다
    // 소유권을 놓는 순간부터 씬만이 이 오버레이를 회수할 수 있다.
    // 고리가 끊겨 있으면(이미 한 번 소비된 경우 등) 여기서 다시 건다 (QA P1-3).
    overlay.ensureSceneCleanup?.();
  }

  destroy() {
    this._detachSummonOverlay();
    if (this.bannerPanel) {
      this.bannerPanel.destroy();
      this.bannerPanel = null;
    }
    super.destroy();
  }

  showToast(text, color = COLORS.text) {
    const toast = this.scene.add.text(GAME_WIDTH / 2, s(1400), text, {
      fontSize: sf(18),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: `#${color.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${DESIGN.colors.bg.secondary.toString(16).padStart(6, '0')}`,
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
