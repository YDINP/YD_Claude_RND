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
  text: { x: 56, y: 1022, wrap: 600 },
  name: { x: 52, y: 906, h: 46, padX: 18 },
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

// ------------------------------------------------------------------
// 내레이션 밴드 (가독성 P0)
// ------------------------------------------------------------------

/**
 * 내레이션 전용 밴드 규격 (base px).
 *
 * 내레이션은 대화박스가 없다. 그래서 예전에는 배경 일러스트 위에 흰 글자를 맨몸으로
 * 얹었고, 밝은 배경(예: bg_chapter_1 의 발광 버섯) 위에서 대비가 2:1 아래로 무너졌다.
 * 여기서는 텍스트 높이에 맞춘 **띠(band)** 를 깔아 본문이 항상 어두운 면 위에 놓이게 한다.
 * 띠의 위아래는 페이드로 끝나므로 대화박스처럼 각지지 않고 배경과 이어진다.
 */
export const NARRATION = Object.freeze({
  /** 띠와 본문의 세로 중심 */
  centerY: 620,
  /** 본문 줄바꿈 폭 */
  wrap: 552,
  /** 텍스트 위아래 여백 */
  padY: 58,
  /** 띠 최소 높이 (한 줄짜리 내레이션도 띠처럼 보이게) */
  minH: 190,
  /** 솔리드 코어 바깥으로 사라지는 페이드 높이 */
  fadeH: 72,
  /** 솔리드 코어 알파 — 이 값이 대비를 결정한다 */
  coreAlpha: 0.9,
  /** 화면 전체에 추가로 얹는 딤 */
  scrimAlpha: 0.55,
  /** 본문 위아래 장식 헤어라인 */
  rule: Object.freeze({ w: 148, thickness: 2, inset: 22, alpha: 0.5 })
});

/**
 * 내레이션 띠의 사각형을 텍스트 실측 높이로 정한다 (순수 함수).
 *
 * @param {number} textHeight - 렌더된 본문 높이 (base px)
 * @returns {{y: number, h: number, fadeH: number, centerY: number}}
 */
export function narrationBandRect(textHeight) {
  const measured = Number.isFinite(textHeight) && textHeight > 0 ? textHeight : 0;
  const h = Math.max(NARRATION.minH, Math.round(measured) + NARRATION.padY * 2);
  return {
    y: Math.round(NARRATION.centerY - h / 2),
    h,
    fadeH: NARRATION.fadeH,
    centerY: NARRATION.centerY
  };
}

/**
 * 내레이션 헤어라인 두 줄의 y 좌표.
 * @param {{y: number, h: number}} band - narrationBandRect 결과
 * @returns {{top: number, bottom: number}}
 */
export function narrationRuleY(band) {
  return {
    top: band.y + NARRATION.rule.inset,
    bottom: band.y + band.h - NARRATION.rule.inset
  };
}

// ------------------------------------------------------------------
// 진행 표기
// ------------------------------------------------------------------

/**
 * 진행 카운터 문자열. 대기열에 씬이 둘 이상이면 씬 진행도까지 붙인다.
 *
 * @param {number} lineIndex - 0-based
 * @param {number} lineCount
 * @param {number} [sceneIndex] - 0-based
 * @param {number} [sceneCount]
 * @returns {string}
 */
export function progressLabel(lineIndex, lineCount, sceneIndex = 0, sceneCount = 1) {
  const total = Math.max(1, lineCount || 1);
  const current = Math.min(total, Math.max(1, (lineIndex || 0) + 1));
  const base = `${current} / ${total}`;
  if (!sceneCount || sceneCount <= 1) return base;
  const scene = Math.min(sceneCount, Math.max(1, (sceneIndex || 0) + 1));
  return `${base}  ·  장면 ${scene}/${sceneCount}`;
}

// ------------------------------------------------------------------
// 챕터 타이틀 카드
// ------------------------------------------------------------------

