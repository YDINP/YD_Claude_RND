import {
  DEFAULT_FRAME_WINDOW,
  FRAME_BORDER_RATIO,
  FRAME_PADDING_RATIO,
  FRAME_RADIUS_RATIO,
  DEFAULT_OVERFLOW_X,
  MAX_SYMBOL_SIZE,
  MIN_SYMBOL_SIZE,
  SYMBOL_GAP_RATIO,
} from './constants.js'

export interface LayoutInput {
  /** 컨테이너의 사용 가능한 폭(px, CSS 픽셀). */
  containerWidth: number
  /** 컨테이너의 사용 가능한 높이(px). 0이나 미지정이면 폭만으로 맞춘다. */
  containerHeight?: number
  reels: number
  rows: number
  /**
   * 벡터 베젤(테두리·여백)을 그릴지. 기본 true.
   * 프레임 아트를 쓸 때는 베젤이 그림에 이미 있으므로 false로 두고 릴만 창에 채운다.
   */
  chrome?: boolean
  /** 심볼 크기 하한(px). 프레임 창 안에 억지로 맞춰야 할 때만 낮춘다. */
  minSymbolSize?: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface Layout {
  /** 캔버스 논리 크기(px). devicePixelRatio는 렌더러 resolution이 따로 처리한다. */
  width: number
  height: number
  /** 심볼 셀 한 변(px). 간격을 포함하지 않는다. */
  symbolSize: number
  /** 셀 사이 간격(px). */
  gap: number
  /** 프레임 안쪽 여백(px). */
  padding: number
  /** 프레임 테두리 두께(px). */
  border: number
  /** 프레임 모서리 반경(px). */
  radius: number
  /** 프레임 전체 사각형. 캔버스 원점(0,0) 기준. */
  frame: Rect
  /** 심볼이 보이는 영역(마스크 범위). */
  reelArea: Rect
  reels: number
  rows: number
}

/** 셀 + 간격을 합친 한 칸의 피치(px). */
export function cellPitch(layout: Pick<Layout, 'symbolSize' | 'gap'>): number {
  return layout.symbolSize + layout.gap
}

/**
 * 컨테이너에 릴 프레임을 채워 넣는 레이아웃 계산. 세로 폰 우선이라 폭을 먼저 맞춘다.
 * 높이가 주어지면 둘 중 작은 심볼 크기를 택해 잘리지 않게 한다.
 */
export function computeLayout(input: LayoutInput): Layout {
  const { reels, rows } = input
  if (reels < 1 || rows < 1) throw new RangeError(`reels/rows는 1 이상이어야 한다: ${reels}x${rows}`)

  const chrome = input.chrome !== false
  const chromeUnits = chrome ? FRAME_PADDING_RATIO + FRAME_BORDER_RATIO : 0
  const floor = Math.max(0, input.minSymbolSize ?? MIN_SYMBOL_SIZE)

  // 폭 = s * (reels + (reels-1)*gapRatio + 2*(paddingRatio + borderRatio))
  const widthUnits = reels + (reels - 1) * SYMBOL_GAP_RATIO + 2 * chromeUnits
  const heightUnits = rows + (rows - 1) * SYMBOL_GAP_RATIO + 2 * chromeUnits

  const width = Math.max(0, input.containerWidth)
  const height = Math.max(0, input.containerHeight ?? 0)

  const fromWidth = width / widthUnits
  const fromHeight = height > 0 ? height / heightUnits : Number.POSITIVE_INFINITY
  const raw = Math.min(fromWidth, fromHeight)
  const symbolSize = Math.max(floor, Math.min(MAX_SYMBOL_SIZE, Number.isFinite(raw) ? raw : floor))

  const gap = symbolSize * SYMBOL_GAP_RATIO
  const padding = chrome ? symbolSize * FRAME_PADDING_RATIO : 0
  const border = chrome ? symbolSize * FRAME_BORDER_RATIO : 0
  const radius = symbolSize * FRAME_RADIUS_RATIO

  const reelAreaWidth = reels * symbolSize + (reels - 1) * gap
  const reelAreaHeight = rows * symbolSize + (rows - 1) * gap
  const frameWidth = reelAreaWidth + 2 * (padding + border)
  const frameHeight = reelAreaHeight + 2 * (padding + border)

  return {
    width: frameWidth,
    height: frameHeight,
    symbolSize,
    gap,
    padding,
    border,
    radius,
    frame: { x: 0, y: 0, width: frameWidth, height: frameHeight },
    reelArea: { x: padding + border, y: padding + border, width: reelAreaWidth, height: reelAreaHeight },
    reels,
    rows,
  }
}

/** 릴 `reel`의 왼쪽 x 좌표. */
export function reelLeft(layout: Layout, reel: number): number {
  return layout.reelArea.x + reel * cellPitch(layout)
}

/** 행 `row`의 위쪽 y 좌표. 오버스캔(-1, rows)도 계산된다. */
export function rowTop(layout: Layout, row: number): number {
  return layout.reelArea.y + row * cellPitch(layout)
}

/** 심볼 셀 중심 좌표. 페이라인 폴리라인의 꼭짓점이 된다. */
export function symbolCenter(layout: Layout, reel: number, row: number): Point {
  return {
    x: reelLeft(layout, reel) + layout.symbolSize / 2,
    y: rowTop(layout, row) + layout.symbolSize / 2,
  }
}

/**
 * 페이라인(릴별 행 인덱스) -> 심볼 중심을 잇는 폴리라인 꼭짓점.
 * 길이는 언제나 페이라인 길이와 같다.
 */
export function paylinePoints(layout: Layout, payline: readonly number[]): Point[] {
  return payline.map((row, reel) => {
    if (row < 0 || row >= layout.rows) throw new RangeError(`행 인덱스 ${row}가 rows(${layout.rows}) 밖이다`)
    return symbolCenter(layout, reel, row)
  })
}

/** `[reel, row]` 좌표 목록 -> 셀 사각형 목록. 승리 심볼 하이라이트용. */
export function positionRects(layout: Layout, positions: readonly (readonly [number, number])[]): Rect[] {
  return positions.map(([reel, row]) => ({
    x: reelLeft(layout, reel),
    y: rowTop(layout, row),
    width: layout.symbolSize,
    height: layout.symbolSize,
  }))
}

/** 프레임 이미지 안의 릴 창. 값은 프레임 크기에 대한 분수(0~1)다. */
export interface FrameWindow {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 프레임 이미지 안의 릴 창을 픽셀 사각형으로 바꾼다.
 * 분수 좌표라서 프레임을 어떤 배율로 그리든 같은 자리를 가리킨다.
 */
export function frameWindowRect(
  frameWidth: number,
  frameHeight: number,
  window: FrameWindow = DEFAULT_FRAME_WINDOW,
): Rect {
  if (frameWidth <= 0 || frameHeight <= 0) {
    throw new RangeError(`프레임 크기가 올바르지 않다: ${frameWidth}x${frameHeight}`)
  }
  return {
    x: window.x * frameWidth,
    y: window.y * frameHeight,
    width: window.w * frameWidth,
    height: window.h * frameHeight,
  }
}

export interface FramedLayoutInput {
  containerWidth: number
  containerHeight?: number
  /** 프레임 이미지의 원본 크기(px). */
  frameWidth: number
  frameHeight: number
  window?: FrameWindow
  reels: number
  rows: number
}

export interface FramedLayout {
  /** 캔버스 크기 = 프레임을 컨테이너에 맞춰 그린 크기. */
  canvasWidth: number
  canvasHeight: number
  /** 프레임 원본 대비 표시 배율. */
  scale: number
  /** 캔버스 좌표계에서의 릴 창. */
  window: Rect
  /** 창 안에 놓이는 릴 레이아웃. 벡터 베젤이 없다(chrome false). */
  layout: Layout
  /** 릴 레이아웃의 좌상단. 창보다 작으면 가운데로 민다. */
  content: Point
}

/**
 * 프레임 아트를 쓸 때의 배치. 프레임은 컨테이너 폭에 맞추고(높이가 모자라면 높이에도 맞춘다)
 * 릴은 창 안에 꽉 채운 뒤 남는 방향으로 가운데 정렬한다.
 */
export function computeFrameLayout(input: FramedLayoutInput): FramedLayout {
  const { frameWidth, frameHeight } = input
  if (frameWidth <= 0 || frameHeight <= 0) {
    throw new RangeError(`프레임 크기가 올바르지 않다: ${frameWidth}x${frameHeight}`)
  }
  const availableWidth = Math.max(1, input.containerWidth)
  const availableHeight = Math.max(0, input.containerHeight ?? 0)

  const byWidth = availableWidth / frameWidth
  const byHeight = availableHeight > 0 ? availableHeight / frameHeight : Number.POSITIVE_INFINITY
  const scale = Math.min(byWidth, byHeight)

  const canvasWidth = frameWidth * scale
  const canvasHeight = frameHeight * scale
  const window = frameWindowRect(canvasWidth, canvasHeight, input.window ?? DEFAULT_FRAME_WINDOW)

  // 창 밖으로 삐져나오면 베젤에 가리므로 최소 심볼 크기 하한을 풀어 창에 맞춘다.
  const layout = computeLayout({
    containerWidth: window.width,
    containerHeight: window.height,
    reels: input.reels,
    rows: input.rows,
    chrome: false,
    minSymbolSize: 1,
  })

  return {
    canvasWidth,
    canvasHeight,
    scale,
    window,
    layout,
    content: {
      x: window.x + (window.width - layout.width) / 2,
      y: window.y + (window.height - layout.height) / 2,
    },
  }
}

export interface WindowFitInput {
  containerWidth: number
  containerHeight: number
  frameWidth: number
  frameHeight: number
  window?: FrameWindow
  reels: number
  rows: number
  /** 프레임이 컨테이너 폭을 넘어도 되는 비율. 기본 `DEFAULT_OVERFLOW_X`(0.30). */
  overflowX?: number
}

export interface WindowFitLayout {
  /** 캔버스 = **언제나** 컨테이너 전체. 캔버스가 무언가를 자르는 일은 없다. */
  canvasWidth: number
  canvasHeight: number
  scale: number
  /** 프레임 스프라이트를 놓을 사각형. 캔버스 밖으로 삐져나갈 수 있다. */
  frameRect: Rect
  /** 릴 창. */
  window: Rect
  /** 프레임 전체가 컨테이너 세로에 들어갔는지. false면 창을 세로 가운데로 맞춘 것이다. */
  frameFitsVertically: boolean
  layout: Layout
  content: Point
}

/**
 * 릴 **창**을 컨테이너에 최대한 채우는 배치.
 *
 * 프레임 전체를 폭에 맞추면(=`fit: 'width'`) 마퀴와 레전드가 자리를 다 먹어 릴이 작아진다.
 * 그래서 **릴 창의 폭이 컨테이너 폭과 같아지는** 배율을 노린다. 좌우 기둥은 잘려 나가도 좋다.
 * `overflowX`는 그 위에 얹는 안전 상한이고,
 * 세로로는 프레임 전체가 컨테이너에 들어오는 배율을 상한으로 삼는다.
 * 셋 중 가장 빡빡한 것이 이긴다. 보통은 세로가 먼저 걸린다.
 *
 * 캔버스는 **언제나 컨테이너 전체**다. 잘라내는 일은 컨테이너의 overflow만 한다.
 * 프레임이 세로로 들어가면 프레임 전체를 가운데 맞추고, 넘치면 **창**을 가운데 맞춘다.
 */
export function computeWindowFitLayout(input: WindowFitInput): WindowFitLayout {
  const { frameWidth, frameHeight } = input
  if (frameWidth <= 0 || frameHeight <= 0) {
    throw new RangeError(`프레임 크기가 올바르지 않다: ${frameWidth}x${frameHeight}`)
  }
  const window = input.window ?? DEFAULT_FRAME_WINDOW
  const containerWidth = Math.max(1, input.containerWidth)
  const containerHeight = Math.max(0, input.containerHeight)
  const overflowX = Math.max(0, input.overflowX ?? DEFAULT_OVERFLOW_X)

  // 목표: 릴 창의 폭이 컨테이너 폭과 같아진다. 좌우 기둥은 통째로 잘려도 좋다.
  const byWindowWidth = containerWidth / (window.w * frameWidth)
  // 그래도 프레임이 무한정 커지지는 않게 넘침 허용치로 한 번 더 묶는다.
  const byWidth = (containerWidth * (1 + overflowX)) / frameWidth
  // 높이를 못 재는 컨테이너(레이아웃 전)에서는 폭만으로 정한다.
  const byHeight = containerHeight > 0 ? containerHeight / frameHeight : Number.POSITIVE_INFINITY
  const scale = Math.max(Number.MIN_VALUE, Math.min(byWindowWidth, byWidth, byHeight))

  const frameDisplayWidth = frameWidth * scale
  const frameDisplayHeight = frameHeight * scale
  const windowWidth = window.w * frameDisplayWidth
  const windowHeight = window.h * frameDisplayHeight

  // 세로로 들어가면 프레임을 통째로 가운데. 넘치면 창을 가운데 두고 마퀴/레전드를 희생한다.
  const frameFitsVertically = frameDisplayHeight <= containerHeight
  const frameTop = frameFitsVertically
    ? (containerHeight - frameDisplayHeight) / 2
    : containerHeight / 2 - (window.y + window.h / 2) * frameDisplayHeight

  // 가로 중심을 맞추는 대상은 프레임이 아니라 **창**이다.
  // 아트의 창이 프레임 정중앙에 있지 않을 수 있는데, 그때 프레임을 가운데 두면
  // 창이 한쪽으로 밀려 컨테이너 폭을 넘어간다.
  const windowLeft = (containerWidth - windowWidth) / 2
  const frameRect: Rect = {
    x: windowLeft - window.x * frameDisplayWidth,
    y: frameTop,
    width: frameDisplayWidth,
    height: frameDisplayHeight,
  }
  const windowRect: Rect = {
    x: windowLeft,
    y: frameRect.y + window.y * frameDisplayHeight,
    width: windowWidth,
    height: windowHeight,
  }

  const layout = computeLayout({
    containerWidth: windowRect.width,
    containerHeight: windowRect.height,
    reels: input.reels,
    rows: input.rows,
    chrome: false,
    minSymbolSize: 1,
  })

  return {
    canvasWidth: containerWidth,
    canvasHeight: containerHeight,
    scale,
    frameRect,
    window: windowRect,
    frameFitsVertically,
    layout,
    content: {
      x: windowRect.x + (windowRect.width - layout.width) / 2,
      y: windowRect.y + (windowRect.height - layout.height) / 2,
    },
  }
}
