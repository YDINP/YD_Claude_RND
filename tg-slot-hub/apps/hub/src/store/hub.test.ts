import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../sdk/api', async () => {
  const actual = await vi.importActual<typeof import('../sdk/api')>('../sdk/api')
  return {
    ...actual,
    getMe: vi.fn(),
    getBonusStatus: vi.fn(),
    claimDailyBonus: vi.fn(),
    claimTimedBonus: vi.fn(),
    claimRescueBonus: vi.fn(),
    getJackpot: vi.fn(),
    getLeaderboard: vi.fn(),
    getMissions: vi.fn(),
    claimMission: vi.fn(),
  }
})

import {
  getMe,
  getBonusStatus,
  claimDailyBonus,
  claimTimedBonus,
  claimRescueBonus,
  getJackpot,
  getLeaderboard,
  getMissions,
  claimMission as apiClaimMission,
  ApiClientError,
} from '../sdk/api'
import { useHubStore } from './hub'
import { useSessionStore } from './session'

const mockedGetMe = vi.mocked(getMe)
const mockedGetBonusStatus = vi.mocked(getBonusStatus)
const mockedClaimDaily = vi.mocked(claimDailyBonus)
const mockedClaimTimed = vi.mocked(claimTimedBonus)
const mockedClaimRescue = vi.mocked(claimRescueBonus)
const mockedGetJackpot = vi.mocked(getJackpot)
const mockedGetLeaderboard = vi.mocked(getLeaderboard)
const mockedGetMissions = vi.mocked(getMissions)
const mockedClaimMission = vi.mocked(apiClaimMission)

function resetHubStore(): void {
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
}

