import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpinResponse } from '@tgslot/shared'

// GameScreen이 createSlotRenderer(...)에 넘긴 onEvent를 테스트에서 직접 호출할 수 있도록 캡처해둔다.
const mockRenderer = vi.hoisted(() => ({
  onEvent: null as ((e: { type: string; [key: string]: unknown }) => void) | null,
}))

vi.mock('@tgslot/renderer', () => ({
  createSlotRenderer: vi.fn((options: { onEvent?: (e: { type: string }) => void }) => {
    mockRenderer.onEvent = options.onEvent ?? null
    return {
      ready: Promise.resolve(),
      spinTo: vi.fn().mockResolvedValue(undefined),
      showWins: vi.fn().mockResolvedValue(undefined),
      clearWins: vi.fn(),
      setSpinningIdle: vi.fn(),
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
  }
})

import { getGameMath, spin as apiSpin } from '../../sdk/api'
import { useGameStore } from '../../store/game'
import { useSessionStore } from '../../store/session'
import { useGamesStore } from '../../store/games'
import { useHubStore } from '../../store/hub'
import { GameScreen } from './GameScreen'

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

function baseSpinResponse(overrides: Partial<SpinResponse> = {}): SpinResponse {
  return {
    roundId: 'r1',
    stops: [0, 0, 0],
    grid: [['seven', 'seven', 'seven']],
    wins: [],
    totalBet: 10,
    totalWin: 0,
    wallet: { coins: 990, gems: 0 },
    seedHash: 'hash',
    nonce: 1,
    jackpot: 0,
    ...overrides,
  }
}

describe('GameScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRenderer.onEvent = null
    useGameStore.getState().reset()
    useGamesStore.setState({ status: 'ready', games: [], errorMessage: null })
    useHubStore.setState({
      status: 'idle',
      errorMessage: null,
      bonusStatus: null,
      jackpot: null,
      missions: null,
      leaderboard: null,
      levelInfo: null,
      claimingBonus: null,
      claimingMissionId: null,
      bonusClaimError: null,
    })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
    mockedGetGameMath.mockResolvedValue(rawMath)
  })

  afterEach(() => {
    useGameStore.getState().reset()
  })

  it('loads the game and renders the bet selector with a Spin button', async () => {
    render(<GameScreen gameId="classic-777" />)

    await screen.findByText('10')
    expect(screen.getByRole('button', { name: 'Spin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spin' })).not.toBeDisabled()
  })

  it('disables the Spin button while a spin is in flight and re-enables it after', async () => {
    render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')

    let resolveSpin: (value: SpinResponse) => void = () => {}
    mockedApiSpin.mockReturnValue(
      new Promise((resolve) => {
        resolveSpin = resolve
      }),
    )

    const spinButton = screen.getByRole('button', { name: 'Spin' })

    await act(async () => {
      spinButton.click()
    })

    expect(spinButton).toBeDisabled()

    await act(async () => {
      resolveSpin(baseSpinResponse())
    })

    await waitFor(() => expect(spinButton).not.toBeDisabled())
  })

  it('opens the help sheet with the paytable and payline grids when the help button is clicked', async () => {
    render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')

    const helpButton = screen.getByRole('button', { name: 'Help' })
    expect(helpButton).not.toBeDisabled()
    helpButton.click()

    expect(await screen.findByText('Paytable')).toBeInTheDocument()
    expect(screen.getByText('Paylines')).toBeInTheDocument()
    expect(screen.getByText('Bet per line: 10')).toBeInTheDocument()
    expect(screen.getByText('3: ×10')).toBeInTheDocument()
    expect(screen.getByText('3: ×5')).toBeInTheDocument()
  })

  it('shows a wild note in the help sheet when the game has a wild symbol', async () => {
    mockedGetGameMath.mockResolvedValue({
      ...rawMath,
      symbols: [...rawMath.symbols, { id: 'wild', name: { en: 'Wild' }, wild: true }],
      wild: { substitutesFor: 'all' },
    })

    render(<GameScreen gameId="classic-777" />)
    await screen.findByText('10')

    screen.getByRole('button', { name: 'Help' }).click()

    expect(await screen.findByText('Wild substitutes for all symbols')).toBeInTheDocument()
  })

  describe('win banner (winTotal renderer event)', () => {
    async function spinAndSettle(response: SpinResponse): Promise<void> {
      mockedApiSpin.mockResolvedValueOnce(response)
      await act(async () => {
        screen.getByRole('button', { name: 'Spin' }).click()
      })
      await waitFor(() => expect(screen.getByRole('button', { name: 'Spin' })).not.toBeDisabled())
    }

    it('rolls the counter up to the total and shows the tier label the renderer sent', async () => {
      render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 250,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 25, win: 250, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      expect(mockRenderer.onEvent).not.toBeNull()

      // tier는 허브가 계산하지 않고 렌더러가 보내주는 값을 그대로 라벨로 옮긴다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 250, tier: 'big', durationMs: 30 })
      })

      expect(await screen.findByText('BIG WIN')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByText('250')).toBeInTheDocument())
    })

    it('jumps the counter to the final value immediately when the stage is tapped', async () => {
      const { container } = render(<GameScreen gameId="classic-777" />)
      await screen.findByText('10')

      await spinAndSettle(
        baseSpinResponse({
          totalBet: 10,
          totalWin: 50,
          wins: [{ line: 0, symbol: 'seven', count: 3, multiplier: 5, win: 50, positions: [[0, 1], [1, 1], [2, 1]] }],
        }),
      )

      // 아주 긴 durationMs — 탭하지 않으면 짧은 시간 안에 목표값에 도달할 수 없다.
      act(() => {
        mockRenderer.onEvent?.({ type: 'winTotal', totalWin: 50, tier: 'none', durationMs: 60_000 })
      })
      expect(await screen.findByText('WIN')).toBeInTheDocument()
      expect(screen.queryByText('50')).not.toBeInTheDocument()

      const stage = container.querySelector('.hub-game-screen__stage')
      expect(stage).not.toBeNull()
      if (stage) fireEvent.click(stage)

      await waitFor(() => expect(screen.getByText('50')).toBeInTheDocument())
    })
  })
})
