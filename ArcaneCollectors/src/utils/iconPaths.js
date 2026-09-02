/**
 * iconPaths.js — 벡터 아이콘 기하 정의 (Phaser 비의존 순수 모듈)
 *
 * REDESIGN_PLAN T-07. 모든 아이콘은 0..1 정규화 좌표(y는 아래로 증가)의
 * "드로우 커맨드 배열"로 정의된다. Phaser Graphics 호출은 IconFactory가 담당하고
 * 이 파일은 순수 데이터/함수만 제공하므로 node 환경에서 그대로 단위 테스트할 수 있다.
 *
 * 스타일: Blue Archive × NIKKE 하이브리드
 *   - 단색 실루엣 + 2px 계열 스트로크
 *   - 채움은 tint 한 색에서 파생된 4단계(base / light / dark / deep)만 사용 → 어떤 색으로도 tint 가능
 *
 * 주의: designSystem·gameConfig 값을 이 파일에서 모듈 스코프로 평가하지 않는다(부팅 TDZ 방지).
 */

// ============================================================
// 1. 크기 프리셋 (§2-5)
// ============================================================

/** 아이콘 크기 5단계 프리셋 (base px) */
export const ICON_SIZES = Object.freeze({
  xs: 16, // 인라인 수치 앞
  sm: 24, // 리스트 항목, 재화 표시
  md: 32, // 스탯, 탭
  lg: 48, // 메뉴 그리드, 장비 슬롯
  xl: 64 // 교단 엠블럼, 결과 화면
});

/** 크기 토큰 이름 (작은 것 → 큰 것) */
export const ICON_SIZE_TOKENS = Object.freeze(['xs', 'sm', 'md', 'lg', 'xl']);

/** 기본 크기 토큰 */
export const DEFAULT_ICON_SIZE = 'md';

/** 텍스처를 미리 굽는 기본 크기 집합 */
export const PRELOAD_SIZES = Object.freeze(['sm', 'md', 'lg']);

/**
 * 크기 입력을 픽셀 정수로 정규화한다.
 * @param {string|number} [size] - 'xs'|'sm'|'md'|'lg'|'xl' 또는 픽셀 숫자
 * @returns {number} 픽셀 크기 (4 이상 정수)
 */
export function resolveIconSize(size) {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) {
    return Math.max(4, Math.round(size));
  }
  if (typeof size === 'string') {
    const token = size.trim().toLowerCase();
    if (ICON_SIZES[token] !== undefined) return ICON_SIZES[token];
    const parsed = Number(token);
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(4, Math.round(parsed));
  }
  return ICON_SIZES[DEFAULT_ICON_SIZE];
}

/**
 * 크기에 비례하는 스트로크 두께. base 32px에서 정확히 2px가 된다.
 * @param {number} px
 * @returns {number}
 */
export function strokeWidthFor(px) {
  return Math.max(1, (px / 32) * 2);
}

// ============================================================
// 2. 색 파생 (tint 한 색 → 4단계)
// ============================================================

/** 채움 톤 이름 */
export const TONES = Object.freeze({
  BASE: 'base',
  LIGHT: 'light',
  DARK: 'dark',
  DEEP: 'deep'
});

/** 톤별 밝기 보정치 (-1 어둡게 ~ +1 밝게) */
export const TONE_SHIFT = Object.freeze({
  base: 0,
  light: 0.34,
  dark: -0.3,
  deep: -0.58,
  stroke: -0.52
});

/**
 * hex 색을 밝게/어둡게 민다.
 * @param {number} hex - 0xRRGGBB
 * @param {number} amount - -1(검정) ~ +1(흰색)
 * @returns {number} 0xRRGGBB
 */
export function shadeColor(hex, amount) {
  const base = Math.max(0, Math.min(0xffffff, Math.round(hex) || 0));
  const t = Math.max(-1, Math.min(1, amount || 0));
  const ch = [(base >> 16) & 0xff, (base >> 8) & 0xff, base & 0xff].map((c) => {
    const next = t >= 0 ? c + (255 - c) * t : c * (1 + t);
    return Math.max(0, Math.min(255, Math.round(next)));
  });
  return (ch[0] << 16) | (ch[1] << 8) | ch[2];
}

/**
 * tint 한 색에서 아이콘 팔레트를 파생한다.
 * @param {number} tint - 0xRRGGBB
 * @returns {{base:number, light:number, dark:number, deep:number, stroke:number}}
 */
