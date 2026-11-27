import type { GridPosition } from './types.js'

/**
 * 판 밖 칸 표시. 릴별 높이(`reelHeights`)가 있는 팩에서 릴 r의 `row ≥ h_r` 칸이 이 값이다.
 * 심볼 id로 쓸 수 없다(스키마가 막는다). 평가·스캐터·와일드 어느 규칙에도 맞지 않는다.
 */
export const VOID_CELL = '__void__'

/** `reelHeights`·`reels`·`rows`만 보는 최소 모양. 렌더러·도구가 math 전체 없이도 쓸 수 있게 구조로 받는다. */
export interface ShapeHost {
  reels: number
  rows: number
  reelHeights?: readonly number[] | undefined
}

/** 릴 r의 높이. `reelHeights`가 없으면 `rows`(직사각 판). */
export function reelHeight(math: ShapeHost, reel: number): number {
  return math.reelHeights?.[reel] ?? math.rows
}

/** `[reel, row]`이 판 안인가. 행은 위로 붙여 저장한다(`0..h_r−1`). 화면 가운데 정렬은 렌더러 몫이다. */
export function inShape(math: ShapeHost, reel: number, row: number): boolean {
  return reel >= 0 && reel < math.reels && row >= 0 && row < reelHeight(math, reel)
}

const cellCache = new WeakMap<object, readonly GridPosition[]>()

/**
 * 판 안 칸 목록. 순서는 **릴 0→끝, 각 릴 안에서 행 0→h_r−1**이다(칸 단위 RNG 소비 순서와 같다).
 * math 객체마다 한 번만 만든다. 돌려준 배열은 바꾸지 말 것.
 */
export function shapeCells(math: ShapeHost): readonly GridPosition[] {
  const cached = cellCache.get(math)
  if (cached !== undefined) return cached
  const cells: GridPosition[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const height = reelHeight(math, reel)
    for (let row = 0; row < height; row += 1) cells.push([reel, row])
  }
  cellCache.set(math, cells)
  return cells
}

/** 판 안 칸 수. 3·4·5·4·3 판이면 19. */
export function shapeCellCount(math: ShapeHost): number {
  return shapeCells(math).length
}

/** ways 길 수 최댓값 `Π h_r`. 직사각 판이면 `rows^reels`. */
export function shapeWaysBase(math: ShapeHost): number {
  let product = 1
  for (let reel = 0; reel < math.reels; reel += 1) product *= reelHeight(math, reel)
  return product
}
