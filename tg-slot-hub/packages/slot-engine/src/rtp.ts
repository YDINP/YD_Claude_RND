import type { GameMath } from './schema.js'
import { evaluate, getBetPerLine } from './evaluate.js'
import { buildGrid, spinUnchecked } from './spin.js'
import type { Rng } from './types.js'

/** 전수 조사 상한. 이보다 큰 모델은 몬테카를로(simulate)로 측정한다. */
export const MAX_ENUMERATION_COMBOS = 5_000_000

export interface WinBucket {
  /** 총 베팅액 대비 배수. */
  multiplier: number
  combos: number
  probability: number
  /** 이 버킷이 RTP에 기여하는 몫. 전체 합 = rtp. */
  rtpShare: number
}

export interface ExactRtpReport {
  rtp: number
  hitRate: number
  combos: number
  maxWinMultiplier: number
  /** 배수 오름차순. 무승부(0배)는 제외. */
  winDistribution: WinBucket[]
}

/**
 * 모든 정지 위치 조합을 전수 조사한 **정확한** RTP.
 * 3릴 게임은 조합 수가 작아 이 값으로 math.json을 튜닝한다.
 * `simulate`와 마찬가지로 `betLevels`에 없는 베팅액도 받는다.
 */
export function computeExactRtp(math: GameMath, totalBet: number): ExactRtpReport {
  const betPerLine = getBetPerLine(math, totalBet)
  const lengths = math.strips.map((strip) => strip.length)
  const combos = lengths.reduce((acc, length) => acc * length, 1)
  if (combos > MAX_ENUMERATION_COMBOS) {
    throw new RangeError(
      `조합 수 ${combos}가 상한 ${MAX_ENUMERATION_COMBOS}를 넘는다. simulate()를 쓸 것`,
    )
  }

  const stops = new Array<number>(math.reels).fill(0)
  const buckets = new Map<number, number>()
  let winSum = 0
  let hits = 0
  let maxWin = 0

  for (let i = 0; i < combos; i += 1) {
    const grid = buildGrid(math, stops)
    const { totalWin } = evaluate(grid, math, betPerLine)
    winSum += totalWin
    if (totalWin > 0) {
      hits += 1
      if (totalWin > maxWin) maxWin = totalWin
      const multiplier = totalWin / totalBet
      buckets.set(multiplier, (buckets.get(multiplier) ?? 0) + 1)
    }
    // 오도미터 방식으로 다음 조합. 릴 0부터 올린다.
    for (let reel = 0; reel < math.reels; reel += 1) {
      const length = lengths[reel] ?? 1
      const next = ((stops[reel] ?? 0) + 1) % length
      stops[reel] = next
      if (next !== 0) break
    }
  }

  const winDistribution: WinBucket[] = [...buckets.entries()]
    .map(([multiplier, count]) => ({
      multiplier,
      combos: count,
      probability: count / combos,
      rtpShare: (multiplier * count) / combos,
    }))
    .sort((a, b) => a.multiplier - b.multiplier)

  return {
    rtp: winSum / (combos * totalBet),
    hitRate: hits / combos,
    combos,
    maxWinMultiplier: maxWin / totalBet,
    winDistribution,
  }
}

export interface SimulationReport {
  rtp: number
  hitRate: number
  /** 스핀당 승리 배수(win / totalBet)의 표준편차. 변동성 지표. */
  stdDev: number
  /** 관측된 최대 승리 코인. */
  maxWin: number
  spins: number
  elapsedMs: number
}

/**
 * 몬테카를로 시뮬레이션. 전수 조사가 불가능한 큰 모델과 회귀 검증용.
 * 튜닝 편의를 위해 `betLevels`에 없는 베팅액도 받는다 (라인 수로 나누어떨어지기만 하면 된다).
 * 실제 스핀 경로가 아니므로 베팅 레벨 검사를 하지 않는다.
 */
export function simulate(math: GameMath, totalBet: number, spins: number, rng: Rng): SimulationReport {
  if (!Number.isInteger(spins) || spins < 1) {
    throw new RangeError(`spins는 1 이상의 정수여야 한다: ${spins}`)
  }
  const startedAt = performance.now()
  let winSum = 0
  let squareSum = 0
  let hits = 0
  let maxWin = 0

  for (let i = 0; i < spins; i += 1) {
    const { totalWin } = spinUnchecked(math, totalBet, rng)
    winSum += totalWin
    const multiplier = totalWin / totalBet
    squareSum += multiplier * multiplier
    if (totalWin > 0) {
      hits += 1
      if (totalWin > maxWin) maxWin = totalWin
    }
  }

  const meanMultiplier = winSum / spins / totalBet
  const variance = Math.max(0, squareSum / spins - meanMultiplier * meanMultiplier)
  return {
    rtp: meanMultiplier,
    hitRate: hits / spins,
    stdDev: Math.sqrt(variance),
    maxWin,
    spins,
    elapsedMs: performance.now() - startedAt,
  }
}
