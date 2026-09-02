import type { GameMath } from './schema.js'
import { getLineCandidates, payoutForCount } from './evaluate.js'
import type { Mutation } from './schema.js'
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
export function expectedLineMultiplier(
  math: GameMath,
  override?: Map<SymbolId, number>[],
): number {
  const candidates = getLineCandidates(math)
  const frequencies = (override ?? symbolFrequencies(math)).map((map) => [...map.entries()])

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
  const lines =
    math.payModel === 'ways'
      ? expectedWaysMultiplier(math) / (math.ways?.betDivisor ?? 25)
      : mysteryRevealCases(math).reduce(
          (acc, revealCase) => acc + revealCase.probability * expectedLineMultiplier(math, revealCase.frequencies),
          0,
        )
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
  const divisor = math.payModel === 'ways' ? (math.ways?.betDivisor ?? 25) : math.paylines.length
  if (divisor <= 0 || totalBet % divisor !== 0) {
    throw new RangeError(`totalBet(${totalBet})이 배당 단위 수(${divisor})로 나누어떨어지지 않는다`)
  }
}

// ---- ways 페이 모델 ----

interface ReelMatchStats {
  /** 보이는 창에서 일치하는 칸 수의 기대값. */
  expected: number
  /** 창에 일치가 하나도 없을 확률. */
  zero: number
  /** 창에 일치가 하나 이상 있을 확률. */
  nonZero: number
}

/**
 * 릴별 매칭 통계. `expected`는 릴 창의 칸이 각각 스트립 위에서 균등하므로
 * `rows x 스트립 빈도`로 정확히 나온다. `zero`는 스트립을 한 바퀴 훑어 센다.
 */
function reelMatchStats(math: GameMath, matches: ReadonlySet<SymbolId>): ReelMatchStats[] {
  return math.strips.map((strip) => {
    const length = strip.length
    let hits = 0
    let zeroStops = 0
    for (const symbol of strip) {
      if (matches.has(symbol)) hits += 1
    }
    for (let stop = 0; stop < length; stop += 1) {
      let found = false
      for (let row = 0; row < math.rows; row += 1) {
        if (matches.has(strip[(stop + row) % length] as SymbolId)) {
          found = true
          break
        }
      }
      if (!found) zeroStops += 1
    }
    const zero = zeroStops / length
    return { expected: (math.rows * hits) / length, zero, nonZero: 1 - zero }
  })
}

/**
 * ways 게임의 기대 배수 (웨이당 베팅액 기준).
 *
 * 지급액은 `경로 수 x 배수 x 웨이당 베팅액`이고 경로 수는 릴별 매칭 칸 수의 곱이다.
 * 릴이 독립이므로 곱의 기대값은 기대값의 곱으로 인수분해된다.
 * 연속 길이가 정확히 k라는 사건은 `앞 k릴이 모두 비지 않음 x 릴 k가 빔`이고,
 * 앞 k릴의 곱은 0이면 자동으로 0이 되므로 지시함수를 따로 곱할 필요가 없다.
 *
 *     E[s] = Σ_k 배수(k) x (Π_{i<j} E[c_i]) x (Π_{j<=i<k} P(c_i>0)) x P(c_k=0)
 *
 * 여기서 j는 실제로 지급되는 길이다. 4연속인데 3개까지만 배당이 있으면 곱은 3릴까지만 센다.
 */
export function expectedWaysMultiplier(math: GameMath): number {
  const candidates = getLineCandidates(math)
  const bothWays = math.ways?.bothWays === true
  const forward = Array.from({ length: math.reels }, (_, index) => index)
  const orders: number[][] = bothWays ? [forward, [...forward].reverse()] : [forward]

  let total = 0
  for (const candidate of candidates) {
    const stats = reelMatchStats(math, candidate.matches)

    orders.forEach((order, directionIndex) => {
      for (let k = 1; k <= math.reels; k += 1) {
        // 전 릴 매칭은 왼쪽 방향에서 이미 셌다.
        if (directionIndex > 0 && k === math.reels) continue
        const multiplier = candidate.bestPayout[k] ?? 0
        if (multiplier <= 0) continue
        const paidCount = candidate.bestCount[k] ?? k

        let term = 1
        for (let i = 0; i < paidCount; i += 1) {
          term *= stats[order[i] ?? 0]?.expected ?? 0
        }
        for (let i = paidCount; i < k; i += 1) {
          term *= stats[order[i] ?? 0]?.nonZero ?? 0
        }
        if (k < math.reels) term *= stats[order[k] ?? 0]?.zero ?? 0
        if (term === 0) continue
        total += multiplier * term
      }
    })
  }
  return total
}

// ---- 미스터리 공개 ----

interface RevealCase {
  probability: number
  frequencies: Map<SymbolId, number>[]
}

/** 미스터리 뮤테이션만 골라낸다. 여러 개면 첫 번째만 해석 대상이다. */
function mysteryMutation(math: GameMath): Extract<Mutation, { type: 'mystery' }> | undefined {
  for (const mutation of math.mutations ?? []) {
    if (mutation.type === 'mystery') return mutation
  }
  return undefined
}

/**
 * 공개 심볼로 조건부화하면 릴 독립이 복원된다.
 *
 * 미스터리는 스핀당 한 번만 뽑고 화면의 모든 미스터리 칸이 같은 심볼이 되므로,
 * "공개가 s였다"는 조건 아래에서 그리드는 미스터리 심볼이 s로 치환된 것과 같다.
 * 릴별 분포는 미스터리의 확률 질량이 s로 옮겨간 것이고, 릴끼리는 여전히 독립이다.
 * 따라서 전체 기대값은 공개 확률로 가중한 조건부 기대값의 합이다.
 */
export function mysteryRevealCases(math: GameMath): RevealCase[] {
  const mutation = mysteryMutation(math)
  const base = symbolFrequencies(math)
  if (mutation === undefined) return [{ probability: 1, frequencies: base }]

  const entries = Object.entries(mutation.weights).filter(([, weight]) => weight > 0)
  const total = entries.reduce((acc, [, weight]) => acc + weight, 0)
  if (total <= 0) return [{ probability: 1, frequencies: base }]

  return entries.map(([revealed, weight]) => ({
    probability: weight / total,
    frequencies: base.map((map) => {
      const next = new Map(map)
      const mysteryMass = next.get(mutation.symbol) ?? 0
      if (mysteryMass > 0) {
        next.delete(mutation.symbol)
        next.set(revealed, (next.get(revealed) ?? 0) + mysteryMass)
      }
      return next
    }),
  }))
}

/** 해석적 경로를 쓸 수 있는 모델인지. 쓸 수 없으면 몬테카를로로 가야 한다. */
export function isAnalytic(math: GameMath): boolean {
  const mutations = math.mutations ?? []
  if (mutations.length === 0) return true
  // 미스터리만 있으면 공개 조건부화로 닫힌 식이 된다. ways와 섞이면 창 분포까지 바뀌어 어렵다.
  return math.payModel !== 'ways' && mutations.every((mutation) => mutation.type === 'mystery')
}
