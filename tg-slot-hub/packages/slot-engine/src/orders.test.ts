import { describe, expect, it } from 'vitest'
import { drawOrderCards, tallyOrders } from './orders.js'
import { createSeededRng } from './rng/seeded.js'
import { buildGrid, resolveSpin, spinUnchecked } from './spin.js'
import { makeClusterMath } from './testFixtures.js'
import type { CascadeOutcome, CascadeStep, OrderCard, OrderRoundCarry, Rng, RoundState } from './types.js'

class CountingRng implements Rng {
  calls = 0
  constructor(private readonly inner: Rng) {}
  nextInt(maxExclusive: number): number {
    this.calls += 1
    return this.inner.nextInt(maxExclusive)
  }
}

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

// ---- drawOrderCards ----

describe('drawOrderCards', () => {
  const math = makeClusterMath()

  it('요청한 장수만 뽑고 id가 겹치지 않으며 progress는 0이다', () => {
    const rng = new CountingRng(createSeededRng('draw'))
    const cards = drawOrderCards(math, [], 3, rng)
    expect(cards).toHaveLength(3)
    expect(new Set(cards.map((card) => card.id)).size).toBe(3)
    expect(cards.every((card) => card.progress === 0)).toBe(true)
    expect(rng.calls).toBe(3)
  })

  it('활성 카드 id는 뽑지 않는다 (2,000회)', () => {
    const rng = createSeededRng('draw-exclude')
    for (let i = 0; i < 2000; i += 1) {
      const active = drawOrderCards(math, [], 2, rng)
      const [fresh] = drawOrderCards(math, active, 1, rng)
      expect(active.map((card) => card.id)).not.toContain(fresh?.id)
    }
  })

  it('symbol은 popSymbol 카드에만 싣는다', () => {
    const cards = drawOrderCards(math, [], 4, createSeededRng('draw-shape'))
    for (const card of cards) expect('symbol' in card).toBe(card.kind === 'popSymbol')
  })

  it('후보가 모자라면 뽑을 수 있는 만큼만 뽑고 RNG도 그만큼만 쓴다', () => {
    const pool = (math.orderRound?.pool ?? []).map((entry) => ({ ...entry }))
    const rng = new CountingRng(createSeededRng('draw-short'))
    const active = pool.slice(0, 3).map((entry) => ({ id: entry.id }) as OrderCard)
    const cards = drawOrderCards(math, active, 3, rng)
    expect(cards).toHaveLength(1)
    expect(rng.calls).toBe(1)
  })

  it('가중치대로 뽑는다 (가중치 3:3:2:1 → 많은 쪽이 더 자주)', () => {
    const rng = createSeededRng('draw-weight')
    const counts: Record<string, number> = {}
    for (let i = 0; i < 9000; i += 1) {
      const [card] = drawOrderCards(math, [], 1, rng)
      if (card !== undefined) counts[card.id] = (counts[card.id] ?? 0) + 1
    }
    expect((counts['pop-a'] ?? 0) / 9000).toBeCloseTo(3 / 9, 1)
    expect((counts['chain-3'] ?? 0) / 9000).toBeCloseTo(1 / 9, 1)
  })
})

// ---- 라운드 스핀 흐름 ----

const BET = 20
const ZERO: Rng = { nextInt: () => 0 }
const STOPS = [0, 0, 0, 0]
const STRIPS = Array.from({ length: 4 }, () => ['a', 'a', 'a', 's', 's', 's'])
const PAYTABLE = { a: { 4: 0.5, 6: 1, 8: 2 } }
const POP_A: OrderCard = { id: 'pop-a', kind: 'popSymbol', symbol: 'a', target: 10, progress: 0, prize: 5 }
const BIG_6: OrderCard = { id: 'big-6', kind: 'clusterSize', target: 6, progress: 0, prize: 8 }
const CHAIN_3: OrderCard = { id: 'chain-3', kind: 'chainLength', target: 3, progress: 0, prize: 10 }

const rows = (...lines: string[]): string[][] => lines.map((line) => line.split(''))
const BLOCK_4 = rows('aaxx', 'aaxx', 'xxxx')
const ALL_A = rows('aaaa', 'aaaa', 'aaaa')

function roundMath(extra: Record<string, unknown> = {}) {
  return makeClusterMath({ strips: STRIPS, paytable: PAYTABLE, ...extra })
}

function orderOverrides(patch: Record<string, unknown>) {
  return { orderRound: { ...(makeClusterMath().orderRound as object), ...patch } }
}

