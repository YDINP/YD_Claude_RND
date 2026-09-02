/**
 * 세션 스토어 — TMA 부트스트랩 → 인증 → /me 갱신
 * 토큰은 sessionStorage에 보관한다 (try/catch로 접근 불가 환경 방어, 프라이빗 모드 등).
 */
import { create } from 'zustand'
import type { PublicUser, Wallet } from '@tgslot/shared'
import { initTma, getInitDataRaw } from '../sdk/tma'
import { authTelegram, getMe, ApiClientError, registerReauthHandler } from '../sdk/api'

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

/** bootstrap()과 reauth()가 공유하는 initData 판별 로직. 실기기 initData가 없으면 dev mock으로 폴백한다 */
function resolveInitData(): string | null {
  const realInitData = getInitDataRaw()
  const devMockEnabled = import.meta.env.VITE_DEV_MOCK_TMA === 'true'
  return realInitData ?? (devMockEnabled ? DEV_MOCK_INIT_DATA : null)
}

/**
 * 동시에 여러 authedFetch 호출이 401/USER_NOT_FOUND를 받아도 재인증은 한 번만 실행되도록
 * 진행 중인 Promise를 모듈 스코프에서 공유한다. 스토어 state가 아니라 여기 두는 이유는
 * 상태 갱신마다 새 참조가 생기는 zustand set()과 섞이지 않게 하기 위해서다.
 */
let reauthPromise: Promise<string | null> | null = null

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
  /**
   * sdk/api.ts의 authedFetch가 401/404 USER_NOT_FOUND를 받았을 때 호출하는 재인증.
   * 저장된 토큰을 버리고 bootstrap()과 같은 initData/mock 인증을 다시 밟아 token/user/wallet을
   * 갱신한다. 이미 어떤 화면이 떠 있는 상태(ready)에서 벌어지는 일이라 status는 건드리지 않는다 —
   * 'authing'으로 바꾸면 App이 전체 화면 로딩으로 전환되며 지금 보던 화면(게임 등)이 사라진다.
   * 성공하면 새 토큰을, 실패(초기화 불가·initData 없음 등)하면 null을 반환한다.
   */
  reauth: () => Promise<string | null>
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
        // getMe()는 authedFetch를 거치므로 storedToken이 만료됐어도 내부적으로 reauth()가 이미
        // 실행돼 성공했을 수 있다 — 그 경우 store의 token은 새 값으로 갱신돼 있으니 그걸 쓴다.
        // reauth가 없었다면(정상 케이스) get().token은 여전히 null이라 storedToken으로 폴백한다.
        set({
          status: 'ready',
          token: get().token ?? storedToken,
          user: me.user,
          wallet: me.wallet,
          errorMessage: null,
        })
        return
      } catch {
        // 저장된 토큰이 만료/무효이고 재인증까지 실패 — 지우고 initData 플로우로 계속 진행
        writeStoredToken(null)
      }
    }

    const initData = resolveInitData()

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

  async reauth() {
    if (reauthPromise) return reauthPromise

    reauthPromise = (async () => {
      // 오래된(존재하지 않는 유저의) 토큰이므로 먼저 지운다 — 실패해도 다시 쓰지 않는다.
      writeStoredToken(null)

      const initData = resolveInitData()
      if (!initData) {
        set({ token: null })
        return null
      }

      try {
        const auth = await authTelegram(initData)
        writeStoredToken(auth.token)
        set({ token: auth.token, user: auth.user, wallet: auth.wallet, errorMessage: null })
        return auth.token
      } catch {
        set({ token: null })
        return null
      }
    })()

    try {
      return await reauthPromise
    } finally {
      reauthPromise = null
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

// sdk/api.ts의 authedFetch가 401/404 USER_NOT_FOUND를 받았을 때 쓸 재인증 훅을 등록한다.
// api.ts가 이 스토어를 직접 import하면 순환 import가 되므로(테스트에서 실제로 깨졌었다) 이렇게
// 스토어가 만들어진 뒤 지연 등록하는 방식으로 피한다.
registerReauthHandler(() => useSessionStore.getState().reauth())
