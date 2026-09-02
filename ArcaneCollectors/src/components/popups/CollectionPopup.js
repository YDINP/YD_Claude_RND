import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { CollectionSystem } from '../../systems/CollectionSystem.js';
import cultsData from '../../data/cults.json';
import { DESIGN, hexToCSS } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';

/**
 * CollectionPopup - 컬렉션 도감 (COLL-01)
 *
 * 기본영웅 10명 × 진화 루트 24개의 수집 현황을 보여준다.
 * - 상단: 계정 전체 진행도 + 세계수의 씨앗 보유량 + 계정 완성 보너스
 * - 목록: 기본영웅별 루트 칩(획득/미획득), 티어 배지, 칭호, 완성 보너스
 *
 * 설계 근거: docs/COLLECTION_DESIGN_NOTE.md §1(S-1) / §2(C-4)
 */

/**
 * 티어별 표시 색상.
 * gameConfig.js는 최상단에서 씬들을 import하므로 COLORS 선언보다 씬 그래프가 먼저 평가된다.
 * 따라서 이 파일의 모듈 스코프에서는 COLORS를 참조하지 않고 리터럴만 둔다(TDZ 방지).
 */
const TIER_COLORS = {
  0: DESIGN.colors.bg.surface,
  1: 0x6366F1,
  2: 0xF59E0B,
};

/**
 * 등급별 칩 색상 — 호출 시점에 COLORS를 읽는다(모듈 초기화 시점 평가 금지).
 * @param {string} rarity 'SSR' | 'SR' | 'R'
 * @returns {number} 색상값
 */
function getRarityColor(rarity) {
  const table = {
    SSR: COLORS.raritySSR,
    SR: COLORS.raritySR,
    R: COLORS.rarityR,
  };
  return table[rarity] || COLORS.primary;
}

/** 행 높이 (루트 수와 무관하게 고정) */
const ROW_HEIGHT = 118;
const ROW_GAP = 10;
/** 탭 스트립 높이 (T-Q4) */
const TAB_STRIP_HEIGHT = 44;
/**
 * 목록 영역이 시작되는 높이.
 * 진행도 요약은 T-22 에서 팝업 요약 슬롯(§3-6 슬롯 2)으로 올라갔으므로
 * 콘텐츠 안에서는 탭 스트립 높이 + 여백만 비운다.
 */
const LIST_TOP_OFFSET = TAB_STRIP_HEIGHT + 12;

/** 헤더 타이틀 */
const TITLE = '컬렉션';

/**
 * 도감 탭 (UX_ONBOARDING_FLOW.md §3-7).
 * '이야기'는 별도 팝업(`StoryLogPopup`)으로 열린다. 컷씬 목록은 스크롤·재생 동선이
 * 컬렉션 목록과 전혀 달라서 같은 컨테이너에 겹쳐 그리면 스크롤 핸들러가 서로 잡아먹는다.
 */
export const COLLECTION_TABS = Object.freeze([
  Object.freeze({ key: 'collection', label: '영웅' }),
  Object.freeze({ key: 'storylog', label: '이야기' }),
]);

