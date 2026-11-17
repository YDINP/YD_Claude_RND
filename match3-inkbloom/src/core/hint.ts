import { swapCells } from './board'
import { eachPair, findGroups, mixPiece } from './match'
import type { Game } from './game'
import { BRUSH, EMPTY, colorOf, type Cell } from './types'

export interface Hint { a: Cell; b: Cell }

const TIERS = 4

export function findHint(game: Game): Hint | null {
  if (game.status !== 'playing') return null
  const needed = new Set(game.progress().filter((x) => x.have < x.need).map((x) => x.color))
  const p = Int8Array.from(game.pieces)
  const best: (Hint | null)[] = new Array<Hint | null>(TIERS).fill(null)
  const offer = (tier: number, a: Cell, b: Cell): void => {
    if (!best[tier]) best[tier] = { a, b }
  }
  eachPair((a, b) => {
    if (p[a] === BRUSH || p[b] === BRUSH) {
      const other = p[a] === BRUSH ? p[b]! : p[a]!
      offer(needed.has(colorOf(other)) ? 0 : 2, a, b)
      return best[0] !== null
    }
    swapCells(p, a, b)
    const groups = findGroups(p)
    swapCells(p, a, b)
    if (groups.length > 0) {
      offer(groups.some((g) => needed.has(g.color)) ? 0 : 2, a, b)
      return best[0] !== null
    }
    const mixed = mixPiece(p, a, b)
    if (mixed !== EMPTY) offer(needed.has(colorOf(mixed)) ? 1 : 3, a, b)
    return false
  })
  return best.find((h) => h !== null) ?? null
}
