import { describe, expect, it } from 'vitest'
import { VOID_CELL } from '@tgslot/slot-engine'
import { computeLayout, cellPitch, cellRect, positionRects, symbolCenter } from './layout.js'
import {
  VOID_SYMBOL,
  inShape,
  reelOffsetPx,
  reelWindowRects,
  replaceVoidCells,
  shapeCellList,
  shapeCellRect,
  shapeHeights,
  voidVeilRects,
  withReelOffsets,
} from './shapeLayout.js'

const HEIGHTS = [3, 4, 5, 4, 3]
const MATH = { reels: 5, rows: 5, reelHeights: HEIGHTS }
const layout = computeLayout({ containerWidth: 390, containerHeight: 560, reels: 5, rows: 5 })

describe('shapeLayout', () => {
  it('VOID 표시가 엔진과 같다', () => {
    expect(VOID_SYMBOL).toBe(VOID_CELL)
  })

  it('직사각 판은 모양이 없다(null)', () => {
    expect(shapeHeights({ reels: 5, rows: 3 })).toBeNull()
    expect(shapeHeights({ reels: 5, rows: 3, reelHeights: [3, 3, 3, 3, 3] })).toBeNull()
    expect(shapeHeights({ reels: 5, rows: 3, reelHeights: [3, 3] })).toBeNull()
    expect(shapeHeights(MATH)).toEqual(HEIGHTS)
  })

  it('칸 목록은 19칸이고 릴 → 행 순서다', () => {
    const cells = shapeCellList(MATH)
    expect(cells).toHaveLength(19)
    expect(cells.slice(0, 4)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ])
    expect(inShape(MATH, 0, 3)).toBe(false)
    expect(inShape(MATH, 2, 4)).toBe(true)
  })

  it('높이 4 릴은 반 칸, 높이 3 릴은 한 칸 내려앉는다', () => {
    const pitch = cellPitch(layout)
    expect(reelOffsetPx(layout, 5, 5)).toBe(0)
    expect(reelOffsetPx(layout, 5, 4)).toBeCloseTo(pitch / 2)
    expect(reelOffsetPx(layout, 5, 3)).toBeCloseTo(pitch)
  })

  it('오프셋이 있으면 셀 좌표 함수가 따라간다. 없으면 기존 값 그대로다', () => {
    const shaped = withReelOffsets(layout, HEIGHTS)
    const pitch = cellPitch(layout)
    expect(symbolCenter(shaped, 0, 0).y - symbolCenter(layout, 0, 0).y).toBeCloseTo(pitch)
    expect(symbolCenter(shaped, 2, 0).y).toBeCloseTo(symbolCenter(layout, 2, 0).y)
    expect(positionRects(shaped, [[1, 0]])[0]?.y).toBeCloseTo((positionRects(layout, [[1, 0]])[0]?.y ?? 0) + pitch / 2)
    expect(cellRect(shaped, { x: 0, y: 0 }, 5, 5, 4, 1).y).toBeCloseTo(cellRect(layout, { x: 0, y: 0 }, 5, 5, 4, 1).y + pitch)
    expect(withReelOffsets(layout, null)).toBe(layout)
    expect(cellRect(layout, { x: 3, y: 4 }, 5, 5, 1, 1).y).toBe(4 + layout.reelArea.y + cellPitch(layout))
  })

  it('릴 창은 이웃과 이어 붙고 높이만큼만 덮는다', () => {
    const shaped = withReelOffsets(layout, HEIGHTS)
    const rects = reelWindowRects(shaped, HEIGHTS)
    const pitch = cellPitch(layout)
    expect(rects).toHaveLength(5)
    expect(rects[2]?.height).toBeCloseTo(5 * pitch)
    expect(rects[0]?.height).toBeCloseTo(3 * pitch)
    const a = rects[0]
    const b = rects[1]
    expect((a?.x ?? 0) + (a?.width ?? 0)).toBeCloseTo(b?.x ?? -1)
    // 가운데 정렬: 위 여유와 아래 여유가 같다.
    const areaTop = shaped.reelArea.y - layout.gap / 2
    const top = (rects[0]?.y ?? 0) - areaTop
    const bottom = areaTop + 5 * pitch - ((rects[0]?.y ?? 0) + (rects[0]?.height ?? 0))
    expect(top).toBeCloseTo(bottom)
  })

  it('서리 막은 판 밖 구간만 덮는다(위·아래 하나씩)', () => {
    const shaped = withReelOffsets(layout, HEIGHTS)
    const veils = voidVeilRects(shaped, HEIGHTS)
    // 높이 5 릴은 없음, 나머지 4릴 × 위아래 = 8
    expect(veils).toHaveLength(8)
    const pitch = cellPitch(layout)
    const total = veils.reduce((sum, r) => sum + r.height / pitch, 0)
    // 빈 칸 수 = 25 − 19 = 6칸
    expect(total).toBeCloseTo(6)
  })

  it('칸 사각형은 오프셋을 더한다', () => {
    const shaped = withReelOffsets(layout, HEIGHTS)
    expect(shapeCellRect(shaped, 0, 0).y).toBeCloseTo(shaped.reelArea.y + cellPitch(layout))
  })

  it('VOID 칸만 채워 넣는다', () => {
    const grid = [
      ['a', VOID_SYMBOL],
      ['b', 'c'],
    ]
    expect(replaceVoidCells(grid, () => 'z')).toEqual([
      ['a', 'z'],
      ['b', 'c'],
    ])
  })
})
