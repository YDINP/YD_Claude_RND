import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyMutations, buildGrid, createSeededRng, getBetUnit, parseGameMath, resolveSpin } from '@tgslot/slot-engine'
import type { GameMath, Rng, RoundState, SpinResult } from '@tgslot/slot-engine'
import { gamesDir, listGamePackDirs, readJson } from '../paths.js'
import { pickAuditSpins } from './compute.js'
import { finishAuditParts, planShards, runAuditPart, shardSeed } from './parts.js'
import { buildAuditMarkdown } from './report.js'
import { simulateRuin } from './ruin.js'
import {
  collectSample,
  finishSample,
  mergeEngineMeasurements,
  mergeSampleStates,
  sampleDistribution,
} from './sampleDistribution.js'
import { runShardedSample } from './shards.js'
import { drawSpin, playRound } from './spinner.js'
import { requiredAuditSpins, roundAuditSpins } from './stats.js'

const BET = 100

function load(id: string): { math: GameMath; manifest: unknown } {
  return {
    math: parseGameMath(readJson(join(gamesDir(), id, 'math.json'))),
    manifest: readJson(join(gamesDir(), id, 'manifest.json')),
  }
}

const candy = load('candy-cluster-pop')

/** T1 이전 `drawSpin`이 하던 조립. 연쇄 팩은 주문 추첨에 rng가 필요해 마지막 인자로 넘긴다. */
function legacyDraw(math: GameMath, totalBet: number, rng: Rng, state?: RoundState): SpinResult {
  const stops = math.strips.map((strip) => rng.nextInt(strip.length))
  const gridBefore = buildGrid(math, stops)
  const mutated = applyMutations(math, gridBefore, rng)
  return resolveSpin(
    math,
    mutated.grid,
    stops,
    totalBet,
    getBetUnit(math, totalBet),
    state,
    gridBefore,
    mutated.events,
    rng,
  )
}

describe('drawSpin = spinUnchecked', () => {
  it.each(listGamePackDirs().map((dir) => [dir.split(/[\\/]/).pop() ?? dir, dir] as const))(
    '%s: 옛 조립과 같은 시드에서 라운드 전체가 같다',
    (_name, dir) => {
      const math = parseGameMath(readJson(join(dir, 'math.json')))
      const totalBet = math.betLevels[0] ?? 1
      const mine = createSeededRng(`eq-${math.id}`)
      const theirs = createSeededRng(`eq-${math.id}`)
      for (let i = 0; i < 400; i += 1) {
        let a = drawSpin(math, totalBet, getBetUnit(math, totalBet), mine)
        let b = legacyDraw(math, totalBet, theirs)
        expect(a).toEqual(b)
        while (a.nextState !== undefined) {
          const state = a.nextState
          a = drawSpin(math, totalBet, getBetUnit(math, totalBet), mine, state)
          b = legacyDraw(math, totalBet, theirs, b.nextState)
          expect(a).toEqual(b)
        }
      }
    },
  )

  it('주문 카드 라운드가 playRound에서 끝까지 돈다', () => {
    const rng = createSeededRng('candy-round')
    for (let i = 0; i < 20_000; i += 1) {
      const round = playRound(candy.math, BET, BET, rng)
      if (round.length === 1) continue
      expect(round[0]?.spin.features.some((feature) => feature.type === 'orderRound')).toBe(true)
      expect(round.length - 1).toBeLessThanOrEqual(20)
      return
    }
    throw new Error('2만 스핀 안에 주문 라운드가 열리지 않았다')
  })
})

