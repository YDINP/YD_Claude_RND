/**
 * 게임 화면 스토어 — 게임별 수학 모델 로딩, 베팅 레벨, 스핀 플로우.
 * 서버 권위 원칙: 스핀 결과와 잔액은 항상 서버 응답 값으로 덮어쓴다.
 */
import { create } from 'zustand'
import { parseGameMath, type GameMath } from '@tgslot/slot-engine'
import type { SpinResponse, WinLine } from '@tgslot/shared'
import { getGameMath, spin as apiSpin, ApiClientError } from '../sdk/api'
import { useSessionStore } from './session'

export type GamePhase = 'loading' | 'idle' | 'spinning' | 'showingWin' | 'error'

/**
 * 게임 화면이 렌더러(@tgslot/renderer)를 만든 뒤 store에 등록하는 최소 인터페이스.
 * store는 렌더러 패키지를 직접 import하지 않아 테스트에서 가짜 객체로 쉽게 대체할 수 있다.
 */
export interface SpinRenderer {
  spinTo(stops: number[], options?: { durationMs?: number; stagger?: number }): Promise<void>
  showWins(wins: WinLine[], options?: { loop?: boolean }): Promise<void>
}

const BET_INDEX_KEY_PREFIX = 'tgslot.bet.'

function readStoredBetIndex(gameId: string): number | null {
  try {
    const raw = localStorage.getItem(`${BET_INDEX_KEY_PREFIX}${gameId}`)
    if (raw === null) return null
    const parsed = Number.parseInt(raw, 10)
    return Number.isNaN(parsed) ? null : parsed
  } catch {
    return null
  }
}

function writeStoredBetIndex(gameId: string, index: number): void {
  try {
    localStorage.setItem(`${BET_INDEX_KEY_PREFIX}${gameId}`, String(index))
  } catch {
    /* localStorage 접근 불가 — 베팅 레벨 기억 없이 계속 진행 */
  }
}

function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `spin-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

export interface GameState {
  gameId: string | null
  math: GameMath | null
  betIndex: number
  phase: GamePhase
  lastResult: SpinResponse | null
  error: string | null
  errorCode: string | null
  /** 실패한(또는 진행 중인) 스핀의 idempotencyKey. 재시도 시 재사용해 서버가 같은 결과를 재생하게 한다 */
  idempotencyKey: string | null
  renderer: SpinRenderer | null
}

export interface GameActions {
  load: (gameId: string) => Promise<void>
  setBet: (index: number) => void
  setRenderer: (renderer: SpinRenderer | null) => void
  spin: () => Promise<void>
  /** INSUFFICIENT_FUNDS 시트 등 에러 표시를 닫고 idle로 되돌린다 */
  dismissError: () => void
  reset: () => void
}

export type GameStore = GameState & GameActions

const initialState: GameState = {
  gameId: null,
  math: null,
  betIndex: 0,
  phase: 'loading',
  lastResult: null,
  error: null,
  errorCode: null,
  idempotencyKey: null,
  renderer: null,
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  async load(gameId) {
    set({ ...initialState, gameId, phase: 'loading' })
    try {
      const raw = await getGameMath(gameId)
      const math = parseGameMath(raw)
      const storedIndex = readStoredBetIndex(gameId)
      const betIndex =
        storedIndex !== null && storedIndex >= 0 && storedIndex < math.betLevels.length
          ? storedIndex
          : 0
      // load()가 재호출됐을 수 있으므로(재시도), 여전히 같은 게임을 보고 있을 때만 반영한다.
      if (get().gameId !== gameId) return
      set({ math, betIndex, phase: 'idle', error: null, errorCode: null })
    } catch (err) {
      if (get().gameId !== gameId) return
      const message = err instanceof ApiClientError ? err.message : '게임을 불러오지 못했습니다'
      const code = err instanceof ApiClientError ? (err.code ?? null) : null
      set({ phase: 'error', error: message, errorCode: code })
    }
  },

  setBet(index) {
    const { math, gameId, phase } = get()
    if (!math || !gameId) return
    if (phase === 'spinning' || phase === 'showingWin') return
    if (index < 0 || index >= math.betLevels.length) return
    set({ betIndex: index })
    writeStoredBetIndex(gameId, index)
  },

  setRenderer(renderer) {
    set({ renderer })
  },

  async spin() {
    const { gameId, math, betIndex, phase, renderer } = get()
    if (!gameId || !math) return
    if (phase === 'spinning' || phase === 'showingWin') return

    const token = useSessionStore.getState().token
    if (!token) {
      set({ phase: 'error', error: '로그인이 필요합니다', errorCode: 'unauthorized' })
      return
    }

    const totalBet = math.betLevels[betIndex]
    if (totalBet === undefined) return

    // 이전 실패에서 남은 키가 있으면 재사용한다 — 서버가 idempotencyKey로 재전송을 판별한다.
    const idempotencyKey = get().idempotencyKey ?? newIdempotencyKey()
    // 새 스핀을 시작하면 이전 승리 배너부터 지운다 — 다음 결과가 나올 때까지 화면에 남아있으면 안 된다.
    set({ phase: 'spinning', idempotencyKey, error: null, errorCode: null, lastResult: null })

    let result: SpinResponse
    try {
      result = await apiSpin(token, gameId, { totalBet, idempotencyKey })
    } catch (err) {
      if (get().gameId !== gameId) return

      if (err instanceof ApiClientError && err.code === 'INSUFFICIENT_FUNDS') {
        set({ phase: 'error', error: err.message, errorCode: 'INSUFFICIENT_FUNDS', idempotencyKey: null })
        return
      }

      // status 0(네트워크 오류)이나 SPIN_IN_PROGRESS(409)만 같은 idempotencyKey를 유지해 재시도를 허용한다.
      // 그 외 확정적인 4xx(예: INVALID_BET)는 서버가 이미 그 키로 실패를 기록했을 수 있으니 다음 시도에 새 키를 쓴다.
      const message = err instanceof ApiClientError ? err.message : '스핀에 실패했습니다'
      const code = err instanceof ApiClientError ? (err.code ?? null) : null
      const retryable = err instanceof ApiClientError && (err.status === 0 || err.code === 'SPIN_IN_PROGRESS')
      set({
        phase: 'idle',
        error: message,
        errorCode: code,
        idempotencyKey: retryable ? idempotencyKey : null,
      })
      return
    }

    // 서버 잔액을 가드보다도 먼저 즉시 반영한다 — 이후 렌더러가 실패하거나(throw) 화면을 벗어나도
    // 이미 확정된 권위 있는 잔액이 유실되지 않게 한다.
    useSessionStore.setState({ wallet: result.wallet })

    if (get().gameId !== gameId) return

    set({ lastResult: result, idempotencyKey: null })

    try {
      if (renderer) {
        await renderer.spinTo(result.stops)
      }

      if (result.wins.length > 0) {
        set({ phase: 'showingWin' })
        if (renderer) {
          await renderer.showWins(result.wins)
        }
      }
    } catch (err) {
      // 연출 실패는 서버 권위 결과에 영향을 주지 않는다 — 원인만 남기고 아래 finally가 phase를 회복시킨다.
      console.error('[game] renderer playback failed', err)
    } finally {
      if (get().gameId === gameId) set({ phase: 'idle' })
    }
  },

  dismissError() {
    set({ phase: 'idle', error: null, errorCode: null })
  },

  reset() {
    set(initialState)
  },
}))
