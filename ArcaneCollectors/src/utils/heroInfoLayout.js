/**
 * heroInfoLayout.js — 영웅 정보 팝업 배치 계산 (REDESIGN_PLAN §3-3/§3-6, T-15b)
 *
 * `HeroInfoPopup` 은 Phaser 오브젝트를 만들기 때문에 단위 테스트에서 다루기 어렵다.
 * 좌표 계산만 여기로 분리했다. 이 모듈은 **어떤 프로젝트 모듈도 import 하지 않는다** —
 * gameConfig/designSystem 을 참조하지 않으므로 부팅 TDZ 위험이 없고 Phaser 없이 테스트된다.
 *
 * 단위는 무차원이다. 입력이 렌더 px 면 출력도 렌더 px 다.
 * 상수(HERO_INFO_LAYOUT)만 기획 좌표(720×1280) 기준이며 호출부가 `s()` 로 옮긴다.
 *
 * PopupBase 의 4슬롯 중 **콘텐츠 슬롯 하나**를 다시 넷으로 쪼갠다.
 * 위에서 아래로 쌓이며 서로 겹치지 않는다.
 *
 *   콘텐츠 top ─┬─ 전신 시트   h = 콘텐츠 높이 × portraitRatio (기본 40%)
 *               ├─ 리본        h = ribbonHeight   (등급 · 교단 · 성급 · 전투력)
 *               ├─ 능력치      h = statsHeight    (제목 + 4행)
 *               └─ 스킬        나머지 전부        (제목 + 최대 3행)
 *   콘텐츠 bottom
 *
 * 이전 구현은 400×600 패널에 스킬 3칸(y+490~550)과 액션 버튼(y+515)을 같은 자리에 그려
 * 서로 덮어썼다. 이 모듈의 `anyOverlap()` 이 그 회귀를 테스트에서 잡는다.
 */

/** 기획 좌표계 크기 */
export const BASE_WIDTH = 720;
export const BASE_HEIGHT = 1280;

/** 배치 상수 (기획 px) */
export const HERO_INFO_LAYOUT = Object.freeze({
  /** 전신 시트가 콘텐츠 높이에서 차지하는 비율 */
  portraitRatio: 0.40,
  /** 섹션 사이 간격 */
  gap: 14,
  /** 등급 · 교단 · 성급 · 전투력 리본 */
  ribbonHeight: 96,
  /** 능력치 섹션 = 제목 34 + 4행×40 + 3간격×6 */
  statsHeight: 212,

  /** 섹션 제목이 차지하는 높이 */
  sectionTitleHeight: 34,

  /** 능력치 행 */
  statRowHeight: 40,
  statRowGap: 6,
  statIconWidth: 28,
  statIconGap: 8,
  statLabelWidth: 56,
  statLabelGap: 12,
  statValueWidth: 96,
  statValueGap: 12,

  /** 스킬 행 */
  skillRowHeight: 64,
  skillRowGap: 10,
  skillIconWidth: 48,
  skillIconGap: 12,
  skillLevelWidth: 84,

  /** 전신 시트 하단을 패널 바닥색으로 녹이는 페이드 띠 */
  portraitFadeHeight: 96,

  /** 리본 두 줄의 세로 위치 (리본 top 기준) */
  ribbonRow1: 30,
  ribbonRow2: 66
});

/** 능력치 행 정의 (표시 순서) */
export const STAT_ROWS = Object.freeze([
  Object.freeze({ key: 'hp', label: 'HP' }),
  Object.freeze({ key: 'atk', label: 'ATK' }),
  Object.freeze({ key: 'def', label: 'DEF' }),
  Object.freeze({ key: 'spd', label: 'SPD' })
]);

/** 스탯 바 정규화 상한. RadarChart · HeroDetailScene 과 같은 축척 */
export const STAT_MAX = Object.freeze({ hp: 2000, atk: 500, def: 400, spd: 150 });

/** 표시할 스킬 최대 개수 */
export const MAX_SKILLS = 3;

// ------------------------------------------------------------------
// 사각형 유틸
// ------------------------------------------------------------------

