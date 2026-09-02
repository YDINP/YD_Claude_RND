import { describe, expect, it } from 'vitest'
import { evaluateWays, getBetPerWay } from './ways.js'
import { computeAnalyticRtp, expectedWaysMultiplier } from './analytic.js'
import { computeExactRtp, simulate } from './rtp.js'
import { createSeededRng } from './rng/seeded.js'
import { parseGameMath, safeParseGameMath } from './schema.js'
import { makeGrid, makeWaysMath } from './testFixtures.js'

const math = makeWaysMath()
const BET_PER_WAY = 1

describe('getBetPerWay', () => {
  it('총 베팅액을 betDivisor로 나눈다', () => {
    expect(getBetPerWay(math, 50)).toBe(10)
  })

  it('나누어떨어지지 않으면 예외', () => {
    expect(() => getBetPerWay(math, 7)).toThrow(RangeError)
  })
})

describe('evaluateWays', () => {
  it('릴별 매칭 칸 수의 곱이 경로 수다', () => {
    // 릴0에 a 2개, 릴1에 a 1개, 릴2에 a 1개 -> 2 x 1 x 1 = 2경로, 3연속 배당 100
    const grid = makeGrid([
      ['a', 'a', 'b'],
      ['a', 'b', 'a'],
    ])
    const result = evaluateWays(grid, math, BET_PER_WAY)
    expect(result.wins).toHaveLength(1)
    expect(result.wins[0]).toMatchObject({ symbol: 'a', count: 3, ways: 2, multiplier: 100, win: 200 })
    expect(result.totalWin).toBe(200)
  })

  it('끊기면 거기까지만 곱한다', () => {
    // 릴0 a 2개, 릴1 a 2개, 릴2 a 0개 -> 4경로, 2연속 배당 10
    const grid = makeGrid([
      ['a', 'a', 'b'],
      ['a', 'a', 'b'],
    ])
    const result = evaluateWays(grid, math, BET_PER_WAY)
    expect(result.wins[0]).toMatchObject({ symbol: 'a', count: 2, ways: 4, multiplier: 10, win: 40 })
  })

  it('릴 0이 비면 지급하지 않는다', () => {
    const grid = makeGrid([
      ['b', 'a', 'a'],
      ['b', 'a', 'a'],
    ])
    const result = evaluateWays(grid, math, BET_PER_WAY)
    expect(result.wins.some((win) => win.symbol === 'a')).toBe(false)
  })

  it('와일드가 릴 카운트에 합산된다', () => {
    // 릴1의 와일드가 a로 세어져 2 x 2 x 1 = 4경로
    const grid = makeGrid([
      ['a', 'w', 'a'],
      ['a', 'a', 'b'],
    ])
    const result = evaluateWays(grid, math, BET_PER_WAY)
    const aWin = result.wins.find((win) => win.symbol === 'a')
    expect(aWin).toMatchObject({ ways: 4, count: 3, multiplier: 100 })
  })

  it('가득 찬 5x3 그리드는 정확히 243 경로다', () => {
    const full = parseGameMath({
      id: 'full',
      reels: 5,
      rows: 3,
      payModel: 'ways',
      ways: { base: 243, betDivisor: 25 },
      symbols: [
        { id: 'w', name: { en: 'Wild' }, wild: true },
        { id: 'a', name: { en: 'Alpha' } },
        { id: 'b', name: { en: 'Beta' } },
      ],
      strips: Array.from({ length: 5 }, () => ['a', 'b', 'w', 'a', 'b']),
      paytable: { a: { 3: 5, 4: 20, 5: 100 } },
      wild: { substitutesFor: 'all' },
      betLevels: [25],
      rtpTarget: 0.9,
      volatility: 'high',
    })
    const grid = makeGrid([
      ['a', 'a', 'a', 'a', 'a'],
      ['a', 'a', 'a', 'a', 'a'],
      ['a', 'a', 'a', 'a', 'a'],
    ])
    const result = evaluateWays(grid, full, 1)
    expect(result.wins[0]).toMatchObject({ ways: 243, count: 5, multiplier: 100, win: 24_300 })
  })

  it('지급 길이가 연속 길이보다 짧으면 지급 길이까지만 곱한다', () => {
    // b는 3연속 배당만 있다. a는 2·3연속 모두 있다.
    const grid = makeGrid([
      ['b', 'b', 'a'],
      ['b', 'b', 'a'],
    ])
    const result = evaluateWays(grid, math, BET_PER_WAY)
    expect(result.wins.some((win) => win.symbol === 'b')).toBe(false)
  })
})