export function derivePalette(tint) {
  return {
    base: shadeColor(tint, TONE_SHIFT.base),
    light: shadeColor(tint, TONE_SHIFT.light),
    dark: shadeColor(tint, TONE_SHIFT.dark),
    deep: shadeColor(tint, TONE_SHIFT.deep),
    stroke: shadeColor(tint, TONE_SHIFT.stroke)
  };
}

// ============================================================
// 3. 기하 헬퍼 (모듈 로드 시 1회 평가되는 순수 계산)
// ============================================================

const TAU = Math.PI * 2;

function poly(points, { fill = TONES.BASE, stroke = true } = {}) {
  return { t: 'poly', p: points, fill, stroke };
}

function circle(x, y, r, { fill = TONES.BASE, stroke = true } = {}) {
  return { t: 'circle', x, y, r, fill, stroke };
}

/** 타원. w/h는 지름(Phaser fillEllipse 규약과 동일) */
function ellipse(x, y, w, h, { fill = TONES.BASE, stroke = true } = {}) {
  return { t: 'ellipse', x, y, w, h, fill, stroke };
}

function rect(x, y, w, h, { r = 0, fill = TONES.BASE, stroke = true } = {}) {
  return { t: 'rect', x, y, w, h, r, fill, stroke };
}

/** 굵은 선분 (칼날 하이라이트 / 화살대 / 글줄) */
function bar(x1, y1, x2, y2, w, { fill = TONES.BASE } = {}) {
  return { t: 'bar', p: [[x1, y1], [x2, y2]], w, fill };
}

/** 열린 호 (스트로크 전용) */
function arc(x, y, r, a0, a1, w, { fill = TONES.BASE } = {}) {
  return { t: 'arc', x, y, r, a0, a1, w, fill };
}

/** n각 별 폴리곤 점 배열 */
function starPoints(cx, cy, rOuter, rInner, spikes = 5, rotation = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < spikes; i++) {
    const ao = rotation + (TAU / spikes) * i;
    const ai = ao + Math.PI / spikes;
    pts.push([cx + Math.cos(ao) * rOuter, cy + Math.sin(ao) * rOuter]);
    pts.push([cx + Math.cos(ai) * rInner, cy + Math.sin(ai) * rInner]);
  }
  return pts;
}

/** 뾰족한 검신 폴리곤 (자루 끝 → 칼끝) */
function bladePoints(hx, hy, tx, ty, width) {
  const dx = tx - hx;
  const dy = ty - hy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = (-uy * width) / 2;
  const ny = (ux * width) / 2;
  const tipLen = Math.min(width * 1.35, len * 0.5);
  const bx = tx - ux * tipLen;
  const by = ty - uy * tipLen;
  return [
    [hx + nx, hy + ny],
    [bx + nx, by + ny],
    [tx, ty],
    [bx - nx, by - ny],
    [hx - nx, hy - ny]
  ];
}

/** 톱니 기어 폴리곤 */
function gearPoints(cx, cy, rOuter, rInner, teeth = 8) {
  const pts = [];
  const step = TAU / (teeth * 2);
  const half = step * 0.36;
  for (let i = 0; i < teeth; i++) {
    const a = step * 2 * i;
    pts.push([cx + Math.cos(a - half) * rOuter, cy + Math.sin(a - half) * rOuter]);
    pts.push([cx + Math.cos(a + half) * rOuter, cy + Math.sin(a + half) * rOuter]);
    pts.push([cx + Math.cos(a + step - half) * rInner, cy + Math.sin(a + step - half) * rInner]);
    pts.push([cx + Math.cos(a + step + half) * rInner, cy + Math.sin(a + step + half) * rInner]);
  }
  return pts;
}

/** 하트 폴리곤 (파라메트릭 하트 곡선) */
function heartPoints(cx, cy, r, samples = 28) {
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const t = (TAU / samples) * i;
    const px = 16 * Math.sin(t) ** 3;
    const py = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([cx + (px / 17) * r, cy - (py / 17) * r]);
  }
  return pts;
}

