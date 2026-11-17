import { H, N, W } from './constants'
import type { BrushFire, MatchGroup, StainChange } from './types'

const ORTHO: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const ALL8: [number, number][] = [...ORTHO, [-1, -1], [-1, 1], [1, -1], [1, 1]]

export function planStains(floor: ArrayLike<number>, groups: MatchGroup[], fires: BrushFire[]): StainChange[] {
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
    if (g.spread === 0) return
    const dirs = g.spread === 2 ? ALL8 : ORTHO
    for (const cell of g.cells) {
      const r = Math.floor(cell / W)
      const c = cell % W
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue
        offer(nr * W + nc, g.color, key(1, g.maxRun, gi), 'spread')
      }
    }
  })
  fires.forEach((f, fi) => {
    for (const cell of f.cells) offer(cell, f.color, key(0, 0, groups.length + fi), 'brush')
  })
  const out: StainChange[] = []
  for (let cell = 0; cell < N; cell++) {
    if (rank[cell] === Infinity) continue
    out.push({ cell, from: floor[cell]!, to: color[cell]!, src: src[cell]! })
  }
  return out
}
