/**
 * mainMenuLayout.js — 메인 메뉴 배치 계산 (REDESIGN_PLAN §3-1 / T-10)
 *
 * MainMenuScene 은 유휴전투·튜토리얼 배선·팝업 레지스트리를 함께 들고 있어서 크다.
 * 그중 "어디에 무엇을 놓는가" 만 이 모듈로 떼어 냈다. Phaser 참조가 없고
 * designSystem 의 조회 함수만 함수 본문에서 부른다. 덕분에 배치 규칙을 씬을 띄우지
 * 않고 단위 테스트로 고정할 수 있다.
 *
 * 좌표계는 전부 base 720x1280 이다. 씬이 s() 로 렌더 좌표(1080x1920)로 올린다.
 * 이 모듈이 s() 를 부르지 않는 이유는 battleLayout.js 와 같다. 값이 반올림되기 전이라
 * 테스트가 읽기 쉽고, 기획 문서(REDESIGN_PLAN §3-1)의 숫자와 1:1로 대조된다.
 *
 * 세로 대역은 서로 겹치지 않는다. 이것이 §1-1 "유휴전투 뷰가 모험 패널을 뚫는다"의
 * 해소 근거이며, `bandsOverlap()` 이 테스트에서 그 불변식을 지킨다.
 *
 * 주의: designSystem·gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 *       getCultColor 는 반드시 함수 본문 안에서 호출한다.
 */
import { getCultColor, DESIGN } from '../config/designSystem.js';

/** base 화면 크기 (720x1280). s() 적용 전 좌표계 */
export const BASE_W = 720;
export const BASE_H = 1280;

/** 좌우 공통 여백 */
export const GUTTER = 20;

/** 터치 타깃 하한 (base px). DESIGN.touch.minTarget 과 같은 값이며 여기서는 상수로 둔다 */
export const MIN_TOUCH = 48;

/**
 * 화면 세로 대역 (REDESIGN_PLAN §3-1 아스키 명세).
 * 각 대역은 위에서 아래로 이어지고 서로 겹치지 않는다.
 */
export const MAIN_LAYOUT = Object.freeze({
  topBar:    { x: 0,      y: 0,    w: 720, h: 80 },
  party:     { x: GUTTER, y: 88,   w: 680, h: 148 },
  power:     { x: GUTTER, y: 244,  w: 680, h: 60 },
  adventure: { x: GUTTER, y: 312,  w: 680, h: 188 },
  idle:      { x: GUTTER, y: 508,  w: 680, h: 388 },
  summary:   { x: GUTTER, y: 904,  w: 680, h: 52 },
  claim:     { x: 208,    y: 964,  w: 304, h: 60 },
  grid:      { x: 0,      y: 1040, w: 720, h: 234 }
});

/** 대역 순서 — 겹침 검사와 화면 순회에 쓴다 */
export const BAND_ORDER = Object.freeze([
  'topBar', 'party', 'power', 'adventure', 'idle', 'summary', 'claim', 'grid'
]);

/** 메뉴 그리드 규격 (5열 대응). cellW/cellH 가 곧 터치 박스다 */
export const MENU_GRID = Object.freeze({
  top: 1040,
  cellW: 96,
  cellH: 72,
  gapX: 20,
  rowPitch: 78,
  iconDy: 30,   // 행 상단 → 아이콘 원 중심
  iconR: 28,    // 아이콘 원 반지름
  labelDy: 64   // 행 상단 → 라벨 중심
});

/** 파티 슬롯 규격 */
export const PARTY_SLOT = Object.freeze({
  count: 4,
  inset: 16,     // 패널 좌우 안쪽 여백
  avatarDy: 82,  // 패널 상단 → 아바타 중심
  avatarR: 28,
  nameDy: 118,
  levelDy: 134
});

/** 현재 모험 패널 내부 규격 */
export const ADVENTURE = Object.freeze({
  titleDy: 16,
  captionDy: 20,
  stageDy: 52,
  buttonDy: 84,
  buttonH: 64,
  buttonGap: 8,
  progressDy: 162,
  progressH: 10
});

/** 유휴전투 창(관측창) 규격. 뷰는 대역 안쪽으로 inset 만큼 들어간다 */
export const IDLE_WINDOW = Object.freeze({
  inset: 6,
  /** 대표 영웅 전신 장식 */
  fullbody: { cx: 460, alpha: 0.30, overscan: 1.08, glowR: 168, glowAlpha: 0.11 }
});

