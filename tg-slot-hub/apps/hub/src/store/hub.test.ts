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
import { useHubStore, unclaimedMissionCount } from './hub'
import type { Mission } from '@tgslot/shared'
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
    missionNotices: [],
    claimingLeaderboardReward: false,
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

  describe('미션 완료 알림', () => {
    const TODAY = '2026-09-02'

    function mission(id: string, patch: Partial<Mission> = {}): Mission {
      return {
        id,
        name: { en: id, ko: id },
        target: 3,
        progress: 0,
        reward: 500,
        claimed: false,
        completed: false,
        ...patch,
      }
    }

    beforeEach(() => {
      vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`))
    })

    it('미완료 -> 완료로 바뀐 미션만 큐에 넣는다', () => {
      useHubStore.setState({ missions: { day: TODAY, missions: [mission('a'), mission('b')] } })

      useHubStore.getState().setMissions([mission('a', { progress: 3, completed: true }), mission('b', { progress: 1 })])

      expect(useHubStore.getState().missionNotices.map((m) => m.id)).toEqual(['a'])
    })

    it('이미 완료였던 미션은 다시 넣지 않는다', () => {
      useHubStore.setState({
        missions: { day: TODAY, missions: [mission('a', { progress: 3, completed: true })] },
      })

      useHubStore.getState().setMissions([mission('a', { progress: 3, completed: true })])

      expect(useHubStore.getState().missionNotices).toEqual([])
    })

    it('같은 알림이 두 번 쌓이지 않는다', () => {
      useHubStore.setState({ missions: { day: TODAY, missions: [mission('a')] } })
      const done = mission('a', { progress: 3, completed: true })

      useHubStore.getState().setMissions([done])
      useHubStore.getState().setMissions([done])

      expect(useHubStore.getState().missionNotices).toHaveLength(1)
    })

    it('이전 목록이 없으면(허브 로딩 전) 알림을 만들지 않는다', () => {
      useHubStore.getState().setMissions([mission('a', { progress: 3, completed: true })])
      expect(useHubStore.getState().missionNotices).toEqual([])
    })

    it('날이 바뀌면 큐를 비운다', () => {
      useHubStore.setState({
        missions: { day: '2026-09-01', missions: [mission('a')] },
        missionNotices: [mission('a', { completed: true })],
      })

      useHubStore.getState().setMissions([mission('a', { progress: 1 })])

      expect(useHubStore.getState().missionNotices).toEqual([])
      expect(useHubStore.getState().missions?.day).toBe(TODAY)
    })

    it('받을 수 있는 미션 수를 센다', () => {
      useHubStore.setState({
        missions: {
          day: TODAY,
          missions: [
            mission('a', { completed: true }),
            mission('b', { completed: true, claimed: true }),
            mission('c'),
          ],
        },
      })
      expect(unclaimedMissionCount(useHubStore.getState())).toBe(1)
    })

    it('수령하면 큐에서 빠지고, shouldApplyWallet이 false면 지갑을 덮지 않는다', async () => {
      useHubStore.setState({
        missions: { day: TODAY, missions: [mission('a', { completed: true })] },
        missionNotices: [mission('a', { completed: true })],
      })
      mockedClaimMission.mockResolvedValue({ amount: 500, wallet: { coins: 9999, gems: 0 } })

      await useHubStore.getState().claimMission('a', { shouldApplyWallet: () => false })

      expect(useSessionStore.getState().wallet?.coins).toBe(1000)
      expect(useHubStore.getState().missionNotices).toEqual([])
      expect(useHubStore.getState().missions?.missions[0]?.claimed).toBe(true)
    })

    it('기본값은 응답 지갑을 반영한다', async () => {
      useHubStore.setState({ missions: { day: TODAY, missions: [mission('a', { completed: true })] } })
      mockedClaimMission.mockResolvedValue({ amount: 500, wallet: { coins: 1500, gems: 0 } })

      await useHubStore.getState().claimMission('a')

      expect(useSessionStore.getState().wallet?.coins).toBe(1500)
    })
  })
})
