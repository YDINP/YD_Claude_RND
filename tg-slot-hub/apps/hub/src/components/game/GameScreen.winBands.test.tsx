/**
 * 당첨 연출 배수 단계(under/small/good/great) — GameScreen이 렌더러 `winTotal.band`를 받아
 * 소리·당첨 패널 라벨·금액 표시를 바꾸는 부분. 큰 `GameScreen.test.tsx`에 섞지 않고 따로 둔다.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpinResponse } from '@tgslot/shared'

const mockRenderer = vi.hoisted(() => ({
  onEvent: null as ((e: { type: string; [key: string]: unknown }) => void) | null,
}))

const audioSpies = vi.hoisted(() => ({
  playWin: vi.fn(),
  playWinBand: vi.fn(),
  playRollupTick: vi.fn(),
  playRollupEnd: vi.fn(),
}))

vi.mock('../../lib/audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/audio')>()),
  ...audioSpies,
}))

vi.mock('@tgslot/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tgslot/renderer')>()),
  createSlotRenderer: vi.fn((options: { onEvent?: (e: { type: string }) => void }) => {
    mockRenderer.onEvent = options.onEvent ?? null
    return {
      ready: Promise.resolve(),
      spinTo: vi.fn().mockResolvedValue(undefined),
      showWins: vi.fn().mockResolvedValue(undefined),
      skipWins: vi.fn(),
      clearWins: vi.fn(),
      setSpinSpeed: vi.fn(),
      setSpinningIdle: vi.fn(),
      setMode: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
    }
  }),
  loadTheme: vi.fn().mockResolvedValue({
    symbols: {},
    palette: { frame: '#000000', reelBg: '#000000', winLine: ['#ffffff'], text: '#ffffff' },
  }),
}))

vi.mock('../../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../../sdk/api')>('../../sdk/api')
  return {
    ...actual,
    getGameMath: vi.fn(),
    spin: vi.fn(),
    getGameState: vi.fn(),
    // 게임 진입(load)이 레벨 정보가 없으면 /me를 받는다. 실제 요청이 나가면 테스트 토큰이 거절돼 세션이 지워진다.
    getMe: vi.fn(),
    getRoundSeed: vi.fn(),
    gamble: vi.fn(),
    collectGamble: vi.fn(),
  }
})

import { getGameMath, spin as apiSpin, getGameState } from '../../sdk/api'
import { useGameStore } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useGamesStore } from '../../store/games'
import { useHubStore } from '../../store/hub'
import { useSettingsStore } from '../../store/settings'
import { GameScreen } from './GameScreen'

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

function spinResponse(totalBet: number, totalWin: number): SpinResponse {
  return {
    roundId: `r-${totalWin}`,
    stops: [0, 0, 0],
    grid: [['seven', 'seven', 'seven']],
    wins:
      totalWin > 0
        ? [
            {
              line: 0,
              symbol: 'seven',
              count: 3,
              multiplier: totalWin / totalBet,
              win: totalWin,
              positions: [
                [0, 1],
                [1, 1],
                [2, 1],
              ],
            },
          ]
        : [],
    totalBet,
    totalWin,
    wallet: { coins: 990, gems: 0 },
    seedHash: 'hash',
    nonce: 1,
    jackpot: 0,
    isFreeSpin: false,
    features: [],
    freeSpins: null,
    mutations: [],
  }
}

function getSpinButton(): HTMLButtonElement {
  const btn = document.querySelector('.hub-game-screen__spin')
  if (!(btn instanceof HTMLButtonElement)) throw new Error('spin button not found')
  return btn
}

async function spinAndSettle(response: SpinResponse): Promise<void> {
  vi.mocked(apiSpin).mockResolvedValueOnce(response)
  await act(async () => {
    getSpinButton().click()
  })
  await waitFor(() => expect(getSpinButton()).not.toBeDisabled())
}

describe('GameScreen 당첨 단계(winTotal.band)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockRenderer.onEvent = null
    useGameStore.getState().reset()
    useSettingsStore.setState({ spinSpeed: 'normal', locale: 'en', reducedMotion: false })
    useGamesStore.setState({ status: 'ready', games: [], errorMessage: null })
    useHubStore.setState({
      status: 'idle',
      errorMessage: null,
      bonusStatus: null,
      jackpot: null,
      missions: null,
      leaderboard: null,
      levelInfo: null,
    })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
    vi.mocked(getGameMath).mockResolvedValue(rawMath)
    vi.mocked(getGameState).mockResolvedValue({ freeSpins: null, state: { freeSpins: null, gamble: null } })
  })

  afterEach(() => {
    useGameStore.getState().reset()
  })

  it('under: 금액을 굴리지 않고 곧장 보이고, 소리·틱이 없고, 라벨이 «Less than bet»이다', async () => {
    const { container } = render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')
    await spinAndSettle(spinResponse(20, 5))

    act(() => {
      mockRenderer.onEvent?.({ type: 'winCycle', cycle: 0, totalWin: 5 })
      mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 5, tier: 'none', band: 'under', durationMs: 0 })
    })

    expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('5')
    expect(container.querySelector('.hub-win-strip__label')).toHaveTextContent('Less than bet')
    expect(container.querySelector('.hub-win-strip')).toHaveClass('hub-win-strip--band-under')
    expect(audioSpies.playWin).not.toHaveBeenCalled()
    expect(audioSpies.playWinBand).not.toHaveBeenCalled()
    expect(audioSpies.playRollupEnd).not.toHaveBeenCalled()
  })

  it('good: 라벨이 «Nice win ×2.8»(내림 표기)이고 playWinBand로 소리를 낸다', async () => {
    const { container } = render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')
    await spinAndSettle(spinResponse(25, 70))

    act(() => {
      mockRenderer.onEvent?.({ type: 'winCycle', cycle: 0, totalWin: 70 })
      mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 70, tier: 'none', band: 'good', durationMs: 20 })
    })

    expect(container.querySelector('.hub-win-strip__label')).toHaveTextContent('Nice win ×2.8')
    expect(audioSpies.playWinBand).toHaveBeenCalledWith('good', 20)
    expect(audioSpies.playWin).not.toHaveBeenCalled()
    await waitFor(() => expect(container.querySelector('.hub-win-strip__amount')).toHaveTextContent('70'))
  })

  it('great: 라벨이 «Great win ×6.5»다', async () => {
    const { container } = render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')
    await spinAndSettle(spinResponse(20, 130))

    act(() => {
      mockRenderer.onEvent?.({ type: 'winCycle', cycle: 0, totalWin: 130 })
      mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 130, tier: 'none', band: 'great', durationMs: 20 })
    })

    expect(container.querySelector('.hub-win-strip__label')).toHaveTextContent('Great win ×6.5')
    expect(audioSpies.playWinBand).toHaveBeenCalledWith('great', 20)
  })

  it('small: 기존 라벨(WIN)과 기존 작은 당첨음(playWin none)을 그대로 쓴다', async () => {
    const { container } = render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')
    await spinAndSettle(spinResponse(20, 30))

    act(() => {
      mockRenderer.onEvent?.({ type: 'winCycle', cycle: 0, totalWin: 30 })
      mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 30, tier: 'none', band: 'small', durationMs: 20 })
    })

    expect(container.querySelector('.hub-win-strip__label')).toHaveTextContent('WIN')
    expect(audioSpies.playWin).toHaveBeenCalledWith('none', 20)
    expect(audioSpies.playWinBand).not.toHaveBeenCalled()
  })

  it('big(10배 이상): 큰 당첨 소리는 빅윈 오버레이가 이미 냈다 — winTotal 롤업은 작은 당첨 소리만, 단계 라벨은 없다', async () => {
    const { container } = render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')
    await spinAndSettle(spinResponse(10, 250))

    act(() => {
      mockRenderer.onEvent?.({ type: 'winCycle', cycle: 0, totalWin: 250 })
      mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 250, tier: 'big', band: 'big', durationMs: 20 })
    })

    expect(container.querySelector('.hub-win-strip__label')).toHaveTextContent('WIN')
    // 오버레이가 굴리기 시작할 때 큰 당첨(첫 단계) 소리를 냈고, 뒤따르는 winTotal은 겹치지 않게 작은 소리다.
    expect(audioSpies.playWin).toHaveBeenCalledWith('big', expect.any(Number))
    expect(audioSpies.playWin).toHaveBeenLastCalledWith('none', 20)
    expect(audioSpies.playWinBand).not.toHaveBeenCalled()
  })

  it('새 스핀이 시작되면 단계 라벨과 클래스가 초기화된다', async () => {
    const { container } = render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')
    await spinAndSettle(spinResponse(25, 70))
    act(() => {
      mockRenderer.onEvent?.({ type: 'winCycle', cycle: 0, totalWin: 70 })
      mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 70, tier: 'none', band: 'good', durationMs: 20 })
    })
    expect(container.querySelector('.hub-win-strip')).toHaveClass('hub-win-strip--band-good')

    await spinAndSettle(spinResponse(10, 0))
    expect(container.querySelector('.hub-win-strip')).not.toHaveClass('hub-win-strip--band-good')
    // 꽝 판에는 «WIN» 글자를 띄우지 않는다(흐린 0만).
    expect(container.querySelector('.hub-win-strip__label')).not.toHaveTextContent('WIN')
  })
})
