import { POINT_CLEAR, POINT_SAME } from './constants'
import type { Cell, StainChange } from './types'

export function stepPoints(floorBefore: ArrayLike<number>, stains: StainChange[], cleared: Cell[], chain: number): number {
  const to = new Map<Cell, number>()
  for (const s of stains) to.set(s.cell, s.to)
  let sum = 0
  for (const cell of cleared) sum += floorBefore[cell] === to.get(cell) ? POINT_SAME : POINT_CLEAR
  return Math.floor((sum * (chain + 1)) / 2)
}
