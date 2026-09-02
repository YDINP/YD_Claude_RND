import { MAX_ENUMERATION_COMBOS, computeAnalyticRtp, expectedFreeSpinsPerTrigger } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { comboCount } from './contributions.js'
import { enumerateAudit } from './enumerate.js'
import { DEFAULT_SAMPLE_SPINS, sampleDistribution } from './sampleDistribution.js'
import type { DistributionReport, FeatureReport } from './types.js'

export interface AnalyzeOptions {
  /** 해석 모드에서 쓸 표본 유료 스핀 수. */
  sampleSpins?: number
  sampleSeed?: string
  /** 전수 조사를 시도할 조합 수 상한. 기본은 엔진과 같은 500만. */
  maxCombos?: number
  onProgress?: (ratio: number) => void
}

/** 이 모델을 전수 조사할 수 있는가. */
export function canEnumerate(math: GameMath, maxCombos: number = MAX_ENUMERATION_COMBOS): boolean {
  return comboCount(math) <= maxCombos
}

/**
 * 모델 크기에 맞는 방법으로 분포를 낸다.
 * 조합이 상한 이하면 전수 조사, 넘으면 해석적 RTP + 고정 시드 표본이다.
 * 어느 쪽이든 `rtp`는 정확값이고, `estimated`로 나머지가 추정인지 알 수 있다.
 */
export function analyzeDistribution(
  math: GameMath,
  totalBet: number,
  options: AnalyzeOptions = {},
): DistributionReport {
  if (canEnumerate(math, options.maxCombos ?? MAX_ENUMERATION_COMBOS)) {
    options.onProgress?.(0)
    const report = enumerateAudit(math, totalBet)
    options.onProgress?.(1)
    return report
  }
  return sampleDistribution(math, totalBet, {
    spins: options.sampleSpins ?? DEFAULT_SAMPLE_SPINS,
    seed: options.sampleSeed,
    onProgress: options.onProgress,
  })
}

/**
 * 스캐터·프리스핀 요약. 두 기능이 다 없는 게임(classic-777 등)은 null이다.
 * 트리거 확률과 기대 프리스핀 수는 표본이 아니라 닫힌 식에서 온다.
 */
export function buildFeatureReport(math: GameMath, distribution: DistributionReport): FeatureReport | null {
  const config = math.scatter
  if (config === undefined) return null

  const analytic = computeAnalyticRtp(math, distribution.totalBet)
  const feature = config.freeSpins
  const spinsPerTrigger =
    feature === undefined || analytic.triggerProbability <= 0
      ? 0
      : expectedFreeSpinsPerTrigger(feature.count, analytic.triggerProbability, feature.retrigger)

  const observed = distribution.observedFeatures
  return {
    scatterSymbol: config.symbol,
    triggerProbability: analytic.triggerProbability,
    spinsPerTrigger,
    multiplier: feature?.multiplier ?? 1,
    retrigger: feature?.retrigger ?? false,
    freeSpinsShare: distribution.rtp === 0 ? 0 : distribution.breakdown.freeSpins / distribution.rtp,
    scatterShare: distribution.rtp === 0 ? 0 : distribution.breakdown.scatter / distribution.rtp,
    observedTriggerRate: observed === null ? null : observed.triggers / observed.spins,
    observedFreeSpinsPerPaidSpin: observed === null ? null : observed.freeSpins / observed.spins,
  }
}