/** 챕터 인트로 타이틀 카드 규격 (base px) */
export const CHAPTER_CARD = Object.freeze({
  /** 내레이션 본문(y 620)과 겹치지 않도록 위쪽에 놓는다 */
  centerY: 440,
  labelDy: -78,
  titleDy: 4,
  ruleDy: 72,
  ruleW: 260,
  ruleThickness: 2,
  fadeInMs: 420,
  holdMs: 1250,
  fadeOutMs: 380,
  /** 아래에서 이미 타이핑 중인 첫 줄이 비쳐 산만해지지 않도록 충분히 덮는다 */
  scrimAlpha: 0.92
});

/**
 * 챕터 인트로 씬인지 판정한다. 타이틀 카드는 `chapter_enter` 에서만 뜬다.
 * @param {{trigger?: string}} scene
 * @returns {boolean}
 */
export function isChapterIntroScene(scene) {
  return !!scene && scene.trigger === 'chapter_enter' && resolveChapterNumber(scene) !== null;
}

/**
 * 타이틀 카드 문구를 만든다.
 * @param {object} scene - story.json SceneObject
 * @param {(chapter: number) => (string|null)} [titleOf] - 챕터 제목 조회기
 * @returns {{label: string, title: string}|null}
 */
export function chapterCardText(scene, titleOf) {
  if (!isChapterIntroScene(scene)) return null;
  const chapter = resolveChapterNumber(scene);
  const title = typeof titleOf === 'function' ? titleOf(chapter) : null;
  return {
    label: `CHAPTER ${chapter}`,
    title: typeof title === 'string' && title.length > 0 ? title : `제 ${chapter} 장`
  };
}

// ------------------------------------------------------------------
// 화자 아트 해석 (실루엣 → 실제 아트)
// ------------------------------------------------------------------

/** 화자 슬롯에 세울 수 있는 아트 종류 */
export const SPEAKER_ASSET_KIND = Object.freeze({
  HERO: 'hero',
  ENEMY: 'enemy',
  NPC: 'npc',
  SILHOUETTE: 'silhouette'
});

/** 초상 카드로 세우는 종류 (알파 없는 512² 흉상) */
const CARD_KINDS = Object.freeze([SPEAKER_ASSET_KIND.ENEMY, SPEAKER_ASSET_KIND.NPC]);

/**
 * 초상 카드로 세우는 화자인지 판정한다.
 * @param {string} kind
 * @returns {boolean}
 */
export function isPortraitCardKind(kind) {
  return CARD_KINDS.includes(kind);
}

/** 종류별 기본 카드 프레임 */
const DEFAULT_FRAME_BY_KIND = Object.freeze({ npc: 'frame_card_R', enemy: 'frame_card_SR' });

/**
 * 적 아트 텍스처 키. `BattleScene.queueEnemyArt()` 와 같은 규약을 쓴다 —
 * 같은 키를 쓰면 전투에서 이미 받아둔 텍스처를 컷씬이 그대로 재사용한다.
 * @param {string} enemyId - 예: enemy_zeus
 * @returns {string|null}
 */
export function enemyTextureKey(enemyId) {
  if (typeof enemyId !== 'string' || enemyId.length === 0) return null;
  return `enemy_art_${enemyId}`;
}

/** 적 초상 카드 규격 (base px) — 적 아트는 512² 정사각 불투명 이미지라 프레임이 필요하다 */
export const ENEMY_CARD = Object.freeze({
  /** 카드 한 변 */
  size: 380,
  /**
   * 프레임 안쪽 여백. `frame_card_*` 는 9-slice 라 테두리 장식 두께가 표시 크기와
   * 무관하게 약 100 렌더 px(= base 67)로 고정된다. 그보다 좁게 잡으면 아트 모서리가
   * 장식 틈으로 삐져나온다 — 실측으로 68 로 고정했다.
   */
  inset: 68,
  /** 카드 중심의 화면 절대 y — 대화박스(y 890~) 위 빈 공간 한가운데 */
  centerY: 596,
  /** 카드 뒤판 알파 */
  plateAlpha: 0.88,
  /** 아트 아래쪽을 배경으로 녹이는 비율 (붙여넣은 듯한 인상 제거) */
  fadeRatio: 0.22,
  /** 액센트 글로우 */
  glowAlpha: 0.18,
  glowSpread: 16,
  /** 화면 가장자리 최소 여백 */
  edgeMargin: 14
});