// ------------------------------------------------------------------
// 공통 헬퍼
// ------------------------------------------------------------------

/**
 * 두 사각형이 세로로 겹치는가.
 * @param {{y:number,h:number}} a
 * @param {{y:number,h:number}} b
 * @returns {boolean}
 */
export function bandsOverlap(a, b) {
  if (!a || !b) return false;
  return a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * 사각형이 터치 타깃 하한을 만족하는가 (§2-5: 시각 크기와 히트 영역을 분리한다).
 * @param {{w:number,h:number}} rect
 * @param {number} [min]
 * @returns {boolean}
 */
export function meetsTouchTarget(rect, min = MIN_TOUCH) {
  if (!rect) return false;
  return rect.w >= min && rect.h >= min;
}

/**
 * 좌상단 기준 사각형을 중심 좌표로 바꾼다.
 * @param {{x:number,y:number,w:number,h:number}} rect
 * @returns {{x:number,y:number,w:number,h:number}} x,y 가 중심
 */
export function toCenterRect(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, w: rect.w, h: rect.h };
}

/**
 * 0~1 비율을 진행바 채움 폭으로 바꾼다. 범위를 벗어난 입력은 잘라낸다.
 * @param {number} ratio
 * @param {number} width
 * @returns {number}
 */
export function progressFillWidth(ratio, width) {
  const r = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
  return width * r;
}

// ------------------------------------------------------------------
// 상단바
// ------------------------------------------------------------------

/**
 * 상단바 요소 배치 (§3-1: 레벨 · 젬 · 골드 · 에너지 채움바 · 설정).
 *
 * 에너지 바는 현재 "빈 검은 사각형"이다(§1-1). 원인은 EnergyBar 컨테이너의 depth 가
 * 상단바 배경(depth 300)보다 낮은 200 이라 배경에 덮이는 것이었다. 그래서 씬이
 * 상단바와 같은 depth 로 직접 그리도록 좌표만 여기서 준다.
 *
 * 각 슬롯의 `interactive` 는 접근성 계약이다 (A11Y_AUDIT §(d)).
 *   - true  → `hit` 사각형이 반드시 있고 터치 하한(48x48 base)을 넘어야 한다
 *   - false → 표시 전용. 씬은 setInteractive 를 붙이지 않는다
 * level/gem/gold 는 수치를 읽기만 하는 표시 전용이라 시각 크기(30px, 22px)가
 * 하한보다 작아도 위반이 아니다. 탭 동작이 생기면 이 플래그를 true 로 바꾸고
 * hit 을 추가해야 하며, 테스트가 그때 실패해 누락을 잡는다.
 *
 * @returns {Object} base 좌표 슬롯 모음
 */
export function computeTopBarSlots() {
  const bar = MAIN_LAYOUT.topBar;
  const midY = bar.y + bar.h / 2;

  return {
    bar,
    midY,
    level:   { x: 40, y: midY, w: 56, h: 30, interactive: false },
    gem:     { iconX: 96,  textX: 118, y: midY, iconSize: 22, interactive: false },
    gold:    { iconX: 208, textX: 230, y: midY, iconSize: 22, interactive: false },
    energy:  { iconX: 340, x: 356, y: midY - 9, w: 150, h: 18, textX: 431, textY: midY, interactive: false },
    timer:   { x: 431, y: midY + 21, interactive: false },
    charge:  { x: 540, y: midY, w: 44, h: 44, interactive: true, hit: { w: MIN_TOUCH, h: MIN_TOUCH } },
    settings:{ x: 684, y: midY, w: MIN_TOUCH, h: MIN_TOUCH, interactive: true,
               hit: { w: MIN_TOUCH, h: MIN_TOUCH } }
  };
}

/**
 * 에너지 채움바의 채움 폭 (§3-1: 빈 사각형 → 실제 채움바).
 * @param {number} current
 * @param {number} max
 * @returns {{ratio:number, fillW:number}}
 */
export function computeEnergyFill(current, max) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, (Number.isFinite(current) ? current : 0) / safeMax));
  const { w } = computeTopBarSlots().energy;
  return { ratio, fillW: w * ratio };
}

