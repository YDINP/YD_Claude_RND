/**
 * GachaResultOverlay.js — 소환 결과 5단계 연출 (REDESIGN_PLAN §3-2, T-14)
 *
 *   1. circle  소환진 등장      — fx_summon_circle 회전 확대. 없으면 벡터 룬 원 폴백
 *   2. pillar  등급 색 빛기둥    — 최고 등급 색으로 화면을 세로로 가르는 광주
 *   3. flip    카드 뒤집기       — 뒷면→앞면 scaleX 0→1 Back.easeOut. 10연은 순차 공개
 *   4. cutin   SSR 컷인          — 전신 시트 + 교단색 폭발 (SSR 이 없으면 통째로 생략)
 *   5. grid    결과 그리드       — 글래스 패널 + 카드 + [다시 소환] [확인]
 *
 * 시간축과 상태 전이는 전부 `utils/gachaRevealSequence.js`(순수 함수)가 계산한다.
 * 이 파일은 Phaser 렌더와 입력만 맡는다.
 *
 * ## 반드시 지켜야 하는 것
 * - **호출부의 라이프사이클에 묶는다.** 이 오버레이는 팝업 컨테이너의 자식이 아니라
 *   씬 루트에 붙는 depth 3010 전면 레이어다. 팝업만 닫고 여기를 남기면 전체 화면
 *   입력을 삼킨다. GachaPopup/GachaScene 은 자기 destroy()/shutdown() 에서 반드시
 *   이 인스턴스의 destroy() 를 부른다.
 * - **[확인] 은 결과 그리드가 아니라 카드 공개가 끝나는 시점에 생긴다.** 온보딩 e2e
 *   (T-05)가 무료 10연 후 6초 안에 '확인' 라벨을 탭한다. 컷인까지 기다리면 위험하다.
 * - **스킵은 1단계부터 항상 활성**이다(§3-2 5행).
 *
 * 저사양 대비 파티클 상한은 resolveQualityTier()/resolveParticleBudget() 가 정한다.
 *
 * 주의: gameConfig/designSystem 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */
import Phaser from 'phaser';
import { COLORS, GAME_WIDTH, GAME_HEIGHT, RARITY, s } from '../config/gameConfig.js';
import { DESIGN, getCultColor, getRarityColors } from '../config/designSystem.js';
import { ts } from '../utils/textStyles.ts';
import { getRarityKey, getRarityNum } from '../utils/rarityUtils.js';
import { getCharacterOrHero } from '../data/index.js';
import { HeroAssetLoader } from '../systems/HeroAssetLoader.js';
import { soundManager } from '../systems/SoundManager.js';
import { GlassPanel, GLASS_VARIANT } from './GlassPanel.js';
import { NineSliceFrame, CARD_FRAME_BY_RARITY } from './NineSliceFrame.js';
import { resolveFullbodyKey, fullbodyPath, hasFullbodyAsset } from '../utils/heroDetailLayout.js';
import PORTRAIT_MAP from '../data/portrait-mapping.json';
import CULTS_DATA from '../data/cults.json';
import ASSET_MANIFEST from '../../tools/art/asset-manifest.json';
import { SUMMON_CIRCLE_TEXTURE } from '../utils/gachaBannerLayout.js';
import { MOOD_PARTICLE_COLORS } from '../config/particleConfig.js';
import {
  CUTIN_ENTER,
  CUTIN_POSE,
  CUTIN_FORMAT,
  resolveCutin,
  resolveAssetKey,
  resolveQuoteText,
  typewriterSlice,
  cssToHex
} from '../utils/gachaCutinPresets.js';
import { ensureTextureFromPath } from '../utils/lazyTexture.js';
import {
  REVEAL_STAGE,
  buildRevealPlan,
  createRevealState,
  advance,
  revealAllCards,
  skipToGrid,
  isTerminal,
  findStage,
  gridLayout,
  cutinTargets,
  resolveQualityTier
} from '../utils/gachaRevealSequence.js';

/**
 * 루트 depth. 튜토리얼 콘텐츠(Z_INDEX.TUTORIAL_CONTENT = 3010)와 같은 값이며
 * 나중에 추가되므로 그 위에 그려진다. 리디자인 이전 결과 컨테이너와 동일한 층이다.
 */
export const OVERLAY_DEPTH = 3010;

/**
 * 루트 컨테이너 이름. 씬 정리 경로(MainMenuScene.destroyOrphanPopups)가
 * 같은 depth 층의 튜토리얼 코치마크와 이 오버레이를 구분하는 유일한 표식이다.
 */
export const OVERLAY_ROOT_NAME = 'gacha-result-overlay';

/** base 좌표계 그리드 규격 */
const GRID = Object.freeze({
  single: { cols: 1, cellW: 0, cellH: 0, cardW: 300, cardH: 420, centerY: 690 },
  multi: { cols: 5, cellW: 128, cellH: 182, cardW: 112, cardH: 156, top: 566 }
});

/**
 * 결과 패널 구획 (base px).
 * 카드 수에 따라 아래 끝이 달라진다 — 10연 그리드(2행)와 단발 카드 1장은 필요한 높이가 다르고,
 * 고정하면 한쪽은 아래가 텅 빈다.
 */
const PANEL = Object.freeze({ left: 30, right: 690, top: 392, bottomMulti: 884, bottomSingle: 952 });

/** 액션 바 (base px) */
const ACTION_BAR = Object.freeze({ y: 1092, h: 84, margin: 96, gap: 16 });

/** 스킵 버튼 (base px) */
const SKIP_BTN = Object.freeze({ x: 620, y: 92, w: 148, h: 56 });

/**
 * SSR 컷인 구획 (base px).
 * 타이포는 위, 인물은 가운데, 액션 바(y=1092)는 아래 — 셋이 서로 침범하지 않는다.
 */
const CUTIN = Object.freeze({
  gradeY: 176,
  nameY: 244,
  bandY: 280,
  quoteY: 322,
  quoteWidth: 600,
  emblemY: 560,
  emblemSize: 340,
  burstY: 640,
  figureBaseY: 1020,
  figureH: 700,
  figureMaxW: 540,
  /** pose 별 인물 가로 오프셋. 타이포는 반대쪽으로 밀린다 */
  poseOffsetX: 74,
  textShiftX: 46
});