function stateOf(cards: OrderCard[], patch: Partial<OrderRoundCarry> = {}, left = 8, total = 8): RoundState {
  return {
    freeSpinsLeft: left,
    freeSpinsTotal: total,
    multiplier: 1,
    carry: { orders: { cards, drawn: cards.length, completed: 0, prizeTotal: 0, ...patch } },
  }
}

function roundSpin(math: ReturnType<typeof roundMath>, grid: string[][], state: RoundState, rng: Rng = ZERO) {
  return resolveSpin(math, grid, STOPS, BET, BET, state, grid, [], rng)
}

describe('주문 카드 라운드 스핀', () => {
  it('popSymbol 진행이 스핀을 넘어 누적되고 nextState carry로 이어진다', () => {
    const math = roundMath()
    const first = roundSpin(math, BLOCK_4, stateOf([POP_A]))
    expect(first.nextState?.carry?.orders?.cards[0]?.progress).toBe(4)
    expect(first.nextState?.freeSpinsLeft).toBe(7)
    expect(first.orderWin).toBe(0)
    const second = roundSpin(math, BLOCK_4, first.nextState as RoundState)
    expect(second.nextState?.carry?.orders?.cards[0]?.progress).toBe(8)
    expect(second.nextState?.freeSpinsLeft).toBe(6)
  })

  it('완료하면 상품 즉시 지급, +2 스핀, 같은 id가 아닌 새 카드가 들어온다', () => {
    const math = roundMath()
    const result = roundSpin(math, ALL_A, stateOf([POP_A, BIG_6, CHAIN_3]))
    const done = result.features.filter((feature) => feature.type === 'orderComplete')
    // all-a 12칸: pop-a(12>=10)와 big-6(12>=6)이 완료, chain-3(연쇄 1회)은 미완료
    expect(done.map((feature) => (feature.type === 'orderComplete' ? feature.id : ''))).toEqual(['pop-a', 'big-6'])
    expect(result.orderWin).toBe(5 * BET + 8 * BET)
    expect(result.totalWin).toBe(result.lineWin + result.scatterWin + (result.orderWin ?? 0))
    const carry = result.nextState?.carry?.orders
    expect(result.nextState?.freeSpinsLeft).toBe(8 - 1 + 4)
    expect(result.nextState?.freeSpinsTotal).toBe(8 + 4)
    expect(carry?.completed).toBe(2)
    expect(carry?.drawn).toBe(5)
    expect(carry?.prizeTotal).toBe(260)
    expect(carry?.cards).toHaveLength(3)
    // 풀이 4장뿐이라 첫 칸만 완료 카드를 피할 수 있다(남은 후보 pop-b). 둘째 칸은 작은 풀 예외로 완료 카드가 다시 올 수 있다
    expect(carry?.cards[0]?.id).toBe('pop-b')
    expect(carry?.cards[2]?.id).toBe('chain-3')
    expect(new Set(carry?.cards.map((card) => card.id)).size).toBe(3)
    expect(carry?.cards.every((card) => card.progress === 0 || card.id === 'chain-3')).toBe(true)
  })

  it('chainLength는 한 스핀의 연쇄 횟수로 판정한다', () => {
    // a 클러스터 → 리필 a → 또 클러스터 … 로 3연쇄 이상을 만든다
    const chainy = roundMath({
      strips: Array.from({ length: 4 }, () => ['a', 'a', 'a', 'a', 'a', 'a', 'a', 's']),
    })
    const stops = [0, 0, 0, 0]
    const grid = buildGrid(chainy, stops)
    const result = resolveSpin(chainy, grid, stops, BET, BET, stateOf([CHAIN_3]), grid, [], ZERO)
    expect((result.cascades ?? []).length).toBeGreaterThanOrEqual(3)
    expect(result.features.some((feature) => feature.type === 'orderComplete')).toBe(true)
  })

  it('maxOrders 이후 완료는 상품만 주고 스핀은 더하지 않는다', () => {
    const math = roundMath(orderOverrides({ maxOrders: 1 }))
    const result = roundSpin(math, ALL_A, stateOf([POP_A, BIG_6, CHAIN_3], { drawn: 3 }))
    expect(result.features.filter((feature) => feature.type === 'orderComplete')).toHaveLength(2)
    expect(result.orderWin).toBe(260)
    // 첫 완료만 +2. drawn 3은 상한(maxOrders + slots - 1 = 3)이라 새 카드도 없다
    expect(result.nextState?.freeSpinsLeft).toBe(8 - 1 + 2)
    expect(result.nextState?.carry?.orders?.completed).toBe(1)
    expect(result.nextState?.carry?.orders?.cards.map((card) => card.id)).toEqual(['chain-3'])
  })

  it('마지막 스핀에서 완료가 없으면 nextState도 carry도 없다', () => {
    const math = roundMath()
    const result = roundSpin(math, BLOCK_4, stateOf([POP_A], {}, 1, 8))
    expect(result.nextState).toBeUndefined()
  })

  it('마지막 스핀에서 완료하면 +2 스핀으로 라운드가 이어진다', () => {
    const math = roundMath()
    const result = roundSpin(math, ALL_A, stateOf([BIG_6], {}, 1, 8))
    expect(result.nextState?.freeSpinsLeft).toBe(2)
  })

  it('round.maxWinCap이 클러스터, 스캐터, 상품을 합쳐 자른다', () => {
    // 상한 2 x 20 = 40. all-a 클러스터 12칸이 2 x 20 = 40이라 나머지는 전부 0
    const math = roundMath({ round: { maxWinCap: 2 } })
    const result = roundSpin(math, ALL_A, stateOf([BIG_6]))
    expect(result.lineWin).toBe(40)
    expect(result.scatterWin).toBe(0)
    expect(result.orderWin).toBe(0)
    expect(result.totalWin).toBe(40)
    const capped = result.features.find((feature) => feature.type === 'winCapped')
    expect(capped).toMatchObject({ granted: 40, cap: 40 })
    expect((capped?.type === 'winCapped' ? capped.requested : 0) > 40).toBe(true)
    // 상품은 0이어도 완료는 완료다
    expect(result.features.find((feature) => feature.type === 'orderComplete')).toMatchObject({ prize: 0 })
  })

  it('상한이 넉넉하면 상품은 상한 안에서 전액 지급된다', () => {
    const math = roundMath({ round: { maxWinCap: 150 } })
    const result = roundSpin(math, ALL_A, stateOf([BIG_6]))
    expect(result.totalWin).toBe(result.lineWin + result.scatterWin + 160)
    expect(result.features.some((feature) => feature.type === 'winCapped')).toBe(false)
  })

  it('라운드 스핀의 사다리는 매 스핀 처음부터다', () => {
    const math = roundMath()
    const result = roundSpin(math, BLOCK_4, stateOf([POP_A]))
    expect(result.cascades?.[0]?.multiplier).toBe(1)
  })

  it('라운드 안에서는 스캐터가 또 나와도 리트리거나 새 진입이 없다', () => {
    const math = roundMath()
    const result = roundSpin(math, BLOCK_4, stateOf([POP_A]))
    expect(result.features.some((feature) => feature.type === 'freeSpins' || feature.type === 'orderRound')).toBe(false)
  })
})

