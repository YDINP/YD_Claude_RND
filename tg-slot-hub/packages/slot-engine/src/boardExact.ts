import { boardPayout, initialBoardState, stepBoard } from './board.js'
import type { BoardState } from './board.js'
import type { BoardBonusConfig } from './boardSchema.js'
import type { BoardEnd } from './types.js'

/** 말판 정확 기대값. 확률은 전부 말판 1회 기준이고, 지급은 총 베팅 배수(최소 지급 포함)다. */
export interface BoardExpectation {
  /** E[지급]. */
  mean: number
  /** E[지급²]. */
  meanSq: number
  /** 표준편차. */
  sd: number
  /** 확률이 0보다 큰 경로 중 최대 지급. */
  max: number
  /** 종료 사유별 확률. 합 1. */
  pEnd: Record<BoardEnd, number>
  /** 갈림길 칸에 한 번 이상 멈출 확률. */
  pFork: number
  /** 결승에 닿을 확률 (`pEnd.goal`과 같다). */
  pGoal: number
  /** 최소 지급이 적용될 확률 (`pot x multiplier < minPayout`). */
  pMinPayout: number
  /** 평균 던지기 수. */
  meanThrows: number
  /** 던지기 수 분포 (인덱스 = 던진 수). */
  throwsDistribution: number[]
  /** 끝 배수 분포. */
  multiplierDistribution: Record<number, number>
  /** 지급 분포 (오름차순). */
  distribution: { payout: number; p: number }[]
  /** 거쳐 간 상태 수. */
  states: number
}

function keyOf(state: BoardState, forked: boolean): string {
  return `${state.at}|${state.route}|${state.pot}|${state.multiplier}|${state.traps}|${state.throwsLeft}|${state.thrown}|${forked ? 1 : 0}`
}

/**
 * 상태 확률을 던지기 한 번씩 앞으로 밀어 정확한 분포를 구한다(몬테카를로 없음).
 * 상태 = (칸, 길, 바구니, 배수, 등불, 기회, 던진 수, 갈림길 밟음 여부). 던진 수가 매번 1씩 늘어
 * `maxThrows`층 안에 반드시 끝난다. 던지기 처리는 엔진의 `stepBoard`를 그대로 쓴다.
 */
export function boardExpectation(config: BoardBonusConfig): BoardExpectation {
  const total = config.throwTable.reduce((sum, row) => sum + row.weight, 0)
  const pEnd: Record<BoardEnd, number> = { goal: 0, traps: 0, throws: 0 }
  const payouts = new Map<number, number>()
  const multipliers: Record<number, number> = {}
  const throwsDistribution: number[] = new Array<number>(config.maxThrows + 1).fill(0)
  let pFork = 0
  let pMin = 0
  let states = 0

  let layer = new Map<string, { state: BoardState; forked: boolean; p: number }>()
  const first = initialBoardState(config)
  layer.set(keyOf(first, false), { state: first, forked: false, p: 1 })

  while (layer.size > 0) {
    states += layer.size
    const next = new Map<string, { state: BoardState; forked: boolean; p: number }>()
    for (const { state, forked, p } of layer.values()) {
      for (const row of config.throwTable) {
        const q = (p * row.weight) / total
        const stepped = stepBoard(config, state, row.steps).state
        const nowForked = forked || config.forks[stepped.at] !== undefined
        if (stepped.end !== undefined) {
          const payout = boardPayout(config, stepped.pot, stepped.multiplier)
          pEnd[stepped.end] += q
          payouts.set(payout, (payouts.get(payout) ?? 0) + q)
          multipliers[stepped.multiplier] = (multipliers[stepped.multiplier] ?? 0) + q
          throwsDistribution[stepped.thrown] = (throwsDistribution[stepped.thrown] ?? 0) + q
          if (nowForked) pFork += q
          if (stepped.pot * stepped.multiplier < config.minPayout) pMin += q
          continue
        }
        const key = keyOf(stepped, nowForked)
        const found = next.get(key)
        if (found === undefined) next.set(key, { state: stepped, forked: nowForked, p: q })
        else found.p += q
      }
    }
    layer = next
  }

  const distribution = [...payouts.entries()].map(([payout, p]) => ({ payout, p })).sort((a, b) => a.payout - b.payout)
  let mean = 0
  let meanSq = 0
  let max = 0
  for (const { payout, p } of distribution) {
    mean += payout * p
    meanSq += payout * payout * p
    if (p > 0 && payout > max) max = payout
  }
  const meanThrows = throwsDistribution.reduce((sum, p, thrown) => sum + p * thrown, 0)
  return {
    mean,
    meanSq,
    sd: Math.sqrt(Math.max(0, meanSq - mean * mean)),
    max,
    pEnd,
    pFork,
    pGoal: pEnd.goal,
    pMinPayout: pMin,
    meanThrows,
    throwsDistribution,
    multiplierDistribution: multipliers,
    distribution,
    states,
  }
}