/**
 * 사람 반신(어깨 + 머리) 2개 op.
 * 어깨는 타원 대신 폴리곤으로 만들어 아이콘 박스(0..1)를 넘지 않게 한다.
 * @param {number} cx 중심 x
 * @param {number} headY 머리 중심 y
 * @param {number} headR 머리 반지름
 * @param {number} shoulderTop 어깨 윗선 y
 * @param {number} bottom 어깨 아랫선 y
 * @param {number} w 어깨 폭
 */
function bust(cx, headY, headR, shoulderTop, bottom, w, tone = TONES.BASE) {
  const hw = w / 2;
  const mid = shoulderTop + (bottom - shoulderTop) * 0.42;
  return [
    poly(
      [
        [cx - hw, bottom],
        [cx - hw, mid],
        [cx - hw * 0.72, shoulderTop + (bottom - shoulderTop) * 0.14],
        [cx - hw * 0.34, shoulderTop],
        [cx + hw * 0.34, shoulderTop],
        [cx + hw * 0.72, shoulderTop + (bottom - shoulderTop) * 0.14],
        [cx + hw, mid],
        [cx + hw, bottom]
      ],
      { fill: tone }
    ),
    circle(cx, headY, headR, { fill: tone })
  ];
}

// ============================================================
// 4. 아이콘 정의 (메뉴 15 + 클래스 4 + 스탯 4)
// ============================================================

/**
 * 아이콘 드로우 커맨드 테이블.
 * @type {Record<string, Array<object>>}
 */
