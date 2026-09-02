import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { gamesDir, readJson } from '../paths.js'
import { analyzeDistribution, engineMethod, requiresMonteCarlo, resolveMethod } from './distribution.js'
import { sampleDistribution } from './sampleDistribution.js'
import { BET_LEVEL_MC_SPINS, MAX_CI95_HALF_WIDTH, auditBetLevels, rtpGate, runAudit } from './compute.js'
import { buildAuditMarkdown } from './report.js'
import { Z95 } from './stats.js'
import type { DistributionReport } from './types.js'

const BET = 100

function load(id: string): { math: GameMath; manifest: unknown } {
  return {
    math: parseGameMath(readJson(join(gamesDir(), id, 'math.json'))),
    manifest: readJson(join(gamesDir(), id, 'manifest.json')),
  }
}

const fruit = load('fruit-fiesta')
const classic = load('classic-777')

/**
 * 엔진이 아직 뮤테이션·캐스케이드를 싣지 않았으므로 그 필드를 흉내 낸 모델로 검사한다.
 * `parseGameMath`는 모르는 키를 떨어뜨리므로 파싱 뒤에 얹는다.
 */
function withFeature(math: GameMath, feature: Record<string, unknown>): GameMath {
  return { ...math, ...feature } as GameMath
}

describe('몬테카를로가 필요한 모델 판별', () => {
  it('지금 있는 두 게임은 몬테카를로가 필요 없다', () => {
    expect(requiresMonteCarlo(classic.math)).toBe(false)
    expect(requiresMonteCarlo(fruit.math)).toBe(false)
  })

  it('캐스케이드·클러스터·리스핀이 있으면 몬테카를로로 간다', () => {
    for (const key of ['cascade', 'cluster', 'respin', 'holdAndSpin']) {
      expect(requiresMonteCarlo(withFeature(fruit.math, { [key]: {} }))).toBe(true)
    }
  })

  it('배치 배타성·이월 뮤테이션은 몬테카를로, 나머지는 아니다', () => {
    const mc = withFeature(fruit.math, { mutations: [{ type: 'random-wild-drop' }] })
    expect(requiresMonteCarlo(mc)).toBe(true)
    expect(requiresMonteCarlo(withFeature(fruit.math, { mutations: [{ type: 'sticky' }] }))).toBe(true)

    // mystery·expand·upgrade는 조건부화하면 릴 독립이 복원돼 닫힌 식으로 풀린다.
    const analytic = withFeature(fruit.math, { mutations: [{ type: 'mystery' }, { type: 'expand' }] })
    expect(requiresMonteCarlo(analytic)).toBe(false)
  })

  it('문자열만 든 배열도 읽고, 모양이 이상하면 false다', () => {
    expect(requiresMonteCarlo(withFeature(fruit.math, { mutations: ['walking'] }))).toBe(true)
    expect(requiresMonteCarlo(withFeature(fruit.math, { mutations: 'nope' }))).toBe(false)
    expect(requiresMonteCarlo(withFeature(fruit.math, { cascade: null }))).toBe(false)
  })

  it('엔진에게 방법을 물어볼 수 있고 지금은 두 값만 돌아온다', () => {
    expect(engineMethod(classic.math, BET)).toBe('enumerate')
    expect(engineMethod(fruit.math, BET)).toBe('analytic')
  })

  it('방법 결정 순서는 명시 지정 > 피처 > 조합 수다', () => {
    expect(resolveMethod(classic.math, BET)).toBe('enumerate')
    expect(resolveMethod(fruit.math, BET)).toBe('analytic')
    expect(resolveMethod(classic.math, BET, { forceMethod: 'monte-carlo' })).toBe('monte-carlo')
    expect(resolveMethod(withFeature(classic.math, { cascade: {} }), BET)).toBe('monte-carlo')
  })
})

