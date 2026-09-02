import type { GameMath } from './schema.js'
import { evaluate, evaluateScatter, getBetPerLine, triggersFreeSpins } from './evaluate.js'
import { buildGrid, spinUnchecked } from './spin.js'
import { computeAnalyticRtp, expectedFreeSpinsPerTrigger } from './analytic.js'
import type { RtpBreakdown } from './analytic.js'
import { createSeededRng } from './rng/seeded.js'
import type { Rng, RoundState } from './types.js'

/** 전수 조사 상한. 이보다 큰 모델은 해석적으로 계산한다. */
export const MAX_ENUMERATION_COMBOS = 5_000_000

/** 해석 모드에서 분포(적중률·최대 배수)를 추정할 기본 스핀 수. */
export const DEFAULT_SAMPLE_SPINS = 100_000
export const DEFAULT_SAMPLE_SEED = 'rtp-sample'

/** 한 라운드가 낳을 수 있는 프리스핀 상한. 넘으면 모델이 발산한 것으로 보고 막는다. */
export const MAX_FREE_SPINS_PER_ROUND = 10_000

export interface WinBucket {
  /** 총 베팅액 대비 배수. */
  multiplier: number
  combos: number
  probability: number
  /** 이 버킷이 RTP에 기여하는 몫. */
  rtpShare: number
}

export type RtpMethod = 'enumerate' | 'analytic'

export interface ExactRtpOptions {
  /**
   * 해석 모드에서 적중률·최대 배수·분포를 추정할 몬테카를로 스핀 수.
   * 0이면 측정하지 않고 그 세 값을 비워 둔다 (RTP는 그래도 정확값이다).
   */
  sampleSpins?: number
  sampleSeed?: string | number
}

export interface ExactRtpReport {
  /** 프리스핀 기여까지 포함한 정확한 RTP. */
  rtp: number
  /**
   * 유료 스핀 1회가 기본 게임에서 무언가를 지급할 확률.
   * 프리스핀으로 넘어간 뒤의 승리는 세지 않는다.
   */
  hitRate: number
  combos: number
  /** 기본 게임 기준. 프리스핀 누적은 포함하지 않는다. */
  maxWinMultiplier: number
  /** 배수 오름차순. 무승부(0배)는 제외. 기본 게임 기준. */
  winDistribution: WinBucket[]
  method: RtpMethod
  breakdown: RtpBreakdown
  /**
   * `false`면 `hitRate`·`maxWinMultiplier`·`winDistribution`이 고정 시드 몬테카를로 추정값이다.
   * `sampleSpins: 0`으로 건너뛰었다면 그 셋은 0과 빈 배열이다.
   */
  distributionIsExact: boolean
  /** 한 스핀이 프리스핀을 열 확률. */
  triggerProbability: number
}

interface BaseAccumulator {
  lineSum: number
  scatterSum: number
  hits: number
  maxWin: number
  triggers: number
}

/** 프리스핀이 얹어 주는 몫. 유료 스핀 기대값과 트리거 확률만 있으면 닫힌 식으로 나온다. */
function freeSpinsContribution(math: GameMath, base: number, triggerProbability: number): {
  freeSpins: number
  spinsPerTrigger: number
} {
  const feature = math.scatter?.freeSpins
  if (feature === undefined || triggerProbability <= 0) return { freeSpins: 0, spinsPerTrigger: 0 }
  const spinsPerTrigger = expectedFreeSpinsPerTrigger(feature.count, triggerProbability, feature.retrigger)
  return {
    freeSpins: triggerProbability * spinsPerTrigger * feature.multiplier * base,
    spinsPerTrigger,
  }
}