/**
 * 상단바에서 탭 가능한 슬롯 이름 목록 (A11Y_AUDIT §(d) 검증용).
 * @returns {string[]}
 */
export function interactiveTopBarSlots() {
  const slots = computeTopBarSlots();
  return Object.keys(slots).filter((name) => slots[name] && slots[name].interactive === true);
}

// ------------------------------------------------------------------
// 파티 패널
// ------------------------------------------------------------------

/**
 * 파티 슬롯 4칸 좌표. 슬롯은 패널 폭을 4등분한 중심에 놓인다.
 * @param {number} [count] - 슬롯 수 (기본 4)
 * @returns {Array<{index:number,x:number,y:number,r:number,nameY:number,levelY:number,hit:Object}>}
 */
export function computePartySlots(count = PARTY_SLOT.count) {
  const panel = MAIN_LAYOUT.party;
  const n = Math.max(1, count);
  const inner = panel.w - PARTY_SLOT.inset * 2;
  const slotW = inner / n;
  const left = panel.x + PARTY_SLOT.inset;

  return Array.from({ length: n }, (_, index) => {
    const x = left + slotW / 2 + index * slotW;
    const y = panel.y + PARTY_SLOT.avatarDy;
    return {
      index,
      x,
      y,
      r: PARTY_SLOT.avatarR,
      nameY: panel.y + PARTY_SLOT.nameDy,
      levelY: panel.y + PARTY_SLOT.levelDy,
      hit: { x, y, w: Math.max(MIN_TOUCH, PARTY_SLOT.avatarR * 2), h: Math.max(MIN_TOUCH, PARTY_SLOT.avatarR * 2) }
    };
  });
}

/**
 * 파티 패널 헤더(제목 + 편성 버튼).
 * 편성 버튼은 §3-1 대로 x=560 대역으로 당겨 우상단 FAB 와 겹치지 않게 한다.
 * 시각 알약은 낮지만 히트 박스는 터치 하한을 지킨다.
 * @returns {{title:{x:number,y:number}, editPill:Object, editHit:Object}}
 */
export function computePartyHeader() {
  const panel = MAIN_LAYOUT.party;
  const pillW = 108;
  const pillH = 36;
  const cx = 600;
  const cy = panel.y + 20;

  return {
    title: { x: panel.x + 20, y: panel.y + 8 },
    editPill: { x: cx, y: cy, w: pillW, h: pillH },
    editHit: { x: cx, y: cy, w: Math.max(MIN_TOUCH, pillW), h: MIN_TOUCH }
  };
}

// ------------------------------------------------------------------
// 전투력 바
// ------------------------------------------------------------------

/**
 * 전투력 바 내부 배치.
 * @returns {Object}
 */
export function computePowerRow() {
  const panel = MAIN_LAYOUT.power;
  const midY = panel.y + panel.h / 2;
  return {
    panel,
    icon:  { x: panel.x + 26, y: midY, size: 24 },
    label: { x: panel.x + 48, y: midY },
    value: { x: panel.x + 128, y: midY },
    badge: { x: panel.x + panel.w - 84, y: midY, w: 132, h: 36 }
  };
}

// ------------------------------------------------------------------
// 현재 모험 패널
// ------------------------------------------------------------------

/**
 * 현재 모험 패널의 CTA 버튼 배치.
 * 온보딩 구간은 폭 100% 단일 버튼, 완주 후에는 소탕/보스전 2분할이다
 * (UX_ONBOARDING_FLOW §2-7 — 클리어 0개 유저에게 소탕은 "누르면 실패하는 버튼"이다).
 *
 * @param {boolean} onboarding - 온보딩(튜토리얼 미완주) 여부
 * @returns {Array<{key:string,x:number,y:number,w:number,h:number,cx:number,cy:number}>}
 */
export function computeAdventureButtons(onboarding) {
  const panel = MAIN_LAYOUT.adventure;
  const y = panel.y + ADVENTURE.buttonDy;
  const h = ADVENTURE.buttonH;
  const inset = 20;
  const left = panel.x + inset;
  const full = panel.w - inset * 2;

  if (onboarding) {
    return [{ key: 'battle_start', x: left, y, w: full, h, cx: left + full / 2, cy: y + h / 2 }];
  }

  const w = (full - ADVENTURE.buttonGap) / 2;
  return [
    { key: 'sweep', x: left, y, w, h, cx: left + w / 2, cy: y + h / 2 },
    { key: 'boss', x: left + w + ADVENTURE.buttonGap, y, w, h, cx: left + w + ADVENTURE.buttonGap + w / 2, cy: y + h / 2 }
  ];
}

