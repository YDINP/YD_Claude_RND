import { Game } from '../src/core/game'
import { GOAL_PCT, MOVES, N, W } from '../src/core/constants'

const GAMES = Number(process.argv[2] ?? 500)

function bestSwap(g: Game, salt: number): [number, number] | null {
  let best: [number, number] | null = null
  let bestScore = -1
  for (let i = 0; i < N; i++) {
    for (const d of [1, W]) {
      const j = i + d
      if (j >= N || (d === 1 && i % W === W - 1)) continue
      const probe = g.clone(salt + i * 131 + d)
      const before = probe.stainedCount()
      const res = probe.trySwap(i, j)
      const first = res.events[0]
      if (!first || first.k !== 'swap' || !first.valid) continue
      const value = (probe.stainedCount() - before) * 1000 + probe.score - g.score
      if (value > bestScore) {
        bestScore = value
        best = [i, j]
      }
    }
  }
  return best
}

let wins = 0
let stainedSum = 0
for (let n = 0; n < GAMES; n++) {
  const g = new Game(1000 + n)
  while (g.status === 'playing') {
    const mv = bestSwap(g, n * 7919 + g.movesLeft)
    if (!mv) break
    g.trySwap(mv[0], mv[1])
  }
  if (g.status === 'win') wins++
  stainedSum += g.stainedCount()
}
const rate = (wins / GAMES) * 100
console.log(`games=${GAMES} moves=${MOVES} goal=${GOAL_PCT}%`)
console.log(`win rate: ${rate.toFixed(1)}% (target 30~60%), avg stained: ${(stainedSum / GAMES).toFixed(1)}/${N}`)
