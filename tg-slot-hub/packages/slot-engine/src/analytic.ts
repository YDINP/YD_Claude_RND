import type { GameMath } from './schema.js'
import { getLineCandidates, payoutForCount } from './evaluate.js'
import type { SymbolId } from './types.js'

/** RTP를 조각으로 나눈 것. 셋 다 **총 베팅액** 기준 기대 배수이고 합이 RTP다. */
export interface RtpBreakdown {
  /** 페이라인 배당. */
  lines: number
  /** 스캐터 배당 (유료 스핀 기준). */
  scatter: number
  /** 프리스핀이 얹어 주는 몫. */
  freeSpins: number
}

export interface AnalyticRtpReport {
  rtp: number
  breakdown: RtpBreakdown
  /** 화면 전체 스캐터 개수의 확률 분포. index = 개수. */
  scatterDistribution: number[]
  /** 한 스핀이 프리스핀을 열 확률. */
  triggerProbability: number
  /** 트리거 1회가 낳는 기대 프리스핀 횟수 (리트리거 포함). */
  expectedFreeSpinsPerTrigger: number
  /** 이론상 정지 조합 수. 전수 조사를 하지는 않는다. */
  combos: number
}

/** 릴별 심볼 출현 확률. 스트립 위 정지 위치가 균등하므로 곧 스트립 빈도다. */
export function symbolFrequencies(math: GameMath): Map<SymbolId, number>[] {
  return math.strips.map((strip) => {
    const counts = new Map<SymbolId, number>()
    for (const symbol of strip) counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
    const probabilities = new Map<SymbolId, number>()
    for (const [symbol, count] of counts) probabilities.set(symbol, count / strip.length)
    return probabilities
  })
}

/**
 * 페이라인 1개의 기대 배수 (betPerLine 기준).
 *
 * 릴은 서로 독립이고 정지 위치가 균등하므로, 어떤 페이라인이든 릴 r에서 보는 심볼의
 * 주변분포는 릴 r의 스트립 빈도와 같다. 기대값은 선형이라 라인 사이의 상관은 상관없다.
 * 라인 수 x betPerLine = 총 베팅액이므로
 * `총 베팅액 기준 라인 RTP = 이 함수의 반환값`이 그대로 성립한다.
 *
 * 계산은 릴을 왼쪽부터 훑는 DFS다. 후보는 자기 매치 집합에 없는 심볼을 만나면 죽고,
 * 죽는 순간의 연속 길이로 배당이 확정된다. 살아남은 후보가 하나도 없으면
 * 남은 릴이 무엇이든 결과가 바뀌지 않으므로 거기서 가지를 자른다.
 */
export function expectedLineMultiplier(math: GameMath): number {
  const candidates = getLineCandidates(math)
  const frequencies = symbolFrequencies(math).map((map) => [...map.entries()])

  const walk = (reel: number, alive: readonly number[], best: number, probability: number): number => {
    if (probability === 0) return 0
    // 남은 후보가 없으면 이후 릴은 결과를 바꾸지 못한다.
    if (alive.length === 0) return probability * best
    if (reel >= math.reels) {
      let top = best
      for (const index of alive) {
        top = Math.max(top, candidates[index]?.bestPayout[math.reels] ?? 0)
      }
      return probability * top
    }

    const symbols = frequencies[reel] ?? []
    let sum = 0
    for (const [symbol, p] of symbols) {
      if (p === 0) continue
      const survivors: number[] = []
      let top = best
      for (const index of alive) {
        const candidate = candidates[index]
        if (candidate === undefined) continue
        if (candidate.matches.has(symbol)) survivors.push(index)
        // 여기서 죽으면 연속 길이는 지금까지 통과한 릴 수, 곧 reel이다.
        else top = Math.max(top, candidate.bestPayout[reel] ?? 0)
      }
      sum += walk(reel + 1, survivors, top, probability * p)
    }
    return sum
  }

  return walk(
    0,
    candidates.map((_, index) => index),
    0,
    1,
  )
}

/** 릴 1개의 보이는 창(rows칸)에 스캐터가 k개 들어갈 확률. index = k. */
export function scatterWindowDistribution(
  strip: readonly SymbolId[],
  rows: number,
  scatter: SymbolId,
): number[] {
  const length = strip.length
  const distribution = new Array<number>(rows + 1).fill(0)
  for (let stop = 0; stop < length; stop += 1) {
    let count = 0
    for (let row = 0; row < rows; row += 1) {
      if (strip[(stop + row) % length] === scatter) count += 1
    }
    distribution[count] = (distribution[count] ?? 0) + 1 / length
  }
  return distribution
}

