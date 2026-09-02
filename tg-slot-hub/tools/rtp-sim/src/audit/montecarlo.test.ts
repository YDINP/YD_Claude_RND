import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeAnalyticRtp, computeExactRtp, isAnalytic, parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { gamesDir, readJson } from '../paths.js'
import { analyzeDistribution, engineMethod, requiresMonteCarlo, resolveMethod } from './distribution.js'
import { sampleDistribution } from './sampleDistribution.js'
import {
  BET_LEVEL_MC_SPINS,
  MAX_CI95_HALF_WIDTH,
  betLevelPasses,
  RTP_TOLERANCE,
  acceptMonteCarloRtp,
  auditBetLevels,
  rtpGate,
  runAudit,
} from './compute.js'
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
 * 진짜 몬테카를로 모델. `randomWild`는 빈 칸에 배타적으로 떨어뜨려 릴 독립을 깨므로
 * 엔진의 `isAnalytic`이 false를 준다. 작게 만들어 테스트가 빨리 끝나게 한다.
 *
 * fruit-fiesta에 방법을 강제하던 예전 방식은 더 이상 쓰지 않는다. 엔진 디스패처가
 * 모델을 보고 스스로 고르기 때문에, 해석 가능한 모델에 몬테카를로를 씌울 수 없다.
 */
function mcMath(overrides: Record<string, unknown> = {}): GameMath {
  return parseGameMath({
    id: 'mc-fixture',
    reels: 3,
    rows: 3,
    symbols: [
      { id: 'w', name: { en: 'Wild' }, wild: true },
      { id: 'a', name: { en: 'Alpha' } },
      { id: 'b', name: { en: 'Beta' } },
      // 미스터리 심볼은 페이테이블을 가질 수 없다. 스트립에는 있어야 한다.
      { id: 'q', name: { en: 'Mystery' } },
    ],
    strips: [
      ['a', 'b', 'a', 'w', 'q', 'b'],
      ['b', 'a', 'b', 'q', 'w', 'a'],
      ['a', 'w', 'q', 'b', 'a', 'b'],
    ],
    paylines: [
      [1, 1, 1],
      [0, 0, 0],
    ],
    paytable: { a: { 3: 20, 2: 2 }, b: { 3: 10 }, w: { 3: 50 } },
    wild: { substitutesFor: 'all' },
    mutations: [{ type: 'randomWild', symbol: 'w', chance: 0.15, countWeights: { 1: 3, 2: 1 } }],
    betLevels: [2, 20],
    rtpTarget: 0.9,
    volatility: 'medium',
    ...overrides,
  })
}

const MC_BET = 20

/**
 * 엔진이 아직 뮤테이션·캐스케이드를 싣지 않았으므로 그 필드를 흉내 낸 모델로 검사한다.
 * `parseGameMath`는 모르는 키를 떨어뜨리므로 파싱 뒤에 얹는다.
 */
function withFeature(math: GameMath, feature: Record<string, unknown>): GameMath {
  return { ...math, ...feature } as GameMath
}

describe('몬테카를로가 필요한 모델 판별', () => {
  it('판단을 엔진의 isAnalytic에 맡긴다', () => {
    // 예전에는 뮤테이션 이름 목록을 여기서 들고 있었다. 엔진과 갈라지면 감사가 다른 RTP를 쓰게 된다.
    for (const math of [classic.math, fruit.math, mcMath(), mcMath({ mutations: undefined })]) {
      expect(requiresMonteCarlo(math)).toBe(!isAnalytic(math))
    }
  })

  it('지금 있는 두 게임은 몬테카를로가 필요 없다', () => {
    expect(requiresMonteCarlo(classic.math)).toBe(false)
    expect(requiresMonteCarlo(fruit.math)).toBe(false)
  })

  it('randomWild가 있으면 몬테카를로로 간다', () => {
    expect(requiresMonteCarlo(mcMath())).toBe(true)
  })

  it('뮤테이션이 없으면 해석적이다', () => {
    expect(requiresMonteCarlo(mcMath({ mutations: undefined }))).toBe(false)
  })

  it('mystery만 있으면 해석적으로 풀린다', () => {
    const mystery = mcMath({ mutations: [{ type: 'mystery', symbol: 'q', weights: { a: 3, b: 1 } }] })
    expect(isAnalytic(mystery)).toBe(true)
    expect(requiresMonteCarlo(mystery)).toBe(false)
  })

  it('엔진에게 방법을 물어보면 디스패처의 답이 온다', () => {
    expect(engineMethod(classic.math, BET)).toBe('enumerate')
    expect(engineMethod(fruit.math, BET)).toBe('analytic')
  })

  it('방법 결정은 피처 > 조합 수 순이다', () => {
    expect(resolveMethod(classic.math, BET)).toBe('enumerate')
    expect(resolveMethod(fruit.math, BET)).toBe('analytic')
    expect(resolveMethod(mcMath(), MC_BET)).toBe('monte-carlo')
  })
})

