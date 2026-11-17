import { isPrimary, isSecondary } from './color'
import { POINT_CLEAR, POINT_LUCKY, POINT_MIX, POINT_MUDDY, POINT_SAME } from './constants'
import { MUDDY, type Cell, type StainChange } from './types'

export function stepPoints(stains: StainChange[], cleared: Cell[], chain: number): { points: number; lucky: number } {
  const by = new Map<Cell, StainChange>()
  for (const s of stains) by.set(s.cell, s)
  let sum = 0
  let lucky = 0
  for (const cell of cleared) {
    const s = by.get(cell)
    if (!s) sum += POINT_CLEAR
    else if (isSecondary(s.to) && s.from !== s.to) {
      sum += POINT_MIX
      if (chain >= 2) {
        sum += POINT_LUCKY
        lucky++
      }
    } else if (s.to === MUDDY) sum += POINT_MUDDY
    else if (isPrimary(s.to) && s.from === s.to) sum += POINT_SAME
    else sum += POINT_CLEAR
  }
  return { points: Math.floor((sum * (chain + 1)) / 2), lucky }
}
