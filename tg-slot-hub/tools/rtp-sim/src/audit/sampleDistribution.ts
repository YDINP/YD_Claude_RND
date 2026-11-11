import { computeAnalyticRtp, computeExactRtp, createSeededRng, isAnalytic } from '@tgslot/slot-engine'
import type { GameMath, RtpBreakdown } from '@tgslot/slot-engine'
import { CascadeAccumulator, buildCascadeReport } from './cascadeStats.js'
import type { CascadeAccumulatorData } from './cascadeStats.js'
import {
  Accumulators,
  comboCount,
  countRows,
  lineRows,
  mutationRows,
  toContributionRows,
  waysRows,
} from './contributions.js'
import type { AccumulatorsData } from './contributions.js'
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
  /** 엔진 몬테카를로 측정을 건너뛴다. 튜닝 CLI처럼 표본 자체의 평균·σ만 필요할 때 쓴다. */
  skipEngineMc?: boolean
  /** 라운드를 나눠 돌리며 0~1 진행률을 알린다. */
  onProgress?: (ratio: number) => void
}

/** 진행률 콜백을 부를 횟수. 100이면 1%마다. */
const PROGRESS_STEPS = 100

/** 엔진 몬테카를로(`computeExactRtp`)가 낸 RTP 측정. 샤드끼리 합칠 수 있게 필요한 것만 담는다. */
export interface EngineMcMeasurement {
  spins: number
  seed: string
  rtp: number
  stdErr: number
  ci95: [number, number]
  breakdown: RtpBreakdown
}

/**
 * 표본 한 덩어리의 날것. `finishSample`이 리포트로 바꾼다.
 * 메서드 없는 값만 쓰므로 워커가 구조화 복제로 넘길 수 있고, `mergeSampleStates`로 합친다.
 */
export interface SampleState {
  totalBet: number
  spins: number
  seed: string
  rtpSource: 'analytic' | 'sample'
  acc: AccumulatorsData
  cascade: CascadeAccumulatorData | null
  bucketCounts: number[]
  bucketMultiplier: number[]
  hits: number
  maxWin: number
  /** 라운드 배수의 합과 제곱합. 표본 자체의 RTP와 σ를 낼 때 쓴다. */
  multiplierSum: number
  multiplierSquareSum: number
  freeSpinsPlayed: number
  triggers: number
  cappedSpins: number
  cappedSpinsLost: number
  engine: EngineMcMeasurement | null
}

function needsEngineMc(math: GameMath, rtpSource: 'analytic' | 'sample'): boolean {
  return rtpSource === 'sample' || !isAnalytic(math)
}

/**
 * 표본을 돌려 통만 채운다. RTP와 그 분해는 **엔진의 디스패처**에서 가져온다.
 *
 * 닫힌 식이 성립하는 모델은 `computeAnalyticRtp`가 정확값을 주지만, 성립하지 않는 모델에서는
 * 그 함수가 던지지 않고 조용히 틀린 값을 준다 (뮤테이션 몫을 통째로 빼먹는다).
 * 그래서 `isAnalytic`으로 갈라 몬테카를로 모델은 `computeExactRtp`의 몬테카를로 경로를 쓴다.
 * 게이트 테스트도 같은 함수를 부르므로 두 곳의 숫자가 어긋날 수 없다.
 */
