export * from './types.js'
export * from './schema.js'
export {
  evaluate,
  evaluateScatter,
  featureTriggerCount,
  getBetPerLine,
  getLineCandidates,
  getWildChampions,
  getWildIds,
  payoutForCount,
  triggersFreeSpins,
} from './evaluate.js'
export type { LineCandidate } from './evaluate.js'
export { assertBetLevel, buildGrid, getBetUnit, resolveSpin, spin, spinUnchecked } from './spin.js'
export { applyMutations, isProbabilistic } from './mutations.js'
export { pickIdleStops } from './idle.js'
export { pickWeighted } from './random.js'
export { applyCascadeStep, foldCascades, runCascades } from './cascade.js'
export { evaluateClusters } from './cluster.js'
export { drawOrderCards, tallyOrders } from './orders.js'
export {
  applyColumnWraps,
  assignCoinValues,
  boardCells,
  drawCoin,
  foldRespin,
  resolveCoinRespinSpin,
  runCoinRespin,
  toCoinBoard,
  type CoinBoard,
} from './coinRespin.js'
export {
  CoinRespinSchema,
  CoinValueEntrySchema,
  checkCoinRespin,
  coinRespinGrowthBound,
  type CoinRespinConfig,
  type CoinValueEntry,
} from './coinRespinSchema.js'
export {
  advanceBoard,
  applyBoardBonus,
  boardPayout,
  boardStartNode,
  boardStartRoute,
  initialBoardState,
  playBoard,
  previewBoardLanding,
  replayBoard,
  stepBoard,
  type BoardState,
} from './board.js'
export { boardExpectation, type BoardExpectation } from './boardExact.js'
export { computeBoardRtp, type BoardRtpReport } from './boardRtp.js'
export {
  BOARD_MAX_THROWS_LIMIT,
  BoardBonusConfigSchema,
  BoardNodeSchema,
  BoardThrowEntrySchema,
  checkBoardConfig,
  type BoardBonusConfig,
  type BoardNode,
  type BoardThrowEntry,
} from './boardSchema.js'
export { evaluateWays, getBetPerWay } from './ways.js'
export {
  countCheer,
  litSegments,
  maxRouletteSteps,
  playStageRoulette,
  resolveRouletteSpin,
  startRingFor,
  type RoulettePlay,
} from './stageRoulette.js'
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
  type MonteCarloRtpInfo,
  type ExactRtpOptions,
  type ExactRtpReport,
  type RtpMethod,
  type SimulationReport,
  type WinBucket,
} from './rtp.js'
export { MAX_FREE_SPINS_PER_ROUND } from './limits.js'
export { createSeededRng } from './rng/seeded.js'
