import { MAX_ENUMERATION_COMBOS, computeExactRtp } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { analyzeDistribution, buildFeatureReport, canEnumerate } from './distribution.js'
import { readGroups } from './groups.js'
import { jackpotAccounting, readManifestExtras } from './jackpot.js'
import { runMonteCarlo } from './mc.js'
import { DEFAULT_SAMPLE_SPINS } from './sampleDistribution.js'
import { DEFAULT_RUIN_SPINS, DEFAULT_RUIN_START_MULTIPLE, DEFAULT_RUIN_TRIALS, simulateRuin } from './ruin.js'
import { agreementVerdict, pp } from './stats.js'
import type {
  AgreementVerdict,
  AuditOptions,
  AuditResult,
  BetLevelRow,
  DistributionReport,
  FeatureReport,
  GateRow,
  JackpotAccounting,
  ManifestExtras,
  MonteCarloResult,
  RuinReport,
} from './types.js'

/** 목표 RTP 허용 오차 (±0.5%p). CI 게이트(`games.test.ts`)와 같은 값. */
export const RTP_TOLERANCE = 0.005
export const MIN_HIT_RATE = 0.1
export const MAX_HIT_RATE = 0.6
/** 기여도 합계와 전체 RTP가 같다고 볼 오차. */
export const SUM_EPSILON = 1e-9

/**
 * 최대 배수 하한. 릴이 많아질수록 배당은 라인 수로 쪼개져 한 스핀의 최대 배수가 작아진다.
 * 3릴 클래식은 100x를 넘겨야 하지만 5릴 20라인에 같은 잣대를 대면 구조적으로 실패한다.
 * `manifest.maxWinTarget`이 있으면 그 값이 우선이다.
 */
export const MIN_MAX_WIN_MULTIPLIER = 100
export const MIN_MAX_WIN_MULTIPLIER_5REEL = 50
export const WIDE_REEL_THRESHOLD = 5

export const DEFAULT_AUDIT_SPINS = 2_000_000
export const DEFAULT_AUDIT_SEED = '42'

function pct(value: number, digits = 4): string {
  return `${(value * 100).toFixed(digits)}%`
}

/** 이 게임에 적용할 최대 배수 하한. */
export function maxWinThreshold(math: GameMath, extras: ManifestExtras | null): number {
  const declared = extras?.maxWinTarget
  if (declared !== undefined && declared > 0) return declared
  return math.reels >= WIDE_REEL_THRESHOLD ? MIN_MAX_WIN_MULTIPLIER_5REEL : MIN_MAX_WIN_MULTIPLIER
}

/**
 * 베팅 레벨별 RTP. 게이트가 "모든 레벨"을 요구하므로 전부 돈다.
 * 해석 모드에서는 레벨마다 표본을 다시 돌리지 않는다 (RTP는 표본과 무관하게 정확하다).
 */
export function auditBetLevels(math: GameMath, onProgress?: (ratio: number) => void): BetLevelRow[] {
  const lines = math.paylines.length
  const exactDistribution = canEnumerate(math)
  const rows: BetLevelRow[] = []

  math.betLevels.forEach((totalBet, index) => {
    const report = computeExactRtp(math, totalBet, { sampleSpins: 0 })
    const delta = report.rtp - math.rtpTarget
    rows.push({
      totalBet,
      betPerLine: totalBet / lines,
      rtp: report.rtp,
      hitRate: exactDistribution ? report.hitRate : null,
      maxWinMultiplier: exactDistribution ? report.maxWinMultiplier : null,
      delta,
      pass: Math.abs(delta) <= RTP_TOLERANCE,
    })
    onProgress?.((index + 1) / math.betLevels.length)
  })
  return rows
}

export interface GateInput {
  math: GameMath
  extras: ManifestExtras | null
  distribution: DistributionReport
  betLevels: BetLevelRow[]
  agreement: AgreementVerdict
  jackpot: JackpotAccounting | null
}

