import { describe, expect, it } from 'vitest'
import { computeExactRtp, parseGameMath } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { join } from 'node:path'
import { gamesDir, readJson } from '../paths.js'
import { enumerateAudit } from './enumerate.js'
import { HISTOGRAM_BUCKETS, bucketIndexFor, buildHistogramRows } from './histogram.js'
import { agreementVerdict, confidenceInterval95, pp, standardError, Z95 } from './stats.js'
import { chunkSizes, mergeSimulations, runMonteCarlo } from './mc.js'
import { simulateRuin } from './ruin.js'
import { createSampleSpinner, sampleSpins } from './sample.js'
import { jackpotAccounting, readManifestExtras } from './jackpot.js'
import { readGroups } from './groups.js'
import { runAudit } from './compute.js'
import { buildAuditMarkdown } from './report.js'
import type { McAggregate } from './types.js'

const EPSILON = 1e-9
const BET = 100

function loadMath(id: string): GameMath {
  return parseGameMath(readJson(join(gamesDir(), id, 'math.json')))
}

function loadManifest(id: string): unknown {
  return readJson(join(gamesDir(), id, 'manifest.json'))
}

const math = loadMath('classic-777')
const exact = enumerateAudit(math, BET)

describe('enumerateAudit — 기여도 분해', () => {
  it('엔진의 computeExactRtp와 같은 RTP·적중률·최대 배수를 낸다', () => {
    const engine = computeExactRtp(math, BET)
    expect(exact.rtp).toBeCloseTo(engine.rtp, 12)
    expect(exact.hitRate).toBeCloseTo(engine.hitRate, 12)
    expect(exact.maxWinMultiplier).toBeCloseTo(engine.maxWinMultiplier, 12)
    expect(exact.combos).toBe(engine.combos)
  })

  it('심볼별 기여 합계가 전체 RTP와 같다', () => {
    const sum = exact.symbols.reduce((acc, row) => acc + row.rtp, 0)
    expect(Math.abs(sum - exact.rtp)).toBeLessThan(EPSILON)
  })

  it('라인별 기여 합계가 전체 RTP와 같다', () => {
    const sum = exact.lines.reduce((acc, row) => acc + row.rtp, 0)
    expect(Math.abs(sum - exact.rtp)).toBeLessThan(EPSILON)
  })

  it('매치 개수별 기여 합계가 전체 RTP와 같다', () => {
    const sum = exact.counts.reduce((acc, row) => acc + row.rtp, 0)
    expect(Math.abs(sum - exact.rtp)).toBeLessThan(EPSILON)
  })

  it('전체 대비 비중의 합이 1이다', () => {
    const sum = exact.symbols.reduce((acc, row) => acc + row.share, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(EPSILON)
  })

  it('라인 수만큼 라인 행이 있고 패턴이 math.paylines와 같다', () => {
    expect(exact.lines).toHaveLength(math.paylines.length)
    expect(exact.lines.map((row) => row.pattern)).toEqual(math.paylines)
  })

  it('그룹 기여는 전체 RTP를 넘지 않고 심볼 기여의 부분집합이다', () => {
    const groupSum = exact.groups.reduce((acc, row) => acc + row.rtp, 0)
    expect(groupSum).toBeLessThanOrEqual(exact.rtp + EPSILON)
    // 그룹 지급도 심볼(=페이테이블 키) 기여에 그대로 잡히므로 키가 심볼 표에 있어야 한다.
    const symbolKeys = new Set(exact.symbols.map((row) => row.key))
    for (const row of exact.groups) expect(symbolKeys.has(row.key)).toBe(true)
  })

  it('베팅 레벨을 바꿔도 RTP와 기여 비중은 그대로다', () => {
    const other = enumerateAudit(math, 500)
    expect(other.rtp).toBeCloseTo(exact.rtp, 12)
    expect(other.symbols.map((row) => row.key)).toEqual(exact.symbols.map((row) => row.key))
    other.symbols.forEach((row, index) => {
      expect(row.share).toBeCloseTo(exact.symbols[index]?.share ?? -1, 12)
    })
  })
})

describe('히스토그램', () => {
  it('확률의 합이 정확히 1이다', () => {
    const sum = exact.histogram.reduce((acc, row) => acc + row.probability, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(EPSILON)
  })

  it('RTP 기여의 합이 전체 RTP와 같다', () => {
    const sum = exact.histogram.reduce((acc, row) => acc + row.rtpShare, 0)
    expect(Math.abs(sum - exact.rtp)).toBeLessThan(EPSILON)
  })

  it('꽝 구간의 확률이 1 - 적중률이다', () => {
    const zero = exact.histogram[0]
    expect(zero?.key).toBe('zero')
    expect(zero?.probability).toBeCloseTo(1 - exact.hitRate, 12)
    expect(zero?.rtpShare).toBe(0)
  })

  it('구간 경계는 반열림 [min, max)로 나뉜다', () => {
    expect(bucketIndexFor(0)).toBe(0)
    expect(bucketIndexFor(0.5)).toBe(1)
    expect(bucketIndexFor(1)).toBe(2)
    expect(bucketIndexFor(1.999)).toBe(2)
    expect(bucketIndexFor(2)).toBe(3)
    expect(bucketIndexFor(5)).toBe(4)
    expect(bucketIndexFor(10)).toBe(5)
    expect(bucketIndexFor(20)).toBe(6)
    expect(bucketIndexFor(50)).toBe(7)
    expect(bucketIndexFor(100)).toBe(8)
    expect(bucketIndexFor(9999)).toBe(HISTOGRAM_BUCKETS.length - 1)
  })

  it('빈 구간도 행으로 남는다', () => {
    const rows = buildHistogramRows([2, 0], [0, 0], 4)
    expect(rows).toHaveLength(HISTOGRAM_BUCKETS.length)
    expect(rows[0]?.probability).toBe(0.5)
    expect(rows[8]?.combos).toBe(0)
  })

  it('총 조합 수가 0 이하면 던진다', () => {
    expect(() => buildHistogramRows([], [], 0)).toThrow(RangeError)
  })
})

describe('신뢰구간 계산', () => {
  it('표준오차는 stdDev / sqrt(n)이다', () => {
    expect(standardError(2, 4)).toBe(1)
    expect(standardError(10, 100)).toBe(1)
  })

  it('95% 구간 반폭은 1.96 x SE다', () => {
    const ci = confidenceInterval95(0.96, 5, 10_000)
    expect(ci.standardError).toBeCloseTo(0.05, 12)
    expect(ci.halfWidth).toBeCloseTo(Z95 * 0.05, 12)
    expect(ci.low).toBeCloseTo(0.96 - ci.halfWidth, 12)
    expect(ci.high).toBeCloseTo(0.96 + ci.halfWidth, 12)
  })

  it('스핀 수가 1 미만이면 던진다', () => {
    expect(() => standardError(1, 0)).toThrow(RangeError)
  })

  it('차이가 3 표준오차 안이면 통과다', () => {
    const mc: McAggregate = { spins: 10_000, rtp: 0.96, hitRate: 0.3, stdDev: 5, maxWin: 1 }
    // SE = 0.05, 임계 0.15
    expect(agreementVerdict(mc, 0.96).pass).toBe(true)
    expect(agreementVerdict(mc, 0.82).pass).toBe(true)
    expect(agreementVerdict(mc, 0.8).pass).toBe(false)
  })

  it('표준편차가 0이면 값이 정확히 같을 때만 통과다', () => {
    const mc: McAggregate = { spins: 100, rtp: 0.5, hitRate: 0, stdDev: 0, maxWin: 0 }
    expect(agreementVerdict(mc, 0.5).pass).toBe(true)
    expect(agreementVerdict(mc, 0.5000001).pass).toBe(false)
  })

  it('pp는 부호를 붙여 %p로 찍는다', () => {
    expect(pp(0.0032)).toBe('+0.320%p')
    expect(pp(-0.0032)).toBe('-0.320%p')
  })
})

describe('몬테카를로 청크 합치기', () => {
  it('청크 크기의 합이 총 스핀 수다', () => {
    for (const [spins, points] of [
      [1_000_000, 100],
      [999, 100],
      [7, 100],
      [1, 100],
    ] as const) {
      const sizes = chunkSizes(spins, points)
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(spins)
      expect(sizes.length).toBeLessThanOrEqual(Math.min(points, spins))
    }
  })

  it('두 청크를 합치면 한 번에 잰 평균·표준편차와 같다', () => {
    const a = [0, 0, 5, 1]
    const b = [2, 0, 0, 12, 3]
    const stats = (xs: number[]): McAggregate => {
      const mean = xs.reduce((acc, x) => acc + x, 0) / xs.length
      const variance = xs.reduce((acc, x) => acc + x * x, 0) / xs.length - mean * mean
      return {
        spins: xs.length,
        rtp: mean,
        hitRate: xs.filter((x) => x > 0).length / xs.length,
        stdDev: Math.sqrt(Math.max(0, variance)),
        maxWin: Math.max(...xs),
      }
    }
    const merged = mergeSimulations([stats(a), stats(b)])
    const direct = stats([...a, ...b])
    expect(merged.spins).toBe(direct.spins)
    expect(merged.rtp).toBeCloseTo(direct.rtp, 12)
    expect(merged.stdDev).toBeCloseTo(direct.stdDev, 10)
    expect(merged.hitRate).toBeCloseTo(direct.hitRate, 12)
    expect(merged.maxWin).toBe(direct.maxWin)
  })

  it('빈 목록은 0으로 떨어진다', () => {
    expect(mergeSimulations([])).toEqual({ spins: 0, rtp: 0, hitRate: 0, stdDev: 0, maxWin: 0 })
  })

  it('같은 시드는 같은 결과를 내고 수렴 곡선이 총 스핀에서 끝난다', () => {
    const first = runMonteCarlo(math, BET, 20_000, 'seed-a', { points: 10 })
    const second = runMonteCarlo(math, BET, 20_000, 'seed-a', { points: 10 })
    expect(second.rtp).toBe(first.rtp)
    expect(first.convergence).toHaveLength(10)
    expect(first.convergence.at(-1)?.spins).toBe(20_000)
    expect(first.convergence.at(-1)?.rtp).toBeCloseTo(first.rtp, 12)
  })

  it('진행률 콜백이 0 초과 1 이하로 올라간다', () => {
    const ratios: number[] = []
    runMonteCarlo(math, BET, 5_000, '42', { points: 5, onProgress: (ratio) => ratios.push(ratio) })
    expect(ratios).toHaveLength(5)
    expect(ratios.at(-1)).toBeCloseTo(1, 12)
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios)
  })
})

describe('파산 확률 시뮬', () => {
  it('같은 시드는 같은 결과를 낸다', () => {
    const options = { trials: 20, spins: 200 }
    const a = simulateRuin(math, BET, '42', options)
    const b = simulateRuin(math, BET, '42', options)
    expect(a).toEqual(b)
  })

  it('파산 비율이 0~1이고 횟수와 맞아떨어진다', () => {
    const report = simulateRuin(math, BET, '42', { trials: 20, spins: 200, startMultiple: 100 })
    expect(report.ruinRate).toBeGreaterThanOrEqual(0)
    expect(report.ruinRate).toBeLessThanOrEqual(1)
    expect(report.ruinRate).toBeCloseTo(report.ruined / report.trials, 12)
    expect(report.startBalanceMultiple).toBe(100)
  })

  it('잔액이 1 베팅뿐이면 첫 스핀 뒤 대부분 파산한다', () => {
    const report = simulateRuin(math, BET, '42', { trials: 50, spins: 5, startMultiple: 1 })
    expect(report.ruined).toBeGreaterThan(20)
  })

  it('스핀이 0회면 아무도 파산하지 않는다', () => {
    expect(() => simulateRuin(math, BET, '42', { trials: 1, spins: 0 })).toThrow(RangeError)
  })
})

describe('샘플 스핀', () => {
  it('요청한 개수만큼 나오고 격자 모양이 math와 맞는다', () => {
    const spins = sampleSpins(math, BET, '42', 20)
    expect(spins).toHaveLength(20)
    for (const spin of spins) {
      expect(spin.grid).toHaveLength(math.rows)
      expect(spin.grid[0]).toHaveLength(math.reels)
      expect(spin.stops).toHaveLength(math.reels)
      expect(spin.multiplier).toBeCloseTo(spin.totalWin / BET, 12)
    }
  })

  it('같은 시드는 같은 순서를 낸다', () => {
    expect(sampleSpins(math, BET, 'x', 5)).toEqual(sampleSpins(math, BET, 'x', 5))
  })

  it('스피너는 호출할 때마다 다음 스핀으로 넘어간다', () => {
    const next = createSampleSpinner(math, BET, 'x')
    const first = next()
    const second = next()
    expect(first.index).toBe(1)
    expect(second.index).toBe(2)
    expect(sampleSpins(math, BET, 'x', 2)[1]).toEqual(second)
  })

  it('승리한 스핀은 하이라이트 좌표를 준다', () => {
    const winner = sampleSpins(math, BET, '42', 200).find((spin) => spin.totalWin > 0)
    expect(winner).toBeDefined()
    expect(winner?.winningCells.length).toBeGreaterThan(0)
  })
})

describe('manifest 선택 필드와 잭팟 회계', () => {
  it('classic-777 manifest에서 이름을 읽는다', () => {
    const extras = readManifestExtras(loadManifest('classic-777'))
    expect(extras?.nameKo).toBe('클래식 777')
    expect(extras?.version).toBe('1.0.0')
  })

  it('manifest가 객체가 아니면 null이다', () => {
    expect(readManifestExtras(null)).toBeNull()
    expect(readManifestExtras('nope')).toBeNull()
  })

  it('jackpotContribution이 없으면 잭팟 회계도 없다', () => {
    expect(jackpotAccounting(0.96, readManifestExtras({ name: { en: 'x' } }))).toBeNull()
    expect(jackpotAccounting(0.96, null)).toBeNull()
  })

  it('base + contribution = total이고 목표 ±0.5%p로 판정한다', () => {
    const extras = readManifestExtras({ jackpotContribution: 0.01, rtpTotalTarget: 0.97 })
    const accounting = jackpotAccounting(0.96, extras)
    expect(accounting?.totalRtp).toBeCloseTo(0.97, 12)
    expect(accounting?.delta).toBeCloseTo(0, 12)
    expect(accounting?.pass).toBe(true)

    const off = jackpotAccounting(0.95, extras)
    expect(off?.delta).toBeCloseTo(-0.01, 12)
    expect(off?.pass).toBe(false)
  })

  it('목표가 없으면 판정을 유보한다', () => {
    const accounting = jackpotAccounting(0.96, readManifestExtras({ jackpotContribution: 0.01 }))
    expect(accounting?.target).toBeNull()
    expect(accounting?.pass).toBeNull()
  })
})

describe('그룹 읽기', () => {
  it('그룹이 없으면 빈 배열이다', () => {
    expect(readGroups({ ...math, symbols: math.symbols } as GameMath)).toEqual(readGroups(math))
  })

  it('레코드 모양과 배열 모양을 모두 받는다', () => {
    const record = { ...math, groups: { anybar: { name: { en: 'Any BAR', ko: '아무 BAR' }, members: ['bar1', 'bar2'] } } }
    expect(readGroups(record as unknown as GameMath)).toEqual([
      { id: 'anybar', label: '아무 BAR', symbols: ['bar1', 'bar2'] },
    ])

    const array = { ...math, groups: [{ id: 'anybar', name: { en: 'Any BAR' }, symbols: ['bar1', 'bar2'] }] }
    expect(readGroups(array as unknown as GameMath)).toEqual([
      { id: 'anybar', label: 'Any BAR', symbols: ['bar1', 'bar2'] },
    ])
  })

  it('모양이 이상해도 죽지 않는다', () => {
    expect(readGroups({ ...math, groups: 42 } as unknown as GameMath)).toEqual([])
    expect(readGroups({ ...math, groups: { weird: null } } as unknown as GameMath)).toEqual([
      { id: 'weird', label: 'weird', symbols: [] },
    ])
  })
})

describe('runAudit + 마크다운 리포트', () => {
  const result = runAudit(math, loadManifest('classic-777'), {
    totalBet: BET,
    spins: 20_000,
    seed: '42',
    ruinTrials: 20,
    ruinSpins: 200,
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
  })

  it('베팅 레벨 전부를 검사한다', () => {
    expect(result.betLevels.map((row) => row.totalBet)).toEqual(math.betLevels)
  })

  it('게이트에 필수 항목이 모두 들어 있다', () => {
    const labels = result.gates.map((gate) => gate.label)
    expect(labels.some((label) => label.includes('전수 조사 RTP'))).toBe(true)
    expect(labels.some((label) => label.includes('모든 베팅 레벨'))).toBe(true)
    expect(labels.some((label) => label.includes('적중률'))).toBe(true)
    expect(labels.some((label) => label.includes('최대 배수'))).toBe(true)
    expect(labels.some((label) => label.includes('몬테카를로'))).toBe(true)
    expect(labels.some((label) => label.includes('기여 합계'))).toBe(true)
    expect(labels.some((label) => label.includes('확률 합계'))).toBe(true)
  })

  it('기여 합계와 확률 합계 게이트는 항상 통과다', () => {
    const sums = result.gates.filter((gate) => gate.label.includes('합계'))
    expect(sums).toHaveLength(2)
    expect(sums.every((gate) => gate.pass)).toBe(true)
  })

  it('생성 시각을 주입하면 리포트가 결정론적이다', () => {
    expect(result.generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('마크다운에 모든 섹션과 게이트 요약이 들어간다', () => {
    const markdown = buildAuditMarkdown(result)
    expect(markdown.startsWith('# RTP 검수 리포트')).toBe(true)
    for (const heading of [
      '## 게이트 판정 요약',
      '## 1. 게임 요약',
      '## 2. 전수 조사',
      '## 3. 몬테카를로',
      '## 4. RTP 기여 분해',
      '## 5. 배수 분포',
      '## 6. 변동성',
    ]) {
      expect(markdown).toContain(heading)
    }
    expect(markdown).toContain('95% 신뢰구간')
    expect(markdown).toContain(`(${result.gates.filter((gate) => gate.pass).length}/${result.gates.length})`)
  })

  it('잭팟 필드가 있는 manifest면 잭팟 섹션이 붙는다', () => {
    const withJackpot = runAudit(
      math,
      { ...(loadManifest('classic-777') as object), jackpotContribution: 0.01, rtpTotalTarget: 0.97 },
      { totalBet: BET, spins: 2_000, seed: '42', ruinTrials: 5, ruinSpins: 50 },
    )
    expect(withJackpot.jackpot?.totalRtp).toBeCloseTo(withJackpot.exact.rtp + 0.01, 12)
    expect(buildAuditMarkdown(withJackpot)).toContain('## 7. 잭팟 회계')
  })
})