describe('bothWays', () => {
  const both = makeWaysMath({ ways: { base: 8, betDivisor: 5, bothWays: true } })

  it('오른쪽에서도 읽는다', () => {
    // 릴2에 a 2개, 릴1에 a 2개, 릴0에 a 0개 -> 오른쪽 2연속 4경로
    const grid = makeGrid([
      ['b', 'a', 'a'],
      ['b', 'a', 'a'],
    ])
    const result = evaluateWays(grid, both, BET_PER_WAY)
    const win = result.wins.find((entry) => entry.symbol === 'a')
    expect(win).toMatchObject({ direction: 'rtl', ways: 4, count: 2, multiplier: 10 })
  })

  it('전 릴 매칭은 한 번만 센다', () => {
    const grid = makeGrid([
      ['a', 'a', 'a'],
      ['a', 'a', 'a'],
    ])
    const result = evaluateWays(grid, both, BET_PER_WAY)
    const aWins = result.wins.filter((win) => win.symbol === 'a')
    expect(aWins).toHaveLength(1)
    expect(aWins[0]).toMatchObject({ direction: 'ltr', ways: 8, count: 3 })
  })

  it('양쪽이 따로 성립하면 둘 다 지급한다', () => {
    // 릴0 a 2개, 릴1 a 0개, 릴2 a 2개 -> 왼쪽은 1릴뿐이라 무지급, 오른쪽도 1릴뿐
    const grid = makeGrid([
      ['a', 'b', 'a'],
      ['a', 'b', 'a'],
    ])
    const result = evaluateWays(grid, both, BET_PER_WAY)
    expect(result.wins.filter((win) => win.symbol === 'a')).toHaveLength(0)
  })

  it('bothWays가 꺼져 있으면 오른쪽은 읽지 않는다', () => {
    const grid = makeGrid([
      ['b', 'a', 'a'],
      ['b', 'a', 'a'],
    ])
    expect(evaluateWays(grid, math, BET_PER_WAY).wins.some((win) => win.symbol === 'a')).toBe(false)
  })
})

