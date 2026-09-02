import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { SaveManager } from '../../systems/SaveManager.js';
import { CollectionSystem } from '../../systems/CollectionSystem.js';
import cultsData from '../../data/cults.json';

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
  0: 0x475569,
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
/** 목록 영역이 시작되는 헤더 높이 */
const LIST_TOP_OFFSET = 130;

export class CollectionPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: '컬렉션',
      width: s(680),
      height: s(1100),
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
    this.createSummary();
    this.createList();
    this.setupScrolling();
  }

  loadData() {
    const saveData = SaveManager.load();
    this.progressList = CollectionSystem.getAllProgress(saveData);
    this.summary = CollectionSystem.getAccountSummary(saveData);
    this.seeds = (saveData?.resources?.worldTreeSeeds) || 0;
  }

  // ==================== 상단 요약 ====================

  createSummary() {
    const { left, top, width, centerX } = this.contentBounds;

    const card = this.scene.add.graphics();
    card.fillStyle(COLORS.bgLight, 0.9);
    card.fillRoundedRect(left, top, width, s(110), s(12));
    card.lineStyle(s(1), COLORS.primary, 0.4);
    card.strokeRoundedRect(left, top, width, s(110), s(12));
    this.contentContainer.add(card);

    this.addText(centerX, top + s(24),
      `수집 루트 ${this.summary.obtainedRoutes} / ${this.summary.totalRoutes}`, {
        fontSize: sf(20), fontStyle: 'bold', color: '#F8FAFC',
      }).setOrigin(0.5);

    this.addText(centerX, top + s(52),
      `완성 ${this.summary.completed} / ${this.summary.totalCollections}    공명 ${this.summary.tier1}`, {
        fontSize: sf(14), color: '#94A3B8',
      }).setOrigin(0.5);

    // 진행 바
    const barW = width - s(60);
    const barX = left + s(30);
    const barY = top + s(74);
    const bar = this.scene.add.graphics();
    bar.fillStyle(0x0F172A, 1);
    bar.fillRoundedRect(barX, barY, barW, s(8), s(4));
    if (this.summary.rate > 0) {
      bar.fillStyle(COLORS.accent, 1);
      bar.fillRoundedRect(barX, barY, Math.max(s(8), barW * this.summary.rate), s(8), s(4));
    }
    this.contentContainer.add(bar);

    const seedLabel = `🌱 세계수의 씨앗 ${this.seeds}`;
    const bonusLabel = this.summary.accountComplete
      ? '   ·   계정 완성 보너스 ATK/DEF +2%'
      : '';
    this.addText(centerX, top + s(94), seedLabel + bonusLabel, {
      fontSize: sf(13),
      color: this.summary.accountComplete ? '#F59E0B' : '#64748B',
    }).setOrigin(0.5);
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
      fontStyle: 'bold', color: progress.tier > 0 ? '#F8FAFC' : '#94A3B8',
    });
    this.listContainer.add(name);

    // 진행 카운트
    const count = this.scene.add.text(
      left + width - s(16), y + s(16),
      `${progress.obtained.length} / ${progress.total}`,
      { fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif', color: '#94A3B8' }
    ).setOrigin(1, 0);
    this.listContainer.add(count);

    // 티어 배지 + 칭호
    const badgeText = progress.tier > 0
      ? `${progress.tierName} · ${progress.title}`
      : '미개방';
    const badge = this.scene.add.text(left + s(16), y + s(40), badgeText, {
      fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif',
      color: progress.tier === 2 ? '#FBBF24' : (progress.tier === 1 ? '#A5B4FC' : '#475569'),
    });
    this.listContainer.add(badge);

    // 보너스 표기
    const bonusLabel = this.formatBonus(progress.tier);
    if (bonusLabel) {
      const bonus = this.scene.add.text(left + width - s(16), y + s(40), bonusLabel, {
        fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif', color: '#10B981',
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
      const color = route.owned ? getRarityColor(route.resultRarity) : 0x334155;

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
        color: route.owned ? '#F8FAFC' : '#64748B',
      }).setOrigin(0.5);
      this.listContainer.add(text);

      // 등급 표기 (칩 우상단)
      const rarity = this.scene.add.text(cx + chipW - s(4), y + s(2), route.resultRarity, {
        fontSize: sf(9), fontFamily: '"Noto Sans KR", sans-serif',
        color: route.owned ? '#FBBF24' : '#475569',
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
