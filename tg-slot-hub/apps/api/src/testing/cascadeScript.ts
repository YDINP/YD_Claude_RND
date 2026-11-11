import { foldCascades } from '@tgslot/slot-engine'
import type { CascadeStep, FeatureTrigger, OrderCard, RoundCarry, RoundState, SpinResult } from '@tgslot/slot-engine'
import type { SpinComputation } from '../repos/types.js'

/**
 * 연쇄·주문 라운드 테스트용 대본. 엔진이 아직 없어도(또는 결과를 고정하고 싶어도) 저장·재전송·carry 경로를
 * 손으로 만든 `SpinResult`로 검증한다. 엔진의 진실(nextState/cascades)을 **대본이 대신 말해 주는** 구조라
 * 서버가 따로 세는 로직이 생기면 이 테스트가 잡는다.
 */
export interface CascadeScript {
  features?: FeatureTrigger[]
  nextState?: RoundState
  win?: number
  /** 첫 평가 그리드에서 이만큼의 연쇄 단계를 만든다. */
  cascadeSteps?: number
}

/** 3행 이상, 2릴 이상이면 어떤 그리드에든 맞는 연쇄 단계. 릴 0에서 1칸, 릴 1에서 2칸을 지운다. */
export function buildCascadeSteps(grid: readonly (readonly string[])[], count: number): CascadeStep[] {
  const reels = grid[0]?.length ?? 0
  const steps: CascadeStep[] = []
  let current: string[][] = grid.map((row) => [...row])
  for (let index = 0; index < count; index += 1) {
    const removed: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ]
    const refill: string[][] = Array.from({ length: reels }, () => [])
    refill[0] = [`new${index}a`]
    refill[1] = [`new${index}b`, `new${index}c`]
    const win = 50 * (index + 1)
    const step: CascadeStep = {
      index,
      wins: [
        {
          line: -1,
          symbol: 'cherry',
          count: removed.length,
          multiplier: 5,
          win,
          positions: removed,
          payKind: 'cluster',
          cascade: index,
          ladder: index + 1,
        },
      ],
      removed,
      refill,
      multiplier: index + 1,
      stepWin: win,
    }
    steps.push(step)
    current = foldCascades(current, [step])
  }
  return steps
}

/** 스핀 결과를 대본대로 덮어쓴다. 대본이 없으면 그대로다. */
export function applyCascadeScript(computed: SpinComputation, script: CascadeScript | null): SpinComputation {
  if (!script) return computed
  const win = script.win ?? computed.result.totalWin
  const result: SpinResult = { ...computed.result, wins: [], lineWin: win, scatterWin: 0, totalWin: win }
  if (script.nextState) result.nextState = script.nextState
  else delete result.nextState
  if (script.cascadeSteps !== undefined) {
    const cascades = buildCascadeSteps(computed.result.grid, script.cascadeSteps)
    result.cascades = cascades
    result.finalGrid = foldCascades(computed.result.grid, cascades)
  }
  return { ...computed, result, features: (script.features ?? []) as SpinComputation['features'] }
}

export const ORDER_CARDS: OrderCard[] = [
  { id: 'pop-heart-12', kind: 'popSymbol', symbol: 'heart', target: 12, progress: 0, prize: 2 },
  { id: 'size-9', kind: 'clusterSize', target: 9, progress: 0, prize: 3 },
  { id: 'chain-4', kind: 'chainLength', target: 4, progress: 0, prize: 5 },
]

export function orderCarry(cards: OrderCard[], drawn = 3, completed = 0, prizeTotal = 0): RoundCarry {
  return { orders: { cards: cards.map((card) => ({ ...card })), drawn, completed, prizeTotal } }
}

/** 주문 라운드 진입 스핀의 엔진 결과(피처 + nextState). */
export function orderRoundEntry(spins = 8): { features: FeatureTrigger[]; nextState: RoundState; win: number } {
  return {
    // 진입 스핀의 당첨은 엔진의 실제 무작위 결과가 아니라 0으로 고정한다 (잔액 단언이 흔들리지 않게).
    win: 0,
    features: [
      { type: 'freeSpins', spins, multiplier: 1, retrigger: false },
      { type: 'orderRound', cards: ORDER_CARDS.map((card) => ({ ...card })) },
    ],
    nextState: { freeSpinsLeft: spins, freeSpinsTotal: spins, multiplier: 1, carry: orderCarry(ORDER_CARDS) },
  }
}