/**
 * 좌상단·크기로 사각형을 만든다. right/bottom/centerX/centerY 를 함께 채운다.
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} [name] - 겹침 검사 실패 시 어느 요소인지 알려주는 이름
 * @returns {{name:string,x:number,y:number,w:number,h:number,
 *            right:number,bottom:number,centerX:number,centerY:number}}
 */
export function rect(x, y, w, h, name = '') {
  return {
    name,
    x, y, w, h,
    right: x + w,
    bottom: y + h,
    centerX: x + w / 2,
    centerY: y + h / 2
  };
}

/**
 * 두 사각형이 실제로 겹치는지 본다. 변끼리 맞닿는 것은 겹침이 아니다.
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
export function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
}

/**
 * 목록 안에 겹치는 쌍이 있으면 그 쌍을 돌려준다.
 * @param {Array<Object>} boxes
 * @returns {{a:Object,b:Object}|null} 겹침이 없으면 null
 */
export function findOverlap(boxes) {
  if (!Array.isArray(boxes)) return null;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (rectsOverlap(boxes[i], boxes[j])) return { a: boxes[i], b: boxes[j] };
    }
  }
  return null;
}

/**
 * 겹치는 쌍이 하나라도 있는가.
 * @param {Array<Object>} boxes
 * @returns {boolean}
 */
export function anyOverlap(boxes) {
  return findOverlap(boxes) !== null;
}

/**
 * 사각형이 다른 사각형 안에 완전히 들어가는가.
 * @param {Object} inner
 * @param {Object} outer
 * @returns {boolean}
 */
export function contains(outer, inner) {
  if (!outer || !inner) return false;
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.right <= outer.right && inner.bottom <= outer.bottom;
}

// ------------------------------------------------------------------
// 섹션 분할
// ------------------------------------------------------------------

/**
 * 콘텐츠 슬롯을 네 섹션으로 나눈다. 스킬 섹션이 나머지를 전부 받는다.
 *
 * @param {{x?:number,left?:number,y?:number,top?:number,width?:number,w?:number,
 *          height?:number,h?:number}} content - PopupBase.getContentBounds() 또는 동등한 사각형
 * @param {Object} [options]
 * @param {number} [options.portraitRatio] - 전신 시트 비율. 기본 0.40
 * @param {number} [options.gap] - 섹션 간격 (이미 렌더 px 로 변환된 값)
 * @param {number} [options.ribbonHeight]
 * @param {number} [options.statsHeight]
 * @returns {{portrait:Object,ribbon:Object,stats:Object,skills:Object}}
 *          유효하지 않은 입력이면 네 섹션 모두 크기 0
 */
export function computeSections(content, options = {}) {
  const x = content && (content.x ?? content.left);
  const y = content && (content.y ?? content.top);
  const w = content && (content.w ?? content.width);
  const h = content && (content.h ?? content.height);

  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    const zero = rect(0, 0, 0, 0);
    return { portrait: zero, ribbon: zero, stats: zero, skills: zero };
  }

  const L = HERO_INFO_LAYOUT;
  const ratio = options.portraitRatio ?? L.portraitRatio;
  const gap = options.gap ?? L.gap;
  const ribbonH = options.ribbonHeight ?? L.ribbonHeight;
  const statsH = options.statsHeight ?? L.statsHeight;

  const portraitH = h * ratio;

  let cursor = y;
  const portrait = rect(x, cursor, w, portraitH, 'portrait');
  cursor = portrait.bottom + gap;

  const ribbon = rect(x, cursor, w, ribbonH, 'ribbon');
  cursor = ribbon.bottom + gap;

  const stats = rect(x, cursor, w, statsH, 'stats');
  cursor = stats.bottom + gap;

  const skills = rect(x, cursor, w, Math.max(0, y + h - cursor), 'skills');

  return { portrait, ribbon, stats, skills };
}

// ------------------------------------------------------------------
// 전신 시트
// ------------------------------------------------------------------