/** 적 등급 → 카드 프레임 텍스처 키 */
export const ENEMY_FRAME_BY_TYPE = Object.freeze({
  normal: 'frame_card_R',
  elite: 'frame_card_SR',
  boss: 'frame_card_SSR',
  tower_boss: 'frame_card_SSR'
});

/**
 * 적 등급에 맞는 카드 프레임 키.
 * @param {string} enemyType - enemies.json 의 `type`
 * @returns {string}
 */
export function enemyFrameKey(enemyType) {
  return ENEMY_FRAME_BY_TYPE[enemyType] || ENEMY_FRAME_BY_TYPE.elite;
}

/**
 * 적 초상 카드의 배치 (base px). 카드 중심 기준.
 * @param {'left'|'right'} side
 * @returns {{x: number, y: number, size: number, inset: number, artSize: number}}
 */
export function enemyCardRect(side, screenWidth = 720) {
  const slot = actorSlot(side);
  // 카드는 전신 시트보다 넓다. 슬롯 x 를 그대로 쓰면 화면 밖으로 잘린다
  const halfW = ENEMY_CARD.size / 2 + ENEMY_CARD.edgeMargin;
  const x = Math.min(Math.max(slot.x, halfW), screenWidth - halfW);
  return {
    x,
    y: ENEMY_CARD.centerY,
    size: ENEMY_CARD.size,
    inset: ENEMY_CARD.inset,
    artSize: ENEMY_CARD.size - ENEMY_CARD.inset * 2
  };
}

/**
 * 적 이름·id 색인을 만든다 (순수 함수).
 * `story.json` 의 적 화자명 8종은 `enemies.json` 의 `name` 과 정확히 일치한다(실측).
 *
 * @param {object|Array} enemiesJson - enemies.json 또는 그 `enemies` 배열
 * @returns {{byName: Map<string, {id: string, type: string}>, byId: Map<string, {id: string, type: string}>}}
 */
export function buildEnemyIndex(enemiesJson) {
  const list = Array.isArray(enemiesJson) ? enemiesJson : (enemiesJson && enemiesJson.enemies) || [];
  const byName = new Map();
  const byId = new Map();
  for (const entry of list) {
    if (!entry || typeof entry.id !== 'string') continue;
    const record = { id: entry.id, type: typeof entry.type === 'string' ? entry.type : 'elite' };
    byId.set(entry.id, record);
    if (typeof entry.name === 'string' && !byName.has(entry.name)) byName.set(entry.name, record);
  }
  return { byName, byId };
}

/**
 * 한 줄의 적 레코드를 정한다.
 *
 * 우선순위: 데이터가 명시한 `speakerAsset` → `speakerType: 'enemy'` 화자명 색인.
 * `unknown`(???) 줄은 **정체를 숨기는 것이 연출**이므로 `revealAs` 를 보지 않는다.
 *
 * @param {object} line - story.json LineObject
 * @param {{byName: Map, byId: Map}} index - buildEnemyIndex 결과
 * @returns {{id: string, type: string}|null}
 */
export function resolveEnemyForLine(line, index) {
  if (!line || !index) return null;
  const byId = index.byId instanceof Map ? index.byId : new Map();
  const byName = index.byName instanceof Map ? index.byName : new Map();

  if (typeof line.speakerAsset === 'string' && line.speakerAsset.startsWith('enemy_')) {
    return byId.get(line.speakerAsset) || { id: line.speakerAsset, type: 'elite' };
  }
  if (line.speakerType !== 'enemy') return null;

  const name = typeof line.speaker === 'string' ? line.speaker.trim() : '';
  if (!name) return null;
  return byName.get(name) || null;
}

