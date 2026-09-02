import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_ENUMERATION_COMBOS, computeAnalyticRtp, parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { gamesDir, readJson } from '../paths.js'
import { analyzeDistribution, buildFeatureReport, canEnumerate } from './distribution.js'
import { sampleDistribution } from './sampleDistribution.js'
import { enumerateAudit } from './enumerate.js'
import { maxWinThreshold, runAudit } from './compute.js'
import { buildAuditMarkdown } from './report.js'
import { readManifestExtras } from './jackpot.js'
import { sampleSpins } from './sample.js'
import { simulateRuin } from './ruin.js'
import { comboCount } from './contributions.js'

/** 표본 크기가 작아도 통과해야 하는 것들만 본다. 정확도 검증은 CLI 리포트가 맡는다. */
const SAMPLE_SPINS = 40_000
const BET = 100

function load(id: string): { math: GameMath; manifest: unknown } {
  return {
    math: parseGameMath(readJson(join(gamesDir(), id, 'math.json'))),
    manifest: readJson(join(gamesDir(), id, 'manifest.json')),
  }
}

const fruit = load('fruit-fiesta')
const classic = load('classic-777')

describe('모델 크기에 따른 방법 선택', () => {
  it('classic-777은 전수 조사가 가능하다', () => {
    expect(comboCount(classic.math)).toBeLessThanOrEqual(MAX_ENUMERATION_COMBOS)
    expect(canEnumerate(classic.math)).toBe(true)
    expect(analyzeDistribution(classic.math, BET).method).toBe('enumerate')
  })

  it('fruit-fiesta는 조합이 상한을 넘어 해석 모드로 간다', () => {
    expect(comboCount(fruit.math)).toBeGreaterThan(MAX_ENUMERATION_COMBOS)
    expect(canEnumerate(fruit.math)).toBe(false)
  })

  it('상한을 낮추면 작은 모델도 해석 모드로 보낼 수 있다', () => {
    expect(canEnumerate(classic.math, 10)).toBe(false)
  })
})

describe('해석 모드 분포', () => {
  const report = analyzeDistribution(fruit.math, BET, { sampleSpins: SAMPLE_SPINS, sampleSeed: 'test' })

  it('추정값이라고 표시하고 표본 크기를 남긴다', () => {
    expect(report.method).toBe('analytic')
    expect(report.estimated).toBe(true)
    expect(report.observations).toBe(SAMPLE_SPINS)
    expect(report.sampleSeed).toBe('test')
  })

  it('RTP는 표본이 아니라 해석적 정확값이다', () => {
    const analytic = computeAnalyticRtp(fruit.math, BET)
    expect(report.rtp).toBe(analytic.rtp)
    expect(report.breakdown).toEqual(analytic.breakdown)
  })

  it('RTP 분해의 합이 전체 RTP다', () => {
    const sum = report.breakdown.lines + report.breakdown.scatter + report.breakdown.freeSpins
    expect(sum).toBeCloseTo(report.rtp, 12)
  })

  it('프리스핀이 RTP의 상당 부분을 차지한다', () => {
    expect(report.breakdown.freeSpins).toBeGreaterThan(0)
    expect(report.breakdown.scatter).toBeGreaterThan(0)
  })

  it('히스토그램 확률의 합이 1이다', () => {
    const sum = report.histogram.reduce((acc, row) => acc + row.probability, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9)
  })

  it('표본 기여 합계가 정확한 RTP 근처에 온다', () => {
    // 표본이라 정확히 같을 수 없다. 자릿수가 맞는지만 본다.
    expect(report.contributionTotal).toBeGreaterThan(report.rtp * 0.7)
    expect(report.contributionTotal).toBeLessThan(report.rtp * 1.3)
  })

  it('스캐터 심볼도 기여 표에 잡힌다', () => {
    const scatter = report.symbols.find((row) => row.key === fruit.math.scatter?.symbol)
    expect(scatter).toBeDefined()
    expect(scatter?.rtp).toBeGreaterThan(0)
  })

  it('같은 시드는 같은 표본을 낸다', () => {
    const again = sampleDistribution(fruit.math, BET, { spins: SAMPLE_SPINS, seed: 'test' })
    expect(again.hitRate).toBe(report.hitRate)
    expect(again.maxWinMultiplier).toBe(report.maxWinMultiplier)
    expect(again.symbols.map((row) => row.win)).toEqual(report.symbols.map((row) => row.win))
  })

  it('표본에서 프리스핀이 실제로 돌아간다', () => {
    expect(report.observedFeatures).not.toBeNull()
    expect(report.observedFeatures?.triggers ?? 0).toBeGreaterThan(0)
    expect(report.observedFeatures?.freeSpins ?? 0).toBeGreaterThan(0)
  })

  it('진행률 콜백이 끝까지 올라간다', () => {
    const ratios: number[] = []
    sampleDistribution(fruit.math, BET, { spins: 5_000, seed: 't', onProgress: (r) => ratios.push(r) })
    expect(ratios.at(-1)).toBe(1)
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios)
  })

  it('전수 모드는 추정 표시가 없고 관측 수가 조합 수다', () => {
    const exact = enumerateAudit(classic.math, BET)
    expect(exact.estimated).toBe(false)
    expect(exact.sampleSeed).toBeNull()
    expect(exact.observations).toBe(exact.combos)
    expect(exact.observedFeatures).toBeNull()
  })
})

