import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getMe: vi.fn(), getGameState: vi.fn() }
})

import type { CoinCell, FeatureTrigger, SpinResponse } from '@tgslot/shared'
import { getGameMath, spin as apiSpin, getGameState } from '../sdk/api'
import { buildSpinToOptions, useGameStore, type SpinRenderer } from './game'
import { RESPIN_REPLAY_KEY_PREFIX } from '../lib/respinReplay'
import { useSessionStore } from './session'
import { miniCandyRaw } from '../test/candyMath'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetGameState = vi.mocked(getGameState)

const GAME_ID = 'candy-ish'
// 로그인 사용자(u1) id가 붙은 키다 — 계정을 바꾸면 남의 이어 보기가 재생되지 않는다.
const REPLAY_KEY = `${RESPIN_REPLAY_KEY_PREFIX}${GAME_ID}.u1`

const coin = (reel: number, row: number, amount: number): CoinCell => ({ pos: [reel, row], kind: 'bet', value: amount / 10, amount })

const coinBoard: FeatureTrigger = { type: 'coinBoard', cells: [coin(0, 0, 20), coin(1, 1, 40)] }
const coinRespin: FeatureTrigger = {
  type: 'coinRespin',
  entry: [coin(0, 0, 20), coin(1, 1, 40)],
  entryWraps: [],
  steps: [{ index: 0, grid: [['coin', 'x', 'x']], newCoins: [], wraps: [], left: 2 }],
  final: [coin(0, 0, 20), coin(1, 1, 40)],
  full: false,
  coinWin: 60,
  topWin: 0,
  win: 60,
  capped: false,
  hitHardCap: false,
}

function response(overrides: Partial<SpinResponse> = {}): SpinResponse {
  return {
    roundId: 'rr1',
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

const respinResponse = (): SpinResponse =>
  response({ features: [coinBoard, coinRespin], totalWin: 60, respinWin: 60 } as Partial<SpinResponse>)

function makeRenderer(order: string[], extra: Partial<SpinRenderer> = {}) {
  const spinTo = vi.fn().mockImplementation(async () => {
    order.push('spinTo')
  })
  const showWins = vi.fn().mockImplementation(async () => {
    order.push('showWins')
  })
  const endRespin = vi.fn().mockImplementation(async () => {
    order.push('endRespin')
  })
  const setMode = vi.fn()
  const renderer: SpinRenderer = { spinTo, showWins, setMode, endRespin, ...extra }
  return { renderer, spinTo, showWins, endRespin }
}

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
  await useGameStore.getState().load(GAME_ID)
}

describe('buildSpinToOptions — 코인 리스핀', () => {
  it('코인도 리스핀도 없으면 옵션이 없다', () => {
    expect(buildSpinToOptions(response())).toBeUndefined()
  })

  it('기본 판 코인만 있으면 coins만 넘긴다', () => {
    const options = buildSpinToOptions(response({ features: [coinBoard] }))
    expect(options).toEqual({ coins: [coin(0, 0, 20), coin(1, 1, 40)] })
  })

  it('리스핀은 서버가 정한 그대로 넘긴다', () => {
    const options = buildSpinToOptions(respinResponse())
    expect(options?.coins).toHaveLength(2)
    expect(options?.respin).toBe(coinRespin)
  })

  it('프리스핀 표식과 함께여도 리스핀 값을 잃지 않는다', () => {
    expect(buildSpinToOptions({ ...respinResponse(), isFreeSpin: true })).toMatchObject({ fast: true, respin: coinRespin })
  })
})

describe('spin — 코인 리스핀 흐름', () => {
  it('연출 전에 이어 보기 기록을 저장하고, 끝나면 지운다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer, spinTo } = makeRenderer(order)
    let recordDuringSpin: string | null = null
    spinTo.mockImplementation(async () => {
      order.push('spinTo')
      recordDuringSpin = localStorage.getItem(REPLAY_KEY)
    })
    useGameStore.getState().setRenderer(renderer)
    mockedApiSpin.mockResolvedValue(respinResponse())
    await useGameStore.getState().spin()
    expect(recordDuringSpin).not.toBeNull()
    expect(JSON.parse(recordDuringSpin ?? '{}')).toMatchObject({ roundId: 'rr1' })
    expect(localStorage.getItem(REPLAY_KEY)).toBeNull()
  })

  it('동굴 복귀(endRespin)는 연출이 끝난 뒤, 라인 당첨 연출 앞에 한 번 불린다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer, endRespin } = makeRenderer(order)
    useGameStore.getState().setRenderer(renderer)
    mockedApiSpin.mockResolvedValue(
      response({
        features: [coinBoard, coinRespin],
        wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 1, win: 10, positions: [[0, 1], [1, 1], [2, 1]] }],
        totalWin: 70,
      } as Partial<SpinResponse>),
    )
    await useGameStore.getState().spin()
    expect(endRespin).toHaveBeenCalled()
    expect(order.indexOf('spinTo')).toBeLessThan(order.indexOf('endRespin'))
    if (order.includes('showWins')) expect(order.indexOf('endRespin')).toBeLessThan(order.indexOf('showWins'))
  })

  it('리스핀이 없는 판은 기록도 복귀 호출도 없다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer, endRespin } = makeRenderer(order)
    useGameStore.getState().setRenderer(renderer)
    mockedApiSpin.mockResolvedValue(response())
    await useGameStore.getState().spin()
    expect(localStorage.getItem(REPLAY_KEY)).toBeNull()
    expect(endRespin).not.toHaveBeenCalled()
  })

  it('연출이 터져도 기록을 지우고 동굴에 남지 않게 복귀를 한 번 부른다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer, spinTo, endRespin } = makeRenderer(order)
    spinTo.mockRejectedValue(new Error('render boom'))
    useGameStore.getState().setRenderer(renderer)
    mockedApiSpin.mockResolvedValue(respinResponse())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await useGameStore.getState().spin().catch(() => undefined)
    expect(localStorage.getItem(REPLAY_KEY)).toBeNull()
    expect(endRespin).toHaveBeenCalled()
    expect(useGameStore.getState().phase).not.toBe('spinning')
  })

  it('저장소를 못 써도 스핀은 평소처럼 끝난다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer } = makeRenderer(order)
    useGameStore.getState().setRenderer(renderer)
    mockedApiSpin.mockResolvedValue(respinResponse())
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await useGameStore.getState().spin()
    setItem.mockRestore()
    expect(order).toContain('spinTo')
    expect(useGameStore.getState().phase).toBe('idle')
  })
})

