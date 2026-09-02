/**
 * heroDetailLayout.js — 영웅 상세 화면 배치 계산 (REDESIGN_PLAN §3-3, T-15)
 *
 * HeroDetailScene 은 Phaser 씬 그래프 전체를 끌고 오므로, 순수 계산만 하는 부분을
 * 여기로 분리했다. 이 모듈은 어떤 프로젝트 모듈도 import 하지 않는다 —
 * gameConfig/designSystem 을 참조하지 않으므로 부팅 TDZ 위험이 없고,
 * Phaser 없이 단위 테스트가 돌아간다.
 *
 * 좌표계: 기획 좌표(720x1280) 기준의 순수 숫자다.
 * 씬이 s() 로 렌더 좌표(1080x1920)로 옮긴다. 이 파일에는 s() 가 없다.
 *
 * 화면 구조 (겹친 4패널 → 2단 + 4탭):
 *   0    ~ 80    헤더 (뒤로 · 이름 · 등급/레벨/교단)
 *   80   ~ 660   영웅 스테이지 (교단 방사광 + 엠블럼 워터마크 + 전신 시트)
 *   664  ~ 720   탭 바 4칸
 *   728  ~ 1148  탭 콘텐츠 (글래스 패널 1개를 4탭이 재사용)
 *   1160 ~ 1232  액션 바 (레벨업 · 자동 레벨업 · 진화)
 */

/** 기획 좌표계 크기 */
export const BASE_WIDTH = 720;
export const BASE_HEIGHT = 1280;

/** 터치 타겟 하한 (기획 px). DESIGN.touch.minTarget 과 같은 값을 독립 상수로 둔다 */
export const MIN_TOUCH = 48;

/** 화면 세로 구획 */
export const HERO_DETAIL_LAYOUT = Object.freeze({
  width: BASE_WIDTH,
  height: BASE_HEIGHT,
  margin: 20,
  gap: 8,
  header: { y: 0, h: 80 },
  stage: { y: 80, h: 580 },
  /** 전신 시트 하단을 배경으로 녹이는 페이드 띠 (스테이지 위에 겹쳐 그린다) */
  fade: { y: 496, h: 108 },
  /** 성급·전투력 리본 — 전신 시트의 발치를 덮어 오버스캔을 매듭짓는다 */
  ribbon: { y: 604, h: 56 },
  tabBar: { y: 664, h: 56 },
  content: { y: 728, h: 420 },
  actionBar: { y: 1160, h: 72 }
});

/** 탭 4종. 순서가 곧 화면 순서다 */
export const HERO_DETAIL_TABS = Object.freeze([
  Object.freeze({ id: 'stats', label: '능력치', icon: 'atk' }),
  Object.freeze({ id: 'skills', label: '스킬', icon: 'ascension' }),
  Object.freeze({ id: 'equip', label: '장비', icon: 'inventory' }),
  Object.freeze({ id: 'story', label: '이야기', icon: 'collection' })
]);

/** 스탯 바 정규화 상한. RadarChart 기본값과 같은 축척을 쓴다 */
export const STAT_MAX = Object.freeze({ hp: 2000, atk: 500, def: 400, spd: 150 });

/** 스탯 행 정의 (표시 순서) */
export const STAT_ROWS = Object.freeze([
  Object.freeze({ key: 'hp', label: 'HP' }),
  Object.freeze({ key: 'atk', label: 'ATK' }),
  Object.freeze({ key: 'def', label: 'DEF' }),
  Object.freeze({ key: 'spd', label: 'SPD' })
]);

/** 장비 슬롯 표시 순서 */
export const EQUIP_SLOT_ORDER = Object.freeze(['weapon', 'armor', 'accessory', 'relic']);

/** 전신 시트 경로 규약 (public/ 기준 상대 경로) */
export const FULLBODY_DIR = 'assets/characters/fullbody/';
export const FULLBODY_EXT = '.webp';
export const FULLBODY_KEY_PREFIX = 'fb_';

// ------------------------------------------------------------------
// 탭 · 액션 바
// ------------------------------------------------------------------

/**
 * 탭 id 목록.
 * @returns {string[]}
 */
export function getTabIds() {
  return HERO_DETAIL_TABS.map((tab) => tab.id);
}

