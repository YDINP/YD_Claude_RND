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
import { buildGrid, getBetUnit, resolveSpin } from './spin.js'
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

describe('프리스핀 닫힌 식 (손계산 픽스처)', () => {
  // 2릴 1행. 릴마다 스트립 4칸 중 a 2칸, b 1칸, s(스캐터) 1칸.
  // 손으로 셀 수 있는 값만 나온다:
  //   P(a a) = 1/2 x 1/2 = 1/4        -> 라인 = 1/4 x 1 = 0.25
  //   P(스캐터 2개) = 1/4 x 1/4 = 1/16 -> 스캐터 = 1/16 x 2 = 0.125
  //   base = 0.375, 트리거 확률 p = 1/16, count = 2, 배수 = 3
  const tiny = parseGameMath({
    id: 'tiny-free',
    reels: 2,
    rows: 1,
    symbols: [
      { id: 'a', name: { en: 'Alpha' } },
      { id: 'b', name: { en: 'Beta' } },
      { id: 's', name: { en: 'Star' }, scatter: true },
    ],
    strips: [
      ['a', 'a', 'b', 's'],
      ['a', 'a', 'b', 's'],
    ],
    paylines: [[0, 0]],
    paytable: { a: { 2: 1 } },
    scatter: {
      symbol: 's',
      pays: { 2: 2 },
      freeSpins: { trigger: 2, count: 2, multiplier: 3, retrigger: true },
    },
    betLevels: [1, 10],
    rtpTarget: 0.5,
    volatility: 'medium',
  })

  const TRIGGER_P = 1 / 16
  const FREE_COUNT = 2
  const FREE_MULTIPLIER = 3

  it('손으로 센 값과 조각별로 맞는다', () => {
    const report = computeAnalyticRtp(tiny, 1)
    expect(report.breakdown.lines).toBeCloseTo(0.25, 12)
    expect(report.breakdown.scatter).toBeCloseTo(0.125, 12)
    expect(report.triggerProbability).toBeCloseTo(TRIGGER_P, 12)

    // 트리거 1회가 낳는 기대 스핀 수를 급수로 따로 더한다: Σ_n count x (count x p)^n.
    let pending = FREE_COUNT
    let expectedSpins = 0
    for (let n = 0; n < 500; n += 1) {
      expectedSpins += pending
      pending *= FREE_COUNT * TRIGGER_P
    }
    expect(report.expectedFreeSpinsPerTrigger).toBeCloseTo(expectedSpins, 12)

    const base = 0.25 + 0.125
    expect(report.breakdown.freeSpins).toBeCloseTo(TRIGGER_P * expectedSpins * FREE_MULTIPLIER * base, 12)
    expect(report.rtp).toBeCloseTo(base + TRIGGER_P * expectedSpins * FREE_MULTIPLIER * base, 12)
  })

  it('엔진만으로 라운드 기대값을 수치로 풀어도 같은 값이 나온다', () => {
    // 닫힌 식을 전혀 쓰지 않는 검증 경로다. 모든 정지 조합을 실제로 정산해 표를 만들고,
    // "남은 프리스핀 k회" 상태 위의 확률 질량을 앞으로 굴려 기대 지급을 그냥 더한다.
    const totalBet = 1
    const betUnit = getBetUnit(tiny, totalBet)
    const stops: [number, number][] = []
    for (let left = 0; left < 4; left += 1) {
      for (let right = 0; right < 4; right += 1) stops.push([left, right])
    }

    // 프리스핀 1회의 정지별 결과 (배수 3이 이미 곱해진 지급액과 리트리거 여부).
    const freeOutcomes = stops.map((stop) => {
      const result = resolveSpin(tiny, buildGrid(tiny, stop), stop, totalBet, betUnit, {
        freeSpinsLeft: 5,
        freeSpinsTotal: 5,
        multiplier: FREE_MULTIPLIER,
      })
      return {
        win: result.totalWin,
        retrigger: result.features.some((feature) => feature.type === 'freeSpins' && feature.retrigger),
      }
    })

    // 상태 = 남은 프리스핀 횟수. count회로 시작해 질량이 다 빠질 때까지 굴린다.
    const MAX_STATE = 300
    const STEPS = 2000
    let mass = new Array<number>(MAX_STATE + 1).fill(0)
    mass[FREE_COUNT] = 1
    let freeWinPerTrigger = 0
    for (let step = 0; step < STEPS; step += 1) {
      const next = new Array<number>(MAX_STATE + 1).fill(0)
      let moved = 0
      for (let k = 1; k <= MAX_STATE; k += 1) {
        const here = mass[k] ?? 0
        if (here === 0) continue
        moved += here
        for (const outcome of freeOutcomes) {
          const share = here / freeOutcomes.length
          freeWinPerTrigger += share * outcome.win
          const after = Math.min(MAX_STATE, outcome.retrigger ? k - 1 + FREE_COUNT : k - 1)
          if (after > 0) next[after] = (next[after] ?? 0) + share
        }
      }
      mass = next
      if (moved === 0) break
    }

    let paidSum = 0
    let roundSum = 0
    for (const stop of stops) {
      const result = resolveSpin(tiny, buildGrid(tiny, stop), stop, totalBet, betUnit)
      paidSum += result.totalWin
      roundSum += result.totalWin + (result.nextState === undefined ? 0 : freeWinPerTrigger)
    }

    const report = computeAnalyticRtp(tiny, totalBet)
    expect(paidSum / stops.length / totalBet).toBeCloseTo(
      report.breakdown.lines + report.breakdown.scatter,
      12,
    )
    expect(roundSum / stops.length / totalBet).toBeCloseTo(report.rtp, 12)
  })
})