describe('프리스핀 요약', () => {
  const report = analyzeDistribution(fruit.math, BET, { sampleSpins: SAMPLE_SPINS, sampleSeed: 'test' })
  const features = buildFeatureReport(fruit.math, report)

  it('스캐터가 없는 게임은 요약도 없다', () => {
    expect(buildFeatureReport(classic.math, enumerateAudit(classic.math, BET))).toBeNull()
  })

  it('트리거 확률과 기대 프리스핀 수를 닫힌 식에서 가져온다', () => {
    const analytic = computeAnalyticRtp(fruit.math, BET)
    expect(features?.triggerProbability).toBe(analytic.triggerProbability)
    expect(features?.spinsPerTrigger).toBeCloseTo(analytic.expectedFreeSpinsPerTrigger, 12)
  })

  it('math.json의 프리스핀 설정을 그대로 옮긴다', () => {
    const config = fruit.math.scatter?.freeSpins
    expect(features?.multiplier).toBe(config?.multiplier)
    expect(features?.retrigger).toBe(config?.retrigger)
    expect(features?.scatterSymbol).toBe(fruit.math.scatter?.symbol)
  })

  it('프리스핀 몫과 스캐터 몫이 0과 1 사이다', () => {
    expect(features?.freeSpinsShare ?? -1).toBeGreaterThan(0)
    expect(features?.freeSpinsShare ?? 2).toBeLessThan(1)
    expect(features?.scatterShare ?? -1).toBeGreaterThan(0)
  })

  it('관측 트리거율이 이론값과 같은 자릿수다', () => {
    const observed = features?.observedTriggerRate ?? 0
    const theory = features?.triggerProbability ?? 0
    expect(observed).toBeGreaterThan(theory * 0.5)
    expect(observed).toBeLessThan(theory * 1.5)
  })
})

describe('최대 배수 게이트 기준', () => {
  it('3릴은 100x, 5릴은 50x를 요구한다', () => {
    expect(maxWinThreshold(classic.math, null)).toBe(100)
    expect(maxWinThreshold(fruit.math, null)).toBe(50)
  })

  it('manifest의 maxWinTarget이 있으면 그것을 쓴다', () => {
    const extras = readManifestExtras({ maxWinTarget: 250 })
    expect(maxWinThreshold(fruit.math, extras)).toBe(250)
    expect(maxWinThreshold(classic.math, extras)).toBe(250)
  })

  it('0이나 음수는 무시하고 릴 수 기준으로 돌아간다', () => {
    expect(maxWinThreshold(fruit.math, readManifestExtras({ maxWinTarget: 0 }))).toBe(50)
  })
})

