/**
 * CutscenePlayer — 컷씬 재생기 (배경 · 화자 무대 · 대화 UI · 타이프라이터)
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §3-2 ~ §3-6
 *  - 레이아웃 수치는 base 720×1280 기준이며 전부 `s()` / `sf()`를 통과시킨다
 *    (실제 게임 해상도 1080×1920 — SPIKE_OVERLAY_INPUT.md §7-1)
 *  - 스킵은 확인 다이얼로그 없이 1회 탭으로 즉시 종료(Pillar ②)
 *  - 씬 1개가 끝나거나 스킵될 때마다 즉시 커밋한다(LEVEL_STORY_PLACEMENT.md R6)
 *
 * 가독성 규약 (A11Y_AUDIT_2026-09-03 · WCAG AA 4.5:1)
 *  - 내레이션: 대화박스가 없으므로 **전용 밴드**(`narrationBandRect`)를 깔고 그 위에 얹는다.
 *    예전에는 배경 일러스트 위에 흰 글자를 맨몸으로 올렸고, 발광 버섯 위 최악 지점에서
 *    2.40:1 까지 무너졌다(실측). 밴드를 깐 뒤 15.85:1.
 *  - 대사: 뒤판(`BOX_PLATE_ALPHA`) + 글래스 + `frame_panel` 9-slice 테두리.
 *    대비는 원래도 AA 를 넘겼다(17.99 → 18.24). 테두리·세로 중앙 정렬은 완성도 문제였다.
 *  - 이름표: 화자색을 배경으로 쓰지 않는다. 어두운 판 + 흰 글자 + 화자색 바/테두리로
 *    색 정보를 유지하면서 대비를 고정한다(교단색 일부는 4.5:1 미달).
 *
 * 화면 층위 (아래 → 위)
 *   0 배경판(불투명)  1 챕터 배경 + 딤  2 배경 딤  10 이 컴포넌트의 root
 * 배경판이 있어야 일시정지된 부모 씬(pause 여도 렌더는 유지된다)이 비치지 않는다.
 *
 * 주의: gameConfig.js에서 값을 import하지 않는다(순환 import TDZ 회귀 방지).
 */
import { s, SCALE_FACTOR, GAME_WIDTH, GAME_HEIGHT } from '../../config/scaleConfig.js';
import { DESIGN, getCultColor } from '../../config/designSystem.js';
import { ts } from '../../utils/textStyles.js';
import { BackgroundFactory } from '../../utils/BackgroundFactory.js';
import { GlassPanel, GLASS_VARIANT } from '../GlassPanel.js';
import { NineSliceFrame } from '../NineSliceFrame.js';
import { getCharacterOrHero, getChapter } from '../../data/index.js';
import {
  CUTSCENE_LAYOUT as L,
  CUTSCENE_DIM_ALPHA,
  CHAPTER_CARD,
  LOG_LINE_LIMIT,
  NARRATION,
  assignSpeakerSides,
  autoAdvanceDelay,
  chapterCardText,
  narrationBandRect,
  narrationRuleY,
  progressLabel,
  recentLogLines,
  resolveChapterNumber,
  resolveCutsceneBgKey
} from '../../utils/cutsceneLayout.js';
import { CharacterStage } from './CharacterStage.js';
import { getSpeakerStyle } from './SpeakerSilhouette.js';

/** 화면 층위 depth */
const DEPTH = Object.freeze({ backdrop: 0, background: 1, root: 10 });

/** UX §3-5 타이핑 속도 — 보통 30자/초 */
const TYPING_CPS = 30;
/** `player` 화자는 타이핑 속도 1/2 + 즉시 완성 불가 (게임 전체 유일 예외) */
const PLAYER_TYPING_DIVISOR = 2;
/** 스킵 직후 입력 잠금 (오조작 방지) */
const SKIP_INPUT_LOCK_MS = 300;
/** 최소 탭 타겟 (base px) */
const MIN_TOUCH = 44;
/**
 * 대화박스 뒤판 불투명도.
 * 실측(bg_chapter_1) 기준 0.78 에서도 본문 대비는 17.99:1 로 AA 를 이미 넘겼다 —
 * 대화박스는 원래 문제가 아니었다(묻히는 쪽은 내레이션이었다).
 * 0.94 는 앞으로 더 밝은 챕터 배경이 들어와도 여유를 남기기 위한 값이다(18.24:1).
 */
