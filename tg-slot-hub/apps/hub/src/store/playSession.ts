/**
 * 플레이 세션 스토어 — «이번 세션» 플레이 시간과 게임 손익, 60분마다 휴식 안내 기준.
 * 책임 설계용 표시값이라 서버 권위 값이 아니다(지갑·결과는 여전히 서버가 정한다).
 *
 *  - 세션: 앱을 연 순간부터. 탭이 30분 이상 숨겨졌다 돌아오면 새 세션.
 *  - 시간: 화면이 «보이는» 동안만 센다(visibilitychange).
 *  - 손익(spinNet): 스핀마다 당첨+잭팟−(프리스핀이 아니면 베팅). 더블업은 요청 전후 지갑 차이.
 *    데일리·4시간·구제·미션·레벨업·리더보드 보상 같은 보너스는 넣지 않는다(게임 손익만).
 *  - 백업: sessionStorage(접근 실패 시 메모리만).
 */
import { create } from 'zustand'

export const BREAK_INTERVAL_MS = 60 * 60 * 1000
export const NEW_SESSION_HIDDEN_MS = 30 * 60 * 1000
const STORAGE_KEY = 'tgslot.playSession.v1'

/** 스핀 한 판의 게임 손익. 프리스핀은 베팅이 공짜라 당첨만 더한다. */
export function spinNetOf(input: {
  totalWin: number
  jackpotWin?: number | undefined
  totalBet: number
  isFreeSpin: boolean
}): number {
  return input.totalWin + (input.jackpotWin ?? 0) - (input.isFreeSpin ? 0 : input.totalBet)
}

/** 지금까지 채운 휴식 안내 단계(60분=1, 120분=2…). */
export function breakStepOf(visibleMs: number): number {
  return Math.floor(visibleMs / BREAK_INTERVAL_MS)
}

