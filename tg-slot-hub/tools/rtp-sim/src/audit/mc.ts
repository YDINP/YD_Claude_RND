import { createSeededRng, simulate } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import type { ConvergencePoint, McAggregate, MonteCarloResult } from './types.js'

/**
 * 청크로 나눠 돌린 시뮬레이션 결과를 하나로 합친다.
 * 분산은 평균과 제곱합으로 되돌린 뒤 다시 계산하므로 한 번에 돌린 것과 같은 값이 나온다.
 * (E[X^2] = n(Var + Mean^2) 을 청크마다 복원해서 더한다.)
 */
export function mergeSimulations(chunks: readonly McAggregate[]): McAggregate {
  let spins = 0
  let sum = 0
  let squareSum = 0
  let hits = 0
  let maxWin = 0
  let freeSpinsPlayed = 0
  let triggers = 0
  for (const chunk of chunks) {
    if (chunk.spins <= 0) continue
    spins += chunk.spins
    sum += chunk.rtp * chunk.spins
    squareSum += chunk.spins * (chunk.stdDev * chunk.stdDev + chunk.rtp * chunk.rtp)
    hits += chunk.hitRate * chunk.spins
    freeSpinsPlayed += chunk.freeSpinsPlayed
    triggers += chunk.triggerRate * chunk.spins
    if (chunk.maxWin > maxWin) maxWin = chunk.maxWin
  }
  if (spins === 0) {
    return { spins: 0, rtp: 0, hitRate: 0, stdDev: 0, maxWin: 0, freeSpinsPlayed: 0, triggerRate: 0 }
  }
  const mean = sum / spins
  const variance = Math.max(0, squareSum / spins - mean * mean)
  return {
    spins,
    rtp: mean,
    hitRate: hits / spins,
    stdDev: Math.sqrt(variance),
    maxWin,
    freeSpinsPlayed,
    triggerRate: triggers / spins,
  }
}

/** 총 스핀을 최대 `points`개 청크로 쪼갠다. 나머지는 앞쪽 청크에 하나씩 얹는다. */
export function chunkSizes(spins: number, points: number): number[] {
  if (!Number.isInteger(spins) || spins < 1) throw new RangeError(`spins는 1 이상의 정수여야 한다: ${spins}`)
  const count = Math.max(1, Math.min(points, spins))
  const base = Math.floor(spins / count)
  const remainder = spins - base * count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

export interface MonteCarloOptions {
  /** 수렴 곡선 점 개수 (= 청크 수). 기본 100 (1%마다). */
  points?: number
  /** 청크 하나가 끝날 때마다 0~1 진행률로 호출된다. */
  onProgress?: (ratio: number, running: MonteCarloResult) => void
}

/**
 * 몬테카를로를 청크로 돌려 진행률과 수렴 곡선을 함께 만든다.
 * RNG 인스턴스를 하나만 만들어 청크 사이에 이어 쓰므로 난수 스트림은 한 번에 돌린 것과 같다.
 */
export function runMonteCarlo(
  math: GameMath,
  totalBet: number,
  spins: number,
  seed: string,
  options: MonteCarloOptions = {},
): MonteCarloResult {
  const sizes = chunkSizes(spins, options.points ?? 100)
  const rng = createSeededRng(seed)
  const done: McAggregate[] = []
  const convergence: ConvergencePoint[] = []
  let elapsedMs = 0
  let result: MonteCarloResult = {
    spins: 0,
    rtp: 0,
    hitRate: 0,
    stdDev: 0,
    maxWin: 0,
    freeSpinsPlayed: 0,
    triggerRate: 0,
    seed,
    totalBet,
    elapsedMs: 0,
    convergence,
  }

  for (const size of sizes) {
    const report = simulate(math, totalBet, size, rng)
    elapsedMs += report.elapsedMs
    done.push(report)
    const merged = mergeSimulations(done)
    convergence.push({ spins: merged.spins, rtp: merged.rtp })
    result = { ...merged, seed, totalBet, elapsedMs, convergence }
    options.onProgress?.(merged.spins / spins, result)
  }

  return result
}