/** 모든 정지 위치 조합을 실제로 돌려 본다. 3릴처럼 조합이 적은 모델에서만 쓴다. */
function enumerateRtp(math: GameMath, totalBet: number, combos: number): ExactRtpReport {
  const betPerLine = getBetPerLine(math, totalBet)
  const lengths = math.strips.map((strip) => strip.length)
  const stops = new Array<number>(math.reels).fill(0)
  const buckets = new Map<number, number>()
  const acc: BaseAccumulator = { lineSum: 0, scatterSum: 0, hits: 0, maxWin: 0, triggers: 0 }

  for (let i = 0; i < combos; i += 1) {
    const grid = buildGrid(math, stops)
    const { totalWin: lineWin } = evaluate(grid, math, betPerLine)
    const scatter = evaluateScatter(grid, math, totalBet)
    const baseWin = lineWin + scatter.win

    acc.lineSum += lineWin
    acc.scatterSum += scatter.win
    if (triggersFreeSpins(scatter.count, math)) acc.triggers += 1
    if (baseWin > 0) {
      acc.hits += 1
      if (baseWin > acc.maxWin) acc.maxWin = baseWin
      const multiplier = baseWin / totalBet
      buckets.set(multiplier, (buckets.get(multiplier) ?? 0) + 1)
    }

    // 오도미터 방식으로 다음 조합. 릴 0부터 올린다.
    for (let reel = 0; reel < math.reels; reel += 1) {
      const length = lengths[reel] ?? 1
      const next = ((stops[reel] ?? 0) + 1) % length
      stops[reel] = next
      if (next !== 0) break
    }
  }

  const denominator = combos * totalBet
  const lines = acc.lineSum / denominator
  const scatter = acc.scatterSum / denominator
  const triggerProbability = acc.triggers / combos
  const { freeSpins } = freeSpinsContribution(math, lines + scatter, triggerProbability)

  const winDistribution: WinBucket[] = [...buckets.entries()]
    .map(([multiplier, count]) => ({
      multiplier,
      combos: count,
      probability: count / combos,
      rtpShare: (multiplier * count) / combos,
    }))
    .sort((a, b) => a.multiplier - b.multiplier)

  return {
    rtp: lines + scatter + freeSpins,
    hitRate: acc.hits / combos,
    combos,
    maxWinMultiplier: acc.maxWin / totalBet,
    winDistribution,
    method: 'enumerate',
    breakdown: { lines, scatter, freeSpins },
    distributionIsExact: true,
    triggerProbability,
  }
}

interface SampledDistribution {
  hitRate: number
  maxWinMultiplier: number
  winDistribution: WinBucket[]
}

/** 기본 게임만 돌려 적중률과 배수 분포를 추정한다. 시드가 고정이라 결과는 재현된다. */
function sampleBaseDistribution(
  math: GameMath,
  totalBet: number,
  spins: number,
  seed: string | number,
): SampledDistribution {
  const rng = createSeededRng(seed)
  const buckets = new Map<number, number>()
  let hits = 0
  let maxWin = 0

  for (let i = 0; i < spins; i += 1) {
    const { lineWin, scatterWin } = spinUnchecked(math, totalBet, rng)
    const baseWin = lineWin + scatterWin
    if (baseWin <= 0) continue
    hits += 1
    if (baseWin > maxWin) maxWin = baseWin
    const multiplier = baseWin / totalBet
    buckets.set(multiplier, (buckets.get(multiplier) ?? 0) + 1)
  }

  const winDistribution: WinBucket[] = [...buckets.entries()]
    .map(([multiplier, count]) => ({
      multiplier,
      combos: count,
      probability: count / spins,
      rtpShare: (multiplier * count) / spins,
    }))
    .sort((a, b) => a.multiplier - b.multiplier)

  return { hitRate: hits / spins, maxWinMultiplier: maxWin / totalBet, winDistribution }
}

/**
 * 정확한 RTP. 조합 수가 상한 이하면 전수 조사하고, 넘으면 해석적으로 계산한다.
 * 어느 쪽이든 `rtp`는 정확값이며 `method`로 어떤 경로였는지 알 수 있다.
 *
 * 해석 모드에서는 적중률·최대 배수·분포만 고정 시드 몬테카를로로 추정한다.
 * 라인끼리 상관이 있어 그 셋은 닫힌 식으로 나오지 않기 때문이다.
 *
 * `simulate`와 마찬가지로 `betLevels`에 없는 베팅액도 받는다.
 */