describe('ways 스키마', () => {
  it('base가 rows^reels와 다르면 거부한다', () => {
    const result = safeParseGameMath({
      ...JSON.parse(JSON.stringify(makeWaysMath())),
      ways: { base: 27, betDivisor: 5 },
    })
    expect(result.success).toBe(false)
  })

  it('ways 게임에 paylines를 두면 거부한다', () => {
    const result = safeParseGameMath({
      ...JSON.parse(JSON.stringify(makeWaysMath())),
      paylines: [[0, 0, 0]],
    })
    expect(result.success).toBe(false)
  })

  it('베팅액이 betDivisor로 나누어떨어지지 않으면 거부한다', () => {
    const result = safeParseGameMath({
      ...JSON.parse(JSON.stringify(makeWaysMath())),
      betLevels: [7],
    })
    expect(result.success).toBe(false)
  })

  it("payModel이 'lines'인데 paylines가 없으면 거부한다", () => {
    const result = safeParseGameMath({
      ...JSON.parse(JSON.stringify(makeWaysMath())),
      payModel: 'lines',
      ways: undefined,
      paylines: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('ways 해석적 RTP', () => {
  it('몬테카를로와 3 표준오차 안에서 일치한다', () => {
    const spins = 400_000
    const analytic = computeAnalyticRtp(math, 50)
    const mc = simulate(math, 50, spins, createSeededRng('ways-cross'))
    const standardError = mc.stdDev / Math.sqrt(spins)
    expect(Math.abs(mc.rtp - analytic.rtp)).toBeLessThan(3 * standardError)
  })

  it('bothWays도 몬테카를로와 맞는다', () => {
    const both = makeWaysMath({ ways: { base: 8, betDivisor: 5, bothWays: true } })
    const spins = 400_000
    const analytic = computeAnalyticRtp(both, 50)
    const mc = simulate(both, 50, spins, createSeededRng('ways-both'))
    const standardError = mc.stdDev / Math.sqrt(spins)
    expect(Math.abs(mc.rtp - analytic.rtp)).toBeLessThan(3 * standardError)
  })

  it('전수 조사와 해석값이 정확히 일치한다', () => {
    const enumerated = computeExactRtp(math, 50, { sampleSpins: 0 })
    expect(enumerated.method).toBe('enumerate')
    expect(computeAnalyticRtp(math, 50).rtp).toBeCloseTo(enumerated.rtp, 12)
  })

  it('bothWays도 전수 조사와 정확히 일치한다', () => {
    const both = makeWaysMath({ ways: { base: 8, betDivisor: 5, bothWays: true } })
    const enumerated = computeExactRtp(both, 50, { sampleSpins: 0 })
    expect(computeAnalyticRtp(both, 50).rtp).toBeCloseTo(enumerated.rtp, 12)
  })

  it('연속이 끊길 수 있는 모델에서는 bothWays가 RTP를 올린다', () => {
    // 위 픽스처는 모든 창에 a나 w가 있어 연속이 절대 끊기지 않는다.
    // 끊김이 가능하려면 매칭이 없는 창이 존재해야 한다.
    const breakable = {
      ...JSON.parse(JSON.stringify(makeWaysMath())),
      symbols: [
        { id: 'w', name: { en: 'Wild' }, wild: true },
        { id: 'a', name: { en: 'Alpha' } },
        { id: 'b', name: { en: 'Beta' } },
        { id: 'c', name: { en: 'Filler' } },
      ],
      strips: [
        ['a', 'c', 'c', 'b', 'c', 'c', 'w', 'c'],
        ['a', 'c', 'c', 'b', 'c', 'c', 'w', 'c'],
        ['a', 'c', 'c', 'b', 'c', 'c', 'w', 'c'],
      ],
      paytable: { a: { 2: 10, 3: 100 }, b: { 3: 20 }, w: { 3: 200 } },
    }
    const oneWay = parseGameMath(breakable)
    const both = parseGameMath({ ...breakable, ways: { base: 8, betDivisor: 5, bothWays: true } })
    expect(expectedWaysMultiplier(both)).toBeGreaterThan(expectedWaysMultiplier(oneWay))
  })

  it('큰 ways 모델은 해석 경로로 넘어간다', () => {
    const big = parseGameMath({
      id: 'big-ways',
      reels: 5,
      rows: 3,
      payModel: 'ways',
      ways: { base: 243, betDivisor: 25 },
      symbols: [
        { id: 'w', name: { en: 'Wild' }, wild: true },
        { id: 'a', name: { en: 'Alpha' } },
        { id: 'b', name: { en: 'Beta' } },
      ],
      strips: Array.from({ length: 5 }, () => Array.from({ length: 40 }, (_, i) => (i % 7 === 0 ? 'w' : i % 3 === 0 ? 'a' : 'b'))),
      paytable: { a: { 3: 5, 4: 20, 5: 100 }, b: { 3: 2, 4: 8, 5: 30 } },
      wild: { substitutesFor: 'all' },
      betLevels: [25],
      rtpTarget: 0.9,
      volatility: 'high',
    })
    const report = computeExactRtp(big, 25, { sampleSpins: 0 })
    expect(report.method).toBe('analytic')
    expect(report.breakdown.lines).toBeCloseTo(report.rtp, 12)
  })
})
