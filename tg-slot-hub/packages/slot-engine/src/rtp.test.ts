import { describe, expect, it } from 'vitest'
import { computeExactRtp, MAX_ENUMERATION_COMBOS, simulate } from './rtp.js'
import { createSeededRng } from './rng/seeded.js'
import { parseGameMath } from './schema.js'
import { makeMutationMath } from './testFixtures.js'

/**
 * 손으로 계산 가능한 모델. 릴 3개 x 심볼 4종, 1행 1라인.
 * P(aaa) = 1/64 -> 8배, P(aa 이후 끊김) = 3/64 -> 2배, P(bbb) = 1/64 -> 4배.
 * 기대값 = (8 + 6 + 4) / 64 = 18/64 = 0.28125
 */
const TINY = parseGameMath({
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
  betLevels: [1, 10],
  rtpTarget: 0.28125,
  volatility: 'high',
})

/** 분산이 작아 몬테카를로가 빠르게 수렴하는 모델. */
const FLAT = parseGameMath({
  id: 'flat',
  reels: 3,
  rows: 1,
  symbols: [
    { id: 'a', name: { en: 'A' } },
    { id: 'b', name: { en: 'B' } },
    { id: 'c', name: { en: 'C' } },
    { id: 'd', name: { en: 'D' } },
  ],
  strips: [
    ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'],
    ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'],
    ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd'],
  ],
  paylines: [[0, 0, 0]],
  paytable: {
    a: { 3: 4, 2: 1 },
    b: { 3: 4, 2: 1 },
    c: { 3: 4, 2: 1 },
    d: { 3: 4, 2: 1 },
  },
  betLevels: [1, 100],
  rtpTarget: 0.4375,
  volatility: 'low',
})

describe('computeExactRtp', () => {
  it('손으로 계산한 RTP와 정확히 일치한다', () => {
    const report = computeExactRtp(TINY, 1)
    expect(report.combos).toBe(64)
    expect(report.rtp).toBeCloseTo(18 / 64, 12)
    expect(report.hitRate).toBeCloseTo(5 / 64, 12)
    expect(report.maxWinMultiplier).toBe(8)
  })

  it('승리 분포 버킷의 RTP 기여 합이 전체 RTP와 같다', () => {
    const report = computeExactRtp(TINY, 1)
    expect(report.winDistribution.map((bucket) => bucket.multiplier)).toEqual([2, 4, 8])
    expect(report.winDistribution.map((bucket) => bucket.combos)).toEqual([3, 1, 1])
    const total = report.winDistribution.reduce((acc, bucket) => acc + bucket.rtpShare, 0)
    expect(total).toBeCloseTo(report.rtp, 12)
  })

  it('베팅액이 달라도 RTP는 같다', () => {
    expect(computeExactRtp(TINY, 10).rtp).toBeCloseTo(computeExactRtp(TINY, 1).rtp, 12)
  })

  it('작은 모델은 전수 조사 경로를 쓴다', () => {
    const report = computeExactRtp(TINY, 1)
    expect(report.method).toBe('enumerate')
    expect(report.distributionIsExact).toBe(true)
    expect(report.breakdown.lines).toBeCloseTo(report.rtp, 12)
    expect(report.breakdown.scatter).toBe(0)
    expect(report.breakdown.freeSpins).toBe(0)
  })

  it('조합 수가 상한을 넘으면 해석 경로로 넘어가고 값이 일치한다', () => {
    const symbols = ['a', 'b', 'c', 'd']
    const strip = Array.from({ length: 200 }, (_, i) => symbols[i % symbols.length] ?? 'a')
    const huge = parseGameMath({
      ...JSON.parse(JSON.stringify(TINY)),
      strips: [strip, strip, strip],
    })
    expect(strip.length ** 3).toBeGreaterThan(MAX_ENUMERATION_COMBOS)
    const report = computeExactRtp(huge, 1, { sampleSpins: 0 })
    expect(report.method).toBe('analytic')
    expect(report.distributionIsExact).toBe(false)
    // 스트립 구성이 TINY와 같은 균등 분포라 RTP도 같아야 한다.
    expect(report.rtp).toBeCloseTo(18 / 64, 12)
  })

  it('해석 경로도 표본을 요청하면 적중률을 채운다', () => {
    const symbols = ['a', 'b', 'c', 'd']
    const strip = Array.from({ length: 200 }, (_, i) => symbols[i % symbols.length] ?? 'a')
    const huge = parseGameMath({
      ...JSON.parse(JSON.stringify(TINY)),
      strips: [strip, strip, strip],
    })
    const report = computeExactRtp(huge, 1, { sampleSpins: 20_000 })
    expect(report.hitRate).toBeGreaterThan(0.05)
    expect(report.hitRate).toBeLessThan(0.11)
    expect(report.winDistribution.length).toBeGreaterThan(0)
  })
})

