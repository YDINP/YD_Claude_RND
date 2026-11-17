import { areAdjacent, createBoard, swapCells } from './board'
import { BONUS_PER_MOVE, BRUSH_STAIN_COLOR, MAX_CHAIN, MOVES, N, isGoal } from './constants'
import { hasMatch } from './match'
import { reshuffle } from './moves'
import { applyGravity, crossFire, refill, resolveStep, rowFire } from './resolve'
import { Rng } from './rng'
import { BRUSH, NO_FLOOR, type BrushFire, type Cell, type Snapshot, type Status, type TurnEvent, type TurnResult } from './types'

export class Game {
  readonly pieces: Int8Array
  readonly floor: Int8Array
  readonly rng: Rng
  score = 0
  movesLeft = MOVES
  status: Status = 'playing'

  constructor(seed: number) {
    this.rng = new Rng(seed)
    this.pieces = createBoard(this.rng)
    this.floor = new Int8Array(N).fill(NO_FLOOR)
  }

  clone(seed?: number): Game {
    const g = new Game(0)
    g.pieces.set(this.pieces)
    g.floor.set(this.floor)
    g.rng.state = seed === undefined ? this.rng.state : seed >>> 0
    g.score = this.score
    g.movesLeft = this.movesLeft
    g.status = this.status
    return g
  }

  stainedCount(): number {
    let n = 0
    for (let i = 0; i < N; i++) if (this.floor[i] !== NO_FLOOR) n++
    return n
  }

  snapshot(): Snapshot {
    return {
      pieces: Array.from(this.pieces),
      floor: Array.from(this.floor),
      score: this.score,
      movesLeft: this.movesLeft,
      status: this.status,
    }
  }

  private brushFires(a: Cell, b: Cell): { fires: BrushFire[]; fired: Cell[] } {
    const pa = this.pieces[a]!
    const pb = this.pieces[b]!
    if (pa === BRUSH && pb === BRUSH) return { fires: [crossFire(b, BRUSH_STAIN_COLOR)], fired: [a, b] }
    if (pa === BRUSH) return { fires: [rowFire(b, pb)], fired: [b] }
    if (pb === BRUSH) return { fires: [rowFire(a, pa)], fired: [a] }
    return { fires: [], fired: [] }
  }

  trySwap(a: Cell, b: Cell): TurnResult {
    const result = (events: TurnEvent[]): TurnResult => ({ events, score: this.score, movesLeft: this.movesLeft })
    if (this.status !== 'playing' || !areAdjacent(a, b)) return result([])

    const init = this.brushFires(a, b)
    swapCells(this.pieces, a, b)
    if (init.fires.length === 0 && !hasMatch(this.pieces)) {
      swapCells(this.pieces, a, b)
      return result([{ k: 'swap', a, b, valid: false }])
    }
    this.movesLeft--
    const events: TurnEvent[] = [{ k: 'swap', a, b, valid: true }]
    const st = { pieces: this.pieces, floor: this.floor, rng: this.rng }

    for (let chain = 1; chain <= MAX_CHAIN; chain++) {
      const first = chain === 1
      const ev = resolveStep(st, {
        chain,
        swapped: first ? [a, b] : [],
        fires: first ? init.fires : [],
        fired: first ? init.fired : [],
      })
      if (!ev) break
      events.push(ev)
      this.score += ev.points
      const moves = applyGravity(this.pieces)
      if (moves.length > 0) events.push({ k: 'fall', moves })
      events.push({ k: 'refill', spawns: refill(this.pieces, this.rng) })
    }

    const stained = this.stainedCount()
    let bonus = 0
    let outcome: 'win' | 'lose' | 'continue' = 'continue'
    if (isGoal(stained)) {
      outcome = 'win'
      bonus = this.movesLeft * BONUS_PER_MOVE
      this.score += bonus
    } else if (this.movesLeft <= 0) {
      outcome = 'lose'
    }
    if (outcome === 'continue') {
      const sh = reshuffle(this.pieces, this.rng)
      if (sh) events.push({ k: 'shuffle', moves: sh.moves, recolor: sh.recolor })
    } else {
      this.status = outcome
    }
    events.push({ k: 'end', result: outcome, stained, bonus })
    return result(events)
  }
}
