import { BRUSH, type Cell, type MatchGroup } from './types'
import { H, MIN_MATCH, N, W } from './constants'

export interface Run { cells: Cell[]; horiz: boolean; color: number }
export interface GroupInfo extends MatchGroup { runs: Run[]; mixed: boolean }

const isColor = (v: number): boolean => v >= 0 && v < BRUSH

export function findRuns(p: ArrayLike<number>): Run[] {
  const runs: Run[] = []
  const scan = (outer: number, inner: number, idx: (o: number, i: number) => Cell, horiz: boolean): void => {
    for (let o = 0; o < outer; o++) {
      let i = 0
      while (i < inner) {
        const v = p[idx(o, i)]!
        let j = i + 1
        if (isColor(v)) while (j < inner && p[idx(o, j)] === v) j++
        if (isColor(v) && j - i >= MIN_MATCH) {
          const cells: Cell[] = []
          for (let k = i; k < j; k++) cells.push(idx(o, k))
          runs.push({ cells, horiz, color: v })
        }
        i = j
      }
    }
  }
  scan(H, W, (r, c) => r * W + c, true)
  scan(W, H, (c, r) => r * W + c, false)
  return runs
}

export function findGroups(p: ArrayLike<number>): GroupInfo[] {
  const runs = findRuns(p)
  if (runs.length === 0) return []
  const parent = Array.from({ length: N }, (_, i) => i)
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  const inRun = new Uint8Array(N)
  for (const run of runs) {
    const root = find(run.cells[0]!)
    for (const c of run.cells) {
      parent[find(c)] = root
      inRun[c] = 1
    }
  }
  const byRoot = new Map<number, GroupInfo>()
  const groups: GroupInfo[] = []
  for (let c = 0; c < N; c++) {
    if (!inRun[c]) continue
    const root = find(c)
    let g = byRoot.get(root)
    if (!g) {
      g = { color: p[c]!, cells: [], maxRun: 0, spread: 0, runs: [], mixed: false }
      byRoot.set(root, g)
      groups.push(g)
    }
    g.cells.push(c)
  }
  for (const run of runs) {
    const g = byRoot.get(find(run.cells[0]!))!
    g.runs.push(run)
    g.maxRun = Math.max(g.maxRun, run.cells.length)
  }
  for (const g of groups) {
    g.mixed = g.runs.some((r) => r.horiz) && g.runs.some((r) => !r.horiz)
    g.spread = g.maxRun >= 5 ? 2 : g.maxRun === 4 || g.mixed ? 1 : 0
  }
  return groups
}

export const hasMatch = (p: ArrayLike<number>): boolean => findRuns(p).length > 0

export function hasMove(p: Int8Array): boolean {
  if (p.includes(BRUSH)) return true
  const tryPair = (a: Cell, b: Cell): boolean => {
    const t = p[a]!
    p[a] = p[b]!
    p[b] = t
    const ok = hasMatch(p)
    p[b] = p[a]!
    p[a] = t
    return ok
  }
  for (let i = 0; i < N; i++) {
    if (i % W < W - 1 && tryPair(i, i + 1)) return true
    if (i < N - W && tryPair(i, i + W)) return true
  }
  return false
}
