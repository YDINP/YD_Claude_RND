/**
 * 오토스핀 책임 규칙 — 손실 한도 / 큰 당첨 멈춤 / 프리스핀 자동진행 유지 / 멈춘 이유 값.
 * 판정 자체는 lib/autoSpinRules의 순수 함수이고, 여기서는 store가 그 규칙을 제 자리(다음 유료 판 직전,
 * 판이 끝난 직후)에서 집행하는지 본다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getMe: vi.fn(), getGameState: vi.fn() }
})

import type { SpinResponse, FreeSpinsState } from '@tgslot/shared'
import { getGameMath, spin as apiSpin, getGameState } from '../sdk/api'
import { useGameStore, type SpinRenderer } from './game'
import { useSessionStore } from './session'
import { useHubStore } from './hub'
import {
  AUTO_SPIN_PREFS_KEY,
  DEFAULT_AUTO_SPIN_PREFS,
  exceedsLossLimit,
  lossLimitAmount,
  readAutoSpinPrefs,
  writeAutoSpinPrefs,
} from '../lib/autoSpinRules'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetGameState = vi.mocked(getGameState)

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

function spinResponse(overrides: Partial<SpinResponse> = {}): SpinResponse {
  return {
    roundId: 'r0',
    stops: [0, 0, 0],
    grid: [['seven', 'seven', 'seven']],
    wins: [],
    totalBet: 20,
    totalWin: 0,
    wallet: { coins: 9980, gems: 0 },
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

function freeSpinsState(overrides: Partial<FreeSpinsState> = {}): FreeSpinsState {
  return { gameId: 'classic-777', left: 3, total: 10, multiplier: 2, totalBet: 20, accumulatedWin: 0, ...overrides }
}

function makeRenderer(): SpinRenderer {
  return { spinTo: vi.fn().mockResolvedValue(undefined), showWins: vi.fn().mockResolvedValue(undefined), setMode: vi.fn() }
}

/** 클래식 777을 불러 베팅 20(인덱스 1)에 맞춘다. 지갑은 10,000. */
async function loadGame(): Promise<void> {
  mockedGetGameMath.mockResolvedValue(rawMath)
  await useGameStore.getState().load('classic-777')
  useGameStore.getState().setBet(1)
  useGameStore.getState().setRenderer(makeRenderer())
}

describe('autoSpinRules (pure)', () => {
  it('손실 한도 금액은 시작 잔액 × 비율의 내림이다', () => {
    expect(lossLimitAmount(10_000, 0.5)).toBe(5_000)
    expect(lossLimitAmount(10_000, 0.25)).toBe(2_500)
    expect(lossLimitAmount(999, 0.25)).toBe(249)
    expect(lossLimitAmount(10_000, null)).toBeNull()
  })

  it('시작 10,000·50%·베팅 20 — 손실 4,990에서 다음 판이 막히고 4,980까지는 간다', () => {
    const base = { startCoins: 10_000, nextBet: 20, lossLimit: 0.5 }
    expect(exceedsLossLimit({ ...base, net: -4_980 })).toBe(false)
    expect(exceedsLossLimit({ ...base, net: -4_990 })).toBe(true)
  })

  it('제한 없음이면 얼마를 잃어도 막지 않는다', () => {
    expect(exceedsLossLimit({ startCoins: 10_000, net: -9_960, nextBet: 20, lossLimit: null })).toBe(false)
  })

  it('이긴 만큼 여유가 생긴다', () => {
    expect(exceedsLossLimit({ startCoins: 10_000, net: 2_000, nextBet: 20, lossLimit: 0.25 })).toBe(false)
  })

  it('선택값 기억 — 기본값, 저장·복원(무제한 포함), 깨진 값은 기본값', () => {
    localStorage.clear()
    expect(readAutoSpinPrefs()).toEqual(DEFAULT_AUTO_SPIN_PREFS)
    expect(DEFAULT_AUTO_SPIN_PREFS).toEqual({ count: 25, lossLimit: 0.5, stopOnBigWin: false })
    writeAutoSpinPrefs({ count: Infinity, lossLimit: null, stopOnBigWin: true })
    expect(readAutoSpinPrefs()).toEqual({ count: Infinity, lossLimit: null, stopOnBigWin: true })
    localStorage.setItem(AUTO_SPIN_PREFS_KEY, '{bad')
    expect(readAutoSpinPrefs()).toEqual(DEFAULT_AUTO_SPIN_PREFS)
    localStorage.setItem(AUTO_SPIN_PREFS_KEY, JSON.stringify({ count: 7, lossLimit: 0.9, stopOnBigWin: 'x' }))
    expect(readAutoSpinPrefs()).toEqual(DEFAULT_AUTO_SPIN_PREFS)
  })
})

