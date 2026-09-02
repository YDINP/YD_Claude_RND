export * from './types.js'
export * from './schema.js'
export { evaluate, evaluateScatter, getBetPerLine, getLineCandidates, payoutForCount, triggersFreeSpins } from './evaluate.js'
export type { LineCandidate } from './evaluate.js'
export { assertBetLevel, buildGrid, getBetUnit, resolveSpin, spin } from './spin.js'
export { applyMutations, isProbabilistic } from './mutations.js'
export { evaluateWays, getBetPerWay } from './ways.js'
export {
  computeAnalyticRtp,
  expectedFreeSpinsPerTrigger,
  expectedLineMultiplier,
  expectedWaysMultiplier,
  isAnalytic,
  mysteryRevealCases,
  scatterCountDistribution,
  scatterWindowDistribution,
  symbolFrequencies,
  type AnalyticRtpReport,
  type RtpBreakdown,
} from './analytic.js'
export {
  computeExactRtp,
  simulate,
  DEFAULT_SAMPLE_SEED,
  DEFAULT_SAMPLE_SPINS,
  DEFAULT_MC_SEED,
  DEFAULT_MC_SPINS,
  MAX_ENUMERATION_COMBOS,
  MAX_FREE_SPINS_PER_ROUND,
  type MonteCarloRtpInfo,
  type ExactRtpOptions,
  type ExactRtpReport,
  type RtpMethod,
  type SimulationReport,
  type WinBucket,
} from './rtp.js'
export { createSeededRng } from './rng/seeded.js'