/**
 * 탭 id 를 검증한다. 알 수 없는 값은 첫 번째 탭으로 폴백한다.
 * @param {string} id
 * @returns {string} 유효한 탭 id
 */
export function resolveTabId(id) {
  return getTabIds().includes(id) ? id : HERO_DETAIL_TABS[0].id;
}

/**
 * 가로로 균등 분할한 슬롯을 만든다. 탭 바와 액션 바가 공유한다.
 *
 * @param {number} count - 칸 수
 * @param {Object} [options]
 * @param {number} [options.width] - 전체 너비. 기본 720
 * @param {number} [options.margin] - 좌우 여백. 기본 20
 * @param {number} [options.gap] - 칸 사이 간격. 기본 8
 * @param {number} [options.y] - 상단 y
 * @param {number} [options.h] - 높이
 * @returns {Array<{index:number,x:number,y:number,w:number,h:number,centerX:number,centerY:number}>}
 *          x 는 좌상단. count 가 1 미만이면 빈 배열
 */
export function computeSlotRow(count, options = {}) {
  const {
    width = BASE_WIDTH,
    margin = HERO_DETAIL_LAYOUT.margin,
    gap = HERO_DETAIL_LAYOUT.gap,
    y = 0,
    h = MIN_TOUCH
  } = options;

  if (!Number.isFinite(count) || count < 1) return [];

  const usable = width - margin * 2 - gap * (count - 1);
  const slotW = usable / count;

  return Array.from({ length: count }, (_, index) => {
    const x = margin + index * (slotW + gap);
    return {
      index,
      x,
      y,
      w: slotW,
      h,
      centerX: x + slotW / 2,
      centerY: y + h / 2
    };
  });
}

/**
 * 탭 바 슬롯. computeSlotRow 를 탭 개수와 탭 바 구획으로 고정 호출한 것이다.
 * @param {Object} [options] - computeSlotRow 옵션 덮어쓰기
 * @returns {Array<Object>} 각 슬롯에 탭 정보(id/label/icon)가 합쳐진다
 */
export function computeTabSlots(options = {}) {
  const bar = HERO_DETAIL_LAYOUT.tabBar;
  const slots = computeSlotRow(HERO_DETAIL_TABS.length, { y: bar.y, h: bar.h, ...options });
  return slots.map((slot, index) => ({ ...slot, ...HERO_DETAIL_TABS[index] }));
}

/**
 * 액션 바 슬롯.
 * @param {number} count - 버튼 수
 * @param {Object} [options]
 * @returns {Array<Object>}
 */
export function computeActionSlots(count, options = {}) {
  const bar = HERO_DETAIL_LAYOUT.actionBar;
  return computeSlotRow(count, { y: bar.y, h: bar.h, gap: 12, ...options });
}

/**
 * 슬롯이 최소 터치 타겟을 만족하는지 본다.
 * @param {{w:number,h:number}} slot
 * @param {number} [min] - 하한. 기본 MIN_TOUCH
 * @returns {boolean}
 */
export function meetsTouchTarget(slot, min = MIN_TOUCH) {
  if (!slot) return false;
  return slot.w >= min && slot.h >= min;
}

// ------------------------------------------------------------------
// 전신 시트
// ------------------------------------------------------------------

/**
 * 캐릭터 id 에 대응하는 전신 텍스처 키를 만든다.
 * 포트레이트 매핑(char id → hero_XXX)을 그대로 재사용하고 fb_ 접두사만 붙인다.
 *
 * @param {string} charId - 캐릭터 id (예: base_iris)
 * @param {Object} portraitMap - portrait-mapping.json (id → 파일명)
 * @returns {string|null} 예: fb_hero_005. 매핑이 없으면 null
 */
export function resolveFullbodyKey(charId, portraitMap) {
  if (!charId || !portraitMap) return null;
  const fileName = portraitMap[charId];
  if (typeof fileName !== 'string' || fileName.length === 0) return null;
  return FULLBODY_KEY_PREFIX + fileName;
}

/**
 * 전신 텍스처 키의 파일 경로를 만든다.
 * @param {string} key - 예: fb_hero_005
 * @returns {string|null} 예: assets/characters/fullbody/hero_005.webp
 */
