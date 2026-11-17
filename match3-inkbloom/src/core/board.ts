import { COLORS, INIT_RETRIES, N, W } from './constants'
import { hasMove } from './match'
import type { Rng } from './rng'
import type { Cell } from './types'

export type Weights = readonly number[]

export function pickColor(rng: Rng, weights: Weights, banned: readonly number[] = []): number {
  let total = 0
  for (let c = 0; c < COLORS; c++) if (!banned.includes(c)) total += weights[c] ?? 0
  if (total <= 0) return rng.int(COLORS)
  let r = rng.next() * total
  for (let c = 0; c < COLORS; c++) {
    if (banned.includes(c)) continue
    r -= weights[c] ?? 0
    if (r < 0) return c
  }
  for (let c = COLORS - 1; c >= 0; c--) if (!banned.includes(c) && (weights[c] ?? 0) > 0) return c
  return 0
}

export function fillColors(p: Int8Array, rng: Rng, weights: Weights): void {
  for (let i = 0; i < N; i++) {
    const banned: number[] = []
    if (i % W >= 2 && p[i - 1] === p[i - 2]) banned.push(p[i - 1]!)
    if (i >= 2 * W && p[i - W] === p[i - 2 * W]) banned.push(p[i - W]!)
    p[i] = pickColor(rng, weights, banned)
  }
}

export function createBoard(rng: Rng, weights: Weights): Int8Array {
  const p = new Int8Array(N)
  for (let t = 0; t < INIT_RETRIES; t++) {
    fillColors(p, rng, weights)
    if (hasMove(p, false)) break
  }
  return p
}

export function swapCells(p: Int8Array, a: Cell, b: Cell): void {
  const t = p[a]!
  p[a] = p[b]!
  p[b] = t
}

export function areAdjacent(a: Cell, b: Cell): boolean {
  if (a < 0 || b < 0 || a >= N || b >= N) return false
  const dr = Math.abs(Math.floor(a / W) - Math.floor(b / W))
  const dc = Math.abs((a % W) - (b % W))
  return dr + dc === 1
}
