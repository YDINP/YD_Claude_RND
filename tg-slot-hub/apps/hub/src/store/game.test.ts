import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return {
    ...actual,
    getGameMath: vi.fn(),
    spin: vi.fn(),
    getMe: vi.fn(),
  }
})

import { getGameMath, spin as apiSpin, getMe, ApiClientError } from '../sdk/api'
import { useGameStore, type SpinRenderer } from './game'
import { useSessionStore } from './session'
import { useHubStore } from './hub'

const mockedGetGameMath = vi.mocked(getGameMath)
const mockedApiSpin = vi.mocked(apiSpin)
const mockedGetMe = vi.mocked(getMe)

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
      user: {
        id: 'u1',
        telegramId: 1,
        firstName: 'Dev',
        locale: 'en',
        level: 1,
        xp: 0,
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
        jackpot: 0,
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
        jackpot: 0,
      })

      await useGameStore.getState().spin()

      // totalBet을 함께 넘겨야 렌더러가 winTotal 이벤트의 등급(tier)을 라인 추정 없이 정확히 계산한다.
      expect(renderer.showWins).toHaveBeenCalledWith(wins, { totalBet: 10 })
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
        jackpot: 0,
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
          jackpot: 0,
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
        jackpot: 0,
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
        jackpot: 0,
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

    it('stores jackpotWin on lastResult when the spin response includes it', async () => {
      await loadGame()
      mockedApiSpin.mockResolvedValue({
        roundId: 'r9',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 5990, gems: 0 },
        seedHash: 'hash',
        nonce: 9,
        jackpot: 0,
        jackpotWin: 5000,
      })

      await useGameStore.getState().spin()

      expect(useGameStore.getState().lastResult?.jackpotWin).toBe(5000)
    })

    it('adds totalBet to the hub levelInfo xp on every successful spin, not only on levelUp', async () => {
      await loadGame()
      useHubStore.setState({ levelInfo: { level: 1, xp: 40, nextLevelXp: 100, maxBet: 100 } })
      mockedApiSpin.mockResolvedValue({
        roundId: 'r10',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 990, gems: 0 },
        seedHash: 'hash',
        nonce: 10,
        jackpot: 0,
        // levelUp이 없는 평범한 스핀
      })

      await useGameStore.getState().spin()

      expect(useHubStore.getState().levelInfo?.xp).toBe(50)
      expect(mockedGetMe).not.toHaveBeenCalled()
    })

    it('updates the hub jackpot pool immediately from the spin response', async () => {
      await loadGame()
      mockedApiSpin.mockResolvedValue({
        roundId: 'r6',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 990, gems: 0 },
        seedHash: 'hash',
        nonce: 6,
        jackpot: 555,
      })

      await useGameStore.getState().spin()

      expect(useHubStore.getState().jackpot).toEqual({ pool: 555 })
    })

    it('applies the missions progress from the spin response to the hub store', async () => {
      await loadGame()
      const missions = [
        { id: 'm1', name: { en: 'Spin 100 times' }, target: 100, progress: 5, reward: 50, claimed: false, completed: false },
      ]
      mockedApiSpin.mockResolvedValue({
        roundId: 'r7',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 990, gems: 0 },
        seedHash: 'hash',
        nonce: 7,
        jackpot: 0,
        missions,
      })

      await useGameStore.getState().spin()

      expect(useHubStore.getState().missions?.missions).toEqual(missions)
    })

    it('refreshes the hub levelInfo when the spin response includes a levelUp', async () => {
      await loadGame()
      mockedGetMe.mockResolvedValue({
        user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 2, xp: 120 },
        wallet: { coins: 990, gems: 0 },
        levelInfo: { level: 2, xp: 120, nextLevelXp: 300, maxBet: 50 },
        jackpot: 0,
      })
      mockedApiSpin.mockResolvedValue({
        roundId: 'r8',
        stops: [0, 0, 0],
        grid: [['seven', 'seven', 'seven']],
        wins: [],
        totalBet: 10,
        totalWin: 0,
        wallet: { coins: 990, gems: 0 },
        seedHash: 'hash',
        nonce: 8,
        jackpot: 0,
        levelUp: { from: 1, to: 2, bonus: 100 },
      })

      await useGameStore.getState().spin()
      await vi.waitFor(() => expect(useHubStore.getState().levelInfo?.level).toBe(2))

      expect(mockedGetMe).toHaveBeenCalledWith('test-token')
    })

    it('clamps the bet index to the level maxBet and sets BET_LOCKED without blocking the phase', async () => {
      await loadGame()
      useGameStore.getState().setBet(2) // bet 50
      useHubStore.setState({ levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 15 } })
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('bet locked', 400, 'BET_LOCKED'))

      await useGameStore.getState().spin()

      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.errorCode).toBe('BET_LOCKED')
      expect(state.betIndex).toBe(0) // 10 is the highest level <= maxBet(15)
      expect(state.idempotencyKey).toBeNull()
    })

    it('refreshes levelInfo before clamping when entering the game screen directly (levelInfo is null)', async () => {
      await loadGame()
      useGameStore.getState().setBet(2) // bet 50
      expect(useHubStore.getState().levelInfo).toBeNull()
      mockedGetMe.mockResolvedValue({
        user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
        wallet: { coins: 1000, gems: 0 },
        levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 15 },
        jackpot: 0,
      })
      mockedApiSpin.mockRejectedValueOnce(new ApiClientError('bet locked', 400, 'BET_LOCKED'))

      await useGameStore.getState().spin()

      expect(mockedGetMe).toHaveBeenCalledWith('test-token')
      const state = useGameStore.getState()
      expect(state.phase).toBe('idle')
      expect(state.errorCode).toBe('BET_LOCKED')
      expect(state.betIndex).toBe(0) // 10 is the highest level <= maxBet(15), fetched via refreshLevelInfo()
      expect(useHubStore.getState().levelInfo?.maxBet).toBe(15)
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
