import { describe, expect, it } from 'vitest'
import {
  CascadeStepSchema,
  FeatureTriggerSchema,
  FreeSpinsStateSchema,
  SpinDebugPresetSchema,
  SpinResponseSchema,
  WinLineSchema,
} from './schemas.js'

describe('WinLineSchema', () => {
  it('ways 당첨(line: -1, ways 포함)을 파싱한다', () => {
    const result = WinLineSchema.safeParse({
      line: -1,
      symbol: 'charm',
      count: 5,
      multiplier: 13,
      win: 52,
      positions: [
        [0, 0],
        [1, 1],
      ],
      ways: 4,
      direction: 'ltr',
    })
    expect(result.success).toBe(true)
  })

  it('line: -1인데 ways가 없으면 거부한다', () => {
    const result = WinLineSchema.safeParse({
      line: -1,
      symbol: 'charm',
      count: 5,
      multiplier: 13,
      win: 52,
      positions: [[0, 0]],
    })
    expect(result.success).toBe(false)
  })

  it('line: 0인데 ways가 있으면 거부한다', () => {
    const result = WinLineSchema.safeParse({
      line: 0,
      symbol: 'charm',
      count: 5,
      multiplier: 13,
      win: 52,
      positions: [[0, 0]],
      ways: 4,
    })
    expect(result.success).toBe(false)
  })

  it('일반 페이라인 당첨(line >= 0, ways 없음)은 그대로 통과한다', () => {
    const result = WinLineSchema.safeParse({
      line: 0,
      symbol: 'charm',
      count: 3,
      multiplier: 5,
      win: 15,
      positions: [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('WinLineSchema payKind', () => {
  it('payKind가 없던 라인 당첨은 line으로 채운다', () => {
    const parsed = WinLineSchema.parse({ line: 2, symbol: 'a', count: 3, multiplier: 5, win: 15, positions: [[0, 2]] })
    expect(parsed.payKind).toBe('line')
  })

  it('payKind가 없던 ways 당첨은 ways로 채운다', () => {
    const parsed = WinLineSchema.parse({ line: -1, symbol: 'a', count: 3, multiplier: 5, win: 15, positions: [], ways: 2 })
    expect(parsed.payKind).toBe('ways')
  })

  it('클러스터 당첨은 line -1에 ways 없이 통과하고 cascade·ladder를 싣는다', () => {
    const parsed = WinLineSchema.parse({
      line: -1,
      payKind: 'cluster',
      symbol: 'heart',
      count: 7,
      multiplier: 1.5,
      win: 300,
      positions: [[0, 0]],
      cascade: 1,
      ladder: 2,
    })
    expect(parsed).toMatchObject({ payKind: 'cluster', cascade: 1, ladder: 2 })
  })

  it('payKind와 line·ways가 어긋나면 거부한다', () => {
    const base = { symbol: 'a', count: 5, multiplier: 1, win: 1, positions: [] }
    expect(WinLineSchema.safeParse({ ...base, line: 0, payKind: 'cluster' }).success).toBe(false)
    expect(WinLineSchema.safeParse({ ...base, line: -1, payKind: 'line' }).success).toBe(false)
    expect(WinLineSchema.safeParse({ ...base, line: -1, payKind: 'cluster', ways: 3 }).success).toBe(false)
    expect(WinLineSchema.safeParse({ ...base, line: -1, payKind: 'ways' }).success).toBe(false)
  })
})

describe('레거시 라운드 파싱', () => {
  it('shiba-shrine ways 프리스핀 라운드(payKind·carry 없음)가 그대로 파싱된다', () => {
    const legacy = {
      roundId: 'r1',
      stops: [3, 10, 22, 7, 41],
      grid: [
        ['charm', 'fox', 'wild', 'coin', 'scatter'],
        ['fox', 'charm', 'charm', 'bell', 'coin'],
        ['bell', 'coin', 'fox', 'charm', 'fox'],
      ],
      gridBefore: [
        ['charm', 'fox', 'wild', 'coin', 'scatter'],
        ['fox', 'charm', 'charm', 'bell', 'coin'],
        ['bell', 'coin', 'fox', 'charm', 'fox'],
      ],
      mutations: [],
      wins: [
        {
          line: -1,
          symbol: 'charm',
          count: 3,
          multiplier: 4,
          win: 32,
          positions: [
            [0, 0],
            [1, 1],
            [2, 1],
          ],
          ways: 2,
          direction: 'ltr',
        },
      ],
      totalBet: 100,
      totalWin: 32,
      wallet: { coins: 1000, gems: 0 },
      seedHash: 'ab'.repeat(32),
      nonce: 4,
      jackpot: 5000,
      isFreeSpin: true,
      features: [{ type: 'scatterWin', symbol: 'scatter', count: 1, win: 0, positions: [[4, 0]] }],
      freeSpins: { gameId: 'shiba-shrine', left: 5, total: 10, multiplier: 2, totalBet: 100, accumulatedWin: 320 },
    }
    const parsed = SpinResponseSchema.parse(legacy)
    expect(parsed.wins[0]?.payKind).toBe('ways')
    expect(parsed.freeSpins?.carry).toBeUndefined()
    expect(parsed.cascades).toBeUndefined()
    expect(parsed.finalGrid).toBeUndefined()
    expect(parsed.orderWin).toBeUndefined()
  })
})

describe('연쇄·주문 카드 스키마', () => {
  const card = { id: 'pop-red', kind: 'popSymbol', symbol: 'drop_red', target: 30, progress: 12, prize: 5 }

  it('CascadeStep을 파싱한다', () => {
    const step = CascadeStepSchema.parse({
      index: 0,
      wins: [{ line: -1, payKind: 'cluster', symbol: 'heart', count: 5, multiplier: 1, win: 100, positions: [] }],
      removed: [[0, 0]],
      refill: [['star'], [], [], [], [], []],
      multiplier: 1,
      stepWin: 100,
    })
    expect(step.refill[0]).toEqual(['star'])
  })

  it('FreeSpinsState.carry에 주문 진행을 싣는다', () => {
    const state = FreeSpinsStateSchema.parse({
      gameId: 'candy-cluster-pop',
      left: 7,
      total: 8,
      multiplier: 1,
      totalBet: 100,
      accumulatedWin: 0,
      carry: { orders: { cards: [card], drawn: 3, completed: 0, prizeTotal: 0 } },
    })
    expect(state.carry?.orders?.cards[0]?.progress).toBe(12)
  })

  it('새 피처 3종을 파싱한다', () => {
    expect(FeatureTriggerSchema.parse({ type: 'orderRound', cards: [card] }).type).toBe('orderRound')
    expect(FeatureTriggerSchema.parse({ type: 'orderComplete', id: 'pop-red', prize: 500 }).type).toBe('orderComplete')
    expect(FeatureTriggerSchema.parse({ type: 'winCapped', requested: 600000, granted: 500000, cap: 500000 }).type).toBe(
      'winCapped',
    )
  })

  it('SpinResponse에 cascades·finalGrid·orderWin·주문 요약을 싣는다', () => {
    const parsed = SpinResponseSchema.parse({
      roundId: 'r2',
      stops: [0, 0, 0, 0, 0, 0],
      grid: [['a']],
      cascades: [],
      finalGrid: [['a']],
      orderWin: 500,
      wins: [],
      totalBet: 100,
      totalWin: 500,
      wallet: { coins: 0, gems: 0 },
      seedHash: 'x',
      nonce: 1,
      jackpot: 0,
      freeSpinsSummary: { total: 900, spins: 10, ordersCompleted: 1, orderPrizeTotal: 500 },
    })
    expect(parsed.freeSpinsSummary?.ordersCompleted).toBe(1)
  })

  it('디버그 프리셋 3종이 계약에 있다', () => {
    for (const preset of ['cascade3', 'orderRound', 'orderComplete']) {
      expect(SpinDebugPresetSchema.safeParse(preset).success).toBe(true)
    }
  })
})

describe('코인 리스핀 스키마', () => {
  const symbols = ['crab', 'jellyfish', 'starfish', 'shell']
  const cell = (reel: number, row: number, value = 10, amount = 10000) => ({ pos: [reel, row], kind: 'bet', value, amount })

  /** 구조상 최악: 진입 6칸 → 리스핀 30회(3회마다 1칸) → 15칸, 다섯 줄 감기, 최대 베팅 1000에 큰 금액. */
  function worstFeature(): Record<string, unknown> {
    const order: [number, number][] = []
    for (let reel = 0; reel < 5; reel += 1) for (let row = 0; row < 3; row += 1) order.push([reel, row])
    const entry = order.slice(0, 6).map(([reel, row]) => cell(reel, row))
    const steps = []
    let filled = 6
    for (let index = 0; index < 30; index += 1) {
      const grid = [0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4].map((reel) => (reel * 3 + row < filled ? 'coin' : (symbols[(reel + row + index) % 4] ?? 'crab'))),
      )
      const lands = index % 3 === 2 && filled < 15
      const at = order[filled]
      const newCoins = lands && at ? [{ ...cell(at[0], at[1]), kind: 'treasure', tier: 'large', value: 200, amount: 200000 }] : []
      if (lands) filled += 1
      const wraps =
        lands && filled % 3 === 0 ? [{ reel: filled / 3 - 1, before: [10000, 10000, 10000], after: [20000, 20000, 20000] }] : []
      steps.push({ index, grid, newCoins, wraps, left: lands ? 3 : 2 - (index % 3) })
    }
    return {
      type: 'coinRespin',
      entry,
      entryWraps: [{ reel: 0, before: [10000, 10000, 10000], after: [20000, 20000, 20000] }],
      steps,
      final: order.map(([reel, row]) => cell(reel, row, 20, 20000)),
      full: true,
      coinWin: 1240000,
      topWin: 1000000,
      win: 2000000,
      capped: true,
      hitHardCap: false,
    }
  }

  it('coinBoard·coinRespin 피처를 파싱한다', () => {
    expect(FeatureTriggerSchema.safeParse({ type: 'coinBoard', cells: [cell(0, 1, 2, 200)] }).success).toBe(true)
    const parsed = FeatureTriggerSchema.safeParse(worstFeature())
    expect(parsed.success).toBe(true)
  })

  it('보물 단계 오타·음수 금액은 거부한다', () => {
    expect(FeatureTriggerSchema.safeParse({ type: 'coinBoard', cells: [{ ...cell(0, 0), tier: 'huge' }] }).success).toBe(false)
    expect(FeatureTriggerSchema.safeParse({ type: 'coinBoard', cells: [{ ...cell(0, 0), amount: -1 }] }).success).toBe(false)
  })

  it('최악 리스핀 피처(coinBoard + coinRespin)가 12KB 안에 든다', () => {
    const board = { type: 'coinBoard', cells: (worstFeature()['entry'] as unknown[]) }
    const bytes = new TextEncoder().encode(JSON.stringify([board, worstFeature()])).length
    expect(bytes).toBeLessThan(12_000)
  })

  it('respinWin과 코인 리스핀 디버그 프리셋', () => {
    for (const preset of ['coinRespin', 'columnWrap', 'treasure', 'coinRespinFull']) {
      expect(SpinDebugPresetSchema.safeParse(preset).success).toBe(true)
    }
    expect(SpinResponseSchema.shape.respinWin.safeParse(6900).success).toBe(true)
    expect(SpinResponseSchema.shape.respinWin.safeParse(-1).success).toBe(false)
  })
})
