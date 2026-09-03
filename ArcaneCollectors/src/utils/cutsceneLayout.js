/**
 * cutsceneLayout.js — 컷씬 화면 배치·화자 배치 순수 로직 (Phaser 비의존)
 *
 * SSOT: docs/story/UX_ONBOARDING_FLOW.md §3-2 ~ §3-6 (base 720×1280 좌표계)
 * 렌더링은 `CutscenePlayer` / `CharacterStage` 가 맡고, 여기서는 계산만 한다.
 * 그래야 Phaser 없이 vitest 로 검증할 수 있다.
 *
 * 주의: designSystem/gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

/** 화면 구획 (base px) */
export const CUTSCENE_LAYOUT = Object.freeze({
  letterboxTop: 150,
  letterboxBottom: 130,
  box: { x: 24, y: 890, w: 672, h: 260, radius: 20 },
  text: { x: 56, y: 962, wrap: 600 },
  name: { x: 52, y: 872, h: 46, padX: 18 },
  narrator: { x: 360, y: 620, wrap: 560 },
  skip: { x: 596, y: 24, w: 100, h: 52 },
  skipAll: { x: 24, y: 1196, w: 220, h: 48 },
  auto: { x: 268, y: 1196, w: 96, h: 48 },
  log: { x: 376, y: 1196, w: 96, h: 48 },
  indicator: { x: 656, y: 1118 },
  counter: { right: 696, y: 1220 },
  logPanel: { x: 360, y: 640, w: 640, h: 520 }
});

/** 전신 시트 배치 (base px) — origin (0.5, 1.0) */
export const ACTOR_SLOT = Object.freeze({
  left: { x: 185 },
  right: { x: 535 },
  baselineY: 1160,
  boxH: 760,
  maxW: 560,
  /** 발화자가 살짝 앞으로 나오는 거리 */
  focusLift: 14,
  /** 등장/퇴장 시 바깥쪽으로 밀리는 거리 */
  slideOffset: 48
});

/** 비발화 화자를 어둡게 하는 틴트 (0.55 밝기) 와 알파 */
export const ACTOR_DIM = Object.freeze({ tint: 0x8c8c8c, alpha: 0.82, focusAlpha: 1 });

/** 배경 딤 — 컷씬은 텍스트 가독성이 우선이라 기본 씬(0.35)과 같은 값을 쓴다 */
export const CUTSCENE_DIM_ALPHA = 0.35;

/** 로그에 보관·표시하는 직전 대사 수 */
export const LOG_LINE_LIMIT = 5;

/** 챕터 배경이 존재하는 범위 (asset-manifest lazyTextures) */
export const CHAPTER_BG_RANGE = Object.freeze({ min: 1, max: 5 });

/** 앵커가 없는 씬(영웅 대사 등)의 기본 배경 */
export const DEFAULT_CUTSCENE_BG = 'bg_main';

/** 화자 슬롯을 차지하지 않는 화자 유형 */
const NON_ACTOR_TYPES = Object.freeze(['narrator', 'player']);

/**
 * 씬에서 챕터 번호를 뽑는다. `stageId`("3-5")를 우선하고 없으면 `chapterId`("chapter_3")를 본다.
 * @param {{stageId?: string|null, chapterId?: string|null}} scene
 * @returns {number|null}
 */
