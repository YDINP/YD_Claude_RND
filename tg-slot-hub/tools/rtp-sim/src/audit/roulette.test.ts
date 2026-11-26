import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSeededRng, parseGameMath, spinUnchecked } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { gamesDir, readJson } from '../paths.js'
import { resolveMethod } from './distribution.js'
import { collectSample, finishSample, mergeSampleStates } from './sampleDistribution.js'
import { rouletteGates, rouletteSections } from './rouletteStats.js'
import { drawSpin } from './spinner.js'

const BET = 100
const idol: GameMath = parseGameMath(readJson(join(gamesDir(), 'idol-stage-live', 'math.json')))

describe('무대 룰렛 감사 경로', () => {
  it('해석 경로를 타지 않고 몬테카를로로 잰다 (룰렛을 뺀 «정확값» 금지)', () => {
    expect(resolveMethod(idol, BET)).toBe('monte-carlo')
  })

  it('감사 스피너는 엔진 spinUnchecked와 같은 결과를 낸다 (회전까지)', () => {
    for (let i = 0; i < 300; i += 1) {
      const a = drawSpin(idol, BET, 2, createSeededRng(`roulette-audit-${i}`))
      const b = spinUnchecked(idol, BET, createSeededRng(`roulette-audit-${i}`))
      expect(a).toEqual(b)
    }
  })

  it('표본 통이 룰렛 지표를 채우고 ways 몫 + 룰렛 몫 = 표본 RTP, 회전 수는 상한 안이다', () => {
    const state = collectSample(idol, BET, { spins: 60_000, seed: 'roulette-sample', rtpSource: 'sample', skipEngineMc: true })
    const report = finishSample(idol, state)
    const roulette = report.roulette
    expect(roulette).toBeDefined()
    if (roulette === undefined) return
    expect(roulette.triggers).toBeGreaterThan(100)
    expect(roulette.waysRtp + roulette.rouletteRtp).toBeCloseTo(roulette.sampleRtp, 9)
    expect(roulette.maxSteps).toBeLessThanOrEqual(7)
    expect(roulette.overSteps).toBe(0)
    expect(roulette.segments).toHaveLength(12 + 10 + 8)
    expect(roulette.buckets.reduce((sum, row) => sum + row.rate, 0)).toBeCloseTo(1, 9)
    const gates = rouletteGates(roulette)
    expect(gates.find((gate) => gate.label.startsWith('룰렛 회전 수'))?.pass).toBe(true)
    expect(gates.find((gate) => gate.label.startsWith('ways 몫'))?.pass).toBe(true)
    expect(rouletteSections(roulette).join('\n')).toContain('## 5-3. 무대 룰렛')
  })

  it('샤드 표본을 합치면 진입 수·착지 수가 더해진다', () => {
    const a = collectSample(idol, BET, { spins: 20_000, seed: 'r-a', rtpSource: 'sample', skipEngineMc: true })
    const b = collectSample(idol, BET, { spins: 20_000, seed: 'r-b', rtpSource: 'sample', skipEngineMc: true })
    const merged = mergeSampleStates(idol, [structuredClone(a), structuredClone(b)], 'r')
    expect(merged.roulette?.triggers).toBe((a.roulette?.triggers ?? 0) + (b.roulette?.triggers ?? 0))
    const report = finishSample(idol, merged).roulette
    const hits = report?.segments.reduce((sum, row) => sum + row.hits, 0) ?? 0
    const expected = [a, b].reduce((sum, s) => sum + (s.roulette?.segmentHits.flat().reduce((x, y) => x + y, 0) ?? 0), 0)
    expect(hits).toBe(expected)
  })
})
