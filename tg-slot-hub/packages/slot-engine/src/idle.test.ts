import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluateClusters } from './cluster.js'
import { evaluate, evaluateScatter, getWildIds } from './evaluate.js'
import { pickIdleStops } from './idle.js'
import { parseGameMath } from './schema.js'
import { buildGrid, getBetUnit } from './spin.js'
import { evaluateWays } from './ways.js'

const PACKS = [
  'astral-clocktower',
  'candy-cluster-pop',
  'classic-777',
  'fruit-fiesta',
  'royal-diamond-777',
  'sheriff-sixgun',
  'shiba-shrine',
] as const

function load(id: string) {
  return parseGameMath(JSON.parse(readFileSync(new URL(`../../../games/${id}/math.json`, import.meta.url), 'utf8')))
}

describe('pickIdleStops: 첫 방문 대기 화면', () => {
  for (const id of PACKS) {
    it(`${id}: 와일드·스캐터·미스터리가 없고 당첨이 없다`, () => {
      const math = load(id)
      const stops = pickIdleStops(math)
      expect(stops).toHaveLength(math.reels)
      stops.forEach((stop, reel) => {
        expect(stop).toBeGreaterThanOrEqual(0)
        expect(stop).toBeLessThan(math.strips[reel]?.length ?? 0)
      })
      const grid = buildGrid(math, stops)
      const special = new Set<string>(getWildIds(math))
      if (math.scatter) special.add(math.scatter.symbol)
      for (const m of math.mutations ?? []) if (m.type === 'mystery') special.add(m.symbol)
      expect(grid.flat().filter((symbol) => special.has(symbol))).toEqual([])

      const bet = math.betLevels[0] ?? 1
      const unit = getBetUnit(math, bet)
      const wins =
        math.payModel === 'cluster'
          ? evaluateClusters(grid, math, bet, 1).wins
          : math.payModel === 'ways'
            ? evaluateWays(grid, math, unit).wins
            : evaluate(grid, math, unit).wins
      expect(wins).toEqual([])
      expect(evaluateScatter(grid, math, bet).win).toBe(0)
    })
  }

  it('결정적이다(같은 math면 같은 답)', () => {
    const math = load('classic-777')
    expect(pickIdleStops(math)).toEqual(pickIdleStops(math))
  })

  it('정지 위치 0이 와일드인 팩은 0에서 열지 않는다', () => {
    const math = load('fruit-fiesta')
    expect(math.strips.every((strip) => strip[0] === 'wild')).toBe(true)
    expect(pickIdleStops(math)).not.toEqual(math.strips.map(() => 0))
  })
})
