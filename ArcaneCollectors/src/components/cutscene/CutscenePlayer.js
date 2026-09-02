/**
 * CutscenePlayer — 컷씬 대사 재생기 (타이프라이터 · 탭 진행 · 스킵)
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §3-2 ~ §3-6
 *  - 레이아웃 수치는 base 720×1280 기준이며 전부 `s()` / `sf()`를 통과시킨다
 *    (실제 게임 해상도 1080×1920 — SPIKE_OVERLAY_INPUT.md §7-1)
 *  - 스킵은 확인 다이얼로그 없이 1회 탭으로 즉시 종료(Pillar ②)
 *  - 씬 1개가 끝나거나 스킵될 때마다 즉시 커밋한다(LEVEL_STORY_PLACEMENT.md R6)
 *
 * 주의: gameConfig.js에서 값을 import하지 않는다(순환 import TDZ 회귀 방지).
 */
import { s, sf, GAME_WIDTH, GAME_HEIGHT } from '../../config/scaleConfig.js';
import { SpeakerSilhouette, getSpeakerStyle } from './SpeakerSilhouette.js';

/** UX §3-2 요소별 수치 (base 720×1280) */
const L = {
  letterboxTop: 150,
  letterboxBottom: 130,
  boxX: 24,
  boxY: 890,
  boxW: 672,
  boxH: 260,
  textX: 56,
  textY: 950,
  textWrap: 600,
  nameX: 48,
  nameY: 868,
  narratorX: 360,
  narratorY: 640,
  narratorWrap: 560,
  skipX: 596,
  skipY: 24,
  skipW: 100,
  skipH: 52,
  skipAllX: 24,
  skipAllY: 1196,
  skipAllW: 220,
  skipAllH: 48,
  indicatorX: 660,
  indicatorY: 1120,
  counterRight: 696,
  counterY: 1215
};

const C = {
  letterbox: 0x000000,
  dim: 0x0f172a,
  box: 0x0f172a,
  text: '#F8FAFC',
  narratorText: '#CBD5E1',
  muted: '#94A3B8',
  buttonBg: 0x1e293b
};

/**
 * 연출 영역 딤 불투명도 (UX §3-3 — 내레이터 줄에서 강화).
 * 딤은 **배경 일러스트 위에** 얹는 값이지 부모 화면을 가리는 수단이 아니다.
 * 부모 차폐는 아래 `BACKDROP_ALPHA`(불투명 배경판)가 전담한다.
 */
const DIM_ALPHA = { line: 0.65, narrator: 0.8 };

/**
 * 배경판 불투명도.
 * 컷씬은 일시정지된 부모 씬 위에 렌더된다(pause여도 렌더는 유지된다).
 * 반투명 딤만 깔면 각인 팝업의 영웅 목록 같은 부모 UI가 대사 뒤로 비쳐 가독성이 무너지므로,
 * 딤 아래에 불투명 배경판을 먼저 깐다. 씬에 `background` 텍스처가 있으면 그 위에 그린다.
 */
const BACKDROP_ALPHA = 1;

/** UX §3-5 타이핑 속도 — 보통 30자/초 */
const TYPING_CPS = 30;
/** `player` 화자는 타이핑 속도 1/2 + 즉시 완성 불가 (게임 전체 유일 예외) */
const PLAYER_TYPING_DIVISOR = 2;
/** 스킵 직후 입력 잠금 (오조작 방지) */
const SKIP_INPUT_LOCK_MS = 300;

