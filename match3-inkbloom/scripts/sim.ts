import { Game } from '../src/core/game'
import { LEVELS } from '../src/core/levels'
import { N, W } from '../src/core/constants'
import type { OrderProgress } from '../src/core/types'

const GAMES = Number(process.argv[2] ?? 200)
const ONLY = process.argv[3] === undefined ? -1 : Number(process.argv[3]) - 1
const TARGET = (i: number): string => (i < 3 ? '>=75' : i < 6 ? '50~65' : '35~50')

const progressValue = (p: OrderProgress[]): number => p.reduce((s, x) => s + Math.min(x.have, x.need) / x.need, 0)

function bestSwap(g: Game, salt: number): [number, number] | null {
  let best: [number, number] | null = null
  let bestScore = -Infinity
  for (let i = 0; i < N; i++) {
    for (const d of [1, W]) {
      const j = i + d
      if (j >= N || (d === 1 && i % W === W - 1)) continue
      const probe = g.clone(salt + i * 131 + d)
      const res = probe.trySwap(i, j)
      const first = res.events[0]
      if (!first || first.k !== 'swap' || !first.valid) continue
      const value = (probe.status === 'win' ? 1e6 : 0) + progressValue(probe.progress()) * 1000 + (probe.score - g.score) * 0.01
      if (value > bestScore) {
        bestScore = value
        best = [i, j]
      }
    }
  }
  return best
}

console.log(`games/level=${GAMES}`)
console.log('level  moves  order                      win%   target')
for (let lv = 0; lv < LEVELS.length; lv++) {
  if (ONLY >= 0 && lv !== ONLY) continue
  let wins = 0
  for (let n = 0; n < GAMES; n++) {
    const g = new Game(1000 + n * 7 + lv * 100003, lv)
    while (g.status === 'playing') {
      const mv = bestSwap(g, n * 7919 + g.movesLeft)
      if (!mv) break
      g.trySwap(mv[0], mv[1])
    }
    if (g.status === 'win') wins++
  }
  const L = LEVELS[lv]!
  const order = L.order.map((o) => `${'RYBOGPM'[o.color]}${o.need}`).join(' ')
  console.log(`${String(lv + 1).padStart(5)}  ${String(L.moves).padStart(5)}  ${order.padEnd(26)} ${((wins / GAMES) * 100).toFixed(1).padStart(5)}  ${TARGET(lv)}`)
}
