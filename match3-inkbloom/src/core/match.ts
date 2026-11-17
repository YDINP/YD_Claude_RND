import { blend } from './color'
import { BRUSH, EMPTY, KIND_NORMAL, colorOf, isColored, kindOf, makePiece, type Cell, type MatchGroup } from './types'
import { H, MIN_MATCH, N, W } from './constants'

export interface Run { cells: Cell[]; horiz: boolean; color: number }
export interface GroupInfo extends MatchGroup { runs: Run[]; mixed: boolean }

export function findRuns(p: ArrayLike<number>): Run[] {
  const runs: Run[] = []
  const scan = (outer: number, inner: number, idx: (o: number, i: number) => Cell, horiz: boolean): void => {
    for (let o = 0; o < outer; o++) {
      let i = 0
      while (i < inner) {
        const v = p[idx(o, i)]!
        const ok = isColored(v)
        let j = i + 1
        if (ok) while (j < inner && isColored(p[idx(o, j)]!) && colorOf(p[idx(o, j)]!) === colorOf(v)) j++
        if (ok && j - i >= MIN_MATCH) {
          const cells: Cell[] = []
          for (let k = i; k < j; k++) cells.push(idx(o, k))
          runs.push({ cells, horiz, color: colorOf(v) })
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
      g = { color: colorOf(p[c]!), cells: [], maxRun: 0, spread: 0, runs: [], mixed: false }
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

export function mixPiece(p: ArrayLike<number>, a: Cell, b: Cell): number {
  const pa = p[a]!
  const pb = p[b]!
  if (!isColored(pa) || !isColored(pb)) return EMPTY
  const color = blend(colorOf(pa), colorOf(pb))
  if (color < 0) return EMPTY
  return makePiece(color, kindOf(pa) !== KIND_NORMAL ? kindOf(pa) : kindOf(pb))
}

export function matchesAfterSwap(p: Int8Array, a: Cell, b: Cell): boolean {
  if (p[a] === BRUSH || p[b] === BRUSH) return true
  const t = p[a]!
  p[a] = p[b]!
  p[b] = t
  const ok = hasMatch(p)
  p[b] = p[a]!
  p[a] = t
  return ok
}

export function eachPair(fn: (a: Cell, b: Cell) => boolean | void): void {
  for (let i = 0; i < N; i++) {
    if (i % W < W - 1 && fn(i, i + 1)) return
    if (i < N - W && fn(i, i + W)) return
  }
}

export function hasMove(p: Int8Array, withMix = true): boolean {
  if (p.includes(BRUSH)) return true
  let found = false
  eachPair((a, b) => (found = matchesAfterSwap(p, a, b) || (withMix && mixPiece(p, a, b) !== EMPTY)))
  return found
}