export function fullbodyPath(key) {
  if (typeof key !== 'string' || !key.startsWith(FULLBODY_KEY_PREFIX)) return null;
  return FULLBODY_DIR + key.slice(FULLBODY_KEY_PREFIX.length) + FULLBODY_EXT;
}

/**
 * 매니페스트에 전신이 실제로 존재하는지 본다.
 * 없는 키를 로드하면 dev 서버의 404 가드가 콘솔 에러를 남기므로 선검사한다.
 *
 * @param {string} key - 전신 텍스처 키
 * @param {Object} manifestFullbody - asset-manifest.json 의 fullbody 버킷
 * @returns {boolean}
 */
export function hasFullbodyAsset(key, manifestFullbody) {
  if (!key || !manifestFullbody) return false;
  return Object.prototype.hasOwnProperty.call(manifestFullbody, key);
}

/**
 * 전신 시트 표시 크기를 구한다.
 *
 * 세로를 스테이지 높이의 overscan 배로 맞춘다 (1 보다 크면 아래로 살짝 넘쳐
 * 탭 바 위에서 페이드로 끊긴다). 그 결과 가로가 허용 폭을 넘으면 가로 기준으로 다시 줄인다.
 *
 * @param {number} texW - 원본 텍스처 너비
 * @param {number} texH - 원본 텍스처 높이
 * @param {Object} [options]
 * @param {number} [options.boxH] - 기준 높이. 기본 stage.h
 * @param {number} [options.maxW] - 허용 최대 너비
 * @param {number} [options.overscan] - 세로 배율. 기본 0.99 (발치가 리본에 살짝 잠긴다)
 * @returns {{width:number,height:number,scale:number,widthLimited:boolean}}
 *          텍스처 크기가 유효하지 않으면 scale 1 과 원본 크기를 돌려준다
 */
export function computeFullbodyFit(texW, texH, options = {}) {
  const {
    boxH = HERO_DETAIL_LAYOUT.stage.h,
    maxW = BASE_WIDTH * 0.72,
    overscan = 0.99
  } = options;

  if (!Number.isFinite(texW) || !Number.isFinite(texH) || texW <= 0 || texH <= 0) {
    return { width: texW || 0, height: texH || 0, scale: 1, widthLimited: false };
  }

  let scale = (boxH * overscan) / texH;
  let widthLimited = false;

  if (texW * scale > maxW) {
    scale = maxW / texW;
    widthLimited = true;
  }

  return { width: texW * scale, height: texH * scale, scale, widthLimited };
}

/**
 * 전신 시트의 앵커 위치. origin(0.5, 1) 기준 — 발끝을 스테이지 바닥에 붙인다.
 * 바닥 근처는 리본이 덮으므로 발치가 잘린 것처럼 보이지 않는다.
 *
 * @param {Object} [options]
 * @param {number} [options.xRatio] - 화면 가로 비율. 기본 0.60 (살짝 우측)
 * @param {number} [options.bottomOverscan] - 스테이지 바닥에서 더 내려갈 양. 기본 0
 * @returns {{x:number,y:number,originX:number,originY:number}}
 */
export function computeFullbodyAnchor(options = {}) {
  const { xRatio = 0.60, bottomOverscan = 0 } = options;
  const stage = HERO_DETAIL_LAYOUT.stage;
  return {
    x: BASE_WIDTH * xRatio,
    y: stage.y + stage.h + bottomOverscan,
    originX: 0.5,
    originY: 1
  };
}

// ------------------------------------------------------------------
// 능력치 탭
// ------------------------------------------------------------------

/**
 * 값을 0~1 비율로 정규화한다.
 * @param {number} value
 * @param {number} max
 * @returns {number} 0 이상 1 이하
 */
