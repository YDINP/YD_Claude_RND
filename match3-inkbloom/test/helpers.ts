import { Game } from '../src/core/game'
import { H, W } from '../src/core/constants'
import { BRUSH, type ClearEvent, type TurnEvent } from '../src/core/types'

export const B = BRUSH
export const cell = (r: number, c: number): number => r * W + c

export function baseBoard(over: Record<string, number> = {}): Int8Array {
  const p = new Int8Array(W * H)
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) p[cell(r, c)] = (r * 2 + c) % 4
  for (const [k, v] of Object.entries(over)) {
    const [r, c] = k.split(',').map(Number) as [number, number]
    p[cell(r, c)] = v
  }
  return p
}

export function makeGame(over: Record<string, number> = {}, opts: { moves?: number; seed?: number; level?: number } = {}): Game {
  const g = new Game(opts.seed ?? 1, opts.level ?? 0)
  g.pieces.set(baseBoard(over))
  if (opts.moves !== undefined) g.movesLeft = opts.moves
  return g
}

export function paintFloor(g: Game, cells: number[], floor: number, base = floor): void {
  for (const c of cells) {
    g.floor[c] = floor
    g.base[c] = base
  }
}

export const rowCells = (r: number): number[] => Array.from({ length: W }, (_, c) => cell(r, c))
export const colCells = (c: number): number[] => Array.from({ length: H }, (_, r) => cell(r, c))
export const allCells = (): number[] => Array.from({ length: W * H }, (_, i) => i)

export const clears = (events: TurnEvent[]): ClearEvent[] => events.filter((e): e is ClearEvent => e.k === 'clear')
