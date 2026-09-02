import { describe, expect, it } from 'vitest'
import {
  computeAnalyticRtp,
  expectedFreeSpinsPerTrigger,
  expectedLineMultiplier,
  scatterCountDistribution,
  scatterWindowDistribution,
  symbolFrequencies,
} from './analytic.js'
import { computeExactRtp, simulate } from './rtp.js'
import { createSeededRng } from './rng/seeded.js'
import { parseGameMath } from './schema.js'
import { makeScatterMath, makeTestMath } from './testFixtures.js'

const scatterMath = makeScatterMath()

describe('symbolFrequencies', () => {
  it('스트립 빈도를 확률로 바꾼다', () => {
    const frequencies = symbolFrequencies(scatterMath)
    expect(frequencies[0]?.get('a')).toBeCloseTo(2 / 6, 12)
    expect(frequencies[0]?.get('s')).toBeCloseTo(1 / 6, 12)
    const sum = [...(frequencies[0]?.values() ?? [])].reduce((acc, p) => acc + p, 0)
    expect(sum).toBeCloseTo(1, 12)
  })
})

describe('scatterWindowDistribution', () => {
  it('창 안 스캐터 개수 분포를 정확히 센다', () => {
    // 길이 6에 스캐터 1개. 3칸 창은 6개 정지 위치 중 3개에서 스캐터를 문다.
    const distribution = scatterWindowDistribution(['w', 'a', 'b', 's', 'a', 'b'], 3, 's')
    expect(distribution[0]).toBeCloseTo(3 / 6, 12)
    expect(distribution[1]).toBeCloseTo(3 / 6, 12)
    expect(distribution[2]).toBe(0)
    expect(distribution[3]).toBe(0)
  })

  it('스캐터가 붙어 있으면 창 하나에 여러 개가 들어간다', () => {
    const distribution = scatterWindowDistribution(['s', 's', 'a', 'b', 'a', 'b'], 3, 's')
    expect(distribution[2]).toBeCloseTo(2 / 6, 12)
    expect(distribution.reduce((acc, p) => acc + p, 0)).toBeCloseTo(1, 12)
  })

  it('스캐터가 없으면 전부 0개', () => {
    const distribution = scatterWindowDistribution(['a', 'b', 'a', 'b'], 3, 's')
    expect(distribution[0]).toBeCloseTo(1, 12)
  })
})

describe('scatterCountDistribution', () => {
  it('릴별 분포를 합성하고 합이 1이다', () => {
    const distribution = scatterCountDistribution(scatterMath)
    expect(distribution.reduce((acc, p) => acc + p, 0)).toBeCloseTo(1, 12)
    // 릴마다 1/2 확률로 스캐터 1개. 3릴 모두 물어야 3개가 된다.
    expect(distribution[3]).toBeCloseTo(0.125, 12)
    expect(distribution[0]).toBeCloseTo(0.125, 12)
  })

  it('스캐터가 없는 모델은 항상 0개', () => {
    expect(scatterCountDistribution(makeTestMath())).toEqual([1])
  })
})

describe('expectedFreeSpinsPerTrigger', () => {
  it('리트리거가 없으면 부여 횟수 그대로', () => {
    expect(expectedFreeSpinsPerTrigger(10, 0.01, false)).toBe(10)
  })

  it('리트리거가 있으면 등비급수만큼 늘어난다', () => {
    // count / (1 - count * p) = 10 / (1 - 0.1) = 11.111...
    expect(expectedFreeSpinsPerTrigger(10, 0.01, true)).toBeCloseTo(10 / 0.9, 12)
  })

  it('발산하는 설정은 예외', () => {
    expect(() => expectedFreeSpinsPerTrigger(10, 0.1, true)).toThrow(RangeError)
    expect(() => expectedFreeSpinsPerTrigger(10, 0.5, true)).toThrow(RangeError)
  })
})

