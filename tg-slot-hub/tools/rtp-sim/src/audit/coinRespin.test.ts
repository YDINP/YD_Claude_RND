import { describe, expect, it } from 'vitest'
import { createSeededRng, parseGameMath, spinUnchecked } from '@tgslot/slot-engine'
import { readJson, resolveMathPath } from '../paths.js'
import { coinRespinGates } from './coinRespinStats.js'
import { collectSample, finishSample, mergeSampleStates } from './sampleDistribution.js'
import { drawSpin } from './spinner.js'

const math = parseGameMath(readJson(resolveMathPath('kraken-cove')))
const BET = 100

describe('코인 리스핀 감사 통계 (kraken-cove)', () => {
  it('drawSpin은 엔진 spinUnchecked와 같은 결과(리스핀 포함)를 낸다', () => {
    for (let i = 0; i < 300; i += 1) {
      expect(drawSpin(math, BET, 5, createSeededRng(`same-${i}`))).toEqual(spinUnchecked(math, BET, createSeededRng(`same-${i}`)))
    }
  })

  it('표본 리포트: 분해 합 = 전체, 리스핀 ≤ 구조상 최대, 하드캡 0, 샤드 합침이 한 번에 돈 것과 같다', () => {
    const options = { spins: 60_000, rtpSource: 'sample' as const, skipEngineMc: true }
    const a = collectSample(math, BET, { ...options, seed: 'shard-a' })
    const b = collectSample(math, BET, { ...options, seed: 'shard-b' })
    const merged = finishSample(math, mergeSampleStates(math, [a, b], 'merged'))
    const report = merged.coinRespin
    expect(report).toBeDefined()
    if (report === undefined) return
    expect(report.paidSpins).toBe(120_000)
    expect(report.rounds).toBe((a.coinRespin?.rounds ?? 0) + (b.coinRespin?.rounds ?? 0))
    expect(report.rounds).toBeGreaterThan(0)
    const gates = coinRespinGates(report)
    const byLabel = (fragment: string) => gates.find((gate) => gate.label.includes(fragment))
    expect(byLabel('분해 합')?.pass).toBe(true)
    expect(byLabel('구조상 최대')?.pass).toBe(true)
    expect(byLabel('hardCap')?.pass).toBe(true)
    expect(byLabel('q x 빈칸')?.pass).toBe(true)
    const totalFromSample = (a.multiplierSum + b.multiplierSum) / 120_000
    expect(report.breakdown.total).toBeCloseTo(totalFromSample, 12)
    expect(report.finalCoins.reduce((sum, row) => sum + row.rounds, 0)).toBe(report.rounds)
  })
})
