/**
 * popupLayout.js — 팝업 4슬롯 배치 계산 (REDESIGN_PLAN §3-6, T-20)
 *
 * `PopupBase` 는 Phaser 오브젝트를 만들기 때문에 단위 테스트에서 다루기 어렵다.
 * 좌표 계산만 여기로 분리했다. 이 모듈은 **어떤 프로젝트 모듈도 import 하지 않는다** —
 * gameConfig/designSystem 을 참조하지 않으므로 부팅 TDZ 위험이 없고 Phaser 없이 테스트된다.
 *
 * 단위는 무차원이다. 입력이 렌더 px 면 출력도 렌더 px 이고, 기획 px 면 기획 px 다.
 * 상수(POPUP_SLOT / LEGACY_SLOT)만 기획 좌표(720×1280) 기준이며 호출부가 `s()` 로 옮긴다.
 *
 * 슬롯 4개는 위에서 아래로 쌓인다.
 *
 *   패널 top ─┬─ 헤더    h=headerHeight   (타이틀 필수 + 닫기 ✕ + 언더라인)
 *             ├─ 요약    h=summaryHeight  (선택, 0 이면 없음)
 *             ├─ 콘텐츠  나머지 전부       (contentBounds 로 노출)
 *             └─ 액션바  h=actionBarHeight (선택, 0 이면 없음)
 *   패널 bottom
 *
 * 요약과 액션바가 커지면 콘텐츠 높이가 그만큼 줄어든다. 겹치지 않는다.
 */

/** 기획 좌표계 크기 */
export const BASE_WIDTH = 720;
export const BASE_HEIGHT = 1280;

/**
 * 리디자인 슬롯 규격 (REDESIGN_PLAN §3-6 표). 기획 px.
 * T-22 에서 각 팝업이 `layoutSpec: 'redesign'` 으로 전환하면서 사용한다.
 */
export const POPUP_SLOT = Object.freeze({
  /** 화면 밖 여백 32px 균일 → 패널 x 32~688, y 64~1248 */
  margin: 32,
  panelWidth: 656,
  panelHeight: 1184,
  headerHeight: 88,
  /** 헤더 하단 교단·기능색 언더라인 두께 */
  underline: 3,
  /** 헤더 구분선을 헤더 바닥에서 얼마나 위로 올릴지 */
  dividerLift: 0,
  summaryHeight: 112,
  actionBarHeight: 88,
  padX: 24,
  padBottom: 8,
  closeInsetX: 36,
  closeInsetY: 44,
  closeHit: 72,
  actionHeight: 64,
  actionGap: 16,
  actionPadX: 24,
  titleAlign: 'left',
  titlePadX: 24
});

/**
 * 현행(레거시) 규격. 기존 팝업 15개가 픽셀 단위로 동일하게 그려지도록 하는 값이다.
 * 값의 출처는 리디자인 이전 `PopupBase.show()` 의 하드코딩 상수다.
 * 새 팝업은 POPUP_SLOT 을 쓴다.
 */
export const LEGACY_SLOT = Object.freeze({
  margin: 20,
  panelWidth: 680,   // PopupBase 생성자 기본값 s(680)
  panelHeight: 1100, // PopupBase 생성자 기본값 s(1100)
  headerHeight: 70,
  underline: 0,
  dividerLift: 10,   // 구분선이 헤더 바닥(70)보다 10 위인 60 에 그려졌다
  summaryHeight: 0,
  actionBarHeight: 0,
  padX: 15,
  padBottom: 15,
  closeInsetX: 30,
  closeInsetY: 20,
  closeHit: 48,
  actionHeight: 64,
  actionGap: 16,
  actionPadX: 20,
  titleAlign: 'center',
  titlePadX: 0,
  /** 레거시 타이틀은 패널 상단에서 35 아래, 가로 중앙 */
  titleOffsetY: 35,
  /** 구분선 좌우 안쪽 여백 */
  dividerInset: 20
});

/** 액션 버튼 변형 → 텍스처 키 + 강조 등급 */
export const ACTION_VARIANT = Object.freeze({
  primary: Object.freeze({ variant: 'primary', textureKey: 'btn_primary', emphasis: 'high' }),
  secondary: Object.freeze({ variant: 'secondary', textureKey: 'btn_secondary', emphasis: 'medium' }),
  ghost: Object.freeze({ variant: 'ghost', textureKey: 'btn_ghost', emphasis: 'low' })
});

/** 액션 바에 놓을 수 있는 버튼 최대 개수. 이보다 많으면 터치 하한(48)이 깨진다 */
export const MAX_ACTIONS = 4;

