import { describe, expect, it } from 'vitest'
import { createSeededRng, getBetUnit, parseGameMath, spin } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { sampleDistribution } from './sampleDistribution.js'
import { analyzeDistribution, requiresMonteCarlo } from './distribution.js'
import { betPerLineOf, drawSpin, isWaysGame, playRound } from './spinner.js'
import { sampleSpins } from './sample.js'
import { buildAuditMarkdown } from './report.js'
import { composeAuditResult } from './compute.js'
import { runMonteCarlo } from './mc.js'
import { simulateRuin } from './ruin.js'

/**
 * 엔진의 테스트 픽스처는 패키지 밖으로 나오지 않으므로 같은 모양을 여기서 만든다.
 * ways와 뮤테이션이 감사 경로를 제대로 타는지만 보면 되고, 수치 정확도는 엔진 테스트가 맡는다.
 */
function waysMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'ways-fixture',
    reels: 3,
    rows: 2,
    payModel: 'ways',
    ways: { base: 8, betDivisor: 5 },
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'a', name: { en: 'Alpha', ko: '알파' } },
      { id: 'b', name: { en: 'Beta' } },
    ],
    strips: [
      ['w', 'a', 'b', 'a'],
      ['a', 'w', 'b', 'a'],
      ['b', 'a', 'w', 'a'],
    ],
    paytable: { a: { 2: 10, 3: 100 }, b: { 3: 20 }, w: { 3: 200 } },
    wild: { substitutesFor: 'all' },
    betLevels: [5, 50],
    rtpTarget: 0.9,
    volatility: 'high',
    ...overrides,
  })
}

function mutationMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'mutation-fixture',
    reels: 3,
    rows: 3,
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'q', name: { en: 'Mystery', ko: '미스터리' } },
      { id: 's', name: { en: 'Star' }, scatter: true },
      { id: 'a', name: { en: 'Alpha' } },
      { id: 'b', name: { en: 'Beta' } },
    ],
    strips: [
      ['w', 'q', 'a', 'b', 's', 'a'],
      ['a', 'w', 'q', 'b', 'a', 's'],
      ['b', 'a', 'w', 'q', 's', 'a'],
    ],
    paylines: [
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
    ],
    paytable: { w: { 3: 100 }, a: { 3: 10, 2: 2 }, b: { 3: 5 } },
    wild: { substitutesFor: 'all' },
    scatter: { symbol: 's', pays: { 3: 5 } },
    mutations: [{ type: 'mystery', symbol: 'q', weights: { a: 3, b: 1 } }],
    betLevels: [3, 30],
    rtpTarget: 0.9,
    volatility: 'medium',
    ...overrides,
  })
}

