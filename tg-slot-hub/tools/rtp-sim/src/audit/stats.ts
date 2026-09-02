import type { AgreementVerdict, McAggregate } from './types.js'

/** 표준정규 97.5% 분위수. 95% 양측 신뢰구간 계수. */
export const Z95 = 1.959963984540054

/** 판정 임계값 배수. |MC - 전수| < 3 x SE면 통계적으로 일치한다고 본다. */
export const AGREEMENT_SIGMA = 3

export function standardError(stdDev: number, spins: number): number {
  if (!Number.isFinite(spins) || spins < 1) throw new RangeError(`spins는 1 이상이어야 한다: ${spins}`)
  return stdDev / Math.sqrt(spins)
}

export interface ConfidenceInterval {
  low: number
  high: number
  halfWidth: number
  standardError: number
}

/** 평균 ± 1.96 x SE. mean은 RTP(=스핀당 승리 배수의 평균)다. */
export function confidenceInterval95(mean: number, stdDev: number, spins: number): ConfidenceInterval {
  const se = standardError(stdDev, spins)
  const halfWidth = Z95 * se
  return { low: mean - halfWidth, high: mean + halfWidth, halfWidth, standardError: se }
}

/**
 * 몬테카를로 RTP가 전수 조사 RTP와 통계적으로 일치하는지 본다.
 * 차이가 3 표준오차 안이면 통과. 표준편차가 0(승리가 아예 없음)이면 값이 정확히 같아야 통과다.
 */
export function agreementVerdict(mc: McAggregate, exactRtp: number): AgreementVerdict {
  const ci = confidenceInterval95(mc.rtp, mc.stdDev, mc.spins)
  const diff = mc.rtp - exactRtp
  const threshold = AGREEMENT_SIGMA * ci.standardError
  return {
    diff,
    standardError: ci.standardError,
    halfWidth95: ci.halfWidth,
    ciLow: ci.low,
    ciHigh: ci.high,
    threshold,
    pass: ci.standardError === 0 ? diff === 0 : Math.abs(diff) < threshold,
  }
}

/** 소수 비율을 %p 문자열로. 0.0032 -> "+0.320%p". */
export function pp(value: number, digits = 3): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(digits)}%p`
}