describe('연쇄·주문 통계', () => {
  const report = sampleDistribution(candy.math, BET, { spins: 30_000, seed: 'cascade-stats', rtpSource: 'sample' })
  const cascade = report.cascade

  it('연쇄 팩이면 cascade 절이 채워진다', () => {
    expect(cascade).toBeDefined()
    expect(cascade?.paidSpins).toBe(30_000)
    expect(cascade?.depth.reduce((sum, row) => sum + row.base, 0)).toBe(30_000)
  })

  it('지급 출처 넷의 합이 표본 지급 총액과 같다', () => {
    if (cascade === undefined) throw new Error('cascade 없음')
    const b = cascade.breakdown
    const histogramRtp = report.histogram.reduce((sum, row) => sum + row.rtpShare, 0)
    expect(b.lines + b.scatter + b.orderPrize + b.roundClusters).toBeCloseTo(histogramRtp, 10)
    expect(b.orderPrize + b.roundClusters).toBeCloseTo(b.round, 12)
  })

  it('P(지속)과 평균 연쇄가 깊이 분포에서 나온 값과 맞다', () => {
    if (cascade === undefined) throw new Error('cascade 없음')
    let steps = 0
    let hits = 0
    for (const row of cascade.depth) {
      steps += row.depth * row.base
      if (row.depth > 0) hits += row.base
    }
    expect(cascade.meanCascades).toBeCloseTo(steps / hits, 12)
    expect(cascade.continueProbability).toBeCloseTo(1 - 1 / cascade.meanCascades, 12)
  })

  it('주문 통계: 완료 ≤ 등장, 라운드 길이는 허용 범위, 완료 장수 분포가 평균과 맞다', () => {
    const orders = cascade?.orders
    if (orders === null || orders === undefined) throw new Error('orders 없음')
    expect(orders.rounds).toBeGreaterThan(0)
    expect(orders.overLength).toBe(0)
    expect(orders.maxLength).toBeLessThanOrEqual(orders.longestAllowed)
    for (const row of orders.byId) expect(row.completed).toBeLessThanOrEqual(row.dealt)
    const fromRows = orders.completions.reduce((sum, row) => sum + row.completed * row.rounds, 0) / orders.rounds
    expect(orders.cardsPerRound).toBeCloseTo(fromRows, 12)
    expect(orders.lengths.reduce((sum, row) => sum + row.rounds, 0)).toBe(orders.rounds)
  })
})

describe('표본 쪼개기와 합치기', () => {
  it('finishSample(collectSample) = sampleDistribution', () => {
    const options = { spins: 4_000, seed: 'split', rtpSource: 'sample' as const }
    expect(finishSample(candy.math, collectSample(candy.math, BET, options))).toEqual(
      sampleDistribution(candy.math, BET, options),
    )
  })

  it('두 조각을 합치면 개수는 더해지고 RTP는 가중 평균이다', () => {
    const a = collectSample(candy.math, BET, { spins: 3_000, seed: 'a', rtpSource: 'sample' })
    const b = collectSample(candy.math, BET, { spins: 5_000, seed: 'b', rtpSource: 'sample' })
    const merged = mergeSampleStates(candy.math, [a, b], 'ab')
    expect(merged.spins).toBe(8_000)
    expect(merged.hits).toBe(a.hits + b.hits)
    expect(merged.multiplierSum).toBeCloseTo(a.multiplierSum + b.multiplierSum, 9)
    expect(merged.cascade?.paidSpins).toBe(8_000)
    expect(merged.cascade?.rounds).toBe((a.cascade?.rounds ?? 0) + (b.cascade?.rounds ?? 0))
    const engine = merged.engine
    if (engine === null || a.engine === null || b.engine === null) throw new Error('엔진 측정 없음')
    expect(engine.rtp).toBeCloseTo((a.engine.rtp * 3_000 + b.engine.rtp * 5_000) / 8_000, 12)
    const report = finishSample(candy.math, merged)
    expect(report.observations).toBe(8_000)
    expect(report.precision?.spins).toBe(8_000)
  })

  it('같은 측정을 둘로 나눠 합쳐도 표준오차가 보존된다', () => {
    const one = { spins: 1_000, seed: 'x', rtp: 0.9, stdErr: 0.08, ci95: [0, 0] as [number, number], breakdown: { lines: 0.8, scatter: 0.05, freeSpins: 0.05 } }
    const merged = mergeEngineMeasurements([one, one], 'xx')
    expect(merged.rtp).toBeCloseTo(0.9, 12)
    // σ = SE·√n가 같고 n이 두 배면 SE는 1/√2가 된다(자유도 보정 차이만 남는다).
    expect(merged.stdErr).toBeCloseTo(0.08 / Math.SQRT2, 3)
  })
})