describe('몬테카를로 분포', () => {
  const SPINS = 60_000
  const report: DistributionReport = analyzeDistribution(mcMath(), MC_BET, {
    sampleSpins: SPINS,
    sampleSeed: 'mc-test',
  })

  it('RTP가 표본에서 나오고 정밀도가 붙는다', () => {
    expect(report.method).toBe('monte-carlo')
    expect(report.estimated).toBe(true)
    expect(report.precision).not.toBeNull()
    expect(report.precision?.spins).toBe(SPINS)
    expect(report.precision?.seed).toBe('mc-test')
  })

  it('RTP와 신뢰구간이 엔진 디스패처의 값과 같다', () => {
    // 감사와 게이트가 같은 숫자를 봐야 한다. 여기가 갈라지면 CI와 리포트가 어긋난다.
    const engine = computeExactRtp(mcMath(), MC_BET, { mcSpins: SPINS, mcSeed: 'mc-test', sampleSpins: 0 })
    expect(report.rtp).toBe(engine.rtp)
    expect(report.breakdown).toEqual(engine.breakdown)
    expect(report.precision?.stdErr).toBe(engine.monteCarlo?.stdErr)
    expect(report.precision?.ci95Low).toBe(engine.monteCarlo?.ci95[0])
    expect(report.precision?.ci95High).toBe(engine.monteCarlo?.ci95[1])
  })

  it('신뢰구간 반폭이 1.96 x 표준오차다', () => {
    const precision = report.precision
    expect(precision).not.toBeNull()
    if (precision === null) return
    expect(precision.ci95HalfWidth).toBeCloseTo(1.96 * precision.stdErr, 12)
  })

  it('RTP 분해의 합이 전체 RTP다', () => {
    const sum = report.breakdown.lines + report.breakdown.scatter + report.breakdown.freeSpins
    expect(sum).toBeCloseTo(report.rtp, 10)
  })

  it('해석·전수 모드에는 정밀도가 없다', () => {
    expect(analyzeDistribution(classic.math, BET).precision).toBeNull()
    expect(analyzeDistribution(fruit.math, BET, { sampleSpins: 1_000 }).precision).toBeNull()
  })

  it('같은 시드는 같은 RTP를 낸다', () => {
    const again = analyzeDistribution(mcMath(), MC_BET, { sampleSpins: SPINS, sampleSeed: 'mc-test' })
    expect(again.rtp).toBe(report.rtp)
    expect(again.precision?.ci95HalfWidth).toBe(report.precision?.ci95HalfWidth)
  })

  it('닫힌 식이 없는 모델에 해석적 값을 쓰지 않는다', () => {
    // computeAnalyticRtp는 이런 모델에도 던지지 않고 조용히 틀린 값을 준다. 그걸 쓰면 안 된다.
    const wrong = computeAnalyticRtp(mcMath(), MC_BET)
    expect(report.rtp).not.toBe(wrong.rtp)
  })
})