/** "1시간 5분" 식의 플레이 시간. 분 단위로 내림, 1분 미만은 "1분 미만". */
export function formatPlayTime(visibleMs: number, labels: { hour: string; minute: string; underMinute: string }): string {
  const totalMinutes = Math.floor(visibleMs / 60_000)
  if (totalMinutes < 1) return labels.underMinute
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}${labels.minute}`
  return m === 0 ? `${h}${labels.hour}` : `${h}${labels.hour} ${m}${labels.minute}`
}

interface Persisted {
  visibleMs: number
  spinNet: number
  breakStep: number
  hiddenAt: number | null
  savedAt: number
}

interface PlaySessionState {
  visibleMs: number
  spinNet: number
  /** 이미 안내한 휴식 단계. breakStepOf(visibleMs)가 이보다 크면 안내할 차례다. */
  breakStep: number
  /** 화면이 보이는 중이면 마지막으로 시간을 합산한 시각, 숨겨져 있으면 null. */
  lastTickAt: number | null
  hiddenAt: number | null
}

interface PlaySessionActions {
  tick: (now: number) => void
  setVisible: (visible: boolean, now: number) => void
  recordSpin: (input: { totalWin: number; jackpotWin?: number | undefined; totalBet: number; isFreeSpin: boolean }) => void
  /** 더블업 요청 전후 지갑 차이를 더한다(보너스류와 달리 이 판돈은 게임 손익이다). */
  recordGambleDelta: (walletBefore: number, walletAfter: number) => void
  /** 지금 휴식 안내를 띄울 차례인가. */
  breakDue: () => boolean
  ackBreak: () => void
  /** 테스트·QA 전용 — 플레이 시간을 앞으로 당긴다. */
  debugAdvance: (ms: number) => void
  reset: (now?: number) => void
}

function readPersisted(now: number): Persisted | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const p = JSON.parse(raw) as Partial<Persisted>
    if (
      typeof p.visibleMs !== 'number' ||
      typeof p.spinNet !== 'number' ||
      typeof p.breakStep !== 'number' ||
      typeof p.savedAt !== 'number'
    ) {
      return null
    }
    // 탭이 닫혀 있던(저장 이후 소식이 없던) 시간이 30분 이상이면 새 세션이다.
    if (now - p.savedAt >= NEW_SESSION_HIDDEN_MS) return null
    return {
      visibleMs: p.visibleMs,
      spinNet: p.spinNet,
      breakStep: p.breakStep,
      hiddenAt: typeof p.hiddenAt === 'number' ? p.hiddenAt : null,
      savedAt: p.savedAt,
    }
  } catch {
    return null
  }
}

function persist(s: PlaySessionState, now: number): void {
  try {
    const p: Persisted = {
      visibleMs: s.visibleMs,
      spinNet: s.spinNet,
      breakStep: s.breakStep,
      hiddenAt: s.hiddenAt,
      savedAt: now,
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* sessionStorage 접근 불가 — 메모리만으로 계속 */
  }
}

function initial(now: number): PlaySessionState {
  const saved = readPersisted(now)
  const visible = typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  return {
    visibleMs: saved?.visibleMs ?? 0,
    spinNet: saved?.spinNet ?? 0,
    breakStep: saved?.breakStep ?? 0,
    lastTickAt: visible ? now : null,
    hiddenAt: visible ? null : now,
  }
}

export const usePlaySessionStore = create<PlaySessionState & PlaySessionActions>((set, get) => ({
  ...initial(Date.now()),

  tick(now) {
    const s = get()
    if (s.lastTickAt === null) return
    const next = { visibleMs: s.visibleMs + Math.max(0, now - s.lastTickAt), lastTickAt: now }
    set(next)
    persist({ ...get() }, now)
  },

  setVisible(visible, now) {
    const s = get()
    if (!visible) {
      if (s.lastTickAt === null) return
      set({ visibleMs: s.visibleMs + Math.max(0, now - s.lastTickAt), lastTickAt: null, hiddenAt: now })
      persist({ ...get() }, now)
      return
    }
    if (s.lastTickAt !== null) return
    if (s.hiddenAt !== null && now - s.hiddenAt >= NEW_SESSION_HIDDEN_MS) {
      set({ visibleMs: 0, spinNet: 0, breakStep: 0, lastTickAt: now, hiddenAt: null })
    } else {
      set({ lastTickAt: now, hiddenAt: null })
    }
    persist({ ...get() }, now)
  },

  recordSpin(input) {
    set((s) => ({ spinNet: s.spinNet + spinNetOf(input) }))
    persist({ ...get() }, Date.now())
  },

  recordGambleDelta(walletBefore, walletAfter) {
    set((s) => ({ spinNet: s.spinNet + (walletAfter - walletBefore) }))
    persist({ ...get() }, Date.now())
  },

  breakDue() {
    const s = get()
    return breakStepOf(s.visibleMs) > s.breakStep
  },

  ackBreak() {
    set((s) => ({ breakStep: breakStepOf(s.visibleMs) }))
    persist({ ...get() }, Date.now())
  },

  debugAdvance(ms) {
    set((s) => ({ visibleMs: s.visibleMs + ms }))
  },

  reset(now = Date.now()) {
    set({ visibleMs: 0, spinNet: 0, breakStep: 0, lastTickAt: now, hiddenAt: null })
    persist({ ...get() }, now)
  },
}))

/**
 * 시계를 돌린다 — App이 마운트할 때 한 번 부르고 반환값으로 정리한다.
 * 1초마다 보이는 시간을 합산하고, 탭 숨김/복귀를 반영한다.
 */
export function startPlaySessionClock(): () => void {
  const store = usePlaySessionStore.getState()
  const visible = document.visibilityState !== 'hidden'
  store.setVisible(visible, Date.now())
  const onVisibility = (): void => {
    usePlaySessionStore.getState().setVisible(document.visibilityState !== 'hidden', Date.now())
  }
  document.addEventListener('visibilitychange', onVisibility)
  const id = setInterval(() => usePlaySessionStore.getState().tick(Date.now()), 1000)
  if (import.meta.env.DEV) {
    ;(window as unknown as { __tgslotPlaySession?: typeof usePlaySessionStore }).__tgslotPlaySession = usePlaySessionStore
  }
  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

/** 부호가 붙은 손익 표기 — 0은 부호 없이, 음수는 진짜 마이너스(−). 색은 입히지 않는다(중립). */
export function formatSigned(value: number): string {
  const abs = Math.abs(Math.round(value)).toLocaleString('en-US')
  if (value > 0) return `+${abs}`
  if (value < 0) return `\u2212${abs}`
  return '0'
}