/** 릴별 분포를 합성해 화면 전체 스캐터 개수 분포를 만든다. 릴이 독립이라 단순 합성곱이다. */
export function scatterCountDistribution(math: GameMath): number[] {
  const scatter = math.scatter?.symbol
  if (scatter === undefined) return [1]
  let distribution = [1]
  for (const strip of math.strips) {
    const reel = scatterWindowDistribution(strip, math.rows, scatter)
    const next = new Array<number>(distribution.length + reel.length - 1).fill(0)
    for (let i = 0; i < distribution.length; i += 1) {
      const left = distribution[i] ?? 0
      if (left === 0) continue
      for (let j = 0; j < reel.length; j += 1) {
        next[i + j] = (next[i + j] ?? 0) + left * (reel[j] ?? 0)
      }
    }
    distribution = next
  }
  return distribution
}

/**
 * 트리거 1회가 낳는 기대 프리스핀 횟수.
 *
 * 리트리거가 없으면 그냥 `count`다. 있으면 분기 과정이 된다.
 * 부여된 스핀 1회가 스스로를 포함해 낳는 기대 스핀 수를 g라 하면,
 * 그 스핀에서 확률 p로 count회가 더 부여되므로
 *
 *     g = 1 + p * count * g   =>   g = 1 / (1 - count * p)
 *
 * 처음에 count회를 받으므로 총 기대 횟수는 `count * g = count / (1 - count * p)`다.
 * `count * p >= 1`이면 기대 횟수가 발산한다. 그런 모델은 만들면 안 되므로 예외로 막는다.
 */
export function expectedFreeSpinsPerTrigger(
  count: number,
  triggerProbability: number,
  retrigger: boolean,
): number {
  if (!retrigger) return count
  const growth = count * triggerProbability
  if (growth >= 1) {
    throw new RangeError(
      `리트리거 기대 스핀이 발산한다: count(${count}) x P(트리거)(${triggerProbability}) >= 1`,
    )
  }
  return count / (1 - growth)
}

/**
 * 전수 조사 없이 정확한 RTP를 구한다. 5릴처럼 조합이 수억 개인 모델용이다.
 *
 * 기대값은 선형이므로 라인·스캐터·프리스핀을 따로 구해 더하면 된다.
 * 근사가 아니라 닫힌 형태의 정확값이며, 몬테카를로로 교차 검증한다.
 */
export function computeAnalyticRtp(math: GameMath, totalBet: number): AnalyticRtpReport {
  assertAnalyticBet(math, totalBet)
  const lines = expectedLineMultiplier(math)
  const scatterDistribution = scatterCountDistribution(math)

  let scatter = 0
  let triggerProbability = 0
  const config = math.scatter
  if (config !== undefined) {
    for (let count = 0; count < scatterDistribution.length; count += 1) {
      const p = scatterDistribution[count] ?? 0
      if (p === 0) continue
      scatter += p * payoutForCount(config.pays, count)
      if (config.freeSpins !== undefined && count >= config.freeSpins.trigger) triggerProbability += p
    }
  }

  const base = lines + scatter
  let freeSpins = 0
  let spinsPerTrigger = 0
  const feature = config?.freeSpins
  if (feature !== undefined && triggerProbability > 0) {
    spinsPerTrigger = expectedFreeSpinsPerTrigger(feature.count, triggerProbability, feature.retrigger)
    // 프리스핀은 유료 스핀과 같은 스트립을 돌리므로 한 회당 기대값이 base x multiplier다.
    freeSpins = triggerProbability * spinsPerTrigger * feature.multiplier * base
  }

  return {
    rtp: base + freeSpins,
    breakdown: { lines, scatter, freeSpins },
    scatterDistribution,
    triggerProbability,
    expectedFreeSpinsPerTrigger: spinsPerTrigger,
    combos: math.strips.reduce((acc, strip) => acc * strip.length, 1),
  }
}

/** `totalBet`은 라인 수로 나누어떨어져야 한다는 계약을 그대로 지킨다. */
export function assertAnalyticBet(math: GameMath, totalBet: number): void {
  if (!Number.isInteger(totalBet) || totalBet <= 0) {
    throw new RangeError(`totalBet은 양의 정수여야 한다: ${totalBet}`)
  }
  if (totalBet % math.paylines.length !== 0) {
    throw new RangeError(`totalBet(${totalBet})이 라인 수(${math.paylines.length})로 나누어떨어지지 않는다`)
  }
}