export function barRatio(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/**
 * 콘텐츠 패널을 좌(수치) 우(레이더)로 나눈다. 같은 좌표에 겹치던 충돌을 없앤다.
 *
 * @param {Object} [rect] - 콘텐츠 구획. 기본 HERO_DETAIL_LAYOUT.content
 * @param {Object} [options]
 * @param {number} [options.padding] - 패널 내부 여백. 기본 24
 * @param {number} [options.leftRatio] - 좌측 열이 차지하는 비율. 기본 0.58
 * @returns {{left:{x:number,y:number,w:number,h:number},
 *            right:{x:number,y:number,w:number,h:number}}}
 */
export function splitStatArea(rect = HERO_DETAIL_LAYOUT.content, options = {}) {
  const { padding = 24, leftRatio = 0.58 } = options;
  const x = HERO_DETAIL_LAYOUT.margin + padding;
  const w = BASE_WIDTH - (HERO_DETAIL_LAYOUT.margin + padding) * 2;
  const y = rect.y + padding;
  const h = rect.h - padding * 2;
  const leftW = w * leftRatio;

  return {
    left: { x, y, w: leftW, h },
    right: { x: x + leftW, y, w: w - leftW, h }
  };
}

/**
 * 스탯 4행의 배치와 바 길이를 계산한다.
 *
 * @param {Object} stats - { hp, atk, def, spd }
 * @param {Object} [options]
 * @param {Object} [options.area] - splitStatArea().left 결과
 * @param {Object} [options.max] - 정규화 상한. 기본 STAT_MAX
 * @param {number} [options.rowGap] - 행 간격. 기본 44
 * @param {number} [options.barW] - 바 최대 길이. 기본 area.w * 0.52
 * @param {number} [options.barX] - 바 시작 x. 기본 area.x + area.w * 0.48
 * @returns {Array<{key:string,label:string,value:number,ratio:number,
 *                  y:number,barX:number,barW:number,fillW:number}>}
 */
export function computeStatRows(stats, options = {}) {
  const area = options.area || splitStatArea().left;
  const max = options.max || STAT_MAX;
  const rowGap = options.rowGap ?? 44;
  const barW = options.barW ?? area.w * 0.52;
  const barX = options.barX ?? area.x + area.w * 0.48;
  const safe = stats || {};

  return STAT_ROWS.map((row, index) => {
    const value = Number(safe[row.key]) || 0;
    const ratio = barRatio(value, max[row.key]);
    return {
      key: row.key,
      label: row.label,
      value,
      ratio,
      y: area.y + index * rowGap,
      barX,
      barW,
      fillW: barW * ratio
    };
  });
}

/**
 * 레이더 차트 중심과 반지름. 우측 열 안에 완전히 들어가게 잡는다.
 *
 * @param {Object} [area] - splitStatArea().right 결과
 * @param {Object} [options]
 * @param {number} [options.labelPad] - 축 라벨이 차지하는 바깥 여백. 기본 26
 * @returns {{cx:number,cy:number,radius:number}}
 */
export function computeRadarPlacement(area = splitStatArea().right, options = {}) {
  const { labelPad = 26 } = options;
  const cx = area.x + area.w / 2;
  const cy = area.y + area.h * 0.42;
  const radius = Math.max(0, Math.min(area.w / 2, area.h * 0.42) - labelPad);
  return { cx, cy, radius };
}

// ------------------------------------------------------------------
// 장비 · 스킬 탭
// ------------------------------------------------------------------

/**
 * 격자 배치를 계산한다. 장비 슬롯과 스킬 카드가 공유한다.
 *
 * @param {number} count - 항목 수
 * @param {Object} [options]
 * @param {number} [options.columns] - 열 수. 기본 4
 * @param {number} [options.x] - 좌상단 x
 * @param {number} [options.y] - 좌상단 y
 * @param {number} [options.cellW] - 칸 너비
 * @param {number} [options.cellH] - 칸 높이
 * @param {number} [options.gapX] - 가로 간격. 기본 12
 * @param {number} [options.gapY] - 세로 간격. 기본 12
 * @returns {Array<{index:number,row:number,col:number,x:number,y:number,
 *                  w:number,h:number,centerX:number,centerY:number}>}
 */
export function computeGrid(count, options = {}) {
  const {
    columns = 4,
    x = 0,
    y = 0,
    cellW = 100,
    cellH = 100,
    gapX = 12,
    gapY = 12
  } = options;

  if (!Number.isFinite(count) || count < 1 || columns < 1) return [];

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const cx = x + col * (cellW + gapX);
    const cy = y + row * (cellH + gapY);
    return {
      index,
      row,
      col,
      x: cx,
      y: cy,
      w: cellW,
      h: cellH,
      centerX: cx + cellW / 2,
      centerY: cy + cellH / 2
    };
  });
}

