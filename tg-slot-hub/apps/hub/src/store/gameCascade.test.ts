import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getMe: vi.fn(), getGameState: vi.fn() }
})

import type { FeatureTrigger, FreeSpinsState, OrderCard, SpinResponse } from '@tgslot/shared'
import { getGameMath, spin as apiSpin, getGameState } from '../sdk/api'
import {
  buildSpinToOptions,
  hasCascadeSteps,
  nextOrderLog,
  orderCarryOf,
  useGameStore,
  type SpinRenderer,
} from './game'
import { withOrderPopup } from '../game/roundFlow'
import { useSessionStore } from './session'

import { miniCandyRaw } from '../test/candyMath'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetGameState = vi.mocked(getGameState)

const rawMath = {
  id: 'candy-ish',
  reels: 3,
  rows: 3,
  symbols: [
    { id: 'seven', name: { en: 'Seven' } },
    { id: 'bar', name: { en: 'Bar' } },
  ],
  strips: [
    ['seven', 'bar', 'seven'],
    ['seven', 'bar', 'seven'],
    ['seven', 'bar', 'seven'],
  ],
  paylines: [[1, 1, 1]],
  paytable: { seven: { 3: 10 }, bar: { 3: 5 } },
  betLevels: [10],
  rtpTarget: 0.96,
  volatility: 'medium',
}

const card = (id: string, progress: number): OrderCard => ({
  id,
  kind: 'popSymbol',
  symbol: 'seven',
  target: 30,
  progress,
  prize: 3,
})

function carryState(cards: OrderCard[], overrides: Partial<FreeSpinsState> = {}): FreeSpinsState {
  return {
    gameId: 'candy-ish',
    left: 7,
    total: 8,
    multiplier: 1,
    totalBet: 10,
    accumulatedWin: 0,
    carry: { orders: { cards, drawn: cards.length, completed: 0, prizeTotal: 0 } },
    ...overrides,
  }
}

const cascadeStep = { index: 0, wins: [], removed: [[0, 0]] as [number, number][], refill: [['bar']], multiplier: 1, stepWin: 0 }

function response(overrides: Partial<SpinResponse> = {}): SpinResponse {
  return {
    roundId: 'r0',
    stops: [0, 0, 0],
    grid: [['seven', 'seven', 'seven']],
    wins: [],
    totalBet: 10,
    totalWin: 0,
    wallet: { coins: 990, gems: 0 },
    seedHash: 'hash',
    nonce: 0,
    jackpot: 0,
    isFreeSpin: false,
    features: [],
    freeSpins: null,
    mutations: [],
    ...overrides,
  }
}

function makeRenderer() {
  const spinTo = vi.fn().mockResolvedValue(undefined)
  const showWins = vi.fn().mockResolvedValue(undefined)
  const setMode = vi.fn()
  const renderer: SpinRenderer = { spinTo, showWins, setMode }
  return { ...renderer, spinTo, showWins, setMode }
}

describe('cascade helpers', () => {
  it('buildSpinToOptions adds cascades and finalGrid, and stays undefined for a plain spin', () => {
    expect(buildSpinToOptions(response())).toBeUndefined()
    const res = response({ cascades: [cascadeStep], finalGrid: [['bar', 'bar', 'bar']] })
    expect(buildSpinToOptions(res)).toEqual({ cascades: [cascadeStep], finalGrid: [['bar', 'bar', 'bar']] })
    expect(buildSpinToOptions({ ...res, isFreeSpin: true })).toMatchObject({ fast: true, cascades: [cascadeStep] })
    expect(hasCascadeSteps(response({ cascades: [] }))).toBe(false)
  })

  it('orderCarryOf reads only the server carry', () => {
    expect(orderCarryOf(null)).toBeNull()
    expect(orderCarryOf(carryState([card('a', 3)]))?.cards[0]?.progress).toBe(3)
  })

  it('nextOrderLog starts over on round entry and appends completions', () => {
    const done: FeatureTrigger = { type: 'orderComplete', id: 'a', prize: 30 }
    const entry: FeatureTrigger = { type: 'orderRound', cards: [card('a', 0)] }
    const first = nextOrderLog([], { features: [done] }, null)
    expect(first.map((o) => o.id)).toEqual(['a'])
    expect(nextOrderLog(first, { features: [done] }, null)).toHaveLength(2)
    expect(nextOrderLog(first, { features: [entry] }, null)).toEqual([])
  })

  it('withOrderPopup adds the order list to the exit popup and the flag to the entry popup', () => {
    const items = [{ id: 'a', kind: 'popSymbol' as const, target: 30, prize: 30 }]
    const exit = withOrderPopup(
      { popup: { kind: 'freeSpinsExit', totalWin: 500 }, to: 'base' },
      { features: [], freeSpinsSummary: { spins: 8, total: 500, ordersCompleted: 1, orderPrizeTotal: 120 } as never },
      items,
      true,
    )
    expect(exit.popup).toMatchObject({ kind: 'freeSpinsExit', totalWin: 500, orders: { items, prizeTotal: 120, completed: 1 } })
    // 새로고침으로 화면 기록이 비어도 서버가 센 장수는 남는다.
    const reloaded = withOrderPopup(
      { popup: { kind: 'freeSpinsExit', totalWin: 438 }, to: 'base' },
      { features: [], freeSpinsSummary: { spins: 14, total: 438, ordersCompleted: 3, orderPrizeTotal: 202 } as never },
      [],
      true,
    )
    expect(reloaded.popup).toMatchObject({ orders: { items: [], prizeTotal: 202, completed: 3 } })
    const entry = withOrderPopup({ popup: { kind: 'freeSpinsEntry', spins: 8, multiplier: 1 }, to: 'freeSpins' }, { features: [] }, [], true)
    expect(entry.popup).toMatchObject({ order: true })
    const plain = { popup: { kind: 'freeSpinsExit' as const, totalWin: 5 }, to: 'base' as const }
    expect(withOrderPopup(plain, { features: [] }, [], false)).toBe(plain)
  })
})