export function computeExactRtp(
  math: GameMath,
  totalBet: number,
  options: ExactRtpOptions = {},
): ExactRtpReport {
  const combos = math.strips.reduce((acc, strip) => acc * strip.length, 1)
  if (combos <= MAX_ENUMERATION_COMBOS) return enumerateRtp(math, totalBet, combos)

  const analytic = computeAnalyticRtp(math, totalBet)
  const spins = options.sampleSpins ?? DEFAULT_SAMPLE_SPINS
  const sampled =
    spins > 0
      ? sampleBaseDistribution(math, totalBet, spins, options.sampleSeed ?? DEFAULT_SAMPLE_SEED)
      : { hitRate: 0, maxWinMultiplier: 0, winDistribution: [] }

  return {
    rtp: analytic.rtp,
    hitRate: sampled.hitRate,
    combos: analytic.combos,
    maxWinMultiplier: sampled.maxWinMultiplier,
    winDistribution: sampled.winDistribution,
    method: 'analytic',
    breakdown: analytic.breakdown,
    distributionIsExact: false,
    triggerProbability: analytic.triggerProbability,
  }
}

export interface SimulationReport {
  /** 유료 스핀당 총 환급. 프리스핀에서 딴 것도 그 라운드를 연 유료 스핀에 얹는다. */
  rtp: number
  /** 유료 스핀 중 기본 게임 승리가 있었던 비율. */
  hitRate: number
  /** 라운드 총 승리 배수의 표준편차. 변동성 지표. */
  stdDev: number
  /** 프리스핀 누적을 포함한 라운드 최대 승리 코인. */
  maxWin: number
  /** 유료 스핀 수. */
  spins: number
  /** 전체에서 실제로 돌린 프리스핀 수. */
  freeSpinsPlayed: number
  /** 유료 스핀이 프리스핀을 연 비율. */
  triggerRate: number
  elapsedMs: number
}

/**
 * 몬테카를로 시뮬레이션. 해석적 RTP의 교차 검증과 큰 모델의 회귀 확인용이다.
 * 유료 스핀 1회가 프리스핀을 열면 **그 라운드를 끝까지 돌린 뒤** 다음 유료 스핀으로 넘어간다.
 * 따라서 반환하는 rtp는 `computeExactRtp`와 같은 것을 재는 값이다.
 *
 * 튜닝 편의를 위해 `betLevels`에 없는 베팅액도 받는다 (라인 수로 나누어떨어지기만 하면 된다).
 * 실제 스핀 경로가 아니므로 베팅 레벨 검사를 하지 않는다.
 */
export function simulate(math: GameMath, totalBet: number, spins: number, rng: Rng): SimulationReport {
  if (!Number.isInteger(spins) || spins < 1) {
    throw new RangeError(`spins는 1 이상의 정수여야 한다: ${spins}`)
  }
  const startedAt = performance.now()
  let winSum = 0
  let squareSum = 0
  let hits = 0
  let maxWin = 0
  let freeSpinsPlayed = 0
  let triggers = 0

  for (let i = 0; i < spins; i += 1) {
    const paid = spinUnchecked(math, totalBet, rng)
    let roundWin = paid.totalWin
    if (paid.totalWin > 0) hits += 1

    let state: RoundState | undefined = paid.nextState
    if (state !== undefined) triggers += 1
    let played = 0
    while (state !== undefined) {
      played += 1
      if (played > MAX_FREE_SPINS_PER_ROUND) {
        throw new RangeError(`한 라운드의 프리스핀이 ${MAX_FREE_SPINS_PER_ROUND}회를 넘었다. 모델이 발산한다`)
      }
      const free = spinUnchecked(math, totalBet, rng, state)
      roundWin += free.totalWin
      state = free.nextState
    }
    freeSpinsPlayed += played

    winSum += roundWin
    const multiplier = roundWin / totalBet
    squareSum += multiplier * multiplier
    if (roundWin > maxWin) maxWin = roundWin
  }

  const meanMultiplier = winSum / spins / totalBet
  const variance = Math.max(0, squareSum / spins - meanMultiplier * meanMultiplier)
  return {
    rtp: meanMultiplier,
    hitRate: hits / spins,
    stdDev: Math.sqrt(variance),
    maxWin,
    spins,
    freeSpinsPlayed,
    triggerRate: triggers / spins,
    elapsedMs: performance.now() - startedAt,
  }
}