describe('replayRespin — 표시 전용 재생', () => {
  it('저장된 응답을 처음부터 다시 연출하고 기록을 지운다 — 서버를 부르지 않는다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer, spinTo, endRespin } = makeRenderer(order)
    useGameStore.getState().setRenderer(renderer)
    localStorage.setItem(REPLAY_KEY, '{"stale":true}')
    const walletBefore = useSessionStore.getState().wallet
    await useGameStore.getState().replayRespin(respinResponse())
    expect(spinTo).toHaveBeenCalledWith([0, 0, 0], expect.objectContaining({ respin: coinRespin }))
    expect(endRespin).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['spinTo', 'endRespin'])
    expect(localStorage.getItem(REPLAY_KEY)).toBeNull()
    expect(mockedApiSpin).not.toHaveBeenCalled()
    expect(useSessionStore.getState().wallet).toEqual(walletBefore)
    expect(useGameStore.getState().phase).toBe('idle')
  })

  it('재생 중에는 스핀이 잠긴 상태(spinning)다', async () => {
    await loadGame()
    const phases: string[] = []
    const order: string[] = []
    const { renderer, spinTo } = makeRenderer(order)
    spinTo.mockImplementation(async () => {
      phases.push(useGameStore.getState().phase)
    })
    useGameStore.getState().setRenderer(renderer)
    await useGameStore.getState().replayRespin(respinResponse())
    expect(phases).toEqual(['spinning'])
  })

  it('렌더러가 없거나 이미 다른 일을 하는 중이면 아무것도 하지 않는다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer, spinTo } = makeRenderer(order)
    await useGameStore.getState().replayRespin(respinResponse())
    expect(spinTo).not.toHaveBeenCalled()
    useGameStore.getState().setRenderer(renderer)
    useGameStore.setState({ phase: 'spinning' })
    await useGameStore.getState().replayRespin(respinResponse())
    expect(spinTo).not.toHaveBeenCalled()
  })

  it('재생이 실패해도 평소 화면으로 돌아오고 기록은 지운다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer, spinTo } = makeRenderer(order)
    spinTo.mockRejectedValue(new Error('replay boom'))
    useGameStore.getState().setRenderer(renderer)
    localStorage.setItem(REPLAY_KEY, '{"stale":true}')
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await useGameStore.getState().replayRespin(respinResponse())
    expect(error).toHaveBeenCalled()
    expect(localStorage.getItem(REPLAY_KEY)).toBeNull()
    expect(useGameStore.getState().phase).toBe('idle')
  })

  it('endRespin이 없는 렌더러도 재생을 마친다', async () => {
    await loadGame()
    const order: string[] = []
    const { renderer } = makeRenderer(order)
    delete (renderer as { endRespin?: unknown }).endRespin
    useGameStore.getState().setRenderer(renderer)
    await useGameStore.getState().replayRespin(respinResponse())
    expect(order).toEqual(['spinTo'])
    expect(useGameStore.getState().phase).toBe('idle')
  })
})
