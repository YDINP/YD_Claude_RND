/**
 * StageSelectScene — 모험 · 스테이지 선택 (REDESIGN_PLAN §3-4, T-16)
 *
 * 리디자인 이전에는 챕터 제목이 리스트 첫 카드 위에 겹쳐 그려졌고, 챕터명이 씬 파일에
 * 하드코딩(어둠의 숲 / 얼음 동굴 / 화염 계곡)되어 stages.json 의 실제 챕터명과 달랐다.
 * 이제 챕터는 전용 헤더 패널을 갖고, 이름·스테이지·보스 판정은 전부 데이터에서 온다.
 *
 * 배치 계산은 `utils/stageSelectLayout.js`(순수 모듈)가 하고 이 파일은 그리기만 한다.
 * 벽 경고 판정은 `systems/StageWallRules.js`, 보스 판정도 같은 모듈이 SSOT다.
 */
import { COLORS, GAME_WIDTH, GAME_HEIGHT, s, sf } from '../config/gameConfig.js';
import { DESIGN, getCultColor, hexToCSS } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import GameLogger from '../utils/GameLogger.js';
import { energySystem } from '../systems/EnergySystem.js';
import { PartyManager } from '../systems/PartyManager.js';
import { SynergySystem } from '../systems/SynergySystem.js';
import { sweepSystem } from '../systems/SweepSystem.js';
import { SaveManager } from '../systems/SaveManager.js';
import { getAllCharacters, getChapterStages, getAllChapters, getChapter } from '../data/index.js';
import transitionManager from '../utils/TransitionManager.js';
import navigationManager from '../systems/NavigationManager.js';
import { StoryManager } from '../systems/StoryManager.js';
import { buildWallWarning, isBossStage, getDifficultyBand, getPowerRatio } from '../systems/StageWallRules.js';
import { ensureMinTouchTarget } from '../utils/touchTarget.js';
import { countAscendableHeroes } from '../systems/ReturningPlayerRules.js';
import { BackgroundFactory } from '../utils/BackgroundFactory.js';
import { GlassPanel, GLASS_VARIANT } from '../components/GlassPanel.js';
import { NineSliceFrame } from '../components/NineSliceFrame.js';
import { UIButton } from '../components/UIButton.js';
import { IconFactory } from '../utils/IconFactory.js';
import {
  STAGE_SELECT_LAYOUT as L,
  CARD_SLOTS,
  MIN_TOUCH,
  chapterIdFor,
  clampChapter,
  resolveChapterCult,
  getChapterHeaderLayout,
  buildChapterProgress,
  getProgressFillWidth,
  getStageCardRect,
  getListMetrics,
  clampScroll,
  LORE_PANEL,
  fitWrappedLines,
  resolveLorePlacement,
  resolveStageState,
  getStarOffsets,
  estimateHeroPower,
  estimatePartyPower,
  buildChapterStoryProgress,
  hasViewedStageStory
} from '../utils/stageSelectLayout.js';

/** 무채색 잠금 표현에 쓰는 회색 (DESIGN.colors.text.muted 와 같은 값의 Phaser hex) */
const MUTED_HEX = 0x64748B;

/** 씬 depth 규약 — 배경 0/1, 콘텐츠 10대, 헤더 20대, 모달 50 이상 */
const DEPTH = {
  BG: 0,
  CONTENT: 10,
  CARD: 12,
  CARD_TOP: 14,
  HEADER: 20,
  HEADER_TOP: 22,
  MODAL: 50,
  SWEEP: 60,
  TOAST: 100
};

