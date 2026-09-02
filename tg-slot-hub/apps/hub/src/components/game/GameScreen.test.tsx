import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpinResponse } from '@tgslot/shared'

vi.mock('@tgslot/renderer', () => ({
  createSlotRenderer: vi.fn(() => ({
    ready: Promise.resolve(),
    spinTo: vi.fn().mockResolvedValue(undefined),
    showWins: vi.fn().mockResolvedValue(undefined),
    clearWins: vi.fn(),
    setSpinningIdle: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
  })),
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
    ...overrides,
  }
}

describe('GameScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGameStore.getState().reset()
    useGamesStore.setState({ status: 'ready', games: [], errorMessage: null })
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1 },
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
})
