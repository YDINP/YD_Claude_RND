/**
 * 기본 베팅 — 진입 시 «사용자가 고른 금액»이 있으면 존중하고, 없거나 쓸 수 없으면 잔액 0.2~0.5% 규칙.
 * 순수 규칙 표는 lib/defaultBet.test.ts가 10종 math.json으로 고정한다. 여기서는 store 연결(저장 형식·보정)을 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getMe: vi.fn(), getGameState: vi.fn() }
})

import { getGameMath, spin as apiSpin, getGameState, ApiClientError } from '../sdk/api'
import { useGameStore } from './game'
import { useSessionStore } from './session'
import { useHubStore } from './hub'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)

const rawMath = {
  id: 'classic-777',
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
  betLevels: [10, 20, 50],
  rtpTarget: 0.96,
  volatility: 'medium',
}

const KEY = 'tgslot.bet.classic-777'

function setCoins(coins: number): void {
  useSessionStore.setState({ wallet: { coins, gems: 0 } })
}

async function enter(): Promise<number> {
  mockedGetGameMath.mockResolvedValue(rawMath)
  await useGameStore.getState().load('classic-777')
  return useGameStore.getState().betIndex
}

describe('game store — 기본 베팅', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGameStore.getState().reset()
    vi.mocked(getGameState).mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
    useHubStore.setState({ levelInfo: null })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 10_000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
  })

  it('저장이 없으면 규칙 값(10,000의 0.3% 근처 → 20)', async () => {
    expect(await enter()).toBe(1)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('잔액이 작으면 허용된 단계 중 가장 작은 쪽으로 내려간다', async () => {
    setCoins(1_000)
    expect(await enter()).toBe(0)
  })

  it('v2 저장(금액)은 사용자가 고른 것으로 존중한다', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, bet: 50 }))
    expect(await enter()).toBe(2)
  })

  it('옛 숫자 인덱스 저장도 사용자 선택으로 존중한다', async () => {
    localStorage.setItem(KEY, '2')
    expect(await enter()).toBe(2)
  })

  it('저장 금액이 잔액보다 크면 규칙 값을 쓰되 저장은 지우지 않는다(회복되면 다시 쓴다)', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, bet: 50 }))
    setCoins(40)
    expect(await enter()).toBe(0)
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ v: 2, bet: 50 })

    useGameStore.getState().reset()
    setCoins(10_000)
    expect(await enter()).toBe(2)
  })

  it('저장 금액이 레벨 상한(maxBet)보다 크면 규칙 값을 쓴다', async () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 2, bet: 50 }))
    useHubStore.setState({ levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 20 } })
    expect(await enter()).toBe(1)
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ v: 2, bet: 50 })
  })

  it('깨진 저장 값은 무시하고 규칙 값을 쓴다', async () => {
    localStorage.setItem(KEY, '{broken')
    expect(await enter()).toBe(1)
  })

  it('−/+(setBet)로 바꿀 때만 금액 형식으로 저장한다', async () => {
    await enter()
    expect(localStorage.getItem(KEY)).toBeNull()
    useGameStore.getState().setBet(2)
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ v: 2, bet: 50 })
  })

  it('BET_LOCKED 보정은 저장하지 않는다(사용자가 고른 값 그대로 남는다)', async () => {
    await enter()
    useGameStore.getState().setBet(2)
    useHubStore.setState({ levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 15 } })
    mockedApiSpin.mockRejectedValueOnce(new ApiClientError('bet locked', 400, 'BET_LOCKED'))

    await useGameStore.getState().spin()

    expect(useGameStore.getState().betIndex).toBe(0)
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({ v: 2, bet: 50 })
  })

  it('BET_LOCKED 보정만 일어났다면 저장 자체가 생기지 않는다', async () => {
    // 규칙 값이 레벨 상한보다 큰 드문 경우(상한 정보가 늦게 온 경우)를 흉내낸다.
    await enter()
    useGameStore.setState({ betIndex: 2 })
    useHubStore.setState({ levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 15 } })
    mockedApiSpin.mockRejectedValueOnce(new ApiClientError('bet locked', 400, 'BET_LOCKED'))

    await useGameStore.getState().spin()

    expect(useGameStore.getState().betIndex).toBe(0)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(mockedApiSpin).toHaveBeenCalledTimes(1)
  })
})
