/**
 * 허브 스토어 — 보너스, 잭팟, 미션, 리더보드, 레벨.
 * 보너스/미션 수령은 항상 응답의 wallet 값으로 세션 지갑을 덮어쓴다 (서버 권위 원칙).
 */
import { create } from 'zustand'
import type {
  BonusStatus,
  BonusClaimResponse,
  Jackpot,
  LeaderboardResponse,
  MissionsResponse,
  Mission,
  Level,
} from '@tgslot/shared'
import {
  getBonusStatus,
  claimDailyBonus,
  claimTimedBonus,
  claimRescueBonus,
  getJackpot,
  getLeaderboard,
  getMissions,
  claimMission as apiClaimMission,
  claimLeaderboardReward as apiClaimLeaderboardReward,
  getMe,
  ApiClientError,
} from '../sdk/api'
import { useSessionStore } from './session'

export type HubStatus = 'idle' | 'loading' | 'ready' | 'error'
export type BonusKind = 'daily' | 'timed' | 'rescue'

/** 잭팟 폴링 간격 — 로비가 보이는 동안만 돈다 */
const JACKPOT_POLL_INTERVAL_MS = 15_000

function errorMessageOf(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback
}

export interface HubState {
  status: HubStatus
  errorMessage: string | null
  bonusStatus: BonusStatus | null
  jackpot: Jackpot | null
  missions: MissionsResponse | null
  leaderboard: LeaderboardResponse | null
  levelInfo: Level | null
  /** 현재 진행 중인 보너스 수령 종류. 중복 클릭 가드 겸 버튼 로딩 표시용 */
  claimingBonus: BonusKind | null
  claimingMissionId: string | null
  bonusClaimError: string | null
  /** 완료로 바뀐(미완료 -> 완료) 미션 알림 큐. 날이 바뀌거나 수령하면 비운다. */
  missionNotices: Mission[]
  claimingLeaderboardReward: boolean
}

/** 오늘 미션 중 완료했지만 아직 받지 않은 개수 (미션 탭 배지) */
export function unclaimedMissionCount(state: Pick<HubState, 'missions'>): number {
  return state.missions?.missions.filter((m) => m.completed && !m.claimed).length ?? 0
}

export interface HubActions {
  /** 로비 진입 시 1회 호출 — 보너스/잭팟/미션/리더보드/레벨을 한번에 불러온다 */
  loadAll: () => Promise<void>
  claimDaily: () => Promise<BonusClaimResponse | null>
  claimTimed: () => Promise<BonusClaimResponse | null>
  claimRescue: () => Promise<BonusClaimResponse | null>
  /**
   * `shouldApplyWallet`가 false를 돌려주면 응답의 wallet을 세션에 반영하지 않는다
   * (그 사이 더 새로운 스핀 응답이 지갑을 갱신했을 때 낡은 잔액으로 덮어쓰지 않기 위해).
   */
  claimMission: (
    missionId: string,
    options?: { shouldApplyWallet?: () => boolean },
  ) => Promise<BonusClaimResponse | null>
  claimLeaderboardReward: () => Promise<BonusClaimResponse | null>
  /** 토스트에서 알림 한 건을 닫는다 */
  dismissMissionNotice: (missionId: string) => void
  refreshLeaderboard: () => Promise<void>
  refreshMissions: () => Promise<void>
  /** 보너스 타일의 카운트다운이 0에 도달했을 때(수령 가능 전환 감지) 호출 — GET /bonus만 다시 받아온다 */
  refreshBonusStatus: () => Promise<void>
  /** 스핀의 levelUp 응답 이후 최신 xp/maxBet을 다시 받아온다 (levelUp 자체엔 from/to/bonus만 있음) */
  refreshLevelInfo: () => Promise<void>
  /** 스핀 응답의 jackpot(풀 잔액)을 즉시 반영 — 다음 폴링을 기다리지 않는다 */
  setJackpotPool: (pool: number) => void
  /** 스핀 응답의 missions(진행도 갱신)를 즉시 반영 */
  setMissions: (missions: Mission[]) => void
  /** xp(누적 베팅액)를 매 스핀마다 로컬로 즉시 더한다 — 레벨 바가 폴링/levelUp을 기다리지 않고 채워진다 */
  addXp: (amount: number) => void
  /** 로비가 보이는 동안 GET /jackpot을 주기적으로 호출. document.hidden이면 건너뛴다 */
  startJackpotPolling: () => void
  stopJackpotPolling: () => void
  dismissBonusClaimError: () => void
}