const BOX_PLATE_ALPHA = 0.94;
/** 대화박스 테두리 9-slice — frame_popup 은 상단 장식(120px)이 본문을 먹는다 */
const BOX_FRAME_KEY = 'frame_panel';
/** 이름표 좌측 화자색 바 폭 (base px) */
const NAME_BAR_W = 6;

/** Phaser Text 는 CSS 색 문자열만 받는다. hex 숫자를 그대로 넘기면 검게 렌더된다 */
function cssColor(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export class CutscenePlayer {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} options
   * @param {Array<object>} options.scenes - 재생할 씬 배열 (story.json SceneObject)
   * @param {object} [options.vars] - `{{var}}` 치환 값
   * @param {(scene: object, info: {skipped: boolean}) => void} [options.onSceneEnd] - 씬 1개 종료/스킵 시 즉시 호출 (커밋 지점)
   * @param {(info: {skippedAll: boolean}) => void} [options.onComplete] - 전체 종료
   * @param {boolean} [options.allowSkipAll] - "전체 건너뛰기" 노출 여부
   * @param {(text: string, vars: object) => string} [options.resolveText] - 변수 치환기
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.queue = Array.isArray(options.scenes) ? options.scenes.slice() : [];
    this.vars = options.vars || {};
    this.onSceneEnd = options.onSceneEnd || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.allowSkipAll = options.allowSkipAll !== false && this.queue.length > 1;
    this.resolveText = options.resolveText || ((text) => text);

    this.sceneIndex = 0;
    this.lineIndex = 0;
    this.typing = false;
    this.finished = false;
    this.autoEnabled = false;
    this.logOpen = false;
    this.inputLockedUntil = 0;
    this.typeEvent = null;
    this.autoEvent = null;
    this.history = [];
    this.sides = [];
    this._activeSide = null;
    this._bgKey = null;
    this._chapterCard = null;
  }

  /**
   * e2e·디버그 호환용. 현재 발화 화자의 무대 오브젝트를 `{ current }` 형태로 노출한다.
   * (화자 슬롯은 `CharacterStage` 가 관리하지만 외부 계약은 유지한다)
   */
  get silhouette() {
    const actor = this._activeSide ? this.characterStage?.actors?.[this._activeSide] : null;
    return { current: actor ? actor.object : null };
  }

  // ================================================================
  // 생명주기
  // ================================================================

  start() {
    this._buildUI();
    if (this.queue.length === 0) {
      this._finish(false);
      return;
    }
    this._playScene(0);
  }

  destroy() {
    this._stopTyping();
    this._cancelAuto();
    this.characterStage?.destroy();
    this.characterStage = null;
    this.root?.destroy(true);
    this.root = null;
    this.backdrop?.destroy();
    this.backdrop = null;
  }

  // ================================================================
  // UI 구성
  // ================================================================

  _buildUI() {
    const scene = this.scene;

    // 배경판 — 일시정지된 부모 씬을 완전히 가린다 (배경보다 아래)
    this.backdrop = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, DESIGN.colors.bg.primary, 1)
      .setOrigin(0.5)
      .setDepth(DEPTH.backdrop);

    this.root = scene.add.container(0, 0).setDepth(DEPTH.root);

    // 화자 무대 (대화박스보다 아래)
    this.characterStage = new CharacterStage(scene, this.root);

    // 내레이션 전용 딤 — 대화박스가 없는 줄은 화면 전체가 한 단계 더 조용해진다.
    // UX §3-3 "내레이터 줄에서는 화면이 더 어두워진다"를 이 레이어로 구현한다.
    this.lineDim = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, DESIGN.colors.bg.primary, 0)
      .setOrigin(0.5);
    this.root.add(this.lineDim);

    // 내레이션 밴드 — 본문 높이에 맞춰 매 줄 다시 그린다
    this.narrationBand = scene.add.graphics();
    this.root.add(this.narrationBand);

    // 대화박스 뒤판 — 배경 일러스트가 밝아도 본문이 읽히도록 먼저 눌러둔다
    this.boxPlate = scene.add.graphics();
    this.boxPlate.fillStyle(DESIGN.colors.bg.primary, BOX_PLATE_ALPHA);
    this.boxPlate.fillRoundedRect(s(L.box.x), s(L.box.y), s(L.box.w), s(L.box.h), s(L.box.radius));
    this.root.add(this.boxPlate);

    // 대화박스 — 글래스 표면
    this.box = GlassPanel.create(scene, {
      x: s(L.box.x + L.box.w / 2),
      y: s(L.box.y + L.box.h / 2),
      w: s(L.box.w),
      h: s(L.box.h),
      variant: GLASS_VARIANT.POPUP,
      radius: s(L.box.radius)
    });
    this.root.add(this.box);

    // 9-slice 장식 테두리 — 대화박스를 "패널"로 읽히게 하는 요소
    this.boxFrame = NineSliceFrame.create(scene, {
      x: s(L.box.x + L.box.w / 2),
      y: s(L.box.y + L.box.h / 2),
      w: s(L.box.w),
      h: s(L.box.h),
      key: BOX_FRAME_KEY
    });
    this.root.add(this.boxFrame);

    // 화자색 액센트 테두리 (교단색) — 줄마다 다시 그린다
    this.boxAccent = scene.add.graphics();
    this.root.add(this.boxAccent);

    // 이름표
    this.nameBg = scene.add.graphics();
    this.root.add(this.nameBg);
    this.nameText = scene.add
      .text(
        s(L.name.x + NAME_BAR_W + L.name.padX),
        s(L.name.y - L.name.h / 2),
        '',
        ts('label', { color: DESIGN.colors.text.primary })
      )
      .setOrigin(0, 0.5);
    this.root.add(this.nameText);

    // 본문 / 내레이션
    this.bodyText = scene.add
      .text(s(L.text.x), s(L.text.y), '', ts('body', {
        wordWrap: { width: s(L.text.wrap) },
        lineSpacing: s(10)
      }))
      .setOrigin(0, 0.5);
    this.bodyText.setShadow(0, s(2), '#05070F', s(4), false, true);
    this.root.add(this.bodyText);

    this.narratorText = scene.add
      .text(s(L.narrator.x), s(L.narrator.y), '', ts('body', {
        color: DESIGN.colors.text.primary,
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: s(NARRATION.wrap) },
        lineSpacing: s(12)
      }))
      .setOrigin(0.5, 0.5);
    this.narratorText.setStroke('#05070F', s(2));
    this.narratorText.setShadow(0, s(2), '#05070F', s(6), false, true);
    this.root.add(this.narratorText);

    // 레터박스 (탭-진행 영역 밖 — 버튼을 물리적으로 분리한다)
    this.root.add(
      scene.add.rectangle(0, 0, GAME_WIDTH, s(L.letterboxTop), 0x000000, 0.92).setOrigin(0, 0)
    );
    this.root.add(
      scene.add.rectangle(0, GAME_HEIGHT, GAME_WIDTH, s(L.letterboxBottom), 0x000000, 0.92).setOrigin(0, 1)
    );

    // 진행 카운터
    this.counterText = scene.add
      .text(s(L.counter.right), s(L.counter.y), '', ts('caption', { color: DESIGN.colors.text.secondary }))
      .setOrigin(1, 0.5);
    this.root.add(this.counterText);

    // 다음 인디케이터 (▼ 상하 바운스 — UX §3-2 #13)
    this.indicator = scene.add
      .text(s(L.indicator.x), s(L.indicator.y), '▼', ts('label', { color: cssColor(DESIGN.colors.brand.accent) }))
      .setOrigin(0.5)
      .setVisible(false);
    this.root.add(this.indicator);
    scene.tweens.add({
      targets: this.indicator,
      y: s(L.indicator.y + 8),
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 탭-진행 영역 (버튼은 이 뒤에 추가되어 위로 올라간다)
    this.tapZone = scene.add.zone(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setInteractive();
    this.tapZone.on('pointerdown', () => this.handleTap());
    this.root.add(this.tapZone);

    // 버튼 — '건너뛰기'가 '전체 건너뛰기'보다 먼저 만들어져야 라벨 탐색이 어긋나지 않는다
    this.skipButton = this._createButton(L.skip, '건너뛰기 ⏭', 'btn_ghost', () => this.skipScene());
    if (this.allowSkipAll) {
      this.skipAllButton = this._createButton(L.skipAll, '전체 건너뛰기', 'btn_ghost', () => this.skipAll());
    }
    this.autoButton = this._createButton(L.auto, 'AUTO', 'btn_secondary', () => this.toggleAuto());
    this.logButton = this._createButton(L.log, '기록', 'btn_ghost', () => this.toggleLog());

    // 챕터 타이틀 카드 (버튼 위, 로그 아래). 비인터랙티브라 탭은 그대로 통과한다
    this.chapterLayer = scene.add.container(0, 0).setVisible(false);
    this.root.add(this.chapterLayer);

    this._buildLogPanel();
  }

  /** @private NineSlice 버튼 */
  _createButton(rect, label, frameKey, handler) {
    const scene = this.scene;
    const cx = s(rect.x + rect.w / 2);
    const cy = s(rect.y + rect.h / 2);

    const container = scene.add.container(0, 0);

    const frame = NineSliceFrame.create(scene, {
      x: cx, y: cy, w: s(rect.w), h: s(rect.h), key: frameKey
    });
    container.add(frame);

    const text = scene.add.text(cx, cy, label, ts('caption')).setOrigin(0.5);
    container.add(text);

    const zone = scene.add
      .zone(cx, cy, Math.max(s(rect.w), s(MIN_TOUCH)), Math.max(s(rect.h), s(MIN_TOUCH)))
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (_pointer, _x, _y, event) => {
      event?.stopPropagation?.();
      handler();
    });
    container.add(zone);

    this.root.add(container);
    container.frame = frame;
    container.label = text;
    return container;
  }

  /** @private 로그 패널 (직전 5줄) */
  _buildLogPanel() {
    const scene = this.scene;
    this.logPanel = scene.add.container(0, 0).setVisible(false);

    const scrim = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6)
      .setOrigin(0.5)
      .setInteractive();
    scrim.on('pointerdown', (_pointer, _x, _y, event) => {
      event?.stopPropagation?.();
      this.toggleLog();
    });
    this.logPanel.add(scrim);

    const panel = GlassPanel.create(scene, {
      x: s(L.logPanel.x),
      y: s(L.logPanel.y),
      w: s(L.logPanel.w),
      h: s(L.logPanel.h),
      variant: GLASS_VARIANT.POPUP
    });
    this.logPanel.add(panel);

    const title = scene.add
      .text(s(L.logPanel.x), s(L.logPanel.y - L.logPanel.h / 2 + 44), `기록 (최근 ${LOG_LINE_LIMIT}줄)`, ts('subtitle'))
      .setOrigin(0.5);
    this.logPanel.add(title);

    this.logText = scene.add
      .text(s(L.logPanel.x - L.logPanel.w / 2 + 36), s(L.logPanel.y - L.logPanel.h / 2 + 96), '', ts('caption', {
        wordWrap: { width: s(L.logPanel.w - 72) },
        lineSpacing: s(8)
      }))
      .setOrigin(0, 0);
    this.logPanel.add(this.logText);

    this.root.add(this.logPanel);
  }

  // ================================================================
  // 재생
  // ================================================================

  _playScene(index) {
    this.sceneIndex = index;
    this.lineIndex = 0;
    const cutscene = this.queue[index];
    if (!cutscene) {
      this._finish(false);
      return;
    }

    this._applyBackground(cutscene);
    this.sides = assignSpeakerSides(cutscene.lines);
    this.characterStage.clearAll();
    this._showChapterCard(cutscene);
    this._showLine(0);
  }

  /**
   * @private 씬 배경을 적용한다. 챕터 배경은 lazyTextures 라
   * `BackgroundFactory` 가 폴백을 먼저 그린 뒤 로드되면 실제 이미지로 갈아 끼운다.
   */
  _applyBackground(cutscene) {
    const key = resolveCutsceneBgKey(cutscene, (k) => this.scene.textures.exists(k));
    if (key === this._bgKey) return;
    this._bgKey = key;
    BackgroundFactory.createSceneBg(this.scene, key, {
      depth: DEPTH.background,
      dimAlpha: CUTSCENE_DIM_ALPHA
    });
  }

  /**
   * @private 챕터 인트로 타이틀 카드. 입력을 막지 않고 스스로 사라진다
   * (스킵 무손실 계약 P2 — 어떤 연출도 진행을 붙잡아두지 않는다).
   */
  _showChapterCard(cutscene) {
    const scene = this.scene;
    this.chapterLayer.removeAll(true);
    this.chapterLayer.setVisible(false);

    const card = chapterCardText(cutscene, (n) => getChapter(`chapter_${n}`)?.name || null);
    if (!card) return;

    const chapter = resolveChapterNumber(cutscene);
    const accent = DESIGN.colors.brand.accent;
    const accentCss = cssColor(accent);
    const cy = s(CHAPTER_CARD.centerY);

    const scrim = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, DESIGN.colors.bg.primary, CHAPTER_CARD.scrimAlpha)
      .setOrigin(0.5);
    this.chapterLayer.add(scrim);

    const label = scene.add
      .text(GAME_WIDTH / 2, cy + s(CHAPTER_CARD.labelDy), card.label, ts('subtitle', { color: accentCss }))
      .setOrigin(0.5);
    this.chapterLayer.add(label);

    const title = scene.add
      .text(GAME_WIDTH / 2, cy + s(CHAPTER_CARD.titleDy), card.title, ts('display.lg'))
      .setOrigin(0.5);
    title.setShadow(0, s(3), '#05070F', s(8), false, true);
    this.chapterLayer.add(title);

    const rule = scene.add.graphics();
    rule.fillStyle(accent, 0.85);
    rule.fillRect(
      GAME_WIDTH / 2 - s(CHAPTER_CARD.ruleW) / 2,
      cy + s(CHAPTER_CARD.ruleDy),
      s(CHAPTER_CARD.ruleW),
      s(CHAPTER_CARD.ruleThickness)
    );
    this.chapterLayer.add(rule);

    this.chapterLayer.setAlpha(0).setVisible(true);
    scene.tweens.add({
      targets: this.chapterLayer,
      alpha: 1,
      duration: CHAPTER_CARD.fadeInMs,
      ease: 'Sine.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: this.chapterLayer,
          alpha: 0,
          delay: CHAPTER_CARD.holdMs,
          duration: CHAPTER_CARD.fadeOutMs,
          onComplete: () => {
            this.chapterLayer?.setVisible(false);
            this.chapterLayer?.removeAll(true);
          }
        });
      }
    });
    // 진행 로그·디버그용
    this._chapterCard = { chapter, ...card };
  }

  _currentScene() {
    return this.queue[this.sceneIndex] || null;
  }

  _showLine(index) {
    const cutscene = this._currentScene();
    if (!cutscene) return;
    const line = cutscene.lines[index];
    if (!line) {
      this._endScene(false);
      return;
    }

    this.lineIndex = index;
    this._cancelAuto();

    const isNarrator = line.speakerType === 'narrator';
    const style = getSpeakerStyle(line.speakerType);
    const accent = this._accentFor(line);
    const side = this.sides[index] ?? null;
    this._activeSide = side;

    this.characterStage.show(line, side);
    this.indicator.setVisible(false);
    this.counterText.setText(
      progressLabel(index, cutscene.lines.length, this.sceneIndex, this.queue.length)
    );

    const showBox = !isNarrator && style.showBox;
    this.box.setVisible(showBox);
    this.boxPlate.setVisible(showBox);
    this.boxFrame.setVisible(showBox);
    this.lineDim.setAlpha(isNarrator ? NARRATION.scrimAlpha : 0);
    this._drawAccent(showBox ? accent : null);
    this._drawNameTag(line, style, accent);

    const fullText = this.resolveText(line.text, this.vars);
    this.history.push({ speaker: line.speaker, text: fullText });

    const target = isNarrator ? this.narratorText : this.bodyText;
    const other = isNarrator ? this.bodyText : this.narratorText;
    other.setText('').setVisible(false);
    target.setVisible(true);

    if (isNarrator) this._drawNarrationBand(fullText);
    else {
      this.narrationBand.clear();
      this._layoutBodyText(line, style);
    }

    this._type(target, fullText, line);
  }

  /**
   * @private 내레이션 밴드를 본문 실측 높이에 맞춰 그린다.
   * 타이핑 중에도 밴드 크기가 흔들리지 않도록 **전문(全文)** 을 먼저 재어 고정한다.
   */
  _drawNarrationBand(fullText) {
    const probeText = this.narratorText.text;
    this.narratorText.setText(fullText);
    const measured = this.narratorText.height / SCALE_FACTOR;
    this.narratorText.setText(probeText);

    const band = narrationBandRect(measured);
    const rules = narrationRuleY(band);
    const color = DESIGN.colors.bg.primary;
    const g = this.narrationBand;

    g.clear();
    // 위 페이드 → 코어 → 아래 페이드. 각진 상자 대신 배경으로 이어지는 띠가 된다
    g.fillGradientStyle(color, color, color, color, 0, 0, NARRATION.coreAlpha, NARRATION.coreAlpha);
    g.fillRect(0, s(band.y - band.fadeH), GAME_WIDTH, s(band.fadeH));
    g.fillStyle(color, NARRATION.coreAlpha);
    g.fillRect(0, s(band.y), GAME_WIDTH, s(band.h));
    g.fillGradientStyle(color, color, color, color, NARRATION.coreAlpha, NARRATION.coreAlpha, 0, 0);
    g.fillRect(0, s(band.y + band.h), GAME_WIDTH, s(band.fadeH));

    // 장식 헤어라인 — "지금은 서술"이라는 신호를 시각적으로 못 박는다
    const ruleW = s(NARRATION.rule.w);
    const ruleH = s(NARRATION.rule.thickness);
    g.fillStyle(DESIGN.colors.brand.accent, NARRATION.rule.alpha);
    g.fillRect((GAME_WIDTH - ruleW) / 2, s(rules.top), ruleW, ruleH);
    g.fillRect((GAME_WIDTH - ruleW) / 2, s(rules.bottom), ruleW, ruleH);

    this.narratorText.setPosition(GAME_WIDTH / 2, s(band.centerY));
  }

  /**
   * @private 본문은 대화박스 세로 중앙에 놓는다 — 줄 수가 1~3줄로 들쭉날쭉해도
   * 박스 안이 비어 보이지 않는다. 수집가 대사만 가로도 중앙 정렬한다.
   */
  _layoutBodyText(line, style) {
    const centered = line.speakerType === 'player' || !style.showName;
    if (centered) {
      this.bodyText.setAlign('center');
      this.bodyText.setWordWrapWidth(s(L.box.w - 88));
      this.bodyText.setOrigin(0.5, 0.5);
      this.bodyText.setPosition(s(L.box.x + L.box.w / 2), s(L.text.y));
    } else {
      this.bodyText.setAlign('left');
      this.bodyText.setWordWrapWidth(s(L.text.wrap));
      this.bodyText.setOrigin(0, 0.5);
      this.bodyText.setPosition(s(L.text.x), s(L.text.y));
    }
  }

  /** @private 화자색 — 전직영웅은 교단색, 그 외는 화자 유형색 */
  _accentFor(line) {
    if (line.speakerType === 'hero' && line.portraitId) {
      try {
        const data = getCharacterOrHero(line.portraitId);
        const cult = data?.cultId || data?.cult;
        if (cult) return getCultColor(cult);
      } catch {
        // 데이터 조회 실패는 화자 유형색으로 폴백한다
      }
    }
    return getSpeakerStyle(line.speakerType).accent;
  }

  /** @private 대화박스 액센트 테두리 */
  _drawAccent(accent) {
    this.boxAccent.clear();
    if (accent === null) return;
    this.boxAccent.lineStyle(s(2), accent, 0.9);
    this.boxAccent.strokeRoundedRect(s(L.box.x), s(L.box.y), s(L.box.w), s(L.box.h), s(L.box.radius));
  }

  /**
   * @private 이름표. 화자색을 배경으로 쓰면 어두운 교단색(tartarus 등)에서 글자가 사라진다.
   * 어두운 판 + 흰 글자로 대비를 고정하고, 화자색은 좌측 바와 테두리로만 쓴다.
   */
  _drawNameTag(line, style, accent) {
    this.nameBg.clear();
    if (!style.showName || !line.speaker) {
      this.nameText.setText('').setVisible(false);
      return;
    }
    this.nameText.setText(line.speaker).setVisible(true);

    const x = s(L.name.x);
    const y = s(L.name.y - L.name.h);
    const h = s(L.name.h);
    const w = this.nameText.width + s(NAME_BAR_W + L.name.padX * 2);
    const radius = s(10);

    this.nameBg.fillStyle(DESIGN.colors.bg.primary, 0.96);
    this.nameBg.fillRoundedRect(x, y, w, h, radius);
    this.nameBg.fillStyle(accent, 1);
    this.nameBg.fillRoundedRect(x, y + s(6), s(NAME_BAR_W), h - s(12), s(3));
    this.nameBg.lineStyle(s(1.5), accent, 0.85);
    this.nameBg.strokeRoundedRect(x, y, w, h, radius);
  }

  // ================================================================
  // 타이핑 · 자동 진행
  // ================================================================

  _type(target, fullText, line) {
    this._stopTyping();
    this.fullText = fullText;
    this.activeTarget = target;
    this.lockInstantComplete = line.speakerType === 'player';

    const cps = line.speakerType === 'player' ? TYPING_CPS / PLAYER_TYPING_DIVISOR : TYPING_CPS;
    const delay = Math.max(1, Math.round(1000 / cps));

    target.setText('');
    this.typing = true;
    let cursor = 0;

    this.typeEvent = this.scene.time.addEvent({
      delay,
      loop: true,
      callback: () => {
        cursor += 1;
        target.setText(fullText.slice(0, cursor));
        if (cursor >= fullText.length) this._completeLine();
      }
    });
  }

  _stopTyping() {
    if (this.typeEvent) {
      this.typeEvent.remove(false);
      this.typeEvent = null;
    }
    this.typing = false;
  }

  _completeLine() {
    this._stopTyping();
    if (this.activeTarget && typeof this.fullText === 'string') this.activeTarget.setText(this.fullText);
    this.indicator.setVisible(true);
    if (this.autoEnabled) this._scheduleAuto();
  }

  /** @private 자동 진행 예약 */
  _scheduleAuto() {
    this._cancelAuto();
    this.autoEvent = this.scene.time.delayedCall(autoAdvanceDelay(this.fullText), () => {
      this.autoEvent = null;
      if (!this.finished && !this.logOpen) this._advance();
    });
  }

  _cancelAuto() {
    if (this.autoEvent) {
      this.autoEvent.remove(false);
      this.autoEvent = null;
    }
  }

  /** 자동 재생 토글 */
  toggleAuto() {
    this.autoEnabled = !this.autoEnabled;
    const activeColor = cssColor(DESIGN.colors.brand.accent);
    this.autoButton?.label?.setColor(this.autoEnabled ? activeColor : DESIGN.colors.text.primary);
    if (this.autoEnabled && !this.typing) this._scheduleAuto();
    else this._cancelAuto();
  }

  /** 기록(직전 5줄) 토글 */
  toggleLog() {
    this.logOpen = !this.logOpen;
    if (this.logOpen) {
      const lines = recentLogLines(this.history)
        .map((entry) => (entry.speaker ? `${entry.speaker}\n${entry.text}` : entry.text))
        .join('\n\n');
      this.logText.setText(lines);
      this._cancelAuto();
    }
    this.logPanel.setVisible(this.logOpen);
  }

  // ================================================================
  // 입력
  // ================================================================

  handleTap() {
    if (this.finished) return;
    if (this.logOpen) return;
    if (this.scene.time.now < this.inputLockedUntil) return;

    // 자동재생 중의 탭은 자동재생만 해제한다 (오조작으로 대사를 넘기지 않는다)
    if (this.autoEnabled) {
      this.toggleAuto();
      return;
    }

    if (this.typing) {
      // `player` 화자 2줄만 즉시 완성 불가 (UX §3-5 예외)
      if (this.lockInstantComplete) return;
      this._completeLine();
      return;
    }

    this._advance();
  }

  /** @private 다음 줄 또는 다음 씬 */
  _advance() {
    const cutscene = this._currentScene();
    if (!cutscene) return;
    if (this.lineIndex + 1 < cutscene.lines.length) this._showLine(this.lineIndex + 1);
    else this._endScene(false);
  }

  /** 현재 씬 1개만 건너뛴다 (확인 없음) */
  skipScene() {
    if (this.finished) return;
    this.inputLockedUntil = this.scene.time.now + SKIP_INPUT_LOCK_MS;
    this._endScene(true);
  }

  /** 대기열의 남은 씬 전부를 건너뛴다 */
  skipAll() {
    if (this.finished) return;
    this._stopTyping();
    this._cancelAuto();
    for (let i = this.sceneIndex; i < this.queue.length; i += 1) {
      this.onSceneEnd(this.queue[i], { skipped: true });
    }
    this._finish(true);
  }

  _endScene(skipped) {
    this._stopTyping();
    this._cancelAuto();
    const cutscene = this._currentScene();
    if (cutscene) this.onSceneEnd(cutscene, { skipped });

    const next = this.sceneIndex + 1;
    if (next < this.queue.length) this._playScene(next);
    else this._finish(false);
  }

  _finish(skippedAll) {
    if (this.finished) return;
    this.finished = true;
    this._stopTyping();
    this._cancelAuto();
    this.characterStage?.clearAll();
    this.onComplete({ skippedAll });
  }
}

export default CutscenePlayer;
