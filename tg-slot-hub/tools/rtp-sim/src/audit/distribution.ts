import {
  MAX_ENUMERATION_COMBOS,
  computeAnalyticRtp,
  computeExactRtp,
  expectedFreeSpinsPerTrigger,
} from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { comboCount } from './contributions.js'
import { enumerateAudit } from './enumerate.js'
import { DEFAULT_SAMPLE_SPINS, sampleDistribution } from './sampleDistribution.js'
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
 * 엔진이 아직 이 필드들을 스키마에 넣지 않았으므로 **방어적으로** 읽는다.
 * 엔진이 `computeExactRtp`에서 `method: 'monte-carlo'`를 돌려주기 시작하면
 * 그 값이 우선이고, 이 함수는 그 전까지의 다리 역할이다.
 *
 * 판단 기준은 GAME_CATALOG의 "프리미티브별 RTP 산출 방식" 표다.
 * mystery·expand·upgrade는 조건부화하면 독립이 복원돼 해석적으로 풀리지만,
 * 배치 배타성(drop)과 스핀 간 이월(sticky·walking), 캐스케이드·클러스터·리스핀은 그렇지 않다.
 */
export function requiresMonteCarlo(math: GameMath): boolean {
  const extended = math as unknown as Record<string, unknown>
  for (const key of ['cascade', 'cluster', 'respin', 'holdAndSpin']) {
    if (extended[key] !== undefined && extended[key] !== null) return true
  }
  const mutations = extended['mutations']
  if (Array.isArray(mutations)) {
    return mutations.some((entry) => {
      const type = typeof entry === 'object' && entry !== null ? (entry as { type?: unknown }).type : entry
      return typeof type === 'string' && MONTE_CARLO_MUTATIONS.has(type)
    })
  }
  return false
}

/**
 * 닫힌 식을 깨는 뮤테이션 종류.
 *
 * `randomWild`는 빈 칸에 배타적으로 떨어뜨리므로 릴 사이에 상관이 생겨 인수분해가 안 된다.
 * `sticky`·`walking`은 스핀 간 이월이라 라운드가 마르코프 사슬이 된다.
 * 나머지(mystery·expandWild·upgrade)는 조건부화하면 릴 독립이 복원돼 해석적으로 풀린다.
 */
export const MONTE_CARLO_MUTATIONS = new Set(['randomWild', 'random-wild-drop', 'drop', 'sticky', 'walking'])

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
  return sampleDistribution(math, totalBet, {
    spins: options.sampleSpins ?? DEFAULT_SAMPLE_SPINS,
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
    observedFreeSpinsPerPaidSpin: observed === null ? null : observed.freeSpins / observed.spins,
  }
}
