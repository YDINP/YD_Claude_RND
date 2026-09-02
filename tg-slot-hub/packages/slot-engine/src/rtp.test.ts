import { describe, expect, it } from 'vitest'
import { computeExactRtp, MAX_ENUMERATION_COMBOS, simulate } from './rtp.js'
import { createSeededRng } from './rng/seeded.js'
import { parseGameMath } from './schema.js'

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