/**
 * 매니페스트에서 적 아트 경로를 찾는다. 등록되지 않은 키는 요청하지 않는다
 * (dev 서버 404 가드가 콘솔 에러를 남겨 부팅 스모크를 깨뜨린다).
 *
 * @param {string} enemyId
 * @param {object} manifestEnemies - asset-manifest.json 의 `enemies` 버킷
 * @returns {string|null}
 */
export function enemyAssetPath(enemyId, manifestEnemies) {
  if (!enemyId || !manifestEnemies) return null;
  const entry = manifestEnemies[enemyId];
  if (typeof entry === 'string' && entry.length > 0) return entry;
  if (entry && typeof entry.path === 'string' && entry.path.length > 0) return entry.path;
  return null;
}

/** 후행 존칭 — 표기가 흔들려도 같은 화자로 붙인다 */
const HONORIFIC_SUFFIX = /(님|씨)$/;

/**
 * 화자명을 조회 키로 정규화한다 (순수 함수).
 * NFC → 앞뒤 공백 제거 → 내부 연속 공백 1칸 → 감싼 따옴표 제거 → 후행 존칭 제거.
 *
 * @param {string} name
 * @returns {string} 정규화된 이름. 비어 있으면 ''
 */
export function normalizeSpeakerName(name) {
  if (typeof name !== 'string') return '';
  let out = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  out = out.replace(/^["'\u201C\u2018]+/, '').replace(/["'\u201D\u2019]+$/, '').trim();
  out = out.replace(HONORIFIC_SUFFIX, '').trim();
  return out;
}

/**
 * `speaker-assets.json` 의 `byName` 을 정규화 키 색인으로 만든다 (순수 함수).
 * @param {object} table - speaker-assets.json
 * @returns {Map<string, object>}
 */
export function buildSpeakerNameIndex(table) {
  const index = new Map();
  const byName = (table && table.byName) || {};
  for (const [name, entry] of Object.entries(byName)) {
    if (!entry || typeof entry !== 'object') continue;
    index.set(normalizeSpeakerName(name), { ...entry, speakerName: name });
  }
  return index;
}

/**
 * 화자가 **의도적으로** 실루엣을 유지하는 대상인지 본다 (`???` 등 정체 미공개).
 * @param {object} line
 * @param {object} table - speaker-assets.json
 * @returns {boolean}
 */
export function isSilhouetteByDesign(line, table) {
  const list = (table && table.silhouetteOnly) || [];
  const name = normalizeSpeakerName(line && line.speaker);
  return list.some((entry) => normalizeSpeakerName(entry) === name);
}

/**
 * 화자 한 줄이 무대에 세울 아트를 정한다 (순수 함수).
 *
 * 규칙
 *   1. 내레이터·수집가 → 슬롯을 쓰지 않는다 (`null`)
 *   2. `speakerAsset` 또는 `speakerType: 'enemy'` + 이름 일치 → 적 초상 카드
 *   3. `portraitId` 있음 → 영웅 전신/포트레이트 (CharacterStage 가 처리)
 *   4. 그 외(등록관 · ???) → 실루엣 메달
 *
 * @param {object} line
 * @param {{enemyIndex?: object, manifestEnemies?: object}} [deps]
 * @returns {{kind: string, enemyId: string|null, enemyType: string|null, textureKey: string|null,
 *            path: string|null, frameKey: string|null, portraitId: string|null}|null}
 */
export function resolveSpeakerAsset(line, deps = {}) {
  if (!isActorLine(line)) return null;

  const silhouette = {
    kind: SPEAKER_ASSET_KIND.SILHOUETTE,
    enemyId: null,
    enemyType: null,
    textureKey: null,
    path: null,
    frameKey: null,
    portraitId: null
  };

  // 2) 데이터가 명시한 적 아트
  const explicitEnemy = resolveEnemyForLine(line, deps.enemyIndex);
  if (explicitEnemy && typeof line.speakerAsset === 'string') {
    const path = enemyAssetPath(explicitEnemy.id, deps.manifestEnemies);
    if (path) return enemyAsset(explicitEnemy, path);
  }

  // 3) 화자명 테이블 (speaker-assets.json)
  const entry = deps.speakerIndex && typeof deps.speakerIndex.get === 'function'
    ? deps.speakerIndex.get(normalizeSpeakerName(line.speaker))
    : null;
  if (entry) {
    const resolved = resolveTableEntry(entry, deps);
    if (resolved) return resolved;
  }

  // 4) 적 화자명 → enemies.json
  if (explicitEnemy) {
    const path = enemyAssetPath(explicitEnemy.id, deps.manifestEnemies);
    if (path) return enemyAsset(explicitEnemy, path);
  }

  // 5) 영웅 전신/포트레이트
  if (line.portraitId) {
    return { ...silhouette, kind: SPEAKER_ASSET_KIND.HERO, portraitId: line.portraitId };
  }

  return silhouette;
}

/** @private 적 레코드 → 아트 서술 */
function enemyAsset(enemy, path) {
  return {
    kind: SPEAKER_ASSET_KIND.ENEMY,
    enemyId: enemy.id,
    enemyType: enemy.type,
    textureKey: enemyTextureKey(enemy.id),
    path,
    frameKey: enemyFrameKey(enemy.type),
    portraitId: null
  };
}

/** @private 화자명 테이블 항목 해석. 아트가 매니페스트에 없으면 null(→ 다음 규칙) */
function resolveTableEntry(entry, deps) {
  if (entry.kind === SPEAKER_ASSET_KIND.HERO && entry.portraitId) {
    return {
      kind: SPEAKER_ASSET_KIND.HERO,
      enemyId: null,
      enemyType: null,
      textureKey: null,
      path: null,
      frameKey: null,
      portraitId: entry.portraitId
    };
  }

  const bucket = entry.kind === SPEAKER_ASSET_KIND.NPC ? deps.manifestNpc : deps.manifestEnemies;
  const meta = bucket && entry.textureKey ? bucket[entry.textureKey] : null;
  const path = typeof meta === 'string' ? meta : (meta && meta.path) || null;
  if (!path) return null;

  return {
    kind: entry.kind,
    enemyId: entry.kind === SPEAKER_ASSET_KIND.ENEMY ? entry.textureKey : null,
    enemyType: null,
    textureKey: entry.textureKey,
    path,
    frameKey: entry.frameKey || DEFAULT_FRAME_BY_KIND[entry.kind] || 'frame_card_R',
    portraitId: null
  };
}

export default {
  CUTSCENE_LAYOUT,
  ACTOR_SLOT,
  ACTOR_DIM,
  CUTSCENE_DIM_ALPHA,
  LOG_LINE_LIMIT,
  NARRATION,
  CHAPTER_CARD,
  SPEAKER_ASSET_KIND,
  resolveChapterNumber,
  resolveCutsceneBgKey,
  isActorLine,
  speakerIdentity,
  assignSpeakerSides,
  actorSlot,
  autoAdvanceDelay,
  recentLogLines,
  narrationBandRect,
  narrationRuleY,
  progressLabel,
  isChapterIntroScene,
  chapterCardText,
  enemyTextureKey,
  ENEMY_CARD,
  enemyFrameKey,
  enemyCardRect,
  buildEnemyIndex,
  resolveEnemyForLine,
  enemyAssetPath,
  resolveSpeakerAsset,
  normalizeSpeakerName,
  buildSpeakerNameIndex,
  isSilhouetteByDesign,
  isPortraitCardKind
};
