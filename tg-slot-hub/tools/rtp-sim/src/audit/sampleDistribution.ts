import { computeAnalyticRtp, computeExactRtp, createSeededRng, isAnalytic } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import {
  Accumulators,
  comboCount,
  countRows,
  lineRows,
  mutationRows,
  toContributionRows,
  waysRows,
} from './contributions.js'
import { buildLabelMap } from './groups.js'
import { HISTOGRAM_BUCKETS, bucketIndexFor, buildHistogramRows } from './histogram.js'
import { betPerLineOf, playRound } from './spinner.js'
import type { DistributionMethod, DistributionReport, RtpPrecision } from './types.js'

/** 해석 모드에서 분포·기여도를 추정할 기본 유료 스핀 수. */
export const DEFAULT_SAMPLE_SPINS = 2_000_000

/**
 * 몬테카를로 모델의 기본 스핀 수.
 *
 * RTP까지 표본이라 95% 신뢰구간 반폭 0.2%p를 맞춰야 게이트를 통과한다.
 * 지금 팩들의 분산에서 그 폭을 넘기려면 2천3백만 스핀쯤이 필요하다. 여유를 둬 2천5백만으로 잡는다.
 * (2천만에서는 sheriff-sixgun이 반폭 0.214%p로 아슬하게 걸렸다.)
 * 2백만으로는 0.6%p 수준이라 "목표 안에 있다"는 판정 자체가 성립하지 않는다.
 */
export const DEFAULT_MC_SAMPLE_SPINS = 25_000_000

export interface SampleOptions {
  spins?: number
  seed?: string
  /**
   * RTP를 어디서 가져올지.
   * - `analytic`(기본) — 닫힌 식의 정확값. 표본은 분포·기여도만 맡는다.
   * - `sample` — 표본 평균. 닫힌 식이 없는 모델(뮤테이션·캐스케이드 등)에서 쓴다.
   */
  rtpSource?: 'analytic' | 'sample'
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

  const rtpSource = options.rtpSource ?? 'analytic'
  const betPerLine = betPerLineOf(math, totalBet)

  /*
   * RTP와 그 분해는 **엔진의 디스패처**에서 가져온다.
   *
   * 닫힌 식이 성립하는 모델은 `computeAnalyticRtp`가 정확값을 주지만, 성립하지 않는 모델에서는
   * 그 함수가 던지지 않고 조용히 틀린 값을 준다 (뮤테이션 몫을 통째로 빼먹는다).
   * 그래서 `isAnalytic`으로 갈라 몬테카를로 모델은 `computeExactRtp`의 몬테카를로 경로를 쓴다.
   * 게이트 테스트도 같은 함수를 부르므로 두 곳의 숫자가 어긋날 수 없다.
   */
  const analyticSafe = isAnalytic(math)
  const engineMc =
    rtpSource === 'sample' || !analyticSafe
      ? computeExactRtp(math, totalBet, { mcSpins: spins, mcSeed: seed, sampleSpins: 0 })
      : null
  const analytic = analyticSafe ? computeAnalyticRtp(math, totalBet) : null
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
  let cappedSpins = 0
  let cappedSpinsLost = 0

  for (let i = 0; i < spins; i += 1) {
    const round = playRound(math, totalBet, betPerLine, rng)
    let roundWin = 0

    for (const entry of round) {
      if (entry.isFreeSpin) freeSpinsPlayed += 1
      roundWin += entry.spin.totalWin
      for (const feature of entry.spin.features) {
        if (feature.type !== 'freeSpinsCapped') continue
        cappedSpins += 1
        cappedSpinsLost += feature.requested - feature.granted
      }
      for (const win of entry.spin.wins) acc.addLine(win, entry.multiplier)
      if (entry.spin.scatterWin > 0) {
        const scatterFeature = entry.spin.features.find((feature) => feature.type === 'scatterWin')
        const count = scatterFeature?.type === 'scatterWin' ? scatterFeature.count : 0
        acc.addScatter(count, entry.spin.scatterWin * entry.multiplier)
      }
    }
    // 뮤테이션의 RTP 몫은 라운드 총액을 알아야 하므로 라운드가 끝난 뒤 기록한다.
    acc.addRoundMutations(
      round.map((entry) => entry.spin),
      roundWin,
    )
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
  const useEngineMc = engineMc !== null
  const method: DistributionMethod = useEngineMc ? 'monte-carlo' : 'analytic'
  const rtp = useEngineMc ? engineMc.rtp : (analytic?.rtp ?? 0)
  const breakdown = useEngineMc ? engineMc.breakdown : (analytic?.breakdown ?? { lines: 0, scatter: 0, freeSpins: 0 })

  const mcInfo = engineMc?.monteCarlo
  const halfWidth = mcInfo === undefined ? 0 : (mcInfo.ci95[1] - mcInfo.ci95[0]) / 2
  const precision: RtpPrecision | null =
    mcInfo === undefined
      ? null
      : {
          spins: mcInfo.spins,
          seed: mcInfo.seed,
          stdErr: mcInfo.stdErr,
          ci95HalfWidth: halfWidth,
          ci95Low: mcInfo.ci95[0],
          ci95High: mcInfo.ci95[1],
        }

  return {
    method,
    estimated: true,
    totalBet,
    betPerLine,
    combos: comboCount(math),
    observations: spins,
    sampleSeed: seed,
    rtp,
    breakdown,
    contributionTotal: acc.total / denominator,
    hitRate: hits / spins,
    maxWinMultiplier: maxWin / totalBet,
    winObservations: hits,
    symbols: toContributionRows(acc.symbols, labels, denominator, 1),
    groups: toContributionRows(acc.groups, labels, denominator, 1),
    lines: lineRows(math, acc, denominator, 1),
    ways: waysRows(acc, denominator, 1),
    isWays: math.payModel === 'ways',
    mutations: mutationRows(acc, spins, totalBet, rtp),
    counts: countRows(acc, denominator, 1),
    histogram: buildHistogramRows(bucketCounts, bucketMultiplier, spins),
    observedFeatures: { triggers, freeSpins: freeSpinsPlayed, spins, cappedSpins, cappedSpinsLost },
    precision,
  }
}
