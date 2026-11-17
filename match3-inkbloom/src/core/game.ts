import { areAdjacent, createBoard, swapCells } from './board'
import { BONUS_PER_MOVE, COLORS, MAX_CHAIN, N, STAR2_RATIO, STAR3_RATIO } from './constants'
import { levelAt, LEVELS, needsMix, type Level } from './levels'
import { hasMatch, matchesAfterSwap, mixPiece } from './match'
import { reshuffle } from './moves'
import { applyGravity, refill, resolveStep, swapFires, type State } from './resolve'
import { Rng } from './rng'
import { EMPTY, NO_FLOOR, type Cell, type OrderLine, type OrderProgress, type Snapshot, type Status, type TurnEvent, type TurnResult } from './types'

export function orderProgress(collected: ArrayLike<number>, order: OrderLine[]): OrderProgress[] {
  return order.map(({ color, need }) => ({ color, need, have: collected[color] ?? 0 }))
}

export const orderMet = (p: OrderProgress[]): boolean => p.every((x) => x.have >= x.need)

export function starsFor(lv: Level, movesLeft: number, mixes: number): number {
  if (movesLeft < Math.ceil(lv.moves * STAR2_RATIO)) return 1
  const third = needsMix(lv) ? mixes >= lv.mixes : movesLeft >= Math.ceil(lv.moves * STAR3_RATIO)
  return third ? 3 : 2
}

export class Game {
  readonly pieces: Int8Array
  readonly floor: Int8Array
  readonly collected: number[]
  readonly rng: Rng
  readonly level: number
  readonly lv: Level
  readonly order: OrderLine[]
  score = 0
  movesLeft: number
  status: Status = 'playing'
  stars = 0
  mixes = 0

  constructor(seed: number, level = 0) {
    this.rng = new Rng(seed)
    this.level = Math.max(0, Math.min(LEVELS.length - 1, level))
    this.lv = levelAt(this.level)
    this.order = this.lv.order
    this.movesLeft = this.lv.moves
    this.pieces = createBoard(this.rng, this.lv.spawn)
    this.floor = new Int8Array(N).fill(NO_FLOOR)
    this.collected = new Array<number>(COLORS).fill(0)
  }

  clone(seed?: number): Game {
    const g = new Game(0, this.level)
    g.pieces.set(this.pieces)
    g.floor.set(this.floor)
    g.collected.splice(0, COLORS, ...this.collected)
    g.rng.state = seed === undefined ? this.rng.state : seed >>> 0
    g.score = this.score
    g.movesLeft = this.movesLeft
    g.status = this.status
    g.mixes = this.mixes
    return g
  }

  progress(): OrderProgress[] {
    return orderProgress(this.collected, this.order)
  }

  snapshot(): Snapshot {
    return {
      pieces: Array.from(this.pieces),
      floor: Array.from(this.floor),
      collected: [...this.collected],
      score: this.score,
      movesLeft: this.movesLeft,
      mixes: this.mixes,
      status: this.status,
    }
  }

  previewMix(a: Cell, b: Cell): number {
    if (this.status !== 'playing' || !areAdjacent(a, b)) return EMPTY
    if (matchesAfterSwap(this.pieces, a, b)) return EMPTY
    return mixPiece(this.pieces, a, b)
  }

  trySwap(a: Cell, b: Cell): TurnResult {
    const result = (events: TurnEvent[]): TurnResult => ({ events, score: this.score, movesLeft: this.movesLeft })
    if (this.status !== 'playing' || !areAdjacent(a, b)) return result([])

    const init = swapFires(this.pieces, a, b)
    swapCells(this.pieces, a, b)
    let mixed = EMPTY
    if (init.fires.length === 0 && !hasMatch(this.pieces)) {
      swapCells(this.pieces, a, b)
      mixed = mixPiece(this.pieces, a, b)
      if (mixed === EMPTY) return result([{ k: 'swap', a, b, valid: false }])
    }
    this.movesLeft--
    const events: TurnEvent[] = [{ k: 'swap', a, b, valid: true }]
    const swapped = mixed === EMPTY ? [a, b] : [this.mix(a, b, mixed, events)]
    this.cascade(swapped, init, events)
    this.finish(events)
    return result(events)
  }

  private mix(a: Cell, b: Cell, piece: number, events: TurnEvent[]): Cell {
    this.pieces[b] = piece
    this.pieces[a] = EMPTY
    this.mixes++
    events.push({ k: 'mix', from: a, to: b, piece })
    const moves = applyGravity(this.pieces)
    if (moves.length > 0) events.push({ k: 'fall', moves })
    events.push({ k: 'refill', spawns: refill(this.pieces, this.rng, this.lv.spawn) })
    return moves.find((m) => m.from === b)?.to ?? b
  }

  private cascade(swapped: Cell[], init: ReturnType<typeof swapFires>, events: TurnEvent[]): void {
    const st: State = { pieces: this.pieces, floor: this.floor, collected: this.collected }
    for (let chain = 1; chain <= MAX_CHAIN; chain++) {
      const first = chain === 1
      const ev = resolveStep(st, {
        chain,
        swapped: first ? swapped : [],
        fires: first ? init.fires : [],
        fired: first ? init.fired : [],
      })
      if (!ev) break
      events.push(ev)
      this.score += ev.points
      const moves = applyGravity(this.pieces)
      if (moves.length > 0) events.push({ k: 'fall', moves })
      events.push({ k: 'refill', spawns: refill(this.pieces, this.rng, this.lv.spawn) })
    }
  }

  private finish(events: TurnEvent[]): void {
    const progress = this.progress()
    let bonus = 0
    let outcome: 'win' | 'lose' | 'continue' = 'continue'
    if (orderMet(progress)) {
      outcome = 'win'
      bonus = this.movesLeft * BONUS_PER_MOVE
      this.score += bonus
      this.stars = starsFor(this.lv, this.movesLeft, this.mixes)
    } else if (this.movesLeft <= 0) {
      outcome = 'lose'
    }
    if (outcome === 'continue') {
      const sh = reshuffle(this.pieces, this.rng, this.lv.spawn)
      if (sh) events.push({ k: 'shuffle', moves: sh.moves, recolor: sh.recolor })
    } else {
      this.status = outcome
    }
    events.push({ k: 'end', result: outcome, progress, bonus, stars: this.stars, mixes: this.mixes })
  }
}
