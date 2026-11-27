import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildGrid, createSeededRng, evaluateWays, getBetUnit, parseGameMath, spinUnchecked } from '@tgslot/slot-engine'
import { centerWaysAnalytic } from '../centerWaysAnalytic.js'
import { collectSample, finishSample } from './sampleDistribution.js'
import { frostGates } from './frostStats.js'

const AURORA = parseGameMath(
  JSON.parse(readFileSync(new URL('../../../../games/aurora-ice-palace/math.json', import.meta.url), 'utf8')),
)

/** 손으로 다 셀 수 있는 작은 가운데부터 판(1·2·1칸). */
const TINY = parseGameMath({
  id: 'tiny-center',
  reels: 3,
  rows: 2,
  reelHeights: [1, 2, 1],
  symbols: [
    { id: 'wild', name: { en: 'Wild' }, wild: true },
    { id: 'a', name: { en: 'A' } },
    { id: 'b', name: { en: 'B' } },
    { id: 'c', name: { en: 'C' } },
  ],
  strips: [
    ['a', 'b', 'c', 'a', 'wild'],
    ['a', 'wild', 'b', 'c', 'b', 'a'],
    ['b', 'a', 'a', 'c'],
  ],
  payModel: 'ways',
  ways: { base: 2, betDivisor: 10, from: 'center' },
  paytable: { a: { 3: 30 }, b: { 3: 20 }, c: { 3: 10 } },
  betLevels: [10],
  rtpTarget: 0.9,
  volatility: 'low',
})

describe('centerWaysAnalytic', () => {
  it('작은 판: 전수 조사와 정확히 같다', () => {
    const bet = 10
    const unit = getBetUnit(TINY, bet)
    let total = 0
    let combos = 0
    const [s0, s1, s2] = TINY.strips
    for (let a = 0; a < (s0?.length ?? 0); a += 1) {
      for (let b = 0; b < (s1?.length ?? 0); b += 1) {
        for (let c = 0; c < (s2?.length ?? 0); c += 1) {
          total += evaluateWays(buildGrid(TINY, [a, b, c]), TINY, unit).totalWin
          combos += 1
        }
      }
    }
    expect(centerWaysAnalytic(TINY).lines).toBeCloseTo(total / combos / bet, 12)
  })

  it('aurora 기본 길 몫: 해석식이 몬테카를로 3SE 안', () => {
    const rng = createSeededRng('center-analytic')
    const n = 200_000
    let sum = 0
    let square = 0
    for (let i = 0; i < n; i += 1) {
      const x = spinUnchecked(AURORA, 50, rng).lineWin / 50
      sum += x
      square += x * x
    }
    const mean = sum / n
    const se = Math.sqrt((square / n - mean * mean) / n)
    const analytic = centerWaysAnalytic(AURORA)
    expect(Math.abs(analytic.lines - mean)).toBeLessThan(3 * se)
    expect(Object.values(analytic.bySymbol).reduce((a, b) => a + b, 0)).toBeCloseTo(analytic.lines, 12)
  }, 60_000)
})

describe('frostStats', () => {
  it('표본 리포트: 분해 합 = 전체, 구조 게이트(단계·라운드 길이) 통과', () => {
    const state = collectSample(AURORA, 50, { spins: 40_000, seed: 'frost-stats', skipEngineMc: true, rtpSource: 'sample' })
    const report = finishSample(AURORA, state).frost
    expect(report).toBeDefined()
    if (report === undefined) return
    const b = report.breakdown
    expect(b.baseLine + b.baseScatter + b.freeLine + b.freeScatter + b.bonus).toBeCloseTo(b.total, 9)
    expect(report.rounds).toBeGreaterThan(100)
    expect(report.maxSteps).toBeLessThanOrEqual(17)
    expect(report.longestRound).toBeLessThanOrEqual(20)
    const gates = frostGates(report)
    const structural = gates.filter((gate) => gate.label.includes('hardCap') || gate.label.includes('라운드 판 수') || gate.label.includes('분해 합'))
    expect(structural).toHaveLength(3)
    expect(structural.every((gate) => gate.pass)).toBe(true)
    expect(report.baseCheck.analytic).not.toBeNull()
  }, 60_000)
})
