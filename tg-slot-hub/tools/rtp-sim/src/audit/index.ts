/**
 * 검수 헬퍼 공개 진입점. CLI(`src/audit-cli.ts`)와 시뮬레이터 GUI(`apps/sim`)가
 * 같은 계산을 쓰도록 여기 있는 것만 내보낸다. node:* 의존이 없어 브라우저에서도 돈다.
 */
export {
  DEFAULT_AUDIT_SEED,
  DEFAULT_AUDIT_SPINS,
  MAX_HIT_RATE,
  MIN_HIT_RATE,
  MIN_MAX_WIN_MULTIPLIER,
  RTP_TOLERANCE,
  SUM_EPSILON,
  auditBetLevels,
  buildGates,
  composeAuditResult,
  runAudit,
} from './compute.js'
export type { AuditParts, GateInput } from './compute.js'
export { enumerateAudit } from './enumerate.js'
export { buildLabelMap, readGroups } from './groups.js'
export { HISTOGRAM_BUCKETS, bucketIndexFor, buildHistogramRows } from './histogram.js'
export type { HistogramBucket } from './histogram.js'
export { JACKPOT_TOLERANCE, jackpotAccounting, readManifestExtras } from './jackpot.js'
export { chunkSizes, mergeSimulations, runMonteCarlo } from './mc.js'
export type { MonteCarloOptions } from './mc.js'
export { buildAuditMarkdown } from './report.js'
export {
  DEFAULT_RUIN_SPINS,
  DEFAULT_RUIN_START_MULTIPLE,
  DEFAULT_RUIN_TRIALS,
  simulateRuin,
} from './ruin.js'
export type { RuinOptions } from './ruin.js'
export { createSampleSpinner, sampleSpins } from './sample.js'
export { AGREEMENT_SIGMA, Z95, agreementVerdict, confidenceInterval95, pp, standardError } from './stats.js'
export type { ConfidenceInterval } from './stats.js'
export type * from './types.js'
