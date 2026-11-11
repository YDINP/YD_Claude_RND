import { describe, expect, it } from 'vitest'
import type { FeatureTrigger, OrderCard } from '@tgslot/shared'
import { parseGameMath } from '@tgslot/slot-engine'
import { miniCandyRaw } from '../test/candyMath'
import {
  MAX_TOKENS_PER_STEP,
  addChainStep,
  addClusterSize,
  addPoppedSymbols,
  completedOrders,
  findMismatches,
  ladderIndexOf,
  orderCardText,
  planTokens,
  replacedSlots,
} from './orders'

const pop = (progress: number, symbol = 'drop_red', target = 30): OrderCard => ({
  id: `pop-${symbol}-${target}`,
  kind: 'popSymbol',
  symbol,
  target,
  progress,
  prize: 3,
})
const cluster = (progress: number): OrderCard => ({ id: 'cluster-10', kind: 'clusterSize', target: 10, progress, prize: 8 })
const chain = (progress: number): OrderCard => ({ id: 'chain-3', kind: 'chainLength', target: 3, progress, prize: 5 })

describe('addPoppedSymbols', () => {
  it('counts only the card symbol, never wild, and clamps at the target', () => {
    const cards = [pop(28), pop(0, 'heart', 15)]
    const next = addPoppedSymbols(cards, ['drop_red', 'drop_red', 'drop_red', 'wild', 'heart'])
    expect(next[0]?.progress).toBe(30)
    expect(next[1]?.progress).toBe(1)
    expect(cards[0]?.progress).toBe(28)
  })

  it('leaves non-pop cards alone', () => {
    const cards = [cluster(2), chain(1)]
    expect(addPoppedSymbols(cards, ['drop_red'])).toEqual(cards)
  })
})

describe('addChainStep / addClusterSize', () => {
  it('chain progress is the best step seen, capped at the target', () => {
    let cards = [chain(0)]
    cards = addChainStep(cards, 0)
    expect(cards[0]?.progress).toBe(1)
    cards = addChainStep(cards, 3)
    expect(cards[0]?.progress).toBe(3)
    cards = addChainStep(cards, 1)
    expect(cards[0]?.progress).toBe(3)
  })

  it('cluster progress is the best size seen, capped at the target', () => {
    let cards = [cluster(0)]
    cards = addClusterSize(cards, 7)
    expect(cards[0]?.progress).toBe(7)
    cards = addClusterSize(cards, 5)
    expect(cards[0]?.progress).toBe(7)
    cards = addClusterSize(cards, 14)
    expect(cards[0]?.progress).toBe(10)
  })
})

describe('planTokens', () => {
  const removed = Array.from({ length: 12 }, (_, i) => [i % 6, Math.floor(i / 6)] as const)

  it('flies at most 8 tokens per step', () => {
    const symbols = removed.map(() => 'drop_red')
    expect(planTokens([pop(0)], removed, symbols)).toHaveLength(MAX_TOKENS_PER_STEP)
  })

  it('flies only as many as the card still needs and only the matching symbol', () => {
    const symbols = removed.map((_, i) => (i % 2 === 0 ? 'drop_red' : 'heart'))
    const plan = planTokens([pop(28), pop(0, 'heart', 15)], removed, symbols)
    expect(plan.filter((p) => p.slot === 0)).toHaveLength(2)
    expect(plan.filter((p) => p.slot === 1)).toHaveLength(6)
  })

  it('does nothing for a card that is already full or is not a pop card', () => {
    expect(planTokens([pop(30), cluster(3)], removed, removed.map(() => 'drop_red'))).toEqual([])
  })
})

describe('server reconciliation', () => {
  it('reports only same-slot same-id progress differences', () => {
    const shown = [pop(10), pop(5, 'heart', 15), chain(2)]
    const server = [pop(12), pop(5, 'heart', 15), cluster(0)]
    expect(findMismatches(shown, server)).toEqual([{ slot: 0, id: 'pop-drop_red-30', shown: 10, server: 12 }])
  })

  it('finds slots whose card was replaced (completed and re-dealt) or newly dealt', () => {
    const prev = [pop(30), cluster(4), chain(1)]
    expect(replacedSlots(prev, [pop(30), cluster(4), chain(1)])).toEqual([])
    expect(replacedSlots(prev, [pop(30), cluster(4), pop(0, 'heart', 15)])).toEqual([2])
    expect(replacedSlots(prev, [pop(0), cluster(4), chain(1)])).toEqual([0])
    expect(replacedSlots([], [pop(0)])).toEqual([0])
  })
})

describe('ladderIndexOf', () => {
  const ladder = [1, 2, 3, 5, 8, 12, 20]
  it('finds the rung, or falls back to the step number capped at the last rung', () => {
    expect(ladderIndexOf(ladder, 5, 9)).toBe(3)
    expect(ladderIndexOf(ladder, 4, 2)).toBe(2)
    expect(ladderIndexOf(ladder, 99, 40)).toBe(6)
    expect(ladderIndexOf(undefined, 3, 2)).toBe(0)
  })
})

const math = parseGameMath(miniCandyRaw)

describe('completedOrders / orderCardText', () => {
  it('joins orderComplete features with the pool entry', () => {
    const features: FeatureTrigger[] = [{ type: 'orderComplete', id: 'pop-red-30', prize: 60 }]
    const done = completedOrders(math, features)
    expect(done).toEqual([{ id: 'pop-red-30', kind: 'popSymbol', symbol: 'drop_red', target: 30, prize: 60 }])
  })

  it('writes the symbol name only when asked', () => {
    const t = (key: string, vars?: Record<string, string | number>): string =>
      `${key}:${Object.values(vars ?? {}).join(',')}`
    const card = { kind: 'popSymbol' as const, symbol: 'drop_red', target: 30 }
    expect(orderCardText(card, math, 'ko', t as never)).toBe('orderCardPop:30')
    expect(orderCardText(card, math, 'ko', t as never, true)).toBe('orderCardPopNamed:빨간 물방울,30')
  })
})