export const ICON_SHAPES = Object.freeze({
  // ---------- 메뉴 ----------
  /** 소환 — 마법진 + 별 */
  gacha: [
    circle(0.5, 0.5, 0.44, { fill: null }),
    poly(starPoints(0.5, 0.5, 0.31, 0.13, 5), { fill: TONES.BASE }),
    circle(0.5, 0.5, 0.1, { fill: TONES.LIGHT, stroke: false })
  ],

  /** 영웅 — 단일 반신 */
  heroes: [
    ...bust(0.5, 0.28, 0.19, 0.56, 0.96, 0.76, TONES.BASE),
    poly([[0.34, 0.7], [0.5, 0.88], [0.66, 0.7]], { fill: TONES.DEEP, stroke: false })
  ],

  /** 파티 — 3인 대형 */
  party: [
    ...bust(0.19, 0.36, 0.14, 0.6, 0.96, 0.42, TONES.DARK),
    ...bust(0.81, 0.36, 0.14, 0.6, 0.96, 0.42, TONES.DARK),
    ...bust(0.5, 0.29, 0.16, 0.56, 0.96, 0.5, TONES.BASE)
  ],

  /** 모험 — 원정 깃발 */
  adventure: [
    ellipse(0.34, 0.92, 0.56, 0.18, { fill: TONES.DARK }),
    rect(0.3, 0.08, 0.08, 0.82, { r: 0.04, fill: TONES.DARK }),
    poly([[0.38, 0.11], [0.9, 0.29], [0.38, 0.47]], { fill: TONES.BASE }),
    poly([[0.38, 0.11], [0.64, 0.2], [0.38, 0.29]], { fill: TONES.LIGHT, stroke: false })
  ],

  /** 무한탑 — 3단 첨탑 */
  tower: [
    rect(0.2, 0.78, 0.6, 0.16, { r: 0.03, fill: TONES.BASE }),
    rect(0.26, 0.52, 0.48, 0.26, { r: 0.02, fill: TONES.BASE }),
    rect(0.32, 0.3, 0.36, 0.22, { r: 0.02, fill: TONES.BASE }),
    poly([[0.5, 0.04], [0.72, 0.3], [0.28, 0.3]], { fill: TONES.LIGHT }),
    rect(0.44, 0.82, 0.12, 0.12, { r: 0.02, fill: TONES.DEEP, stroke: false }),
    rect(0.46, 0.36, 0.08, 0.1, { r: 0.02, fill: TONES.DEEP, stroke: false })
  ],

  /** PvP — 교차한 쌍검 */
  pvp: [
    poly(bladePoints(0.18, 0.84, 0.86, 0.14, 0.13), { fill: TONES.BASE }),
    poly(bladePoints(0.82, 0.84, 0.14, 0.14, 0.13), { fill: TONES.BASE }),
    bar(0.08, 0.7, 0.3, 0.92, 0.07, { fill: TONES.DEEP }),
    bar(0.92, 0.7, 0.7, 0.92, 0.07, { fill: TONES.DEEP }),
    circle(0.16, 0.9, 0.07, { fill: TONES.LIGHT }),
    circle(0.84, 0.9, 0.07, { fill: TONES.LIGHT })
  ],

  /** 길드 — 성채 */
  guild: [
    rect(0.04, 0.34, 0.15, 0.6, { r: 0.02, fill: TONES.DARK }),
    rect(0.81, 0.34, 0.15, 0.6, { r: 0.02, fill: TONES.DARK }),
    rect(0.18, 0.44, 0.64, 0.5, { r: 0.02, fill: TONES.BASE }),
    rect(0.18, 0.3, 0.15, 0.14, { fill: TONES.BASE }),
    rect(0.425, 0.3, 0.15, 0.14, { fill: TONES.BASE }),
    rect(0.67, 0.3, 0.15, 0.14, { fill: TONES.BASE }),
    circle(0.5, 0.68, 0.1, { fill: TONES.DEEP, stroke: false }),
    rect(0.4, 0.68, 0.2, 0.26, { fill: TONES.DEEP, stroke: false })
  ],

  /** 레이드 — 뿔 달린 마수 두상 */
  raid: [
    poly([[0.2, 0.28], [0.04, 0.04], [0.34, 0.18]], { fill: TONES.LIGHT }),
    poly([[0.8, 0.28], [0.96, 0.04], [0.66, 0.18]], { fill: TONES.LIGHT }),
    poly(
      [
        [0.5, 0.1],
        [0.78, 0.24],
        [0.86, 0.52],
        [0.64, 0.8],
        [0.5, 0.96],
        [0.36, 0.8],
        [0.14, 0.52],
        [0.22, 0.24]
      ],
      { fill: TONES.BASE }
    ),
    poly([[0.24, 0.42], [0.44, 0.5], [0.24, 0.58]], { fill: TONES.DEEP, stroke: false }),
    poly([[0.76, 0.42], [0.56, 0.5], [0.76, 0.58]], { fill: TONES.DEEP, stroke: false }),
    poly([[0.38, 0.7], [0.5, 0.84], [0.62, 0.7]], { fill: TONES.DEEP, stroke: false })
  ],

  /** 친구 — 2인 + 하트 */
  friends: [
    ...bust(0.24, 0.52, 0.14, 0.72, 0.98, 0.44, TONES.BASE),
    ...bust(0.76, 0.52, 0.14, 0.72, 0.98, 0.44, TONES.DARK),
    poly(heartPoints(0.5, 0.26, 0.3, 24), { fill: TONES.LIGHT })
  ],

  /** 도감 — 펼친 책 */
  collection: [
    poly([[0.08, 0.22], [0.48, 0.32], [0.48, 0.9], [0.08, 0.8]], { fill: TONES.BASE }),
    poly([[0.92, 0.22], [0.52, 0.32], [0.52, 0.9], [0.92, 0.8]], { fill: TONES.BASE }),
    rect(0.455, 0.28, 0.09, 0.62, { r: 0.02, fill: TONES.DARK }),
    bar(0.16, 0.42, 0.4, 0.48, 0.05, { fill: TONES.DEEP }),
    bar(0.16, 0.56, 0.4, 0.62, 0.05, { fill: TONES.DEEP }),
    bar(0.84, 0.42, 0.6, 0.48, 0.05, { fill: TONES.DEEP }),
    bar(0.84, 0.56, 0.6, 0.62, 0.05, { fill: TONES.DEEP })
  ],

  /** 퀘스트 — 체크리스트 보드 */
  quest: [
    rect(0.14, 0.12, 0.72, 0.82, { r: 0.09, fill: TONES.BASE }),
    rect(0.35, 0.03, 0.3, 0.15, { r: 0.06, fill: TONES.LIGHT }),
    circle(0.29, 0.42, 0.055, { fill: TONES.DEEP, stroke: false }),
    circle(0.29, 0.6, 0.055, { fill: TONES.DEEP, stroke: false }),
    circle(0.29, 0.78, 0.055, { fill: TONES.DEEP, stroke: false }),
    bar(0.42, 0.42, 0.74, 0.42, 0.07, { fill: TONES.DEEP }),
    bar(0.42, 0.6, 0.74, 0.6, 0.07, { fill: TONES.DEEP }),
    bar(0.42, 0.78, 0.62, 0.78, 0.07, { fill: TONES.DEEP })
  ],

  /** 가방 — 백팩 */
  inventory: [
    arc(0.5, 0.34, 0.16, Math.PI, TAU, 0.08, { fill: TONES.DARK }),
    rect(0.12, 0.32, 0.76, 0.62, { r: 0.16, fill: TONES.BASE }),
    rect(0.12, 0.32, 0.76, 0.24, { r: 0.12, fill: TONES.LIGHT }),
    bar(0.14, 0.56, 0.86, 0.56, 0.045, { fill: TONES.DEEP }),
    rect(0.42, 0.5, 0.16, 0.14, { r: 0.03, fill: TONES.DEEP, stroke: false })
  ],

  /** 설정 — 8톱니 기어 */
  settings: [
    poly(gearPoints(0.5, 0.5, 0.47, 0.34, 8), { fill: TONES.BASE }),
    circle(0.5, 0.5, 0.15, { fill: TONES.DEEP })
  ],

  /** 각인 — 상승 셰브런 (MainMenuScene ascension) */
  ascension: [
    poly([[0.5, 0.08], [0.88, 0.42], [0.7, 0.42], [0.5, 0.25], [0.3, 0.42], [0.12, 0.42]], {
      fill: TONES.BASE
    }),
    poly([[0.5, 0.42], [0.88, 0.76], [0.7, 0.76], [0.5, 0.59], [0.3, 0.76], [0.12, 0.76]], {
      fill: TONES.LIGHT
    }),
    circle(0.32, 0.92, 0.06, { fill: TONES.DARK, stroke: false }),
    circle(0.5, 0.92, 0.06, { fill: TONES.DARK, stroke: false }),
    circle(0.68, 0.92, 0.06, { fill: TONES.DARK, stroke: false })
  ],

  /** 이벤트 — 선물 상자 (MainMenuScene eventdungeon) */
  eventdungeon: [
    circle(0.34, 0.2, 0.15, { fill: TONES.LIGHT }),
    circle(0.66, 0.2, 0.15, { fill: TONES.LIGHT }),
    rect(0.16, 0.48, 0.68, 0.44, { r: 0.03, fill: TONES.BASE }),
    rect(0.08, 0.32, 0.84, 0.18, { r: 0.03, fill: TONES.LIGHT }),
    rect(0.43, 0.32, 0.14, 0.6, { fill: TONES.DEEP, stroke: false }),
    circle(0.5, 0.26, 0.08, { fill: TONES.DARK })
  ],

  // ---------- 클래스 ----------
  /** 워리어 — 투구 */
  warrior: [
    poly([[0.5, 0.0], [0.6, 0.16], [0.4, 0.16]], { fill: TONES.LIGHT }),
    poly(
      [
        [0.16, 0.9],
        [0.16, 0.5],
        [0.22, 0.3],
        [0.36, 0.15],
        [0.64, 0.15],
        [0.78, 0.3],
        [0.84, 0.5],
        [0.84, 0.9]
      ],
      { fill: TONES.BASE }
    ),
    rect(0.16, 0.48, 0.68, 0.15, { fill: TONES.DEEP, stroke: false }),
    rect(0.45, 0.48, 0.1, 0.42, { fill: TONES.DEEP, stroke: false })
  ],

  /** 메이지 — 마법사 모자 + 별 */
  mage: [
    poly([[0.46, 0.06], [0.76, 0.6], [0.2, 0.6]], { fill: TONES.BASE }),
    ellipse(0.48, 0.64, 0.82, 0.2, { fill: TONES.LIGHT }),
    rect(0.26, 0.5, 0.44, 0.1, { fill: TONES.DEEP, stroke: false }),
    poly(starPoints(0.8, 0.2, 0.19, 0.06, 4, -Math.PI / 2), { fill: TONES.LIGHT })
  ],

  /** 아처 — 활 + 화살 */
  archer: [
    arc(0.72, 0.5, 0.46, 2.094, 4.189, 0.09, { fill: TONES.BASE }),
    bar(0.49, 0.1, 0.49, 0.9, 0.03, { fill: TONES.DARK }),
    bar(0.32, 0.5, 0.82, 0.5, 0.07, { fill: TONES.BASE }),
    poly([[0.97, 0.5], [0.76, 0.38], [0.76, 0.62]], { fill: TONES.LIGHT }),
    bar(0.2, 0.36, 0.36, 0.5, 0.055, { fill: TONES.DARK }),
    bar(0.2, 0.64, 0.36, 0.5, 0.055, { fill: TONES.DARK })
  ],

  /** 힐러 — 치유 십자 */
  healer: [
    poly(
      [
        [0.38, 0.12],
        [0.62, 0.12],
        [0.62, 0.38],
        [0.88, 0.38],
        [0.88, 0.62],
        [0.62, 0.62],
        [0.62, 0.88],
        [0.38, 0.88],
        [0.38, 0.62],
        [0.12, 0.62],
        [0.12, 0.38],
        [0.38, 0.38]
      ],
      { fill: TONES.BASE }
    ),
    circle(0.5, 0.5, 0.13, { fill: TONES.LIGHT, stroke: false })
  ],

  // ---------- 스탯 ----------
  /** HP — 하트 */
  hp: [
    poly(heartPoints(0.5, 0.46, 0.46), { fill: TONES.BASE }),
    ellipse(0.34, 0.34, 0.2, 0.14, { fill: TONES.LIGHT, stroke: false })
  ],

  /** ATK — 직검 */
  atk: [
    poly(bladePoints(0.5, 0.78, 0.5, 0.04, 0.22), { fill: TONES.BASE }),
    bar(0.5, 0.2, 0.5, 0.66, 0.04, { fill: TONES.LIGHT }),
    rect(0.24, 0.7, 0.52, 0.1, { r: 0.04, fill: TONES.LIGHT }),
    rect(0.43, 0.78, 0.14, 0.14, { r: 0.02, fill: TONES.DEEP, stroke: false }),
    circle(0.5, 0.94, 0.08, { fill: TONES.DARK })
  ],

  /** DEF — 방패 */
  def: [
    poly([[0.5, 0.04], [0.9, 0.18], [0.9, 0.52], [0.5, 0.96], [0.1, 0.52], [0.1, 0.18]], {
      fill: TONES.BASE
    }),
    poly([[0.5, 0.28], [0.74, 0.44], [0.74, 0.58], [0.5, 0.42], [0.26, 0.58], [0.26, 0.44]], {
      fill: TONES.DEEP,
      stroke: false
    })
  ],

  /** SPD — 이중 셰브런 */
  spd: [
    poly([[0.24, 0.08], [0.58, 0.5], [0.24, 0.92], [0.06, 0.92], [0.4, 0.5], [0.06, 0.08]], {
      fill: TONES.DARK
    }),
    poly([[0.6, 0.08], [0.94, 0.5], [0.6, 0.92], [0.42, 0.92], [0.76, 0.5], [0.42, 0.08]], {
      fill: TONES.BASE
    })
  ]
});

