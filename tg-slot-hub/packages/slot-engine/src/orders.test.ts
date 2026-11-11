import { describe, expect, it } from 'vitest'
import { tallyOrders } from './orders.js'
import type { CascadeOutcome, CascadeStep, OrderCard } from './types.js'

function outcome(patch: Partial<CascadeOutcome> = {}): CascadeOutcome {
  return {
    steps: [],
    finalGrid: [],
    win: 0,
    removedBySymbol: {},
    maxClusterSize: 0,
    capped: false,
    hitMaxCascades: false,
    ...patch,
  }
}

function steps(n: number): CascadeStep[] {
  return Array.from({ length: n }, (_, index) => ({ index, wins: [], removed: [], refill: [], multiplier: 1, stepWin: 0 }))
}

const POP: OrderCard = { id: 'pop-a', kind: 'popSymbol', symbol: 'a', target: 10, progress: 0, prize: 5 }
const BIG: OrderCard = { id: 'big-6', kind: 'clusterSize', target: 6, progress: 0, prize: 8 }
const CHAIN: OrderCard = { id: 'chain-3', kind: 'chainLength', target: 3, progress: 0, prize: 10 }

describe('tallyOrders', () => {
  it('popSymbol은 터진 개수를 더하고 스핀 사이에 누적한다', () => {
    const first = tallyOrders([POP], outcome({ removedBySymbol: { a: 4, b: 9 } }))
    expect(first.cards[0]?.progress).toBe(4)
    expect(first.completed).toEqual([])
    const second = tallyOrders(first.cards, outcome({ removedBySymbol: { a: 5 } }))
    expect(second.cards[0]?.progress).toBe(9)
    const third = tallyOrders(second.cards, outcome({ removedBySymbol: { a: 7 } }))
    expect(third.cards[0]?.progress).toBe(10)
    expect(third.completed.map((card) => card.id)).toEqual(['pop-a'])
  })

  it('popSymbol은 다른 심볼이나 빈 집계에는 움직이지 않는다', () => {
    expect(tallyOrders([POP], outcome({ removedBySymbol: { b: 30 } })).cards[0]?.progress).toBe(0)
    expect(tallyOrders([POP], outcome()).cards[0]?.progress).toBe(0)
  })

  it('clusterSize는 한 스핀의 최대 그룹이 target 이상이면 완료다', () => {
    const miss = tallyOrders([BIG], outcome({ maxClusterSize: 5 }))
    expect(miss.completed).toEqual([])
    expect(miss.cards[0]?.progress).toBe(5)
    // 다음 스핀이 더 작아도 최고 기록은 내려가지 않는다
    expect(tallyOrders(miss.cards, outcome({ maxClusterSize: 2 })).cards[0]?.progress).toBe(5)
    const hit = tallyOrders([BIG], outcome({ maxClusterSize: 9 }))
    expect(hit.completed.map((card) => card.id)).toEqual(['big-6'])
    expect(hit.cards[0]?.progress).toBe(6)
  })

  it('chainLength는 한 스핀의 연쇄 횟수가 target 이상이면 완료다', () => {
    expect(tallyOrders([CHAIN], outcome({ steps: steps(2) })).completed).toEqual([])
    expect(tallyOrders([CHAIN], outcome({ steps: steps(3) })).completed.map((card) => card.id)).toEqual(['chain-3'])
  })

  it('칸 순서를 지키고, completed는 왼쪽 칸부터 담는다', () => {
    const result = tallyOrders(
      [CHAIN, POP, BIG],
      outcome({ steps: steps(4), removedBySymbol: { a: 12 }, maxClusterSize: 7 }),
    )
    expect(result.cards.map((card) => card.id)).toEqual(['chain-3', 'pop-a', 'big-6'])
    expect(result.completed.map((card) => card.id)).toEqual(['chain-3', 'pop-a', 'big-6'])
    expect(result.cards.every((card) => card.progress === card.target)).toBe(true)
  })

  it('이미 완료된 카드는 다시 completed에 넣지 않는다', () => {
    const done: OrderCard = { ...BIG, progress: 6 }
    const result = tallyOrders([done], outcome({ maxClusterSize: 12 }))
    expect(result.completed).toEqual([])
    expect(result.cards[0]?.progress).toBe(6)
  })

  it('입력 카드를 바꾸지 않는다', () => {
    const cards = [{ ...POP }]
    tallyOrders(cards, outcome({ removedBySymbol: { a: 3 } }))
    expect(cards[0]?.progress).toBe(0)
  })
})