/**
 * 콘텐츠 패널 폭에 맞춘 장비 슬롯 격자.
 * 슬롯은 항상 터치 타겟 하한 이상이 되도록 칸 크기를 잡는다.
 *
 * @param {number} [count] - 슬롯 수. 기본 4
 * @param {Object} [options]
 * @param {number} [options.padding] - 패널 내부 여백. 기본 24
 * @param {number} [options.gapX] - 슬롯 간격. 기본 16
 * @param {number} [options.top] - 첫 줄 상단 y
 * @returns {Array<Object>}
 */
export function computeEquipSlots(count = EQUIP_SLOT_ORDER.length, options = {}) {
  const { padding = 24, gapX = 16, top } = options;
  const content = HERO_DETAIL_LAYOUT.content;
  const x = HERO_DETAIL_LAYOUT.margin + padding;
  const usableW = BASE_WIDTH - (HERO_DETAIL_LAYOUT.margin + padding) * 2;
  const cell = Math.max(MIN_TOUCH, (usableW - gapX * (count - 1)) / count);

  return computeGrid(count, {
    columns: count,
    x,
    y: top ?? content.y + padding + 28,
    cellW: cell,
    cellH: cell,
    gapX,
    gapY: 16
  });
}

/**
 * 세로로 쌓는 카드 목록 배치 (스킬 탭).
 *
 * @param {number} count
 * @param {Object} [options]
 * @param {number} [options.top] - 첫 카드 상단 y
 * @param {number} [options.cardH] - 카드 높이. 기본 96
 * @param {number} [options.gap] - 카드 간격. 기본 14
 * @param {number} [options.padding] - 패널 내부 여백. 기본 24
 * @returns {Array<{index:number,x:number,y:number,w:number,h:number,
 *                  centerX:number,centerY:number}>}
 */
export function computeCardStack(count, options = {}) {
  const { cardH = 96, gap = 14, padding = 24 } = options;
  const content = HERO_DETAIL_LAYOUT.content;
  const top = options.top ?? content.y + padding;
  const x = HERO_DETAIL_LAYOUT.margin + padding;
  const w = BASE_WIDTH - (HERO_DETAIL_LAYOUT.margin + padding) * 2;

  if (!Number.isFinite(count) || count < 1) return [];

  return Array.from({ length: count }, (_, index) => {
    const y = top + index * (cardH + gap);
    return { index, x, y, w, h: cardH, centerX: x + w / 2, centerY: y + cardH / 2 };
  });
}

/**
 * 배치가 콘텐츠 구획 밖으로 넘치는지 본다. 탭 콘텐츠가 액션 바를 침범하는 회귀를 막는다.
 * @param {Array<{y:number,h:number}>} boxes
 * @param {Object} [rect] - 기본 HERO_DETAIL_LAYOUT.content
 * @returns {boolean} 모두 안에 들어오면 true
 */
export function fitsInContent(boxes, rect = HERO_DETAIL_LAYOUT.content) {
  if (!Array.isArray(boxes) || boxes.length === 0) return true;
  const bottom = rect.y + rect.h;
  return boxes.every((box) => box.y >= rect.y && box.y + box.h <= bottom);
}

// ------------------------------------------------------------------
// 표시 문자열
// ------------------------------------------------------------------

/**
 * 천 단위 구분 기호를 넣는다.
 * @param {number} value
 * @returns {string} 숫자가 아니면 '0'
 */
export function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return Math.floor(n).toLocaleString('en-US');
}

/**
 * 긴 문자열을 자르고 말줄임표를 붙인다.
 * @param {string} text
 * @param {number} max - 최대 글자 수
 * @returns {string}
 */
export function truncate(text, max) {
  if (typeof text !== 'string') return '';
  if (!Number.isFinite(max) || max <= 0 || text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

/**
 * 헤더 부제 문자열 — 등급 · 레벨 · 교단.
 * @param {Object} parts
 * @param {string} [parts.rarity]
 * @param {number} [parts.level]
 * @param {string} [parts.cultName]
 * @returns {string} 빈 조각은 건너뛴다
 */
export function buildSubtitle({ rarity, level, cultName } = {}) {
  const chunks = [];
  if (rarity) chunks.push(String(rarity));
  if (Number.isFinite(Number(level))) chunks.push(`Lv.${Number(level)}`);
  if (cultName) chunks.push(String(cultName));
  return chunks.join(' · ');
}

export default HERO_DETAIL_LAYOUT;
