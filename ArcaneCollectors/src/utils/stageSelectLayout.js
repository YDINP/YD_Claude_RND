/**
 * stageSelectLayout.js — 스테이지 선택 화면 배치 계산 (REDESIGN_PLAN §3-4, T-16)
 *
 * StageSelectScene 은 Phaser 씬 그래프 전체를 끌고 오므로, 순수 계산만 하는 부분을
 * 여기로 분리했다. 이 모듈은 어떤 프로젝트 모듈도 import 하지 않는다 —
 * gameConfig/designSystem 을 참조하지 않으므로 부팅 TDZ 위험이 없고,
 * Phaser 없이 단위 테스트가 돌아간다.
 *
 * 좌표계: 기획 좌표(720x1280) 기준의 순수 숫자다.
 * 씬이 s() 로 렌더 좌표(1080x1920)로 옮긴다. 이 파일에는 s() 가 없다.
 *
 * 화면 구조 (챕터 제목이 리스트를 덮던 겹침을 헤더 분리로 제거):
 *   0    ~ 80    헤더 (뒤로 · 모험 · 에너지)
 *   88   ~ 236   챕터 헤더 패널 (◀ CHAPTER N ▶ · 챕터명 · 클리어 진행바)
 *   244  ~ 804   스테이지 리스트 (카드 h=92, gap=12, 넘치면 스크롤)
 *   840  ~ 1040  챕터 이야기 패널 (lore + 시청 진행)
 *   1056 ~ 1144  액션 바 (이야기 다시 보기)
 */

/** 기획 좌표계 크기 */
export const BASE_WIDTH = 720;
export const BASE_HEIGHT = 1280;

/** 좌우 여백 */
export const MARGIN = 20;

/** 터치 타겟 하한 (기획 px). DESIGN.touch.minTarget 과 같은 값을 독립 상수로 둔다 */
export const MIN_TOUCH = 48;

/** 화면 세로 구획 */
export const STAGE_SELECT_LAYOUT = Object.freeze({
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  margin: MARGIN,
  header: Object.freeze({ y: 0, h: 80 }),
  chapterPanel: Object.freeze({ x: MARGIN, y: 88, w: BASE_WIDTH - MARGIN * 2, h: 148 }),
  list: Object.freeze({ x: MARGIN, y: 244, w: BASE_WIDTH - MARGIN * 2, h: 560 }),
  lorePanel: Object.freeze({ x: MARGIN, y: 840, w: BASE_WIDTH - MARGIN * 2, h: 200 }),
  footer: Object.freeze({ x: MARGIN, y: 1056, w: BASE_WIDTH - MARGIN * 2, h: 88 }),
  card: Object.freeze({ h: 92, gap: 12 })
});

/**
 * 챕터 지배 교단 — 화면 액센트가 "현재 맥락의 교단 색"을 따른다는 §2-1 Cult Tint 규칙의
 * 스테이지 화면 적용분이다. stages.json 의 챕터 정체성(균열의 시작 / 신들의 전장 /
 * 요미의 심연 / 올림푸스의 시련 / 라그나로크)에서 유도했다.
 * 값은 designSystem 의 colors.cult 키다 — 이 모듈은 색 자체를 알지 못한다.
 */
export const CHAPTER_CULT = Object.freeze({
  chapter_1: 'nature',
  chapter_2: 'valhalla',
  chapter_3: 'yomi',
  chapter_4: 'olympus',
  chapter_5: 'asgard'
});

/**
 * 스테이지 카드 내부 슬롯 (카드 중심 원점, 기획 px).
 *
 * 카드는 세로 92, 가로 680이고 좌에서 우로 네 구역이다.
 *   A(-340~-266) 육각 번호 배지 + 별 3개
 *   B(-240~ +70) 스테이지 이름 / 추천 전투력 · 난이도 라벨
 *   C( +76~+188) 등급 칩(BOSS·정예) / 소탕 버튼
 *   D(+202~+334) 진입 버튼. 우상단 모서리에 이야기 표시
 */
