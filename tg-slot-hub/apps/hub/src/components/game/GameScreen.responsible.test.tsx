import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRenderer = vi.hoisted(() => ({
  onEvent: null as ((e: { type: string; [key: string]: unknown }) => void) | null,
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
  return { ...actual, getGameMath: vi.fn(), spin: vi.fn(), getGameState: vi.fn(), getRoundSeed: vi.fn() }
})

import { getGameMath, getGameState, spin as apiSpin } from '../../sdk/api'
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
  gamble: { type: 'coin-flip' as const, chance: 0.5, payout: 2, maxSteps: 3 },
}


describe('GameScreen 책임 설계 — 오토스핀 시트·더블업 패널', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockRenderer.onEvent = null
    useGameStore.getState().reset()
    useSettingsStore.setState({ spinSpeed: 'normal', locale: 'en' })
    useGamesStore.setState({ status: 'ready', games: [], errorMessage: null })
    useHubStore.setState({ status: 'ready', levelInfo: null, missions: null, missionNotices: [] })
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
    vi.mocked(apiSpin).mockReturnValue(new Promise(() => {}))
  })

  afterEach(() => {
    useGameStore.getState().stopAutoSpin()
    useGameStore.getState().reset()
  })

  async function openSheet(): Promise<HTMLElement> {
    render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')
    const btn = document.querySelector('.hub-game-screen__auto-btn')
    if (!(btn instanceof HTMLButtonElement)) throw new Error('auto button not found')
    await act(async () => {
      btn.click()
    })
    const sheet = document.querySelector('.hub-modal')
    if (!(sheet instanceof HTMLElement)) throw new Error('sheet not found')
    return sheet
  }

  it('시트는 고르고 [시작] — 기본값은 25회·손실 한도 50%·큰 당첨 멈춤 꺼짐, 시작 전에는 무장하지 않는다', async () => {
    const sheet = await openSheet()

    expect(within(sheet).getByRole('button', { name: '25 spins' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('button', { name: '50%' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(sheet).getByRole('button', { name: 'No limit' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Unlimited' })).toBeInTheDocument()
    expect(within(sheet).getByRole('switch', { name: 'Stop on a big win' })).toHaveAttribute('aria-checked', 'false')
    expect(sheet).toHaveTextContent('Stops after losing 500 coins')

    expect(useGameStore.getState().autoSpin).toBeNull()
    expect(vi.mocked(apiSpin)).not.toHaveBeenCalled()

    await act(async () => {
      within(sheet).getByRole('button', { name: 'Start autospin' }).click()
    })
    expect(useGameStore.getState().autoSpin).toMatchObject({
      remaining: 25,
      startCoins: 1000,
      lossLimit: 0.5,
      stopOnBigWin: false,
    })
    expect(vi.mocked(apiSpin)).toHaveBeenCalledTimes(1)
  })

  it('고른 한도·토글은 기억되어 다음에 시트를 열면 그대로다', async () => {
    const sheet = await openSheet()
    await act(async () => {
      within(sheet).getByRole('button', { name: '25%' }).click()
      within(sheet).getByRole('switch', { name: 'Stop on a big win' }).click()
      within(sheet).getByRole('button', { name: '10 spins' }).click()
    })
    expect(sheet).toHaveTextContent('Stops after losing 250 coins')
    await act(async () => {
      within(sheet).getByRole('button', { name: 'Start autospin' }).click()
    })
    expect(useGameStore.getState().autoSpin).toMatchObject({ remaining: 10, lossLimit: 0.25, stopOnBigWin: true })
    expect(JSON.parse(localStorage.getItem('tgslot.autospin.v1') ?? 'null')).toEqual({
      count: 10,
      lossLimit: 0.25,
      stopOnBigWin: true,
    })
  })

  it('더블업 패널 — 받기가 첫 번째 주 버튼이고 남은 시간 카운트다운이 없다', async () => {
    vi.mocked(getGameState).mockResolvedValue({
      freeSpins: null,
      state: {
        freeSpins: null,
        gamble: {
          roundId: 'r1',
          pendingWin: 50,
          steps: [],
          maxSteps: 3,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      },
    })
    render(<GameScreen gameId="classic-777" />)

    const collect = await screen.findByRole('button', { name: 'Collect' })
    const double = screen.getByRole('button', { name: 'Double (50%)' })
    expect(collect).toHaveClass('hub-win-strip__gamble-btn--collect')
    expect(double).toHaveClass('hub-win-strip__gamble-btn--double')
    // DOM 순서 — 받기가 왼쪽(앞)이다.
    expect(collect.compareDocumentPosition(double) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('.hub-win-strip__gamble-countdown')).toBeNull()
    expect(screen.queryByText(/Expires in|expires/i)).toBeNull()
    expect(document.querySelector('.hub-win-strip__label')).toHaveTextContent('COLLECT OR DOUBLE UP')
  })
})
