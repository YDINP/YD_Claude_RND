import { describe, expect, it } from 'vitest'
import {
  cascadeHoldFor,
  countSymbol,
  dominantRemoved,
  embersAtStep,
  forgeTiming,
  planEmbers,
  planSettle,
  railFromCarry,
  type ForgeRailTrigger,
} from './forge'

const RULES = { slots: 4, fullMultiplier: 2, heatCap: 300 }

function feature(partial: Partial<ForgeRailTrigger>): ForgeRailTrigger {
  return {
    type: 'forgeRail',
    embers: [],
    heatBefore: 0,
    filledBefore: 0,
    heatAfter: 0,
    filledAfter: 0,
    fulls: [],
    multiplier: 1,
    baseWin: 0,
    boostedWin: 0,
    ...partial,
  }
}

describe('planEmbers', () => {
  it('불씨마다 합계와 켜진 칸을 쌓는다', () => {
    const plans = planEmbers(
      feature({
        embers: [
          { step: 0, position: [1, 0], value: 2 },
          { step: 1, position: [3, 1], value: 5 },
        ],
        heatAfter: 7,
        filledAfter: 2,
      }),
      RULES,
    )
    expect(plans.map((p) => p.after)).toEqual([
      { heat: 2, filled: 1 },
      { heat: 7, filled: 2 },
    ])
    expect(plans.every((p) => p.full === null)).toBe(true)
  })

  it('네 번째 불씨에서 화로 가득: 합계가 두 배, 칸은 비고, lit는 가득 직전', () => {
    const embers = [2, 3, 5, 10].map((value, i) => ({ step: i, position: [i, 0] as [number, number], value }))
    const plans = planEmbers(feature({ embers, heatAfter: 40, filledAfter: 0 }), RULES)
    const last = plans[3]
    expect(last?.lit).toEqual({ heat: 20, filled: 4 })
    expect(last?.full).toEqual({ heatBefore: 20, heatAfter: 40 })
    expect(last?.after).toEqual({ heat: 40, filled: 0 })
  })

  it('프리스핀은 이월 값에서 이어 간다', () => {
    const plans = planEmbers(feature({ embers: [{ step: 0, position: [0, 0], value: 3 }], heatBefore: 10, filledBefore: 3, heatAfter: 26, filledAfter: 0 }), RULES)
    expect(plans[0]?.full).toEqual({ heatBefore: 13, heatAfter: 26 })
  })

  it('마지막 불씨는 서버 값으로 덮는다', () => {
    const plans = planEmbers(feature({ embers: [{ step: 0, position: [0, 0], value: 2 }], heatAfter: 9, filledAfter: 3 }), RULES)
    expect(plans[0]?.after).toEqual({ heat: 9, filled: 3 })
  })

  it('합계 상한 300을 넘지 않는다', () => {
    const plans = planEmbers(feature({ embers: [{ step: 0, position: [0, 0], value: 50 }], heatBefore: 290, heatAfter: 300, filledAfter: 1 }), RULES)
    expect(plans[0]?.after.heat).toBe(300)
  })
})

describe('연쇄 멈춤 시간', () => {
  const embers = [
    { step: 0, position: [0, 0] as [number, number], value: 2 },
    { step: 2, position: [1, 0] as [number, number], value: 2 },
  ]
  const plans = planEmbers(feature({ embers, heatAfter: 4, filledAfter: 2 }), RULES)
  const timing = forgeTiming('normal', false, false)

  it('불씨 없는 단계·중간 단계는 0, 마지막 단계는 비행 시간', () => {
    expect(cascadeHoldFor(plans, 1, 2, timing)).toBe(0)
    expect(cascadeHoldFor(plans, 0, 2, timing)).toBe(0)
    expect(cascadeHoldFor(plans, 2, 2, timing)).toBe(timing.flightMs)
  })

  it('가득 단계는 비행 + 가득 연출', () => {
    const four = planEmbers(feature({ embers: [2, 2, 2, 2].map((value) => ({ step: 0, position: [0, 0] as [number, number], value })), heatAfter: 16, filledAfter: 0 }), RULES)
    expect(cascadeHoldFor(four, 0, 3, timing)).toBe(timing.flightMs + timing.fullMs)
  })

  it('STOP·모션 축소는 비행 0, 가득 250ms', () => {
    expect(forgeTiming('normal', false, true)).toMatchObject({ flightMs: 0, fullMs: 250, settleMs: 250 })
    expect(forgeTiming('turbo', true, false)).toMatchObject({ flightMs: 0, fullMs: 250 })
  })

  it('속도 모드 표(기획 §7-3)', () => {
    expect(forgeTiming('normal', false, false)).toMatchObject({ flightMs: 380, fullMs: 900, settleMs: 600 })
    expect(forgeTiming('quick', false, false)).toMatchObject({ flightMs: 260, fullMs: 600, settleMs: 400 })
    expect(forgeTiming('turbo', false, false)).toMatchObject({ flightMs: 180, fullMs: 400, settleMs: 300 })
  })

  it('embersAtStep', () => {
    expect(embersAtStep(plans, 2)).toHaveLength(1)
    expect(embersAtStep(plans, 1)).toHaveLength(0)
  })
})

describe('planSettle', () => {
  const win = feature({ embers: [{ step: 0, position: [0, 0], value: 3 }], multiplier: 12, baseWin: 160, boostedWin: 1920 })

  it('기본 게임은 불씨가 있어야 정산', () => {
    expect(planSettle(win, 20, false)).toEqual({ base: 160, multiplier: 12, boosted: 1920, numbersOnly: false })
    expect(planSettle(feature({ baseWin: 160, boostedWin: 160 }), 20, false)).toBeNull()
  })

  it('프리스핀은 배율 > 1 이고 연쇄 당첨이 있어야 정산', () => {
    expect(planSettle(feature({ multiplier: 1, baseWin: 100, boostedWin: 100 }), 20, true)).toBeNull()
    expect(planSettle(feature({ multiplier: 5, baseWin: 0 }), 20, true)).toBeNull()
    expect(planSettle(feature({ multiplier: 5, baseWin: 100, boostedWin: 500 }), 20, true)?.multiplier).toBe(5)
  })

  it('곱한 금액이 베팅 미만이면 숫자만', () => {
    expect(planSettle(feature({ embers: win.embers, multiplier: 2, baseWin: 6, boostedWin: 12 }), 20, false)?.numbersOnly).toBe(true)
  })

  it('없으면 null', () => {
    expect(planSettle(null, 20, false)).toBeNull()
  })
})

describe('그 밖의 도우미', () => {
  it('railFromCarry', () => {
    expect(railFromCarry(null)).toEqual({ heat: 0, filled: 0 })
    expect(railFromCarry({ heat: 12, filled: 2 })).toEqual({ heat: 12, filled: 2 })
  })

  it('countSymbol은 grid[row][reel] 전체에서 센다', () => {
    expect(countSymbol([['a', 'anvil'], ['anvil', 'b']], 'anvil')).toBe(2)
    expect(countSymbol(undefined, 'anvil')).toBe(0)
  })

  it('dominantRemoved는 가장 많이 터진 그림', () => {
    expect(dominantRemoved(['a', 'b', 'b', 'c', 'b', 'a'])).toEqual({ symbol: 'b', count: 3 })
    expect(dominantRemoved([])).toBeNull()
  })
})