export class CollectionPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.cult.avalon,
      ...options,
    });

    this.progressList = [];
    this.summary = null;
    this.seeds = 0;

    this.listContainer = null;
    this.scrollY = 0;
    this.maxScroll = 0;
    this.isDragging = false;
    this.dragStartY = 0;
    this.dragStartScrollY = 0;
    this._inputHandlers = null;
  }

  buildContent() {
    this.loadData();
    this.setTitle(TITLE);
    this.applySummary();
    this.applyActions();
    this.createTabs();
    this.createProgressBar();
    this.createList();
    this.setupScrolling();
  }

  /** 슬롯 2 — 계정 진행도 요약 */
  applySummary() {
    this.setSummary([
      { label: '수집 루트', value: `${this.summary.obtainedRoutes} / ${this.summary.totalRoutes}` },
      { label: '완성', value: `${this.summary.completed} / ${this.summary.totalCollections}` },
      { label: '세계수의 씨앗', value: `${this.seeds}` }
    ]);
  }

  /** 슬롯 4 — 계정 완성 보너스 안내 + 닫기 */
  applyActions() {
    this.setActions([
      {
        label: this.summary.accountComplete ? '계정 완성 · ATK/DEF +2%' : `공명 ${this.summary.tier1}종`,
        variant: 'secondary',
        disabled: true
      },
      { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
    ]);
  }

  // ==================== 탭 (T-Q4) ====================

  /**
   * 상단 탭 스트립. '이야기'를 누르면 이 팝업을 닫고 `StoryLogPopup`을 연다.
   * Skip All 확인 문구가 "도감에서 다시 볼 수 있습니다"로 확정되어 있으므로(시스템 §6-2)
   * 진입점은 반드시 도감 안에 있어야 한다.
   */
  createTabs() {
    const { left, top, width } = this.contentBounds;
    const tabW = width / COLLECTION_TABS.length;
    const tabH = s(TAB_STRIP_HEIGHT - 8);

    COLLECTION_TABS.forEach((tab, index) => {
      const active = tab.key === 'collection';
      const cx = left + tabW * index + tabW / 2;

      const bg = this.scene.add.graphics();
      bg.fillStyle(active ? COLORS.primary : COLORS.bgLight, active ? 0.35 : 0.6);
      bg.fillRoundedRect(left + tabW * index + s(4), top, tabW - s(8), tabH, s(8));
      bg.lineStyle(s(1), COLORS.primary, active ? 0.9 : 0.3);
      bg.strokeRoundedRect(left + tabW * index + s(4), top, tabW - s(8), tabH, s(8));
      this.contentContainer.add(bg);

      this.addText(cx, top + tabH / 2, tab.label, {
        fontSize: sf(15),
        fontStyle: 'bold',
        color: active ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary,
      }).setOrigin(0.5);

      if (active) return;

      const hit = this.scene.add.rectangle(cx, top + tabH / 2, tabW - s(8), tabH)
        .setAlpha(0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.openTab(tab.key));
      this.contentContainer.add(hit);
    });
  }

  /**
   * 다른 탭으로 이동. 씬의 `openPopup`이 있으면 그것을 통해 열어
   * `activePopup` 단일 관리(NavigationManager 스택)를 깨지 않는다.
   * @param {string} key COLLECTION_TABS의 key
   */
  openTab(key) {
    const scene = this.scene;
    if (typeof scene?.openPopup !== 'function') {
      this.hide();
      return;
    }
    // 닫힘 콜백에 이어붙인다. 지연 호출로 추측하면 페이드아웃(150ms)이 끝나기 전에 열려
    // `openPopup`의 중복 오픈 가드(activePopup)에 조용히 막힌다.
    const prevOnClose = this.onCloseCallback;
    this.onCloseCallback = () => {
      prevOnClose?.();
      scene.openPopup(key);
    };
    this.hide();
  }

  loadData() {
    const saveData = SaveManager.load();
    this.progressList = CollectionSystem.getAllProgress(saveData);
    this.summary = CollectionSystem.getAccountSummary(saveData);
    this.seeds = (saveData?.resources?.worldTreeSeeds) || 0;
  }

  // ==================== 상단 요약 ====================

  /** 콘텐츠 상단 진행 바. 수치는 요약 슬롯이 맡는다 */
  createProgressBar() {
    const { left, width } = this.contentBounds;
    const top = this.contentBounds.top + s(TAB_STRIP_HEIGHT - 4);
    const barH = s(6);
    const radius = s(DESIGN.radius.sm);

    const bar = this.scene.add.graphics();
    bar.fillStyle(DESIGN.colors.bg.primary, 1);
    bar.fillRoundedRect(left, top, width, barH, radius);
    if (this.summary.rate > 0) {
      bar.fillStyle(DESIGN.colors.brand.accent, 1);
      bar.fillRoundedRect(left, top, Math.max(barH, width * this.summary.rate), barH, radius);
    }
    this.contentContainer.add(bar);
  }

  // ==================== 목록 ====================

  createList() {
    const { left, top, width, height } = this.contentBounds;
    const listTop = top + s(LIST_TOP_OFFSET);
    const listHeight = height - s(LIST_TOP_OFFSET);

    this.listContainer = this.scene.add.container(0, listTop);
    this.contentContainer.add(this.listContainer);

    const maskShape = this.scene.make.graphics();
    maskShape.fillRect(left, listTop, width, listHeight);
    this.listContainer.setMask(maskShape.createGeometryMask());
    this._maskShape = maskShape;

    this.progressList.forEach((progress, index) => {
      this.createRow(progress, index * s(ROW_HEIGHT + ROW_GAP));
    });

    const contentHeight = this.progressList.length * s(ROW_HEIGHT + ROW_GAP);
    this.maxScroll = Math.max(0, contentHeight - listHeight);
  }

  /**
   * 컬렉션 1행 렌더링
   * @param {Object} progress CollectionSystem.getAllProgress 항목
   * @param {number} y 컨테이너 기준 y
   */
  createRow(progress, y) {
    const { left, width } = this.contentBounds;
    const rowH = s(ROW_HEIGHT);
    const tierColor = TIER_COLORS[progress.tier];

    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.bgLight, progress.tier > 0 ? 0.95 : 0.6);
    bg.fillRoundedRect(left, y, width, rowH, s(10));
    bg.lineStyle(s(progress.tier === 2 ? 2 : 1), tierColor, progress.tier > 0 ? 0.8 : 0.3);
    bg.strokeRoundedRect(left, y, width, rowH, s(10));
    this.listContainer.add(bg);

    // 기본영웅 이름
    const name = this.scene.add.text(left + s(16), y + s(14), progress.baseHeroName, {
      fontSize: sf(18), fontFamily: '"Noto Sans KR", sans-serif',
      fontStyle: 'bold', color: progress.tier > 0 ? DESIGN.colors.text.primary : DESIGN.colors.text.secondary,
    });
    this.listContainer.add(name);

    // 진행 카운트
    const count = this.scene.add.text(
      left + width - s(16), y + s(16),
      `${progress.obtained.length} / ${progress.total}`,
      { fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.secondary }
    ).setOrigin(1, 0);
    this.listContainer.add(count);

    // 티어 배지 + 칭호
    const badgeText = progress.tier > 0
      ? `${progress.tierName} · ${progress.title}`
      : '미개방';
    const badge = this.scene.add.text(left + s(16), y + s(40), badgeText, {
      fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif',
      color: progress.tier === 2 ? hexToCSS(DESIGN.colors.brand.accent) : (progress.tier === 1 ? '#A5B4FC' : '#475569'),
    });
    this.listContainer.add(badge);

    // 보너스 표기
    const bonusLabel = this.formatBonus(progress.tier);
    if (bonusLabel) {
      const bonus = this.scene.add.text(left + width - s(16), y + s(40), bonusLabel, {
        fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif', color: hexToCSS(DESIGN.colors.status.success),
      }).setOrigin(1, 0);
      this.listContainer.add(bonus);
    }

    // 루트 칩
    this.createRouteChips(progress, left + s(16), y + s(68), width - s(32));
  }

  /** 루트 칩(획득/미획득) 렌더링 */
  createRouteChips(progress, x, y, maxWidth) {
    const chipH = s(34);
    const gap = s(8);
    const count = progress.routes.length || 1;
    const chipW = Math.min(s(180), (maxWidth - gap * (count - 1)) / count);

    progress.routes.forEach((route, index) => {
      const cx = x + index * (chipW + gap);
      const color = route.owned ? getRarityColor(route.resultRarity) : DESIGN.colors.bg.surface;

      const chip = this.scene.add.graphics();
      chip.fillStyle(color, route.owned ? 0.25 : 0.35);
      chip.fillRoundedRect(cx, y, chipW, chipH, s(6));
      chip.lineStyle(s(1), color, route.owned ? 0.9 : 0.4);
      chip.strokeRoundedRect(cx, y, chipW, chipH, s(6));
      this.listContainer.add(chip);

      const mark = route.owned ? '◆' : '○';
      const label = `${mark} ${this.getCultName(route.cultId)}`;
      const text = this.scene.add.text(cx + chipW / 2, y + chipH / 2, label, {
        fontSize: sf(12), fontFamily: '"Noto Sans KR", sans-serif',
        color: route.owned ? DESIGN.colors.text.primary : DESIGN.colors.text.muted,
      }).setOrigin(0.5);
      this.listContainer.add(text);

      // 등급 표기 (칩 우상단)
      const rarity = this.scene.add.text(cx + chipW - s(4), y + s(2), route.resultRarity, {
        fontSize: sf(9), fontFamily: '"Noto Sans KR", sans-serif',
        color: route.owned ? hexToCSS(DESIGN.colors.brand.accent) : '#475569',
      }).setOrigin(1, 0);
      this.listContainer.add(rarity);
    });
  }

  /**
   * 티어 보너스 요약 문자열
   * @param {number} tier
   * @returns {string} 미달 시 빈 문자열
   */
  formatBonus(tier) {
    const bonus = CollectionSystem.BONUS_TIERS[tier];
    if (!bonus) return '';
    const parts = ['hp', 'atk', 'def', 'spd']
      .filter((key) => bonus[key] > 0)
      .map((key) => key.toUpperCase());
    if (parts.length === 0) return '';
    const pct = Math.round((bonus[parts[0].toLowerCase()] || 0) * 100);
    return `${parts.join('/')} +${pct}%`;
  }

  /** cultId → 표시 이름 */
  getCultName(cultId) {
    const cult = (cultsData.cults || {})[cultId];
    return (cult && (cult.nameKr || cult.name)) || cultId;
  }

  // ==================== 스크롤 ====================

  setupScrolling() {
    const { left, top, width, height } = this.contentBounds;
    const scrollTop = top + s(LIST_TOP_OFFSET);
    const scrollHeight = height - s(LIST_TOP_OFFSET);

    const inBounds = (pointer) =>
      pointer.y >= scrollTop && pointer.y <= scrollTop + scrollHeight &&
      pointer.x >= left && pointer.x <= left + width;

    const onWheel = (pointer, gameObjects, deltaX, deltaY) => {
      if (!this.isOpen || !inBounds(pointer)) return;
      this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.3, 0, this.maxScroll);
      this.updateListPosition();
    };

    const onPointerDown = (pointer) => {
      if (!this.isOpen || !inBounds(pointer)) return;
      this.isDragging = false;
      this.dragStartY = pointer.y;
      this.dragStartScrollY = this.scrollY;
    };

    const onPointerMove = (pointer) => {
      if (!this.isOpen || !pointer.isDown || this.dragStartY === 0) return;
      const deltaY = this.dragStartY - pointer.y;
      if (!this.isDragging && Math.abs(deltaY) > s(5)) this.isDragging = true;
      if (this.isDragging) {
        this.scrollY = Phaser.Math.Clamp(this.dragStartScrollY + deltaY, 0, this.maxScroll);
        this.updateListPosition();
      }
    };

    const onPointerUp = () => {
      this.isDragging = false;
      this.dragStartY = 0;
    };

    this.scene.input.on('wheel', onWheel);
    this.scene.input.on('pointerdown', onPointerDown);
    this.scene.input.on('pointermove', onPointerMove);
    this.scene.input.on('pointerup', onPointerUp);

    this._inputHandlers = { onWheel, onPointerDown, onPointerMove, onPointerUp };
  }

  updateListPosition() {
    if (this.listContainer) {
      this.listContainer.y = this.contentBounds.top + s(LIST_TOP_OFFSET) - this.scrollY;
    }
  }

  destroy() {
    if (this._inputHandlers && this.scene?.input) {
      const h = this._inputHandlers;
      this.scene.input.off('wheel', h.onWheel);
      this.scene.input.off('pointerdown', h.onPointerDown);
      this.scene.input.off('pointermove', h.onPointerMove);
      this.scene.input.off('pointerup', h.onPointerUp);
      this._inputHandlers = null;
    }
    if (this._maskShape) {
      this._maskShape.destroy();
      this._maskShape = null;
    }
    this.listContainer = null;
    super.destroy();
  }
}