describe('주문 카드 라운드 종료 보증', () => {
  it('진입부터 종료까지 최장 20스핀, 완료는 maxOrders 이하, 보드 id 중복 없음 (실제 연쇄 시뮬)', () => {
    const math = makeClusterMath({ orderRound: { ...(makeClusterMath().orderRound as object), trigger: 2 } })
    const config = math.orderRound
    const maxSpins = (config?.spins ?? 0) + (config?.extraSpinsPerOrder ?? 0) * (config?.maxOrders ?? 0)
    const rng = createSeededRng('termination')
    let rounds = 0
    let longest = 0
    for (let i = 0; i < 6000; i += 1) {
      const paid = spinUnchecked(math, BET, rng)
      let state = paid.nextState
      if (state === undefined) continue
      rounds += 1
      let spins = 0
      while (state !== undefined) {
        spins += 1
        const carry = state.carry?.orders
        expect(carry).toBeDefined()
        const ids = carry?.cards.map((card) => card.id) ?? []
        expect(new Set(ids).size).toBe(ids.length)
        expect(carry?.completed ?? 0).toBeLessThanOrEqual(config?.maxOrders ?? 0)
        const result = spinUnchecked(math, BET, rng, state)
        expect(result.orderWin).toBeDefined()
        state = result.nextState
      }
      longest = Math.max(longest, spins)
      expect(spins).toBeLessThanOrEqual(maxSpins)
    }
    expect(rounds).toBeGreaterThan(20)
    expect(longest).toBeGreaterThanOrEqual(config?.spins ?? 0)
  }, 60_000)
})
