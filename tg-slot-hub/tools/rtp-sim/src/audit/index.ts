/**
 * 검수 헬퍼 공개 진입점. CLI(`src/audit-cli.ts`)와 시뮬레이터 GUI(`apps/sim`)가
 * 같은 계산을 쓰도록 여기 있는 것만 내보낸다. node:* 의존이 없어 브라우저에서도 돈다.
 */
export {
  DEFAULT_AUDIT_SEED,
  DEFAULT_AUDIT_SPINS,
  BET_LEVEL_MC_SPINS,
  MAX_CI95_HALF_WIDTH,
  MAX_HIT_RATE,
  MIN_HIT_RATE,
  MIN_MAX_WIN_MULTIPLIER,
  MIN_MAX_WIN_MULTIPLIER_5REEL,
  RTP_TOLERANCE,
  SUM_EPSILON,
  WIDE_REEL_THRESHOLD,
  acceptMonteCarloRtp,
  auditBetLevels,
  betLevelPasses,
  buildGates,
  composeAuditResult,
  maxWinThreshold,
  rtpGate,
  runAudit,
} from './compute.js'
export type { BetLevelOptions, McAcceptance, McGateMode, McMeasurement } from './compute.js'
export type { AuditParts, GateInput } from './compute.js'
export { enumerateAudit } from './enumerate.js'
export {
  analyzeDistribution,
  buildFeatureReport,
  canEnumerate,
  engineMethod,
  requiresMonteCarlo,
  resolveMethod,
} from './distribution.js'
export type { AnalyzeOptions } from './distribution.js'
export { DEFAULT_MC_SAMPLE_SPINS, DEFAULT_SAMPLE_SPINS, sampleDistribution } from './sampleDistribution.js'
export type { SampleOptions } from './sampleDistribution.js'
export { Accumulators, SCATTER_FALLBACK_KEY, comboCount } from './contributions.js'
export {
  MAX_FREE_SPINS_PER_ROUND,
  betPerLineOf,
  betUnitCount,
  drawSpin,
  hasMutations,
  isWaysGame,
  playRound,
} from './spinner.js'
export type { RoundSpin } from './spinner.js'
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
