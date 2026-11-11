import type { GameMath } from '@tgslot/slot-engine'
import { BET_LEVEL_MC_SPINS, betLevelRowFromRun, composeAuditResult } from './compute.js'
import { chunkSizes, mergeSimulations, runMonteCarlo } from './mc.js'
import { DEFAULT_MC_SAMPLE_SPINS, collectSample, finishSample, mergeSampleStates } from './sampleDistribution.js'
import type { SampleState } from './sampleDistribution.js'
import type { AuditResult, ConvergencePoint, McAggregate, MonteCarloResult, RuinReport } from './types.js'

/**
 * 몬테카를로 감사를 시드 샤드로 나눠 돌리는 조각. 워커 하나가 `runAuditPart` 하나를 맡는다.
 * 이 파일은 node:*를 쓰지 않는다. 워커 생성은 `shards.ts`가 한다.
 */
export interface AuditPartOptions {
  totalBet: number
  /** 이 조각이 맡을 몬테카를로 재현 스핀 수. */
  spins: number
  /** 이 조각이 맡을 분포 표본(=RTP 측정) 스핀 수. */
  sampleSpins: number
  /** 이 조각이 베팅 레벨마다 돌릴 스핀 수. */
  betLevelSpins: number
  /** 이 조각의 시드. 보통 `${seed}:shard-${i}`. */
  seed: string
  onProgress?: (phase: string, ratio: number) => void
}

export interface AuditPart {
  sample: SampleState
  mc: MonteCarloResult
  levels: { totalBet: number; run: McAggregate }[]
}

export function shardSeed(seed: string, index: number): string {
  return `${seed}:shard-${index}`
}

/** 합친 결과에 붙이는 시드 표기. */
export function shardSeedLabel(seed: string, shards: number): string {
  return `${seed}:shard-0..${shards - 1}`
}

export interface ShardPlan {
  index: number
  options: Omit<AuditPartOptions, 'onProgress'>
}

/**
 * 총 스핀을 샤드로 나눈다. 나머지는 앞 샤드에 하나씩 얹는다(`chunkSizes`).
 * 시드와 몫이 샤드 번호로만 정해지므로 워커가 끝나는 순서와 무관하게 결과가 같다.
 */
export function planShards(
  options: { totalBet: number; spins: number; seed: string; sampleSpins?: number; betLevelSpins?: number },
  shards: number,
): ShardPlan[] {
  if (!Number.isInteger(shards) || shards < 1) throw new RangeError(`shards는 1 이상의 정수여야 한다: ${shards}`)
  const sampleTotal = options.sampleSpins ?? Math.max(options.spins, DEFAULT_MC_SAMPLE_SPINS)
  const levelTotal = options.betLevelSpins ?? BET_LEVEL_MC_SPINS
  const mc = chunkSizes(options.spins, shards)
  const sample = chunkSizes(sampleTotal, shards)
  const levels = chunkSizes(levelTotal, shards)
  if (mc.length < shards || sample.length < shards || levels.length < shards) {
    throw new RangeError(`스핀 수가 샤드 수(${shards})보다 적다`)
  }
  return mc.map((spins, index) => ({
    index,
    options: {
      totalBet: options.totalBet,
      spins,
      sampleSpins: sample[index] ?? 0,
      betLevelSpins: levels[index] ?? 0,
      seed: shardSeed(options.seed, index),
    },
  }))
}

/** 샤드 하나의 몫. 분포 표본(엔진 몬테카를로 포함), 베팅 레벨별 집계, 몬테카를로 재현을 돈다. */
export function runAuditPart(math: GameMath, options: AuditPartOptions): AuditPart {
  const progress = options.onProgress
  const sample = collectSample(math, options.totalBet, {
    spins: options.sampleSpins,
    seed: options.seed,
    rtpSource: 'sample',
    onProgress: (ratio) => progress?.('몬테카를로 표본', ratio),
  })
  const levels = math.betLevels.map((totalBet, index) => {
    const run = runMonteCarlo(math, totalBet, options.betLevelSpins, `${options.seed}:level-${totalBet}`, {
      points: 1,
    })
    progress?.('베팅 레벨별 RTP', (index + 1) / math.betLevels.length)
    return { totalBet, run: stripMc(run) }
  })
  const mc = runMonteCarlo(math, options.totalBet, options.spins, options.seed, {
    onProgress: (ratio) => progress?.('몬테카를로', ratio),
  })
  return { sample, mc, levels }
}

function stripMc(run: MonteCarloResult): McAggregate {
  return {
    spins: run.spins,
    rtp: run.rtp,
    hitRate: run.hitRate,
    stdDev: run.stdDev,
    maxWin: run.maxWin,
    freeSpinsPlayed: run.freeSpinsPlayed,
    triggerRate: run.triggerRate,
  }
}

/** 샤드별 수렴 곡선을 같은 칸끼리 합친다. 칸 j = 모든 샤드의 j번째 누적값의 가중 평균. */
export function mergeConvergence(curves: readonly (readonly ConvergencePoint[])[]): ConvergencePoint[] {
  const length = Math.min(...curves.map((curve) => curve.length))
  const merged: ConvergencePoint[] = []
  for (let j = 0; j < length; j += 1) {
    let spins = 0
    let sum = 0
    for (const curve of curves) {
      const point = curve[j]
      if (point === undefined) continue
      spins += point.spins
      sum += point.rtp * point.spins
    }
    merged.push({ spins, rtp: spins === 0 ? 0 : sum / spins })
  }
  return merged
}

export function mergeMonteCarlo(parts: readonly MonteCarloResult[], seed: string, totalBet: number): MonteCarloResult {
  const merged = mergeSimulations(parts)
  return {
    ...merged,
    seed,
    totalBet,
    // 샤드는 동시에 돈다. 벽시계 시간에 가까운 최댓값을 적는다.
    elapsedMs: Math.max(0, ...parts.map((part) => part.elapsedMs)),
    convergence: mergeConvergence(parts.map((part) => part.convergence)),
  }
}

/**
 * 샤드 조각을 합쳐 감사 결과 한 덩어리로. 게이트 판정은 단일 스레드 감사와 같은 `composeAuditResult`를 거친다.
 * 파산 시뮬은 가벼워서 호출하는 쪽이 원래 시드로 한 번만 돌려 넘긴다.
 */
export function finishAuditParts(
  math: GameMath,
  manifestJson: unknown,
  options: { totalBet: number; spins: number; seed: string; generatedAt?: Date },
  parts: readonly AuditPart[],
  ruin: RuinReport,
): AuditResult {
  const label = shardSeedLabel(options.seed, parts.length)
  const sample = mergeSampleStates(
    math,
    parts.map((part) => part.sample),
    label,
  )
  const distribution = finishSample(math, sample)
  const betLevels = math.betLevels.map((totalBet, index) => {
    const runs = parts.map((part) => {
      const level = part.levels[index]
      if (level === undefined || level.totalBet !== totalBet) throw new RangeError(`샤드의 베팅 레벨 ${totalBet}이 없다`)
      return level.run
    })
    return betLevelRowFromRun(math, totalBet, mergeSimulations(runs))
  })
  const mc = mergeMonteCarlo(
    parts.map((part) => part.mc),
    label,
    options.totalBet,
  )
  return composeAuditResult(
    math,
    manifestJson,
    { ...options, shards: parts.length },
    { distribution, betLevels, mc, ruin },
  )
}
