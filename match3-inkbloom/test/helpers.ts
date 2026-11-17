import { Game } from '../src/core/game'
import { H, W } from '../src/core/constants'
import { BRUSH, type ClearEvent, type TurnEvent } from '../src/core/types'

export const B = BRUSH
export const cell = (r: number, c: number): number => r * W + c

function board(fill: (r: number, c: number) => number, over: Record<string, number>): Int8Array {
  const p = new Int8Array(W * H)
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) p[cell(r, c)] = fill(r, c)
  for (const [k, v] of Object.entries(over)) {
    const [r, c] = k.split(',').map(Number) as [number, number]
    p[cell(r, c)] = v
  }
  return p
}

export const baseBoard = (over: Record<string, number> = {}): Int8Array => board((r, c) => (r * 2 + c) % 4, over)

export const secBoard = (over: Record<string, number> = {}): Int8Array => board((r, c) => 3 + ((r + c) % 3), over)

export function makeGame(over: Record<string, number> = {}, opts: { moves?: number; seed?: number; level?: number; sec?: boolean } = {}): Game {
  const g = new Game(opts.seed ?? 1, opts.level ?? 0)
  g.pieces.set(opts.sec ? secBoard(over) : baseBoard(over))
  if (opts.moves !== undefined) g.movesLeft = opts.moves
  return g
}

export const mixGame = (over: Record<string, number> = {}, opts: { moves?: number; seed?: number; level?: number } = {}): Game => makeGame(over, { ...opts, sec: true })

export const rowCells = (r: number): number[] => Array.from({ length: W }, (_, c) => cell(r, c))
export const colCells = (c: number): number[] => Array.from({ length: H }, (_, r) => cell(r, c))

export const clears = (events: TurnEvent[]): ClearEvent[] => events.filter((e): e is ClearEvent => e.k === 'clear')

export function allPairs(): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < W * H; i++) {
    if (i % W < W - 1) out.push([i, i + 1])
    if (i < W * H - W) out.push([i, i + W])
  }
  return out
}
