import { computeAnalyticRtp, createSeededRng } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { Accumulators, comboCount, countRows, lineRows, toContributionRows } from './contributions.js'
import { buildLabelMap } from './groups.js'
import { HISTOGRAM_BUCKETS, bucketIndexFor, buildHistogramRows } from './histogram.js'
import { betPerLineOf, playRound } from './spinner.js'
import type { DistributionReport } from './types.js'

/** 해석 모드에서 분포·기여도를 추정할 기본 유료 스핀 수. */
export const DEFAULT_SAMPLE_SPINS = 2_000_000

export interface SampleOptions {
  spins?: number
  seed?: string
  /** 라운드를 나눠 돌리며 0~1 진행률을 알린다. */
  onProgress?: (ratio: number) => void
}

/** 진행률 콜백을 부를 횟수. 100이면 1%마다. */
const PROGRESS_STEPS = 100

/**
 * 전수 조사가 불가능한 모델의 분포·기여도를 고정 시드 표본으로 추정한다.
 *
 * RTP 자체는 표본이 아니라 엔진의 **해석적 정확값**을 쓴다. 표본은 닫힌 식으로 나오지 않는
 * 것들(적중률·최대 배수·배수 분포·심볼별 기여)만 맡는다.
 *
 * 관측 단위는 **라운드**다. 유료 스핀 1회가 프리스핀을 열면 그 라운드를 끝까지 돌리고
 * 거기서 딴 것도 그 유료 스핀에 얹는다. `simulate`와 같은 단위라서 두 값을 바로 비교할 수 있다.
 */
export function sampleDistribution(
  math: GameMath,
  totalBet: number,
  options: SampleOptions = {},
): DistributionReport {
  const spins = options.spins ?? DEFAULT_SAMPLE_SPINS
  const seed = options.seed ?? 'audit-sample'
  if (!Number.isInteger(spins) || spins < 1) {
    throw new RangeError(`표본 스핀 수는 1 이상의 정수여야 한다: ${spins}`)
  }

  const betPerLine = betPerLineOf(math, totalBet)
  const analytic = computeAnalyticRtp(math, totalBet)
  const labels = buildLabelMap(math)
  const acc = new Accumulators(math)
  const bucketCounts = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0)
  const bucketMultiplier = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0)

  const rng = createSeededRng(`${seed}:distribution`)
  const step = Math.max(1, Math.floor(spins / PROGRESS_STEPS))
  let hits = 0
  let maxWin = 0
  let freeSpinsPlayed = 0
  let triggers = 0

  for (let i = 0; i < spins; i += 1) {
    const round = playRound(math, totalBet, betPerLine, rng)
    let roundWin = 0

    for (const entry of round) {
      if (entry.isFreeSpin) freeSpinsPlayed += 1
      roundWin += entry.spin.totalWin
      for (const win of entry.spin.wins) acc.addLine(win, entry.multiplier)
      if (entry.spin.scatterWin > 0) {
        const scatterFeature = entry.spin.features.find((feature) => feature.type === 'scatterWin')
        const count = scatterFeature?.type === 'scatterWin' ? scatterFeature.count : 0
        acc.addScatter(count, entry.spin.scatterWin * entry.multiplier)
      }
    }
    if (round.length > 1) triggers += 1

    if (roundWin > 0) {
      hits += 1
      if (roundWin > maxWin) maxWin = roundWin
    }
    const multiplier = roundWin / totalBet
    const bucket = bucketIndexFor(multiplier)
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1
    bucketMultiplier[bucket] = (bucketMultiplier[bucket] ?? 0) + multiplier

    if ((i + 1) % step === 0) options.onProgress?.((i + 1) / spins)
  }
  options.onProgress?.(1)

  const denominator = spins * totalBet
  return {
    method: 'analytic',
    estimated: true,
    totalBet,
    betPerLine,
    combos: comboCount(math),
    observations: spins,
    sampleSeed: seed,
    rtp: analytic.rtp,
    breakdown: analytic.breakdown,
    contributionTotal: acc.total / denominator,
    hitRate: hits / spins,
    maxWinMultiplier: maxWin / totalBet,
    winObservations: hits,
    symbols: toContributionRows(acc.symbols, labels, denominator, 1),
    groups: toContributionRows(acc.groups, labels, denominator, 1),
    lines: lineRows(math, acc, denominator, 1),
    counts: countRows(acc, denominator, 1),
    histogram: buildHistogramRows(bucketCounts, bucketMultiplier, spins),
    observedFeatures: { triggers, freeSpins: freeSpinsPlayed, spins },
  }
}
