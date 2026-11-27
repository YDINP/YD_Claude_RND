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
export { evaluateAnywhere } from './anywhere.js'
export { EMBER_CHANCE_SCALE, heatRail, resolveForgeSpin, rollEmbers, startHeatFor, type RailOutcome, type RailState } from './forge.js'
export {
  AnywhereConfigSchema,
  ForgeRailConfigSchema,
  checkAnywhere,
  checkForgeRail,
  type AnywhereConfig,
  type ForgeRailConfig,
} from './forgeSchema.js'
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
export {
  VOID_CELL,
  inShape,
  reelHeight,
  shapeCellCount,
  shapeCells,
  shapeWaysBase,
  type ShapeHost,
} from './shape.js'
export { evaluateCenterWays } from './centerWays.js'
export {
  FrostRespinSchema,
  checkFrostRespin,
  checkShape,
  frostRetriggerBound,
  type FrostRespinConfig,
} from './frostSchema.js'
export {
  buildShapeGrid,
  foldFrost,
  frostBonusMultiple,
  frostReelStrips,
  frostSpinMath,
  frostSpinsFor,
  frostTierOf,
  initialFrostCarry,
  pickFrostTarget,
  resolveFrostSpin,
  runFrostChain,
  spinFrost,
  type FrostChainRun,
} from './frost.js'
export { createSeededRng } from './rng/seeded.js'
export * from './gardenTypes.js'
export {
  GARDEN_MAX_STAGE,
  applyGardenStep,
  applyGardenSun,
  buildGardenGrid,
  foldGarden,
  gardenBonusThresholds,
  gardenBoundsFor,
  gardenNewCells,
  gardenScatterPositions,
  gardenSpinsFor,
  gardenStageForSize,
  inGardenBounds,
  resolveGardenSpin,
  runGarden,
  type GardenFold,
  type GardenRunOutcome,
  type GardenRunStart,
} from './garden.js'
export {
  GardenSeedEntrySchema,
  GrowBoardSchema,
  checkGrowBoard,
  gardenMaxSpins,
  gardenMinStripLength,
  type GardenSeedEntry,
  type GrowBoardConfig,
} from './gardenSchema.js'
