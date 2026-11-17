import { BRUSH_RUN, COLORS, H, W } from './constants'
import { findGroups } from './match'
import type { Rng } from './rng'
import { stepPoints } from './score'
import { planStains } from './stain'
import { BRUSH, EMPTY, type BrushFire, type Cell, type ClearEvent, type TurnEvent } from './types'

export interface State { pieces: Int8Array; floor: Int8Array; rng: Rng }
export interface StepInput { chain: number; swapped: Cell[]; fires: BrushFire[]; fired: Cell[] }

export function rowFire(at: Cell, color: number): BrushFire {
  const r = Math.floor(at / W)
  const cells: Cell[] = []
  for (let c = 0; c < W; c++) cells.push(r * W + c)
  return { at, color, cells, cross: false }
}

export function crossFire(at: Cell, color: number): BrushFire {
  const r = Math.floor(at / W)
  const col = at % W
  const set = new Set<Cell>()
  for (let c = 0; c < W; c++) set.add(r * W + c)
  for (let rr = 0; rr < H; rr++) set.add(rr * W + col)
  return { at, color, cells: [...set], cross: true }
}

export function resolveStep(st: State, input: StepInput): ClearEvent | null {
  const { pieces, floor } = st
  const infos = findGroups(pieces)
  if (infos.length === 0 && input.fires.length === 0) return null

  const fires: BrushFire[] = []
  const fired = new Set<Cell>(input.fired)
  const queue = [...input.fires]
  const fireCells = new Set<Cell>()
  for (let qi = 0; qi < queue.length; qi++) {
    const f = queue[qi]!
    fires.push(f)
    for (const cell of f.cells) {
      fireCells.add(cell)
      if (pieces[cell] === BRUSH && !fired.has(cell)) {
        fired.add(cell)
        queue.push(rowFire(cell, f.color))
      }
    }
  }

  const created: { cell: Cell; piece: number }[] = []
  for (const g of infos) {
    if (g.mixed || g.maxRun < BRUSH_RUN) continue
    const run = g.runs.reduce((best, r) => (r.cells.length > best.cells.length ? r : best))
    const swappedIn = [...input.swapped].reverse().find((c) => run.cells.includes(c))
    const cell = swappedIn ?? run.cells[Math.floor(run.cells.length / 2)]!
    if (!fireCells.has(cell)) created.push({ cell, piece: BRUSH })
  }

  const clearedSet = new Set<Cell>()
  for (const g of infos) for (const c of g.cells) clearedSet.add(c)
  for (const c of fireCells) clearedSet.add(c)
  for (const c of created) clearedSet.delete(c.cell)
  const cleared = [...clearedSet].sort((x, y) => x - y)

  const groups = infos.map(({ color, cells, maxRun, spread }) => ({ color, cells, maxRun, spread }))
  const stains = planStains(floor, groups, fires)
  const points = stepPoints(floor, stains, cleared, input.chain)
  for (const s of stains) floor[s.cell] = s.to
  for (const c of cleared) pieces[c] = EMPTY
  for (const c of created) pieces[c.cell] = c.piece
  return { k: 'clear', chain: input.chain, groups, brushes: fires, cleared, stains, created, points }
}

export function applyGravity(p: Int8Array): { from: Cell; to: Cell }[] {
  const moves: { from: Cell; to: Cell }[] = []
  for (let c = 0; c < W; c++) {
    let write = H - 1
    for (let r = H - 1; r >= 0; r--) {
      const from = r * W + c
      if (p[from] === EMPTY) continue
      if (r !== write) {
        const to = write * W + c
        p[to] = p[from]!
        p[from] = EMPTY
        moves.push({ from, to })
      }
      write--
    }
  }
  return moves
}

export function refill(p: Int8Array, rng: Rng): Extract<TurnEvent, { k: 'refill' }>['spawns'] {
  const spawns: Extract<TurnEvent, { k: 'refill' }>['spawns'] = []
  for (let c = 0; c < W; c++) {
    let k = 0
    while (k < H && p[k * W + c] === EMPTY) k++
    for (let r = 0; r < k; r++) {
      const piece = rng.int(COLORS)
      p[r * W + c] = piece
      spawns.push({ cell: r * W + c, piece, rowsAbove: k })
    }
  }
  return spawns
}
