import { H, N, W } from './constants'
import { NO_FLOOR, colorOf, isColored, type Fire, type MatchGroup, type StainChange } from './types'

const ORTHO: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const ALL8: [number, number][] = [...ORTHO, [-1, -1], [-1, 1], [1, -1], [1, 1]]

export function planStains(floor: ArrayLike<number>, pieces: ArrayLike<number>, groups: MatchGroup[], fires: Fire[]): StainChange[] {
  const color = new Int8Array(N).fill(NO_FLOOR)
  const src: StainChange['src'][] = new Array(N)
  const set = (cell: number, col: number, s: StainChange['src']): void => {
    if (color[cell] !== NO_FLOOR || col < 0) return
    color[cell] = col
    src[cell] = s
  }
  const own = (cell: number, fallback: number): number => (isColored(pieces[cell]!) ? colorOf(pieces[cell]!) : fallback)
  for (const g of groups) for (const cell of g.cells) set(cell, own(cell, g.color), 'clear')
  for (const f of fires) for (const cell of f.cells) set(cell, own(cell, f.color), 'brush')
  for (const g of groups) {
    if (g.spread === 0) continue
    const dirs = g.spread === 2 ? ALL8 : ORTHO
    for (const cell of g.cells) {
      const r = Math.floor(cell / W)
      const c = cell % W
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue
        const n = nr * W + nc
        if (floor[n] === NO_FLOOR) set(n, g.color, 'spread')
      }
    }
  }
  const out: StainChange[] = []
  for (let cell = 0; cell < N; cell++) {
    if (color[cell] === NO_FLOOR) continue
    out.push({ cell, from: floor[cell]!, to: color[cell]!, src: src[cell]! })
  }
  return out
}
