import { MAX_ENUMERATION_COMBOS, computeExactRtp } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { analyzeDistribution, buildFeatureReport, canEnumerate, resolveMethod } from './distribution.js'
import { runMonteCarlo } from './mc.js'
import { Z95 } from './stats.js'
import { readGroups } from './groups.js'
import { jackpotAccounting, readManifestExtras } from './jackpot.js'
import { DEFAULT_SAMPLE_SPINS } from './sampleDistribution.js'
import { DEFAULT_RUIN_SPINS, DEFAULT_RUIN_START_MULTIPLE, DEFAULT_RUIN_TRIALS, simulateRuin } from './ruin.js'
import { agreementVerdict, pp } from './stats.js'
import type {
  AgreementVerdict,
  AuditOptions,
  AuditResult,
  BetLevelRow,
  DistributionMethod,
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

/**
 * 몬테카를로로 RTP를 낼 때 요구하는 정밀도. 95% 신뢰구간 반폭이 이보다 넓으면
 * "목표에 들어왔다"는 말 자체가 성립하지 않으므로 표본 부족으로 떨어뜨린다.
 */
export const MAX_CI95_HALF_WIDTH = 0.002

/** 몬테카를로 게임의 베팅 레벨별 검증에 쓰는 스핀 수. 전체 검수보다 작게 잡는다. */
export const BET_LEVEL_MC_SPINS = 500_000

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
export interface BetLevelOptions {
  /** 몬테카를로 모델에서 레벨마다 돌릴 스핀 수. */
  spins?: number
  seed?: string
  /** 방법을 직접 지정한다. 지정하지 않으면 모델에서 판단한다. */
  method?: DistributionMethod
  onProgress?: (ratio: number) => void
}

/**
 * 베팅 레벨별 RTP. 게이트가 "모든 레벨"을 요구하므로 전부 돈다.
 *
 * - 전수·해석 모델은 닫힌 식이라 레벨마다 즉시 나온다.
 * - 몬테카를로 모델은 **레벨마다 따로 돌린다**. RTP가 베팅액과 무관하다는 보장이 없고,
 *   지급 반올림이나 캡이 레벨에 따라 다르게 물릴 수 있기 때문이다.
 *   전체 검수보다 작은 스핀 수를 쓰되 판정은 같은 ±0.5%p를 쓴다.
 */
export function auditBetLevels(
  math: GameMath,
  onProgressOrOptions?: ((ratio: number) => void) | BetLevelOptions,
): BetLevelRow[] {
  const options: BetLevelOptions =
    typeof onProgressOrOptions === 'function' ? { onProgress: onProgressOrOptions } : (onProgressOrOptions ?? {})
  const lines = math.paylines.length
  const method = options.method ?? resolveMethod(math, math.betLevels[0] ?? lines)
  const exactDistribution = method === 'enumerate'
  const spins = options.spins ?? BET_LEVEL_MC_SPINS
  const seed = options.seed ?? DEFAULT_AUDIT_SEED
  const rows: BetLevelRow[] = []

  math.betLevels.forEach((totalBet, index) => {
    if (method === 'monte-carlo') {
      const run = runMonteCarlo(math, totalBet, spins, `${seed}:level-${totalBet}`, { points: 1 })
      const halfWidth = Z95 * (run.stdDev / Math.sqrt(run.spins))
      const delta = run.rtp - math.rtpTarget
      rows.push({
        totalBet,
        betPerLine: totalBet / lines,
        rtp: run.rtp,
        hitRate: run.hitRate,
        maxWinMultiplier: run.maxWin / totalBet,
        method,
        ci95HalfWidth: halfWidth,
        delta,
        pass: Math.abs(delta) <= RTP_TOLERANCE,
      })
    } else {
      const report = computeExactRtp(math, totalBet, { sampleSpins: 0 })
      const delta = report.rtp - math.rtpTarget
      rows.push({
        totalBet,
        betPerLine: totalBet / lines,
        rtp: report.rtp,
        hitRate: exactDistribution ? report.hitRate : null,
        maxWinMultiplier: exactDistribution ? report.maxWinMultiplier : null,
        method,
        ci95HalfWidth: null,
        delta,
        pass: Math.abs(delta) <= RTP_TOLERANCE,
      })
    }
    onProgress(options, (index + 1) / math.betLevels.length)
  })
  return rows
}

function onProgress(options: BetLevelOptions, ratio: number): void {
  options.onProgress?.(ratio)
}

export interface GateInput {
  math: GameMath
  extras: ManifestExtras | null
  distribution: DistributionReport
  betLevels: BetLevelRow[]
  agreement: AgreementVerdict
  jackpot: JackpotAccounting | null
}

/**
 * RTP 게이트. 방법에 따라 요구 조건이 다르다.
 *
 * 전수·해석은 RTP가 정확값이라 목표와의 거리만 본다.
 * 몬테카를로는 RTP 자체가 추정이므로 **거리와 정밀도를 함께** 본다.
 * 신뢰구간이 넓으면 "목표 안에 있다"는 주장이 성립하지 않기 때문에 표본 부족으로 떨어뜨린다.
 */
export function rtpGate(
  math: GameMath,
  distribution: DistributionReport,
  delta: number,
  methodLabel: string,
): GateRow {
  const withinTarget = Math.abs(delta) <= RTP_TOLERANCE
  const label = `${methodLabel} RTP가 목표 ${pct(math.rtpTarget, 2)} ± 0.5%p 안`

  if (distribution.method !== 'monte-carlo') {
    return { label, pass: withinTarget, detail: `${pct(distribution.rtp)} (${pp(delta)})` }
  }

  const precision = distribution.precision
  if (precision === null) {
    return {
      label: `${label} + 95% CI 반폭 ≤ 0.2%p`,
      pass: false,
      detail: '표본 부족: 신뢰구간이 기록되지 않았다',
    }
  }

  const precise = precision.ci95HalfWidth <= MAX_CI95_HALF_WIDTH
  const detail =
    `${pct(distribution.rtp)} (${pp(delta)}), 95% CI ±${(precision.ci95HalfWidth * 100).toFixed(3)}%p` +
    ` / ${precision.spins.toLocaleString('en-US')} 스핀, 시드 ${precision.seed}` +
    (precise ? '' : ' — 표본 부족')
  return { label: `${label} + 95% CI 반폭 ≤ 0.2%p`, pass: withinTarget && precise, detail }
}

/** 리포트 맨 위에 오는 합격/불합격 목록. */
export function buildGates(input: GateInput): GateRow[] {
  const { math, extras, distribution, betLevels, agreement, jackpot } = input
  const delta = distribution.rtp - math.rtpTarget
  const histogramSum = distribution.histogram.reduce((acc, row) => acc + row.probability, 0)
  const failedLevels = betLevels.filter((row) => !row.pass)
  const threshold = maxWinThreshold(math, extras)
  const methodLabel =
    distribution.method === 'enumerate' ? '전수 조사' : distribution.method === 'analytic' ? '해석적' : '몬테카를로'

  const gates: GateRow[] = [rtpGate(math, distribution, delta, methodLabel)]
  gates.push(
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
      // 몬테카를로 모델에서는 분포도 표본이라 "다른 시드로 다시 돌려도 같은 답이 나오는가"를 재는 셈이다.
      label:
        distribution.method === 'monte-carlo'
          ? '독립 몬테카를로 재현이 3 표준오차 안에서 일치'
          : `몬테카를로가 ${methodLabel} 값과 3 표준오차 안에서 일치`,
      pass: agreement.pass,
      detail: `차이 ${pp(agreement.diff)} / 임계 ±${(agreement.threshold * 100).toFixed(3)}%p`,
    },
  )

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
  const method = resolveMethod(math, totalBet, { maxCombos: options.maxCombos, forceMethod: options.forceMethod })
  const phase =
    method === 'enumerate' ? '전수 조사' : method === 'analytic' ? '해석적 계산 + 표본' : '몬테카를로 표본'

  const distribution = analyzeDistribution(math, totalBet, {
    sampleSpins: options.sampleSpins ?? DEFAULT_SAMPLE_SPINS,
    sampleSeed: seed,
    maxCombos: options.maxCombos,
    forceMethod: method,
    onProgress: (ratio) => progress?.(phase, ratio),
  })

  const betLevels = auditBetLevels(math, {
    method,
    seed,
    spins: options.betLevelSpins ?? BET_LEVEL_MC_SPINS,
    onProgress: (ratio) => progress?.('베팅 레벨별 RTP', ratio),
  })

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