// ============================================================
// 5. 키 목록 · 별칭
// ============================================================

/** 플랜 T-07이 요구하는 메뉴 아이콘 13종 */
export const MENU_ICON_KEYS = Object.freeze([
  'gacha',
  'heroes',
  'party',
  'adventure',
  'tower',
  'pvp',
  'guild',
  'raid',
  'friends',
  'collection',
  'quest',
  'inventory',
  'settings'
]);

/** MainMenuScene 하단 메뉴에만 있는 추가 항목 (이모지 완전 대체용) */
export const EXTRA_MENU_ICON_KEYS = Object.freeze(['ascension', 'eventdungeon']);

/** 클래스 아이콘 4종 (characters.json의 class 값과 동일) */
export const CLASS_ICON_KEYS = Object.freeze(['warrior', 'mage', 'archer', 'healer']);

/** 스탯 아이콘 4종 */
export const STAT_ICON_KEYS = Object.freeze(['hp', 'atk', 'def', 'spd']);

/** T-07 요구 21종 (메뉴 13 + 클래스 4 + 스탯 4) */
export const REQUIRED_ICON_KEYS = Object.freeze([
  ...MENU_ICON_KEYS,
  ...CLASS_ICON_KEYS,
  ...STAT_ICON_KEYS
]);

/** 정의된 전체 벡터 아이콘 키 */
export const ICON_KEYS = Object.freeze(Object.keys(ICON_SHAPES));