describe('expectedLineMultiplier', () => {
  it('손으로 계산 가능한 모델과 일치한다', () => {
    // 3릴 x 심볼 4종, 1행 1라인. P(aaa)=1/64 -> 8배, P(aa 후 끊김)=3/64 -> 2배, P(bbb)=1/64 -> 4배
    const tiny = parseGameMath({
      id: 'tiny',
      reels: 3,
      rows: 1,
      symbols: [
        { id: 'a', name: { en: 'A' } },
        { id: 'b', name: { en: 'B' } },
        { id: 'c', name: { en: 'C' } },
        { id: 'd', name: { en: 'D' } },
      ],
      strips: [
        ['a', 'b', 'c', 'd'],
        ['a', 'b', 'c', 'd'],
        ['a', 'b', 'c', 'd'],
      ],
      paylines: [[0, 0, 0]],
      paytable: { a: { 3: 8, 2: 2 }, b: { 3: 4 } },
      betLevels: [1],
      rtpTarget: 0.28125,
      volatility: 'high',
    })
    expect(expectedLineMultiplier(tiny)).toBeCloseTo(18 / 64, 12)
  })

  it('전수 조사 RTP와 정확히 같다 (그룹·1개 배당 포함)', () => {
    const math = makeTestMath({
      groups: { anyab: { name: { en: 'Any AB' }, members: ['a', 'b'] } },
      paytable: { w: { 3: 100 }, a: { 1: 1, 2: 2, 3: 10 }, b: { 3: 5 }, anyab: { 3: 3 } },
    })
    const enumerated = computeExactRtp(math, 3)
    expect(expectedLineMultiplier(math)).toBeCloseTo(enumerated.breakdown.lines, 12)
  })
})

describe('computeAnalyticRtp', () => {
  it('전수 조사와 조각별로 정확히 일치한다', () => {
    const enumerated = computeExactRtp(scatterMath, 3)
    const analytic = computeAnalyticRtp(scatterMath, 3)
    expect(enumerated.method).toBe('enumerate')
    expect(analytic.breakdown.lines).toBeCloseTo(enumerated.breakdown.lines, 12)
    expect(analytic.breakdown.scatter).toBeCloseTo(enumerated.breakdown.scatter, 12)
    expect(analytic.breakdown.freeSpins).toBeCloseTo(enumerated.breakdown.freeSpins, 12)
    expect(analytic.rtp).toBeCloseTo(enumerated.rtp, 12)
    expect(analytic.triggerProbability).toBeCloseTo(enumerated.triggerProbability, 12)
  })

  it('조각의 합이 전체 RTP다', () => {
    const analytic = computeAnalyticRtp(scatterMath, 3)
    const sum = analytic.breakdown.lines + analytic.breakdown.scatter + analytic.breakdown.freeSpins
    expect(sum).toBeCloseTo(analytic.rtp, 12)
    expect(analytic.breakdown.freeSpins).toBeGreaterThan(0)
  })

  it('베팅액이 달라도 RTP가 같다', () => {
    expect(computeAnalyticRtp(scatterMath, 30).rtp).toBeCloseTo(computeAnalyticRtp(scatterMath, 3).rtp, 12)
  })

  it('스캐터가 없으면 라인만 남는다', () => {
    const analytic = computeAnalyticRtp(makeTestMath(), 3)
    expect(analytic.breakdown.scatter).toBe(0)
    expect(analytic.breakdown.freeSpins).toBe(0)
    expect(analytic.triggerProbability).toBe(0)
  })

  it('나누어떨어지지 않는 베팅액은 예외', () => {
    expect(() => computeAnalyticRtp(scatterMath, 4)).toThrow(RangeError)
  })

  it('몬테카를로가 해석값의 3 표준오차 안으로 들어온다', () => {
    const spins = 300_000
    const analytic = computeAnalyticRtp(scatterMath, 3)
    const mc = simulate(scatterMath, 3, spins, createSeededRng('analytic-cross-check'))
    const standardError = mc.stdDev / Math.sqrt(spins)
    expect(Math.abs(mc.rtp - analytic.rtp)).toBeLessThan(3 * standardError)
  })

  it('몬테카를로의 트리거 비율이 해석값과 맞는다', () => {
    const spins = 200_000
    const analytic = computeAnalyticRtp(scatterMath, 3)
    const mc = simulate(scatterMath, 3, spins, createSeededRng('trigger-rate'))
    expect(mc.triggerRate).toBeCloseTo(analytic.triggerProbability, 2)
  })

  it('몬테카를로의 프리스핀 횟수가 해석값과 맞는다', () => {
    const spins = 200_000
    const analytic = computeAnalyticRtp(scatterMath, 3)
    const mc = simulate(scatterMath, 3, spins, createSeededRng('free-spin-count'))
    const expectedPerPaidSpin = analytic.triggerProbability * analytic.expectedFreeSpinsPerTrigger
    expect(mc.freeSpinsPlayed / spins).toBeCloseTo(expectedPerPaidSpin, 1)
  })
})
