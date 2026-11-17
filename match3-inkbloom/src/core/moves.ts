import { fillColors } from './board'
import { INIT_RETRIES, N, SHUFFLE_RETRIES } from './constants'
import { hasMatch, hasMove } from './match'
import type { Rng } from './rng'

export interface ShuffleResult { moves: { from: number; to: number }[]; recolor: boolean }

export function reshuffle(p: Int8Array, rng: Rng): ShuffleResult | null {
  if (hasMove(p)) return null
  const orig = Int8Array.from(p)
  for (let t = 0; t < SHUFFLE_RETRIES; t++) {
    const perm = Array.from({ length: N }, (_, i) => i)
    for (let i = N - 1; i > 0; i--) {
      const j = rng.int(i + 1)
      const x = perm[i]!
      perm[i] = perm[j]!
      perm[j] = x
    }
    for (let i = 0; i < N; i++) p[i] = orig[perm[i]!]!
    if (!hasMatch(p) && hasMove(p)) {
      const moves: { from: number; to: number }[] = []
      for (let i = 0; i < N; i++) if (perm[i] !== i) moves.push({ from: perm[i]!, to: i })
      return { moves, recolor: false }
    }
  }
  for (let t = 0; t < INIT_RETRIES; t++) {
    fillColors(p, rng)
    if (hasMove(p)) break
  }
  return { moves: [], recolor: true }
}