/**
 * 현재 모험 패널의 텍스트·진행바 좌표.
 * @returns {Object}
 */
export function computeAdventureRows() {
  const panel = MAIN_LAYOUT.adventure;
  const inset = 20;
  const barW = panel.w - inset * 2 - 70;   // 우측 70 은 퍼센트 표기 자리
  return {
    panel,
    title:   { x: panel.x + inset, y: panel.y + ADVENTURE.titleDy },
    caption: { x: panel.x + panel.w - inset, y: panel.y + ADVENTURE.captionDy },
    stage:   { x: panel.x + inset, y: panel.y + ADVENTURE.stageDy },
    progress: {
      x: panel.x + inset,
      y: panel.y + ADVENTURE.progressDy,
      w: barW,
      h: ADVENTURE.progressH,
      textX: panel.x + panel.w - inset
    }
  };
}

// ------------------------------------------------------------------
// 유휴전투 관측창
// ------------------------------------------------------------------

/**
 * 유휴전투 뷰의 전용 대역과 그 안에 놓이는 뷰 사각형.
 *
 * 뷰가 패널을 뚫던 원인은 뷰의 그리기 영역이 대역 밖으로 나가도 아무도 막지 않았다는
 * 것이다(§1-1). 씬은 여기서 받은 `clip` 사각형으로 지오메트리 마스크를 만들어 뷰와
 * 장식을 함께 자른다. 그러면 대역 밖으로는 1px 도 나가지 않는다.
 *
 * @returns {{band:Object, clip:Object, view:{cx:number,cy:number,w:number,h:number}}}
 */
export function computeIdleBand() {
  const band = MAIN_LAYOUT.idle;
  const inset = IDLE_WINDOW.inset;
  const w = band.w - inset * 2;
  const h = band.h - inset * 2;
  return {
    band,
    clip: { x: band.x, y: band.y, w: band.w, h: band.h },
    view: { cx: band.x + band.w / 2, cy: band.y + band.h / 2, w, h }
  };
}

/**
 * 대표 영웅 전신 장식의 배치. 대역 바닥에 발을 붙이고 위로 세운다.
 * overscan 이 1 보다 크면 대역보다 커져 마스크에 잘린다 — 잘린 단면이 곧 관측창의 틀이다.
 *
 * @param {number} texW - 원본 텍스처 너비
 * @param {number} texH - 원본 텍스처 높이
 * @returns {{x:number,y:number,w:number,h:number,alpha:number,glow:Object}|null}
 */
export function computeFullbodyDecor(texW, texH) {
  if (!Number.isFinite(texW) || !Number.isFinite(texH) || texW <= 0 || texH <= 0) return null;
  const { band } = computeIdleBand();
  const cfg = IDLE_WINDOW.fullbody;

  const h = band.h * cfg.overscan;
  const w = h * (texW / texH);

  return {
    x: cfg.cx,
    y: band.y + band.h,      // origin (0.5, 1) — 발밑을 대역 바닥에 붙인다
    w,
    h,
    alpha: cfg.alpha,
    glow: { x: cfg.cx, y: band.y + band.h * 0.55, r: cfg.glowR, alpha: cfg.glowAlpha }
  };
}

// ------------------------------------------------------------------
// 수익 요약 · 보상받기
// ------------------------------------------------------------------

/**
 * 수익 요약 3칸 (골드/h · 경험치/h · 현재 스테이지).
 * @returns {Array<{key:string,x:number,y:number,iconX:number}>}
 */
export function computeSummaryCells() {
  const panel = MAIN_LAYOUT.summary;
  const midY = panel.y + panel.h / 2;
  const cellW = panel.w / 3;
  return ['gold', 'exp', 'stage'].map((key, index) => {
    const cx = panel.x + cellW / 2 + index * cellW;
    return { key, x: cx + 12, y: midY, iconX: cx - 40 };
  });
}

/**
 * 보상받기 버튼. 시각 크기가 그대로 터치 박스다.
 * @returns {{rect:Object, center:{x:number,y:number}}}
 */