describe('몬테카를로 수용 판정 (두 관문 공용)', () => {
  const target = mcMath().rtpTarget
  /** 반폭 h를 만드는 표준오차. h = 1.96 x SE. */
  const seFor = (halfWidth: number): number => halfWidth / Z95

  function fakeReport(rtp: number, halfWidth: number): DistributionReport {
    const base = analyzeDistribution(mcMath(), MC_BET, { sampleSpins: 1_000, sampleSeed: 'g' })
    return {
      ...base,
      method: 'monte-carlo',
      rtp,
      precision: {
        spins: 1_000_000,
        seed: '42',
        stdErr: seFor(halfWidth),
        ci95HalfWidth: halfWidth,
        ci95Low: rtp - halfWidth,
        ci95High: rtp + halfWidth,
      },
    }
  }

  describe('audit 모드 — 거리와 정밀도를 함께 본다', () => {
    it('목표 안 + 신뢰구간 좁음 = 통과', () => {
      const v = acceptMonteCarloRtp({ rtp: target + 0.003, target, stdErr: seFor(0.001) }, 'audit')
      expect(v).toMatchObject({ mode: 'audit', withinTarget: true, precise: true, pass: true })
    })

    it('목표 안이어도 신뢰구간이 넓으면 표본 부족으로 탈락', () => {
      const v = acceptMonteCarloRtp({ rtp: target, target, stdErr: seFor(0.004) }, 'audit')
      expect(v.withinTarget).toBe(true)
      expect(v.precise).toBe(false)
      expect(v.pass).toBe(false)
    })

    it('신뢰구간이 좁아도 목표를 벗어나면 탈락', () => {
      const v = acceptMonteCarloRtp({ rtp: target + 0.006, target, stdErr: seFor(0.0005) }, 'audit')
      expect(v.withinTarget).toBe(false)
      expect(v.pass).toBe(false)
    })

    it('허용 오차는 표본과 무관하게 0.5%p 고정이다', () => {
      expect(acceptMonteCarloRtp({ rtp: target, target, stdErr: seFor(0.01) }, 'audit').tolerance).toBe(
        RTP_TOLERANCE,
      )
    })

    it('경계값은 양쪽 다 통과다', () => {
      // 거리 경계는 부동소수 표현 때문에 정확히 짚을 수 없어 바로 안쪽으로 잡는다.
      const v = acceptMonteCarloRtp(
        { rtp: target + RTP_TOLERANCE * 0.999, target, stdErr: seFor(MAX_CI95_HALF_WIDTH) },
        'audit',
      )
      expect(v.pass).toBe(true)
    })
  })

  describe('ci 모드 — 크게 어긋난 모델만 잡는다', () => {
    it('허용 오차가 max(0.5%p, 3xSE)로 넓어진다', () => {
      const stdErr = 0.004
      const v = acceptMonteCarloRtp({ rtp: target + 0.011, target, stdErr }, 'ci')
      expect(v.tolerance).toBeCloseTo(3 * stdErr, 12)
      expect(v.pass).toBe(true)
    })

    it('표본이 정밀하면 0.5%p 바닥이 적용된다', () => {
      const v = acceptMonteCarloRtp({ rtp: target + 0.004, target, stdErr: 0.0001 }, 'ci')
      expect(v.tolerance).toBe(RTP_TOLERANCE)
      expect(v.pass).toBe(true)
    })

    it('정밀도는 묻지 않는다', () => {
      const v = acceptMonteCarloRtp({ rtp: target, target, stdErr: seFor(0.05) }, 'ci')
      expect(v.precise).toBe(true)
      expect(v.pass).toBe(true)
    })

    it('허용 오차를 넘으면 그래도 떨어진다', () => {
      expect(acceptMonteCarloRtp({ rtp: target + 0.05, target, stdErr: 0.001 }, 'ci').pass).toBe(false)
    })
  })

  it('같은 측정에서 두 모드의 판정이 갈릴 수 있다', () => {
    // 이것이 두 관문을 나눈 이유다. CI는 통과시키고 정식 감사는 표본 부족으로 막는다.
    const measurement = { rtp: target, target, stdErr: seFor(0.014) }
    expect(acceptMonteCarloRtp(measurement, 'ci').pass).toBe(true)
    expect(acceptMonteCarloRtp(measurement, 'audit').pass).toBe(false)
  })

  it('delta의 부호가 살아 있다', () => {
    expect(acceptMonteCarloRtp({ rtp: target - 0.002, target, stdErr: 0.0001 }, 'audit').delta).toBeCloseTo(
      -0.002,
      12,
    )
  })

  it('리포트 게이트는 audit 모드를 쓴다', () => {
    // 두 곳이 갈라지면 CI는 통과하는데 리포트는 실패하는 상황이 생긴다.
    for (const [rtp, halfWidth] of [
      [target, 0.001],
      [target, 0.004],
      [target + 0.006, 0.001],
    ] as const) {
      const gate = rtpGate(mcMath(), fakeReport(rtp, halfWidth), rtp - target, '몬테카를로')
      expect(gate.pass).toBe(acceptMonteCarloRtp({ rtp, target, stdErr: seFor(halfWidth) }, 'audit').pass)
    }
  })

  it('정밀도가 기록되지 않으면 무조건 실패다', () => {
    const broken = { ...fakeReport(target, 0.001), precision: null }
    const gate = rtpGate(mcMath(), broken, 0, '몬테카를로')
    expect(gate.pass).toBe(false)
    expect(gate.detail).toContain('신뢰구간이 기록되지 않았다')
  })

  it('spins·seed·stderr·ci95를 판정 문구에 전부 남긴다', () => {
    const gate = rtpGate(mcMath(), fakeReport(target, 0.001), 0, '몬테카를로')
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

  it('기본 스핀 수는 200만이다', () => {
    expect(BET_LEVEL_MC_SPINS).toBe(2_000_000)
  })

  it('레벨 판정은 자기 신뢰구간을 감안한다', () => {
    // 고정 ±0.5%p로 자르면 표본 오차만으로 떨어지는 레벨이 생긴다.
    expect(betLevelPasses(0.009, 0.014)).toBe(true)
    expect(betLevelPasses(0.009, null)).toBe(false)
    expect(betLevelPasses(0.03, 0.014)).toBe(false)
    // 전수·해석 모델은 신뢰구간이 없으므로 예전과 같이 ±0.5%p로 자른다.
    expect(betLevelPasses(0.004, null)).toBe(true)
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
  const math = mcMath()
  const result = runAudit(math, null, {
    totalBet: MC_BET,
    spins: 30_000,
    seed: '42',
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
    expect(markdown).toContain('RTP (표본 추정)')
  })

  it('베팅 레벨 표에 방법과 신뢰구간 열이 있다', () => {
    const markdown = buildAuditMarkdown(result)
    expect(markdown).toContain('| 95% CI |')
    expect(markdown).toContain('| 방법 |')
  })

  it('3만 스핀으로는 신뢰구간이 넓어 표본 부족으로 떨어진다', () => {
    // 정밀도 요구가 실제로 물리는지 확인한다. 통과시키려면 스핀을 더 줘야 한다.
    const gate = result.gates.find((row) => row.label.includes('RTP가 목표'))
    expect(gate?.pass).toBe(false)
    expect(gate?.detail).toContain('표본 부족')
  })
})