export function collectSample(math: GameMath, totalBet: number, options: SampleOptions = {}): SampleState {
  const spins = options.spins ?? DEFAULT_SAMPLE_SPINS
  const seed = options.seed ?? 'audit-sample'
  if (!Number.isInteger(spins) || spins < 1) {
    throw new RangeError(`표본 스핀 수는 1 이상의 정수여야 한다: ${spins}`)
  }

  const rtpSource = options.rtpSource ?? 'analytic'
  const betPerLine = betPerLineOf(math, totalBet)
  let engine: EngineMcMeasurement | null = null
  if (options.skipEngineMc !== true && needsEngineMc(math, rtpSource)) {
    const report = computeExactRtp(math, totalBet, { mcSpins: spins, mcSeed: seed, sampleSpins: 0 })
    const info = report.monteCarlo
    if (info !== undefined) {
      engine = {
        spins: info.spins,
        seed: info.seed,
        rtp: report.rtp,
        stdErr: info.stdErr,
        ci95: [info.ci95[0], info.ci95[1]],
        breakdown: report.breakdown,
      }
    }
  }

  const acc = new Accumulators(math)
  const cascade = math.cascade === undefined ? null : new CascadeAccumulator(math)
  const bucketCounts = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0)
  const bucketMultiplier = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0)

  const rng = createSeededRng(`${seed}:distribution`)
  const step = Math.max(1, Math.floor(spins / PROGRESS_STEPS))
  let hits = 0
  let maxWin = 0
  let multiplierSum = 0
  let multiplierSquareSum = 0
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
    cascade?.observe(round, totalBet)
    if (round.length > 1) triggers += 1

    if (roundWin > 0) {
      hits += 1
      if (roundWin > maxWin) maxWin = roundWin
    }
    const multiplier = roundWin / totalBet
    multiplierSum += multiplier
    multiplierSquareSum += multiplier * multiplier
    const bucket = bucketIndexFor(multiplier)
    bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + 1
    bucketMultiplier[bucket] = (bucketMultiplier[bucket] ?? 0) + multiplier

    if ((i + 1) % step === 0) options.onProgress?.((i + 1) / spins)
  }
  options.onProgress?.(1)

  return {
    totalBet,
    spins,
    seed,
    rtpSource,
    acc,
    cascade,
    bucketCounts,
    bucketMultiplier,
    hits,
    maxWin,
    multiplierSum,
    multiplierSquareSum,
    freeSpinsPlayed,
    triggers,
    cappedSpins,
    cappedSpinsLost,
    engine,
  }
}

/**
 * 엔진 몬테카를로 측정을 합친다. 평균과 표본분산(n-1)을 제곱합으로 되돌려 더한 뒤 다시 계산한다.
 * 신뢰구간 계수는 엔진과 같은 1.96이다.
 */
export function mergeEngineMeasurements(parts: readonly EngineMcMeasurement[], seed: string): EngineMcMeasurement {
  let spins = 0
  let sum = 0
  let squareSum = 0
  let lines = 0
  let scatter = 0
  for (const part of parts) {
    const n = part.spins
    spins += n
    sum += part.rtp * n
    squareSum += part.stdErr * part.stdErr * n * (n - 1) + n * part.rtp * part.rtp
    lines += part.breakdown.lines * n
    scatter += part.breakdown.scatter * n
  }
  if (spins === 0) throw new RangeError('합칠 측정이 없다')
  const rtp = sum / spins
  const variance = spins > 1 ? Math.max(0, (squareSum - spins * rtp * rtp) / (spins - 1)) : 0
  const stdErr = Math.sqrt(variance / spins)
  const base = { lines: lines / spins, scatter: scatter / spins }
  return {
    spins,
    seed,
    rtp,
    stdErr,
    ci95: [rtp - 1.96 * stdErr, rtp + 1.96 * stdErr],
    breakdown: { ...base, freeSpins: Math.max(0, rtp - base.lines - base.scatter) },
  }
}