/**
 * 전신 시트를 가로 기준으로 채우고 위쪽(머리·상반신)만 남긴다.
 *
 * 전신 시트는 세로로 긴 1024×1536 계열이고 이 자리는 가로로 넓은 띠다.
 * 통째로 축소하면 인물이 손톱만해지므로 가로를 채우고 아래를 잘라낸다.
 * 잘린 경계는 호출부가 페이드로 덮는다.
 *
 * @param {number} texW - 원본 너비
 * @param {number} texH - 원본 높이
 * @param {Object} box - 전신 섹션 사각형
 * @param {Object} [options]
 * @param {number} [options.minScale] - 세로가 박스보다 짧아지지 않게 하는 하한 보정. 기본 true 동작
 * @returns {{x:number,y:number,width:number,height:number,scale:number,
 *            originX:number,originY:number,cropped:boolean}}
 *          텍스처 크기가 유효하지 않으면 배율 1 로 안전 복귀
 */
export function computePortraitCover(texW, texH, box, options = {}) {
  const fallback = {
    x: box ? box.centerX : 0,
    y: box ? box.y : 0,
    width: 0, height: 0, scale: 1,
    originX: 0.5, originY: 0,
    cropped: false
  };

  if (!box || !Number.isFinite(texW) || !Number.isFinite(texH) || texW <= 0 || texH <= 0) {
    return fallback;
  }

  // 가로를 채운다. 그래도 세로가 모자라면 세로 기준으로 다시 키운다(빈틈 방지).
  let scale = box.w / texW;
  if (texH * scale < box.h) scale = box.h / texH;
  if (Number.isFinite(options.minScale) && scale < options.minScale) scale = options.minScale;

  const height = texH * scale;

  return {
    x: box.centerX,
    y: box.y,
    width: texW * scale,
    height,
    scale,
    originX: 0.5,
    originY: 0,
    cropped: height > box.h + 0.001
  };
}

/**
 * 전신 시트 하단 페이드 띠. 잘린 경계를 패널 바닥색으로 녹인다.
 * @param {Object} box - 전신 섹션 사각형
 * @param {number} [fadeHeight] - 띠 높이 (렌더 px)
 * @returns {Object} 사각형
 */
export function computePortraitFade(box, fadeHeight) {
  if (!box || !box.w) return rect(0, 0, 0, 0, 'portraitFade');
  const h = Math.min(Number.isFinite(fadeHeight) ? fadeHeight : 0, box.h);
  return rect(box.x, box.bottom - h, box.w, h, 'portraitFade');
}

// ------------------------------------------------------------------
// 능력치
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
 * 능력치 4행을 배치한다. 한 행은 아이콘 · 라벨 · 값 · 바 네 칸이 가로로 늘어서고
 * 네 칸의 사각형이 서로 겹치지 않는다.
 *
 * @param {Object} stats - { hp, atk, def, spd }
 * @param {Object} section - computeSections().stats
 * @param {Object} [options]
 * @param {Object} [options.max] - 정규화 상한. 기본 STAT_MAX
 * @param {Object} [options.metrics] - 렌더 px 로 변환한 HERO_INFO_LAYOUT 하위 집합
 * @returns {Array<{key:string,label:string,value:number,ratio:number,
 *                  row:Object,icon:Object,labelBox:Object,valueBox:Object,
 *                  bar:Object,fillWidth:number}>}
 */