describe('몬테카를로 분포', () => {
  const report: DistributionReport = analyzeDistribution(fruit.math, BET, {
    forceMethod: 'monte-carlo',
    sampleSpins: 60_000,
    sampleSeed: 'mc-test',
  })

  it('RTP가 표본에서 나오고 정밀도가 붙는다', () => {
    expect(report.method).toBe('monte-carlo')
    expect(report.estimated).toBe(true)
    expect(report.precision).not.toBeNull()
    expect(report.precision?.spins).toBe(60_000)
    expect(report.precision?.seed).toBe('mc-test')
  })

  it('신뢰구간 반폭이 1.96 x 표준오차다', () => {
    const precision = report.precision
    expect(precision).not.toBeNull()
    if (precision === null) return
    expect(precision.ci95HalfWidth).toBeCloseTo(Z95 * precision.stdErr, 12)
    expect(precision.ci95Low).toBeCloseTo(report.rtp - precision.ci95HalfWidth, 12)
    expect(precision.ci95High).toBeCloseTo(report.rtp + precision.ci95HalfWidth, 12)
  })

  it('해석적 정확값과 신뢰구간 안에서 만난다', () => {
    const analytic = analyzeDistribution(fruit.math, BET, { sampleSpins: 1_000, sampleSeed: 'x' })
    const precision = report.precision
    if (precision === null) throw new Error('정밀도가 없다')
    // 표본 RTP는 해석적 값 주변에 있어야 한다. 4 SE는 넉넉한 여유다.
    expect(Math.abs(report.rtp - analytic.rtp)).toBeLessThan(4 * precision.stdErr)
  })

  it('해석·전수 모드에는 정밀도가 없다', () => {
    expect(analyzeDistribution(classic.math, BET).precision).toBeNull()
    expect(analyzeDistribution(fruit.math, BET, { sampleSpins: 1_000 }).precision).toBeNull()
  })

  it('같은 시드는 같은 RTP를 낸다', () => {
    const again = sampleDistribution(fruit.math, BET, { spins: 60_000, seed: 'mc-test', rtpSource: 'sample' })
    expect(again.rtp).toBe(report.rtp)
    expect(again.precision?.ci95HalfWidth).toBe(report.precision?.ci95HalfWidth)
  })
})

describe('몬테카를로 RTP 게이트', () => {
  function fakeReport(rtp: number, halfWidth: number): DistributionReport {
    const base = analyzeDistribution(fruit.math, BET, { sampleSpins: 1_000, sampleSeed: 'g' })
    return {
      ...base,
      method: 'monte-carlo',
      rtp,
      precision: {
        spins: 1_000_000,
        seed: '42',
        stdErr: halfWidth / Z95,
        ci95HalfWidth: halfWidth,
        ci95Low: rtp - halfWidth,
        ci95High: rtp + halfWidth,
      },
    }
  }

  const target = fruit.math.rtpTarget

  it('목표 안이고 신뢰구간이 좁으면 통과한다', () => {
    const gate = rtpGate(fruit.math, fakeReport(target + 0.004, 0.0015), 0.004, '몬테카를로')
    expect(gate.pass).toBe(true)
    expect(gate.label).toContain('95% CI 반폭 ≤ 0.2%p')
  })

  it('목표 안이어도 신뢰구간이 넓으면 표본 부족으로 떨어진다', () => {
    const gate = rtpGate(fruit.math, fakeReport(target, 0.0025), 0, '몬테카를로')
    expect(gate.pass).toBe(false)
    expect(gate.detail).toContain('표본 부족')
  })

  it('신뢰구간이 좁아도 목표를 벗어나면 떨어진다', () => {
    const gate = rtpGate(fruit.math, fakeReport(target + 0.006, 0.0005), 0.006, '몬테카를로')
    expect(gate.pass).toBe(false)
  })

  it('경계값 0.2%p는 통과다', () => {
    const gate = rtpGate(fruit.math, fakeReport(target, MAX_CI95_HALF_WIDTH), 0, '몬테카를로')
    expect(gate.pass).toBe(true)
  })

  it('정밀도가 기록되지 않으면 무조건 실패다', () => {
    const broken = { ...fakeReport(target, 0.001), precision: null }
    const gate = rtpGate(fruit.math, broken, 0, '몬테카를로')
    expect(gate.pass).toBe(false)
    expect(gate.detail).toContain('신뢰구간이 기록되지 않았다')
  })

  it('spins·seed·stderr·ci95를 판정 문구에 전부 남긴다', () => {
    const gate = rtpGate(fruit.math, fakeReport(target, 0.001), 0, '몬테카를로')
    expect(gate.detail).toContain('1,000,000 스핀')
    expect(gate.detail).toContain('시드 42')
    expect(gate.detail).toContain('95% CI ±0.100%p')
  })

  it('전수·해석 모드는 신뢰구간 조건을 붙이지 않는다', () => {
    const exact = analyzeDistribution(classic.math, BET)
    const gate = rtpGate(classic.math, exact, exact.rtp - classic.math.rtpTarget, '전수 조사')
    expect(gate.label).not.toContain('CI')
    expect(gate.pass).toBe(true)
  })
})

