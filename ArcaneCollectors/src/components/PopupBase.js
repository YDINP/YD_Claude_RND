/**
 * PopupBase.js — 팝업 공통 골격 (REDESIGN_PLAN §3-6, T-20)
 *
 * 4슬롯 구조다. 위에서 아래로 헤더 / 요약(선택) / 콘텐츠 / 액션바(선택).
 * 좌표 계산은 전부 `utils/popupLayout.js` 의 순수 함수가 한다. 이 파일은 Phaser 렌더만 맡는다.
 *
 * ## 하위 호환
 * 기본 규격은 `LEGACY_SLOT` 이다. 즉 `layoutSpec` 을 넘기지 않는 기존 팝업 15개는
 * 리디자인 이전과 **같은 contentBounds** 를 받는다.
 * 예외는 `width` 1px 뿐이다. 이전 코드는 `left+s(15)` / `right-s(15)` 로 46px 를 깎아 놓고
 * `width` 만 `panelWidth - s(30)` = 45px 로 계산해 스스로 어긋나 있었다. 지금은 일치시킨다.
 * T-22 에서 각 팝업이 `layoutSpec: 'redesign'` 을 넘기며 §3-6 규격(헤더 88 / 요약 112 /
 * 액션바 88 / 좌우 여백 24)으로 옮겨간다.
 *
 * ## 수정된 결함
 * - 타이틀이 `container.add(container.last)` 로 잘못 추가돼 컨테이너 밖에 남았다.
 *   depth 0 인 씬 루트에 그려져 depth 2000 오버레이 뒤로 숨었다. 이제 헤더 슬롯에 들어간다.
 * - `contentBounds` 에 `centerY` 가 없어 `b.centerY` 를 쓰면 NaN 이 됐다. 이제 있다.
 */
import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import { DESIGN } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import navigationManager from '../systems/NavigationManager.js';
import { soundManager } from '../systems/SoundManager.js';
import { GlassPanel, GLASS_VARIANT } from './GlassPanel.js';
import { NineSliceFrame } from './NineSliceFrame.js';
import { UIButton } from './UIButton.js';
import {
  POPUP_SLOT,
  LEGACY_SLOT,
  computePopupSlots,
  computeActionSlots,
  computeSummaryColumns,
  normalizeActions,
  normalizeSummary,
  resolveActionStyle
} from '../utils/popupLayout.js';

/** 팝업 컨테이너 depth. 씬 UI 위, 토스트 아래 */
const POPUP_DEPTH = 2000;

/** 스크림 기본 불투명도. 중첩 팝업은 options.overlayAlpha 로 더 올린다 */
const OVERLAY_ALPHA = 0.85;

/** 패널 프레임 9-slice 텍스처 키. 없으면 Graphics 폴백 */
const PANEL_FRAME_KEY = 'frame_popup';

/** 패널 채움색. 9-slice 프레임은 가운데가 비어 있어 이 겹을 항상 아래에 깐다 */
const PANEL_FILL = 0x0F172A;
const PANEL_FILL_ALPHA = 0.98;

/** 입장 200ms / 퇴장 150ms. 퇴장 트윈 미완료 대비 강제 파괴는 400ms */
const SHOW_DURATION = 200;
const HIDE_DURATION = 150;
const HIDE_FAILSAFE_DELAY = 400;

/**
 * 액션 버튼 강조 등급 → 폴백 틴트.
 * 함수 안에서 DESIGN 을 읽는다(모듈 스코프 평가 금지 — 순환 import TDZ 방지).
 */
function actionTint(emphasis) {
  const c = DESIGN.colors;
  if (emphasis === 'high') return c.brand.primary;
  if (emphasis === 'medium') return c.brand.secondary;
  return c.text.secondary ? Phaser.Display.Color.HexStringToColor(c.text.secondary).color : c.brand.primary;
}