export class CutscenePlayer {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} options
   * @param {Array<object>} options.scenes - 재생할 씬 배열 (story.json SceneObject)
   * @param {object} [options.vars] - `{{var}}` 치환 값
   * @param {(scene: object, info: {skipped: boolean}) => void} [options.onSceneEnd] - 씬 1개 종료/스킵 시 즉시 호출 (커밋 지점)
   * @param {(info: {skippedAll: boolean}) => void} [options.onComplete] - 전체 종료
   * @param {boolean} [options.allowSkipAll] - "전체 건너뛰기" 노출 여부
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
    this.inputLockedUntil = 0;
    this.typeEvent = null;
  }

  // ============================================
  // 생명주기
  // ============================================

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
    this.silhouette?.destroy();
    this.silhouette = null;
    this.root?.destroy(true);
    this.root = null;
  }

  // ============================================
  // UI 구성
  // ============================================

  _buildUI() {
    const scene = this.scene;
    this.root = scene.add.container(0, 0);

    // 배경판: 부모 씬을 완전히 가린다 (딤보다 아래)
    this.backdrop = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, C.dim, BACKDROP_ALPHA)
      .setOrigin(0.5);
    this.root.add(this.backdrop);

    // 배경 일러스트 슬롯 (자산이 없으면 비어 있다)
    this.background = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, '__DEFAULT').setVisible(false);
    this.root.add(this.background);

    // 연출 영역 딤 (배경 위 — 내레이터 줄에서 한 단계 강화)
    this.dim = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, C.dim, DIM_ALPHA.line)
      .setOrigin(0.5);
    this.root.add(this.dim);

    // 화자 슬롯
    this.silhouette = new SpeakerSilhouette(scene, this.root);

    // 대화박스 + 이름표
    this.box = scene.add.graphics();
    this.root.add(this.box);

    this.nameBg = scene.add.graphics();
    this.root.add(this.nameBg);

    this.nameText = scene.add
      .text(s(L.nameX + 16), s(L.nameY - 22), '', {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(17),
        color: C.text
      })
      .setOrigin(0, 0.5);
    this.root.add(this.nameText);

    this.bodyText = scene.add
      .text(s(L.textX), s(L.textY), '', {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(22),
        color: C.text,
        wordWrap: { width: s(L.textWrap) },
        lineSpacing: s(10)
      })
      .setOrigin(0, 0);
    this.root.add(this.bodyText);

    this.narratorText = scene.add
      .text(s(L.narratorX), s(L.narratorY), '', {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(20),
        color: C.narratorText,
        fontStyle: 'italic',
        align: 'center',
        wordWrap: { width: s(L.narratorWrap) },
        lineSpacing: s(10)
      })
      .setOrigin(0.5, 0.5);
    this.root.add(this.narratorText);

    // 레터박스 (탭-진행 영역 밖 — 스킵 버튼을 물리적으로 분리한다)
    this.root.add(
      scene.add.rectangle(0, 0, GAME_WIDTH, s(L.letterboxTop), C.letterbox, 0.92).setOrigin(0, 0)
    );
    this.root.add(
      scene.add
        .rectangle(0, GAME_HEIGHT, GAME_WIDTH, s(L.letterboxBottom), C.letterbox, 0.92)
        .setOrigin(0, 1)
    );

    // 진행 카운터 (도트 대신 텍스트 카운터 — base 720 폭 가독성)
    this.counterText = scene.add
      .text(s(L.counterRight), s(L.counterY), '', {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(15),
        color: C.muted
      })
      .setOrigin(1, 0.5);
    this.root.add(this.counterText);

    // 다음 인디케이터
    this.indicator = scene.add
      .text(s(L.indicatorX), s(L.indicatorY), '▼', {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(18),
        color: C.text
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.root.add(this.indicator);
    scene.tweens.add({
      targets: this.indicator,
      y: s(L.indicatorY + 4),
      duration: 400,
      yoyo: true,
      repeat: -1
    });

    // 탭-진행 영역 (버튼 히트영역 제외 → 버튼이 위에 올라간다)
    this.tapZone = scene.add.zone(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setInteractive();
    this.tapZone.on('pointerdown', () => this.handleTap());
    this.root.add(this.tapZone);

    // 스킵 버튼 (상시 노출)
    this.skipButton = this._createButton(
      L.skipX,
      L.skipY,
      L.skipW,
      L.skipH,
      '건너뛰기 ⏭',
      16,
      () => this.skipScene()
    );

    if (this.allowSkipAll) {
      this.skipAllButton = this._createButton(
        L.skipAllX,
        L.skipAllY,
        L.skipAllW,
        L.skipAllH,
        '전체 건너뛰기',
        15,
        () => this.skipAll()
      );
    }
  }

  _createButton(bx, by, bw, bh, label, fontBase, handler) {
    const scene = this.scene;
    const container = scene.add.container(s(bx), s(by));

    const bg = scene.add.graphics();
    bg.fillStyle(C.buttonBg, 0.85);
    bg.fillRoundedRect(0, 0, s(bw), s(bh), s(8));
    bg.lineStyle(s(2), 0x94a3b8, 1);
    bg.strokeRoundedRect(0, 0, s(bw), s(bh), s(8));
    container.add(bg);

    const text = scene.add
      .text(s(bw) / 2, s(bh) / 2, label, {
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: sf(fontBase),
        color: C.text
      })
      .setOrigin(0.5);
    container.add(text);

    const zone = scene.add.zone(0, 0, s(bw), s(bh)).setOrigin(0, 0).setInteractive();
    zone.on('pointerdown', (_pointer, _x, _y, event) => {
      event?.stopPropagation?.();
      handler();
    });
    container.add(zone);

    this.root.add(container);
    return container;
  }

  // ============================================
  // 재생
  // ============================================

  _playScene(index) {
    this.sceneIndex = index;
    this.lineIndex = 0;
    const scene = this.queue[index];
    if (!scene) {
      this._finish(false);
      return;
    }
    this._applyBackground(scene.background);
    this._showLine(0);
  }

  /**
   * 씬의 배경 텍스처를 적용한다. 자산이 없으면 배경판(불투명)만 남는다.
   * @param {string|null} key
   */
  _applyBackground(key) {
    if (!key || !this.scene.textures.exists(key)) {
      this.background.setVisible(false);
      return;
    }
    this.background.setTexture(key).setVisible(true);
    const source = this.scene.textures.get(key).getSourceImage();
    // cover: 화면을 가득 채우도록 긴 축 기준으로 확대한다
    this.background.setScale(Math.max(GAME_WIDTH / source.width, GAME_HEIGHT / source.height));
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
    const style = getSpeakerStyle(line.speakerType);
    const isNarrator = line.speakerType === 'narrator';

    this.silhouette.show(line);
    this.dim.setFillStyle(C.dim, isNarrator ? DIM_ALPHA.narrator : DIM_ALPHA.line);
    this.indicator.setVisible(false);
    this.counterText.setText(`${index + 1} / ${cutscene.lines.length}`);

    this._drawBox(style, isNarrator);
    this._drawNameTag(line, style);

    const fullText = this.resolveText(line.text, this.vars);
    const target = isNarrator ? this.narratorText : this.bodyText;
    const other = isNarrator ? this.bodyText : this.narratorText;
    other.setText('');
    other.setVisible(false);
    target.setVisible(true);

    if (line.speakerType === 'player' && !style.showName) {
      // 수집가 대사: 박스 전체 폭 중앙 정렬
      this.bodyText.setAlign('center');
      this.bodyText.setWordWrapWidth(s(L.boxW - 64));
      this.bodyText.setPosition(s(L.boxX + L.boxW / 2), s(L.textY));
      this.bodyText.setOrigin(0.5, 0);
    } else if (!isNarrator) {
      this.bodyText.setAlign('left');
      this.bodyText.setWordWrapWidth(s(L.textWrap));
      this.bodyText.setPosition(s(L.textX), s(L.textY));
      this.bodyText.setOrigin(0, 0);
    }

    this._type(target, fullText, line);
  }

  _drawBox(style, isNarrator) {
    this.box.clear();
    if (isNarrator || !style.showBox) return;
    this.box.fillStyle(C.box, 0.94);
    this.box.fillRoundedRect(s(L.boxX), s(L.boxY), s(L.boxW), s(L.boxH), s(16));
    this.box.lineStyle(s(2), style.accent, 1);
    this.box.strokeRoundedRect(s(L.boxX), s(L.boxY), s(L.boxW), s(L.boxH), s(16));
  }

  _drawNameTag(line, style) {
    this.nameBg.clear();
    if (!style.showName || !line.speaker) {
      this.nameText.setText('');
      return;
    }
    this.nameText.setText(line.speaker);
    const width = this.nameText.width + s(32);
    this.nameBg.fillStyle(style.accent, 0.9);
    this.nameBg.fillRoundedRect(s(L.nameX), s(L.nameY - 44), width, s(44), s(8));
  }

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
  }

  // ============================================
  // 입력
  // ============================================

  handleTap() {
    if (this.finished) return;
    if (this.scene.time.now < this.inputLockedUntil) return;

    if (this.typing) {
      // `player` 화자 2줄만 즉시 완성 불가 (UX §3-5 예외)
      if (this.lockInstantComplete) return;
      this._completeLine();
      return;
    }

    const cutscene = this._currentScene();
    if (!cutscene) return;

    if (this.lineIndex + 1 < cutscene.lines.length) {
      this._showLine(this.lineIndex + 1);
    } else {
      this._endScene(false);
    }
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
    for (let i = this.sceneIndex; i < this.queue.length; i += 1) {
      this.onSceneEnd(this.queue[i], { skipped: true });
    }
    this._finish(true);
  }

  _endScene(skipped) {
    this._stopTyping();
    const cutscene = this._currentScene();
    if (cutscene) this.onSceneEnd(cutscene, { skipped });

    const next = this.sceneIndex + 1;
    if (next < this.queue.length) {
      this._playScene(next);
    } else {
      this._finish(false);
    }
  }

  _finish(skippedAll) {
    if (this.finished) return;
    this.finished = true;
    this._stopTyping();
    this.onComplete({ skippedAll });
  }
}

export default CutscenePlayer;