export function computeStatRows(stats, section, options = {}) {
  if (!section || !section.w) return [];

  const L = HERO_INFO_LAYOUT;
  const m = options.metrics || {};
  const max = options.max || STAT_MAX;

  const titleH = m.sectionTitleHeight ?? L.sectionTitleHeight;
  const rowH = m.statRowHeight ?? L.statRowHeight;
  const rowGap = m.statRowGap ?? L.statRowGap;
  const iconW = m.statIconWidth ?? L.statIconWidth;
  const iconGap = m.statIconGap ?? L.statIconGap;
  const labelW = m.statLabelWidth ?? L.statLabelWidth;
  const labelGap = m.statLabelGap ?? L.statLabelGap;
  const valueW = m.statValueWidth ?? L.statValueWidth;
  const valueGap = m.statValueGap ?? L.statValueGap;

  const safe = stats || {};
  const top = section.y + titleH;
  const barX = section.x + iconW + iconGap + labelW + labelGap + valueW + valueGap;
  const barW = Math.max(0, section.right - barX);

  return STAT_ROWS.map((def, index) => {
    const y = top + index * (rowH + rowGap);
    const value = Number(safe[def.key]) || 0;
    const ratio = barRatio(value, max[def.key]);

    return {
      key: def.key,
      label: def.label,
      value,
      ratio,
      row: rect(section.x, y, section.w, rowH, `stat:${def.key}`),
      icon: rect(section.x, y, iconW, rowH, `statIcon:${def.key}`),
      labelBox: rect(section.x + iconW + iconGap, y, labelW, rowH, `statLabel:${def.key}`),
      valueBox: rect(section.x + iconW + iconGap + labelW + labelGap, y, valueW, rowH, `statValue:${def.key}`),
      bar: rect(barX, y, barW, rowH, `statBar:${def.key}`),
      fillWidth: barW * ratio
    };
  });
}

// ------------------------------------------------------------------
// 스킬
// ------------------------------------------------------------------

/**
 * 스킬 행을 배치한다. 남은 높이에 맞춰 행 높이를 줄이되 최소 높이 아래로는 내려가지 않는다.
 * 행이 섹션을 넘치면 `visible` 개수를 줄여서 잘라낸다 — 액션 바를 침범하지 않는다.
 *
 * @param {number} count - 스킬 개수
 * @param {Object} section - computeSections().skills
 * @param {Object} [options]
 * @param {Object} [options.metrics] - 렌더 px 로 변환한 상수
 * @param {number} [options.minRowHeight] - 행 높이 하한
 * @returns {{visible:number,rows:Array<{index:number,row:Object,icon:Object,
 *            nameBox:Object,descBox:Object,levelBox:Object}>}}
 */
export function computeSkillRows(count, section, options = {}) {
  if (!section || !section.w || section.h <= 0 || !Number.isFinite(count) || count < 1) {
    return { visible: 0, rows: [] };
  }

  const L = HERO_INFO_LAYOUT;
  const m = options.metrics || {};
  const titleH = m.sectionTitleHeight ?? L.sectionTitleHeight;
  const gap = m.skillRowGap ?? L.skillRowGap;
  const iconW = m.skillIconWidth ?? L.skillIconWidth;
  const iconGap = m.skillIconGap ?? L.skillIconGap;
  const levelW = m.skillLevelWidth ?? L.skillLevelWidth;
  const minRowH = options.minRowHeight ?? (m.skillRowHeight ?? L.skillRowHeight) * 0.7;

  const wanted = Math.min(count, MAX_SKILLS);
  const available = section.h - titleH;
  if (available <= 0) return { visible: 0, rows: [] };

  // 원하는 개수가 안 들어가면 행 높이를 줄이고, 그래도 안 되면 개수를 줄인다
  let visible = wanted;
  let rowH = (m.skillRowHeight ?? L.skillRowHeight);
  while (visible > 0) {
    const needed = visible * rowH + (visible - 1) * gap;
    if (needed <= available) break;
    const shrunk = (available - (visible - 1) * gap) / visible;
    if (shrunk >= minRowH) { rowH = shrunk; break; }
    visible--;
  }
  if (visible < 1) return { visible: 0, rows: [] };

  const top = section.y + titleH;
  const rows = Array.from({ length: visible }, (_, index) => {
    const y = top + index * (rowH + gap);
    const textX = section.x + iconW + iconGap;
    const textW = Math.max(0, section.w - iconW - iconGap - levelW);
    const half = rowH / 2;

    return {
      index,
      row: rect(section.x, y, section.w, rowH, `skill:${index}`),
      icon: rect(section.x, y, iconW, rowH, `skillIcon:${index}`),
      nameBox: rect(textX, y, textW, half, `skillName:${index}`),
      descBox: rect(textX, y + half, textW, half, `skillDesc:${index}`),
      levelBox: rect(section.right - levelW, y, levelW, rowH, `skillLevel:${index}`)
    };
  });

  return { visible, rows };
}

