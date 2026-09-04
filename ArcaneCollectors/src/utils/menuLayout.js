/**
 * menuLayout.js — 로비 하단 메뉴의 **카테고리 도크 + 펼침 시트** 배치·분류 규칙
 *
 * 왜 나눴나
 *   평면 14칸 5열 그리드는 화면 아래 1/4를 통째로 먹으면서도 "무엇이 중요한지"를
 *   말해 주지 않았다(사용자 피드백: "로비에 메뉴가 너무 많다"). 그래서 두 단으로 바꾼다.
 *     1단 = 카테고리 도크 4칸 (성장 · 도전 · 교류 · 수집) — 화면 맨 아래 고정
 *     2단 = 펼침 시트        — 탭한 카테고리의 하위 항목만 도크 **위로** 한 줄 뜬다
 *   한 번에 하나만 펼치고, 다시 탭하면 접힌다. 접힌 상태의 세로 점유가 315 → 184 로 줄어
 *   배경 아트와 명상 뷰가 숨을 쉰다.
 *
 * 이 모듈이 지키는 경계
 *   Phaser 를 부르지 않는다. 좌표는 전부 base 720x1280 이며 씬이 s() 로 렌더 좌표(1080x1920)
 *   로 올린다. `mainMenuLayout.js` 와 같은 이유다 — 반올림 전 값이라 테스트가 읽기 쉽다.
 *
 * 주의: designSystem·gameConfig 값을 모듈 스코프에서 평가하지 않는다(순환 import TDZ 방지).
 */

/** base 화면 크기 */
export const BASE_W = 720;
export const BASE_H = 1280;

/** 터치 타깃 하한 (base px) */
export const MIN_TOUCH = 48;

/**
 * 카테고리 정본 (팀 리드 확정안, 2026-09-04).
 *
 * `icon` 은 **벡터 폴백**용 IconFactory 키다. 이미지 아이콘이 매니페스트에 있으면
 * 씬이 `representative` 항목의 이미지를 대신 쓴다 — 카테고리 전용 아트를 따로 굽지 않는다.
 *
 * settings 는 여기 없다. 상단바 톱니(computeTopBarSlots().settings)로 상시 접근하므로
 * 도크에서 한 칸을 더 쓸 이유가 없다(SYSTEM_ONBOARDING_ECONOMY §4-2 와 같은 판단).
 */
export const MENU_CATEGORIES = Object.freeze([
  Object.freeze({
    id: 'growth',
    label: '성장',
    icon: 'ascension',
    representative: 'herolist',
    items: Object.freeze([
      Object.freeze({ label: '영웅', popupKey: 'herolist' }),
      Object.freeze({ label: '파티', popupKey: 'partyedit' }),
      Object.freeze({ label: '각인', popupKey: 'ascension' }),
      Object.freeze({ label: '가방', popupKey: 'inventory' })
    ])
  }),
  Object.freeze({
    id: 'challenge',
    label: '도전',
    icon: 'tower',
    representative: 'tower',
    items: Object.freeze([
      Object.freeze({ label: '무한탑', popupKey: 'tower' }),
      Object.freeze({ label: '레이드', popupKey: 'raid' }),
      Object.freeze({ label: '이벤트', popupKey: 'eventdungeon' }),
      Object.freeze({ label: '퀘스트', popupKey: 'quest' })
    ])
  }),
  Object.freeze({
    id: 'social',
    label: '교류',
    icon: 'guild',
    representative: 'guild',
    items: Object.freeze([
      Object.freeze({ label: 'PvP', popupKey: 'pvp' }),
      Object.freeze({ label: '길드', popupKey: 'guild' }),
      Object.freeze({ label: '친구', popupKey: 'friends' })
    ])
  }),
  Object.freeze({
    id: 'collect',
    label: '수집',
    icon: 'gacha',
    representative: 'gacha',
    items: Object.freeze([
      Object.freeze({ label: '소환', popupKey: 'gacha' }),
      Object.freeze({ label: '도감', popupKey: 'collection' })
    ])
  })
]);