describe('simulate', () => {
  it('20만 스핀이면 전수 조사 RTP에 1% 안으로 수렴한다', () => {
    const exact = computeExactRtp(FLAT, 100)
    const report = simulate(FLAT, 100, 200_000, createSeededRng('converge'))
    expect(report.spins).toBe(200_000)
    expect(Math.abs(report.rtp - exact.rtp) / exact.rtp).toBeLessThan(0.01)
    expect(Math.abs(report.hitRate - exact.hitRate) / exact.hitRate).toBeLessThan(0.01)
  })

  it('같은 시드는 같은 시뮬레이션 결과를 만든다', () => {
    const a = simulate(TINY, 10, 5_000, createSeededRng('same'))
    const b = simulate(TINY, 10, 5_000, createSeededRng('same'))
    expect(a.rtp).toBe(b.rtp)
    expect(a.hitRate).toBe(b.hitRate)
    expect(a.maxWin).toBe(b.maxWin)
  })

  it('표준편차와 소요 시간을 보고한다', () => {
    const report = simulate(FLAT, 100, 20_000, createSeededRng('stats'))
    expect(report.stdDev).toBeGreaterThan(0)
    expect(report.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('스핀 수가 0 이하면 예외', () => {
    expect(() => simulate(TINY, 1, 0, createSeededRng('x'))).toThrow(RangeError)
  })
})

describe('RTP 경로 선택', () => {
  it('미스터리만 있으면 해석 경로를 쓴다', () => {
    const math = makeMutationMath()
    const report = computeExactRtp(math, 3, { sampleSpins: 0 })
    expect(report.method).toBe('analytic')
  })

  it('미스터리 해석값이 몬테카를로와 3 표준오차 안에서 맞는다', () => {
    const math = makeMutationMath()
    const spins = 400_000
    const analytic = computeExactRtp(math, 3, { sampleSpins: 0 })
    const mc = simulate(math, 3, spins, createSeededRng('mystery-cross'))
    const standardError = mc.stdDev / Math.sqrt(spins)
    expect(Math.abs(mc.rtp - analytic.rtp)).toBeLessThan(3 * standardError)
  })

  it('확장 와일드가 있으면 몬테카를로로 넘어간다', () => {
    const math = makeMutationMath({
      mutations: [{ type: 'expandWild', symbol: 'w', reels: [1], minCount: 1 }],
    })
    const report = computeExactRtp(math, 3, { mcSpins: 50_000, mcSeed: 'exp' })
    expect(report.method).toBe('monte-carlo')
    expect(report.monteCarlo).toMatchObject({ spins: 50_000, seed: 'exp' })
    expect(report.monteCarlo?.stdErr).toBeGreaterThan(0)
    const ci = report.monteCarlo?.ci95
    expect(ci?.[0]).toBeLessThan(report.rtp)
    expect(ci?.[1]).toBeGreaterThan(report.rtp)
  })

  it('랜덤 와일드 드롭도 몬테카를로다', () => {
    const math = makeMutationMath({
      mutations: [{ type: 'randomWild', symbol: 'w', chance: 0.2, countWeights: { 1: 1 }, reels: [0, 1] }],
    })
    expect(computeExactRtp(math, 3, { mcSpins: 20_000 }).method).toBe('monte-carlo')
  })

  it('몬테카를로 경로는 같은 시드면 같은 값을 낸다', () => {
    const math = makeMutationMath({
      mutations: [{ type: 'randomWild', symbol: 'w', chance: 0.2, countWeights: { 1: 1 } }],
    })
    const first = computeExactRtp(math, 3, { mcSpins: 30_000, mcSeed: 'fixed' })
    const second = computeExactRtp(math, 3, { mcSpins: 30_000, mcSeed: 'fixed' })
    expect(second.rtp).toBe(first.rtp)
    expect(second.monteCarlo?.stdErr).toBe(first.monteCarlo?.stdErr)
  })

  it('몬테카를로 조각의 합이 전체 RTP와 같다', () => {
    const math = makeMutationMath({
      mutations: [{ type: 'expandWild', symbol: 'w', reels: [0, 1, 2], minCount: 1 }],
    })
    const report = computeExactRtp(math, 3, { mcSpins: 40_000 })
    const sum = report.breakdown.lines + report.breakdown.scatter + report.breakdown.freeSpins
    expect(sum).toBeCloseTo(report.rtp, 10)
  })

  it('표준오차가 스핀 수의 제곱근에 반비례한다', () => {
    const math = makeMutationMath({
      mutations: [{ type: 'randomWild', symbol: 'w', chance: 0.3, countWeights: { 1: 1 } }],
    })
    const small = computeExactRtp(math, 3, { mcSpins: 40_000, mcSeed: 's' })
    const large = computeExactRtp(math, 3, { mcSpins: 160_000, mcSeed: 's' })
    const ratio = (small.monteCarlo?.stdErr ?? 0) / (large.monteCarlo?.stdErr ?? 1)
    expect(ratio).toBeGreaterThan(1.6)
    expect(ratio).toBeLessThan(2.4)
  })
})