describe('시드 샤딩', () => {
  it('planShards: 몫의 합이 총량이고 시드는 샤드 번호로 정해진다', () => {
    const plans = planShards({ totalBet: BET, spins: 10, seed: 's', sampleSpins: 7, betLevelSpins: 5 }, 3)
    expect(plans.map((plan) => plan.options.spins)).toEqual([4, 3, 3])
    expect(plans.map((plan) => plan.options.sampleSpins)).toEqual([3, 2, 2])
    expect(plans.map((plan) => plan.options.betLevelSpins)).toEqual([2, 2, 1])
    expect(plans.map((plan) => plan.options.seed)).toEqual(['s:shard-0', 's:shard-1', 's:shard-2'])
    expect(shardSeed('42', 3)).toBe('42:shard-3')
  })

  it('조각 감사를 합치면 연쇄·주문 게이트와 새 절이 리포트에 실린다', () => {
    const plans = planShards({ totalBet: BET, spins: 4_000, seed: 'part', sampleSpins: 6_000, betLevelSpins: 2_000 }, 2)
    const parts = plans.map((plan) => runAuditPart(candy.math, plan.options))
    const ruin = simulateRuin(candy.math, BET, 'part', { trials: 5, spins: 50 })
    const result = finishAuditParts(candy.math, candy.manifest, { totalBet: BET, spins: 4_000, seed: 'part' }, parts, ruin)
    expect(result.options.shards).toBe(2)
    expect(result.distribution.observations).toBe(6_000)
    expect(result.mc.spins).toBe(4_000)
    expect(result.betLevels).toHaveLength(candy.math.betLevels.length)
    for (const row of result.betLevels) expect(row.betPerLine).toBe(row.totalBet)
    const labels = result.gates.map((gate) => gate.label)
    expect(labels.some((label) => label.startsWith('연쇄 지속 확률'))).toBe(true)
    expect(labels.some((label) => label.startsWith('주문 라운드 길이'))).toBe(true)
    expect(labels.some((label) => label.startsWith('상품 몫'))).toBe(true)
    const markdown = buildAuditMarkdown(result)
    expect(markdown).toContain('## 5-3. 연쇄')
    expect(markdown).toContain('## 5-4. 주문 카드 라운드')
    expect(markdown).toContain('## 5-5. 정밀도와 필요 스핀 수')
    expect(markdown).toContain('총 베팅액 기준')
    expect(markdown).not.toContain('Infinity')
    expect(markdown).not.toContain('NaN')
  })

  it('워커로 돈 표본은 같은 시드의 이 스레드 표본과 같다', async () => {
    const viaWorkers = await runShardedSample(candy.math, BET, 3_000, 'w', 2, { rtpSource: 'sample', skipEngineMc: true })
    const local = mergeSampleStates(
      candy.math,
      [
        collectSample(candy.math, BET, { spins: 1_500, seed: 'w:shard-0', rtpSource: 'sample', skipEngineMc: true }),
        collectSample(candy.math, BET, { spins: 1_500, seed: 'w:shard-1', rtpSource: 'sample', skipEngineMc: true }),
      ],
      'w:shard-0..1',
    )
    expect(finishSample(candy.math, viaWorkers)).toEqual(finishSample(candy.math, local))
  }, 60_000)
})

describe('감사 스핀 수', () => {
  it('n* 식은 계획 §3 M2의 예시(σ 8 → 약 74M)와 맞다', () => {
    expect(requiredAuditSpins(8)).toBe(Math.ceil(((1.96 * 8 * 1.1) / 0.002) ** 2))
    expect(requiredAuditSpins(8)).toBeGreaterThan(74_000_000)
    expect(requiredAuditSpins(8)).toBeLessThan(75_000_000)
    expect(roundAuditSpins(74_373_377)).toBe(80_000_000)
    expect(roundAuditSpins(10_000_000)).toBe(10_000_000)
  })

  it('명시 스핀 > manifest.auditSpins > 기본값', () => {
    expect(pickAuditSpins(123, { auditSpins: 50_000_000 })).toBe(123)
    expect(pickAuditSpins(null, { auditSpins: 50_000_000 })).toBe(50_000_000)
    expect(pickAuditSpins(null, {})).toBe(2_000_000)
    expect(pickAuditSpins(null, null)).toBe(2_000_000)
  })
})