/** 유한한 숫자만 통과시킨다. 아니면 대체값 */
function num(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * 좌상단·크기로 전체 경계 객체를 만든다.
 * `contentBounds` 가 노출하는 키 집합과 정확히 같다.
 *
 * @param {number} left
 * @param {number} top
 * @param {number} width
 * @param {number} height
 * @returns {{left:number,top:number,right:number,bottom:number,
 *            width:number,height:number,centerX:number,centerY:number}}
 */
export function makeBounds(left, top, width, height) {
  const l = num(left);
  const t = num(top);
  const w = Math.max(0, num(width));
  const h = Math.max(0, num(height));
  return {
    left: l,
    top: t,
    right: l + w,
    bottom: t + h,
    width: w,
    height: h,
    centerX: l + w / 2,
    centerY: t + h / 2
  };
}

/**
 * 팝업 4슬롯을 계산한다.
 *
 * 모든 길이 인자는 호출부와 같은 단위(보통 렌더 px)다.
 * `summaryHeight` / `actionBarHeight` 가 0 이면 해당 슬롯은 null 이고 콘텐츠가 그만큼 넓어진다.
 *
 * @param {Object} options
 * @param {number} options.screenWidth - 화면 너비
 * @param {number} options.screenHeight - 화면 높이
 * @param {number} options.width - 패널 너비
 * @param {number} options.height - 패널 높이
 * @param {number} [options.headerHeight] - 헤더 높이 (패널 상단 ~ 콘텐츠 상단)
 * @param {number} [options.summaryHeight] - 요약 높이. 0 이면 슬롯 없음
 * @param {number} [options.actionBarHeight] - 액션 바 높이. 0 이면 슬롯 없음
 * @param {number} [options.padX] - 콘텐츠 좌우 안쪽 여백
 * @param {number} [options.padBottom] - 패널 바닥 여백
 * @param {number} [options.dividerLift] - 구분선을 헤더 바닥에서 위로 올리는 양
 * @param {number} [options.dividerInset] - 구분선 좌우 안쪽 여백
 * @param {number} [options.underline] - 헤더 언더라인 두께
 * @param {number} [options.closeInsetX] - 닫기 ✕ 의 패널 우측 안쪽 여백
 * @param {number} [options.closeInsetY] - 닫기 ✕ 의 패널 상단 안쪽 여백
 * @param {number} [options.closeHit] - 닫기 ✕ 히트 영역 한 변
 * @param {string} [options.titleAlign] - 'center' | 'left'
 * @param {number} [options.titlePadX] - left 정렬일 때 좌측 여백
 * @param {number} [options.titleOffsetY] - center 정렬일 때 패널 상단 기준 y. 없으면 헤더 세로 중앙
 * @param {number} [options.offsetY] - 패널 전체를 화면 세로 중앙에서 아래로 밀어내는 양.
 *   중첩 팝업이 하위 팝업과 헤더를 같은 좌표에 겹쳐 그리는 것을 막는다 (QA P1-4).
 *   패널이 화면 밖으로 나가지 않도록 상하 여백 안에서 잘린다.
 * @returns {{panel:Object, header:Object, summary:Object|null, content:Object,
 *            actions:Object|null, divider:Object, close:Object}}
 */
export function computePopupSlots(options = {}) {
  const screenWidth = num(options.screenWidth);
  const screenHeight = num(options.screenHeight);
  const panelW = Math.max(0, num(options.width));
  const panelH = Math.max(0, num(options.height));

  const headerHeight = Math.max(0, num(options.headerHeight));
  const summaryHeight = Math.max(0, num(options.summaryHeight));
  const actionBarHeight = Math.max(0, num(options.actionBarHeight));
  const padX = Math.max(0, num(options.padX));
  const padBottom = Math.max(0, num(options.padBottom));

  const panelLeft = screenWidth / 2 - panelW / 2;
  const centeredTop = screenHeight / 2 - panelH / 2;
  // 화면 밖으로 나가지 않는 범위에서만 민다. 중앙 정렬 여백보다 큰 오프셋은 잘린다.
  const slack = Math.max(0, Math.min(centeredTop, screenHeight - panelH - centeredTop));
  const offsetY = Math.max(-slack, Math.min(slack, num(options.offsetY)));
  const panelTop = centeredTop + offsetY;
  const panel = makeBounds(panelLeft, panelTop, panelW, panelH);

  const header = makeBounds(panelLeft, panelTop, panelW, Math.min(headerHeight, panelH));

  const summary = summaryHeight > 0
    ? makeBounds(panelLeft, panelTop + headerHeight, panelW, summaryHeight)
    : null;

  const actions = actionBarHeight > 0
    ? makeBounds(panelLeft, panel.bottom - padBottom - actionBarHeight, panelW, actionBarHeight)
    : null;

  const contentTop = panelTop + headerHeight + summaryHeight;
  const contentBottom = panel.bottom - padBottom - actionBarHeight;
  const content = makeBounds(
    panelLeft + padX,
    contentTop,
    panelW - padX * 2,
    Math.max(0, contentBottom - contentTop)
  );

  const dividerInset = Math.max(0, num(options.dividerInset, padX));
  const dividerY = panelTop + headerHeight - num(options.dividerLift);
  const divider = {
    y: dividerY,
    left: panelLeft + dividerInset,
    right: panel.right - dividerInset,
    underline: Math.max(0, num(options.underline))
  };

  const closeHit = Math.max(0, num(options.closeHit));
  const close = {
    x: panel.right - num(options.closeInsetX),
    y: panelTop + num(options.closeInsetY),
    hit: closeHit
  };

  const titleAlign = options.titleAlign === 'left' ? 'left' : 'center';
  const titleOffsetY = Number.isFinite(options.titleOffsetY)
    ? options.titleOffsetY
    : headerHeight / 2;
  const title = {
    align: titleAlign,
    x: titleAlign === 'left' ? panelLeft + num(options.titlePadX, padX) : panel.centerX,
    y: panelTop + titleOffsetY,
    originX: titleAlign === 'left' ? 0 : 0.5,
    originY: 0.5,
    maxWidth: Math.max(0, panelW - num(options.titlePadX, padX) - num(options.closeInsetX) - closeHit / 2)
  };
  header.title = title;

  return { panel, header, summary, content, actions, divider, close };
}

/**
 * 액션 목록을 정규화한다. 잘못된 항목은 버리고 변형을 채운다.
 *
 * @param {Array<{label:string,onClick?:Function,variant?:string,disabled?:boolean}>} list
 * @param {number} [max] - 최대 개수. 기본 MAX_ACTIONS
 * @returns {Array<{label:string,onClick:Function|null,variant:string,disabled:boolean}>}
 */
export function normalizeActions(list, max = MAX_ACTIONS) {
  if (!Array.isArray(list)) return [];
  const limit = Number.isFinite(max) && max > 0 ? max : MAX_ACTIONS;
  return list
    .filter((item) => item && typeof item.label === 'string' && item.label.length > 0)
    .slice(0, limit)
    .map((item) => ({
      label: item.label,
      onClick: typeof item.onClick === 'function' ? item.onClick : null,
      variant: ACTION_VARIANT[item.variant] ? item.variant : 'primary',
      disabled: item.disabled === true
    }));
}

/**
 * 액션 버튼 변형을 텍스처 키·강조 등급으로 해석한다.
 * 알 수 없는 이름은 primary 로 폴백한다.
 *
 * @param {string} variant
 * @returns {{variant:string,textureKey:string,emphasis:string}}
 */
export function resolveActionStyle(variant) {
  return ACTION_VARIANT[variant] || ACTION_VARIANT.primary;
}

/**
 * 액션 바 안에 버튼 N 개를 균등 분할한다.
 *
 * @param {number} count - 버튼 개수
 * @param {{left:number,top:number,width:number,height:number,centerY:number}} rect - 액션 바 경계
 * @param {Object} [options]
 * @param {number} [options.gap] - 버튼 간격
 * @param {number} [options.padX] - 바 좌우 여백
 * @param {number} [options.height] - 버튼 높이. 생략하면 바 높이에서 여백을 뺀 값
 * @returns {Array<{index:number,x:number,y:number,w:number,h:number,centerX:number,centerY:number}>}
 */
export function computeActionSlots(count, rect, options = {}) {
  const n = Math.floor(num(count));
  if (!rect || n <= 0) return [];

  const barLeft = num(rect.left);
  const barWidth = Math.max(0, num(rect.width));
  const barHeight = Math.max(0, num(rect.height));
  const barCenterY = Number.isFinite(rect.centerY) ? rect.centerY : num(rect.top) + barHeight / 2;

  const gap = Math.max(0, num(options.gap));
  const padX = Math.max(0, num(options.padX));
  const usable = Math.max(0, barWidth - padX * 2 - gap * (n - 1));
  const w = usable / n;
  const h = Number.isFinite(options.height) && options.height > 0
    ? options.height
    : barHeight;

  const slots = [];
  for (let i = 0; i < n; i += 1) {
    const x = barLeft + padX + i * (w + gap);
    slots.push({
      index: i,
      x,
      y: barCenterY - h / 2,
      w,
      h,
      centerX: x + w / 2,
      centerY: barCenterY
    });
  }
  return slots;
}

/**
 * 액션 바 버튼 1개가 만들어내는 자식 오브젝트 수.
 * `PopupBase.buildActions()` 가 슬롯마다 [프레임, 라벨, 히트영역] 세 개를 순서대로 넣는다.
 */
export const ACTION_CHILDREN_PER_SLOT = 3;

/** 액션 버튼의 파트 이름 → 슬롯 내 오프셋 */
export const ACTION_CHILD_OFFSET = Object.freeze({ frame: 0, label: 1, hit: 2 });

/**
 * 액션 바 컨테이너에서 N 번째 버튼의 자식 인덱스를 계산한다.
 *
 * 튜토리얼 타깃(TID)으로 등록해야 하는 버튼을 액션 바로 옮길 때 쓴다.
 * `setActions()` 는 체이닝을 위해 `this` 를 돌려주므로 버튼 오브젝트를 직접 주지 않는다.
 * 대신 `actionContainer.list` 의 인덱스가 결정적이라는 사실을 이 함수가 계약으로 고정한다.
 *
 * @param {number} index - 액션 순번 (0-based)
 * @returns {{frame:number,label:number,hit:number}|null} 음수·비정수면 null
 */
export function actionChildIndices(index) {
  const i = Math.floor(num(index, -1));
  if (i < 0) return null;
  const base = i * ACTION_CHILDREN_PER_SLOT;
  return {
    frame: base + ACTION_CHILD_OFFSET.frame,
    label: base + ACTION_CHILD_OFFSET.label,
    hit: base + ACTION_CHILD_OFFSET.hit
  };
}

/**
 * 액션 바 자식 목록에서 N 번째 버튼의 특정 파트를 꺼낸다.
 * 배열만 다루므로 Phaser 없이 테스트된다.
 *
 * @param {Array} list - `actionContainer.list`
 * @param {number} index - 액션 순번 (0-based)
 * @param {string} [part] - 'frame' | 'label' | 'hit'. 기본 'hit'
 * @returns {*} 없으면 null
 */
export function pickActionChild(list, index, part = 'hit') {
  if (!Array.isArray(list)) return null;
  const indices = actionChildIndices(index);
  if (!indices) return null;
  const at = indices[part];
  if (!Number.isFinite(at)) return null;
  return list[at] === undefined ? null : list[at];
}

/**
 * 요약 항목을 열로 나눈다. 각 열의 중심 x 를 돌려준다.
 *
 * @param {number} count - 항목 개수
 * @param {{left:number,width:number,top:number,height:number,centerY:number}} rect - 요약 슬롯 경계
 * @param {Object} [options]
 * @param {number} [options.padX] - 좌우 여백
 * @returns {Array<{index:number,centerX:number,left:number,width:number,centerY:number}>}
 */
export function computeSummaryColumns(count, rect, options = {}) {
  const n = Math.floor(num(count));
  if (!rect || n <= 0) return [];

  const padX = Math.max(0, num(options.padX));
  const left = num(rect.left) + padX;
  const width = Math.max(0, num(rect.width) - padX * 2);
  const colWidth = width / n;
  const centerY = Number.isFinite(rect.centerY)
    ? rect.centerY
    : num(rect.top) + num(rect.height) / 2;

  const cols = [];
  for (let i = 0; i < n; i += 1) {
    const colLeft = left + i * colWidth;
    cols.push({
      index: i,
      left: colLeft,
      width: colWidth,
      centerX: colLeft + colWidth / 2,
      centerY
    });
  }
  return cols;
}

/**
 * 요약 입력을 항목 배열로 정규화한다.
 * 문자열 하나면 label 없는 단일 항목이 된다.
 *
 * @param {string|Array<{label?:string,value?:string|number}>|null} input
 * @returns {Array<{label:string,value:string}>}
 */
export function normalizeSummary(input) {
  if (input === null || input === undefined || input === '') return [];
  if (typeof input === 'string') return [{ label: '', value: input }];
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && (item.label !== undefined || item.value !== undefined))
    .map((item) => ({
      label: item.label === undefined || item.label === null ? '' : String(item.label),
      value: item.value === undefined || item.value === null ? '' : String(item.value)
    }));
}

export default {
  POPUP_SLOT,
  LEGACY_SLOT,
  ACTION_VARIANT,
  MAX_ACTIONS,
  makeBounds,
  computePopupSlots,
  normalizeActions,
  resolveActionStyle,
  computeActionSlots,
  computeSummaryColumns,
  normalizeSummary,
  ACTION_CHILDREN_PER_SLOT,
  ACTION_CHILD_OFFSET,
  actionChildIndices,
  pickActionChild
};
