import { pickColor, type Weights } from './board'
import { BRUSH_RUN, COLORS, H, LINE_RUN, N, W } from './constants'
import { findGroups, type GroupInfo } from './match'
import type { Rng } from './rng'
import { stepPoints } from './score'
import { planStains } from './stain'
import {
  BRUSH, EMPTY, KIND_BUCKET, KIND_COL, KIND_ROW, NO_COLOR, colorOf, isColored, isSpecial, kindOf, makePiece,
  type Cell, type ClearEvent, type Fire, type FireShape, type TurnEvent,
} from './types'

export interface State { pieces: Int8Array; floor: Int8Array; collected: number[] }
export interface StepInput { chain: number; swapped: Cell[]; fires: Fire[]; fired: Cell[] }

const fire = (at: Cell, color: number, shape: FireShape, brush: boolean, cells: Cell[]): Fire => ({ at, color, cells, shape, brush })

export function rowFire(at: Cell, color: number, brush = true): Fire {
  const r = Math.floor(at / W)
  const cells: Cell[] = []
  for (let c = 0; c < W; c++) cells.push(r * W + c)
  return fire(at, color, 'row', brush, cells)
}

export function colFire(at: Cell, color: number): Fire {
  const c = at % W
  const cells: Cell[] = []
  for (let r = 0; r < H; r++) cells.push(r * W + c)
  return fire(at, color, 'col', false, cells)
}

export function boxFire(at: Cell, color: number): Fire {
  const r0 = Math.floor(at / W)
  const c0 = at % W
  const cells: Cell[] = []
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    for (let c = c0 - 1; c <= c0 + 1; c++) if (r >= 0 && r < H && c >= 0 && c < W) cells.push(r * W + c)
  }
  return fire(at, color, 'box', false, cells)
}

export function crossFire(at: Cell, color: number): Fire {
  const r = Math.floor(at / W)
  const col = at % W
  const set = new Set<Cell>()
  for (let c = 0; c < W; c++) set.add(r * W + c)
  for (let rr = 0; rr < H; rr++) set.add(rr * W + col)
  return fire(at, color, 'cross', true, [...set])
}

export function colorFire(at: Cell, color: number, p: ArrayLike<number>): Fire {
  const cells: Cell[] = [at]
  for (let i = 0; i < N; i++) if (i !== at && isColored(p[i]!) && colorOf(p[i]!) === color) cells.push(i)
  return fire(at, color, 'color', true, cells)
}

export function fireFor(at: Cell, piece: number, inherit: number, p: ArrayLike<number>): Fire {
  if (piece === BRUSH) return inherit >= 0 ? colorFire(at, inherit, p) : rowFire(at, NO_COLOR)
  const color = colorOf(piece)
  const kind = kindOf(piece)
  if (kind === KIND_ROW) return rowFire(at, color, false)
  if (kind === KIND_COL) return colFire(at, color)
  return boxFire(at, color)
}

export function swapFires(p: ArrayLike<number>, a: Cell, b: Cell): { fires: Fire[]; fired: Cell[] } {
  const pa = p[a]!
  const pb = p[b]!
  if (pa === BRUSH && pb === BRUSH) return { fires: [crossFire(b, NO_COLOR)], fired: [a, b] }
  if (pa !== BRUSH && pb !== BRUSH) return { fires: [], fired: [] }
  const [brushAt, partnerAt, partner] = pa === BRUSH ? [b, a, pb] : [a, b, pa]
  const after = Array.from(p)
  after[a] = pb
  after[b] = pa
  const fires = [colorFire(brushAt, colorOf(partner), after)]
  const fired = [brushAt]
  if (isSpecial(partner)) {
    fires.push(fireFor(partnerAt, partner, colorOf(partner), after))
    fired.push(partnerAt)
  }
  return { fires, fired }
}

