import Phaser from 'phaser';
import { PopupBase } from '../PopupBase.js';
import { COLORS, s, sf } from '../../config/gameConfig.js';
import { StoryManager } from '../../systems/StoryManager.js';
import { getChapter, getStage, getCharacterOrHero } from '../../data/index.js';
import {
  buildStoryLog,
  buildStoryLogSummary,
  LOCKED_GROUP_TITLE,
} from '../../systems/StoryLogRules.js';
import { COLLECTION_TABS } from './CollectionPopup.js';
import { DESIGN } from '../../config/designSystem.js';
import { POPUP_SLOT } from '../../utils/popupLayout.js';
import { ensureMinTouchTarget } from '../../utils/touchTarget.js';

/**
 * StoryLogPopup — 도감 '이야기' 탭 (T-Q4)
 *
 * SSOT
 *  - docs/story/UX_ONBOARDING_FLOW.md §3-7 (재감상 동선 · 표시 규칙)
 *  - docs/story/SYSTEM_ONBOARDING_ECONOMY.md §6-2 (Skip All 문구가 "도감에서 다시 볼 수 있습니다"로 약속)
 *
 * 표시 규칙
 *  - `story.viewedCutscenes`에 있는 것만 제목을 노출한다. 미시청은 스포일러 차단을 위해 감춘다.
 *  - 시청 이력이 0인 그룹은 제목까지 감추고 잠금 행만 남긴다.
 *  - `story.skippedCutscenes`에 있으면 ⏭ 배지 + 상단 "놓친 이야기 N편" 요약.
 *  - 재생은 `mode: replay` — 보상 재지급도, 튜토리얼 커밋도 없다.
 *
 * 주의: 모듈 스코프에서 COLORS/s/sf를 평가하지 않는다(순환 import TDZ 방지). 함수 안에서만 읽는다.
 */

const ROW_HEIGHT = 62;
const GROUP_HEADER_HEIGHT = 48;
/** 탭 스트립 높이 — CollectionPopup 과 같아야 탭 전환 시 목록이 튀지 않는다 */
const TAB_STRIP_HEIGHT = 44;
/**
 * 진행도 요약은 T-22 에서 팝업 요약 슬롯(§3-6 슬롯 2)으로 올라갔다.
 * 콘텐츠 안에서는 탭 스트립 높이 + 여백만 비운다.
 */
const LIST_TOP_OFFSET = TAB_STRIP_HEIGHT + 12;

/** 헤더 타이틀 */
const TITLE = '이야기';

// 목록 파생은 순수 모듈이 담당한다. 여기서는 그리기만 한다.
export {
  buildStoryLog,
  buildStoryLogSummary,
  getSceneGroupId,
  getSceneTitle,
  HERO_TRIGGERS,
  HERO_GROUP_ID,
  LOCKED_GROUP_TITLE,
  TRIGGER_SUBTITLES,
} from '../../systems/StoryLogRules.js';

export class StoryLogPopup extends PopupBase {
  constructor(scene, options = {}) {
    super(scene, {
      title: TITLE,
      width: s(POPUP_SLOT.panelWidth),
      height: s(POPUP_SLOT.panelHeight),
      layoutSpec: 'redesign',
      accentColor: DESIGN.colors.cult.takamagahara,
      ...options,
    });

    this.log = null;
    this.summary = null;
    this.listContainer = null;
    this.scrollY = 0;
    this.maxScroll = 0;
    this.isDragging = false;
    this.dragStartY = 0;
    this.dragStartScrollY = 0;
    this._inputHandlers = null;
    this._maskShape = null;
  }

  buildContent() {
    this.loadData();
    this.setTitle(TITLE);
    this.applySummary();
    this.applyActions();
    this.createTabs();
    this.createList();
    this.setupScrolling();
  }

  /**
   * 슬롯 2 — 감상 진행도 · 놓친 이야기.
   * 수치는 `buildStoryLog` 결과(SSOT)에서 직접 읽는다. 표시 문구는 요약 슬롯이 만든다.
   */
  applySummary() {
    this.setSummary([
      { label: '본 이야기', value: `${this.log?.viewedTotal ?? 0} / ${this.log?.sceneTotal ?? 0}` },
      { label: '놓친 이야기', value: `${this.log?.skippedTotal ?? 0}편` }
    ]);
  }

  /** 슬롯 4 — 도감(영웅 탭)으로 돌아가기 + 닫기 */
  applyActions() {
    this.setActions([
      {
        label: '도감으로',
        variant: 'secondary',
        onClick: () => this.scene?.time?.delayedCall?.(0, () => this.openTab('collection'))
      },
      { label: '닫기', variant: 'ghost', onClick: () => this.hide() }
    ]);
  }

  /** 도감과 동일한 탭 스트립. '영웅'을 누르면 컬렉션으로 돌아간다. */
  createTabs() {
    const { left, top, width } = this.contentBounds;
    const tabW = width / COLLECTION_TABS.length;
    const tabH = s(TAB_STRIP_HEIGHT - 8);

    COLLECTION_TABS.forEach((tab, index) => {
      const active = tab.key === 'storylog';
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

      // 탭 스트립 시각 높이는 36 이지만 손가락이 닿는 영역은 48 이어야 한다 (QA P2-1)
      const hit = this.scene.add.rectangle(cx, top + tabH / 2, tabW - s(8), tabH).setAlpha(0.001);
      ensureMinTouchTarget(hit);
      hit.on('pointerup', () => this.openTab(tab.key));
      this.contentContainer.add(hit);
    });
  }

