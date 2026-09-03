/**
 * touchLayout.js — 터치 타깃·스크롤 목록 배치 계산 (QA P2-1 / P2-5)
 *
 * `popupLayout.js` 와 같은 원칙이다: **어떤 프로젝트 모듈도 import 하지 않는다.**
 * gameConfig/designSystem 을 참조하지 않으므로 부팅 TDZ 위험이 없고 Phaser 없이 테스트된다.
 * 단위는 무차원 — 입력이 기획 px 면 출력도 기획 px 다.
 *
 * 여기서 푸는 문제는 두 가지다.
 *
 * 1) **히트 영역 하한** — 글리프가 작아도(✕ 20×22) 손가락이 닿는 영역은 48 이상이어야 한다.
 *    `computeHitRect()` 는 시각 크기를 그대로 둔 채 Phaser 로컬 좌표계(0..width)에서
 *    중앙 정렬된 히트 사각형을 돌려준다. 시각 크기를 바꾸지 않는 것이 핵심이다.
 *
 * 2) **히트 영역 충돌** — 히트를 넓히면 인접 타깃끼리 겹쳐서 오탭이 더 늘어난다.
 *    (교단 필터 원형 20×20 을 간격 22 인 채로 48 로 넓히면 26px 씩 겹친다.)
 *    `computeRowPositions()` / `hasHitOverlap()` 으로 간격을 먼저 확보한 뒤 넓힌다.
 *
 * 3) **스크롤 목록 시작 위치** — 항목이 원점 중앙(Rectangle/Container)인 목록은
 *    첫 행 중심을 뷰포트 top 에 두면 위쪽 절반이 마스크에 잘린다. 반대로 콘텐츠 높이를
 *    행 피치 합으로 잡으면(마지막 행의 gap 까지 포함) 바닥에 그만큼 빈 공간이 남는다.
 *    `computeGridScroll()` / `computeRowCenterY()` 가 그 둘을 같은 식으로 묶는다.
 */

/** 터치 타깃 하한 (기획 px). `DESIGN.touch.minTarget` 과 같은 값이지만 여기서는 독립 상수다 */
export const MIN_TOUCH_TARGET = 48;

/** 유한한 숫자만 통과시킨다. 아니면 대체값 */
function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 시각 크기를 유지한 채 최소 터치 타깃을 보장하는 히트 사각형.
 *
 * 좌표계는 Phaser 의 `input.hitArea` 규약을 따른다 — 오브젝트 로컬 공간에서
 * `(0,0)` 이 표시 좌상단이고 `(width,height)` 가 우하단이다(origin 과 무관).
 * 그래서 시각보다 큰 히트는 음수 좌표에서 시작한다.
 *
 * @param {number} width - 오브젝트 시각 폭
 * @param {number} height - 오브젝트 시각 높이
 * @param {number} [minTarget=MIN_TOUCH_TARGET] - 하한
 * @returns {{x:number, y:number, width:number, height:number}}
 */
export function computeHitRect(width, height, minTarget = MIN_TOUCH_TARGET) {
  const min = Math.max(0, num(minTarget, MIN_TOUCH_TARGET));
  const w = Math.max(0, num(width));
  const h = Math.max(0, num(height));
  const hitW = Math.max(w, min);
  const hitH = Math.max(h, min);
  return {
    x: (w - hitW) / 2,
    y: (h - hitH) / 2,
    width: hitW,
    height: hitH
  };
}

/**
 * 가로 한 줄에 `count` 개를 같은 간격으로 중앙 정렬한 x 좌표들.
 * @param {{count:number, spacing:number, centerX:number}} p
 * @returns {number[]}
 */
export function computeRowPositions(p = {}) {
  const count = Math.max(0, Math.floor(num(p.count)));
  if (count === 0) return [];
  const spacing = num(p.spacing);
  const centerX = num(p.centerX);
  const start = centerX - (spacing * (count - 1)) / 2;
  return Array.from({ length: count }, (_, i) => start + i * spacing);
}