describe('orderRound in the store (server values only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGameStore.getState().reset()
    mockedGetGameState.mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
  })

  async function loadGame(): Promise<void> {
    mockedGetGameMath.mockResolvedValue(miniCandyRaw)
    await useGameStore.getState().load('candy-ish')
  }

  it('resumes the cards from GET /state', async () => {
    mockedGetGameState.mockResolvedValue({
      freeSpins: carryState([card('a', 12)]),
      state: { freeSpins: carryState([card('a', 12)]), gamble: null },
    } as never)
    await loadGame()
    expect(useGameStore.getState().orderRound?.cards[0]?.progress).toBe(12)
  })

  it('hands cascades and finalGrid to the renderer and presents wins in cascade mode', async () => {
    await loadGame()
    const renderer = makeRenderer()
    useGameStore.getState().setRenderer(renderer)
    mockedApiSpin.mockResolvedValue(response({ cascades: [cascadeStep], finalGrid: [['bar', 'bar', 'bar']], totalWin: 5, wins: [] }))
    await useGameStore.getState().spin()
    expect(renderer.spinTo).toHaveBeenCalledWith(
      [0, 0, 0],
      expect.objectContaining({ cascades: [cascadeStep], finalGrid: [['bar', 'bar', 'bar']] }),
    )
  })

  it('overwrites orderRound from the spin response, logs completions, and clears it when the round ends', async () => {
    vi.useFakeTimers()
    await loadGame()
    useGameStore.setState({ freeSpins: carryState([card('a', 29)]), orderRound: carryState([card('a', 29)]).carry!.orders! })

    mockedApiSpin.mockResolvedValueOnce(
      response({
        roundId: 'r2',
        isFreeSpin: true,
        freeSpins: carryState([card('b', 0)], { left: 6 }),
        features: [{ type: 'orderComplete', id: 'a', prize: 30 }],
      }),
    )
    await useGameStore.getState().spin()
    expect(useGameStore.getState().orderRound?.cards[0]?.id).toBe('b')
    expect(useGameStore.getState().orderCompleted.map((o) => o.id)).toEqual(['a'])

    useGameStore.getState().reset()
    expect(useGameStore.getState().orderRound).toBeNull()
    expect(useGameStore.getState().orderCompleted).toEqual([])
    vi.useRealTimers()
  })

  it('clears orderRound on the spin that ends the round and puts the order list in the exit popup', async () => {
    vi.useFakeTimers()
    await loadGame()
    useGameStore.setState({ freeSpins: carryState([card('a', 3)], { left: 1 }), orderRound: carryState([card('a', 3)]).carry!.orders! })
    mockedApiSpin.mockResolvedValueOnce(
      response({
        roundId: 'r9',
        isFreeSpin: true,
        freeSpins: null,
        features: [{ type: 'orderComplete', id: 'a', prize: 30 }],
        freeSpinsSummary: { spins: 8, total: 90, ordersCompleted: 1, orderPrizeTotal: 30 } as never,
      }),
    )
    await useGameStore.getState().spin()
    expect(useGameStore.getState().orderRound).toBeNull()
    const flow = useGameStore.getState().roundFlow
    expect(flow.kind).toBe('popup')
    if (flow.kind === 'popup' && flow.popup.kind === 'freeSpinsExit') {
      expect(flow.popup.orders?.items.map((o) => o.id)).toEqual(['a'])
      expect(flow.popup.orders?.prizeTotal).toBe(30)
    }
    useGameStore.getState().reset()
    vi.useRealTimers()
  })
})