/**
 * 별칭 → 정식 키.
 * MainMenuScene의 popupKey를 그대로 넣어도 아이콘이 나오도록 매핑한다.
 */
export const ICON_ALIASES = Object.freeze({
  // MainMenuScene popupKey
  herolist: 'heroes',
  partyedit: 'party',
  // 관용 표기
  hero: 'heroes',
  summon: 'gacha',
  stage: 'adventure',
  stageselect: 'adventure',
  battle: 'adventure',
  friend: 'friends',
  bag: 'inventory',
  item: 'inventory',
  book: 'collection',
  dex: 'collection',
  arena: 'pvp',
  boss: 'raid',
  event: 'eventdungeon',
  ascend: 'ascension',
  config: 'settings',
  option: 'settings',
  // 스탯 표기 변형
  attack: 'atk',
  defense: 'def',
  speed: 'spd',
  health: 'hp'
});

/**
 * 아이콘 키를 정식 키로 정규화한다.
 * @param {string} key
 * @returns {string|null} 정식 키. 정의가 없으면 null
 */
export function normalizeIconKey(key) {
  if (typeof key !== 'string') return null;
  const k = key.trim().toLowerCase();
  if (ICON_SHAPES[k]) return k;
  const alias = ICON_ALIASES[k];
  return alias && ICON_SHAPES[alias] ? alias : null;
}