/** 한 카테고리가 가질 수 있는 최대 항목 수 — 시트가 항상 한 줄인 근거 */
export const MAX_ITEMS_PER_CATEGORY = MENU_CATEGORIES.reduce(
  (max, c) => Math.max(max, c.items.length), 0
);

/**
 * 카테고리 도크 규격. 화면 맨 아래에 붙는다(plate 가 BASE_H 까지 닿는다).
 * 도크가 바닥에 닿아 있어야 "떠 있는 타일 묶음"이 아니라 **고정 내비게이션**으로 읽힌다.
 */
export const MENU_DOCK = Object.freeze({
  plate: Object.freeze({ x: 0, y: 1096, w: BASE_W, h: BASE_H - 1096 }),
  /**
   * 도크 위쪽 그라디언트 스크림. 보상받기 버튼 바로 아래(956)에서 시작해 도크 판까지
   * 이어진다. 짧게 잡으면 판 위로 배경 아트만 남은 200px 공백이 "빠뜨린 자리"로 읽힌다.
   * 길게 깔면 그 구간이 도크의 일부(어두워지는 바닥)가 되어 하나의 덩어리로 보인다.
   */
  scrim: Object.freeze({ x: 0, y: 956, w: BASE_W, h: 140 }),
  cellW: 156,
  cellH: 128,
  gapX: 12,
  top: 1120,
  radius: 20,
  iconDy: 46,
  iconSize: 58,
  labelDy: 102,
  badgeDx: 60,
  badgeDy: -46,
  badgeR: 13,
  /** 펼침 표식(갈매기)은 타일 **위쪽 바깥**에 놓여 시트 쪽을 가리킨다 */
  caretDy: -8
});

/**
 * 펼침 시트 규격. 도크 **위**로 뜬다. 항목이 최대 4개라 언제나 한 줄이다.
 */
export const MENU_SHEET = Object.freeze({
  panel: Object.freeze({ x: 20, y: 964, w: 680, h: 124, radius: 20 }),
  cellW: 124,
  cellH: 96,
  gapX: 16,
  top: 978,
  radius: 16,
  iconDy: 32,
  iconSize: 52,
  labelDy: 76,
  badgeDx: 46,
  badgeDy: -32,
  badgeR: 12,
  /** 펼침/접힘 애니메이션 (ms). 요구 상한 200 */
  animMs: 180,
  /** 시작 시 아래에서 밀려 올라오는 거리 (base px) */
  riseDy: 16
});

/** 배지 종류 우선순위 — 롤업에서 어떤 색으로 칠할지 정한다 (MenuBadgeRules 와 같은 순서) */
export const ROLLUP_PRIORITY = Object.freeze(['reward', 'alert', 'new']);

// ------------------------------------------------------------------
// 분류 · 해금
// ------------------------------------------------------------------

/**
 * popupKey 가 속한 카테고리 id.
 * @param {string} popupKey
 * @returns {string|null}
 */
export function categoryIdOf(popupKey) {
  if (typeof popupKey !== 'string') return null;
  const found = MENU_CATEGORIES.find((c) => c.items.some((i) => i.popupKey === popupKey));
  return found ? found.id : null;
}

/** 카테고리 정의 조회 */
export function getCategory(id) {
  return MENU_CATEGORIES.find((c) => c.id === id) || null;
}

/** 카테고리 분류에 등장하는 전체 popupKey (정의 순서) */
export function allMenuKeys() {
  return MENU_CATEGORIES.flatMap((c) => c.items.map((i) => i.popupKey));
}

/**
 * 해금된 popupKey 만 남긴 카테고리 목록.
 *
 * 잠긴 항목만 있는 카테고리는 **카테고리째 사라진다** — 자물쇠 타일을 그리지 않는
 * 기존 규칙(UX_ONBOARDING_FLOW §1-2)을 두 번째 단에도 그대로 적용한 것이다.
 *
 * @param {string[]} unlockedKeys 해금된 popupKey 목록 (MenuGridGate.deriveUnlockedMenus 결과)
 * @returns {Array<{id:string,label:string,icon:string,representative:string,items:Array}>}
 */
