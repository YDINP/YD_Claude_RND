/**
 * 피처 구매 — store 연결. 요청에 buyFeature가 원샷으로 실리는지, 막힌 상태에서 요청을 보내지 않는지,
 * 서버 거절(FEATURE_BUY_*)이 화면을 막지 않는지 본다. 비용·이유 계산은 lib/featureBuy.test.ts가 고정한다.
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

const mockedApiSpin = vi.mocked(apiSpin)

const rawMath = {
  id: 'fruit-test',
  reels: 3,
  rows: 3,
  symbols: [
    { id: 'seven', name: { en: 'Seven' } },
    { id: 'bar', name: { en: 'Bar' } },
    { id: 'scatter', name: { en: 'Scatter' }, scatter: true },
  ],
  strips: [
    ['seven', 'bar', 'scatter'],
    ['seven', 'bar', 'scatter'],
    ['seven', 'bar', 'scatter'],
  ],
  paylines: [[1, 1, 1]],
  paytable: { seven: { 3: 10 }, bar: { 3: 5 } },
  scatter: { symbol: 'scatter', pays: { 3: 2 }, freeSpins: { trigger: 3, count: 5, multiplier: 1, retrigger: false } },
  betLevels: [10, 20, 50],
  rtpTarget: 0.96,
  volatility: 'medium',
  featureBuy: { price: 40, trigger: 'freeSpins' },
}

async function enter(): Promise<void> {
  vi.mocked(getGameMath).mockResolvedValue(rawMath)
  await useGameStore.getState().load('fruit-test')
}

describe('game store — 피처 구매', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGameStore.getState().reset()
    vi.mocked(getGameState).mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
    useHubStore.setState({ levelInfo: null })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'ko', level: 1, xp: 0 },
      wallet: { coins: 10_000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
  })

  it('buyFeature()는 이번 요청에만 buyFeature: true를 싣는다(원샷)', async () => {
    await enter()
    mockedApiSpin.mockRejectedValueOnce(new ApiClientError('blocked', 409, 'FEATURE_BUY_BLOCKED'))
    await useGameStore.getState().buyFeature()
    expect(mockedApiSpin).toHaveBeenCalledTimes(1)
    expect(mockedApiSpin.mock.calls[0]?.[2]).toMatchObject({ totalBet: 20, buyFeature: true })
    expect(useGameStore.getState().featureBuyArmed).toBe(false)

    mockedApiSpin.mockRejectedValueOnce(new ApiClientError('blocked', 409, 'FEATURE_BUY_BLOCKED'))
    await useGameStore.getState().spin()
    expect(mockedApiSpin.mock.calls[1]?.[2]).not.toHaveProperty('buyFeature')
  })

  it('서버 거절(FEATURE_BUY_*)은 화면을 막지 않고 안내 코드만 남긴다', async () => {
    await enter()
    mockedApiSpin.mockRejectedValueOnce(new ApiClientError('no', 503, 'FEATURE_BUY_SEARCH_FAILED'))
    await useGameStore.getState().buyFeature()
    expect(useGameStore.getState().phase).toBe('idle')
    expect(useGameStore.getState().errorCode).toBe('FEATURE_BUY_SEARCH_FAILED')
    expect(useGameStore.getState().idempotencyKey).toBeNull()
  })

  it('프리스핀·오토스핀 중이면 요청을 보내지 않는다', async () => {
    await enter()
    useGameStore.setState({
      freeSpins: { gameId: 'fruit-test', left: 3, total: 5, multiplier: 1, totalBet: 20, totalWin: 0, expiresAt: new Date(Date.now() + 60_000).toISOString() },
    } as never)
    await useGameStore.getState().buyFeature()
    useGameStore.setState({ freeSpins: null, autoSpin: { remaining: 5 } as never })
    await useGameStore.getState().buyFeature()
    expect(mockedApiSpin).not.toHaveBeenCalled()
    expect(useGameStore.getState().featureBuyArmed).toBe(false)
  })

  it('featureBuy가 없는 팩이면 아무 일도 하지 않는다', async () => {
    const { featureBuy: _drop, ...plain } = rawMath
    vi.mocked(getGameMath).mockResolvedValue(plain)
    await useGameStore.getState().load('fruit-test')
    await useGameStore.getState().buyFeature()
    expect(mockedApiSpin).not.toHaveBeenCalled()
  })
})