describe('hub store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetHubStore()
    useHubStore.getState().stopJackpotPolling()
    useSessionStore.setState({
      status: 'ready',
      token: 'test-token',
      user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
      wallet: { coins: 1000, gems: 0 },
      errorMessage: null,
      refreshError: null,
    })
  })

  afterEach(() => {
    useHubStore.getState().stopJackpotPolling()
    vi.useRealTimers()
  })

  describe('loadAll', () => {
    it('loads bonus/jackpot/missions/leaderboard/level in one call', async () => {
      mockedGetMe.mockResolvedValue({
        user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
        wallet: { coins: 1000, gems: 0 },
        levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 100 },
        jackpot: 0,
      })
      mockedGetBonusStatus.mockResolvedValue({
        daily: { claimable: true, streakDay: 1, nextAmount: 100, nextAvailableAt: null },
        timed: { claimable: false, amount: 50, nextAvailableAt: '2026-09-02T12:00:00.000Z' },
        rescue: { claimable: false, amount: 200 },
      })
      mockedGetJackpot.mockResolvedValue({ pool: 1000 })
      mockedGetMissions.mockResolvedValue({ day: '2026-09-02', missions: [] })
      mockedGetLeaderboard.mockResolvedValue({
        week: '2026-W36',
        entries: [],
        me: null,
        endsAt: '2026-09-07T00:00:00.000Z',
      })

      await useHubStore.getState().loadAll()

      const state = useHubStore.getState()
      expect(state.status).toBe('ready')
      expect(state.jackpot).toEqual({ pool: 1000 })
      expect(state.levelInfo).toEqual({ level: 1, xp: 0, nextLevelXp: 100, maxBet: 100 })
      expect(state.bonusStatus?.daily.claimable).toBe(true)
      expect(state.missions?.day).toBe('2026-09-02')
      expect(state.leaderboard?.week).toBe('2026-W36')
    })
  })

  describe('claim flows', () => {
    it('claimDaily() overwrites the session wallet from the response and refreshes bonus status', async () => {
      mockedClaimDaily.mockResolvedValue({ amount: 100, wallet: { coins: 1100, gems: 0 }, streakDay: 2 })
      mockedGetBonusStatus.mockResolvedValue({
        daily: { claimable: false, streakDay: 2, nextAmount: 150, nextAvailableAt: '2026-09-03T00:00:00.000Z' },
        timed: { claimable: false, amount: 50, nextAvailableAt: null },
        rescue: { claimable: false, amount: 200 },
      })

      const result = await useHubStore.getState().claimDaily()

      expect(result?.amount).toBe(100)
      expect(useSessionStore.getState().wallet).toEqual({ coins: 1100, gems: 0 })
      expect(useHubStore.getState().bonusStatus?.daily.claimable).toBe(false)
      expect(useHubStore.getState().claimingBonus).toBeNull()
    })

    it('surfaces a 409 NOT_CLAIMABLE failure without touching the wallet', async () => {
      useSessionStore.setState({ wallet: { coins: 500, gems: 0 } })
      mockedClaimTimed.mockRejectedValue(new ApiClientError('already claimed', 409, 'NOT_CLAIMABLE'))

      const result = await useHubStore.getState().claimTimed()

      expect(result).toBeNull()
      expect(useSessionStore.getState().wallet).toEqual({ coins: 500, gems: 0 })
      expect(useHubStore.getState().bonusClaimError).toBe('already claimed')
      expect(useHubStore.getState().claimingBonus).toBeNull()
    })

    it('claimRescue() overwrites the session wallet', async () => {
      mockedClaimRescue.mockResolvedValue({ amount: 200, wallet: { coins: 200, gems: 0 } })
      mockedGetBonusStatus.mockResolvedValue({
        daily: { claimable: false, streakDay: 1, nextAmount: 100, nextAvailableAt: null },
        timed: { claimable: false, amount: 50, nextAvailableAt: null },
        rescue: { claimable: false, amount: 200 },
      })

      const result = await useHubStore.getState().claimRescue()

      expect(result?.amount).toBe(200)
      expect(useSessionStore.getState().wallet).toEqual({ coins: 200, gems: 0 })
    })

    it('claimMission() marks the mission claimed locally and overwrites the wallet', async () => {
      useHubStore.setState({
        missions: {
          day: '2026-09-02',
          missions: [
            { id: 'm1', name: { en: 'Spin 10 times' }, target: 10, progress: 10, reward: 50, claimed: false, completed: true },
          ],
        },
      })
      mockedClaimMission.mockResolvedValue({ amount: 50, wallet: { coins: 1050, gems: 0 } })

      const result = await useHubStore.getState().claimMission('m1')

      expect(result?.amount).toBe(50)
      expect(useSessionStore.getState().wallet).toEqual({ coins: 1050, gems: 0 })
      expect(useHubStore.getState().missions?.missions[0]?.claimed).toBe(true)
    })
  })

  describe('addXp', () => {
    it('adds to the existing levelInfo.xp locally without a network call', () => {
      useHubStore.setState({ levelInfo: { level: 1, xp: 40, nextLevelXp: 100, maxBet: 100 } })

      useHubStore.getState().addXp(10)

      expect(useHubStore.getState().levelInfo?.xp).toBe(50)
      expect(mockedGetMe).not.toHaveBeenCalled()
    })

    it('does nothing when levelInfo has not loaded yet', () => {
      useHubStore.getState().addXp(10)

      expect(useHubStore.getState().levelInfo).toBeNull()
    })
  })

  describe('refreshBonusStatus', () => {
    it('replaces bonusStatus from GET /bonus', async () => {
      mockedGetBonusStatus.mockResolvedValue({
        daily: { claimable: true, streakDay: 3, nextAmount: 150, nextAvailableAt: null },
        timed: { claimable: false, amount: 50, nextAvailableAt: null },
        rescue: { claimable: false, amount: 200 },
      })

      await useHubStore.getState().refreshBonusStatus()

      expect(useHubStore.getState().bonusStatus?.daily.claimable).toBe(true)
      expect(useHubStore.getState().bonusStatus?.daily.streakDay).toBe(3)
    })
  })

  describe('jackpot polling', () => {
    it('polls GET /jackpot every 15s and stops when stopJackpotPolling() is called', async () => {
      mockedGetJackpot.mockResolvedValue({ pool: 42 })

      useHubStore.getState().startJackpotPolling()
      await vi.advanceTimersByTimeAsync(0)
      expect(mockedGetJackpot).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(15_000)
      expect(mockedGetJackpot).toHaveBeenCalledTimes(2)

      useHubStore.getState().stopJackpotPolling()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(mockedGetJackpot).toHaveBeenCalledTimes(2)
    })

    it('does not call getJackpot while document.hidden is true', async () => {
      mockedGetJackpot.mockResolvedValue({ pool: 42 })
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })

      useHubStore.getState().startJackpotPolling()
      await vi.advanceTimersByTimeAsync(15_000)

      expect(mockedGetJackpot).not.toHaveBeenCalled()

      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    })

    it('starting polling twice does not create duplicate intervals', async () => {
      mockedGetJackpot.mockResolvedValue({ pool: 42 })

      useHubStore.getState().startJackpotPolling()
      useHubStore.getState().startJackpotPolling()
      await vi.advanceTimersByTimeAsync(15_000)

      // 최초 즉시 호출 1회(중복 시작이 무시됨) + 15초 후 1회 = 2회
      expect(mockedGetJackpot).toHaveBeenCalledTimes(2)
    })
  })
})
