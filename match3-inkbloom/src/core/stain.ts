import { mix, wash } from './color'
import { H, N, W } from './constants'
import { NO_FLOOR, WATER, type Fire, type MatchGroup, type StainChange } from './types'

const ORTHO: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const ALL8: [number, number][] = [...ORTHO, [-1, -1], [-1, 1], [1, -1], [1, 1]]

export function paint(from: number, base: number, color: number): { to: number; base: number } {
  if (color === WATER) {
    const to = wash(from, base)
    return { to, base: to === NO_FLOOR ? NO_FLOOR : base }
  }
  return { to: mix(from, color), base: from === NO_FLOOR ? color : base }
}

export function planStains(floor: ArrayLike<number>, base: ArrayLike<number>, groups: MatchGroup[], fires: Fire[]): StainChange[] {
  const rank = new Float64Array(N).fill(Infinity)
  const color = new Int8Array(N)
  const src: StainChange['src'][] = new Array(N)
  const offer = (cell: number, col: number, r: number, s: StainChange['src']): void => {
    if (r < rank[cell]!) {
      rank[cell] = r
      color[cell] = col
      src[cell] = s
    }
  }
  const key = (kind: number, maxRun: number, idx: number): number => kind * 1e6 + (100 - maxRun) * 1e3 + idx
  groups.forEach((g, gi) => {
    for (const cell of g.cells) offer(cell, g.color, key(0, g.maxRun, gi), 'clear')
  })
  fires.forEach((f, fi) => {
    for (const cell of f.cells) offer(cell, f.color, key(1, 0, fi), 'brush')
  })
  groups.forEach((g, gi) => {
    if (g.spread === 0 || g.color === WATER) return
    const dirs = g.spread === 2 ? ALL8 : ORTHO
    for (const cell of g.cells) {
      const r = Math.floor(cell / W)
      const c = cell % W
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue
        const n = nr * W + nc
        if (floor[n] === NO_FLOOR) offer(n, g.color, key(2, g.maxRun, gi), 'spread')
      }
    }
  })
  const out: StainChange[] = []
  for (let cell = 0; cell < N; cell++) {
    if (rank[cell] === Infinity) continue
    const from = floor[cell]!
    const p = paint(from, base[cell]!, color[cell]!)
    out.push({ cell, from, to: p.to, base: p.base, src: src[cell]! })
  }
  return out
}