describe('베팅 레벨별 검증', () => {
  it('몬테카를로 모델은 레벨마다 따로 돌리고 신뢰구간을 남긴다', () => {
    const rows = auditBetLevels(fruit.math, { method: 'monte-carlo', spins: 20_000, seed: 'lv' })
    expect(rows).toHaveLength(fruit.math.betLevels.length)
    for (const row of rows) {
      expect(row.method).toBe('monte-carlo')
      expect(row.ci95HalfWidth).not.toBeNull()
      expect(row.hitRate).not.toBeNull()
      expect(row.maxWinMultiplier).not.toBeNull()
    }
    // 레벨마다 다른 시드를 쓰므로 값이 전부 같을 수 없다.
    expect(new Set(rows.map((row) => row.rtp)).size).toBeGreaterThan(1)
  })

  it('기본 스핀 수는 50만이다', () => {
    expect(BET_LEVEL_MC_SPINS).toBe(500_000)
  })

  it('전수 모델은 레벨마다 정확값이고 신뢰구간이 없다', () => {
    const rows = auditBetLevels(classic.math)
    for (const row of rows) {
      expect(row.method).toBe('enumerate')
      expect(row.ci95HalfWidth).toBeNull()
      expect(row.pass).toBe(true)
    }
  })

  it('진행률 콜백만 넘기는 옛 호출 방식도 그대로 받는다', () => {
    const ratios: number[] = []
    const rows = auditBetLevels(classic.math, (ratio) => ratios.push(ratio))
    expect(rows).toHaveLength(classic.math.betLevels.length)
    expect(ratios.at(-1)).toBe(1)
  })
})

describe('몬테카를로 리포트', () => {
  const result = runAudit(fruit.math, fruit.manifest, {
    totalBet: BET,
    spins: 30_000,
    seed: '42',
    forceMethod: 'monte-carlo',
    sampleSpins: 30_000,
    betLevelSpins: 10_000,
    ruinTrials: 5,
    ruinSpins: 50,
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  })

  it('방법이 몬테카를로로 기록된다', () => {
    expect(result.distribution.method).toBe('monte-carlo')
    expect(result.distribution.precision).not.toBeNull()
  })

  it('마크다운에 spins·seed·stderr·ci95가 전부 남는다', () => {
    const markdown = buildAuditMarkdown(result)
    expect(markdown).toContain('## 2. RTP 산출 — 몬테카를로')
    expect(markdown).toContain('RTP 정밀도')
    expect(markdown).toContain('표준오차 (SE)')
    expect(markdown).toContain('95% 신뢰구간')
    expect(markdown).toContain('스핀 수')
    expect(markdown).toContain('RTP (표본 추정)')
  })

  it('베팅 레벨 표에 방법과 신뢰구간 열이 있다', () => {
    const markdown = buildAuditMarkdown(result)
    expect(markdown).toContain('| 95% CI |')
    expect(markdown).toContain('| 방법 |')
  })

  it('30k 스핀으로는 신뢰구간이 넓어 표본 부족으로 떨어진다', () => {
    // 정밀도 요구가 실제로 물리는지 확인한다. 통과시키려면 스핀을 더 줘야 한다.
    const gate = result.gates.find((row) => row.label.includes('RTP가 목표'))
    expect(gate?.pass).toBe(false)
    expect(gate?.detail).toContain('표본 부족')
  })
})