/**
 * 해당 키의 벡터 아이콘이 존재하는가 (별칭 포함)
 * @param {string} key
 * @returns {boolean}
 */
export function hasIcon(key) {
  return normalizeIconKey(key) !== null;
}

/**
 * 아이콘 드로우 커맨드 조회 (별칭 해석 포함)
 * @param {string} key
 * @returns {Array<object>|null}
 */
export function getIconShape(key) {
  const k = normalizeIconKey(key);
  return k ? ICON_SHAPES[k] : null;
}

// ============================================================
// 6. 텍스처 키 · 좌표 변환
// ============================================================

/** 기본 tint — tint를 주지 않았을 때 쓰는 밝은 오프화이트 */
export const DEFAULT_TINT = 0xf8fafc;

/**
 * 텍스처 캐시 키를 만든다. 같은 (아이콘·크기·tint·배경)이면 항상 같은 문자열.
 * @param {string} key - 정식 또는 별칭 아이콘 키
 * @param {string|number} [size]
 * @param {{tint?: number, bg?: boolean, bgColor?: number}} [opts]
 * @returns {string}
 */
export function buildTextureKey(key, size, opts = {}) {
  const name = normalizeIconKey(key) || String(key ?? 'unknown').toLowerCase();
  const px = resolveIconSize(size);
  const tint = Number.isFinite(opts.tint) ? Math.round(opts.tint) : DEFAULT_TINT;
  const hex = (tint >>> 0).toString(16).padStart(6, '0');
  const bg = opts.bg
    ? `_bg${((Number.isFinite(opts.bgColor) ? opts.bgColor : 0) >>> 0).toString(16)}`
    : '';
  return `vicon_${name}_${px}_${hex}${bg}`;
}

/**
 * 정규화 좌표 커맨드를 픽셀 좌표 커맨드로 변환한다(순수 함수).
 * IconFactory는 이 결과만 보고 Phaser Graphics를 호출한다.
 * @param {Array<object>} ops
 * @param {number} px - 아이콘 픽셀 크기
 * @param {number} [padRatio] - 여백 비율 (0~0.2)
 * @returns {Array<object>} 픽셀 좌표 커맨드
 */
export function scaleOps(ops, px, padRatio = 0.06) {
  if (!Array.isArray(ops)) return [];
  const pad = px * padRatio;
  const span = px - pad * 2;
  const X = (v) => pad + v * span;
  const S = (v) => v * span;

  return ops.map((op) => {
    switch (op.t) {
      case 'poly':
        return { ...op, p: op.p.map(([x, y]) => [X(x), X(y)]) };
      case 'circle':
        return { ...op, x: X(op.x), y: X(op.y), r: S(op.r) };
      case 'ellipse':
        return { ...op, x: X(op.x), y: X(op.y), w: S(op.w), h: S(op.h) };
      case 'rect':
        return { ...op, x: X(op.x), y: X(op.y), w: S(op.w), h: S(op.h), r: S(op.r || 0) };
      case 'bar':
        return { ...op, p: op.p.map(([x, y]) => [X(x), X(y)]), w: S(op.w) };
      case 'arc':
        return { ...op, x: X(op.x), y: X(op.y), r: S(op.r), w: S(op.w) };
      default:
        return { ...op };
    }
  });
}

export default ICON_SHAPES;