/** 리포트 맨 위에 오는 합격/불합격 목록. */
export function buildGates(input: GateInput): GateRow[] {
  const { math, extras, distribution, betLevels, agreement, jackpot } = input
  const delta = distribution.rtp - math.rtpTarget
  const histogramSum = distribution.histogram.reduce((acc, row) => acc + row.probability, 0)
  const failedLevels = betLevels.filter((row) => !row.pass)
  const threshold = maxWinThreshold(math, extras)
  const methodLabel = distribution.method === 'enumerate' ? '전수 조사' : '해석적'

  const gates: GateRow[] = [
    {
      label: `${methodLabel} RTP가 목표 ${pct(math.rtpTarget, 2)} ± 0.5%p 안`,
      pass: Math.abs(delta) <= RTP_TOLERANCE,
      detail: `${pct(distribution.rtp)} (${pp(delta)})`,
    },
    {
      label: '모든 베팅 레벨에서 목표 ± 0.5%p 안',
      pass: failedLevels.length === 0,
      detail:
        failedLevels.length === 0
          ? `${betLevels.length}개 레벨 전부 통과`
          : `이탈: ${failedLevels.map((row) => `${row.totalBet}(${pp(row.delta)})`).join(', ')}`,
    },
    {
      label: `적중률 ${pct(MIN_HIT_RATE, 0)}~${pct(MAX_HIT_RATE, 0)}`,
      pass: distribution.hitRate > MIN_HIT_RATE && distribution.hitRate < MAX_HIT_RATE,
      detail: `${pct(distribution.hitRate)}${distribution.estimated ? ' (표본 추정)' : ''}`,
    },
    {
      label: `최대 배수 ${threshold}x 이상 (${math.reels}릴${extras?.maxWinTarget === undefined ? '' : ', manifest 지정'})`,
      pass: distribution.maxWinMultiplier >= threshold,
      detail: `${distribution.maxWinMultiplier.toFixed(2)}x${distribution.estimated ? ' (표본 관측)' : ''}`,
    },
    {
      label: `몬테카를로가 ${methodLabel} 값과 3 표준오차 안에서 일치`,
      pass: agreement.pass,
      detail: `차이 ${pp(agreement.diff)} / 임계 ±${(agreement.threshold * 100).toFixed(3)}%p`,
    },
  ]

  if (!distribution.estimated) {
    const symbolSum = distribution.symbols.reduce((acc, row) => acc + row.rtp, 0)
    gates.push({
      label: '심볼별 기여 합계 = 전체 RTP',
      pass: Math.abs(symbolSum - distribution.rtp) < SUM_EPSILON,
      detail: `차이 ${Math.abs(symbolSum - distribution.rtp).toExponential(2)}`,
    })
  }

  gates.push({
    label: '배수 분포 확률 합계 = 1',
    pass: Math.abs(histogramSum - 1) < SUM_EPSILON,
    detail: `합계 ${histogramSum.toFixed(12)}`,
  })

  if (jackpot !== null) {
    gates.push({
      label:
        jackpot.target === null
          ? '잭팟 총 RTP (목표 미지정)'
          : `잭팟 포함 총 RTP가 목표 ${pct(jackpot.target, 2)} ± 0.5%p 안`,
      pass: jackpot.pass ?? true,
      detail:
        jackpot.delta === null
          ? `${pct(jackpot.totalRtp)} (기본 ${pct(jackpot.baseRtp)} + 기여 ${pct(jackpot.contribution)})`
          : `${pct(jackpot.totalRtp)} (${pp(jackpot.delta)})`,
    })
  }

  return gates
}

/** 따로 계산해 둔 검수 조각들. GUI는 분포(전수/표본)와 몬테카를로를 나눠 돌린다. */
export interface AuditParts {
  distribution: DistributionReport
  betLevels: BetLevelRow[]
  mc: MonteCarloResult
  ruin: RuinReport
}

/**
 * 이미 계산된 조각들을 리포트 한 덩어리로 묶는다.
 * CLI와 GUI가 게이트 판정·요약 구성을 한 곳에서만 하도록 `runAudit`도 이 함수를 거친다.
 */
export function composeAuditResult(
  math: GameMath,
  manifestJson: unknown,
  options: Pick<AuditOptions, 'totalBet' | 'spins' | 'seed' | 'generatedAt'>,
  parts: AuditParts,
): AuditResult {
  const { totalBet, spins, seed } = options
  const extras: ManifestExtras | null = readManifestExtras(manifestJson)
  const { distribution, betLevels, mc, ruin } = parts
  const agreement = agreementVerdict(mc, distribution.rtp)
  const jackpot = jackpotAccounting(distribution.rtp, extras)
  const features: FeatureReport | null = buildFeatureReport(math, distribution)

  return {
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    game: {
      id: math.id,
      nameKo: extras?.nameKo ?? null,
      nameEn: extras?.nameEn ?? null,
      reels: math.reels,
      rows: math.rows,
      lines: math.paylines.length,
      betLevels: [...math.betLevels],
      stripLengths: math.strips.map((strip) => strip.length),
      symbolCount: math.symbols.length,
      rtpTarget: math.rtpTarget,
      volatility: math.volatility,
      groups: readGroups(math),
    },
    manifest: extras,
    options: { totalBet, spins, seed },
    distribution,
    features,
    betLevels,
    mc,
    agreement,
    ruin,
    jackpot,
    gates: buildGates({ math, extras, distribution, betLevels, agreement, jackpot }),
  }
}

/**
 * 검수 전체를 한 번에 돈다. 순수 계산만 하므로 CLI와 브라우저(Web Worker) 양쪽에서 같은 결과를 낸다.
 * 조합이 500만을 넘는 모델은 전수 조사 대신 해석적 RTP + 고정 시드 표본으로 간다.
 * @param manifestJson manifest.json 원본. 없으면 null.
 */
export function runAudit(math: GameMath, manifestJson: unknown, options: AuditOptions): AuditResult {
  const { totalBet, spins, seed } = options
  const progress = options.onProgress
  const enumerable = canEnumerate(math, options.maxCombos ?? MAX_ENUMERATION_COMBOS)
  const phase = enumerable ? '전수 조사' : '해석적 계산 + 표본'

  const distribution = analyzeDistribution(math, totalBet, {
    sampleSpins: options.sampleSpins ?? DEFAULT_SAMPLE_SPINS,
    sampleSeed: seed,
    maxCombos: options.maxCombos,
    onProgress: (ratio) => progress?.(phase, ratio),
  })

  const betLevels = auditBetLevels(math, (ratio) => progress?.('베팅 레벨별 RTP', ratio))

  const mc = runMonteCarlo(math, totalBet, spins, seed, {
    onProgress: (ratio) => progress?.('몬테카를로', ratio),
  })

  progress?.('파산 확률 시뮬', 0)
  const ruin: RuinReport = simulateRuin(math, totalBet, seed, {
    trials: options.ruinTrials ?? DEFAULT_RUIN_TRIALS,
    spins: options.ruinSpins ?? DEFAULT_RUIN_SPINS,
    startMultiple: options.ruinStartMultiple ?? DEFAULT_RUIN_START_MULTIPLE,
  })
  progress?.('파산 확률 시뮬', 1)

  return composeAuditResult(math, manifestJson, options, { distribution, betLevels, mc, ruin })
}