export const CARD_SLOTS = Object.freeze({
  hex: Object.freeze({ x: -294, y: -14, r: 28 }),
  stars: Object.freeze({ x: -294, y: 26, size: 14, gap: 3 }),
  name: Object.freeze({ x: -240, y: -16, wrapWidth: 300 }),
  power: Object.freeze({ x: -240, y: 18 }),
  difficulty: Object.freeze({ x: 56, y: 18 }),
  chip: Object.freeze({ x: 132, y: -26, w: 112, h: 24 }),
  // 버튼 크기는 btn_* 9-slice 의 최소 렌더 크기(144x80)를 넘겨야 한다.
  // 그보다 작게 주면 NineSliceFrame 이 강제로 키워 카드 밖으로 삐져나온다.
  sweep: Object.freeze({ x: 132, y: 16, w: 112, h: 54 }),
  storyMark: Object.freeze({ x: 312, y: -34, size: 16 }),
  action: Object.freeze({ x: 268, y: 0, w: 132, h: 54 })
});

/** 스테이지 등급 칩 라벨. 보스가 정예를 이긴다(한 카드에 칩은 하나만) */
export const STAGE_CHIP = Object.freeze({
  boss: 'BOSS',
  elite: '정예'
});

/**
 * 챕터 이야기 패널의 내부 여백과 줄 수 상한 (기획 px).
 *
 * 이 패널은 길이를 모르는 두 문단을 담는다 — 챕터 요약(`stages.json` chapter.lore)과
 * 다음 스테이지 프리뷰(stage.story_intro)다. 글자 수로 자르면 줄바꿈 결과를 알 수 없어
 * 둘이 겹칠 수 있으므로, 씬이 **줄바꿈 후 실측 높이**를 재서 배치한다.
 * 그 계산이 `resolveLorePlacement()` 이고 여기 값은 그 입력이다.
 */
export const LORE_PANEL = Object.freeze({
  paddingX: 24,
  titleY: 32,       // 패널 상단 기준 제목 중심
  bodyTop: 64,      // 패널 상단 기준 본문 상단
  gap: 14,          // 본문과 프리뷰 사이 최소 간격
  bottomPad: 18,    // 프리뷰 아래 여백
  bodyMaxLines: 3,
  previewMaxLines: 2
});

/** 말줄임 문자 */
export const ELLIPSIS = '…';

// ------------------------------------------------------------------
// 챕터
// ------------------------------------------------------------------

/**
 * chapter_3 같은 챕터 ID 에서 번호를 뽑는다.
 * @param {string} chapterId
 * @returns {number} 1 이상의 정수. 형식이 아니면 0
 */