export function resolveChapterNumber(scene) {
  if (!scene) return null;

  if (typeof scene.stageId === 'string') {
    const match = scene.stageId.match(/^(\d+)-\d+$/);
    if (match) return Number(match[1]);
  }
  if (typeof scene.chapterId === 'string') {
    const match = scene.chapterId.match(/^chapter_(\d+)$/);
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * 씬 배경 키를 정한다.
 * 씬이 지정한 `background` 텍스처가 실재하면 그것을, 아니면 챕터 배경을,
 * 챕터도 없으면 기본 배경을 쓴다. 챕터 배경은 lazyTextures 라 존재 검사를 하지 않는다
 * (BackgroundFactory 가 폴백을 먼저 그린 뒤 로드되면 갈아 끼운다).
 *
 * @param {object} scene - story.json SceneObject
 * @param {(key: string) => boolean} [hasTexture] - 텍스처 존재 검사기
 * @returns {string}
 */
export function resolveCutsceneBgKey(scene, hasTexture = () => false) {
  if (scene && typeof scene.background === 'string' && hasTexture(scene.background)) {
    return scene.background;
  }
  const chapter = resolveChapterNumber(scene);
  if (chapter !== null && chapter >= CHAPTER_BG_RANGE.min && chapter <= CHAPTER_BG_RANGE.max) {
    return `bg_chapter_${chapter}`;
  }
  return DEFAULT_CUTSCENE_BG;
}

/**
 * 한 줄이 화자 슬롯을 차지하는지 판정한다.
 * 내레이터와 수집가(무언의 주인공)는 얼굴이 없다 — 내러티브 §4-3.
 * @param {{speakerType?: string}} line
 * @returns {boolean}
 */
export function isActorLine(line) {
  return !!line && !NON_ACTOR_TYPES.includes(line.speakerType);
}

/**
 * 화자를 식별하는 키. 같은 인물이 씬 안에서 같은 슬롯을 유지하도록 쓴다.
 * @param {{portraitId?: string|null, speaker?: string, speakerType?: string}} line
 * @returns {string|null}
 */
export function speakerIdentity(line) {
  if (!isActorLine(line)) return null;
  return line.portraitId || `${line.speakerType}:${line.speaker}`;
}

/**
 * 씬의 각 줄에 좌/우 슬롯을 배정한다.
 *
 * 우선순위: 데이터가 지정한 `speakerSide` → 같은 화자가 이미 쓰던 쪽 → 등장 순 교대(좌부터).
 * 내레이터·수집가 줄은 `null` 이다(슬롯을 차지하지 않는다).
 *
 * @param {Array<object>} lines
 * @returns {Array<'left'|'right'|null>}
 */
export function assignSpeakerSides(lines) {
  if (!Array.isArray(lines)) return [];

  const assigned = new Map();
  let nextSide = 'left';

  return lines.map((line) => {
    const identity = speakerIdentity(line);
    if (!identity) return null;

    if (line.speakerSide === 'left' || line.speakerSide === 'right') {
      assigned.set(identity, line.speakerSide);
      return line.speakerSide;
    }
    if (assigned.has(identity)) return assigned.get(identity);

    const side = nextSide;
    assigned.set(identity, side);
    nextSide = side === 'left' ? 'right' : 'left';
    return side;
  });
}

/**
 * 전신 시트의 슬롯 좌표 (base px). origin (0.5, 1.0) 기준.
 * @param {'left'|'right'} side
 * @returns {{x: number, y: number, boxH: number, maxW: number, slideFrom: number}}
 */
export function actorSlot(side) {
  const isLeft = side !== 'right';
  const slot = isLeft ? ACTOR_SLOT.left : ACTOR_SLOT.right;
  return {
    x: slot.x,
    y: ACTOR_SLOT.baselineY,
    boxH: ACTOR_SLOT.boxH,
    maxW: ACTOR_SLOT.maxW,
    slideFrom: isLeft ? -ACTOR_SLOT.slideOffset : ACTOR_SLOT.slideOffset
  };
}

/** 자동 재생 대기 시간 (UX §3-5: 글자수 × 60ms + 700ms, 1.2~4.5초) */
export function autoAdvanceDelay(text) {
  const length = typeof text === 'string' ? text.length : 0;
  return Math.min(4500, Math.max(1200, length * 60 + 700));
}

/**
 * 로그에 보관할 직전 대사 목록을 만든다 (최신이 마지막).
 * @param {Array<{speaker: string, text: string}>} history
 * @param {number} [limit]
 * @returns {Array<{speaker: string, text: string}>}
 */
export function recentLogLines(history, limit = LOG_LINE_LIMIT) {
  if (!Array.isArray(history)) return [];
  return history.slice(-limit);
}

export default {
  CUTSCENE_LAYOUT,
  ACTOR_SLOT,
  ACTOR_DIM,
  CUTSCENE_DIM_ALPHA,
  LOG_LINE_LIMIT,
  resolveChapterNumber,
  resolveCutsceneBgKey,
  isActorLine,
  speakerIdentity,
  assignSpeakerSides,
  actorSlot,
  autoAdvanceDelay,
  recentLogLines
};
