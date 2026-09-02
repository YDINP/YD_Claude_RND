import {
  MAX_ENUMERATION_COMBOS,
  computeAnalyticRtp,
  computeExactRtp,
  expectedFreeSpinsPerTrigger,
  isAnalytic,
} from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { comboCount } from './contributions.js'
import { enumerateAudit } from './enumerate.js'
import { DEFAULT_MC_SAMPLE_SPINS, DEFAULT_SAMPLE_SPINS, sampleDistribution } from './sampleDistribution.js'
import type { DistributionMethod, DistributionReport, FeatureReport } from './types.js'

export interface AnalyzeOptions {
  /** 해석·몬테카를로 모드에서 쓸 표본 유료 스핀 수. */
  sampleSpins?: number
  sampleSeed?: string
  /** 전수 조사를 시도할 조합 수 상한. 기본은 엔진과 같은 500만. */
  maxCombos?: number
  /** 방법을 직접 지정한다. 테스트와 "이 게임은 닫힌 식이 없다"를 아는 호출자용. */
  forceMethod?: DistributionMethod
  onProgress?: (ratio: number) => void
}

/**
 * 릴 독립을 깨는 피처가 있어 닫힌 식이 성립하지 않는 모델인가.
 *
 * 판단은 **엔진의 `isAnalytic`에 맡긴다.** 예전에는 뮤테이션 이름 목록을 여기서 들고 있었는데,
 * 엔진은 `expandWild`도 닫힌 식이 아니라고 보고 ways와 섞인 경우까지 따진다. 목록을 따로 두면
 * 그 판단이 갈라져 감사와 엔진이 서로 다른 RTP를 쓰게 된다.
 *
 * 이것이 중요한 이유: `computeAnalyticRtp`는 닫힌 식이 성립하지 않는 모델에도 **던지지 않고**
 * 조용히 틀린 값을 준다 (sheriff-sixgun에서 43% vs 실제 94.6%). 방법 선택을 틀리면 그 값이
 * 그대로 리포트에 실린다.
 */
export function requiresMonteCarlo(math: GameMath): boolean {
  return !isAnalytic(math)
}

/**
 * 엔진이 이 모델을 어떤 방법으로 재는지 물어본다.
 * 엔진이 'monte-carlo'를 돌려주면 그 말을 따르고, 실패하면 조합 수로 판단한다.
 */
export function engineMethod(math: GameMath, totalBet: number): DistributionMethod | null {
  try {
    const method = computeExactRtp(math, totalBet, { sampleSpins: 0 }).method as string
    if (method === 'enumerate' || method === 'analytic' || method === 'monte-carlo') return method
    return null
  } catch {
    return null
  }
}

/** 이 모델을 전수 조사할 수 있는가. */
export function canEnumerate(math: GameMath, maxCombos: number = MAX_ENUMERATION_COMBOS): boolean {
  return comboCount(math) <= maxCombos
}

/**
 * 이 모델에 쓸 방법을 정한다. 명시 지정 > 닫힌 식이 깨지는 피처 > 엔진 판단 > 조합 수.
 */
export function resolveMethod(math: GameMath, totalBet: number, options: AnalyzeOptions = {}): DistributionMethod {
  if (options.forceMethod !== undefined) return options.forceMethod
  if (requiresMonteCarlo(math)) return 'monte-carlo'
  const fromEngine = engineMethod(math, totalBet)
  if (fromEngine === 'monte-carlo') return 'monte-carlo'
  return canEnumerate(math, options.maxCombos ?? MAX_ENUMERATION_COMBOS) ? 'enumerate' : 'analytic'
}

/**
 * 모델에 맞는 방법으로 분포를 낸다.
 *
 * - 조합이 상한 이하 → 전수 조사. RTP가 정확값이다.
 * - 조합이 크지만 릴이 독립 → 해석적 RTP(정확값) + 표본 분포.
 * - 릴 독립이 깨짐 → 전부 표본. RTP에 신뢰구간이 붙고 그 폭이 게이트의 일부가 된다.
 */
export function analyzeDistribution(
  math: GameMath,
  totalBet: number,
  options: AnalyzeOptions = {},
): DistributionReport {
  const method = resolveMethod(math, totalBet, options)
  if (method === 'enumerate') {
    options.onProgress?.(0)
    const report = enumerateAudit(math, totalBet)
    options.onProgress?.(1)
    return report
  }
  const defaultSpins = method === 'monte-carlo' ? DEFAULT_MC_SAMPLE_SPINS : DEFAULT_SAMPLE_SPINS
  return sampleDistribution(math, totalBet, {
    spins: options.sampleSpins ?? defaultSpins,
    seed: options.sampleSeed,
    rtpSource: method === 'monte-carlo' ? 'sample' : 'analytic',
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
    cappedSpins: observed?.cappedSpins ?? null,
    cappedSpinsLost: observed?.cappedSpinsLost ?? null,
    observedFreeSpinsPerPaidSpin: observed === null ? null : observed.freeSpins / observed.spins,
  }
}