export function buildMenuCategories(unlockedKeys = []) {
  const unlocked = new Set(Array.isArray(unlockedKeys) ? unlockedKeys : []);
  return MENU_CATEGORIES
    .map((c) => {
      const items = c.items.filter((i) => unlocked.has(i.popupKey));
      const representative = items.some((i) => i.popupKey === c.representative)
        ? c.representative
        : (items[0]?.popupKey || c.representative);
      return { id: c.id, label: c.label, icon: c.icon, representative, items };
    })
    .filter((c) => c.items.length > 0);
}

/**
 * 처음에 펼쳐 둘 카테고리.
 *
 * 카테고리가 하나뿐이면(온보딩 초반 — 성장 3칸) 접어 두는 것이 오히려 한 단계를 더
 * 요구한다. 그럴 때만 자동으로 펼친다. 둘 이상이면 전부 접은 채 시작한다.
 *
 * @param {Array<{id:string}>} categories buildMenuCategories 결과
 * @returns {string|null}
 */
export function resolveInitialExpanded(categories = []) {
  return categories.length === 1 ? categories[0].id : null;
}

/**
 * 도크 탭에 따른 펼침 상태 전이. 같은 것을 다시 누르면 접히고, 다른 것을 누르면 갈아탄다.
 * @param {string|null} current
 * @param {string} tappedId
 * @returns {string|null}
 */
export function toggleExpanded(current, tappedId) {
  if (!tappedId) return current ?? null;
  return current === tappedId ? null : tappedId;
}

// ------------------------------------------------------------------
// 배지 롤업
// ------------------------------------------------------------------

function safeCount(v) {
  return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
}

/**
 * 항목 배지를 카테고리 타일 하나로 합산한다.
 *
 * 접힌 상태에서도 "성장 쪽에 볼 것이 있다"가 보여야 한다. 개수는 단순 합, 색은
 * 우선순위가 가장 높은 종류를 따른다(reward > alert > new). 펼치면 항목 배지가
 * 그대로 다시 보이므로 여기서 개수를 깎지 않는다.
 *
 * @param {Array<{id:string, items:Array<{popupKey:string}>}>} categories
 * @param {Object<string,{type:string,count:number}>} badges MenuBadgeRules.computeMenuBadges 결과
 * @returns {Object<string,{type:string,count:number,keys:string[]}>} 카테고리 id → 롤업 배지
 */
export function rollupCategoryBadges(categories = [], badges = {}) {
  const out = {};
  categories.forEach((cat) => {
    let total = 0;
    let bestRank = ROLLUP_PRIORITY.length;
    const keys = [];

    cat.items.forEach((item) => {
      const badge = badges?.[item.popupKey];
      if (!badge) return;
      total += safeCount(badge.count);
      keys.push(item.popupKey);
      const rank = ROLLUP_PRIORITY.indexOf(badge.type);
      if (rank !== -1 && rank < bestRank) bestRank = rank;
    });

    if (keys.length === 0) return;
    out[cat.id] = {
      type: ROLLUP_PRIORITY[bestRank] ?? 'new',
      count: Math.max(total, keys.length),
      keys
    };
  });
  return out;
}

// ------------------------------------------------------------------
// 좌표
// ------------------------------------------------------------------

/** 한 줄에 n칸을 가운데 정렬했을 때 첫 칸의 중심 x */
function rowStartX(n, cellW, gapX) {
  const totalW = n * cellW + (n - 1) * gapX;
  return (BASE_W - totalW) / 2 + cellW / 2;
}

/**
 * 카테고리 도크 좌표. 3개만 보이면 3칸이 가운데 정렬된다(빈 칸을 남기지 않는다).
 *
 * @param {number} count 보이는 카테고리 수
 * @returns {{plate:Object, scrim:Object, top:number, cells:Array}}
 */
