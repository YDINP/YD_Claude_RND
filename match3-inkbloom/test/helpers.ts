import { Game } from '../src/core/game'
import { H, W } from '../src/core/constants'
import { BRUSH, type ClearEvent, type TurnEvent } from '../src/core/types'

export const B = BRUSH
export const cell = (r: number, c: number): number => r * W + c

export function baseBoard(over: Record<string, number> = {}): Int8Array {
  const p = new Int8Array(W * H)
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) p[cell(r, c)] = (r * 2 + c) % 5
  for (const [k, v] of Object.entries(over)) {
    const [r, c] = k.split(',').map(Number) as [number, number]
    p[cell(r, c)] = v
  }
  return p
}

export function makeGame(over: Record<string, number> = {}, opts: { moves?: number; seed?: number; floorOff?: number[] } = {}): Game {
  const g = new Game(opts.seed ?? 1)
  g.pieces.set(baseBoard(over))
  if (opts.moves !== undefined) g.movesLeft = opts.moves
  if (opts.floorOff) {
    g.floor.fill(0)
    for (const c of opts.floorOff) g.floor[c] = -1
  }
  return g
}

export const clears = (events: TurnEvent[]): ClearEvent[] => events.filter((e): e is ClearEvent => e.k === 'clear')