export class GachaResultOverlay {
  /**
   * @param {Phaser.Scene} scene
   * @param {Object} [options]
   * @param {Function} [options.onClose] - [확인] 또는 destroy() 후 호출
   * @param {Function} [options.onPullAgain] - 있으면 [다시 소환] 버튼이 생긴다
   * @param {string} [options.quality] - QUALITY_TIER 강제 지정 (미지정 시 자동 판정)
   * @param {Object} [options.durations] - 단계별 지속시간 덮어쓰기 (캡처·디버깅용)
   * @param {number} [options.depth] - 루트 depth. 기본 OVERLAY_DEPTH
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.onClose = typeof options.onClose === 'function' ? options.onClose : null;
    this.onPullAgain = typeof options.onPullAgain === 'function' ? options.onPullAgain : null;
    this.depth = Number.isFinite(options.depth) ? options.depth : OVERLAY_DEPTH;
    this.forcedQuality = options.quality || null;
    this.durations = options.durations || null;

    this.root = null;
    this.plan = null;
    this.state = null;
    this.results = [];
    this.cards = [];
    this.timers = [];
    this.tweens = [];
    this.destroyed = false;
    this.actionBarBuilt = false;
    this._fullbodyKey = null;
    this._cutinTextureKey = null;
    this._sceneCleanup = null;
    /** heroId → 전신 시트 텍스처 키 (컷인 대상별) */
    this._cutinTextures = new Map();
    /** 이 오버레이가 직접 등록한 텍스처 키. 연출이 끝나면 되돌린다(메모리 규칙) */
    this._ownedTextures = new Set();
    /** 컷인 타이프라이터 타이머 */
    this._quoteTimer = null;
    this.quoteText = null;
    this.skipButton = null;
    this.revealAllButton = null;
    this.actionButtons = [];
    this.actionBarEnabled = false;
  }

  // ================================================================
  // 라이프사이클
  // ================================================================

  /**
   * 연출을 시작한다.
   * @param {Array<{id:string,name:string,rarity:string,cult?:string}>} results
   * @returns {GachaResultOverlay} this
   */
  show(results) {
    if (this.root || this.destroyed) return this;

    this.results = Array.isArray(results) ? results : [];
    this.plan = buildRevealPlan(this.results, {
      quality: this._quality(),
      durations: this.durations || undefined
    });
    this.state = createRevealState(this.plan);

    this.accent = this._rarityColor(this.plan.best);
    this.cultColor = this._cultColorOf(this._heroFor(this.plan.best));

    // 어떤 경로로 끝나든 고아가 남지 않게 씬 종료에 스스로를 건다.
    // 이 오버레이는 팝업이 닫힌 뒤에도 살아남을 수 있으므로(아래 detach 설명) 이 안전장치가 유일한 하한이다.
    this.ensureSceneCleanup();

    this.root = this.scene.add.container(0, 0).setDepth(this.depth);
    // 이름과 역참조는 씬의 고아 회수 경로가 쓴다. 같은 depth 에 튜토리얼 코치마크가 있으므로
    // 이름 없이 depth 만으로 판정하면 코치마크까지 부순다 (QA P1-3).
    this.root.setName(OVERLAY_ROOT_NAME);
    this.root.__gachaResultOverlay = this;

    this.scrim = this._buildScrim();
    this.panelLayer = this.scene.add.container(0, 0).setAlpha(0);
    this.fxLayer = this.scene.add.container(0, 0);
    this.cardLayer = this.scene.add.container(0, 0);
    this.cutinLayer = this.scene.add.container(0, 0);
    this.uiLayer = this.scene.add.container(0, 0);

    this.root.add([this.scrim, this.panelLayer, this.fxLayer, this.cardLayer, this.cutinLayer, this.uiLayer]);

    this._buildResultPanel();
    this._buildSkipButton();

    // 액션 바는 **시작과 동시에** 만든다.
    // Phaser 의 시간은 프레임 델타 누적이라 저사양/헤드리스에서 실제 시간보다 느리게 흐른다.
    // 카드 공개가 끝난 뒤에 [확인] 을 만들면 그 시점이 예측 불가능해진다
    // (온보딩 e2e 는 무료 10연 후 6초 안에 '확인' 을 찾는다).
    // 대신 카드가 다 열리기 전에는 잠가 둔다 — 자리를 미리 보여 주고 준비되면 켜진다.
    this._buildActionBar();
    this._setActionBarEnabled(false);

    // 컷인이 있으면 전신 시트를 지금 예약한다. 4단계까지 약 2.4초가 남아 대개 늦지 않는다.
    if (this.plan.hasCutin) this._queueCutinAssets();

    this._enterStage(REVEAL_STAGE.CIRCLE);
    return this;
  }

  /**
   * 씬 shutdown/destroy 에 자기 파괴를 건다 (멱등).
   *
   * 팝업이 소유권을 놓고 사라지는 경로(GachaPopup._detachSummonOverlay)에서도
   * 이 고리가 반드시 살아 있어야 씬 전환 때 오버레이가 회수된다.
   * @returns {boolean} 고리가 걸려 있는가
   */
  ensureSceneCleanup() {
    if (this.destroyed || !this.scene?.events) return false;
    if (this._sceneCleanup) return true;
    this._sceneCleanup = () => this.destroy();
    this.scene.events.once('shutdown', this._sceneCleanup);
    this.scene.events.once('destroy', this._sceneCleanup);
    return true;
  }

  /** 연출을 건너뛰고 결과 그리드로 직행한다 */
  skip() {
    if (this.destroyed || !this.state || isTerminal(this.state)) return;
    this._clearTimers();
    this.state = skipToGrid(this.state, this.plan);
    this._stopQuote();
    this.fxLayer.removeAll(true);
    this.cutinLayer.removeAll(true);
    this._revealAllCards(true);
    this._setActionBarEnabled(true);
    this._enterGrid();
  }

  /** 남은 카드를 한 번에 공개한다 (10연 [일괄 공개]) */
  revealAll() {
    if (this.destroyed || !this.state) return;
    this.state = revealAllCards(this.state, this.plan);
    this._revealAllCards(false);
  }

  /** 모든 표시물과 타이머를 정리한다. 호출부의 destroy 에서 반드시 부를 것 */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this._clearTimers();
    this.tweens.forEach((tween) => { if (tween && tween.remove) tween.remove(); });
    this.tweens = [];

    if (this._sceneCleanup && this.scene?.events) {
      this.scene.events.off('shutdown', this._sceneCleanup);
      this.scene.events.off('destroy', this._sceneCleanup);
    }
    this._sceneCleanup = null;

    // 전신 시트 텍스처는 지우지 않는다.
    // GachaBannerPanel 이 같은 키(fb_hero_XXX)로 픽업 인물을 세워 두는 경우가 있고,
    // 둘이 동시에 로드를 걸면 어느 쪽이 먼저 등록했는지 알 수 없다.
    // 여기서 지우면 아직 살아 있는 배너 Image 가 사라진 텍스처를 참조해
    // 렌더러가 glTexture null 로 터진다. 시트 1장(약 200KB)을 남기는 편이 싸다.
    if (this.root) {
      this.root.destroy(true);
      this.root = null;
    }
    this.cards = [];
    this._stopQuote();
    this.quoteText = null;
    this._releaseOwnedTextures();
    this._fullbodyKey = null;

    if (this.onClose) {
      const cb = this.onClose;
      this.onClose = null;
      cb();
    }
  }

  /** 연출이 끝나 결과 그리드에 도달했는가 */
  get isSettled() {
    return !!this.state && isTerminal(this.state);
  }

  // ================================================================
  // 단계 진행
  // ================================================================

  /** @private 단계 진입 + 다음 단계 예약 */
  _enterStage(stageId) {
    if (this.destroyed) return;
    const stage = findStage(this.plan, stageId);
    if (!stage) return;

    this._playStageSFX(stageId);

    if (stageId === REVEAL_STAGE.CIRCLE) this._playCircle(stage);
    else if (stageId === REVEAL_STAGE.PILLAR) this._playPillar(stage);
    else if (stageId === REVEAL_STAGE.FLIP) this._playFlip(stage);
    else if (stageId === REVEAL_STAGE.CUTIN) this._playCutin(stage);
    else if (stageId === REVEAL_STAGE.GRID) { this._enterGrid(); return; }

    this._delay(stage.duration, () => {
      if (this.destroyed || isTerminal(this.state)) return;
      this.state = advance(this.state, this.plan);
      this._enterStage(this.state.stageId);
    });
  }

  /**
   * @private SND-02: 소환 연출 단계별 효과음.
   * 마법진·기둥은 기대감 스윕, SSR 컷인은 전용 임팩트를 낸다.
   */
  _playStageSFX(stageId) {
    if (stageId === REVEAL_STAGE.CIRCLE) soundManager.playSFX('gacha_pull');
    else if (stageId === REVEAL_STAGE.PILLAR) soundManager.playSFX('skill_cast');
    else if (stageId === REVEAL_STAGE.CUTIN) soundManager.playSFX('gacha_ssr');
  }

  /** @private 종착 — 글래스 패널을 띄우고 카드를 정착시킨다 */
  _enterGrid() {
    if (this.destroyed) return;
    // skipToGrid 는 skipped 플래그를 세우므로 자연 종료에는 쓰지 않는다
    this.state = { ...this.state, stageId: REVEAL_STAGE.GRID, revealed: this.plan.count, done: true };

    this._stopQuote();
    this.fxLayer.removeAll(true);
    this.cutinLayer.removeAll(true);
    this._destroyRevealAllButton();
    if (this.skipButton) { this.skipButton.destroy(true); this.skipButton = null; }

    this._setActionBarEnabled(true);

    this._tween({
      targets: this.panelLayer,
      alpha: 1,
      duration: 260,
      ease: 'Quad.easeOut'
    });
  }

  // ================================================================
  // 1단계 — 소환진
  // ================================================================

  /** @private */
  _playCircle(stage) {
    const cx = GAME_WIDTH / 2;
    const cy = s(660);

    const circle = this._createSummonCircle(cx, cy);
    this.fxLayer.add(circle);

    circle.setAlpha(0).setScale(0.25);
    this._tween({
      targets: circle,
      scale: 1,
      alpha: 0.95,
      rotation: Math.PI * 0.75,
      duration: stage.duration,
      ease: 'Cubic.easeOut'
    });

    // 바깥에서 안으로 빨려드는 입자. 소환진이 무언가를 끌어당기고 있다는 신호다
    const count = Math.round(this.plan.particleCount * 0.5);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const radius = s(280 + Math.random() * 160);
      const dot = this.scene.add.circle(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        s(2 + Math.random() * 2),
        this.accent,
        0.9
      );
      this.fxLayer.add(dot);
      this._tween({
        targets: dot,
        x: cx,
        y: cy,
        alpha: 0,
        duration: stage.duration + Math.random() * 260,
        delay: i * 8,
        ease: 'Quad.easeIn'
      });
    }
  }

  /**
   * 소환진 표시물. `fx_summon_circle` 이 있으면 그것을 틴트해 쓰고,
   * 없으면(알파 미생성/미배포) 벡터 룬 원을 그린다. 폴백은 필수다.
   * @private
   * @returns {Phaser.GameObjects.GameObject}
   */
  _createSummonCircle(cx, cy) {
    if (this.scene.textures.exists(SUMMON_CIRCLE_TEXTURE)) {
      const image = this.scene.add.image(cx, cy, SUMMON_CIRCLE_TEXTURE);
      image.setDisplaySize(s(520), s(520));
      image.setTint(this.accent);
      image.setBlendMode(Phaser.BlendModes.ADD);
      return image;
    }
    return this._createVectorSummonCircle(cx, cy);
  }

  /**
   * 벡터 소환진 폴백 — 동심 룬 링 3겹 + 방사 눈금 + 안쪽 회전 사각형.
   * @private
   * @returns {Phaser.GameObjects.Container}
   */
  _createVectorSummonCircle(cx, cy) {
    const container = this.scene.add.container(cx, cy);
    const r = s(220);

    const rings = this.scene.add.graphics();
    rings.lineStyle(s(3), this.accent, 0.9);
    rings.strokeCircle(0, 0, r);
    rings.lineStyle(s(2), this.accent, 0.55);
    rings.strokeCircle(0, 0, r * 0.78);
    rings.lineStyle(s(1), this.accent, 0.35);
    rings.strokeCircle(0, 0, r * 0.46);

    // 방사 눈금 24개 — 링 사이를 잇는 짧은 선
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const long = i % 3 === 0;
      const inner = long ? r * 0.78 : r * 0.88;
      rings.lineStyle(long ? s(3) : s(1), this.accent, long ? 0.85 : 0.4);
      rings.lineBetween(
        Math.cos(a) * inner, Math.sin(a) * inner,
        Math.cos(a) * r, Math.sin(a) * r
      );
    }

    // 안쪽 룬 — 45도 돌린 사각형 둘이 겹쳐 팔각을 만든다
    const runes = this.scene.add.graphics();
    runes.lineStyle(s(2), this.accent, 0.7);
    [0, Math.PI / 4].forEach((rot) => {
      const pts = [0, 1, 2, 3].map((k) => {
        const a = rot + (k / 4) * Math.PI * 2;
        return { x: Math.cos(a) * r * 0.46, y: Math.sin(a) * r * 0.46 };
      });
      runes.beginPath();
      runes.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => runes.lineTo(p.x, p.y));
      runes.closePath();
      runes.strokePath();
    });

    container.add([rings, runes]);
    return container;
  }

  // ================================================================
  // 2단계 — 등급 색 빛기둥
  // ================================================================

  /** @private */
  _playPillar(stage) {
    const cx = GAME_WIDTH / 2;
    const cy = s(660);

    // 세로 광주. 알파가 다른 사각형 3겹을 겹쳐 그라디언트 대신 쓴다
    const beam = this.scene.add.container(cx, cy);
    [
      { w: s(300), alpha: 0.14 },
      { w: s(170), alpha: 0.26 },
      { w: s(70), alpha: 0.55 }
    ].forEach((layer) => {
      const rect = this.scene.add.rectangle(0, 0, layer.w, GAME_HEIGHT * 1.2, this.accent, layer.alpha);
      beam.add(rect);
    });
    beam.setScale(1, 0);
    this.fxLayer.add(beam);

    this._tween({
      targets: beam,
      scaleY: 1,
      duration: stage.duration,
      ease: 'Cubic.easeOut'
    });
    this._tween({
      targets: beam,
      alpha: { from: 1, to: 0.35 },
      duration: stage.duration,
      delay: stage.duration * 0.5,
      ease: 'Quad.easeIn'
    });

    // 바닥에서 솟는 상승 입자
    const count = Math.round(this.plan.particleCount * 0.4);
    for (let i = 0; i < count; i++) {
      const dot = this.scene.add.circle(
        cx + (Math.random() - 0.5) * s(240),
        cy + s(120 + Math.random() * 200),
        s(2 + Math.random() * 3),
        this.accent,
        0.85
      );
      this.fxLayer.add(dot);
      this._tween({
        targets: dot,
        y: dot.y - s(320 + Math.random() * 220),
        alpha: 0,
        duration: 700 + Math.random() * 400,
        delay: i * 12,
        ease: 'Quad.easeOut'
      });
    }

    if (this.plan.best === 'SSR') this.scene.cameras.main.shake(220, 0.006);
  }

  // ================================================================
  // 3단계 — 카드 뒤집기
  // ================================================================

  /** @private */
  _playFlip(stage) {
    const layout = this._cardLayout();

    this.cards = this.results.map((hero, index) => {
      const pos = layout.positions[index];
      const card = this._createCard(hero, pos.x, pos.y, layout.cardW, layout.cardH);
      card.setScale(0, 1);
      this.cardLayer.add(card);
      return { card, hero, revealed: false, index };
    });

    this.cards.forEach((entry, index) => {
      this._delay(index * this.plan.stagger, () => this._revealCard(entry));
    });

    if (this.results.length > 1) this._buildRevealAllButton();

    // 카드 공개가 끝나면 [확인] 을 포함한 액션 바를 띄운다.
    // 컷인을 기다리지 않는 이유는 파일 상단 주석 참고(온보딩 e2e 6초 예산).
    this._delay(stage.duration, () => {
      this._destroyRevealAllButton();
      this._setActionBarEnabled(true);
    });
  }

  /** @private 카드 1장 공개 */
  _revealCard(entry) {
    if (this.destroyed || !entry || entry.revealed || !entry.card.scene) return;
    entry.revealed = true;

    // SND-02: 카드 뒤집기 — SSR 은 전용 효과음으로 승격
    soundManager.playSFX(entry.hero.rarity === 'SSR' ? 'gacha_ssr' : 'card_flip');

    this._tween({
      targets: entry.card,
      scaleX: 1,
      duration: 260,
      ease: 'Back.easeOut'
    });

    if (entry.hero.rarity === 'SSR' || entry.hero.rarity === 'SR') {
      const color = this._rarityColor(entry.hero.rarity);
      const burst = this.scene.add.circle(entry.card.x, entry.card.y, s(52), color, 0.45);
      this.cardLayer.add(burst);
      this.cardLayer.sendToBack(burst);
      this._tween({
        targets: burst,
        scale: { from: 0.4, to: 2.1 },
        alpha: 0,
        duration: 520,
        ease: 'Cubic.easeOut',
        onComplete: () => burst.destroy()
      });
    }
  }

  /** @private 남은 카드를 즉시 공개 */
  _revealAllCards(instant) {
    this.cards.forEach((entry) => {
      if (entry.revealed) return;
      if (instant) {
        entry.revealed = true;
        entry.card.setScale(1, 1);
      } else {
        this._revealCard(entry);
      }
    });
  }

  /** @private base 좌표 기준 카드 배치 → 렌더 좌표 */
  _cardLayout() {
    const count = this.results.length;
    if (count <= 1) {
      const g = GRID.single;
      return {
        cardW: s(g.cardW),
        cardH: s(g.cardH),
        positions: [{ x: GAME_WIDTH / 2, y: s(g.centerY) }]
      };
    }

    const g = GRID.multi;
    const layout = gridLayout(count, {
      cols: g.cols,
      cellW: g.cellW,
      cellH: g.cellH,
      centerX: 360,
      top: g.top
    });
    return {
      cardW: s(g.cardW),
      cardH: s(g.cardH),
      positions: layout.positions.map((p) => ({ x: s(p.x), y: s(p.y) }))
    };
  }

  /**
   * 결과 카드 1장. frame_card_{등급} 9-slice + 실포트레이트 + 등급 배지 + 별 + 이름.
   * @private
   * @returns {Phaser.GameObjects.Container}
   */
  _createCard(hero, x, y, w, h) {
    if (hero && hero.type === 'equipment') return this._createEquipmentCard(hero, x, y, w, h);

    const card = this.scene.add.container(x, y);
    const rKey = getRarityKey(hero.rarity);
    const rarityColor = this._rarityColor(hero.rarity);
    const frameKey = CARD_FRAME_BY_RARITY[rKey] || CARD_FRAME_BY_RARITY.N;

    // 표면 — 글래스 카드. 등급 색이 아웃라인 대신 배경 글로우로 들어간다
    const surface = this.scene.add.graphics();
    surface.fillStyle(DESIGN.colors.bg.secondary, 0.92);
    surface.fillRoundedRect(-w / 2, -h / 2, w, h, s(DESIGN.radius.md));
    card.add(surface);

    // 포트레이트 — 실아트 우선, 없으면 온디맨드 플레이스홀더
    const fullData = getCharacterOrHero(hero.id) || hero;
    const texKey = HeroAssetLoader.ensureTexture(this.scene, fullData);
    if (texKey) {
      const image = this.scene.add.image(0, -h * 0.12, texKey);
      const fit = Math.min((w * 0.82) / image.width, (h * 0.58) / image.height);
      image.setScale(fit);
      card.add(image);
    }

    // 등급 프레임 (텍스처 없으면 NineSliceFrame 이 라운드 사각형 폴백을 준다)
    const frame = NineSliceFrame.create(this.scene, {
      x: 0, y: 0, w, h, key: frameKey, tint: rarityColor
    });
    card.add(frame);

    // 이름 플레이트 — frame_card_* 의 하단 장식 위에 글자가 얹히면 읽히지 않는다.
    // 아래 26% 를 밴드 3겹으로 눌러 대비를 만든다(장식은 절반쯤 비쳐 남는다).
    const plateH = h * 0.26;
    const plate = this.scene.add.graphics();
    for (let i = 0; i < 3; i++) {
      plate.fillStyle(DESIGN.colors.bg.primary, 0.26 + i * 0.22);
      plate.fillRect(-w / 2 + s(4), h / 2 - plateH + (plateH / 3) * i - s(4), w - s(8), plateH / 3 + 1);
    }
    card.add(plate);

    // 등급 배지
    const badgeW = Math.max(s(30), w * 0.26);
    const badge = this.scene.add.graphics();
    badge.fillStyle(rarityColor, 1);
    badge.fillRoundedRect(-w / 2 + s(6), -h / 2 + s(6), badgeW, s(22), s(DESIGN.radius.sm));
    card.add(badge);
    card.add(this.scene.add.text(
      -w / 2 + s(6) + badgeW / 2, -h / 2 + s(17), rKey,
      ts('num.sm', { color: DESIGN.colors.text.inverse, fontStyle: 'bold' })
    ).setOrigin(0.5));

    // NEW 뱃지 — 중복이 아니면 새 동료다. 프레임 장식 위라 자기 판을 깔고 얹는다
    if (hero.isNew) {
      const newW = Math.max(s(28), w * 0.24);
      const newPlate = this.scene.add.graphics();
      newPlate.fillStyle(DESIGN.colors.bg.primary, 0.8);
      newPlate.fillRoundedRect(w / 2 - s(6) - newW, -h / 2 + s(6), newW, s(22), s(DESIGN.radius.sm));
      card.add(newPlate);
      card.add(this.scene.add.text(
        w / 2 - s(6) - newW / 2, -h / 2 + s(17), 'NEW',
        ts('num.sm', { color: `#${DESIGN.colors.brand.accent.toString(16).padStart(6, '0')}` })
      ).setOrigin(0.5));
    }

    // 별 · 이름
    const stars = hero.stars || getRarityNum(hero.rarity) || RARITY[rKey]?.stars || 1;
    card.add(this.scene.add.text(
      0, h / 2 - s(40), '★'.repeat(stars),
      ts('caption', { color: `#${DESIGN.colors.brand.accent.toString(16).padStart(6, '0')}` })
    ).setOrigin(0.5));

    const name = hero.name || '???';
    card.add(this.scene.add.text(
      0, h / 2 - s(18), name.length > 7 ? `${name.slice(0, 6)}…` : name,
      ts('caption', { color: DESIGN.colors.text.primary })
    ).setOrigin(0.5));

    return card;
  }

  /**
   * 장비 결과 카드 — 실 포트레이트 아트가 없으므로 슬롯 아이콘(이모지) 폴백을 쓴다.
   * `_createCard()`와 같은 프레임/배지/이름 플레이트 구조를 공유해 캐릭터 카드와
   * 한 그리드에서 시각적으로 통일감을 유지한다.
   * @private
   */
  _createEquipmentCard(item, x, y, w, h) {
    const card = this.scene.add.container(x, y);
    const rKey = getRarityKey(item.rarity);
    const rarityColor = this._rarityColor(item.rarity);
    const frameKey = CARD_FRAME_BY_RARITY[rKey] || CARD_FRAME_BY_RARITY.N;

    const surface = this.scene.add.graphics();
    surface.fillStyle(DESIGN.colors.bg.secondary, 0.92);
    surface.fillRoundedRect(-w / 2, -h / 2, w, h, s(DESIGN.radius.md));
    card.add(surface);

    // 아이콘 폴백 — 장비는 개별 아트가 없다 (GA-XX)
    card.add(this.scene.add.text(0, -h * 0.1, item.slotIcon || '⚔️', {
      fontSize: `${Math.round(h * 0.34)}px`
    }).setOrigin(0.5));

    const frame = NineSliceFrame.create(this.scene, {
      x: 0, y: 0, w, h, key: frameKey, tint: rarityColor
    });
    card.add(frame);

    const plateH = h * 0.26;
    const plate = this.scene.add.graphics();
    for (let i = 0; i < 3; i++) {
      plate.fillStyle(DESIGN.colors.bg.primary, 0.26 + i * 0.22);
      plate.fillRect(-w / 2 + s(4), h / 2 - plateH + (plateH / 3) * i - s(4), w - s(8), plateH / 3 + 1);
    }
    card.add(plate);

    const badgeW = Math.max(s(30), w * 0.26);
    const badge = this.scene.add.graphics();
    badge.fillStyle(rarityColor, 1);
    badge.fillRoundedRect(-w / 2 + s(6), -h / 2 + s(6), badgeW, s(22), s(DESIGN.radius.sm));
    card.add(badge);
    card.add(this.scene.add.text(
      -w / 2 + s(6) + badgeW / 2, -h / 2 + s(17), rKey,
      ts('num.sm', { color: DESIGN.colors.text.inverse, fontStyle: 'bold' })
    ).setOrigin(0.5));

    const stars = getRarityNum(item.rarity) || RARITY[rKey]?.stars || 1;
    card.add(this.scene.add.text(
      0, h / 2 - s(40), '★'.repeat(stars),
      ts('caption', { color: `#${DESIGN.colors.brand.accent.toString(16).padStart(6, '0')}` })
    ).setOrigin(0.5));

    const name = item.name || '장비';
    card.add(this.scene.add.text(
      0, h / 2 - s(18), name.length > 7 ? `${name.slice(0, 6)}…` : name,
      ts('caption', { color: DESIGN.colors.text.primary })
    ).setOrigin(0.5));

    return card;
  }

  // ================================================================
  // 4단계 — SSR 컷인
  // ================================================================

  /**
   * @private 컷인에 쓸 에셋을 미리 예약한다.
   * 대상이 여럿이면(SSR 2장 이상) 전원분을 건다. 4단계까지 약 2.4초가 남아 대개 늦지 않고,
   * 늦더라도 각 컷인이 포트레이트/벡터 폴백으로 성립한다.
   */
  _queueCutinAssets() {
    this._cutinTextures = this._cutinTextures || new Map();

    (this.plan.cutinTargets || []).forEach((hero) => {
      const preset = resolveCutin(hero);

      // 교단 배경 (lazyTextures)
      const bg = resolveAssetKey(preset.bg, ASSET_MANIFEST);
      if (bg.available && bg.bucket === 'lazyTextures') {
        this._queueTexture(bg.key, (ASSET_MANIFEST.lazyTextures[bg.key] || {}).path);
      }

      // 교단 문장 (textures — 대개 이미 로드돼 있다)
      const emblem = resolveAssetKey(preset.emblem, ASSET_MANIFEST);
      if (emblem.available && emblem.bucket === 'textures') {
        this._queueTexture(emblem.key, (ASSET_MANIFEST.textures[emblem.key] || {}).path);
      }

      // 전신 시트
      if (hero.type === 'equipment') return; // 장비는 전신 시트가 없다 — 아이콘 폴백
      const key = resolveFullbodyKey(hero.id, PORTRAIT_MAP);
      if (!key || !hasFullbodyAsset(key, ASSET_MANIFEST.fullbody)) return;
      if (this.scene.textures.exists(key)) {
        this._cutinTextures.set(hero.id, key);
        return;
      }
      const path = fullbodyPath(key);
      if (!path) return;

      // 씬 로더가 이미 돌고 있으면 load.image() 로 넣은 파일이 받아지고도
      // TextureManager 에 등록되지 않는다. lazyTexture 헬퍼는 그 상태를 타지 않는다.
      ensureTextureFromPath(this.scene, key, path, (loadedKey, added) => {
        if (this.destroyed) return;
        this._cutinTextures.set(hero.id, loadedKey);
        this._cutinTextureKey = loadedKey;
        if (added) this._fullbodyKey = loadedKey;
      });
    });
  }

  /** @private 소유권을 기록하며 텍스처를 예약한다 */
  _queueTexture(key, path) {
    if (!key || !path || this.scene.textures.exists(key)) return;
    ensureTextureFromPath(this.scene, key, path, (loadedKey, added) => {
      if (added) this._ownedTextures.add(loadedKey);
    });
  }

  /**
   * @private 연출이 끝나면 이 오버레이가 올린 텍스처를 되돌린다.
   *
   * **직접 등록한 것만** 지운다(`ensureTextureFromPath` 의 added 플래그).
   * 다른 화면이 먼저 올린 키를 지우면 그쪽 Image 가 사라진 텍스처를 참조해
   * 렌더러가 glTexture null 로 터진다.
   * 전신 시트(fb_hero_XXX)는 예외다 — GachaBannerPanel 이 같은 키로 픽업 인물을
   * 세워 두는 경우가 있어 소유권만으로는 안전을 보장할 수 없다.
   */
  _releaseOwnedTextures() {
    if (!this.scene?.textures) return;
    this._ownedTextures.forEach((key) => {
      if (key === this._fullbodyKey) return;
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    });
    this._ownedTextures.clear();
  }

  /**
   * @private 4단계 — 캐릭터별 SSR/SR 컷인.
   *
   * 프리셋(`src/data/gacha-cutins.json`)이 배경·문장·액센트·파티클·등장 방식·대사를 정한다.
   * 대상이 여럿이면 1명분씩 순차 재생한다(§10연에서 SSR 2장 이상).
   *
   * 진행:
   *   교단 배경 페이드인 → 교단 문장 회전 등장 → 전신 슬라이드 + 림라이트 플래시
   *   → 이름·등급·교단 리본 → 전용 대사 타이프라이터
   *
   * 트윈 예산은 1명당 6개다. 파티클은 개별 트윈 대신 컨테이너 1개를 확대해
   * 저사양에서도 트윈 수가 파티클 수에 비례하지 않게 한다.
   */
  _playCutin(stage) {
    const targets = (this.plan.cutinTargets || []).length > 0
      ? this.plan.cutinTargets
      : cutinTargets(this.results);
    if (targets.length === 0) return;

    const unit = this.plan.cutinUnit || stage.duration;

    targets.forEach((hero, index) => {
      if (index === 0) {
        this._playCutinFor(hero, unit);
      } else {
        this._delay(unit * index, () => this._playCutinFor(hero, unit));
      }
    });
  }

  /**
   * @private 컷인 1명분.
   * @param {Object} hero - 소환 결과 항목
   * @param {number} unit - 이 컷인에 배정된 시간(ms)
   */
  _playCutinFor(hero, unit) {
    if (this.destroyed || !hero) return;

    // 앞 사람의 컷인을 걷어낸다. 순차 재생이라 겹치면 안 된다
    this._stopQuote();
    this.quoteText = null;
    this.cutinLayer.removeAll(true);

    const preset = resolveCutin(hero);
    const accent = cssToHex(preset.accent, this._cultColorOf(hero));
    const brief = preset.format === CUTIN_FORMAT.BRIEF;
    const cx = GAME_WIDTH / 2;
    const poseSign = preset.fullbodyPose === CUTIN_POSE.LEFT ? -1 : 1;

    // ── 1. 교단 배경 (딤 + 배경 이미지를 한 컨테이너로 묶어 트윈 1개로 처리)
    const stageGroup = this._buildCutinBackdrop(preset, accent);
    this.cutinLayer.add(stageGroup);
    this._tween({
      targets: stageGroup,
      alpha: { from: 0, to: 1 },
      duration: preset.timing.bgFade,
      ease: 'Quad.easeOut'
    });

    // ── 2. 교단 문장 회전 등장 (SSR 전용)
    if (!brief) {
      const emblem = this._buildCultEmblem(preset, accent);
      this.cutinLayer.add(emblem);
      this._tween({
        targets: emblem,
        alpha: { from: 0, to: 0.55 },
        scale: { from: 0.55, to: 1 },
        rotation: { from: -Math.PI * 0.35, to: 0 },
        // 인물 뒤 문장(紋章)이라 진하게 깔면 실루엣을 먹는다. 0.55 가 상한이다
        duration: preset.timing.emblem,
        delay: preset.timing.bgFade * 0.5,
        ease: 'Cubic.easeOut'
      });
    }

    // ── 3. 전신 시트 등장 + 림라이트 플래시
    const figure = this._createCutinFigure(hero, accent, poseSign);
    if (figure) {
      this.cutinLayer.add(figure);
      this._applyEnterTween(figure, preset, poseSign);
    }

    const rim = this.scene.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, accent, 1)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.cutinLayer.add(rim);
    this._tween({
      targets: rim,
      alpha: { from: 0.42, to: 0 },
      duration: 420,
      delay: preset.timing.bgFade,
      ease: 'Quad.easeOut'
    });

    // ── 4. 이름 · 등급 · 교단 리본 (한 컨테이너 = 트윈 1개)
    const plate = this._buildCutinPlate(hero, preset, accent, poseSign);
    this.cutinLayer.add(plate);
    this._tween({
      targets: plate,
      alpha: { from: 0, to: 1 },
      y: { from: s(24), to: 0 },
      duration: preset.timing.ribbon,
      delay: preset.timing.bgFade + preset.timing.figure * 0.4,
      ease: 'Back.easeOut'
    });

    // ── 5. 파티클 — 분위기 색. 컨테이너 하나를 부풀려 트윈 1개로 끝낸다
    const sparks = this._buildMoodSparks(preset);
    if (sparks) {
      this.cutinLayer.add(sparks);
      this._tween({
        targets: sparks,
        scale: { from: 0.15, to: 1 },
        alpha: { from: 1, to: 0 },
        duration: Math.min(unit, 1400),
        delay: preset.timing.bgFade,
        ease: 'Cubic.easeOut'
      });
    }

    // ── 6. 전용 대사 타이프라이터 (SSR 전용, 트윈이 아니라 타이머)
    if (!brief && preset.timing.quote > 0) {
      this._startQuote(plate, preset, unit);
    }

    this.scene.cameras.main.shake(brief ? 160 : 260, brief ? 0.005 : 0.008);
  }

  /** @private 교단 배경 — 텍스처가 있으면 cover-fit, 없으면 교단색 방사 그라디언트 */
  _buildCutinBackdrop(preset, accent) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const group = this.scene.add.container(0, 0).setAlpha(0);

    group.add(this.scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.92));

    const key = preset.bg;
    if (key && this.scene.textures.exists(key)) {
      const source = this.scene.textures.get(key).getSourceImage();
      if (source && source.width) {
        const scale = Math.max(GAME_WIDTH / source.width, GAME_HEIGHT / source.height);
        const image = this.scene.add.image(cx, cy, key)
          .setDisplaySize(source.width * scale, source.height * scale)
          .setAlpha(0.45)
          .setTint(accent);
        group.add(image);
      }
    } else {
      // 폴백 — 교단색이 중심에서 퍼지는 원 6겹. 아트가 없어도 "그 교단의 자리" 로 읽힌다
      const g = this.scene.add.graphics();
      for (let i = 6; i >= 1; i--) {
        g.fillStyle(accent, 0.05 * i);
        g.fillCircle(cx, s(CUTIN.burstY), (s(700) * i) / 6);
      }
      group.add(g);
    }

    // 상하 레터박스 — 컷인이라는 신호
    const bars = this.scene.add.graphics();
    bars.fillStyle(0x000000, 0.92);
    bars.fillRect(0, 0, GAME_WIDTH, s(96));
    bars.fillRect(0, GAME_HEIGHT - s(96), GAME_WIDTH, s(96));
    group.add(bars);

    return group;
  }

  /** @private 교단 문장 — icon_cult_* 텍스처, 없으면 벡터 룬 문장 */
  _buildCultEmblem(preset, accent) {
    const cx = GAME_WIDTH / 2;
    const cy = s(CUTIN.emblemY);
    const size = s(CUTIN.emblemSize);

    if (preset.emblem && this.scene.textures.exists(preset.emblem)) {
      return this.scene.add.image(cx, cy, preset.emblem)
        .setDisplaySize(size, size)
        .setTint(accent)
        .setAlpha(0);
    }

    // 폴백 — 교단 아트가 없는 교단(balance/chaos/nature 등)용 룬 문장.
    // 소환진과 같은 어휘를 써서 이질감이 없게 한다.
    const g = this.scene.add.graphics({ x: cx, y: cy }).setAlpha(0);
    const r = size / 2;
    g.lineStyle(s(4), accent, 0.9);
    g.strokeCircle(0, 0, r);
    g.lineStyle(s(2), accent, 0.6);
    g.strokeCircle(0, 0, r * 0.72);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineBetween(
        Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72,
        Math.cos(a) * r, Math.sin(a) * r
      );
    }
    g.lineStyle(s(3), accent, 0.75);
    [0, Math.PI / 3, -Math.PI / 3].forEach((rot) => {
      const pts = [0, 1, 2].map((k) => {
        const a = rot + (k / 3) * Math.PI * 2 - Math.PI / 2;
        return { x: Math.cos(a) * r * 0.52, y: Math.sin(a) * r * 0.52 };
      });
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => g.lineTo(p.x, p.y));
      g.closePath();
      g.strokePath();
    });
    return g;
  }

  /** @private 등장 방식별 전신 트윈 */
  _applyEnterTween(figure, preset, poseSign) {
    const base = {
      targets: figure,
      duration: preset.timing.figure,
      delay: preset.timing.bgFade * 0.6,
      ease: 'Cubic.easeOut'
    };

    if (preset.enter === CUTIN_ENTER.BURST) {
      this._tween({ ...base, alpha: { from: 0, to: 1 }, scale: { from: 1.22, to: 1 }, ease: 'Back.easeOut' });
      return;
    }
    if (preset.enter === CUTIN_ENTER.RISE) {
      this._tween({ ...base, alpha: { from: 0, to: 1 }, y: { from: s(150), to: 0 } });
      return;
    }
    // slide — 서는 쪽 바깥에서 안으로 들어온다
    this._tween({ ...base, alpha: { from: 0, to: 1 }, x: { from: poseSign * s(190), to: 0 } });
  }

  /** @private 이름 · 등급 · 교단 리본 · 대사 자리를 한 컨테이너에 담는다 */
  _buildCutinPlate(hero, preset, accent, poseSign) {
    const cx = GAME_WIDTH / 2 - poseSign * s(CUTIN.textShiftX);
    const group = this.scene.add.container(0, 0).setAlpha(0);

    // 타이포 뒤 어두운 판 — 교단 배경이 밝으면(올림푸스·타카마가하라) 글자가 묻힌다.
    // 위에서 아래로 옅어지는 밴드 5겹으로 경계 없이 녹인다.
    const plate = this.scene.add.graphics();
    const plateTop = s(CUTIN.gradeY - 66);
    const plateH = s(CUTIN.quoteY + 96) - plateTop;
    for (let i = 0; i < 5; i++) {
      plate.fillStyle(DESIGN.colors.bg.primary, 0.62 - i * 0.11);
      plate.fillRect(0, plateTop + (plateH / 5) * i, GAME_WIDTH, plateH / 5 + 1);
    }
    group.add(plate);

    const gradeColor = preset.rarity === 'SR'
      ? `#${DESIGN.colors.rarity[3].toString(16).padStart(6, '0')}`
      : `#${DESIGN.colors.brand.accent.toString(16).padStart(6, '0')}`;

    group.add(this.scene.add.text(cx, s(CUTIN.gradeY), preset.rarity, ts('display.xl', {
      color: gradeColor
    })).setOrigin(0.5));

    group.add(this.scene.add.text(cx, s(CUTIN.nameY), hero.name || '???', ts('title', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5));

    // 교단 리본 — 교단색 밴드 + 교단 이름
    const ribbonW = s(460);
    const ribbon = this.scene.add.graphics();
    ribbon.fillStyle(accent, 0.9);
    ribbon.fillRect(cx - ribbonW / 2, s(CUTIN.bandY), ribbonW, s(4));
    group.add(ribbon);

    const cultName = this._cultLabel(preset.cultId);
    if (cultName) {
      group.add(this.scene.add.text(cx, s(CUTIN.bandY + 22), cultName, ts('label', {
        color: DESIGN.colors.text.secondary
      })).setOrigin(0.5));
    }

    // 대사 자리 — 타이프라이터가 채운다
    this.quoteText = this.scene.add.text(cx, s(CUTIN.quoteY + 20), '', ts('body', {
      color: DESIGN.colors.text.primary,
      align: 'center',
      wordWrap: { width: s(CUTIN.quoteWidth) }
    })).setOrigin(0.5, 0);
    group.add(this.quoteText);

    return group;
  }

  /** @private 교단 표시명 */
  _cultLabel(cultId) {
    if (!cultId) return null;
    const cult = (CULTS_DATA.cults || {})[cultId];
    return (cult && (cult.nameKr || cult.name)) || null;
  }

  /**
   * @private 분위기 색 파티클.
   * 점을 최종 위치에 미리 놓고 컨테이너만 부풀린다 — 트윈 1개로 방사 폭발이 나온다.
   */
  _buildMoodSparks(preset) {
    const colors = MOOD_PARTICLE_COLORS[preset.particles] || MOOD_PARTICLE_COLORS.mystic;
    const count = Math.min(this.plan.particleCount, 36);
    if (count <= 0) return null;

    const group = this.scene.add.container(GAME_WIDTH / 2, s(CUTIN.burstY));
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const radius = s(220 + Math.random() * 380);
      group.add(this.scene.add.circle(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        s(2 + Math.random() * 3),
        colors[i % colors.length],
        0.95
      ));
    }
    return group;
  }

  /** @private 전용 대사 타이프라이터. 트윈이 아니라 타이머로 돌린다 */
  _startQuote(plate, preset, unit) {
    const text = resolveQuoteText(preset.quote);
    if (!text || !this.quoteText) return;

    const target = this.quoteText;
    const typeMs = Math.min(preset.timing.quote, Math.max(400, unit - preset.timing.bgFade));
    const steps = Math.max(1, Math.min(text.length, 60));
    const interval = typeMs / steps;
    let step = 0;

    this._stopQuote();
    this._quoteTimer = this.scene.time.addEvent({
      delay: interval,
      repeat: steps - 1,
      callback: () => {
        if (this.destroyed || !target.scene) return;
        step += 1;
        target.setText(typewriterSlice(text, step / steps));
      }
    });
    this.timers.push(this._quoteTimer);
  }

  /**
   * @private 타이프라이터 타이머만 멈춘다.
   * `quoteText` 는 건드리지 않는다 — _startQuote 가 자기 참조를 스스로 지우게 되기 때문이다.
   * 표시물 자체는 cutinLayer.removeAll() 이 정리한다.
   */
  _stopQuote() {
    if (this._quoteTimer) {
      if (this._quoteTimer.remove) this._quoteTimer.remove(false);
      this._quoteTimer = null;
    }
  }

  /**
   * @private 컷인 인물. 전신 시트가 없으면 포트레이트를 확대해 쓴다. 장비는 아이콘 폴백.
   * 반환 컨테이너의 원점은 (0,0) 이라 등장 트윈이 x/y 를 그대로 밀 수 있다.
   */
  _createCutinFigure(hero, accent, poseSign = 1) {
    const anchorX = GAME_WIDTH / 2 + poseSign * s(CUTIN.poseOffsetX);

    if (hero.type === 'equipment') {
      const halo = this.scene.add.circle(anchorX, s(CUTIN.burstY), s(240), accent, 0.22);
      const icon = this.scene.add.text(anchorX, s(CUTIN.burstY), hero.slotIcon || '⚔️', {
        fontSize: `${Math.round(s(CUTIN.figureH * 0.42))}px`
      }).setOrigin(0.5);
      return this.scene.add.container(0, 0, [halo, icon]);
    }

    const owned = this._cutinTextures && this._cutinTextures.get(hero.id);
    const key = owned && this.scene.textures.exists(owned)
      ? owned
      : HeroAssetLoader.ensureTexture(this.scene, getCharacterOrHero(hero.id) || hero);
    if (!key) return null;

    const source = this.scene.textures.get(key).getSourceImage();
    if (!source || !source.width || !source.height) return null;

    const isFullbody = key === owned;
    const targetH = isFullbody ? s(CUTIN.figureH) : s(CUTIN.figureH * 0.72);
    const scale = Math.min(targetH / source.height, s(CUTIN.figureMaxW) / source.width);

    const image = this.scene.add.image(anchorX, s(CUTIN.figureBaseY), key)
      .setOrigin(0.5, 1)
      .setDisplaySize(source.width * scale, source.height * scale);

    // 인물 뒤 교단색 후광
    const halo = this.scene.add.circle(anchorX, s(CUTIN.burstY), s(240), accent, 0.22);
    return this.scene.add.container(0, 0, [halo, image]);
  }

  // ================================================================
  // 표면 · 버튼
  // ================================================================

  /** @private 전면 암전. 탭하면 스킵된다 */
  _buildScrim() {
    // fillAlpha 를 0 으로 만들고 게임오브젝트 alpha 만 올리면 아무것도 그려지지 않는다.
    // Shape 은 fillAlpha × alpha 로 그린다. 채움은 1 로 두고 alpha 로만 페이드한다.
    const scrim = this.scene.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1
    ).setAlpha(0);
    scrim.setInteractive();
    scrim.on('pointerdown', () => {
      if (!isTerminal(this.state)) this.skip();
    });
    this._tween({ targets: scrim, alpha: 0.94, duration: 300, ease: 'Quad.easeOut' });
    return scrim;
  }

  /** @private 결과 그리드의 글래스 패널 + 타이틀. 5단계에서 알파로 등장한다 */
  _buildResultPanel() {
    const bottom = this.results.length > 1 ? PANEL.bottomMulti : PANEL.bottomSingle;
    const w = s(PANEL.right - PANEL.left);
    const h = s(bottom - PANEL.top);
    const cx = s((PANEL.left + PANEL.right) / 2);
    const cy = s((PANEL.top + bottom) / 2);

    const panel = GlassPanel.create(this.scene, {
      x: cx, y: cy, w, h,
      variant: GLASS_VARIANT.POPUP,
      tint: this.accent
    });
    this.panelLayer.add(panel);

    this.panelLayer.add(this.scene.add.text(cx, s(PANEL.top + 46), '소환 결과', ts('display.lg', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5));

    const summary = this.results.length > 1
      ? `${this.results.length}회 소환 · 최고 등급 ${this.plan.best}`
      : `최고 등급 ${this.plan.best}`;
    this.panelLayer.add(this.scene.add.text(cx, s(PANEL.top + 92), summary, ts('label', {
      color: DESIGN.colors.text.secondary
    })).setOrigin(0.5));
  }

  /** @private 스킵 — 1단계부터 항상 활성 (§3-2) */
  _buildSkipButton() {
    const btn = this._makeButton({
      x: s(SKIP_BTN.x), y: s(SKIP_BTN.y),
      w: s(SKIP_BTN.w), h: s(SKIP_BTN.h),
      label: '건너뛰기',
      variant: 'btn_ghost',
      tint: DESIGN.colors.brand.primary,
      onClick: () => this.skip()
    });
    this.uiLayer.add(btn);
    this.skipButton = btn;
  }

  /** @private 10연 일괄 공개 */
  _buildRevealAllButton() {
    if (this.revealAllButton) return;
    const btn = this._makeButton({
      x: GAME_WIDTH / 2, y: s(ACTION_BAR.y),
      w: s(300), h: s(ACTION_BAR.h),
      label: '일괄 공개',
      variant: 'btn_secondary',
      tint: DESIGN.colors.brand.secondary,
      onClick: () => this.revealAll()
    });
    this.uiLayer.add(btn);
    this.revealAllButton = btn;
  }

  /** @private */
  _destroyRevealAllButton() {
    if (!this.revealAllButton) return;
    this.revealAllButton.destroy(true);
    this.revealAllButton = null;
  }

  /**
   * @private 액션 바 — [다시 소환] [확인].
   * 카드 공개가 끝나는 시점에 만들어지고 그 뒤로는 계속 남는다.
   */
  _buildActionBar() {
    if (this.actionBarBuilt || this.destroyed) return;
    this.actionBarBuilt = true;

    const labels = [];
    if (this.onPullAgain) {
      labels.push({
        label: '다시 소환', variant: 'btn_secondary',
        tint: DESIGN.colors.brand.secondary, onClick: () => this._pullAgain()
      });
    }
    labels.push({
      label: '확인', variant: 'btn_primary',
      tint: DESIGN.colors.brand.primary, onClick: () => this._confirm()
    });

    const usable = 720 - ACTION_BAR.margin * 2 - ACTION_BAR.gap * (labels.length - 1);
    const each = usable / labels.length;

    this.actionButtons = labels.map((spec, index) => {
      const centerX = ACTION_BAR.margin + index * (each + ACTION_BAR.gap) + each / 2;
      const btn = this._makeButton({
        x: s(centerX), y: s(ACTION_BAR.y),
        w: s(each), h: s(ACTION_BAR.h),
        label: spec.label,
        variant: spec.variant,
        tint: spec.tint,
        onClick: spec.onClick
      });
      this.uiLayer.add(btn);
      return btn;
    });
  }

  /**
   * @private 액션 바 활성/비활성.
   * 비활성이어도 라벨은 계속 보인다 — 다음에 무엇을 누르게 될지 미리 읽히게 한다.
   */
  _setActionBarEnabled(enabled) {
    this.actionBarEnabled = !!enabled;
    (this.actionButtons || []).forEach((btn) => {
      btn.setAlpha(enabled ? 1 : 0.45);
      const hit = btn.list.find((child) => child.input);
      if (!hit) return;
      if (enabled) hit.setInteractive({ useHandCursor: true });
      else hit.disableInteractive();
    });
  }

  /** @private */
  _confirm() {
    if (this.destroyed) return;
    this.destroy();
  }

  /** @private */
  _pullAgain() {
    if (this.destroyed) return;
    const again = this.onPullAgain;
    this.destroy();
    if (again) again();
  }

  /**
   * @private 9-slice 버튼. 텍스처가 없으면 NineSliceFrame 폴백이 라운드 사각형을 그린다.
   * 히트 영역은 터치 하한(48 base)을 보장한다.
   */
  _makeButton({ x, y, w, h, label, variant, tint, onClick }) {
    const group = this.scene.add.container(x, y);

    const frame = NineSliceFrame.create(this.scene, { x: 0, y: 0, w, h, key: variant, tint });
    const text = this.scene.add.text(0, 0, label, ts('subtitle', {
      color: DESIGN.colors.text.primary
    })).setOrigin(0.5);

    const min = s(DESIGN.touch.minTarget);
    const hit = this.scene.add.rectangle(0, 0, Math.max(w, min), Math.max(h, min), 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => group.setAlpha(0.85));
    hit.on('pointerout', () => group.setAlpha(1));
    hit.on('pointerdown', (pointer, lx, ly, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      onClick();
    });

    group.add([frame, text, hit]);
    return group;
  }

  // ================================================================
  // 유틸
  // ================================================================

  /** @private 등급 색 (Phaser hex) */
  _rarityColor(rarity) {
    const key = getRarityKey(rarity);
    return getRarityColors(key).hex || COLORS.rarity[key] || COLORS.primary;
  }

  /** @private 교단 색. 미상이면 등급 색으로 대신한다 */
  _cultColorOf(hero) {
    if (!hero || hero.type === 'equipment') return this.accent; // 장비는 교단이 없다
    const full = getCharacterOrHero(hero.id) || hero;
    const cult = full.cult || full.cultId || hero.cult || null;
    return cult ? getCultColor(cult) : this.accent;
  }

  /** @private 해당 등급의 첫 결과 */
  _heroFor(rarity) {
    return this.results.find((hero) => hero.rarity === rarity) || this.results[0] || null;
  }

  /** @private 저사양 판정 */
  _quality() {
    if (this.forcedQuality) return this.forcedQuality;
    const device = this.scene.game?.device;
    return resolveQualityTier({
      useBlurBackdrop: DESIGN.effects.useBlurBackdrop !== false,
      isMobile: !!(device && device.os && (device.os.android || device.os.iOS)),
      pixelRatio: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
    });
  }

  /** @private 추적되는 지연 호출 */
  _delay(ms, callback) {
    const timer = this.scene.time.delayedCall(Math.max(0, ms), () => {
      if (!this.destroyed) callback();
    });
    this.timers.push(timer);
    return timer;
  }

  /** @private 추적되는 트윈 */
  _tween(config) {
    const tween = this.scene.tweens.add(config);
    this.tweens.push(tween);
    return tween;
  }

  /** @private */
  _clearTimers() {
    this.timers.forEach((timer) => { if (timer && timer.remove) timer.remove(false); });
    this.timers = [];
  }
}

export default GachaResultOverlay;