export function computeCategoryDock(count) {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const base = { plate: MENU_DOCK.plate, scrim: MENU_DOCK.scrim, top: MENU_DOCK.plate.y, cells: [] };
  if (n === 0) return base;

  const startX = rowStartX(n, MENU_DOCK.cellW, MENU_DOCK.gapX);
  const rowTop = MENU_DOCK.top;
  const centerY = rowTop + MENU_DOCK.cellH / 2;

  const cells = Array.from({ length: n }, (_, index) => {
    const x = startX + index * (MENU_DOCK.cellW + MENU_DOCK.gapX);
    return {
      index,
      x,
      y: centerY,
      tile: { x, y: centerY, w: MENU_DOCK.cellW, h: MENU_DOCK.cellH, radius: MENU_DOCK.radius },
      iconY: rowTop + MENU_DOCK.iconDy,
      iconSize: MENU_DOCK.iconSize,
      labelY: rowTop + MENU_DOCK.labelDy,
      caretY: rowTop + MENU_DOCK.caretDy,
      badge: { x: x + MENU_DOCK.badgeDx, y: centerY + MENU_DOCK.badgeDy, r: MENU_DOCK.badgeR },
      hit: { x, y: centerY, w: MENU_DOCK.cellW, h: MENU_DOCK.cellH }
    };
  });

  return { ...base, cells };
}

/**
 * 펼침 시트 좌표. 항목이 4개 이하라 언제나 한 줄이다.
 *
 * @param {number} itemCount
 * @returns {{panel:Object, cells:Array}}
 */
export function computeCategorySheet(itemCount) {
  const n = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;
  if (n === 0) return { panel: MENU_SHEET.panel, cells: [] };

  const startX = rowStartX(n, MENU_SHEET.cellW, MENU_SHEET.gapX);
  const rowTop = MENU_SHEET.top;
  const centerY = rowTop + MENU_SHEET.cellH / 2;

  const cells = Array.from({ length: n }, (_, index) => {
    const x = startX + index * (MENU_SHEET.cellW + MENU_SHEET.gapX);
    return {
      index,
      x,
      y: centerY,
      tile: { x, y: centerY, w: MENU_SHEET.cellW, h: MENU_SHEET.cellH, radius: MENU_SHEET.radius },
      iconY: rowTop + MENU_SHEET.iconDy,
      iconSize: MENU_SHEET.iconSize,
      labelY: rowTop + MENU_SHEET.labelDy,
      badge: { x: x + MENU_SHEET.badgeDx, y: centerY + MENU_SHEET.badgeDy, r: MENU_SHEET.badgeR },
      hit: { x, y: centerY, w: MENU_SHEET.cellW, h: MENU_SHEET.cellH }
    };
  });

  return { panel: MENU_SHEET.panel, cells };
}

/**
 * 접힘/펼침 상태에서 메뉴가 차지하는 세로 대역.
 * 이 값이 `MAIN_LAYOUT.claim` 아래에서 시작하는지가 겹침 불변식이다.
 * @param {boolean} expanded
 * @returns {{y:number,h:number}}
 */
export function computeMenuBand(expanded) {
  const top = expanded ? MENU_SHEET.panel.y : MENU_DOCK.plate.y;
  return { y: top, h: BASE_H - top };
}

// ------------------------------------------------------------------
// 이미지 아이콘
// ------------------------------------------------------------------

/**
 * 메뉴 이미지 아이콘의 텍스처 키. 매니페스트의 `menuIcons` 버킷 키와 같다.
 * 매니페스트에 없으면 씬이 IconFactory 벡터로 폴백한다 — 여기서 경로를 만들지 않으므로
 * 없는 파일을 요청하는 일 자체가 생기지 않는다(vite 404 가드).
 * @param {string} popupKey
 * @returns {string}
 */
export function menuIconTextureKey(popupKey) {
  return `menu_${popupKey}`;
}

export default {
  BASE_W,
  BASE_H,
  MIN_TOUCH,
  MENU_CATEGORIES,
  MAX_ITEMS_PER_CATEGORY,
  MENU_DOCK,
  MENU_SHEET,
  ROLLUP_PRIORITY,
  categoryIdOf,
  getCategory,
  allMenuKeys,
  buildMenuCategories,
  resolveInitialExpanded,
  toggleExpanded,
  rollupCategoryBadges,
  computeCategoryDock,
  computeCategorySheet,
  computeMenuBand,
  menuIconTextureKey
};