export type HubStore = HubState & HubActions

const initialState: HubState = {
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
}

/** setInterval id — zustand 상태에 두면 값이 바뀔 때마다 불필요한 리렌더를 유발하므로 모듈 스코프에 둔다 */
let jackpotIntervalId: ReturnType<typeof setInterval> | null = null
let visibilityHandler: (() => void) | null = null

export const useHubStore = create<HubStore>((set, get) => {
  async function fetchJackpotIfVisible(): Promise<void> {
    if (typeof document !== 'undefined' && document.hidden) return
    try {
      const jackpot = await getJackpot()
      set({ jackpot })
    } catch {
      /* 일시적 네트워크 실패 — 이전 값을 유지한다 */
    }
  }

  async function performBonusClaim(
    kind: BonusKind,
    call: (token: string) => Promise<BonusClaimResponse>,
  ): Promise<BonusClaimResponse | null> {
    if (get().claimingBonus !== null) return null
    const token = useSessionStore.getState().token
    if (!token) return null

    set({ claimingBonus: kind, bonusClaimError: null })
    try {
      const result = await call(token)
      useSessionStore.setState({ wallet: result.wallet })
      const bonusStatus = await getBonusStatus(token).catch(() => get().bonusStatus)
      set({ claimingBonus: null, bonusStatus })
      return result
    } catch (err) {
      set({ claimingBonus: null, bonusClaimError: errorMessageOf(err, '보너스 수령에 실패했어요') })
      return null
    }
  }

  return {
    ...initialState,

    async loadAll() {
      const token = useSessionStore.getState().token
      if (!token) {
        set({ status: 'error', errorMessage: '로그인이 필요합니다' })
        return
      }
      set({ status: 'loading', errorMessage: null })
      try {
        const [me, bonusStatus, jackpot, missions, leaderboard] = await Promise.all([
          getMe(token),
          getBonusStatus(token),
          getJackpot(),
          getMissions(token),
          getLeaderboard(token),
        ])
        useSessionStore.setState({ user: me.user, wallet: me.wallet })
        set({
          status: 'ready',
          errorMessage: null,
          bonusStatus,
          jackpot,
          missions,
          leaderboard,
          levelInfo: me.levelInfo,
        })
      } catch (err) {
        set({ status: 'error', errorMessage: errorMessageOf(err, '허브 정보를 불러오지 못했습니다') })
      }
    },

    claimDaily() {
      return performBonusClaim('daily', claimDailyBonus)
    },

    claimTimed() {
      return performBonusClaim('timed', claimTimedBonus)
    },

    claimRescue() {
      return performBonusClaim('rescue', claimRescueBonus)
    },

    async claimMission(missionId, options) {
      if (get().claimingMissionId !== null) return null
      const token = useSessionStore.getState().token
      if (!token) return null

      set({ claimingMissionId: missionId, bonusClaimError: null })
      try {
        const result = await apiClaimMission(token, missionId)
        if (options?.shouldApplyWallet?.() !== false) {
          useSessionStore.setState({ wallet: result.wallet })
        }
        set((state) => ({
          claimingMissionId: null,
          missionNotices: state.missionNotices.filter((m) => m.id !== missionId),
          missions: state.missions
            ? {
                ...state.missions,
                missions: state.missions.missions.map((m) =>
                  m.id === missionId ? { ...m, claimed: true } : m,
                ),
              }
            : state.missions,
        }))
        return result
      } catch (err) {
        set({ claimingMissionId: null, bonusClaimError: errorMessageOf(err, '보상 수령에 실패했어요') })
        return null
      }
    },

    async claimLeaderboardReward() {
      if (get().claimingLeaderboardReward) return null
      const token = useSessionStore.getState().token
      if (!token) return null

      set({ claimingLeaderboardReward: true, bonusClaimError: null })
      try {
        const result = await apiClaimLeaderboardReward(token)
        useSessionStore.setState({ wallet: result.wallet })
        set((state) => ({
          claimingLeaderboardReward: false,
          leaderboard: state.leaderboard?.lastWeek
            ? { ...state.leaderboard, lastWeek: { ...state.leaderboard.lastWeek, claimed: true } }
            : state.leaderboard,
        }))
        return result
      } catch (err) {
        set({ claimingLeaderboardReward: false, bonusClaimError: errorMessageOf(err, '보상 수령에 실패했어요') })
        return null
      }
    },

    dismissMissionNotice(missionId) {
      set((state) => ({ missionNotices: state.missionNotices.filter((m) => m.id !== missionId) }))
    },

    async refreshLeaderboard() {
      const token = useSessionStore.getState().token
      if (!token) return
      try {
        const leaderboard = await getLeaderboard(token)
        set({ leaderboard })
      } catch {
        /* 조용히 무시 — 화면엔 이전 값이 남는다 */
      }
    },

    async refreshMissions() {
      const token = useSessionStore.getState().token
      if (!token) return
      try {
        const missions = await getMissions(token)
        set((state) => ({
          missions,
          // 날이 바뀐 목록이면 어제 알림은 의미가 없다.
          missionNotices: state.missions && state.missions.day !== missions.day ? [] : state.missionNotices,
        }))
      } catch {
        /* noop */
      }
    },

    async refreshBonusStatus() {
      const token = useSessionStore.getState().token
      if (!token) return
      try {
        const bonusStatus = await getBonusStatus(token)
        set({ bonusStatus })
      } catch {
        /* noop — 다음 폴링/재진입에서 다시 시도된다 */
      }
    },

    async refreshLevelInfo() {
      const token = useSessionStore.getState().token
      if (!token) return
      try {
        const me = await getMe(token)
        // 지갑은 덮지 않는다. 레벨업 판마다 불리므로 오토·터보에서 늦게 온 /me가 다음 판 지갑을
        // 옛 값으로 되돌리거나, 말판처럼 일부러 숨겨 둔 당첨을 상단 잔액에 미리 드러낼 수 있다.
        // 스핀 응답 지갑(레벨업 보너스 포함)이 이미 권위 값이다.
        useSessionStore.setState({ user: me.user })
        set({ levelInfo: me.levelInfo })
      } catch {
        /* noop */
      }
    },

    setJackpotPool(pool) {
      set((state) => ({ jackpot: state.jackpot ? { ...state.jackpot, pool } : { pool } }))
    },

    setMissions(missions) {
      // loadAll()이 아직 끝나지 않아 day를 모를 수도 있으므로 오늘 날짜(UTC)로 채워둔다 —
      // 곧이어 refreshMissions()/loadAll()이 정확한 day로 다시 채운다.
      set((state) => {
        const today = new Date().toISOString().slice(0, 10)
        const previous = state.missions
        const sameDay = previous !== null && previous.day === today
        const day = previous?.day ?? today
        // 날이 바뀌었으면 큐를 비운다. 같은 날이면 미완료 -> 완료로 바뀐 미션만 알림에 넣는다.
        // 이전 목록이 없으면(허브 로딩 전) 무엇이 «바뀌었는지» 알 수 없으므로 알림을 만들지 않는다.
        if (previous !== null && !sameDay) {
          return { missions: { day: today, missions }, missionNotices: [] }
        }
        const knownIds = new Set(state.missionNotices.map((m) => m.id))
        const fresh =
          previous === null
            ? []
            : missions.filter((m) => {
                if (!m.completed || m.claimed || knownIds.has(m.id)) return false
                const before = previous.missions.find((p) => p.id === m.id)
                return before !== undefined && !before.completed
              })
        return {
          missions: { day, missions },
          missionNotices: fresh.length > 0 ? [...state.missionNotices, ...fresh] : state.missionNotices,
        }
      })
    },

    addXp(amount) {
      set((state) =>
        state.levelInfo ? { levelInfo: { ...state.levelInfo, xp: state.levelInfo.xp + amount } } : state,
      )
    },

    startJackpotPolling() {
      if (jackpotIntervalId !== null) return
      void fetchJackpotIfVisible()
      jackpotIntervalId = setInterval(() => void fetchJackpotIfVisible(), JACKPOT_POLL_INTERVAL_MS)
      if (typeof document !== 'undefined') {
        visibilityHandler = () => {
          if (!document.hidden) void fetchJackpotIfVisible()
        }
        document.addEventListener('visibilitychange', visibilityHandler)
      }
    },

    stopJackpotPolling() {
      if (jackpotIntervalId !== null) {
        clearInterval(jackpotIntervalId)
        jackpotIntervalId = null
      }
      if (visibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler)
        visibilityHandler = null
      }
    },

    dismissBonusClaimError() {
      set({ bonusClaimError: null })
    },
  }
})