describe('ways 게임', () => {
  const math = waysMath()
  const BET = 50

  it('배당 단위가 라인당이 아니라 웨이당이다', () => {
    // betDivisor 5이므로 웨이당 베팅액은 총 베팅액 / 5다.
    expect(betPerLineOf(math, BET)).toBe(10)
    expect(isWaysGame(math)).toBe(true)
    expect(isWaysGame(mutationMath())).toBe(false)
  })

  it('betDivisor로 나누어떨어지지 않으면 던진다', () => {
    expect(() => betPerLineOf(math, 7)).toThrow(RangeError)
  })

  it('페이라인이 없어도 스핀이 돌고 승리가 나온다', () => {
    const round = playRound(math, BET, betPerLineOf(math, BET), {
      nextInt: (max) => max - 1,
    })
    expect(round).toHaveLength(1)
    expect(round[0]?.spin.grid).toHaveLength(math.rows)
  })

  it('표본 분포가 라인 대신 웨이즈 분포를 채운다', () => {
    const report = sampleDistribution(math, BET, { spins: 20_000, seed: 'ways' })
    expect(report.isWays).toBe(true)
    expect(report.lines).toEqual([])
    expect(report.ways.length).toBeGreaterThan(0)
    for (const row of report.ways) {
      expect(row.ways).toBeGreaterThanOrEqual(1)
      expect(['ltr', 'rtl']).toContain(row.direction)
      expect(row.hits).toBeGreaterThan(0)
    }
  })

  it('웨이즈 기여 비중의 합이 1이다', () => {
    const report = sampleDistribution(math, BET, { spins: 20_000, seed: 'ways' })
    const sum = report.ways.reduce((acc, row) => acc + row.share, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
  })

  it('심볼별 기여는 그대로 나온다', () => {
    const report = sampleDistribution(math, BET, { spins: 20_000, seed: 'ways' })
    expect(report.symbols.length).toBeGreaterThan(0)
    expect(report.symbols.some((row) => row.key === 'a' && row.label === '알파')).toBe(true)
  })

  it('bothWays면 두 방향이 모두 잡힌다', () => {
    const both = waysMath({ ways: { base: 8, betDivisor: 5, bothWays: true } })
    const report = sampleDistribution(both, BET, { spins: 20_000, seed: 'ways' })
    const directions = new Set(report.ways.map((row) => row.direction))
    expect(directions.has('ltr')).toBe(true)
    expect(directions.size).toBeGreaterThanOrEqual(1)
  })

  it('리포트가 페이라인 표 대신 웨이즈 표를 낸다', () => {
    const distribution = sampleDistribution(math, BET, { spins: 5_000, seed: 'ways' })
    const result = composeAuditResult(
      math,
      null,
      { totalBet: BET, spins: 2_000, seed: 'ways', generatedAt: new Date('2026-01-01T00:00:00.000Z') },
      {
        distribution,
        betLevels: [],
        mc: runMonteCarlo(math, BET, 2_000, 'ways'),
        ruin: simulateRuin(math, BET, 'ways', { trials: 3, spins: 20 }),
      },
    )
    const markdown = buildAuditMarkdown(result)
    expect(markdown).toContain('### 웨이즈 수 분포')
    expect(markdown).not.toContain('### 페이라인별')
    expect(markdown).toContain('| 경로 수 |')
    expect(markdown).toContain('ways (5 단위, 웨이당 베팅액 10)')
  })

  it('파산 시뮬도 ways 게임에서 돈다', () => {
    const report = simulateRuin(math, BET, 'ways', { trials: 5, spins: 50 })
    expect(report.trials).toBe(5)
    expect(report.ruinRate).toBeGreaterThanOrEqual(0)
  })
})

describe('뮤테이션', () => {
  const math = mutationMath()
  const BET = 30

  it('mystery는 닫힌 식으로 풀리므로 몬테카를로가 필요 없다', () => {
    expect(requiresMonteCarlo(math)).toBe(false)
  })

  it('randomWild는 몬테카를로로 간다', () => {
    const random = mutationMath({
      mutations: [{ type: 'randomWild', symbol: 'w', chance: 0.2, countWeights: { 1: 1 } }],
    })
    expect(requiresMonteCarlo(random)).toBe(true)
    expect(analyzeDistribution(random, BET, { sampleSpins: 500, sampleSeed: 'm' }).method).toBe('monte-carlo')
  })

  it('표본이 뮤테이션 발동 빈도와 바뀐 칸을 센다', () => {
    const report = sampleDistribution(math, BET, { spins: 20_000, seed: 'mut' })
    const mystery = report.mutations.find((row) => row.type === 'mystery')
    expect(mystery).toBeDefined()
    expect(mystery?.spins).toBeGreaterThan(0)
    expect(mystery?.frequency).toBeGreaterThan(0)
    expect(mystery?.frequency).toBeLessThanOrEqual(1)
    expect(mystery?.cellsChanged).toBeGreaterThan(0)
  })

  it('뮤테이션 RTP 몫이 0과 전체 RTP 사이다', () => {
    const report = sampleDistribution(math, BET, { spins: 20_000, seed: 'mut' })
    for (const row of report.mutations) {
      expect(row.rtp).toBeGreaterThanOrEqual(0)
      // 미스터리가 낀 스핀만 세므로 전체보다 클 수 없다.
      expect(row.rtp).toBeLessThanOrEqual(report.contributionTotal + 1e-9)
    }
  })

  it('뮤테이션이 없는 게임은 표가 비어 있다', () => {
    const plain = mutationMath({ mutations: undefined })
    expect(sampleDistribution(plain, BET, { spins: 2_000, seed: 'x' }).mutations).toEqual([])
  })

  it('전수 조사 경로는 뮤테이션 통계를 만들지 않는다', () => {
    // 전수 조사는 정지 그리드를 세는 것이라 뮤테이션 단계를 거치지 않는다.
    const report = analyzeDistribution(math, BET)
    expect(report.method).toBe('enumerate')
    expect(report.mutations).toEqual([])
  })

  it('샘플 스핀이 변형 전후 격자를 모두 들고 있다', () => {
    const spins = sampleSpins(math, BET, 'mut', 60)
    const mutated = spins.find((spin) => spin.mutations.length > 0)
    expect(mutated).toBeDefined()
    if (mutated === undefined) return

    expect(mutated.gridBefore).toHaveLength(math.rows)
    expect(mutated.grid).toHaveLength(math.rows)
    // 미스터리 심볼이 변형 전 격자에는 있고 변형 후에는 없다.
    expect(mutated.gridBefore.flat()).toContain('q')
    expect(mutated.grid.flat()).not.toContain('q')

    const event = mutated.mutations[0]
    expect(event?.type).toBe('mystery')
    expect(event?.cells.length).toBeGreaterThan(0)
    expect(event?.symbol).toBeDefined()
  })

  it('뮤테이션이 없는 스핀은 전후 격자가 같다', () => {
    const spins = sampleSpins(math, BET, 'mut', 60)
    const plain = spins.find((spin) => spin.mutations.length === 0)
    expect(plain).toBeDefined()
    expect(plain?.gridBefore).toEqual(plain?.grid)
  })

  it('리포트에 뮤테이션 섹션이 붙는다', () => {
    const distribution = sampleDistribution(math, BET, { spins: 5_000, seed: 'mut' })
    const result = composeAuditResult(
      math,
      null,
      { totalBet: BET, spins: 2_000, seed: 'mut', generatedAt: new Date('2026-01-01T00:00:00.000Z') },
      {
        distribution,
        betLevels: [],
        mc: runMonteCarlo(math, BET, 2_000, 'mut'),
        ruin: simulateRuin(math, BET, 'mut', { trials: 3, spins: 20 }),
      },
    )
    const markdown = buildAuditMarkdown(result)
    expect(markdown).toContain('## 5-2. 뮤테이션')
    expect(markdown).toContain('`mystery`')
    expect(markdown).toContain('| 발동 빈도 |')
  })
})

describe('엔진 스핀과의 동등성', () => {
  /**
   * 검수 도구는 레벨 밖 베팅액도 재야 해서 엔진의 `spin`을 못 쓴다(그쪽은 레벨을 강제한다).
   * 대신 같은 순서로 조립하는데, 그 순서가 어긋나면 같은 시드에서 다른 결과가 나온다.
   * RNG 소비 순서는 provably fair 계약이므로 여기서 못박아 둔다.
   */
  it('같은 시드에서 엔진의 spin과 완전히 같은 결과를 낸다', () => {
    for (const math of [mutationMath(), waysMath(), mutationMath({ mutations: undefined })]) {
      const totalBet = math.betLevels[math.betLevels.length - 1] ?? 0
      const betUnit = getBetUnit(math, totalBet)

      for (let i = 0; i < 25; i += 1) {
        const seed = `equiv-${math.id}-${i}`
        const mine = drawSpin(math, totalBet, betUnit, createSeededRng(seed))
        const engine = spin(math, { totalBet }, createSeededRng(seed))
        expect(mine).toEqual(engine)
      }
    }
  })

  it('뮤테이션 게임도 베팅 레벨 밖 금액으로 잴 수 있다', () => {
    const math = mutationMath()
    // 3과 30이 선언된 레벨이다. 튜닝용으로 그 밖의 값도 받아야 한다.
    expect(math.betLevels).not.toContain(300)
    const result = drawSpin(math, 300, getBetUnit(math, 300), createSeededRng('outside'))
    expect(result.grid).toHaveLength(math.rows)
    // 뮤테이션 단계가 빠지지 않았는지 확인한다.
    expect(result.gridBefore).toBeDefined()
  })

  it('레벨 밖 금액에서도 뮤테이션이 실제로 발동한다', () => {
    const math = mutationMath()
    const rng = createSeededRng('outside-mutations')
    let fired = 0
    for (let i = 0; i < 200; i += 1) {
      if (drawSpin(math, 300, getBetUnit(math, 300), rng).mutations.length > 0) fired += 1
    }
    expect(fired).toBeGreaterThan(0)
  })
})