/** 샤드별 표본을 하나로 합친다. */
export function mergeSampleStates(math: GameMath, parts: readonly SampleState[], seed: string): SampleState {
  const first = parts[0]
  if (first === undefined) throw new RangeError('합칠 표본이 없다')
  const acc = new Accumulators(math)
  const cascade = math.cascade === undefined ? null : new CascadeAccumulator(math)
  const merged: SampleState = {
    totalBet: first.totalBet,
    spins: 0,
    seed,
    rtpSource: first.rtpSource,
    acc,
    cascade,
    bucketCounts: new Array<number>(HISTOGRAM_BUCKETS.length).fill(0),
    bucketMultiplier: new Array<number>(HISTOGRAM_BUCKETS.length).fill(0),
    hits: 0,
    maxWin: 0,
    multiplierSum: 0,
    multiplierSquareSum: 0,
    freeSpinsPlayed: 0,
    triggers: 0,
    cappedSpins: 0,
    cappedSpinsLost: 0,
    engine: null,
  }
  const engines: EngineMcMeasurement[] = []
  for (const part of parts) {
    acc.absorb(part.acc)
    if (part.cascade !== null) cascade?.absorb(part.cascade)
    part.bucketCounts.forEach((count, index) => {
      merged.bucketCounts[index] = (merged.bucketCounts[index] ?? 0) + count
    })
    part.bucketMultiplier.forEach((value, index) => {
      merged.bucketMultiplier[index] = (merged.bucketMultiplier[index] ?? 0) + value
    })
    merged.spins += part.spins
    merged.hits += part.hits
    merged.maxWin = Math.max(merged.maxWin, part.maxWin)
    merged.multiplierSum += part.multiplierSum
    merged.multiplierSquareSum += part.multiplierSquareSum
    merged.freeSpinsPlayed += part.freeSpinsPlayed
    merged.triggers += part.triggers
    merged.cappedSpins += part.cappedSpins
    merged.cappedSpinsLost += part.cappedSpinsLost
    if (part.engine !== null) engines.push(part.engine)
  }
  if (engines.length > 0) merged.engine = mergeEngineMeasurements(engines, seed)
  return merged
}

/** 채운 통을 리포트로 바꾼다. */
export function finishSample(math: GameMath, state: SampleState): DistributionReport {
  const { totalBet, spins } = state
  const betPerLine = betPerLineOf(math, totalBet)
  const engineMc = needsEngineMc(math, state.rtpSource) ? state.engine : null
  const analytic = isAnalytic(math) ? computeAnalyticRtp(math, totalBet) : null
  const labels = buildLabelMap(math)
  const acc = new Accumulators(math)
  acc.absorb(state.acc)

  const denominator = spins * totalBet
  const method: DistributionMethod = engineMc !== null ? 'monte-carlo' : 'analytic'
  const rtp = engineMc !== null ? engineMc.rtp : (analytic?.rtp ?? 0)
  const breakdown =
    engineMc !== null ? engineMc.breakdown : (analytic?.breakdown ?? { lines: 0, scatter: 0, freeSpins: 0 })

  const precision: RtpPrecision | null =
    engineMc === null
      ? null
      : {
          spins: engineMc.spins,
          seed: engineMc.seed,
          stdErr: engineMc.stdErr,
          ci95HalfWidth: (engineMc.ci95[1] - engineMc.ci95[0]) / 2,
          ci95Low: engineMc.ci95[0],
          ci95High: engineMc.ci95[1],
        }

  const report: DistributionReport = {
    method,
    estimated: true,
    totalBet,
    betPerLine,
    combos: comboCount(math),
    observations: spins,
    sampleSeed: state.seed,
    rtp,
    breakdown,
    contributionTotal: acc.total / denominator,
    hitRate: state.hits / spins,
    maxWinMultiplier: state.maxWin / totalBet,
    winObservations: state.hits,
    symbols: toContributionRows(acc.symbols, labels, denominator, 1),
    groups: toContributionRows(acc.groups, labels, denominator, 1),
    lines: lineRows(math, acc, denominator, 1),
    ways: waysRows(acc, denominator, 1),
    isWays: math.payModel === 'ways',
    mutations: mutationRows(acc, spins, totalBet, rtp),
    counts: countRows(acc, denominator, 1),
    histogram: buildHistogramRows(state.bucketCounts, state.bucketMultiplier, spins),
    observedFeatures: {
      triggers: state.triggers,
      freeSpins: state.freeSpinsPlayed,
      spins,
      cappedSpins: state.cappedSpins,
      cappedSpinsLost: state.cappedSpinsLost,
    },
    precision,
  }
  if (state.cascade !== null) report.cascade = buildCascadeReport(math, state.cascade, totalBet)
  return report
}

/**
 * 전수 조사가 불가능한 모델의 분포·기여도를 고정 시드 표본으로 추정한다.
 *
 * 닫힌 식이 있으면 RTP는 엔진의 **해석적 정확값**을 쓰고, 표본은 닫힌 식으로 나오지 않는
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
  return finishSample(math, collectSample(math, totalBet, options))
}