// ------------------------------------------------------------------
// 리본
// ------------------------------------------------------------------

/**
 * 리본 내부 칸을 배치한다. 좌측 두 줄(등급·교단 / 성급·레벨)과 우측 전투력이다.
 *
 * @param {Object} section - computeSections().ribbon
 * @param {Object} [options]
 * @param {number} [options.padX] - 리본 내부 좌우 여백
 * @param {number} [options.powerWidth] - 우측 전투력 칸 너비
 * @param {number} [options.rowHeight] - 한 줄 높이
 * @returns {{rarity:Object,cult:Object,stars:Object,level:Object,power:Object}}
 */
export function computeRibbonSlots(section, options = {}) {
  if (!section || !section.w) {
    const zero = rect(0, 0, 0, 0);
    return { rarity: zero, cult: zero, stars: zero, level: zero, power: zero };
  }

  const padX = options.padX ?? 20;
  const powerW = options.powerWidth ?? section.w * 0.32;
  const rowH = options.rowHeight ?? section.h / 2;

  const leftX = section.x + padX;
  const leftW = Math.max(0, section.w - padX * 2 - powerW);
  const rarityW = Math.min(leftW * 0.32, 92);

  return {
    rarity: rect(leftX, section.y + rowH * 0.18, rarityW, rowH * 0.64, 'ribbonRarity'),
    cult: rect(leftX + rarityW + 12, section.y + rowH * 0.18, Math.max(0, leftW - rarityW - 12), rowH * 0.64, 'ribbonCult'),
    stars: rect(leftX, section.y + rowH, leftW * 0.6, rowH, 'ribbonStars'),
    level: rect(leftX + leftW * 0.6, section.y + rowH, leftW * 0.4, rowH, 'ribbonLevel'),
    power: rect(section.right - padX - powerW, section.y, powerW, section.h, 'ribbonPower')
  };
}

// ------------------------------------------------------------------
// 겹침 검사용 수집기
// ------------------------------------------------------------------

/**
 * 팝업이 그리는 사각형을 전부 모은다. 테스트가 이 목록으로 겹침 0 을 검사한다.
 *
 * @param {Object} content - 콘텐츠 슬롯 경계
 * @param {Object} [data]
 * @param {Object} [data.stats] - 스탯 값
 * @param {number} [data.skillCount] - 스킬 개수
 * @param {Object} [options] - computeSections 옵션
 * @returns {Array<Object>} 이름이 붙은 사각형 목록
 */
export function collectLayoutBoxes(content, data = {}, options = {}) {
  const sections = computeSections(content, options);
  const boxes = [];

  boxes.push(sections.portrait);

  const ribbon = computeRibbonSlots(sections.ribbon, options.ribbon);
  boxes.push(ribbon.rarity, ribbon.cult, ribbon.stars, ribbon.level, ribbon.power);

  computeStatRows(data.stats, sections.stats, options).forEach((row) => {
    boxes.push(row.icon, row.labelBox, row.valueBox, row.bar);
  });

  computeSkillRows(data.skillCount ?? MAX_SKILLS, sections.skills, options).rows.forEach((row) => {
    boxes.push(row.icon, row.nameBox, row.descBox, row.levelBox);
  });

  return boxes.filter((box) => box.w > 0 && box.h > 0);
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
 * 성급 문자열. 채운 별과 빈 별을 합쳐 항상 같은 길이로 만든다.
 * @param {number} stars - 현재 성급
 * @param {number} [maxStars] - 최대 성급. 기본 6
 * @returns {string}
 */
export function buildStars(stars, maxStars = 6) {
  const max = Number.isFinite(maxStars) && maxStars > 0 ? Math.floor(maxStars) : 6;
  const filled = Math.max(0, Math.min(max, Math.floor(Number(stars) || 0)));
  return '★'.repeat(filled) + '☆'.repeat(max - filled);
}

export default HERO_INFO_LAYOUT;
