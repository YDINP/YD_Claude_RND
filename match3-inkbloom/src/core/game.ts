import { areAdjacent, createBoard, swapCells } from './board'
import { BONUS_PER_MOVE, MAX_CHAIN, N } from './constants'
import { levelAt, LEVELS } from './levels'
import { hasMatch } from './match'
import { reshuffle } from './moves'
import { applyGravity, refill, resolveStep, swapFires, type State } from './resolve'
import { Rng } from './rng'
import { NO_FLOOR, type Cell, type OrderLine, type OrderProgress, type Snapshot, type StainChange, type Status, type TurnEvent, type TurnResult } from './types'

export function orderProgress(floor: ArrayLike<number>, order: OrderLine[]): OrderProgress[] {
  return order.map(({ color, need }) => {
    let have = 0
    for (let i = 0; i < floor.length; i++) if (floor[i] === color) have++
    return { color, need, have }
  })
}

export const orderMet = (p: OrderProgress[]): boolean => p.every((x) => x.have >= x.need)

export class Game {
  readonly pieces: Int8Array
  readonly floor: Int8Array
  readonly base: Int8Array
  readonly rng: Rng
  readonly level: number
  readonly order: OrderLine[]
  score = 0
  movesLeft: number
  status: Status = 'playing'

  constructor(seed: number, level = 0) {
    this.rng = new Rng(seed)
    this.level = Math.max(0, Math.min(LEVELS.length - 1, level))
    const lv = levelAt(this.level)
    this.order = lv.order
    this.movesLeft = lv.moves
    this.pieces = createBoard(this.rng)
    this.floor = new Int8Array(N).fill(NO_FLOOR)
    this.base = new Int8Array(N).fill(NO_FLOOR)
  }

  clone(seed?: number): Game {
    const g = new Game(0, this.level)
    g.pieces.set(this.pieces)
    g.floor.set(this.floor)
    g.base.set(this.base)
    g.rng.state = seed === undefined ? this.rng.state : seed >>> 0
    g.score = this.score
    g.movesLeft = this.movesLeft
    g.status = this.status
    return g
  }

  progress(): OrderProgress[] {
    return orderProgress(this.floor, this.order)
  }

  snapshot(): Snapshot {
    return {
      pieces: Array.from(this.pieces),
      floor: Array.from(this.floor),
      base: Array.from(this.base),
      score: this.score,
      movesLeft: this.movesLeft,
      status: this.status,
    }
  }

  previewSwap(a: Cell, b: Cell): StainChange[] | null {
    if (this.status !== 'playing' || !areAdjacent(a, b)) return null
    const st: State = { pieces: Int8Array.from(this.pieces), floor: Int8Array.from(this.floor), base: Int8Array.from(this.base) }
    const init = swapFires(st.pieces, a, b)
    swapCells(st.pieces, a, b)
    if (init.fires.length === 0 && !hasMatch(st.pieces)) return null
    return resolveStep(st, { chain: 1, swapped: [a, b], ...init })?.stains ?? []
  }

  trySwap(a: Cell, b: Cell): TurnResult {
    const result = (events: TurnEvent[]): TurnResult => ({ events, score: this.score, movesLeft: this.movesLeft })
    if (this.status !== 'playing' || !areAdjacent(a, b)) return result([])

    const init = swapFires(this.pieces, a, b)
    swapCells(this.pieces, a, b)
    if (init.fires.length === 0 && !hasMatch(this.pieces)) {
      swapCells(this.pieces, a, b)
      return result([{ k: 'swap', a, b, valid: false }])
    }
    this.movesLeft--
    const events: TurnEvent[] = [{ k: 'swap', a, b, valid: true }]
    const st: State = { pieces: this.pieces, floor: this.floor, base: this.base }

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

    const progress = this.progress()
    let bonus = 0
    let outcome: 'win' | 'lose' | 'continue' = 'continue'
    if (orderMet(progress)) {
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
    events.push({ k: 'end', result: outcome, progress, bonus })
    return result(events)
  }
}