describe('프리스핀이 있는 게임의 샘플 스핀', () => {
  it('라운드 하나가 프리스핀까지 통째로 나온다', () => {
    const spins = sampleSpins(fruit.math, BET, 'fs', 400)
    const free = spins.filter((spin) => spin.isFreeSpin)
    expect(free.length).toBeGreaterThan(0)
    for (const spin of free) {
      expect(spin.winMultiplier).toBe(fruit.math.scatter?.freeSpins?.multiplier)
      // 프리스핀은 자기를 연 유료 스핀과 같은 라운드 번호를 쓴다.
      expect(spins.some((other) => other.round === spin.round && !other.isFreeSpin)).toBe(true)
    }
  })

  it('프리스핀을 연 스핀은 부여 횟수를 들고 있다', () => {
    const spins = sampleSpins(fruit.math, BET, 'fs', 400)
    const trigger = spins.find((spin) => spin.freeSpinsAwarded > 0)
    expect(trigger).toBeDefined()
    expect(trigger?.freeSpinsAwarded).toBe(fruit.math.scatter?.freeSpins?.count)
    expect(trigger?.scatterCount ?? 0).toBeGreaterThanOrEqual(fruit.math.scatter?.freeSpins?.trigger ?? 0)
  })

  it('스캐터 칸도 하이라이트에 들어간다', () => {
    const spins = sampleSpins(fruit.math, BET, 'fs', 400)
    const scatterWin = spins.find((spin) => spin.scatterWin > 0)
    expect(scatterWin?.winningCells.length ?? 0).toBeGreaterThan(0)
  })

  it('같은 시드는 같은 순서를 낸다', () => {
    expect(sampleSpins(fruit.math, BET, 'x', 20)).toEqual(sampleSpins(fruit.math, BET, 'x', 20))
  })
})

describe('파산 시뮬은 프리스핀까지 돌린다', () => {
  it('결정론적이고 비율이 0~1 안이다', () => {
    const options = { trials: 10, spins: 100 }
    const first = simulateRuin(fruit.math, BET, '42', options)
    expect(simulateRuin(fruit.math, BET, '42', options)).toEqual(first)
    expect(first.ruinRate).toBeGreaterThanOrEqual(0)
    expect(first.ruinRate).toBeLessThanOrEqual(1)
  })
})

describe('fruit-fiesta 검수 리포트', () => {
  const result = runAudit(fruit.math, fruit.manifest, {
    totalBet: BET,
    spins: 40_000,
    seed: '42',
    sampleSpins: SAMPLE_SPINS,
    ruinTrials: 10,
    ruinSpins: 100,
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  })

  it('해석 모드로 돌고 기능 요약이 붙는다', () => {
    expect(result.distribution.method).toBe('analytic')
    expect(result.features).not.toBeNull()
  })

  it('기여 합계 게이트는 표본 모드에서 빠진다', () => {
    expect(result.gates.some((gate) => gate.label.includes('기여 합계'))).toBe(false)
    expect(result.gates.some((gate) => gate.label.includes('확률 합계'))).toBe(true)
  })

  it('최대 배수 게이트가 5릴 기준으로 붙는다', () => {
    const gate = result.gates.find((row) => row.label.includes('최대 배수'))
    expect(gate?.label).toContain('50x 이상')
    expect(gate?.label).toContain('5릴')
  })

  it('베팅 레벨 표는 RTP만 채우고 분포 칸은 비운다', () => {
    expect(result.betLevels.map((row) => row.totalBet)).toEqual(fruit.math.betLevels)
    for (const row of result.betLevels) {
      expect(row.hitRate).toBeNull()
      expect(row.maxWinMultiplier).toBeNull()
    }
  })

  it('마크다운에 해석적 표시와 프리스핀 섹션이 들어간다', () => {
    const markdown = buildAuditMarkdown(result)
    expect(markdown).toContain('## 2. RTP 산출 — 해석적 계산')
    expect(markdown).toContain('## 5-1. 스캐터와 프리스핀')
    expect(markdown).toContain('(표본 추정)')
    expect(markdown).toContain('프리스핀 트리거 확률')
    expect(markdown).toContain('  └ 프리스핀')
  })

  it('classic-777 리포트에는 프리스핀 섹션이 없다', () => {
    const classicResult = runAudit(classic.math, classic.manifest, {
      totalBet: BET,
      spins: 2_000,
      seed: '42',
      ruinTrials: 5,
      ruinSpins: 50,
    })
    expect(classicResult.features).toBeNull()
    expect(buildAuditMarkdown(classicResult)).not.toContain('## 5-1.')
  })
})
