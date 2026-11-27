import type { GridPosition, SymbolId } from '@tgslot/slot-engine'
import { cellPitch, reelLeft, rowTop, type Layout, type Rect } from './layout.js'

/**
 * 릴 높이가 서로 다른 판(마름모 등)의 배치 계산. 전부 순수 함수다.
 *
 * 데이터는 «위로 붙여 저장»한다 — 릴 r은 행 `0..h_r-1`만 쓰고 그 아래는 판 밖(`VOID`)이다.
 * 화면에서만 릴을 세로 가운데로 내린다: 오프셋 = (rows − h) / 2 칸. 높이 4 릴은 반 칸 내려앉는다.
 * 높이가 모두 rows인 판은 `shapeHeights`가 null을 돌려주고, 이 모듈의 어떤 함수도 쓰이지 않는다(기존 경로 불변).
 */

/** 엔진 `VOID_CELL`과 같은 값. 렌더러는 엔진을 런타임에 가져오지 않아 따로 둔다(테스트가 같은지 비교한다). */
export const VOID_SYMBOL = '__void__'

export interface ShapeInput {
  reels: number
  rows: number
  reelHeights?: readonly number[] | undefined
}

/** 릴별 높이. 직사각 판(높이 선언 없음, 또는 전부 rows)이면 null. */
export function shapeHeights(math: ShapeInput): readonly number[] | null {
  const heights = math.reelHeights
  if (heights === undefined || heights.length !== math.reels) return null
  if (heights.every((h) => h === math.rows)) return null
  return heights
}

/** 릴 r의 높이. */
export function heightOf(math: ShapeInput, reel: number): number {
  return math.reelHeights?.[reel] ?? math.rows
}

/** 판 안의 칸인가. */
export function inShape(math: ShapeInput, reel: number, row: number): boolean {
  return row >= 0 && row < heightOf(math, reel)
}

/** 판 안 칸 목록. 릴 0→끝, 릴 안 행 0→h−1(엔진 `shapeCells`와 같은 순서). */
export function shapeCellList(math: ShapeInput): GridPosition[] {
  const cells: GridPosition[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const h = heightOf(math, reel)
    for (let row = 0; row < h; row += 1) cells.push([reel, row])
  }
  return cells
}

/** 릴 위쪽에서 가운데 정렬로 내려앉는 거리(px). */
export function reelOffsetPx(layout: Pick<Layout, 'symbolSize' | 'gap'>, rows: number, height: number): number {
  return ((rows - height) / 2) * cellPitch(layout)
}

/** 릴별 오프셋(px)을 채운 레이아웃. 높이가 없으면 원본 그대로. */
export function withReelOffsets(layout: Layout, heights: readonly number[] | null): Layout {
  if (heights === null) return layout
  return { ...layout, reelOffsets: heights.map((h) => reelOffsetPx(layout, layout.rows, h)) }
}

/**
 * 릴 창(마스크) 사각형. 간격의 절반만큼 사방으로 키워 이웃 릴과 이어 붙인다 —
 * 칸 둘레로 번지는 빛이 간격에서 잘려 보이지 않게 한다.
 */
export function reelWindowRects(layout: Layout, heights: readonly number[]): Rect[] {
  const pitch = cellPitch(layout)
  return heights.map((h, reel) => ({
    x: reelLeft(layout, reel) - layout.gap / 2,
    y: rowTop(layout, 0) + (layout.reelOffsets?.[reel] ?? reelOffsetPx(layout, layout.rows, h)) - layout.gap / 2,
    width: pitch,
    height: h * pitch,
  }))
}

/** 칸 하나의 사각형(레이아웃 지역 좌표). 판 밖 칸도 계산된다. */
export function shapeCellRect(layout: Layout, reel: number, row: number): Rect {
  return {
    x: reelLeft(layout, reel),
    y: rowTop(layout, row) + (layout.reelOffsets?.[reel] ?? 0),
    width: layout.symbolSize,
    height: layout.symbolSize,
  }
}

/**
 * 판 밖 칸(마름모 모서리)을 덮는 서리 막 사각형. 릴마다 위·아래 남는 구간을 하나씩 돌려준다.
 * 빈 칸이 아니라 «서리 막»으로 보이게 하려는 것이다(사용자 규칙: 빈칸 심볼 금지).
 */
export function voidVeilRects(layout: Layout, heights: readonly number[]): Rect[] {
  const pitch = cellPitch(layout)
  const rects: Rect[] = []
  heights.forEach((h, reel) => {
    const free = layout.rows - h
    if (free <= 0) return
    const above = (free / 2) * pitch
    const left = reelLeft(layout, reel) - layout.gap / 2
    const top = rowTop(layout, 0) - layout.gap / 2
    rects.push({ x: left, y: top, width: pitch, height: above })
    rects.push({ x: left, y: top + above + h * pitch, width: pitch, height: above })
  })
  return rects
}

/** 판 밖 칸을 스트립 심볼로 채운 사본. 변형 층이 `VOID`를 앉히지 않게 거른다. */
export function replaceVoidCells(
  grid: readonly (readonly SymbolId[])[],
  fill: (reel: number, row: number) => SymbolId,
): SymbolId[][] {
  return grid.map((line, row) => line.map((symbol, reel) => (symbol === VOID_SYMBOL ? fill(reel, row) : symbol)))
}