  /**
   * 다른 탭으로 이동. 닫힘 콜백에 이어붙여야 `openPopup`의 중복 오픈 가드를 피할 수 있다.
   * @param {string} key COLLECTION_TABS의 key
   */
  openTab(key) {
    const scene = this.scene;
    if (typeof scene?.openPopup !== 'function') {
      this.hide();
      return;
    }
    const prevOnClose = this.onCloseCallback;
    this.onCloseCallback = () => {
      prevOnClose?.();
      scene.openPopup(key);
    };
    this.hide();
  }

  loadData() {
    this.log = buildStoryLog(StoryManager.getAllScenes(), StoryManager.getStoryState(), {
      chapterName: (chapterId) => getChapter(chapterId)?.name || null,
      stageName: (stageId, chapterId) => getStage(chapterId, stageId)?.name || null,
      heroName: (heroId) => getCharacterOrHero(heroId)?.name || null,
    });
    this.summary = buildStoryLogSummary(this.log);
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

    let y = 0;
    this.log.groups.forEach((group) => {
      this.createGroupHeader(group, y);
      y += s(GROUP_HEADER_HEIGHT);
      group.entries.forEach((entry) => {
        this.createEntryRow(entry, y);
        y += s(ROW_HEIGHT);
      });
      y += s(10);
    });

    this.maxScroll = Math.max(0, y - listHeight);
  }

  createGroupHeader(group, y) {
    const { left, width } = this.contentBounds;

    const label = group.locked
      ? `${LOCKED_GROUP_TITLE}   [잠김]`
      : group.title;

    const title = this.scene.add.text(left + s(12), y + s(10), label, {
      fontSize: sf(16), fontFamily: '"Noto Sans KR", sans-serif', fontStyle: 'bold',
      color: group.locked ? '#475569' : '#A5B4FC',
    });
    this.listContainer.add(title);

    const count = this.scene.add.text(
      left + width - s(12), y + s(12),
      `[${group.viewedCount} / ${group.total}]`,
      { fontSize: sf(13), fontFamily: '"Noto Sans KR", sans-serif', color: DESIGN.colors.text.muted }
    ).setOrigin(1, 0);
    this.listContainer.add(count);
  }

  createEntryRow(entry, y) {
    const { left, width } = this.contentBounds;
    const rowH = s(ROW_HEIGHT - 8);

    const bg = this.scene.add.graphics();
    bg.fillStyle(COLORS.bgLight, 0.7);
    bg.fillRoundedRect(left + s(8), y, width - s(16), rowH, s(8));
    bg.lineStyle(s(1), entry.skipped ? 0xFBBF24 : COLORS.primary, entry.skipped ? 0.7 : 0.3);
    bg.strokeRoundedRect(left + s(8), y, width - s(16), rowH, s(8));
    this.listContainer.add(bg);

    const badge = entry.skipped ? '건너뜀' : '감상함';
    const label = `${badge}  ${entry.title}${entry.subtitle ? ` · ${entry.subtitle}` : ''}`;
    const text = this.scene.add.text(left + s(24), y + rowH / 2, label, {
      fontSize: sf(15), fontFamily: '"Noto Sans KR", sans-serif',
      color: DESIGN.colors.text.primary,
    }).setOrigin(0, 0.5);
    this.listContainer.add(text);

    const play = this.scene.add.text(left + width - s(24), y + rowH / 2, '재생 ▸', {
      fontSize: sf(14), fontFamily: '"Noto Sans KR", sans-serif', color: '#38BDF8',
    }).setOrigin(1, 0.5);
    this.listContainer.add(play);

    // 탭 타겟은 행 전체 (UX §6-3 최소 크기 준수)
    const hit = this.scene.add.rectangle(
      left + width / 2, y + rowH / 2, width - s(16), rowH
    ).setAlpha(0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      if (this.isDragging) return;
      this.replay(entry);
    });
    this.listContainer.add(hit);
  }

  /**
   * 재감상 재생. 팝업을 먼저 닫고 `allowRepeat`으로 트리거를 다시 태운다.
   * 보상·커밋은 일어나지 않는다(`StoryManager.trigger`는 재생만 한다).
   * @param {object} entry buildStoryLog 항목
   */
  replay(entry) {
    const host = this.scene;
    this.hide();
    StoryManager.trigger(entry.trigger, {
      scene: host,
      chapterId: entry.anchors.chapterId,
      stageId: entry.anchors.stageId,
      heroId: entry.anchors.heroId,
      cultId: entry.anchors.cultId,
      allowRepeat: true,
    });
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
      // 행 탭 핸들러가 먼저 돌 수 있도록 한 프레임 뒤에 드래그 플래그를 내린다.
      this.dragStartY = 0;
      if (this.scene?.time) {
        this.scene.time.delayedCall(0, () => { this.isDragging = false; });
      } else {
        this.isDragging = false;
      }
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

export default StoryLogPopup;