export function chapterNumberFromId(chapterId) {
  if (typeof chapterId !== 'string') return 0;
  const match = chapterId.match(/^chapter_(\d+)$/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * 챕터 번호를 ID 로 만든다. 이미 ID 형태면 그대로 돌려준다.
 * @param {number|string} chapter
 * @returns {string} 예: chapter_2
 */
export function chapterIdFor(chapter) {
  if (typeof chapter === 'string' && chapter.startsWith('chapter_')) return chapter;
  const n = Number(chapter);
  return `chapter_${Number.isFinite(n) && n > 0 ? Math.floor(n) : 1}`;
}

/**
 * 챕터 번호를 1..total 로 가둔다.
 * @param {number} chapter
 * @param {number} total 사용 가능한 챕터 수
 * @returns {number}
 */
export function clampChapter(chapter, total) {
  const max = Number.isFinite(total) && total > 0 ? Math.floor(total) : 1;
  const n = Number(chapter);
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

/**
 * 챕터의 지배 교단 키. 매핑에 없으면 null — 호출부가 brand.primary 로 폴백한다.
 * @param {number|string} chapter 번호 또는 ID
 * @returns {string|null}
 */
export function resolveChapterCult(chapter) {
  return CHAPTER_CULT[chapterIdFor(chapter)] || null;
}

/**
 * 챕터 헤더 패널 안의 요소 좌표 (기획 px, 절대 좌표).
 * 화살표는 MIN_TOUCH 를 밑돌지 않는 히트 박스를 갖는다.
 * @returns {Object}
 */
export function getChapterHeaderLayout() {
  const p = STAGE_SELECT_LAYOUT.chapterPanel;
  const cx = p.x + p.w / 2;
  return {
    panel: { x: p.x, y: p.y, w: p.w, h: p.h, cx, cy: p.y + p.h / 2 },
    prev: { x: p.x + 44, y: p.y + 60, w: 64, h: MIN_TOUCH + 8 },
    next: { x: p.x + p.w - 44, y: p.y + 60, w: 64, h: MIN_TOUCH + 8 },
    number: { x: cx, y: p.y + 44 },
    name: { x: cx, y: p.y + 84, wrapWidth: p.w - 200 },
    // 진행바와 그 오른쪽의 "N / M 클리어". 바를 왼쪽으로 밀어 문장 자리를 비운다
    progressBar: { x: cx - 200, y: p.y + 118, w: 280, h: 10 },
    progressText: { x: cx + 100, y: p.y + 123 }
  };
}

/**
 * 클리어 진행도. clearedStages 는 스테이지 ID → 별 개수 맵이다.
 * @param {Array<{id:string}>} stages
 * @param {Object<string, number>} clearedStages
 * @returns {{cleared:number,total:number,ratio:number,stars:number,maxStars:number,text:string}}
 */
export function buildChapterProgress(stages, clearedStages = {}) {
  const list = Array.isArray(stages) ? stages : [];
  const total = list.length;
  let cleared = 0;
  let stars = 0;
  list.forEach((stage) => {
    const value = stage && clearedStages ? clearedStages[stage.id] : undefined;
    if (value === undefined) return;
    cleared += 1;
    stars += Math.max(0, Math.min(3, Number(value) || 0));
  });
  return {
    cleared,
    total,
    ratio: total > 0 ? cleared / total : 0,
    stars,
    maxStars: total * 3,
    text: `${cleared} / ${total} 클리어`
  };
}

/**
 * 진행바 채움 너비. 0 진행일 때도 0 을 돌려 빈 바를 그리게 한다.
 * @param {number} ratio 0~1
 * @param {number} width 바 전체 너비
 * @returns {number}
 */
export function getProgressFillWidth(ratio, width) {
  const r = Number(ratio);
  const w = Number(width);
  if (!Number.isFinite(r) || !Number.isFinite(w) || w <= 0) return 0;
  return Math.max(0, Math.min(1, r)) * w;
}

// ------------------------------------------------------------------
// 리스트
// ------------------------------------------------------------------

/**
 * index 번째 카드의 사각형 (기획 px, 절대 좌표). 스크롤 오프셋은 포함하지 않는다.
 * @param {number} index 0 기반
 * @returns {{x:number,y:number,w:number,h:number,cx:number,cy:number}}
 */
export function getStageCardRect(index) {
  const list = STAGE_SELECT_LAYOUT.list;
  const card = STAGE_SELECT_LAYOUT.card;
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  const y = list.y + i * (card.h + card.gap);
  return {
    x: list.x,
    y,
    w: list.w,
    h: card.h,
    cx: list.x + list.w / 2,
    cy: y + card.h / 2
  };
}

/**
 * 리스트 스크롤 메트릭. 카드가 뷰포트를 넘칠 때만 스크롤을 켠다.
 * @param {number} count 카드 수
 * @returns {{contentH:number,viewportH:number,scrollable:boolean,maxScroll:number,visibleCount:number}}
 */
export function getListMetrics(count) {
  const list = STAGE_SELECT_LAYOUT.list;
  const card = STAGE_SELECT_LAYOUT.card;
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  const contentH = n === 0 ? 0 : n * card.h + (n - 1) * card.gap;
  const maxScroll = Math.max(0, contentH - list.h);
  return {
    contentH,
    viewportH: list.h,
    scrollable: maxScroll > 0,
    maxScroll,
    visibleCount: Math.max(0, Math.floor((list.h + card.gap) / (card.h + card.gap)))
  };
}

/**
 * 스크롤 오프셋을 0..maxScroll 로 가둔다.
 * @param {number} offset
 * @param {number} maxScroll
 * @returns {number}
 */
export function clampScroll(offset, maxScroll) {
  const max = Number.isFinite(maxScroll) && maxScroll > 0 ? maxScroll : 0;
  const v = Number(offset);
  if (!Number.isFinite(v)) return 0;
  return Math.min(max, Math.max(0, v));
}

// ------------------------------------------------------------------
// 스테이지 상태
// ------------------------------------------------------------------

/**
 * 카드 한 장의 표시 상태.
 *
 * 잠금 규칙은 기존 동작을 그대로 옮긴 것이다 — 첫 스테이지는 항상 열려 있고,
 * 그 뒤는 직전 스테이지를 클리어해야 열린다.
 * isBoss 판정은 StageWallRules 가 SSOT 이므로 계산하지 않고 인자로 받는다.
 * 넘어오지 않으면 stage.isBoss 만 본다.
 *
 * @param {Object} params
 * @param {Array} params.stages 챕터의 스테이지 배열
 * @param {number} params.index 대상 인덱스
 * @param {Object<string, number>} [params.clearedStages]
 * @param {boolean} [params.isBoss] StageWallRules.isBossStage() 결과
 * @returns {{stage:Object|null,index:number,stars:number,isCleared:boolean,isLocked:boolean,
 *            isBoss:boolean,isElite:boolean,isCurrent:boolean,chip:string|null,alpha:number}}
 */
export function resolveStageState({ stages, index, clearedStages = {}, isBoss } = {}) {
  const list = Array.isArray(stages) ? stages : [];
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  const stage = list[i] || null;
  const cleared = clearedStages || {};

  const rawStars = stage ? cleared[stage.id] : undefined;
  const isCleared = rawStars !== undefined;
  const stars = Math.max(0, Math.min(3, Number(rawStars) || 0));
  const prev = i > 0 ? list[i - 1] : null;
  const isLocked = i > 0 && (!prev || cleared[prev.id] === undefined);
  const boss = typeof isBoss === 'boolean' ? isBoss : stage?.isBoss === true;
  const elite = !boss && stage?.isElite === true;

  return {
    stage,
    index: i,
    stars,
    isCleared,
    isLocked,
    isBoss: boss,
    isElite: elite,
    // 지금 도전할 자리 — 잠기지도 클리어되지도 않은 칸. 시안 펄스를 여기에만 준다
    isCurrent: !isLocked && !isCleared,
    chip: boss ? STAGE_CHIP.boss : (elite ? STAGE_CHIP.elite : null),
    alpha: isLocked ? 0.45 : 1
  };
}

/**
 * 별 아이콘 중심 x 오프셋 목록 (카드 중심 원점).
 * @param {number} [count] 별 개수. 기본 3
 * @returns {number[]}
 */
export function getStarOffsets(count = 3) {
  const slot = CARD_SLOTS.stars;
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 3;
  const step = slot.size + slot.gap;
  const start = slot.x - ((n - 1) * step) / 2;
  return Array.from({ length: n }, (_, i) => start + i * step);
}

// ------------------------------------------------------------------
// 전투력 · 난이도
// ------------------------------------------------------------------

/** 전투력 공식에서 HP에 적용하는 나눗수 (ProgressionSystem.POWER_HP_DIVISOR 와 동일) */
const POWER_HP_DIVISOR = 10;

/**
 * 영웅 한 명의 표시용 전투력.
 *
 * 이 값은 파티 편성 모달의 총 전투력과 같은 식이어야 한다. 카드에 붙는 난이도 밴드와
 * 모달의 벽 경고가 다른 숫자를 말하면 경고가 신뢰를 잃기 때문이다.
 *
 * 식은 전투력 SSOT(`ProgressionSystem.calculatePower` = HP/10 + ATK + DEF + SPD)와 같은
 * 눈금을 쓴다. 스킬 레벨 보너스만 뺀 근사다. 예전 식(HP + ATK*5 + DEF*3 + SPD*2)은
 * 눈금이 약 5배 커서 stages.json 의 `recommendedPower` 와 비교가 되지 않았고,
 * 1인 파티로도 모든 스테이지가 "압승"으로 표시돼 벽 경고가 전혀 뜨지 않았다.
 *
 * @param {{stats?:{hp?:number,atk?:number,def?:number,spd?:number}}} hero
 * @returns {number}
 */
export function estimateHeroPower(hero) {
  const stats = hero && hero.stats;
  if (!stats) return 0;
  const hp = Number(stats.hp) || 0;
  const atk = Number(stats.atk) || 0;
  const def = Number(stats.def) || 0;
  const spd = Number(stats.spd) || 0;
  return Math.floor(hp / POWER_HP_DIVISOR + atk + def + spd);
}

/**
 * 상위 size 명을 골라 합산한 파티 전투력 추정치.
 * 스테이지 카드의 난이도 밴드는 지금 낼 수 있는 최선을 기준으로 말해야 한다.
 *
 * @param {Array} heroes 보유 영웅
 * @param {number} [size] 파티 크기. 기본 4
 * @returns {number}
 */
export function estimatePartyPower(heroes, size = 4) {
  const list = Array.isArray(heroes) ? heroes : [];
  const n = Number.isFinite(size) && size > 0 ? Math.floor(size) : 4;
  return list
    .map(estimateHeroPower)
    .sort((a, b) => b - a)
    .slice(0, n)
    .reduce((sum, v) => sum + v, 0);
}

// ------------------------------------------------------------------
// 챕터 이야기 패널
// ------------------------------------------------------------------

/**
 * 줄바꿈된 줄 배열을 최대 줄 수로 자르고, 잘렸으면 마지막 줄에 말줄임을 붙인다.
 *
 * Phaser 의 `Text.getWrappedText()` 결과를 그대로 받는다. 글자 수로 미리 자르지 않는 이유는
 * 줄바꿈 위치가 서체와 폭에 달려 있어 글자 수로는 줄 수를 예측할 수 없기 때문이다.
 *
 * @param {string[]} lines 줄바꿈된 줄
 * @param {number} maxLines 최대 줄 수
 * @returns {{lines: string[], text: string, truncated: boolean}}
 */
export function fitWrappedLines(lines, maxLines) {
  const list = Array.isArray(lines) ? lines.filter((l) => typeof l === 'string') : [];
  const max = Number.isFinite(maxLines) && maxLines > 0 ? Math.floor(maxLines) : 1;

  if (list.length <= max) {
    return { lines: list, text: list.join('\n'), truncated: false };
  }

  const kept = list.slice(0, max);
  const last = kept[max - 1].replace(/\s+$/, '');
  kept[max - 1] = last.endsWith(ELLIPSIS) ? last : last + ELLIPSIS;
  return { lines: kept, text: kept.join('\n'), truncated: true };
}

/**
 * 실측 높이로 본문과 프리뷰의 y 를 정한다.
 *
 * 본문은 패널 위에서 아래로, 프리뷰는 패널 아래에서 위로 자란다. 둘 사이에 `gap` 이
 * 남지 않으면 겹친 것이므로 `fits: false` 와 함께 본문이 쓸 수 있는 최대 높이를 돌려준다.
 * 호출부는 그 높이에 맞춰 본문 줄을 줄이고 다시 부른다.
 *
 * 단위는 입력과 출력이 같다. 씬은 렌더 px 로, 테스트는 기획 px 로 부른다.
 *
 * @param {Object} params
 * @param {number} params.panelTop 패널 상단 y
 * @param {number} params.panelHeight 패널 높이
 * @param {number} params.bodyTop 패널 상단 기준 본문 상단 오프셋
 * @param {number} params.bottomPad 프리뷰 아래 여백
 * @param {number} params.gap 두 문단 사이 최소 간격
 * @param {number} params.bodyHeight 줄바꿈 후 실측 본문 높이
 * @param {number} params.previewHeight 줄바꿈 후 실측 프리뷰 높이
 * @returns {{bodyY:number, previewY:number, fits:boolean, maxBodyHeight:number}}
 *          y 는 둘 다 상단 기준이다 (origin 0,0)
 */
export function resolveLorePlacement({
  panelTop = 0,
  panelHeight = 0,
  bodyTop = 0,
  bottomPad = 0,
  gap = 0,
  bodyHeight = 0,
  previewHeight = 0
} = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const top = num(panelTop);
  const height = num(panelHeight);
  const bodyY = top + num(bodyTop);
  const previewBottom = top + height - num(bottomPad);
  const previewY = previewBottom - num(previewHeight);
  const maxBodyHeight = Math.max(0, previewY - num(gap) - bodyY);

  return {
    bodyY,
    previewY,
    fits: num(bodyHeight) <= maxBodyHeight,
    maxBodyHeight
  };
}

// ------------------------------------------------------------------
// 이야기 진행
// ------------------------------------------------------------------

/**
 * 챕터의 컷씬 시청 진행도.
 * @param {Array<{id:string,chapterId?:string}>} scenes story.json 컷씬 목록
 * @param {string} chapterId
 * @param {Set<string>|string[]} viewedIds 시청한 컷씬 ID
 * @returns {{viewed:number,total:number,ratio:number,text:string}}
 */
export function buildChapterStoryProgress(scenes, chapterId, viewedIds) {
  const list = Array.isArray(scenes) ? scenes : [];
  const viewed = viewedIds instanceof Set ? viewedIds : new Set(Array.isArray(viewedIds) ? viewedIds : []);
  const mine = list.filter((scene) => scene && scene.chapterId === chapterId);
  const seen = mine.filter((scene) => viewed.has(scene.id)).length;
  return {
    viewed: seen,
    total: mine.length,
    ratio: mine.length > 0 ? seen / mine.length : 0,
    text: mine.length > 0 ? `이야기 ${seen} / ${mine.length}편 시청` : '이야기 없음'
  };
}

/**
 * 이 스테이지에 시청한 컷씬이 하나라도 있는가. 카드의 이야기 표시를 켤지 결정한다.
 * 미시청은 표시하지 않는다 — 스포일러 차단 규칙(StoryLogRules)과 같은 태도다.
 *
 * @param {Array<{id:string,stageId?:string}>} scenes
 * @param {string} stageId
 * @param {Set<string>|string[]} viewedIds
 * @returns {boolean}
 */
export function hasViewedStageStory(scenes, stageId, viewedIds) {
  if (!stageId) return false;
  const list = Array.isArray(scenes) ? scenes : [];
  const viewed = viewedIds instanceof Set ? viewedIds : new Set(Array.isArray(viewedIds) ? viewedIds : []);
  return list.some((scene) => scene && scene.stageId === stageId && viewed.has(scene.id));
}

export default {
  BASE_WIDTH,
  BASE_HEIGHT,
  MARGIN,
  MIN_TOUCH,
  STAGE_SELECT_LAYOUT,
  CHAPTER_CULT,
  CARD_SLOTS,
  STAGE_CHIP,
  LORE_PANEL,
  ELLIPSIS,
  fitWrappedLines,
  resolveLorePlacement,
  chapterNumberFromId,
  chapterIdFor,
  clampChapter,
  resolveChapterCult,
  getChapterHeaderLayout,
  buildChapterProgress,
  getProgressFillWidth,
  getStageCardRect,
  getListMetrics,
  clampScroll,
  resolveStageState,
  getStarOffsets,
  estimateHeroPower,
  estimatePartyPower,
  buildChapterStoryProgress,
  hasViewedStageStory
};