export function computeClaimButton() {
  const rect = MAIN_LAYOUT.claim;
  return { rect, center: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 } };
}

// ------------------------------------------------------------------
// 메뉴 그리드
// ------------------------------------------------------------------

/**
 * 메뉴 그리드 좌표. 열 수는 MenuGridGate.getColumnCount() 가 정하고
 * 여기서는 받은 열 수로 좌표만 만든다(해금 판정은 게이트의 책임이다).
 *
 * @param {number} itemCount - 그릴 항목 수
 * @param {number} cols - 열 수 (0 이면 빈 그리드)
 * @returns {{cols:number, rows:number, bottom:number, cells:Array}}
 */
export function computeMenuGrid(itemCount, cols) {
  const count = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;
  const columns = Number.isFinite(cols) ? Math.max(0, Math.floor(cols)) : 0;
  if (count === 0 || columns === 0) {
    return { cols: 0, rows: 0, bottom: MENU_GRID.top, cells: [] };
  }

  const rows = Math.ceil(count / columns);
  const totalW = columns * MENU_GRID.cellW + (columns - 1) * MENU_GRID.gapX;
  const startX = (BASE_W - totalW) / 2 + MENU_GRID.cellW / 2;

  const cells = Array.from({ length: count }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + col * (MENU_GRID.cellW + MENU_GRID.gapX);
    const rowTop = MENU_GRID.top + row * MENU_GRID.rowPitch;
    return {
      index,
      col,
      row,
      x,
      iconY: rowTop + MENU_GRID.iconDy,
      iconR: MENU_GRID.iconR,
      labelY: rowTop + MENU_GRID.labelDy,
      hit: { x, y: rowTop + MENU_GRID.cellH / 2, w: MENU_GRID.cellW, h: MENU_GRID.cellH }
    };
  });

  return {
    cols: columns,
    rows,
    bottom: MENU_GRID.top + rows * MENU_GRID.rowPitch,
    cells
  };
}

// ------------------------------------------------------------------
// 교단 액센트 (Cult Tint)
// ------------------------------------------------------------------

/**
 * 화면 액센트로 쓸 교단을 고른다 — 파티 1번 영웅의 교단이다(§2-1 Cult Tint).
 * 파티가 비었거나 교단을 모르면 null 을 돌려 호출부가 brand.primary 로 간다.
 *
 * @param {Array<Object>} partyHeroes - 영웅 객체 배열 (cult 또는 cultId 필드)
 * @returns {string|null} 교단 id
 */
export function resolveAccentCult(partyHeroes) {
  if (!Array.isArray(partyHeroes)) return null;
  const lead = partyHeroes.find(Boolean);
  if (!lead) return null;
  const cult = lead.cult || lead.cultId || null;
  return typeof cult === 'string' && cult.length > 0 ? cult : null;
}

/**
 * 액센트 색 (Phaser hex). 교단이 없으면 brand.primary.
 * @param {string|null} cult
 * @returns {number}
 */
export function resolveAccentColor(cult) {
  if (!cult) return DESIGN.colors.brand.primary;
  return getCultColor(cult);
}

/**
 * Phaser hex 를 '#RRGGBB' CSS 문자열로.
 * @param {number} hex
 * @returns {string}
 */
export function toCss(hex) {
  const n = Number.isFinite(hex) ? Math.max(0, Math.floor(hex)) : 0;
  return `#${n.toString(16).padStart(6, '0').slice(-6).toUpperCase()}`;
}

export default {
  BASE_W,
  BASE_H,
  MAIN_LAYOUT,
  MENU_GRID,
  PARTY_SLOT,
  ADVENTURE,
  IDLE_WINDOW,
  BAND_ORDER,
  bandsOverlap,
  meetsTouchTarget,
  toCenterRect,
  progressFillWidth,
  computeTopBarSlots,
  interactiveTopBarSlots,
  computeEnergyFill,
  computePartySlots,
  computePartyHeader,
  computePowerRow,
  computeAdventureButtons,
  computeAdventureRows,
  computeIdleBand,
  computeFullbodyDecor,
  computeSummaryCells,
  computeClaimButton,
  computeMenuGrid,
  resolveAccentCult,
  resolveAccentColor,
  toCss
};