describe('game store — autospin 책임 규칙', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGameStore.getState().reset()
    mockedGetGameState.mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
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

  it('손실 한도 — 손실 4,990이 된 판 뒤에는 다음 판을 걸지 않고 이유를 남긴다', async () => {
    await loadGame()
    vi.useFakeTimers()
    try {
      mockedApiSpin.mockResolvedValue(spinResponse({ totalBet: 4_990, wallet: { coins: 5_010, gems: 0 } }))
      useGameStore.getState().startAutoSpin(10, { lossLimit: 0.5 })
      await vi.advanceTimersByTimeAsync(3_000)
      expect(mockedApiSpin).toHaveBeenCalledTimes(1)
      expect(useGameStore.getState().autoSpin).toBeNull()
      expect(useGameStore.getState().autoSpinNotice).toMatchObject({ reason: 'lossLimit', limitAmount: 5_000 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('손실 한도 — 한도 안(손실 4,980)이면 계속 돈다', async () => {
    await loadGame()
    vi.useFakeTimers()
    try {
      mockedApiSpin.mockResolvedValueOnce(spinResponse({ totalBet: 4_980, wallet: { coins: 5_020, gems: 0 } }))
      mockedApiSpin.mockResolvedValue(spinResponse({ totalBet: 0, wallet: { coins: 5_020, gems: 0 } }))
      useGameStore.getState().startAutoSpin(10, { lossLimit: 0.5 })
      await vi.advanceTimersByTimeAsync(1_500)
      expect(mockedApiSpin.mock.calls.length).toBeGreaterThan(1)
      expect(useGameStore.getState().autoSpinNotice).toBeNull()
    } finally {
      useGameStore.getState().stopAutoSpin()
      vi.useRealTimers()
    }
  })

  it('제한 없음이면 잔액이 베팅만큼 남아 있는 한 계속 돈다', async () => {
    await loadGame()
    vi.useFakeTimers()
    try {
      mockedApiSpin.mockResolvedValue(spinResponse({ wallet: { coins: 100, gems: 0 } }))
      useGameStore.getState().startAutoSpin(10, { lossLimit: null })
      await vi.advanceTimersByTimeAsync(1_500)
      expect(mockedApiSpin.mock.calls.length).toBeGreaterThan(1)
      expect(useGameStore.getState().autoSpinNotice).toBeNull()
    } finally {
      useGameStore.getState().stopAutoSpin()
      vi.useRealTimers()
    }
  })

  it('손실 한도는 게임 손익으로 잰다 — 지갑이 보너스로 늘어도 손실은 줄지 않는다', async () => {
    await loadGame()
    vi.useFakeTimers()
    try {
      // 베팅 4,990을 잃었는데 레벨업 보너스 등으로 지갑은 9,000. 지갑 차이(1,000)가 아니라 손익(−4,990)으로 멈춘다.
      mockedApiSpin.mockResolvedValue(spinResponse({ totalBet: 4_990, wallet: { coins: 9_000, gems: 0 } }))
      useGameStore.getState().startAutoSpin(10, { lossLimit: 0.5 })
      await vi.advanceTimersByTimeAsync(3_000)
      expect(mockedApiSpin).toHaveBeenCalledTimes(1)
      expect(useGameStore.getState().autoSpinNotice).toMatchObject({ reason: 'lossLimit' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('첫 판부터 한도를 넘는 베팅이면 시작하지 않고 이유를 알린다', async () => {
    await loadGame()
    useSessionStore.setState({ wallet: { coins: 60, gems: 0 } })
    useGameStore.getState().startAutoSpin(10, { lossLimit: 0.25 })
    expect(mockedApiSpin).not.toHaveBeenCalled()
    expect(useGameStore.getState().autoSpin).toBeNull()
    expect(useGameStore.getState().autoSpinNotice).toMatchObject({ reason: 'lossLimitStart', limitAmount: 15 })
  })

  it('큰 당첨 멈춤(유료 판) — 베팅의 10배 이상이면 그 판 뒤에 멈춘다', async () => {
    await loadGame()
    vi.useFakeTimers()
    try {
      mockedApiSpin.mockResolvedValue(spinResponse({ totalWin: 200, wallet: { coins: 10_180, gems: 0 } }))
      useGameStore.getState().startAutoSpin(10, { stopOnBigWin: true })
      await vi.advanceTimersByTimeAsync(0)
      useGameStore.getState().dismissWinCelebration()
      await vi.advanceTimersByTimeAsync(3_000)
      expect(mockedApiSpin).toHaveBeenCalledTimes(1)
      expect(useGameStore.getState().autoSpin).toBeNull()
      expect(useGameStore.getState().autoSpinNotice?.reason).toBe('bigWin')
    } finally {
      vi.useRealTimers()
    }
  })

  it('큰 당첨 멈춤을 끄면(기본) 큰 당첨 뒤에도 계속 돈다', async () => {
    await loadGame()
    vi.useFakeTimers()
    try {
      mockedApiSpin.mockResolvedValue(spinResponse({ totalWin: 200, wallet: { coins: 10_180, gems: 0 } }))
      useGameStore.getState().startAutoSpin(10)
      await vi.advanceTimersByTimeAsync(0)
      useGameStore.getState().dismissWinCelebration()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(useGameStore.getState().autoSpin).not.toBeNull()
      expect(useGameStore.getState().autoSpinNotice).toBeNull()
    } finally {
      useGameStore.getState().stopAutoSpin()
      vi.useRealTimers()
    }
  })

  it('큰 당첨 멈춤(프리스핀 판) — 오토스핀은 꺼지고 프리스핀 자동진행은 끊기지 않는다', async () => {
    await loadGame()
    useGameStore.setState({ freeSpins: freeSpinsState({ left: 3 }) })
    vi.useFakeTimers()
    try {
      mockedApiSpin
        .mockResolvedValueOnce(
          spinResponse({
            roundId: 'fs-big',
            isFreeSpin: true,
            totalWin: 400,
            wallet: { coins: 10_400, gems: 0 },
            freeSpins: freeSpinsState({ left: 2 }),
          }),
        )
        .mockResolvedValue(
          spinResponse({ roundId: 'fs-next', isFreeSpin: true, freeSpins: freeSpinsState({ left: 1 }) }),
        )
      useGameStore.setState({ autoSpin: { remaining: 10, startCoins: 10_000, net: 0, lossLimit: 0.5, stopOnBigWin: true } })
      void useGameStore.getState().spin()
      await vi.advanceTimersByTimeAsync(0)
      useGameStore.getState().dismissWinCelebration()
      await vi.advanceTimersByTimeAsync(0)
      expect(useGameStore.getState().autoSpin).toBeNull()
      expect(useGameStore.getState().autoSpinNotice?.reason).toBe('bigWin')
      // 프리스핀 자동진행(1.2초 뒤)은 그대로 다음 판을 건다.
      await vi.advanceTimersByTimeAsync(1_400)
      expect(mockedApiSpin).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('프리스핀 중에는 손실 한도를 넘어도 자동진행을 끊지 않는다(한도는 다음 유료 판 직전에만 본다)', async () => {
    await loadGame()
    useGameStore.setState({ freeSpins: freeSpinsState({ left: 3 }) })
    vi.useFakeTimers()
    try {
      mockedApiSpin.mockResolvedValue(
        spinResponse({ isFreeSpin: true, wallet: { coins: 100, gems: 0 }, freeSpins: freeSpinsState({ left: 2 }) }),
      )
      useGameStore.setState({ autoSpin: { remaining: 10, startCoins: 10_000, net: 0, lossLimit: 0.25, stopOnBigWin: false } })
      void useGameStore.getState().spin()
      await vi.advanceTimersByTimeAsync(0)
      expect(useGameStore.getState().autoSpinNotice).toBeNull()
      await vi.advanceTimersByTimeAsync(1_400)
      expect(mockedApiSpin).toHaveBeenCalledTimes(2)
    } finally {
      useGameStore.getState().stopAutoSpin()
      vi.useRealTimers()
    }
  })

  it('멈춘 이유 값 — 휴식 안내·직접 중지·알림 닫기', async () => {
    await loadGame()
    useGameStore.setState({ autoSpin: { remaining: 5, startCoins: 10_000, net: 0, lossLimit: 0.5, stopOnBigWin: false } })
    useGameStore.getState().stopAutoSpin('breakReminder')
    expect(useGameStore.getState().autoSpin).toBeNull()
    expect(useGameStore.getState().autoSpinNotice).toMatchObject({ reason: 'breakReminder', limitAmount: 5_000 })

    useGameStore.getState().dismissAutoSpinNotice()
    expect(useGameStore.getState().autoSpinNotice).toBeNull()

    useGameStore.setState({ autoSpin: { remaining: 5, startCoins: 10_000, net: 0, lossLimit: null, stopOnBigWin: false } })
    useGameStore.getState().stopAutoSpin()
    expect(useGameStore.getState().autoSpinNotice).toBeNull()
  })
})
