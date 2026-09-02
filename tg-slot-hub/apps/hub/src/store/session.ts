/**
 * 세션 스토어 — TMA 부트스트랩 → 인증 → /me 갱신
 * 토큰은 sessionStorage에 보관한다 (try/catch로 접근 불가 환경 방어, 프라이빗 모드 등).
 */
import { create } from 'zustand'
import type { PublicUser, Wallet } from '@tgslot/shared'
import { initTma, getInitDataRaw } from '../sdk/tma'
import { authTelegram, getMe, ApiClientError } from '../sdk/api'

export type SessionStatus = 'idle' | 'authing' | 'ready' | 'outside' | 'error'

/** api가 개발 모드에서만 허용하는 텔레그램 밖 고정 initData */
const DEV_MOCK_INIT_DATA = 'mock:777000:Dev'
const TOKEN_STORAGE_KEY = 'tgslot.token'

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch {
    /* sessionStorage 접근 불가 — 세션 유지 없이 계속 진행 */
  }
}

function errorMessageOf(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback
}

export interface SessionState {
  status: SessionStatus
  token: string | null
  user: PublicUser | null
  wallet: Wallet | null
  errorMessage: string | null
  /** refreshMe() 실패 메시지. bootstrap 실패와 달리 전체 화면을 에러로 덮지 않는다 (일시적 네트워크 문제 대응) */
  refreshError: string | null
}

export interface SessionActions {
  /** SDK 초기화 → 저장된 토큰 또는 initData로 인증 → 상태 확정 */
  bootstrap: () => Promise<void>
  /** 현재 토큰으로 /me 재조회 (지갑 갱신 등) */
  refreshMe: () => Promise<void>
}

export type SessionStore = SessionState & SessionActions

const initialState: SessionState = {
  status: 'idle',
  token: null,
  user: null,
  wallet: null,
  errorMessage: null,
  refreshError: null,
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  ...initialState,

  async bootstrap() {
    const current = get().status
    if (current === 'authing' || current === 'ready') return
    set({ status: 'authing', errorMessage: null, refreshError: null })

    try {
      initTma()
    } catch {
      /* SDK 초기화 실패는 무시하고 initData 판별로 자연스럽게 outside 처리 */
    }

    const storedToken = readStoredToken()
    if (storedToken) {
      try {
        const me = await getMe(storedToken)
        set({
          status: 'ready',
          token: storedToken,
          user: me.user,
          wallet: me.wallet,
          errorMessage: null,
        })
        return
      } catch {
        // 저장된 토큰이 만료/무효 — 지우고 initData 플로우로 계속 진행
        writeStoredToken(null)
      }
    }

    const realInitData = getInitDataRaw()
    const devMockEnabled = import.meta.env.VITE_DEV_MOCK_TMA === 'true'
    const initData = realInitData ?? (devMockEnabled ? DEV_MOCK_INIT_DATA : null)

    if (!initData) {
      set({ status: 'outside' })
      return
    }

    try {
      const auth = await authTelegram(initData)
      writeStoredToken(auth.token)
      set({
        status: 'ready',
        token: auth.token,
        user: auth.user,
        wallet: auth.wallet,
        errorMessage: null,
      })
    } catch (err) {
      set({ status: 'error', errorMessage: errorMessageOf(err, '로그인에 실패했습니다') })
    }
  },

  async refreshMe() {
    const { token } = get()
    if (!token) return
    try {
      const me = await getMe(token)
      set({ user: me.user, wallet: me.wallet, refreshError: null })
    } catch (err) {
      // 일시적 네트워크 문제로 전체 화면을 에러로 덮지 않는다 — status는 ready로 유지하고
      // refreshError만 별도로 노출한다 (UI가 원하면 토스트 등으로 표시).
      set({ refreshError: errorMessageOf(err, '정보를 불러오지 못했습니다') })
    }
  },
}))