/**
 * 같은 크기의 히트 영역들이 서로 겹치는가.
 * @param {number[]} positions - 각 히트의 중심 좌표
 * @param {number} hitSize - 히트 한 변의 길이
 * @param {number} [minGap=0] - 겹치지 않아도 이만큼은 떨어져 있어야 한다
 * @returns {boolean}
 */
export function hasHitOverlap(positions, hitSize, minGap = 0) {
  if (!Array.isArray(positions) || positions.length < 2) return false;
  const size = Math.max(0, num(hitSize));
  const gap = Math.max(0, num(minGap));
  const sorted = [...positions].map((v) => num(v)).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] < size + gap) return true;
  }
  return false;
}

/**
 * 히트 영역까지 포함한 한 줄의 좌우 끝.
 * @param {{positions:number[], hitSize:number}} p
 * @returns {{left:number, right:number, width:number}}
 */
export function rowHitExtent(p = {}) {
  const positions = Array.isArray(p.positions) ? p.positions.map((v) => num(v)) : [];
  const half = Math.max(0, num(p.hitSize)) / 2;
  if (positions.length === 0) return { left: 0, right: 0, width: 0 };
  const left = Math.min(...positions) - half;
  const right = Math.max(...positions) + half;
  return { left, right, width: right - left };
}

/**
 * 세로로 쌓인 히트 행들이 서로 겹치지 않는 최소 행 간격.
 * @param {number} hitHeight
 * @param {number} [gap=0]
 * @returns {number}
 */
export function minRowPitch(hitHeight, gap = 0) {
  return Math.max(0, num(hitHeight)) + Math.max(0, num(gap));
}

/**
 * 원점이 **중앙**인 항목(Rectangle/Container)의 행 중심 y — 뷰포트 top 기준 상대값.
 * 첫 행은 `padTop + itemHeight/2` 라서 위쪽이 마스크에 잘리지 않는다.
 *
 * @param {number} rowIndex
 * @param {{itemHeight:number, gap?:number, padTop?:number}} p
 * @returns {number}
 */
export function computeRowCenterY(rowIndex, p = {}) {
  const row = Math.max(0, Math.floor(num(rowIndex)));
  const itemHeight = Math.max(0, num(p.itemHeight));
  const gap = Math.max(0, num(p.gap));
  const padTop = num(p.padTop);
  return padTop + itemHeight / 2 + row * (itemHeight + gap);
}

/**
 * 그리드 목록의 콘텐츠 높이와 최대 스크롤.
 *
 * 콘텐츠 높이는 **행 피치 합이 아니라 실제 점유 span** 이다 —
 * 마지막 행 뒤의 gap 을 빼야 바닥에 빈 공간이 남지 않는다.
 *
 * @param {Object} p
 * @param {number} p.itemCount - 전체 항목 수
 * @param {number} [p.cols=1] - 열 수
 * @param {number} p.itemHeight
 * @param {number} [p.gap=0]
 * @param {number} p.viewportHeight
 * @param {number} [p.padTop=0]
 * @param {number} [p.padBottom=0]
 * @returns {{rowCount:number, contentHeight:number, maxScroll:number}}
 */
export function computeGridScroll(p = {}) {
  const itemCount = Math.max(0, Math.floor(num(p.itemCount)));
  const cols = Math.max(1, Math.floor(num(p.cols, 1)));
  const itemHeight = Math.max(0, num(p.itemHeight));
  const gap = Math.max(0, num(p.gap));
  const viewportHeight = Math.max(0, num(p.viewportHeight));
  const padTop = Math.max(0, num(p.padTop));
  const padBottom = Math.max(0, num(p.padBottom));

  const rowCount = Math.ceil(itemCount / cols);
  if (rowCount === 0) {
    return { rowCount: 0, contentHeight: 0, maxScroll: 0 };
  }
  const span = rowCount * itemHeight + (rowCount - 1) * gap;
  const contentHeight = padTop + span + padBottom;
  return {
    rowCount,
    contentHeight,
    maxScroll: Math.max(0, contentHeight - viewportHeight)
  };
}

export default {
  MIN_TOUCH_TARGET,
  computeHitRect,
  computeRowPositions,
  hasHitOverlap,
  rowHitExtent,
  minRowPitch,
  computeRowCenterY,
  computeGridScroll
};