export class PopupBase {
  /**
   * @param {Phaser.Scene} scene
   * @param {Object} [options]
   * @param {string} [options.title] - 헤더 타이틀. §3-6 상 필수지만 빈 문자열도 허용한다
   * @param {number} [options.width] - 패널 너비 (렌더 px)
   * @param {number} [options.height] - 패널 높이 (렌더 px)
   * @param {Function} [options.onClose] - 파괴 후 콜백
   * @param {string} [options.layoutSpec] - 'legacy'(기본) | 'redesign'
   * @param {number} [options.accentColor] - 헤더 언더라인·아웃라인 색. 기본 brand.primary
   * @param {string|Array} [options.summary] - 요약 슬롯 내용. 있으면 슬롯이 생긴다
   * @param {Array} [options.actions] - 액션 바 버튼 목록 [{label,onClick,variant,disabled}]
   * @param {boolean} [options.closeOnOverlay] - 오버레이 탭으로 닫기. 기본 true
   * @param {number} [options.depth] - 컨테이너 depth. 기본 POPUP_DEPTH(2000).
   *   중첩 팝업은 Z_INDEX.POPUP_NESTED(2100)를 넘긴다
   * @param {number} [options.overlayAlpha] - 스크림 불투명도. 기본 OVERLAY_ALPHA(0.85).
   *   중첩 팝업은 하위 팝업 헤더가 비쳐 읽히지 않도록 더 올린다 (QA P1-4)
   * @param {number} [options.offsetY] - 패널을 화면 중앙에서 아래로 미는 양 (렌더 px)
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.title = options.title || '';
    this.panelWidth = options.width || s(680);
    this.panelHeight = options.height || s(1100);
    this.container = null;
    this.contentContainer = null;
    this.isOpen = false;
    this.onCloseCallback = options.onClose || null;

    // --- T-20 추가 ---
    this.options = options;
    this.layoutSpec = options.layoutSpec === 'redesign' ? 'redesign' : 'legacy';
    this.accentColor = typeof options.accentColor === 'number' ? options.accentColor : null;
    this.closeOnOverlay = options.closeOnOverlay !== false;
    this.depth = Number.isFinite(options.depth) ? options.depth : POPUP_DEPTH;
    this.overlayAlpha = Number.isFinite(options.overlayAlpha) ? options.overlayAlpha : OVERLAY_ALPHA;
    this.panelOffsetY = Number.isFinite(options.offsetY) ? options.offsetY : 0;
    this.summaryItems = normalizeSummary(options.summary);
    this.actions = normalizeActions(options.actions);

    /** 슬롯 컨테이너. show() 에서 채워진다 */
    this.headerContainer = null;
    this.summaryContainer = null;
    this.actionContainer = null;
    this.titleText = null;
    this.slots = null;
  }

  // ================================================================
  // 레이아웃
  // ================================================================

  /** 현재 규격 상수 (기획 px) */
  get slotSpec() {
    return this.layoutSpec === 'redesign' ? POPUP_SLOT : LEGACY_SLOT;
  }

  /** 헤더 언더라인·아웃라인 색 */
  get accent() {
    return this.accentColor === null ? DESIGN.colors.brand.primary : this.accentColor;
  }

  /**
   * 슬롯과 `contentBounds` 를 다시 계산한다.
   * 요약/액션바 유무가 바뀔 때마다 호출된다.
   * @returns {Object} 갱신된 contentBounds
   */
  recomputeLayout() {
    const spec = this.slotSpec;
    const hasSummary = this.summaryItems.length > 0;
    const hasActions = this.actions.length > 0;

    this.slots = computePopupSlots({
      screenWidth: GAME_WIDTH,
      screenHeight: GAME_HEIGHT,
      width: this.panelWidth,
      height: this.panelHeight,
      headerHeight: s(spec.headerHeight),
      summaryHeight: hasSummary ? s(spec.summaryHeight || POPUP_SLOT.summaryHeight) : 0,
      actionBarHeight: hasActions ? s(spec.actionBarHeight || POPUP_SLOT.actionBarHeight) : 0,
      padX: s(spec.padX),
      padBottom: s(spec.padBottom),
      dividerLift: s(spec.dividerLift),
      dividerInset: s(spec.dividerInset === undefined ? spec.padX : spec.dividerInset),
      underline: s(spec.underline),
      closeInsetX: s(spec.closeInsetX),
      closeInsetY: s(spec.closeInsetY),
      closeHit: s(spec.closeHit),
      titleAlign: spec.titleAlign,
      titlePadX: s(spec.titlePadX),
      titleOffsetY: spec.titleOffsetY === undefined ? undefined : s(spec.titleOffsetY),
      offsetY: this.panelOffsetY
    });

    this.contentBounds = { ...this.slots.content };
    return this.contentBounds;
  }

  /**
   * 콘텐츠 슬롯 경계를 돌려준다 (§3-6 4슬롯 API).
   * `contentBounds` 프로퍼티와 같은 값이다.
   * @returns {{left:number,top:number,right:number,bottom:number,
   *            width:number,height:number,centerX:number,centerY:number}}
   */
  getContentBounds() {
    if (!this.contentBounds) this.recomputeLayout();
    return this.contentBounds;
  }

  // ================================================================
  // 표시 / 파괴
  // ================================================================

  show() {
    if (this.isOpen) return;
    this.isOpen = true;

    // SND-02: 팝업 열림 효과음 (모든 팝업 공통 지점)
    soundManager.playSFX('ui_open');

    this.container = this.scene.add.container(0, 0).setDepth(this.depth);

    this.recomputeLayout();
    const { panel } = this.slots;

    // 1. 오버레이 (scrim)
    const overlay = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x000000, this.overlayAlpha
    );
    overlay.setInteractive();
    overlay.on('pointerdown', () => {
      if (this.closeOnOverlay) this.hide();
    });
    this.container.add(overlay);
    this.overlay = overlay;

    // 2. 패널 표면 + 프레임
    this.container.add(this.createPanelSurface(panel));

    // 3. 패널 블로커 — 패널을 눌렀을 때 오버레이 닫힘을 막는다
    const blocker = this.scene.add.rectangle(panel.centerX, panel.centerY, panel.width, panel.height)
      .setAlpha(0.001).setInteractive();
    this.container.add(blocker);

    // 4. 콘텐츠 슬롯 — 헤더/요약/액션바보다 먼저 넣어 항상 그 아래에 그려지게 한다
    this.contentContainer = this.scene.add.container(0, 0);
    this.container.add(this.contentContainer);

    // 5. 헤더 / 요약 / 액션바 슬롯
    this.headerContainer = this.scene.add.container(0, 0);
    this.summaryContainer = this.scene.add.container(0, 0);
    this.actionContainer = this.scene.add.container(0, 0);
    this.container.add([this.headerContainer, this.summaryContainer, this.actionContainer]);

    this.buildHeader();
    this.buildSummary();
    this.buildActions();

    // 6. 서브클래스 콘텐츠
    this.buildContent();

    navigationManager.pushPopup(this.constructor.name, this);

    this.container.setAlpha(0);
    this.scene.tweens.add({
      targets: this.container,
      alpha: 1,
      duration: SHOW_DURATION,
      ease: 'Power2'
    });
  }

  /** show() 별칭. 일부 팝업이 open() 을 쓴다 */
  open() {
    this.show();
  }

  /** hide() 별칭 */
  close() {
    this.hide();
  }

  buildContent() {
    // Override in subclasses
  }

  hide() {
    if (!this.isOpen) return;

    // SND-02: 팝업 닫힘 효과음 (모든 팝업 공통 지점)
    soundManager.playSFX('ui_close');

    navigationManager.popPopup();
    this.isOpen = false; // 즉시 플래그 해제 → 중복 호출 방지

    if (!this.container || !this.scene?.tweens) {
      this.destroy();
      return;
    }

    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: HIDE_DURATION,
      ease: 'Power2',
      onComplete: () => {
        this.destroy();
      }
    });

    // 안전장치: 트윈이 어떤 이유로든 완료되지 않아도 반드시 파괴한다.
    // 남으면 오버레이(2160x3840)와 패널 블로커가 인터랙티브 상태로 화면 전체 입력을 삼킨다.
    this.scene.time?.delayedCall?.(HIDE_FAILSAFE_DELAY, () => {
      if (this.container) {
        console.warn('[PopupBase] hide 트윈 미완료 — 강제 파괴');
        this.destroy();
      }
    });
  }

  destroy() {
    this.isOpen = false;
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }
    this.contentContainer = null;
    this.headerContainer = null;
    this.summaryContainer = null;
    this.actionContainer = null;
    this.titleText = null;
    if (this.onCloseCallback) this.onCloseCallback();
  }

  // ================================================================
  // 슬롯 1 — 헤더
  // ================================================================

  /**
   * 패널 표면을 만든다. 아래에서 위로 두 겹이다.
   *
   *   1. 불투명 채움 — 리디자인 이전과 같은 `#0F172A` α0.98 라운드 사각형.
   *      `frame_popup` 9-slice 는 가운데가 비어 있어 이 겹이 없으면 뒤 화면이 그대로 비친다.
   *      팝업 본문 판독성이 걸린 문제라 텍스처 유무와 무관하게 항상 깐다.
   *   2. 테두리 — 텍스처가 있으면 `frame_popup` 9-slice, 없으면 시안 스트로크.
   *
   * @param {Object} panel - 패널 경계
   * @returns {Array<Phaser.GameObjects.GameObject>} 아래→위 순서
   * @private
   */
  createPanelSurface(panel) {
    const radius = s(16);
    const fill = this.scene.add.graphics();
    fill.fillStyle(PANEL_FILL, PANEL_FILL_ALPHA);
    fill.fillRoundedRect(panel.left, panel.top, panel.width, panel.height, radius);

    if (!NineSliceFrame.shouldFallback(this.scene, PANEL_FRAME_KEY)) {
      return [fill, NineSliceFrame.create(this.scene, {
        x: panel.centerX, y: panel.centerY,
        w: panel.width, h: panel.height,
        key: PANEL_FRAME_KEY
      })];
    }

    fill.lineStyle(s(2), COLORS.primary, 0.5);
    fill.strokeRoundedRect(panel.left, panel.top, panel.width, panel.height, radius);
    return [fill];
  }

  /**
   * 헤더 슬롯을 그린다. 글래스 밴드 + 타이틀 + 닫기 ✕ + 구분선/언더라인.
   * 타이틀은 반드시 `headerContainer` 안에 들어간다(오버레이 뒤로 숨는 결함의 원인).
   */
  buildHeader() {
    if (!this.headerContainer) return;
    this.headerContainer.removeAll(true);

    const { header, divider, close } = this.slots;

    // 글래스 밴드 (GlassPanel HUD 변형)
    const band = GlassPanel.create(this.scene, {
      x: header.centerX,
      y: header.centerY,
      w: header.width,
      h: header.height,
      variant: GLASS_VARIANT.HUD,
      tint: this.accent
    });
    this.headerContainer.add(band);

    // 타이틀 — §3-6 상 필수 슬롯.
    // 문서는 display.lg 를 지정하지만 그 역할은 Orbitron 이고 팝업 제목은 전부 한글이다.
    // 한글이 serif 로 폴백해 헤더만 서체가 튄다. 그래서 body 역할의 title(24/700)을 쓴다.
    // 이 값은 리디자인 이전 하드코딩(sf(24) bold Noto Sans KR)과 정확히 같다.
    const titleSpec = header.title;
    this.titleText = this.scene.add.text(titleSpec.x, titleSpec.y, this.title, ts('title', {
      color: DESIGN.colors.text.primary
    })).setOrigin(titleSpec.originX, titleSpec.originY);
    this.headerContainer.add(this.titleText);

    // 구분선 + 교단·기능색 언더라인
    const line = this.scene.add.graphics();
    if (divider.underline > 0) {
      line.fillStyle(this.accent, 0.9);
      line.fillRect(header.left, divider.y - divider.underline, header.width, divider.underline);
    } else {
      line.lineStyle(s(1), COLORS.primary, 0.3);
      line.lineBetween(divider.left, divider.y, divider.right, divider.y);
    }
    this.headerContainer.add(line);

    // 닫기 ✕ — 히트 영역을 터치 하한까지 넓힌다
    const closeBtn = this.scene.add.text(close.x, close.y, '✕', {
      fontSize: sf(24), color: DESIGN.colors.text.secondary
    }).setOrigin(0.5);
    const hit = Math.max(close.hit, s(DESIGN.touch.minTarget));
    closeBtn.setInteractive(
      new Phaser.Geom.Rectangle(
        closeBtn.width / 2 - hit / 2, closeBtn.height / 2 - hit / 2, hit, hit
      ),
      Phaser.Geom.Rectangle.Contains
    );
    closeBtn.input.cursor = 'pointer';
    closeBtn.on('pointerdown', () => this.hide());
    this.headerContainer.add(closeBtn);
    this.closeBtn = closeBtn;
  }

  /**
   * 타이틀을 바꾼다 (§3-6 4슬롯 API). show() 전후 어느 쪽에서도 안전하다.
   * @param {string} title
   * @returns {PopupBase} this
   */
  setTitle(title) {
    this.title = typeof title === 'string' ? title : '';
    if (this.titleText && this.titleText.setText) this.titleText.setText(this.title);
    return this;
  }

  // ================================================================
  // 슬롯 2 — 요약
  // ================================================================

  /**
   * 요약 슬롯 내용을 정한다 (§3-6 4슬롯 API).
   * 콘텐츠 높이가 줄어들므로 **buildContent() 시작 지점이나 생성자 옵션에서** 부르는 게 안전하다.
   *
   * @param {string|Array<{label?:string,value?:string|number}>|null} content
   * @returns {PopupBase} this
   */
  setSummary(content) {
    this.summaryItems = normalizeSummary(content);
    this.recomputeLayout();
    this.buildSummary();
    return this;
  }

  /** 요약 슬롯을 그린다 */
  buildSummary() {
    if (!this.summaryContainer) return;
    this.summaryContainer.removeAll(true);
    if (!this.slots.summary || this.summaryItems.length === 0) return;

    const rect = this.slots.summary;
    const spec = this.slotSpec;

    const band = GlassPanel.create(this.scene, {
      x: rect.centerX, y: rect.centerY, w: rect.width, h: rect.height,
      variant: GLASS_VARIANT.CARD,
      tint: this.accent
    });
    this.summaryContainer.add(band);

    const columns = computeSummaryColumns(this.summaryItems.length, rect, { padX: s(spec.padX) });
    columns.forEach((col, index) => {
      const item = this.summaryItems[index];
      const hasLabel = item.label.length > 0;
      const valueY = hasLabel ? col.centerY + s(12) : col.centerY;

      if (hasLabel) {
        const label = this.scene.add.text(col.centerX, col.centerY - s(16), item.label, ts('caption', {
          color: DESIGN.colors.text.secondary
        })).setOrigin(0.5);
        this.summaryContainer.add(label);
      }

      const value = this.scene.add.text(col.centerX, valueY, item.value, ts('subtitle', {
        color: DESIGN.colors.text.primary
      })).setOrigin(0.5);
      this.summaryContainer.add(value);
    });
  }

  // ================================================================
  // 슬롯 4 — 액션 바
  // ================================================================

  /**
   * 액션 바 버튼을 정한다 (§3-6 4슬롯 API).
   * 콘텐츠 높이가 액션 바만큼 줄어드므로 **buildContent() 시작 지점이나 생성자 옵션에서**
   * 부르는 게 안전하다.
   *
   * @param {Array<{label:string,onClick?:Function,variant?:string,disabled?:boolean}>} actions
   *        variant 는 'primary' | 'secondary' | 'ghost'. 최대 4개
   * @returns {PopupBase} this
   */
  setActions(actions) {
    this.actions = normalizeActions(actions);
    this.recomputeLayout();
    this.buildActions();
    return this;
  }

  /** 액션 바를 그린다 */
  buildActions() {
    if (!this.actionContainer) return;
    this.actionContainer.removeAll(true);
    if (!this.slots.actions || this.actions.length === 0) return;

    const rect = this.slots.actions;
    const spec = this.slotSpec;
    const slots = computeActionSlots(this.actions.length, rect, {
      gap: s(spec.actionGap),
      padX: s(spec.actionPadX),
      height: s(spec.actionHeight)
    });

    slots.forEach((slot, index) => {
      const action = this.actions[index];
      const style = resolveActionStyle(action.variant);
      const tint = actionTint(style.emphasis);

      // UIButton 이 라벨 캡슐·외곽선·터치 하한을 함께 처리한다.
      // 자식은 반드시 [frame, label, hit] 3개여야 한다 — popupLayout 의
      // ACTION_CHILDREN_PER_SLOT 계약을 튜토리얼 타깃 조회가 그대로 쓴다.
      const button = UIButton.createParts(this.scene, {
        x: slot.centerX, y: slot.centerY, w: slot.w, h: slot.h,
        label: action.label,
        variant: style.variant,
        token: 'label',
        tint,
        disabled: action.disabled,
        sound: true,
        onClick: () => { if (action.onClick) action.onClick(this); }
      });

      this.actionContainer.add([button.frame, button.label, button.hit]);
    });
  }

  // ================================================================
  // 콘텐츠 헬퍼 (기존 API — 시그니처 불변)
  // ================================================================

  /** Helper: add text to content */
  addText(x, y, text, style = {}) {
    const t = this.scene.add.text(x, y, text, {
      fontSize: sf(16),
      fontFamily: '"Noto Sans KR", sans-serif',
      color: '#FFFFFF',
      ...style
    });
    this.contentContainer.add(t);
    return t;
  }

  /** Helper: add button */
  addButton(x, y, width, height, label, color, callback) {
    const bg = this.scene.add.rectangle(x, y, width, height, color, 1);
    bg.setStrokeStyle(s(1), 0xFFFFFF, 0.2);
    bg.setInteractive({ useHandCursor: true });

    const text = this.scene.add.text(x, y, label, {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: '#FFFFFF'
    }).setOrigin(0.5);

    bg.on('pointerdown', (...args) => {
      // SND-02: 팝업 내부 버튼 공통 클릭음
      soundManager.playSFX('button_click');
      if (callback) callback(...args);
    });
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));

    this.contentContainer.add([bg, text]);
    return { bg, text };
  }
}

export default PopupBase;