export class StageSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StageSelectScene' });
    this.selectedStage = null;
    this.currentChapter = 1;
    this.listScroll = 0;
    this._cardTweenTargets = [];
  }

  create() {
    try {
      this.cameras.main.fadeIn(300);

      this.chapters = getAllChapters() || [];
      this.chapterCount = Math.max(1, this.chapters.length);
      this.currentChapter = clampChapter(this.currentChapter, this.chapterCount);
      this.listScroll = 0;

      // 모달을 먼저 세운다. 출격과 소탕은 이 화면의 기능 계약이고, 배경·카드 같은
      // 표현 계층이 무슨 이유로든 실패해도 계약이 함께 사라지면 안 된다.
      // (표현이 죽으면 화면이 볼품없어지지만, 계약이 죽으면 전투에 들어갈 수 없다)
      this.createPartySelectModal();
      this.createSweepModal();

      this._installBackgroundGuard();
      this.applyChapterBackground();
      this.createHeader();
      this.createChapterHeader();
      this.createStageList();
      this.createLorePanel();
      this.createFooter();
    } catch (error) {
      console.error('[StageSelectScene] create() 실패:', error);
      this.add.text(s(360), s(640), '씬 로드 실패\n메인으로 돌아갑니다', {
        fontSize: sf(20), fill: '#ff4444', align: 'center'
      }).setOrigin(0.5);
      this.time.delayedCall(2000, () => {
        this.scene.start('MainMenuScene');
      });
    }
  }

  // ================================================================
  // 색 · 배경
  // ================================================================

  /**
   * 현재 챕터의 지배 교단색. 화면 액센트(패널 아웃라인, 육각 배지, 진행바)가 이 색을 따른다.
   * @returns {number} Phaser hex
   */
  cultColor() {
    const cult = resolveChapterCult(this.currentChapter);
    return cult ? getCultColor(cult) : DESIGN.colors.brand.primary;
  }

  /** 현재 챕터의 배경 텍스처 키 (글래스 백드롭이 같은 키의 블러본을 찾는다) */
  bgTextureKey() {
    return `bg_${chapterIdFor(this.currentChapter)}`;
  }

  /**
   * 챕터 배경 지연 로드가 늦게 끝나 **다른 챕터의 배경을 덮어쓰는 것**을 막는다.
   *
   * BackgroundFactory 는 로드 완료 시 `scene.sceneBackground` 에 새 배경을 대입한다.
   * 사용자가 로드 도중 챕터를 넘기면 옛 챕터의 완료 콜백이 뒤늦게 화면 맨 위에 그림을
   * 얹어 버린다. 대입을 가로채 현재 챕터가 아닌 배경은 즉시 파괴한다.
   */
  _installBackgroundGuard() {
    if (this._bgGuardInstalled) return;
    let current = null;
    Object.defineProperty(this, 'sceneBackground', {
      configurable: true,
      get: () => current,
      set: (value) => {
        const expected = this._expectedBgKey;
        if (value && expected && value.textureKey && value.textureKey !== expected) {
          this._destroyBackground(value);
          return;
        }
        current = value;
      }
    });
    this._bgGuardInstalled = true;
  }

  /**
   * 배경 상태 객체가 들고 있는 표시물을 전부 파괴한다.
   * @param {{image?:Object, dim?:Object, fallback?:*}|null} state
   */
  _destroyBackground(state) {
    if (!state) return;
    const visit = (value) => {
      if (!value) return;
      if (typeof value.destroy === 'function') {
        value.destroy();
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(state.image);
    visit(state.dim);
    visit(state.fallback);
  }

  /** 현재 챕터 배경으로 교체한다. 지연 로드 중이면 프로시저럴 폴백이 먼저 뜬다. */
  applyChapterBackground() {
    const previous = this.sceneBackground;
    this._expectedBgKey = null;        // 정리하는 동안에는 가드를 끈다
    if (previous) {
      this._destroyBackground(previous);
      this.sceneBackground = null;
    }
    this._expectedBgKey = this.bgTextureKey();
    BackgroundFactory.createSceneBg(this, chapterIdFor(this.currentChapter), { depth: DEPTH.BG });
  }

  // ================================================================
  // 헤더
  // ================================================================

  createHeader() {
    const h = s(L.header.h);
    const cy = h / 2;

    this.headerPanel = GlassPanel.create(this, {
      x: GAME_WIDTH / 2,
      y: cy,
      w: GAME_WIDTH,
      h,
      variant: GLASS_VARIANT.HUD,
      bgKey: this.bgTextureKey(),
      depth: DEPTH.HEADER
    });

    // 교단색 헤어라인 — 이 화면의 액센트가 어디서 오는지 알리는 2px
    this.headerLine = this.add.graphics().setDepth(DEPTH.HEADER + 1);
    this.headerLine.fillStyle(this.cultColor(), 0.75);
    this.headerLine.fillRect(0, h - s(2), GAME_WIDTH, s(2));

    // 뒤로 — 히트 영역 96x60(기획) = 144x90(렌더)
    this.createHitArea(s(56), cy, s(96), s(60), () => {
      if (!navigationManager.goBack(this)) this.scene.start('MainMenuScene');
    }, DEPTH.HEADER_TOP);

    this.add.text(s(56), cy, '← 뒤로', ts('label', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setDepth(DEPTH.HEADER_TOP);

    this.add.text(GAME_WIDTH / 2, cy, '모험', ts('title', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setDepth(DEPTH.HEADER_TOP);

    // 에너지 — 이모지 대신 벡터 번개. 수치는 고정폭이라 갱신 시 좌우로 흔들리지 않는다
    const status = energySystem.getStatus();
    this.drawBolt(GAME_WIDTH - s(146), cy, s(9), DESIGN.colors.brand.accent, DEPTH.HEADER_TOP);
    this.energyText = this.add.text(GAME_WIDTH - s(28), cy, `${status.current}/${status.max}`, ts('num.md', {
      color: hexToCSS(DESIGN.colors.brand.accent)
    })).setOrigin(1, 0.5).setDepth(DEPTH.HEADER_TOP);
  }

  // ================================================================
  // 챕터 헤더 패널
  // ================================================================

  createChapterHeader() {
    const H = getChapterHeaderLayout();
    const cult = this.cultColor();

    this.chapterPanel = GlassPanel.create(this, {
      x: s(H.panel.cx),
      y: s(H.panel.cy),
      w: s(H.panel.w),
      h: s(H.panel.h),
      variant: GLASS_VARIANT.PANEL,
      tint: cult,
      bgKey: this.bgTextureKey(),
      depth: DEPTH.CONTENT
    });

    // 챕터 번호 — Orbitron. 한글 챕터명과 서체를 분리해 위계를 만든다
    this.chapterNumberText = this.add.text(s(H.number.x), s(H.number.y), '', ts('display.lg', {
      color: hexToCSS(cult)
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 2);

    this.chapterNameText = this.add.text(s(H.name.x), s(H.name.y), '', ts('title', {
      color: DESIGN.colors.text.primary,
      align: 'center'
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 2);

    this.chapterProgressBar = this.add.graphics().setDepth(DEPTH.CONTENT + 2);
    this.chapterProgressText = this.add.text(s(H.progressText.x), s(H.progressText.y), '', ts('num.sm', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT + 2);

    this.chapterArrows = [
      this.createChapterArrow(H.prev, '◀', -1),
      this.createChapterArrow(H.next, '▶', 1)
    ];

    this.updateChapterHeader();
  }

  /**
   * 챕터 이동 화살표. 히트 영역은 아이콘 크기와 분리해 MIN_TOUCH 이상을 유지한다.
   * @param {{x:number,y:number,w:number,h:number}} slot
   * @param {string} glyph
   * @param {number} delta
   */
  createChapterArrow(slot, glyph, delta) {
    const w = s(Math.max(slot.w, MIN_TOUCH));
    const h = s(Math.max(slot.h, MIN_TOUCH));
    const hit = this.createHitArea(s(slot.x), s(slot.y), w, h, () => this.changeChapter(delta), DEPTH.CONTENT + 3);
    const label = this.add.text(s(slot.x), s(slot.y), glyph, ts('subtitle', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 3);
    return { hit, label, delta };
  }

  /**
   * 챕터 이동. 범위를 벗어나면 아무 일도 하지 않는다.
   * @param {number} delta -1 또는 +1
   */
  changeChapter(delta) {
    const next = clampChapter(this.currentChapter + delta, this.chapterCount);
    if (next === this.currentChapter) return;

    this.currentChapter = next;
    this.listScroll = 0;
    this.applyChapterBackground();
    this.updateChapterHeader();
    this.refreshStages();
    this.updateLorePanel();
    this.repaintCultAccents();
  }

  updateChapterHeader() {
    const H = getChapterHeaderLayout();
    const chapter = getChapter(chapterIdFor(this.currentChapter)) || null;
    const stages = this.generateStages(this.currentChapter);
    const progress = buildChapterProgress(stages, this.registry.get('clearedStages') || {});
    const cult = this.cultColor();

    this.chapterNumberText.setText(`CHAPTER ${this.currentChapter}`).setColor(hexToCSS(cult));
    this.chapterNameText.setText(chapter?.name || `챕터 ${this.currentChapter}`);
    this.chapterProgressText.setText(progress.text);

    const bar = H.progressBar;
    const w = s(bar.w);
    const h = s(bar.h);
    const x = s(bar.x);
    const y = s(bar.y);
    const r = h / 2;

    this.chapterProgressBar.clear();
    this.chapterProgressBar.fillStyle(DESIGN.colors.bg.primary, 0.65);
    this.chapterProgressBar.fillRoundedRect(x, y, w, h, r);
    const fill = s(getProgressFillWidth(progress.ratio, bar.w));
    if (fill > 0) {
      this.chapterProgressBar.fillStyle(cult, 1);
      this.chapterProgressBar.fillRoundedRect(x, y, Math.max(fill, h), h, r);
    }
    this.chapterProgressBar.lineStyle(s(1), DESIGN.glass.rim.topColor, 0.18);
    this.chapterProgressBar.strokeRoundedRect(x, y, w, h, r);

    // 양 끝 챕터에서는 화살표를 흐리게 — 눌러도 아무 일이 없다는 것을 미리 보여준다
    this.chapterArrows?.forEach(({ label, delta }) => {
      const target = this.currentChapter + delta;
      label.setAlpha(target >= 1 && target <= this.chapterCount ? 1 : 0.25);
    });
  }

  /**
   * 챕터가 바뀌면 교단색과 블러 백드롭을 함께 다시 만든다.
   *
   * 글래스 패널은 만들어질 때 아웃라인 색과 배경 crop 을 굳힌다. 챕터가 바뀌면 둘 다
   * 달라지므로 색만 고쳐서는 백드롭이 옛 챕터 배경으로 남는다. 그래서 통째로 다시 만든다.
   * 텍스트는 depth 로 위에 있으므로 z 순서가 흐트러지지 않는다.
   */
  repaintCultAccents() {
    const cult = this.cultColor();
    const bgKey = this.bgTextureKey();

    if (this.headerLine) {
      this.headerLine.clear();
      this.headerLine.fillStyle(cult, 0.75);
      this.headerLine.fillRect(0, s(L.header.h) - s(2), GAME_WIDTH, s(2));
    }

    if (this.headerPanel) {
      this.headerPanel.destroy();
      this.headerPanel = GlassPanel.create(this, {
        x: GAME_WIDTH / 2, y: s(L.header.h) / 2, w: GAME_WIDTH, h: s(L.header.h),
        variant: GLASS_VARIANT.HUD, bgKey, depth: DEPTH.HEADER
      });
    }

    if (this.chapterPanel) {
      const H = getChapterHeaderLayout();
      this.chapterPanel.destroy();
      this.chapterPanel = GlassPanel.create(this, {
        x: s(H.panel.cx), y: s(H.panel.cy), w: s(H.panel.w), h: s(H.panel.h),
        variant: GLASS_VARIANT.PANEL, tint: cult, bgKey, depth: DEPTH.CONTENT
      });
    }

    if (this.lorePanel) {
      const p = L.lorePanel;
      this.lorePanel.destroy();
      this.lorePanel = GlassPanel.create(this, {
        x: s(p.x + p.w / 2), y: s(p.y + p.h / 2), w: s(p.w), h: s(p.h),
        variant: GLASS_VARIANT.PANEL, tint: cult, bgKey, depth: DEPTH.CONTENT
      });
    }
  }

  // ================================================================
  // 스테이지 리스트
  // ================================================================

  createStageList() {
    this.stageContainer = this.add.container(0, 0).setDepth(DEPTH.CARD);

    // 리스트 영역 밖으로 카드가 새지 않게 자른다 (스크롤 대비)
    const mask = this.make.graphics({ add: false });
    mask.fillRect(s(L.list.x), s(L.list.y), s(L.list.w), s(L.list.h));
    this.stageContainer.setMask(mask.createGeometryMask());
    this._listMask = mask;

    this.refreshStages();
    this.setupListScroll();
  }

  refreshStages() {
    // 카드를 지우기 전에 카드에 걸린 트윈을 먼저 끊는다.
    // 파괴된 대상에 남은 트윈은 다음 프레임에 죽은 객체를 만진다.
    (this._cardTweenTargets || []).forEach((target) => this.tweens.killTweensOf(target));
    this._cardTweenTargets = [];

    this.stageContainer.removeAll(true);

    const clearedStages = this.registry.get('clearedStages') || {};
    const stages = this.generateStages(this.currentChapter);
    const chapterId = chapterIdFor(this.currentChapter);
    const story = this.getStorySnapshot();
    const partyPower = estimatePartyPower(this.registry.get('ownedHeroes') || []);

    this._listMetrics = getListMetrics(stages.length);
    this.listScroll = clampScroll(this.listScroll, this._listMetrics.maxScroll);

    stages.forEach((stage, index) => {
      const state = resolveStageState({
        stages,
        index,
        clearedStages,
        isBoss: isBossStage(stage)
      });
      const rect = getStageCardRect(index);
      this.createStageCard({
        stage,
        state,
        rect,
        partyPower,
        chapterId,
        hasStory: hasViewedStageStory(story.scenes, stage.id, story.viewed)
      });
    });

    this.stageContainer.y = -s(this.listScroll);
  }

  /**
   * 휠 스크롤. 카드가 뷰포트를 넘칠 때만 실제로 움직인다 —
   * 챕터마다 스테이지 수가 다를 수 있으므로 바인딩 자체는 항상 해 둔다.
   */
  setupListScroll() {
    if (this._scrollBound) return;
    this._scrollBound = true;

    this.input.on('wheel', (pointer, over, dx, dy) => {
      if (!this._listMetrics?.scrollable) return;
      if (this.partyModal?.visible || this.sweepModal?.visible) return;
      this.listScroll = clampScroll(this.listScroll + dy / 3, this._listMetrics.maxScroll);
      this.stageContainer.y = -s(this.listScroll);
    });
  }

  generateStages(chapter) {
    // data/index.js에서 동적 로드 시도
    // getChapterStages 는 `chapter_1` 형태의 id를 받는다. 숫자를 넘기면 항상 빈 배열이 돌아와
    // 아래 하드코딩 폴백이 쓰이고, 그러면 1-4의 권장 전투력이 500(의도된 벽)이 아니라
    // 폴백 공식값 1,900이 되어 T-Q3 경고가 잘못된 숫자를 말한다.
    const chapterId = chapterIdFor(chapter);
    const chapterNumber = Number(String(chapterId).replace('chapter_', '')) || 1;
    const dataStages = getChapterStages(chapterId);

    if (dataStages && dataStages.length > 0) {
      return dataStages.map((stage, i) => ({
        id: stage.id || `${chapterNumber}-${i + 1}`,
        number: stage.number || stage.id || `${chapterNumber}-${i + 1}`,
        name: stage.name || `스테이지 ${i + 1}`,
        recommendedPower: stage.recommendedPower || 1000 + (chapterNumber - 1) * 2000 + i * 300,
        enemyCount: stage.enemyCount || 3 + Math.floor(i / 3),
        // 아래 4개는 전투/결과 화면이 쓴다. 여기서 떨어뜨리면 보스 판정과
        // 패배 시 에너지 환급(LV-01)이 전부 기본값으로 흘러간다.
        energyCost: stage.energyCost,
        isBoss: stage.isBoss,
        isElite: stage.isElite,
        enemies: stage.enemies,
        retryPolicy: stage.retryPolicy,
        // 챕터 이야기 패널의 "다음 · ..." 한 줄이 쓴다 (story.json _meta 가 정한 용도)
        story_intro: stage.story_intro,
        rewards: stage.rewards || {
          gold: 100 + i * 50 + (chapterNumber - 1) * 200,
          exp: 50 + i * 20 + (chapterNumber - 1) * 100
        }
      }));
    }

    // 폴백: 데이터가 없는 챕터. 숫자만으로 최소한의 목록을 만든다
    console.log(`[StageSelect] No data for chapter ${chapter}, using fallback`);
    const stages = [];
    for (let i = 0; i < 5; i++) {
      stages.push({
        id: `${chapterNumber}-${i + 1}`,
        number: `${chapterNumber}-${i + 1}`,
        name: `스테이지 ${i + 1}`,
        recommendedPower: 1000 + (chapterNumber - 1) * 2000 + i * 300,
        enemyCount: 3 + Math.floor(i / 3),
        rewards: {
          gold: 100 + i * 50 + (chapterNumber - 1) * 200,
          exp: 50 + i * 20 + (chapterNumber - 1) * 100
        }
      });
    }
    return stages;
  }

  /**
   * 스테이지 카드 한 장.
   * @param {Object} params
   */
  createStageCard({ stage, state, rect, partyPower, hasStory }) {
    const cult = this.cultColor();
    const card = this.add.container(s(rect.cx), s(rect.cy));

    const w = s(rect.w);
    const h = s(rect.h);

    // 카드 표면 — 글래스 카드 + 보스는 9-slice 프레임을 덧대 무게를 준다.
    // bgKey 를 주지 않는다: 블러 백드롭은 화면 좌표에 고정된 crop 이라 스크롤하는 리스트
    // 안에서는 배경과 어긋난다. 카드는 fallbackTintAlpha(0.90) 경로를 쓴다(§2-3).
    const glass = GlassPanel.create(this, {
      x: 0, y: 0, w, h,
      variant: GLASS_VARIANT.CARD
    });
    card.add(glass);

    const accent = state.isBoss
      ? DESIGN.colors.brand.secondary
      : (state.isCleared ? cult : DESIGN.colors.brand.primary);

    // 보스는 테두리 두 겹으로 무게를 준다. 9-slice 프레임을 쓰지 않는 이유는
    // frame_panel 의 최소 렌더 크기가 192x192 라 92 높이 카드를 밖으로 밀어내기 때문이다.
    if (state.isBoss) {
      const r = s(DESIGN.radius.md);
      const halo = this.add.graphics();
      halo.lineStyle(s(4), accent, 0.22);
      halo.strokeRoundedRect(-w / 2 - s(2), -h / 2 - s(2), w + s(4), h + s(4), r + s(2));
      halo.lineStyle(s(2), accent, 0.85);
      halo.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      card.add(halo);
    }

    // 좌측 상태 스트라이프 — 클리어/현재/잠금을 색 하나로 훑어볼 수 있게 한다
    const stripe = this.add.graphics();
    const stripeColor = state.isLocked
      ? MUTED_HEX
      : (state.isCleared ? (state.stars >= 3 ? DESIGN.colors.brand.accent : cult) : accent);
    stripe.fillStyle(stripeColor, 1);
    stripe.fillRoundedRect(-w / 2, -h / 2 + s(8), s(6), h - s(16), s(3));
    card.add(stripe);

    // 카드 본문 전체가 진입 동선이다. 진입/소탕 버튼이 이 위에 얹혀 우선한다
    if (!state.isLocked) {
      const bodyHit = this.add.rectangle(0, 0, w, h, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      bodyHit.on('pointerover', () => glass.setAlpha(0.86));
      bodyHit.on('pointerout', () => glass.setAlpha(1));
      bodyHit.on('pointerdown', () => {
        this.selectedStage = stage;
        this.showPartySelect();
      });
      card.add(bodyHit);
    }

    card.add(this.createHexBadge(state, accent, cult));
    card.add(this.createStarRow(state));

    // 이름
    const nameColor = state.isLocked ? DESIGN.colors.text.muted : DESIGN.colors.text.primary;
    card.add(this.add.text(s(CARD_SLOTS.name.x), s(CARD_SLOTS.name.y), stage.name, ts('subtitle', {
      color: nameColor,
      wordWrap: { width: s(CARD_SLOTS.name.wrapWidth) }
    })).setOrigin(0, 0.5));

    // 추천 전투력 — 고정폭 수치
    const powerText = this.add.text(s(CARD_SLOTS.power.x), s(CARD_SLOTS.power.y),
      `추천 ${Math.round(stage.recommendedPower).toLocaleString()}`,
      ts('num.sm', { color: DESIGN.colors.text.secondary })).setOrigin(0, 0.5);
    card.add(powerText);

    // 소모 에너지 — 출격 전에 비용을 알아야 에너지가 없다는 것을 모달에서 처음 알지 않는다
    const energyCost = Number(stage.energyCost) || 0;
    if (energyCost > 0) {
      const costX = powerText.x + powerText.width + s(18);
      card.add(this.drawBolt(costX, s(CARD_SLOTS.power.y), s(6), DESIGN.colors.brand.accent));
      card.add(this.add.text(costX + s(10), s(CARD_SLOTS.power.y), `${energyCost}`,
        ts('num.sm', { color: hexToCSS(DESIGN.colors.brand.accent) })).setOrigin(0, 0.5));
    }

    // 난이도 밴드 — 판정은 StageWallRules 가 한다
    const band = getDifficultyBand(getPowerRatio(partyPower, stage.recommendedPower));
    card.add(this.add.text(s(CARD_SLOTS.difficulty.x), s(CARD_SLOTS.difficulty.y), band.label,
      ts('num.sm', { color: hexToCSS(band.color) })).setOrigin(1, 0.5));

    // 등급 칩
    if (state.chip) {
      card.add(this.createChip(state.chip, state.isBoss ? DESIGN.colors.brand.secondary : cult));
    }

    // 이야기 표시 — 시청한 컷씬이 있는 스테이지에만 붙는다(미시청은 스포일러라 감춘다)
    if (hasStory && !state.isLocked) {
      // 크기는 렌더 px 로 직접 준다 — IconFactory 의 토큰은 기획 px 라 1080 화면에서 작다
      const mark = IconFactory.createImage(
        this, s(CARD_SLOTS.storyMark.x), s(CARD_SLOTS.storyMark.y), 'collection',
        s(CARD_SLOTS.storyMark.size),
        { tint: DESIGN.colors.brand.accent }
      );
      if (mark) {
        mark.setAlpha(0.9);
        card.add(mark);
      }
    }

    // 액션 — 잠금은 자물쇠 하나만, 나머지는 진입 버튼
    if (state.isLocked) {
      card.add(this.createLockGlyph());
    } else {
      card.add(this.createEnterButton(stage, accent, state));
      if (state.stars >= 3) card.add(this.createSweepButton(stage));
    }

    // 잠김 표현 — 컨테이너 전체에 α0.45 를 걸면 글래스 표면까지 투명해져 생성 배경 위에서
    // 스테이지 이름이 읽히지 않는다. 표면은 오히려 더 어둡게 눌러 두고 내용만 흐린다.
    if (state.isLocked) {
      const mute = this.add.graphics();
      mute.fillStyle(DESIGN.colors.bg.primary, 0.5);
      mute.fillRoundedRect(-w / 2, -h / 2, w, h, s(DESIGN.radius.md));
      card.addAt(mute, 1);
      card.list.forEach((child) => {
        if (child !== glass && child !== mute) child.setAlpha(state.alpha);
      });
    }

    this.stageContainer.add(card);
  }

  /** 육각 번호 배지. frame_hex 텍스처가 없으면 폴리곤으로 그린다 */
  createHexBadge(state, accent, cult) {
    const slot = CARD_SLOTS.hex;
    const x = s(slot.x);
    const y = s(slot.y);
    const r = s(slot.r);
    const parts = [];

    const fill = state.isLocked
      ? DESIGN.colors.bg.surface
      : (state.isCleared ? cult : DESIGN.colors.bg.secondary);

    if (this.textures.exists('frame_hex')) {
      const hex = this.add.image(x, y, 'frame_hex').setDisplaySize(r * 2.2, r * 2.2);
      hex.setTint(fill);
      parts.push(hex);
    } else {
      const g = this.add.graphics();
      const points = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        points.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      }
      g.fillStyle(fill, 0.95);
      g.fillPoints(points, true);
      g.lineStyle(s(2), accent, state.isLocked ? 0.3 : 0.85);
      g.strokePoints(points, true, true);
      parts.push(g);
    }

    const numberColor = state.isLocked ? DESIGN.colors.text.muted : DESIGN.colors.text.primary;
    parts.push(this.add.text(x, y, String(state.stage?.number ?? ''), ts('num.sm', {
      color: numberColor
    })).setOrigin(0.5));

    // 지금 도전할 칸에만 시안 펄스 — 시선을 한 곳으로 모은다
    if (state.isCurrent) {
      const ring = this.add.graphics();
      ring.lineStyle(s(2), DESIGN.colors.brand.primary, 0.9);
      ring.strokeCircle(x, y, r + s(5));
      this.tweens.add({
        targets: ring,
        alpha: { from: 0.9, to: 0.15 },
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this._cardTweenTargets.push(ring);
      parts.push(ring);
    }

    return parts;
  }

  /** 별 3개. 획득분은 골드로 채우고 나머지는 외곽선만 남긴다 */
  createStarRow(state) {
    const slot = CARD_SLOTS.stars;
    const g = this.add.graphics();
    getStarOffsets(3).forEach((offset, i) => {
      const filled = i < state.stars;
      const color = filled ? DESIGN.colors.brand.accent : DESIGN.colors.text.muted;
      this.drawStar(g, s(offset), s(slot.y), s(slot.size / 2), color, filled ? 1 : 0.35, filled);
    });
    return [g];
  }

  /** 등급 칩 (BOSS · 정예) */
  createChip(label, color) {
    const slot = CARD_SLOTS.chip;
    const g = this.add.graphics();
    const w = s(slot.w);
    const h = s(slot.h);
    g.fillStyle(color, 0.22);
    g.fillRoundedRect(s(slot.x) - w / 2, s(slot.y) - h / 2, w, h, s(DESIGN.radius.sm));
    g.lineStyle(s(1), color, 0.8);
    g.strokeRoundedRect(s(slot.x) - w / 2, s(slot.y) - h / 2, w, h, s(DESIGN.radius.sm));

    const text = this.add.text(s(slot.x), s(slot.y), label, ts('num.sm', {
      color: hexToCSS(color)
    })).setOrigin(0.5);

    return [g, text];
  }

  /** 진입 버튼 (btn_primary 9-slice, 없으면 폴백 프레임) */
  createEnterButton(stage, accent, state) {
    const slot = CARD_SLOTS.action;
    const w = s(slot.w);
    const h = s(slot.h);
    const x = s(slot.x);
    const y = s(slot.y);

    // 라벨 캡슐·터치 하한·눌림 연출은 UIButton 이 공통으로 처리한다
    const button = UIButton.createParts(this, {
      x, y, w, h,
      label: state.isBoss ? '결전' : '진입',
      variant: state.isBoss ? 'secondary' : 'primary',
      tint: state.isCleared ? accent : null,
      token: 'body',
      onClick: () => {
        this.selectedStage = stage;
        this.showPartySelect();
      }
    });

    return button.objects;
  }

  /** 소탕 버튼 — 3성 클리어 스테이지에만 나온다 */
  createSweepButton(stage) {
    const slot = CARD_SLOTS.sweep;
    const w = s(slot.w);
    const h = s(slot.h);
    const x = s(slot.x);
    const y = s(slot.y);

    const button = UIButton.createParts(this, {
      x, y, w, h,
      label: '소탕',
      variant: 'ghost',
      tint: DESIGN.colors.status.success,
      token: 'label',
      // 어두운 캡슐 위에서 status.success(초록)는 대비 3:1 아래로 떨어진다.
      // 초록은 프레임 틴트와 번개 아이콘이 이미 말하고 있으므로 라벨은 본문색을 쓴다
      labelOffsetX: s(8),
      onClick: () => this.showSweepModal(stage)
    });
    const bolt = this.drawBolt(x - s(24), y, s(7), DESIGN.colors.status.success);

    return [button.frame, bolt, button.label, button.hit];
  }

  /** 잠금 자물쇠 — 텍스트 '잠김'은 없앤다. 카드 전체 알파가 이미 상태를 말한다 */
  createLockGlyph() {
    const slot = CARD_SLOTS.action;
    const x = s(slot.x);
    const y = s(slot.y);
    const g = this.add.graphics();
    const w = s(22);
    const h = s(18);
    g.fillStyle(MUTED_HEX, 0.9);
    g.fillRoundedRect(x - w / 2, y - h / 2 + s(4), w, h, s(3));
    g.lineStyle(s(3), MUTED_HEX, 0.9);
    g.beginPath();
    g.arc(x, y - h / 2 + s(4), s(7), Math.PI, 0);
    g.strokePath();
    return g;
  }

  // ================================================================
  // 챕터 이야기 패널 · 액션 바
  // ================================================================

  createLorePanel() {
    const p = L.lorePanel;
    this.lorePanel = GlassPanel.create(this, {
      x: s(p.x + p.w / 2),
      y: s(p.y + p.h / 2),
      w: s(p.w),
      h: s(p.h),
      variant: GLASS_VARIANT.PANEL,
      tint: this.cultColor(),
      bgKey: this.bgTextureKey(),
      depth: DEPTH.CONTENT
    });

    const LP = LORE_PANEL;
    const textX = s(p.x + LP.paddingX);
    const wrapWidth = s(p.w - LP.paddingX * 2);

    this.loreTitle = this.add.text(textX, s(p.y + LP.titleY), '이 챕터의 이야기', ts('subtitle', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0, 0.5).setDepth(DEPTH.CONTENT + 2);

    this.loreProgressText = this.add.text(s(p.x + p.w - LP.paddingX), s(p.y + LP.titleY), '', ts('num.sm', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(1, 0.5).setDepth(DEPTH.CONTENT + 2);

    // 두 문단 모두 상단 기준(origin 0,0)이다. y 는 updateLorePanel 이 실측 높이로 정한다
    this.loreBody = this.add.text(textX, s(p.y + LP.bodyTop), '', ts('label', {
      color: DESIGN.colors.text.secondary,
      wordWrap: { width: wrapWidth },
      lineSpacing: s(6)
    })).setOrigin(0, 0).setDepth(DEPTH.CONTENT + 2);

    // 다음에 할 일. stages.json 의 story_intro 는 이 자리를 위해 쓰인 캡션이다
    this.loreNextText = this.add.text(textX, s(p.y + p.h - LP.bottomPad), '', ts('caption', {
      color: DESIGN.colors.text.muted,
      wordWrap: { width: wrapWidth },
      lineSpacing: s(4)
    })).setOrigin(0, 0).setDepth(DEPTH.CONTENT + 2);

    this.updateLorePanel();
  }

  /**
   * 텍스트를 줄바꿈시킨 뒤 최대 줄 수로 잘라 넣는다.
   * 글자 수로 미리 자르지 않는 이유는 줄바꿈 위치가 서체와 폭에 달려 있어
   * 글자 수로는 줄 수를 예측할 수 없기 때문이다.
   *
   * @param {Phaser.GameObjects.Text} textObject
   * @param {string} value
   * @param {number} maxLines
   * @returns {number} 적용 후 실측 높이 (렌더 px)
   */
  setClampedText(textObject, value, maxLines) {
    if (!textObject) return 0;
    textObject.setText(value || '');
    const wrapped = typeof textObject.getWrappedText === 'function'
      ? textObject.getWrappedText()
      : String(value || '').split(/\r?\n/);
    const fitted = fitWrappedLines(wrapped, maxLines);
    if (fitted.text !== textObject.text) textObject.setText(fitted.text);
    return textObject.height;
  }

  /**
   * 이 챕터에서 다음에 도전할 스테이지. 전부 클리어했으면 null.
   * @returns {Object|null}
   */
  findNextStage() {
    const stages = this.generateStages(this.currentChapter);
    const cleared = this.registry.get('clearedStages') || {};
    for (let i = 0; i < stages.length; i++) {
      const state = resolveStageState({ stages, index: i, clearedStages: cleared });
      if (state.isCurrent) return stages[i];
    }
    return null;
  }

  updateLorePanel() {
    if (!this.loreBody) return;
    const chapterId = chapterIdFor(this.currentChapter);
    const chapter = getChapter(chapterId) || null;
    const story = this.getStorySnapshot();
    const progress = buildChapterStoryProgress(story.scenes, chapterId, story.viewed);

    this.loreProgressText.setText(progress.text);

    const next = this.findNextStage();
    const previewText = next
      ? `다음 · ${next.name} — ${next.story_intro || ''}`.trim().replace(/ —\s*$/, '')
      : '이 챕터를 모두 정리했습니다';
    const bodyText = chapter?.lore || chapter?.description || '아직 기록되지 않은 장입니다.';

    // 프리뷰를 먼저 확정한다. 아래에서 위로 자라므로 본문이 쓸 수 있는 높이를 이것이 정한다.
    const LP = LORE_PANEL;
    const previewHeight = this.setClampedText(this.loreNextText, previewText, LP.previewMaxLines);

    // 본문은 상한 줄 수에서 시작해, 프리뷰와 겹치면 한 줄씩 줄인다.
    // 글자 수가 아니라 줄바꿈 후 실측 높이로 판정하므로 어떤 챕터 문장에도 겹치지 않는다.
    const p = L.lorePanel;
    const geometry = {
      panelTop: s(p.y),
      panelHeight: s(p.h),
      bodyTop: s(LP.bodyTop),
      bottomPad: s(LP.bottomPad),
      gap: s(LP.gap),
      previewHeight
    };

    let placement = null;
    for (let lines = LP.bodyMaxLines; lines >= 1; lines--) {
      const bodyHeight = this.setClampedText(this.loreBody, bodyText, lines);
      placement = resolveLorePlacement({ ...geometry, bodyHeight });
      if (placement.fits) break;
    }

    this.loreBody.setY(placement.bodyY);
    this.loreNextText.setY(placement.previewY);
  }

  createFooter() {
    const f = L.footer;
    const w = s(f.w * 0.62);
    const h = s(64);
    const x = s(f.x + f.w / 2);
    const y = s(f.y + f.h / 2);

    // 교단색 대신 brand.primary — 챕터가 바뀌어도 이 버튼의 뜻은 그대로다
    const frame = NineSliceFrame.create(this, {
      x, y, w, h, key: 'btn_ghost', tint: DESIGN.colors.brand.primary, depth: DEPTH.CONTENT
    });
    this.add.text(x, y, '이야기 다시 보기', ts('body', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5).setDepth(DEPTH.CONTENT + 2);

    const hit = this.createHitArea(x, y, w, Math.max(h, s(MIN_TOUCH)), () => {
      // 도감의 이야기 탭이 재감상 SSOT다. 여기서 목록을 다시 그리지 않고 그쪽으로 보낸다
      this.scene.start('MainMenuScene', { openPopup: 'storylog' });
    }, DEPTH.CONTENT + 3);

    hit.on('pointerover', () => frame.setAlpha(0.82));
    hit.on('pointerout', () => frame.setAlpha(1));
  }

  // ================================================================
  // 공통 그리기 도구
  // ================================================================

  /**
   * 보이지 않는 히트 영역. 시각 요소 크기와 터치 타겟을 분리한다(§2-5).
   * @returns {Phaser.GameObjects.Rectangle}
   */
  createHitArea(x, y, w, h, onTap, depth) {
    const hit = this.add.rectangle(x, y, Math.max(w, s(MIN_TOUCH)), Math.max(h, s(MIN_TOUCH)), 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    if (typeof depth === 'number') hit.setDepth(depth);
    hit.on('pointerdown', (pointer, lx, ly, event) => {
      event?.stopPropagation?.();
      onTap();
    });
    return hit;
  }

  /**
   * 별 하나를 그린다. 시스템 이모지(★) 대신 벡터를 쓴다.
   * @param {Phaser.GameObjects.Graphics} g
   */
  drawStar(g, cx, cy, radius, color, alpha, filled) {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? radius : radius * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    if (filled) {
      g.fillStyle(color, alpha);
      g.fillPoints(points, true);
    } else {
      g.lineStyle(Math.max(1, radius * 0.22), color, alpha);
      g.strokePoints(points, true, true);
    }
  }

  /**
   * 번개 글리프. 에너지 표시의 ⚡ 이모지를 대체한다.
   * @returns {Phaser.GameObjects.Graphics}
   */
  drawBolt(cx, cy, size, color, depth) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillPoints([
      { x: cx + size * 0.25, y: cy - size * 1.4 },
      { x: cx - size * 0.75, y: cy + size * 0.15 },
      { x: cx - size * 0.05, y: cy + size * 0.15 },
      { x: cx - size * 0.3, y: cy + size * 1.4 },
      { x: cx + size * 0.8, y: cy - size * 0.25 },
      { x: cx + size * 0.05, y: cy - size * 0.25 }
    ], true);
    if (typeof depth === 'number') g.setDepth(depth);
    return g;
  }

  /**
   * 문장을 길이로 자른다. 자를 때만 말줄임표를 붙인다.
   * @param {string} text
   * @param {number} max
   * @returns {string}
   */
  truncate(text, max) {
    const value = typeof text === 'string' ? text.trim() : '';
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  /**
   * 컷씬 목록과 시청 이력 스냅샷. 카드마다 세이브를 다시 읽지 않도록 한 번만 만든다.
   * @returns {{scenes: Array, viewed: Set<string>}}
   */
  getStorySnapshot() {
    try {
      const state = StoryManager.getStoryState();
      return {
        scenes: StoryManager.getAllScenes() || [],
        viewed: new Set(state.viewedCutscenes || [])
      };
    } catch (e) {
      GameLogger.log('SCENE', '스토리 상태 조회 실패', { error: e?.message });
      return { scenes: [], viewed: new Set() };
    }
  }

  // ================================================================
  // 파티 선택 모달 (기능 불변)
  // ================================================================

  createPartySelectModal() {
    // Modal container (hidden by default)
    this.partyModal = this.add.container(0, 0).setDepth(DEPTH.MODAL).setVisible(false);

    // Overlay
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    overlay.setInteractive();

    // Modal background (라운드 코너 s(16))
    const modalBg = this.add.graphics();
    modalBg.fillStyle(COLORS.backgroundLight, 0.95);
    modalBg.fillRoundedRect(GAME_WIDTH / 2 - (GAME_WIDTH - s(60)) / 2, GAME_HEIGHT / 2 - s(225), GAME_WIDTH - s(60), s(450), s(16));
    modalBg.lineStyle(s(2), COLORS.primary, 1);
    modalBg.strokeRoundedRect(GAME_WIDTH / 2 - (GAME_WIDTH - s(60)) / 2, GAME_HEIGHT / 2 - s(225), GAME_WIDTH - s(60), s(450), s(16));

    // Modal title
    this.modalTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(200), '파티 선택', {
      fontSize: sf(22),
      fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stage info
    this.stageInfoText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(165), '', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Party slots (4 slots — PARTY_SIZE 기준)
    this.partySlots = [];
    const slotStartX = GAME_WIDTH / 2 - s(150);
    const slotY = GAME_HEIGHT / 2 - s(60);

    for (let i = 0; i < 4; i++) {
      const x = slotStartX + i * s(100);
      const slotContainer = this.add.container(x, slotY);

      const slotBg = this.add.rectangle(0, 0, s(75), s(90), COLORS.background, 0.8);
      slotBg.setStrokeStyle(s(2), COLORS.primary, 0.5);
      slotBg.setInteractive({ useHandCursor: true });

      const slotText = this.add.text(0, 0, '+', {
        fontSize: sf(30),
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      const slotLabel = this.add.text(0, s(55), `슬롯 ${i + 1}`, {
        fontSize: sf(10),
        fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      slotContainer.add([slotBg, slotText, slotLabel]);
      this.partySlots.push({ container: slotContainer, hero: null, slotText, slotBg });

      slotBg.on('pointerdown', () => {
        this.selectHeroForSlot(i);
      });
    }

    // Auto-fill button
    const autoBtn = this.add.container(GAME_WIDTH / 2 - s(80), GAME_HEIGHT / 2 + s(80));
    const autoBg = this.add.rectangle(0, 0, s(140), s(40), COLORS.primary, 1);
    ensureMinTouchTarget(autoBg); // 시각 140×40 유지, 히트 140×48 (QA P2-1)
    const autoText = this.add.text(0, 0, '자동 편성', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    autoBtn.add([autoBg, autoText]);

    autoBg.on('pointerdown', () => {
      this.autoFillParty();
    });

    // Start battle button
    const startBtn = this.add.container(GAME_WIDTH / 2 + s(80), GAME_HEIGHT / 2 + s(80));
    const startBg = this.add.rectangle(0, 0, s(140), s(40), COLORS.success, 1);
    ensureMinTouchTarget(startBg); // 시각 140×40 유지, 히트 140×48 (QA P2-1)
    const startText = this.add.text(0, 0, '전투 시작', {
      fontSize: sf(14),
      fontFamily: 'Arial',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    startBtn.add([startBg, startText]);

    startBg.on('pointerdown', () => {
      this.startBattle();
    });

    // Close button — 글리프는 20×22 지만 히트는 터치 하한까지 넓힌다 (QA P2-1)
    const closeBtn = this.add.text(GAME_WIDTH / 2 + s(180), GAME_HEIGHT / 2 - s(200), '✕', {
      fontSize: sf(24),
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    ensureMinTouchTarget(closeBtn);

    closeBtn.on('pointerdown', () => {
      this.hidePartySelect();
    });

    // Total power display
    this.totalPowerText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(30), '총 전투력: 0', {
      fontSize: sf(16),
      fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // T-Q3: 권장 전투력 대비 부족 경고 (UX §2-5 / 시스템 §B-4 표시 의무).
    // 진입을 막지 않는다. 못 이긴다는 사실을 숫자로 보여주고 강화 동선만 준다.
    this.wallWarningText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(140), '', {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", Arial',
      color: '#F97316',
      fontStyle: 'bold'
    }).setOrigin(0.5).setVisible(false);

    // CTA 는 라벨이 바뀔 때마다(`updateWallWarning`) 히트 영역을 다시 잡는다 —
    // 빈 문자열 상태의 폭(0)으로 굳으면 QA P2-1 의 106×17 이 그대로 남는다.
    this.wallCtaText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(118), '', {
      fontSize: sf(13),
      fontFamily: '"Noto Sans KR", Arial',
      color: '#38BDF8'
    }).setOrigin(0.5).setVisible(false);
    ensureMinTouchTarget(this.wallCtaText);

    this.wallCtaText.on('pointerup', () => {
      if (!this._wallCtaKey) return;
      this.scene.start('MainMenuScene', { openPopup: this._wallCtaKey });
    });

    this.partyModal.add([
      overlay, modalBg, this.modalTitle, this.stageInfoText,
      ...this.partySlots.map(slot => slot.container),
      autoBtn, startBtn, closeBtn, this.totalPowerText,
      this.wallWarningText, this.wallCtaText
    ]);
  }

  /**
   * 파티 선택 모달이 서 있는지 보장한다.
   *
   * create() 가 끝나기 전이거나 표현 계층이 실패해 create() 가 중단된 상태에서
   * showPartySelect() 가 불릴 수 있다(외부 호출·e2e 포함). 그때 모달을 그 자리에서
   * 다시 세운다. 없는 참조에 setText 를 걸어 TypeError 로 죽는 것보다 낫다.
   * @returns {boolean} 모달을 쓸 수 있는가
   */
  ensurePartySelectModal() {
    if (this.stageInfoText && this.partyModal && this.partySlots?.length) return true;
    try {
      this.createPartySelectModal();
      return !!(this.stageInfoText && this.partyModal);
    } catch (error) {
      console.error('[StageSelectScene] 파티 선택 모달 생성 실패:', error);
      return false;
    }
  }

  /**
   * 소탕 모달이 서 있는지 보장한다. 이유는 ensurePartySelectModal 과 같다.
   * @returns {boolean}
   */
  ensureSweepModal() {
    if (this.sweepModal && this.sweepStageInfo && this.sweepCountBtns?.length) return true;
    try {
      this.createSweepModal();
      return !!(this.sweepModal && this.sweepStageInfo);
    } catch (error) {
      console.error('[StageSelectScene] 소탕 모달 생성 실패:', error);
      return false;
    }
  }

  showPartySelect() {
    if (!this.selectedStage) return;
    if (!this.ensurePartySelectModal()) return;

    const recommended = Number(this.selectedStage.recommendedPower) || 0;
    this.stageInfoText.setText(`${this.selectedStage.name} | 추천 전투력: ${recommended.toLocaleString()}`);

    // 저장된 편성을 복원한다. 모달을 열 때마다 비우면 파티 편성 화면의 결과가 버려지고
    // 벽 경고가 항상 0.00×가 되어 난이도 안내가 무의미해진다 (QA P1-1).
    this.applyPartySlots(this.resolveSavedParty());

    this.updateTotalPower();
    this.updateSynergyPreview();
    this.partyModal.setVisible(true);
  }

  /**
   * 모달에 세울 파티를 정한다 — 세이브 `parties[0]` 우선, 비어 있으면 보유 상위 4인.
   * 판정은 `PartyManager.resolveDisplayParty`(순수)가 하고 여기서는 세이브만 읽는다.
   * @returns {Array<Object|null>} 슬롯 수만큼의 영웅 객체 배열
   */
  resolveSavedParty() {
    const heroes = this.registry.get('ownedHeroes') || [];
    let slotIds = [];
    try {
      const save = SaveManager.load();
      slotIds = SaveManager._readPartySlots(save?.parties?.[0]);
    } catch (error) {
      GameLogger.log('SCENE', '저장된 파티 읽기 실패', { error: error?.message });
    }
    return PartyManager.resolveDisplayParty(slotIds, heroes, this.partySlots.length);
  }

  /**
   * 슬롯 표시를 주어진 편성으로 덮어쓴다. null 슬롯은 빈 칸(`+`)이 된다.
   * @param {Array<Object|null>} heroes
   */
  applyPartySlots(heroes) {
    const list = Array.isArray(heroes) ? heroes : [];
    this.partySlots.forEach((slot, i) => {
      const hero = list[i] || null;
      slot.hero = hero;
      slot.slotText.setText(hero ? String(hero.name || '???').substring(0, 4) : '+');
      slot.slotBg.setStrokeStyle(2, hero ? COLORS.success : COLORS.primary, hero ? 1 : 0.5);
    });
  }

  hidePartySelect() {
    this.partyModal.setVisible(false);
    this.selectedStage = null;
  }

  selectHeroForSlot(slotIndex) {
    const heroes = this.registry.get('ownedHeroes') || [];

    if (heroes.length === 0) {
      this.showMessage('보유한 영웅이 없습니다!');
      return;
    }

    // Get heroes not already in party
    const partyHeroIds = this.partySlots
      .filter(slot => slot.hero)
      .map(slot => slot.hero.id);

    const availableHeroes = heroes.filter(h => !partyHeroIds.includes(h.id));

    if (availableHeroes.length === 0) {
      // Toggle off if clicking filled slot
      if (this.partySlots[slotIndex].hero) {
        this.partySlots[slotIndex].hero = null;
        this.partySlots[slotIndex].slotText.setText('+');
        this.partySlots[slotIndex].slotBg.setStrokeStyle(2, COLORS.primary, 0.5);
        this.updateTotalPower();
      } else {
        this.showMessage('사용 가능한 영웅이 없습니다!');
      }
      return;
    }

    // Simple: assign first available hero
    const hero = availableHeroes[0];
    this.partySlots[slotIndex].hero = hero;
    this.partySlots[slotIndex].slotText.setText(hero.name.substring(0, 4));
    this.partySlots[slotIndex].slotBg.setStrokeStyle(2, COLORS.success, 1);

    this.updateTotalPower();
    this.updateSynergyPreview();
  }

  autoFillParty() {
    if (!this.ensurePartySelectModal()) return;
    const heroes = this.registry.get('ownedHeroes') || [];

    if (heroes.length === 0) {
      this.showMessage('보유한 영웅이 없습니다!');
      return;
    }

    // PartyManager로 자동 편성
    const recommendedIds = PartyManager.autoFormParty(heroes);
    this.applyPartySlots(
      PartyManager.resolvePartyHeroes(recommendedIds, heroes, this.partySlots.length)
    );

    this.updateTotalPower();
    this.updateSynergyPreview();
    this.showMessage('자동 편성 완료!', COLORS.success);
  }

  updateTotalPower() {
    // 카드의 난이도 밴드와 같은 식을 쓴다(stageSelectLayout.estimateHeroPower).
    // 둘이 다른 숫자를 말하면 벽 경고가 신뢰를 잃는다.
    let total = 0;
    this.partySlots.forEach(slot => {
      if (slot.hero) total += estimateHeroPower(slot.hero);
    });
    this.totalPowerText.setText(`총 전투력: ${total.toLocaleString()}`);

    // Color code based on recommended
    if (this.selectedStage) {
      const ratio = total / this.selectedStage.recommendedPower;
      let color = COLORS.danger;
      if (ratio >= 1) color = COLORS.success;
      else if (ratio >= 0.8) color = COLORS.accent;
      this.totalPowerText.setColor(`#${  color.toString(16).padStart(6, '0')}`);
    }

    this.updateWallWarning(total);
  }

  /**
   * T-Q3: 권장 전투력 미달 경고 갱신.
   * 판정은 `StageWallRules.buildWallWarning`이 하고 여기서는 그리기만 한다.
   * @param {number} totalPower 현재 편성의 총 전투력
   */
  updateWallWarning(totalPower) {
    if (!this.wallWarningText || !this.wallCtaText) return;

    if (!this.selectedStage) {
      this.wallWarningText.setVisible(false);
      this.wallCtaText.setVisible(false);
      return;
    }

    let ascendableCount = 0;
    try {
      ascendableCount = countAscendableHeroes(SaveManager.load());
    } catch (e) {
      GameLogger.log('SCENE', '각인 가능 영웅 수 계산 실패', { error: e?.message });
    }

    const warning = buildWallWarning(
      totalPower,
      this.selectedStage.recommendedPower,
      { ascendableCount }
    );

    this._wallCtaKey = warning.ctaKey || null;
    this.wallWarningText
      .setText(warning.text)
      .setColor(`#${warning.color.toString(16).padStart(6, '0')}`)
      .setVisible(warning.visible);
    this.wallCtaText
      .setText(warning.ctaLabel ? `▸ ${warning.ctaLabel}` : '')
      .setVisible(warning.visible && Boolean(warning.ctaLabel));
    // 라벨 폭이 바뀌었으니 히트 영역을 새 글리프 중앙에 다시 건다 (QA P2-1)
    ensureMinTouchTarget(this.wallCtaText);
  }

  /**
   * 시너지 미리보기 표시
   */
  updateSynergyPreview() {
    // 기존 시너지 미리보기 제거
    if (this.synergyPreviewTexts) {
      this.synergyPreviewTexts.forEach(t => t.destroy());
    }
    this.synergyPreviewTexts = [];

    const partyHeroIds = this.partySlots
      .filter(slot => slot.hero)
      .map(slot => slot.hero.id)
      .filter(Boolean);

    if (partyHeroIds.length < 2) return;

    const heroData = getAllCharacters();
    const synergies = SynergySystem.calculatePartySynergies(partyHeroIds, heroData);

    if (synergies.length === 0) return;

    const baseY = GAME_HEIGHT / 2 + s(110);

    synergies.slice(0, 3).forEach((syn, i) => {
      const text = this.add.text(GAME_WIDTH / 2, baseY + i * s(18), `${syn.name || syn.type}`, {
        fontSize: sf(11),
        fontFamily: 'Arial',
        color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5).setDepth(DEPTH.SWEEP);
      this.partyModal.add(text);
      this.synergyPreviewTexts.push(text);
    });
  }

  startBattle() {
    if (!this.ensurePartySelectModal()) return;
    const partyHeroes = this.partySlots
      .filter(slot => slot.hero)
      .map(slot => slot.hero);

    if (partyHeroes.length === 0) {
      this.showMessage('파티에 영웅을 배치해주세요!');
      return;
    }

    // 에너지 차감 (스테이지 비용 계산)
    const stageType = this.selectedStage?.type || 'NORMAL';
    const stageCost = energySystem.getStageCost(stageType);
    const consumeResult = energySystem.consumeEnergy(stageCost);

    if (!consumeResult.success) {
      this.showMessage(`에너지가 부족합니다! (필요: ${stageCost})`, COLORS.danger);
      return;
    }

    // 에너지 UI 업데이트
    this.refreshEnergyDisplay();

    // Save party to registry
    this.registry.set('currentTeam', partyHeroes);

    GameLogger.log('SCENE', `스테이지 선택: ${this.selectedStage?.name || this.selectedStage?.id}`, { chapter: this.currentChapter, partySize: partyHeroes.length, energy: consumeResult.currentEnergy });

    // T-Q1: 스토리 컷씬 트리거 (chapter_enter → stage_enter → 전투)
    // 보스 스테이지는 stage_enter를 정의하지 않고 BattleScene의 boss_before를 쓴다(내러티브 §5-3).
    const stage = this.selectedStage;
    const stageId = stage?.id;
    const chapterId = `chapter_${this.currentChapter}`;
    const isChapterFirstStage = typeof stageId === 'string' && stageId.endsWith('-1');
    const triggers = isChapterFirstStage ? ['chapter_enter', 'stage_enter'] : ['stage_enter'];

    StoryManager.triggerSequence(triggers, {
      scene: this,
      stageId,
      chapterId,
      onComplete: () => {
        transitionManager.battleEntryTransition(this, {
          stage,
          party: partyHeroes
        });
      }
    });
  }

  /**
   * 에너지 UI 갱신
   */
  refreshEnergyDisplay() {
    const status = energySystem.getStatus();
    if (this.energyText) {
      this.energyText.setText(`${status.current}/${status.max}`);
    }
  }

  /**
   * 에너지 회복 타이머 업데이트
   */
  updateEnergyTimer() {
    if (!this.energyTimerText) return;

    const status = energySystem.getStatus();
    if (status.current >= status.max) {
      this.energyTimerText.setText('');
      return;
    }

    if (status.recoveryInfo && status.recoveryInfo.formatted) {
      this.energyTimerText.setText(`회복: ${status.recoveryInfo.formatted}`);
    }

    // 30초마다 갱신
    this.time.delayedCall(30000, () => {
      this.refreshEnergyDisplay();
      this.updateEnergyTimer();
    });
  }

  // ================================================================
  // 소탕 모달 (기능 불변)
  // ================================================================

  createSweepModal() {
    this.sweepModal = this.add.container(0, 0).setDepth(DEPTH.SWEEP).setVisible(false);

    // Overlay
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    overlay.setInteractive();
    overlay.on('pointerdown', () => this.hideSweepModal());

    // Modal background (라운드 코너 s(16))
    const sweepModalBg = this.add.graphics();
    sweepModalBg.fillStyle(COLORS.backgroundLight, 0.95);
    sweepModalBg.fillRoundedRect(GAME_WIDTH / 2 - s(170), GAME_HEIGHT / 2 - s(160), s(340), s(320), s(16));
    sweepModalBg.lineStyle(s(2), COLORS.primary, 1);
    sweepModalBg.strokeRoundedRect(GAME_WIDTH / 2 - s(170), GAME_HEIGHT / 2 - s(160), s(340), s(320), s(16));

    // Title
    this.sweepTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(130), '소탕', {
      fontSize: sf(20), fontFamily: 'Georgia, serif',
      color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Stage info
    this.sweepStageInfo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(100), '', {
      fontSize: sf(13), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Cost info
    this.sweepCostInfo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(75), '', {
      fontSize: sf(12), fontFamily: 'Arial',
      color: `#${  COLORS.accent.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Count buttons (1, 3, 5, 10)
    const counts = [1, 3, 5, 10];
    this.sweepCountBtns = [];
    const btnY = GAME_HEIGHT / 2 - s(25);

    counts.forEach((count, i) => {
      const btnX = GAME_WIDTH / 2 - s(120) + i * s(80);
      const bg = this.add.rectangle(btnX, btnY, s(65), s(50), COLORS.background, 0.9)
        .setStrokeStyle(s(2), COLORS.primary, 0.5)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(btnX, btnY - s(8), `×${count}`, {
        fontSize: sf(18), fontFamily: 'Arial',
        color: `#${  COLORS.text.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold'
      }).setOrigin(0.5);
      const costLabel = this.add.text(btnX, btnY + s(14), '', {
        fontSize: sf(10), fontFamily: 'Arial',
        color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
      }).setOrigin(0.5);

      bg.on('pointerover', () => bg.setStrokeStyle(s(2), COLORS.accent));
      bg.on('pointerout', () => bg.setStrokeStyle(s(2), COLORS.primary, 0.5));
      bg.on('pointerdown', () => this.executeSweep(this._sweepStage, count));

      this.sweepCountBtns.push({ bg, label, costLabel, count });
      this.sweepModal.add([bg, label, costLabel]);
    });

    // Daily remaining info
    this.sweepDailyInfo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(40), '', {
      fontSize: sf(11), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Tickets info
    this.sweepTicketInfo = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + s(60), '', {
      fontSize: sf(11), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    // Close button — 글리프는 20×22 지만 히트는 터치 하한까지 넓힌다 (QA P2-1)
    const closeBtn = this.add.text(GAME_WIDTH / 2 + s(155), GAME_HEIGHT / 2 - s(145), '✕', {
      fontSize: sf(20), fontFamily: 'Arial',
      color: `#${  COLORS.textDark.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);
    ensureMinTouchTarget(closeBtn);
    closeBtn.on('pointerdown', () => this.hideSweepModal());

    this.sweepModal.add([overlay, sweepModalBg, this.sweepTitle, this.sweepStageInfo,
      this.sweepCostInfo, this.sweepDailyInfo, this.sweepTicketInfo, closeBtn]);
  }

  showSweepModal(stage) {
    if (!this.ensureSweepModal()) return;
    this._sweepStage = stage;
    const cost = stage.energyCost || 6;
    const status = energySystem.getStatus();
    const daily = sweepSystem.getDailyRemaining();
    const tickets = sweepSystem.sweepTickets || 0;

    this.sweepStageInfo.setText(`${stage.name || stage.id} (에너지 ${cost}/회)`);
    this.sweepDailyInfo.setText(`일일 소탕: ${daily.used || 0}/${daily.limit || 50}`);
    this.sweepTicketInfo.setText(`소탕권: ${tickets}장`);

    // Update each count button availability
    this.sweepCountBtns.forEach(({ bg, label, costLabel, count }) => {
      const totalCost = cost * count;
      const canAfford = status.current >= totalCost;
      const canDaily = (daily.remaining || 50) >= count;
      const canTicket = tickets >= count;
      const available = canAfford && canDaily && canTicket;

      costLabel.setText(`에너지 ${totalCost}`);
      bg.setAlpha(available ? 1 : 0.4);
      label.setAlpha(available ? 1 : 0.4);
      bg.setInteractive(available ? { useHandCursor: true } : false);
      if (!available) bg.disableInteractive();
      else bg.setInteractive({ useHandCursor: true });
    });

    this.sweepCostInfo.setText(`보유 에너지: ${status.current}/${status.max}`);
    this.sweepModal.setVisible(true);
  }

  hideSweepModal() {
    this.sweepModal.setVisible(false);
    this._sweepStage = null;
  }

  executeSweep(stage, count = 1) {
    if (!stage) return;

    const canSweep = sweepSystem.canSweep(stage.id, count);
    if (canSweep.canSweep === false) {
      this.showMessage(canSweep.reasons?.[0] || '소탕 불가!', COLORS.danger);
      return;
    }

    const cost = (stage.energyCost || 6) * count;
    const status = energySystem.getStatus();
    if (status.current < cost) {
      this.showMessage('에너지가 부족합니다!', COLORS.danger);
      return;
    }

    // 소탕 실행
    GameLogger.log('SCENE', `소탕 실행: ${stage.name || stage.id} x${count}`, { energyCost: cost });
    const result = sweepSystem.executeSweep(stage.id, count);
    if (result && result.success) {
      energySystem.consumeEnergy(cost);

      // 보상 지급
      let totalGold = 0;
      let totalExp = 0;
      if (result.rewards) {
        totalGold = result.rewards.gold || 0;
        totalExp = result.rewards.exp || 0;
        if (totalGold > 0) {
          const newGold = SaveManager.addGold(totalGold);
          this.registry.set('gold', newGold);
        }
      }

      this.hideSweepModal();
      this.refreshEnergyDisplay();
      this.showMessage(
        `${count}회 소탕 완료! 골드 +${totalGold} 경험치 +${totalExp}`,
        COLORS.success
      );
    } else {
      this.showMessage(result?.error || '소탕 실패!', COLORS.danger);
    }
  }

  shutdown() {
    this.time.removeAllEvents();
    this.tweens.killAll();
    if (this.input) {
      this.input.removeAllListeners();
    }
    this._scrollBound = false;
    if (this._listMask) {
      this._listMask.destroy();
      this._listMask = null;
    }
    if (this.energyTimer) {
      this.energyTimer.remove();
      this.energyTimer = null;
    }
  }

  showMessage(text, color = COLORS.text) {
    const msg = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - s(100), text, {
      fontSize: sf(18),
      fontFamily: 'Arial',
      color: `#${  color.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${  COLORS.background.toString(16).padStart(6, '0')}`,
      padding: { x: s(20), y: s(12) }
    }).setOrigin(0.5).setDepth(DEPTH.TOAST);

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
