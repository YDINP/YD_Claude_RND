import { COLORS, INIT_RETRIES, N, W } from './constants'
import { hasMove } from './match'
import type { Rng } from './rng'
import type { Cell } from './types'

export function fillColors(p: Int8Array, rng: Rng): void {
  for (let i = 0; i < N; i++) {
    const banned: number[] = []
    if (i % W >= 2 && p[i - 1] === p[i - 2]) banned.push(p[i - 1]!)
    if (i >= 2 * W && p[i - W] === p[i - 2 * W]) banned.push(p[i - W]!)
    const allowed: number[] = []
    for (let c = 0; c < COLORS; c++) if (!banned.includes(c)) allowed.push(c)
    p[i] = allowed[rng.int(allowed.length)]!
  }
}

export function createBoard(rng: Rng): Int8Array {
  const p = new Int8Array(N)
  for (let t = 0; t < INIT_RETRIES; t++) {
    fillColors(p, rng)
    if (hasMove(p)) break
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
