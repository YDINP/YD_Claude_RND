import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return {
    ...actual,
    getGameMath: vi.fn(),
    spin: vi.fn(),
  }
})

import { getGameMath, spin as apiSpin, ApiClientError } from '../sdk/api'
import { useGameStore, type SpinRenderer } from './game'
import { useSessionStore } from './session'

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

function makeRenderer(): SpinRenderer & { spinTo: ReturnType<typeof vi.fn>; showWins: ReturnType<typeof vi.fn> } {
  return {
    spinTo: vi.fn().mockResolvedValue(undefined),
    showWins: vi.fn().mockResolvedValue(undefined),
  }
}

describe('game store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useGameStore.getState().reset()
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: {
        id: 'u1',
        telegramId: 1,
        firstName: 'Dev',
        locale: 'en',
        level: 1,
      },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
  })

  describe('load', () => {
    it('parses math.json and sets phase to idle', async () => {
      mockedGetGameMath.mockResolvedValue(rawMath)

      await useGameStore.getState().load('classic-777')

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.math?.id).toBe('classic-777')
      expect(state.betIndex).toBe(0)
    })

    it('sets phase to error when math.json fails to load', async () => {
      mockedGetGameMath.mockRejectedValue(new ApiClientError('not found', 404, 'GAME_NOT_FOUND'))

      await useGameStore.getState().load('missing-game')

      const state = useGameStore.getState()
      expect(state.phase).toBe('error')
      expect(state.errorCode).toBe('GAME_NOT_FOUND')
    })
  })

  describe('spin', () => {
    async function loadGame(): Promise<void> {
      mockedGetGameMath.mockResolvedValue(rawMath)
      await useGameStore.getState().load('classic-777')
    }

    it('passes stops through to the renderer and overwrites wallet with the server value', async () => {
      await loadGame()
      const renderer = makeRenderer()
      useGameStore.getState().setRenderer(renderer)

      mockedApiSpin.mockResolvedValue({
        roundId: 'r1',
        stops: [1, 2, 0],
        grid: [['seven', 'bar', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 990, gems: 0 },
        seedHash: 'hash',
        nonce: 1,
      })

      await useGameStore.getState().spin()

      expect(renderer.spinTo).toHaveBeenCalledWith([1, 2, 0])
      expect(useSessionStore.getState().wallet).toEqual({ coins: 990, gems: 0 })
      expect(useGameStore.getState().phase).toBe('idle')
      expect(useGameStore.getState().lastResult?.roundId).toBe('r1')
    })

    it('calls showWins on the renderer when the result has wins', async () => {
      await loadGame()
      const renderer = makeRenderer()
      useGameStore.getState().setRenderer(renderer)

      const wins = [
        { line: 0, symbol: 'seven', count: 3, multiplier: 10, win: 100, positions: [[0, 1], [1, 1], [2, 1]] as [number, number][] },
      ]
      mockedApiSpin.mockResolvedValue({
        roundId: 'r2',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins,
        totalBet: 10,
        totalWin: 100,
        wallet: { coins: 1090, gems: 0 },
        seedHash: 'hash',
        nonce: 2,
      })

      await useGameStore.getState().spin()

      expect(renderer.showWins).toHaveBeenCalledWith(wins)
    })

    it('applies the server wallet immediately even if renderer.spinTo throws, and still returns phase to idle', async () => {
      await loadGame()
      const renderer = makeRenderer()
      renderer.spinTo.mockRejectedValue(new Error('renderer boom'))
      useGameStore.getState().setRenderer(renderer)
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockedApiSpin.mockResolvedValue({
        roundId: 'r4',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 990, gems: 0 },
        seedHash: 'hash',
        nonce: 4,
      })

      await useGameStore.getState().spin()

      expect(useSessionStore.getState().wallet).toEqual({ coins: 990, gems: 0 })
      expect(useGameStore.getState().phase).toBe('idle')
      consoleErrorSpy.mockRestore()
    })

    it('clears the previous lastResult (win banner) as soon as a new spin starts', async () => {
      await loadGame()
      useGameStore.setState({
        lastResult: {
          roundId: 'prev',
          stops: [0, 0, 0],
          grid: [['seven', 'seven', 'seven']],
          wins: [
            {
              line: 0,
              symbol: 'seven',
              count: 3,
              multiplier: 10,
              win: 100,
              positions: [[0, 1]] as [number, number][],
            },
          ],
          totalBet: 10,
          totalWin: 100,
          wallet: { coins: 1090, gems: 0 },
          seedHash: 'hash',
          nonce: 1,
        },
      })

      let resolveSpin: (value: Awaited<ReturnType<typeof apiSpin>>) => void = () => {}
      mockedApiSpin.mockReturnValue(
        new Promise((resolve) => {
          resolveSpin = resolve
        }),
      )

      const spinPromise = useGameStore.getState().spin()

      expect(useGameStore.getState().lastResult).toBeNull()

      resolveSpin({
        roundId: 'r5',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 990, gems: 0 },
        seedHash: 'hash',
        nonce: 5,
      })
      await spinPromise
    })

    it('reuses the same idempotencyKey after a 409 SPIN_IN_PROGRESS failure and returns to idle', async () => {
      await loadGame()
      mockedApiSpin.mockRejectedValueOnce(
        new ApiClientError('spin in progress', 409, 'SPIN_IN_PROGRESS'),
      )

      await useGameStore.getState().spin()

      const afterFailure = useGameStore.getState()
      expect(afterFailure.phase).toBe('idle')
      expect(afterFailure.errorCode).toBe('SPIN_IN_PROGRESS')
      const reusedKey = afterFailure.idempotencyKey
      expect(reusedKey).not.toBeNull()

      mockedApiSpin.mockResolvedValueOnce({
        roundId: 'r3',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 990, gems: 0 },
        seedHash: 'hash',
        nonce: 3,
      })

      await useGameStore.getState().spin()

      expect(mockedApiSpin).toHaveBeenLastCalledWith(
        'test-token',
        'classic-777',
        expect.objectContaining({ idempotencyKey: reusedKey }),
      )
    })

    it('retains the idempotencyKey after a network error (status 0)', async () => {
      await loadGame()
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('offline', 0, 'network_error'))

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.idempotencyKey).not.toBeNull()
    })

    it('drops the idempotencyKey on a definitive 4xx failure so the next attempt uses a new key', async () => {
      await loadGame()
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('invalid bet', 400, 'INVALID_BET'))

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.errorCode).toBe('INVALID_BET')
      expect(state.idempotencyKey).toBeNull()
    })

    it('sets phase to error with INSUFFICIENT_FUNDS code without retrying the idempotencyKey', async () => {
      await loadGame()
      mockedApiSpin.mockRejectedValue(
        new ApiClientError('not enough coins', 402, 'INSUFFICIENT_FUNDS'),
      )

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('error')
      expect(state.errorCode).toBe('INSUFFICIENT_FUNDS')
      expect(state.idempotencyKey).toBeNull()
    })

    it('does nothing when a spin is already in flight', async () => {
      await loadGame()
      useGameStore.setState({ phase: 'spinning' })

      await useGameStore.getState().spin()

      expect(mockedApiSpin).not.toHaveBeenCalled()
    })
  })

  describe('dismissError', () => {
    it('returns to idle and clears the error', () => {
      useGameStore.setState({ phase: 'error', error: 'oops', errorCode: 'INSUFFICIENT_FUNDS' })

      useGameStore.getState().dismissError()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.error).toBeNull()
      expect(state.errorCode).toBeNull()
    })
  })
})