function collectFires(pieces: Int8Array, infos: GroupInfo[], input: StepInput): Fire[] {
  const fired = new Set<Cell>(input.fired)
  const queue = [...input.fires]
  const trigger = (cell: Cell, inherit: number): void => {
    const p = pieces[cell]!
    if (!isSpecial(p) || fired.has(cell)) return
    fired.add(cell)
    queue.push(fireFor(cell, p, inherit, pieces))
  }
  for (const g of infos) for (const c of g.cells) trigger(c, g.color)
  for (let qi = 0; qi < queue.length; qi++) for (const cell of queue[qi]!.cells) trigger(cell, queue[qi]!.color)
  return queue
}

function specialFor(g: GroupInfo, swapped: Cell[]): { cell: Cell; piece: number } | null {
  const run = g.runs.reduce((best, r) => (r.cells.length > best.cells.length ? r : best))
  const pick = (cells: Cell[], fallback: Cell): Cell => [...swapped].reverse().find((c) => cells.includes(c)) ?? fallback
  const mid = run.cells[Math.floor(run.cells.length / 2)]!
  if (g.maxRun >= BRUSH_RUN) return { cell: pick(run.cells, mid), piece: BRUSH }
  if (g.mixed) {
    const hs = new Set(g.runs.filter((r) => r.horiz).flatMap((r) => r.cells))
    const corner = g.runs.filter((r) => !r.horiz).flatMap((r) => r.cells).find((c) => hs.has(c)) ?? g.cells[0]!
    return { cell: pick(g.cells, corner), piece: makePiece(g.color, KIND_BUCKET) }
  }
  if (g.maxRun === LINE_RUN) return { cell: pick(run.cells, mid), piece: makePiece(g.color, run.horiz ? KIND_COL : KIND_ROW) }
  return null
}

export function resolveStep(st: State, input: StepInput): ClearEvent | null {
  const { pieces, floor } = st
  const infos = findGroups(pieces)
  if (infos.length === 0 && input.fires.length === 0) return null

  const fires = collectFires(pieces, infos, input)
  const fireCells = new Set<Cell>()
  for (const f of fires) for (const c of f.cells) fireCells.add(c)

  const created: { cell: Cell; piece: number }[] = []
  for (const g of infos) {
    const sp = specialFor(g, input.swapped)
    if (sp && !fireCells.has(sp.cell)) created.push(sp)
  }

  const clearedSet = new Set<Cell>()
  for (const g of infos) for (const c of g.cells) clearedSet.add(c)
  for (const c of fireCells) clearedSet.add(c)
  for (const c of created) clearedSet.delete(c.cell)
  const cleared = [...clearedSet].sort((x, y) => x - y)

  const groups = infos.map(({ color, cells, maxRun, spread }) => ({ color, cells, maxRun, spread }))
  const stains = planStains(floor, pieces, groups, fires)
  const collected = new Array<number>(COLORS).fill(0)
  const popped = new Set<Cell>(fireCells)
  for (const g of infos) for (const c of g.cells) popped.add(c)
  let count = 0
  for (const c of popped) {
    const p = pieces[c]!
    if (!isColored(p)) continue
    collected[colorOf(p)]!++
    st.collected[colorOf(p)]!++
    count++
  }
  for (const s of stains) floor[s.cell] = s.to
  for (const c of cleared) pieces[c] = EMPTY
  for (const c of created) pieces[c.cell] = c.piece
  return { k: 'clear', chain: input.chain, groups, fires, cleared, stains, created, collected, points: stepPoints(count, input.chain) }
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

export function refill(p: Int8Array, rng: Rng, weights: Weights): Extract<TurnEvent, { k: 'refill' }>['spawns'] {
  const spawns: Extract<TurnEvent, { k: 'refill' }>['spawns'] = []
  for (let c = 0; c < W; c++) {
    let k = 0
    while (k < H && p[k * W + c] === EMPTY) k++
    for (let r = 0; r < k; r++) {
      const piece = pickColor(rng, weights)
      p[r * W + c] = piece
      spawns.push({ cell: r * W + c, piece, rowsAbove: k })
    }
  }
  return spawns
}
