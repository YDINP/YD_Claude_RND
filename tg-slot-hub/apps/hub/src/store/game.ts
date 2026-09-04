/**
 * 게임 화면 스토어 — 게임별 수학 모델 로딩, 베팅 레벨, 스핀 플로우.
 * 서버 권위 원칙: 스핀 결과와 잔액은 항상 서버 응답 값으로 덮어쓴다.
 */
import { create } from 'zustand'
import { parseGameMath, type GameMath } from '@tgslot/slot-engine'
import type {
  SpinRequest,
  SpinResponse,
  WinLine,
  FreeSpinsState,
  FeatureTrigger,
  MutationEvent,
  GambleSide,
  GambleResponse,
  GambleState,
} from '@tgslot/shared'
import {
  getGameMath,
  spin as apiSpin,
  getGameState,
  gamble as apiGamble,
  collectGamble as apiCollectGamble,
  ApiClientError,
} from '../sdk/api'
import { useSessionStore } from './session'
import { useHubStore } from './hub'
import type { DebugPreset } from '../lib/debugPreset'

/** SpinResponse.debug의 형태 — 어떤 프리셋이 실제로 적용됐고 몇 번 만에 그 결과를 찾았는지. */
type SpinDebugResponse = NonNullable<SpinResponse['debug']>

export type GamePhase = 'loading' | 'idle' | 'spinning' | 'showingWin' | 'error'

/** 자동 스핀을 다음 스핀이 시작되면(수동이든 자동이든) 취소하기 위한 모듈 스코프 타이머. */
let autoSpinTimeoutId: ReturnType<typeof setTimeout> | null = null
/**
 * 위 타이머를 누가 걸었는지 — 프리스핀 자동진행인지 오토스핀인지. 오토스핀을 중지할 때
 * (`stopAutoSpin`) 프리스핀 자동진행이 걸어 둔 예약까지 같이 지워버리면 안 되므로 구분한다.
 */
let autoSpinTimeoutOwner: 'freeSpins' | 'autoSpin' | null = null
/** 승리 연출 뒤 다음 프리스핀이 자동으로 돌기까지 대기하는 시간. 탭하면 바로 스핀되므로 이건 상한이다. */
const AUTO_SPIN_DELAY_MS = 1200
/**
 * 오토스핀에서 다음 판까지의 간격. 프리스핀 자동진행(위)보다 짧다 — 오토스핀은 승리 연출도
 * 한 바퀴만 보여주므로(showWins의 `loop:false`) 결과를 확인할 최소한의 틈만 두고 이어간다.
 */
const AUTO_SPIN_INTERVAL_MS = 600

/** 오토스핀이 고를 수 있는 회수 — UI(GameScreen)와 공유한다. 무제한은 제공하지 않는다. */
export const AUTO_SPIN_COUNTS = [10, 25, 50, 100] as const
export type AutoSpinCount = (typeof AUTO_SPIN_COUNTS)[number]

/**
 * 프리스핀에 막 진입한 첫 판은, 예약해 둔 자동 스핀을 곧장 타이머로 돌리지 않고 여기 잠깐
 * 담아둔다 — GameScreen이 렌더러의 modeTransition(to:'freeSpins', phase:'end') 이벤트를 받아
 * releaseFreeSpinsEntryGate()를 부르면 그때 실제로 예약된다. 렌더러가 그 이벤트를 아직
 * 못 보내는(또는 지원하지 않는) 경우엔 플레이어가 FREE SPIN 버튼을 직접 눌러 진행할 수 있다.
 *
 * `renderer.setMode()`(커튼 전환의 방아쇠)는 이제 spinTo/showWins가 다 끝난 뒤 finally에서만
 * 불린다 — 그러므로 modeTransition('end')은 항상 finally가 이 값을 세운 **뒤에** 도착한다
 * (예전처럼 finally보다 먼저 도착하는 경우는 이제 구조적으로 없다).
 */
let pendingAutoSpinRelease: (() => void) | null = null

/**
 * 프리스핀이 끝난 뒤 오토스핀을 다시 이어가기 위해 미뤄 둔 예약. 종료 커튼(modeTransition
 * to:'base')이 화면을 덮고 있는 동안 다음 판이 돌면 안 되므로, GameScreen이 커튼이 다 걷힌
 * 시점(phase:'end')에 `resumeAutoSpin()`을 불러 실제로 예약을 건다.
 */
let pendingAutoSpinResume: (() => void) | null = null

/** 예약돼 있던 다음 자동 스핀 타이머만 거둬들인다(어떤 게이트도 건드리지 않는다). */
function clearScheduledSpin(): void {
  if (autoSpinTimeoutId !== null) {
    clearTimeout(autoSpinTimeoutId)
    autoSpinTimeoutId = null
  }
  autoSpinTimeoutOwner = null
}

function cancelAutoSpin(): void {
  clearScheduledSpin()
  pendingAutoSpinRelease = null
  pendingAutoSpinResume = null
}

/** 지금 진행 중인 spinTo() 손잡이 — 탭/스페이스로 "결과로 건너뛰기"를 할 때 이걸 통해 skip()한다. */
let currentSpinHandle: SpinToHandle | null = null
/**
 * 서버 결과가 아직 안 와서(= spinTo가 아직 시작 안 돼서) 건너뛸 손잡이가 없을 때 눌린 건너뛰기 요청.
 * spinTo가 막 시작되는 순간 이 플래그를 보고 즉시 skip()한다.
 */
let skipRequested = false

/**
 * 게임 화면이 렌더러(@tgslot/renderer)를 만든 뒤 store에 등록하는 최소 인터페이스.
 * store는 렌더러 패키지를 직접 import하지 않아 테스트에서 가짜 객체로 쉽게 대체할 수 있다.
 */
/**
 * spinTo()가 돌려주는 손잡이의 최소 형태 — thenable(그대로 await 가능)이고, 선택적으로 skip()을 가진다.
 * 렌더러가 아직 skip을 지원하지 않는 버전이면(구버전/테스트 목) skip이 없을 수 있으므로 optional이다 —
 * 그 경우 store는 조용히 무시한다(팀리드 지시 폴백).
 */
export interface SpinToHandle extends PromiseLike<void> {
  /** 남은 회전을 접고 곧장 정지 위치로 붙인다. 지원하지 않는 렌더러에서는 없을 수 있다. */
  skip?(): void
}

export interface SpinRenderer {
  /**
   * fast를 주면(프리스핀 중) 릴 회전을 짧게 줄인다.
   * gridBefore/mutations를 주면(뮤테이션이 있는 게임) 릴이 멈춘 뒤 미스터리 공개·와일드 확장 등의
   * 연출을 이어서 재생한 다음에야 손잡이가 resolve된다 — 승리 연출은 항상 그 뒤에 시작된다.
   * (건너뛰기는 지금 어느 단계에 있든 렌더러의 skip()이 알아서 처리한다 — store는 몰라도 된다.)
   */
  spinTo(
    stops: number[],
    options?: { durationMs?: number; stagger?: number; fast?: boolean; gridBefore?: string[][]; mutations?: MutationEvent[] },
  ): SpinToHandle
  /**
   * totalBet을 주면 렌더러가 winTotal 이벤트의 등급(tier)을 라인 배수 추정 없이 정확히 계산한다.
   * features를 주면 프리스핀 진입/재발동 등을 연출 중 알맞은 시점에 featureTriggered 이벤트로 알려준다.
   * (formatLineLabel은 폐기됐다 — 릴 위 라인 명판이 사라졌고, 문구는 GameScreen이 winLine/winCycle
   * 이벤트를 받아 WinStrip에 직접 그린다. 더 이상 여기서 넘기지 않는다.)
   */
  showWins(
    wins: WinLine[],
    options?: {
      loop?: boolean
      /** 'brief'면 라인별 순차(B단계) 없이 전체 표시만 짧게 1회 — 오토스핀용. */
      presentation?: 'full' | 'brief'
      totalBet?: number
      features?: FeatureTrigger[]
    },
  ): Promise<void>
  /** 프리스핀 진입/종료 시 배경·프레임 등 시각 모드를 전환한다. `null`로 되돌리면 평소 모드다. */
  setMode?(mode: { freeSpins?: { left: number; total: number; multiplier: number } | null }): void
  /**
   * 보고 있던 승리 연출 바퀴를 곧장 접는다(showWins의 약속을 그 자리에서 resolve시킨다). 순환
   * 자체는 멈추지 않는다 — SPIN 버튼/스페이스로 "연출 스킵 + 즉시 다음 스핀"을 할 때 GameScreen이
   * 이걸 부른다(handleSkipWinsAndAdvance).
   */
  skipWins?(): void
  /** 승리 라인 순환 연출을 완전히 멈추고 화면에서 걷어낸다. store가 reset()/게임 이탈 시 부른다. */
  clearWins?(): void
  /** 이후 스핀의 릴 속도 프로파일을 바꾼다. 돌고 있는 스핀은 건드리지 않는다. */
  setSpinSpeed?(speed: 'normal' | 'quick' | 'turbo'): void
}

/** FreeSpinsState(허브/서버 형태)를 렌더러의 setMode가 받는 최소 형태로 줄인다. GameScreen도 재사용한다. */
export function toRendererFreeSpinsMode(
  freeSpins: FreeSpinsState | null,
): { left: number; total: number; multiplier: number } | null {
  if (!freeSpins) return null
  return { left: freeSpins.left, total: freeSpins.total, multiplier: freeSpins.multiplier }
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

/**
 * spinTo()에 넘길 옵션을 만든다 — 아무것도 특별한 게 없으면(프리스핀도 아니고 gridBefore/mutations도
 * 없으면) `undefined`를 돌려준다(기존 테스트/렌더러 호출부가 기대하는 "옵션 없음" 그대로).
 */
function buildSpinToOptions(
  result: SpinResponse,
): { fast?: boolean; gridBefore?: string[][]; mutations?: MutationEvent[] } | undefined {
  const hasGridBefore = result.gridBefore !== undefined
  const hasMutations = result.mutations.length > 0
  if (!result.isFreeSpin && !hasGridBefore && !hasMutations) return undefined

  const options: { fast?: boolean; gridBefore?: string[][]; mutations?: MutationEvent[] } = {}
  if (result.isFreeSpin) options.fast = true
  if (hasGridBefore) options.gridBefore = result.gridBefore
  if (hasMutations) options.mutations = result.mutations
  return options
}

function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `spin-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

/**
 * 진행 중인 더블업(갬블) 세션 — 스핀 한 번의 당첨을 두 배로 걸 수 있는 동안만 존재한다.
 * `pendingWin`은 항상 서버가 마지막으로 알려준 값을 그대로 들고 있는다(클라이언트가 스스로
 * 계산하지 않는다). `stepsLeft`가 0이 되거나 지면(lose) 세션이 사라진다.
 */
export interface GambleSession {
  roundId: string
  pendingWin: number
  stepsLeft: number
  maxSteps: number
  /**
   * 이 시각(ISO 8601)이 지나면 서버가 자동으로 회수한다. 스핀 응답의 gambleOffer와
   * GET /games/:id/state로 이어받은 세션 둘 다 이 값을 준다 — 다만 옛 라운드를 이어받을 때는
   * (이 필드가 생기기 전 세션) 없을 수 있어 그때만 null이다.
   */
  expiresAt: string | null
}

/** GET /games/:id/state가 돌려준 GambleState(서버 저장 형태)를 store의 GambleSession으로 바꾼다. */
function toGambleSession(gambleState: GambleState | null): GambleSession | null {
  if (!gambleState) return null
  return {
    roundId: gambleState.roundId,
    pendingWin: gambleState.pendingWin,
    stepsLeft: gambleState.maxSteps - gambleState.steps.length,
    maxSteps: gambleState.maxSteps,
    expiresAt: gambleState.expiresAt ?? null,
  }
}

/**
 * 스핀 한 판의 개발용 타이밍 계측(디버그 패널 전용) — 요청 왕복, 릴이 멈춘 뒤 승리 연출이
 * 시작하기까지, 그리고 첫 순환(showWins의 첫 바퀴) 길이. 렌더러가 없거나 이번 스핀에 승리
 * 연출이 없었으면 뒤 두 값은 null이다.
 */
export interface SpinTiming {
  requestMs: number
  reelStopToWinStartMs: number | null
  firstPassMs: number | null
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
  /** 진행 중인 프리스핀. null이면 없음. load() 시 서버에서 이어받고, 매 spin() 응답으로 갱신된다. */
  freeSpins: FreeSpinsState | null
  /** 진행 중인 더블업. null이면 없음. load() 시 서버에서 이어받고, 스핀 응답의 gambleOffer로 새로 생긴다. */
  gambleSession: GambleSession | null
  /**
   * 진행 중인 오토스핀. null이면 꺼져 있다. `remaining`은 아직 돌지 않은 유료 판의 수 —
   * 지금 돌고 있는 판은 끝날 때 하나 깎이고, 0이 되면 스스로 꺼진다(=null).
   * 프리스핀 중에 도는 판은 서버가 공짜로 주는 것이므로 이 카운터를 소모하지 않는다.
   */
  autoSpin: { remaining: number } | null
  /** 실패한(또는 진행 중인) 더블업 한 판의 idempotencyKey. 재시도 시 재사용한다(spin과 같은 패턴). */
  gambleIdempotencyKey: string | null
  /**
   * 디버그 패널에서 고른, 다음 한 판에만 적용할 결과 프리셋. 원샷이다 — spin()이 요청을
   * 만들자마자(성공/실패와 무관하게) null로 되돌린다.
   */
  debugPreset: DebugPreset | null
  /** 디버그 프리셋 요청이 거절됐을 때(DEBUG_DISABLED/DEBUG_NO_MATCH) 비차단으로 보여줄 메시지. */
  debugMessage: { code: string; message: string } | null
  /** 마지막 스핀의 개발용 타이밍(디버그 패널). */
  lastSpinTiming: SpinTiming | null
  /** 마지막 스핀 응답의 debug 필드(어떤 프리셋이 적용됐고 몇 번 만에 맞았는지). 계약 미착륙 시 null. */
  lastSpinDebug: SpinDebugResponse | null
}

export interface GameActions {
  load: (gameId: string) => Promise<void>
  setBet: (index: number) => void
  setRenderer: (renderer: SpinRenderer | null) => void
  spin: () => Promise<void>
  /**
   * 스핀 연출 중(phase === 'spinning') 탭/스페이스로 "결과로 건너뛰기"를 요청한다.
   * 이미 spinTo 손잡이가 있으면 바로 skip()하고, 서버 결과가 아직 안 왔으면 플래그만 세워
   * spinTo가 시작되는 즉시 skip()되게 한다. spinning이 아니면 아무 일도 하지 않는다.
   */
  requestSkip: () => void
  /**
   * 프리스핀 진입 첫 판의 자동 스핀 예약을 실제로 건다. GameScreen이 렌더러의
   * modeTransition(to:'freeSpins', phase:'end')을 받으면 부른다. 미뤄둔 게 없으면 아무 일도 안 한다.
   */
  releaseFreeSpinsEntryGate: () => void
  /**
   * 오토스핀을 `count`판만큼 무장하고, 지금 바로 돌 수 있는 상태면(idle, 프리스핀 아님) 첫 판을
   * 곧장 시작한다. 이미 스핀 중이면 예약만 해두고 그 판이 끝나는 대로 이어진다.
   */
  startAutoSpin: (count: number) => void
  /**
   * 오토스핀을 멈춘다 — 지금 돌고 있는 판은 그대로 끝나고, 예약돼 있던 다음 판만 거둬들인다
   * (업계 관행 "이번 스핀만 마치고 중단"). 프리스핀 자동진행이 걸어 둔 예약은 건드리지 않는다.
   */
  stopAutoSpin: () => void
  /**
   * 프리스핀 종료 커튼이 다 걷힌 뒤(modeTransition to:'base', phase:'end') GameScreen이 불러
   * 미뤄 둔 오토스핀 재개 예약을 실제로 건다. 미뤄둔 게 없으면 아무 일도 하지 않는다.
   */
  resumeAutoSpin: () => void
  /**
   * 더블업 한 판. pick(heads/tails)이 서버가 실제로 뒤집은 면과 같으면 2배, 다르면 0 — 클라이언트는
   * 절대 스스로 계산하지 않고 서버 응답을 그대로 반영한다. 진행 중인 세션이 없으면 아무 일도 안 한다.
   */
  gamble: (pick: GambleSide) => Promise<GambleResponse | null>
  /** 지금까지 걸려 있는 더블업 당첨금을 챙기고 세션을 끝낸다. 진행 중인 세션이 없으면 아무 일도 안 한다. */
  collectGamble: () => Promise<void>
  /**
   * 더블업 제안이 로컬 시계로 만료된 것 같을 때 부른다. 서버는 GET /games/:id/state를 "읽기만
   * 해도" 그 자리에서 만료된 세션을 회수한다(POST 필요 없음) — 그 응답으로 세션을 다시 맞추고,
   * 상태 응답엔 지갑이 없으므로 세션이 사라졌을 때만 /me를 따로 물어 잔액을 갱신한다.
   */
  syncGambleExpiry: () => Promise<void>
  /** INSUFFICIENT_FUNDS 시트 등 에러 표시를 닫고 idle로 되돌린다 */
  dismissError: () => void
  /** 디버그 패널의 프리셋 버튼이 부른다. null을 주면 무장 해제(예: 취소 버튼). */
  setDebugPreset: (preset: DebugPreset | null) => void
  /** DEBUG_DISABLED/DEBUG_NO_MATCH 비차단 메시지를 닫는다. */
  dismissDebugMessage: () => void
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
  freeSpins: null,
  gambleSession: null,
  autoSpin: null,
  debugPreset: null,
  debugMessage: null,
  lastSpinTiming: null,
  lastSpinDebug: null,
  gambleIdempotencyKey: null,
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

      // 진행 중인 프리스핀/더블업 재개 — 화면을 나갔다 돌아오거나 새로고침해도 서버에 남은 상태를
      // 그대로 잇는다. 실패해도(네트워크 등) 게임 자체는 계속 플레이할 수 있어야 하므로 감싸 무시한다.
      const token = useSessionStore.getState().token
      if (token) {
        try {
          const state = await getGameState(token, gameId)
          const gambleSession = toGambleSession(state.state.gamble)
          if (get().gameId === gameId) set({ freeSpins: state.freeSpins, gambleSession })
        } catch (stateErr) {
          console.error('[game] failed to resume free spins/gamble state', stateErr)
        }
      }
    } catch (err) {
      if (get().gameId !== gameId) return
      const message = err instanceof ApiClientError ? err.message : '게임을 불러오지 못했습니다'
      const code = err instanceof ApiClientError ? (err.code ?? null) : null
      set({ phase: 'error', error: message, errorCode: code })
    }
  },

  setBet(index) {
    const { math, gameId, phase, freeSpins } = get()
    if (!math || !gameId) return
    if (phase === 'spinning' || phase === 'showingWin') return
    // 프리스핀 중에는 진입 시 고정된 베팅액을 그대로 써야 한다 — 셀렉터가 잠긴다.
    if (freeSpins) return
    if (index < 0 || index >= math.betLevels.length) return
    // 남아있던 idempotencyKey는 실패했던 스핀의 totalBet과 묶여 있다 — 베팅을 바꾼 뒤에도 그
    // 키를 재사용하면 서버가 "같은 요청"으로 오인해 다른 금액으로 재생될 수 있으므로 버린다.
    set({ betIndex: index, idempotencyKey: null })
    writeStoredBetIndex(gameId, index)
  },

  setRenderer(renderer) {
    set({ renderer })
  },

  async spin() {
    // 이번 스핀이 수동이든(탭해서 속도 올리기) 방금 예약된 자동 프리스핀이든, 대기 중이던 다음
    // 자동 스핀 타이머는 취소한다 — 안 그러면 나중에 중복으로 또 스핀이 걸린다.
    cancelAutoSpin()

    const { gameId, math, betIndex, phase, renderer, freeSpins, debugPreset } = get()
    if (!gameId || !math) return
    if (phase === 'spinning' || phase === 'showingWin') return

    const token = useSessionStore.getState().token
    if (!token) {
      get().stopAutoSpin()
      set({ phase: 'error', error: '로그인이 필요합니다', errorCode: 'unauthorized' })
      return
    }

    // 프리스핀 중에는 진입 시 서버에 고정된 베팅액을 그대로 쓴다 — 셀렉터가 잠겨 있는 것과 짝을 이룬다.
    const totalBet = freeSpins ? freeSpins.totalBet : math.betLevels[betIndex]
    if (totalBet === undefined) return

    // 여기서부터는 이번 스핀이 실제로 시작된다 — 이전 스핀에서 남은 건너뛰기 손잡이/요청은 무효화한다.
    currentSpinHandle = null
    skipRequested = false

    // 이전 실패에서 남은 키가 있으면 재사용한다 — 서버가 idempotencyKey로 재전송을 판별한다.
    const idempotencyKey = get().idempotencyKey ?? newIdempotencyKey()
    // 새 스핀을 시작하면 이전 승리 배너부터 지운다 — 다음 결과가 나올 때까지 화면에 남아있으면 안 된다.
    // 걸려 있던 더블업도 여기서 로컬 상태만 지운다 — 별도로 collectGamble()을 먼저 불러 왕복하지
    // 않는다. 서버가 스핀 처리 안에서 베팅 잔액 확인보다 먼저 알아서 에스크로를 돌려주므로, 스핀
    // 응답의 wallet이 이미 그 회수분을 포함한 최종값이다(서버 권위 원칙 — 클라이언트가 미리 나서서
    // 두 번째 네트워크 왕복을 만들 필요가 없다).
    set({
      phase: 'spinning',
      idempotencyKey,
      error: null,
      errorCode: null,
      lastResult: null,
      gambleSession: null,
      gambleIdempotencyKey: null,
      // 디버그 프리셋은 원샷 — 요청을 만드는 이 시점에 바로 지운다(성공/실패와 무관하게 다음
      // 스핀에 새어 들어가면 안 된다). 남은 비차단 디버그 메시지도 새 스핀에서는 지운다.
      debugPreset: null,
      debugMessage: null,
    })

    const requestBody: SpinRequest = { totalBet, idempotencyKey }
    // preset이 무장돼 있으면 이번 요청에만 실어 보낸다 — maxTries는 서버 기본값을 그대로 쓴다.
    if (debugPreset) requestBody.debug = { preset: debugPreset, maxTries: 5000 }

    const requestStartedAt = Date.now()
    let result: SpinResponse
    try {
      result = await apiSpin(token, gameId, requestBody)
    } catch (err) {
      // 스핀이 어떤 이유로든 실패하면 오토스핀은 그 자리에서 멈춘다 — 잔액 부족(INSUFFICIENT_FUNDS)/
      // 베팅 잠금(BET_LOCKED)처럼 다음 판도 똑같이 실패할 이유가 대부분이고, 실패를 계속 반복하며
      // 요청을 쏟아내면 안 된다. 비차단 안내는 아래 각 분기가 평소대로 그대로 띄운다.
      get().stopAutoSpin()

      if (get().gameId !== gameId) return

      // 디버그 프리셋 요청이 거절된 경우 — 비차단 메시지만 남기고 화면은 그대로 idle로 되돌린다.
      // 재시도는 하지 않는다(프리셋은 이미 원샷으로 소비됐다).
      if (err instanceof ApiClientError && (err.code === 'DEBUG_DISABLED' || err.code === 'DEBUG_NO_MATCH')) {
        set({
          phase: 'idle',
          idempotencyKey: null,
          debugMessage: { code: err.code, message: err.message },
        })
        return
      }

      if (err instanceof ApiClientError && err.code === 'INSUFFICIENT_FUNDS') {
        set({ phase: 'error', error: err.message, errorCode: 'INSUFFICIENT_FUNDS', idempotencyKey: null })
        return
      }

      // 레벨이 해금한 베팅 상한을 넘겨 시도한 경우 — 화면을 막지 않고 셀렉터를 상한으로 내려준다.
      if (err instanceof ApiClientError && err.code === 'BET_LOCKED') {
        // 게임 화면에 바로 진입한 경로 등 levelInfo가 아직 없을 수 있으므로 클램프 전에 채워둔다.
        if (useHubStore.getState().levelInfo === null) {
          await useHubStore.getState().refreshLevelInfo()
        }
        if (get().gameId !== gameId) return

        const maxBet = useHubStore.getState().levelInfo?.maxBet
        let clampedIndex = betIndex
        if (maxBet !== undefined) {
          const validIndex = math.betLevels.reduce(
            (best, level, idx) => (level <= maxBet ? idx : best),
            -1,
          )
          if (validIndex >= 0) clampedIndex = validIndex
        }
        writeStoredBetIndex(gameId, clampedIndex)
        set({
          phase: 'idle',
          error: err.message,
          errorCode: 'BET_LOCKED',
          betIndex: clampedIndex,
          idempotencyKey: null,
        })
        return
      }

      // 401/404 USER_NOT_FOUND(오래된 토큰)는 여기 도달하지 않는다 — sdk/api.ts의 authedFetch가
      // 그 안에서 이미 재인증하고 같은 idempotencyKey(body)로 한 번 재시도한 뒤 결과를 돌려준다.
      // 재인증까지 실패했을 때만 그 에러가 여기로 온다 — 아래 retryable 조건에 안 걸리므로
      // idempotencyKey는 버려진다(다음 로그인 뒤 새 키로 시작). 재인증 성공 후 재시도가 또 실패한
      // 경우(예: 새 유저 지갑 부족)는 위의 INSUFFICIENT_FUNDS/BET_LOCKED 분기가 이미 처리한다.
      //
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

      // invalid_response — 서버는 200을 줬는데 우리 스키마와 안 맞았을 뿐이라, 스핀 자체는 서버에
      // 이미 반영됐을 수 있다(예: 프리스핀이 실제로는 끝났는데 클라이언트는 계속 진행 중인 줄
      // 안다). 비차단 에러 안내(위 set)는 그대로 두고, 조용히 GET /state·/me로 다시 맞춘다 —
      // 실패해도(네트워크 등) 화면은 이미 idle이니 추가로 막을 건 없다.
      if (code === 'invalid_response') {
        const resyncToken = useSessionStore.getState().token
        if (resyncToken) {
          try {
            const state = await getGameState(resyncToken, gameId)
            if (get().gameId === gameId) {
              set({ freeSpins: state.freeSpins, gambleSession: toGambleSession(state.state.gamble) })
            }
          } catch (stateErr) {
            console.error('[game] failed to resync state after invalid_response', stateErr)
          }
          // refreshMe()는 실패를 스스로 삼킨다(refreshError만 세팅) — 여기서 또 감쌀 필요 없다.
          await useSessionStore.getState().refreshMe()
        }
      }
      return
    }

    // 디버그 패널용 타이밍 — 요청 왕복은 응답을 받은 지금 이미 확정됐다. 나머지 두 값(릴 정지→승리
    // 시작, 첫 순환 길이)은 아래 연출 흐름을 지나며 채운다.
    const timing: SpinTiming = {
      requestMs: Date.now() - requestStartedAt,
      reelStopToWinStartMs: null,
      firstPassMs: null,
    }

    // 서버 잔액을 가드보다도 먼저 즉시 반영한다 — 이후 렌더러가 실패하거나(throw) 화면을 벗어나도
    // 이미 확정된 권위 있는 잔액이 유실되지 않게 한다.
    useSessionStore.setState({ wallet: result.wallet })

    // 허브 스토어(잭팟 풀/미션 진행도/레벨 xp)도 다음 폴링을 기다리지 않고 즉시 반영한다.
    useHubStore.getState().setJackpotPool(result.jackpot)
    if (result.missions && result.missions.length > 0) {
      useHubStore.getState().setMissions(result.missions)
    }
    // xp는 누적 베팅액이므로 매 스핀마다 로컬로 즉시 반영해 레벨 바가 부드럽게 채워지게 한다.
    // levelUp에는 from/to/bonus만 있고 새 xp/maxBet은 없으므로, 레벨이 오른 스핀은 /me로 확정값을 덮어쓴다.
    useHubStore.getState().addXp(result.totalBet)
    if (result.levelUp) {
      void useHubStore.getState().refreshLevelInfo()
    }

    if (get().gameId !== gameId) return

    // 프리스핀 상태는 이 스핀이 프리스핀을 새로 시작/재발동했든, 계속 진행 중이든, 방금 끝났든
    // 서버 응답이 유일한 출처다 — 클라이언트는 카운트다운을 스스로 계산하지 않는다.
    // 더블업도 마찬가지 — gambleOffer가 있으면 이번 스핀 당첨을 걸 수 있는 새 세션이 시작된다.
    const gambleSession: GambleSession | null = result.gambleOffer
      ? {
          roundId: result.roundId,
          pendingWin: result.gambleOffer.pendingWin,
          stepsLeft: result.gambleOffer.maxSteps,
          maxSteps: result.gambleOffer.maxSteps,
          expiresAt: result.gambleOffer.expiresAt,
        }
      : null
    set({
      lastResult: result,
      idempotencyKey: null,
      freeSpins: result.freeSpins,
      gambleSession,
      // 이번 스핀이 디버그 프리셋으로 강제됐을 때만 서버가 실어 보낸다(같은 idempotencyKey로
      // 재전송된 응답에는 안 실린다) — 그 외에는 항상 null이다.
      lastSpinDebug: result.debug ?? null,
    })
    // 시각 모드 전환(커튼)은 여기서 곧장 걸지 않는다 — 릴 회전·뮤테이션·승리 연출이 다 끝난
    // 뒤에야 건다(아래 finally). 결과가 화면에 다 드러나기도 전에 배경부터 바뀌면 인과가
    // 뒤집힌다(스캐터가 보이기도 전에 프리스핀 복장이 되는 문제). store 상태(freeSpins)는
    // 베팅 잠금/FREE SPIN 버튼 표시 등을 위해 여기서 즉시 맞춘다 — 렌더러 쪽 커튼만 미룬다.

    try {
      let reelStopAt: number | null = null
      if (renderer) {
        // spinTo가 돌려주는 손잡이를 모듈 스코프에 잡아둔다 — 탭/스페이스로 건너뛰기를 하면
        // requestSkip()이 이 손잡이의 skip()을 부른다. 결과를 기다리는 동안(=이 handle이 생기기
        // 전에) 이미 건너뛰기가 눌려 있었다면(skipRequested) 시작하자마자 바로 skip()한다.
        // gridBefore/mutations를 함께 넘기면(뮤테이션이 있는 게임) 렌더러가 리빌 연출까지 재생한
        // 뒤에야 이 손잡이가 resolve된다 — 승리 연출은 항상 그 다음이다(아래 흐름 그대로).
        const handle = renderer.spinTo(result.stops, buildSpinToOptions(result))
        currentSpinHandle = handle
        if (skipRequested) {
          skipRequested = false
          handle.skip?.()
        }
        await handle
        currentSpinHandle = null
        reelStopAt = Date.now()
      }

      // wins가 없어도 features(예: 스캐터 3개로 프리스핀 진입, 배당은 0)만 있을 수 있으므로
      // 어느 한쪽이라도 있으면 연출을 돌려 featureTriggered 이벤트가 나갈 기회를 준다.
      if (result.wins.length > 0 || result.features.length > 0) {
        set({ phase: 'showingWin' })
        if (renderer) {
          // formatLineLabel은 폐기됐다(렌더러가 더 이상 릴 위에 라인 명판을 그리지 않는다) —
          // "어떤 심볼이 얼마를 땄는지"는 이제 렌더러의 winLine/winCycle 이벤트를 받아 GameScreen이
          // WinStrip에 직접 그린다(winLineLabel은 그쪽에서 쓴다). 여기서는 더 이상 넘기지 않는다.
          const winStartAt = Date.now()
          timing.reelStopToWinStartMs = reelStopAt !== null ? winStartAt - reelStopAt : null
          await renderer.showWins(result.wins, {
            totalBet: result.totalBet,
            features: result.features,
            // 오토스핀 중에는 라인별 순차(B단계)를 통째로 건너뛰고 전체 표시만 짧게 1회 보여준다 —
            // `loop:false`만으로는 첫 바퀴(라인당 1.9초)가 그대로 재생돼 판 간격이 8~14초까지
            // 벌어졌다. 수동 플레이는 평소처럼 full + 순환이다(옵션 자체를 넘기지 않는다).
            ...(get().autoSpin ? { presentation: 'brief' as const } : {}),
          })
          timing.firstPassMs = Date.now() - winStartAt
        }
      }
    } catch (err) {
      // 연출 실패는 서버 권위 결과에 영향을 주지 않는다 — 원인만 남기고 아래 finally가 phase를 회복시킨다.
      console.error('[game] renderer playback failed', err)
    } finally {
      currentSpinHandle = null
      if (get().gameId === gameId) {
        set({ phase: 'idle', lastSpinTiming: timing })

        // 시각 모드 전환(커튼) — 스핀/뮤테이션/승리 연출이 다 끝난 지금에서야 건다. 전환 방향은
        // 스핀 시작 "전"의 모드(위쪽 `freeSpins` 스냅샷)와 이번 응답의 `result.freeSpins` 유무를
        // 비교해 정해지는데, 그 비교는 renderer.setMode() 안(modeTransitionTarget)에서 렌더러가
        // 자신의 마지막 모드와 대조해 스스로 판단한다 — 같은 모드면(남은 횟수만 바뀐 재발동 등)
        // 알아서 건너뛰어 매 프리스핀 스핀마다 커튼이 뜨지 않는다.
        renderer?.setMode?.({ freeSpins: toRendererFreeSpinsMode(result.freeSpins) })

        // 오토스핀 카운터 — 이번 판이 "유료" 판일 때만 하나 깎는다(프리스핀 중에 도는 판은 서버가
        // 공짜로 주는 것이라 오토스핀의 몫에서 빼지 않는다). 0이 되면 스스로 꺼진다.
        const armedBefore = get().autoSpin
        if (armedBefore && freeSpins === null) {
          const left = Math.max(0, armedBefore.remaining - 1)
          set({ autoSpin: left > 0 ? { remaining: left } : null })
        }

        // 프리스핀이 남아 있으면 승리 연출(과 필요하면 방금 건 커튼)이 끝난 뒤 잠시 쉬었다
        // 자동으로 다음 판을 돌린다. 사용자가 그 사이 SPIN을 탭하면 위쪽의 cancelAutoSpin()이
        // 이 타이머를 지우고 즉시 진행된다.
        const remaining = get().freeSpins
        if (remaining && remaining.left > 0) {
          const scheduleAutoSpin = (): void => {
            autoSpinTimeoutOwner = 'freeSpins'
            autoSpinTimeoutId = setTimeout(() => {
              autoSpinTimeoutId = null
              autoSpinTimeoutOwner = null
              void get().spin()
            }, AUTO_SPIN_DELAY_MS)
          }
          // freeSpins가 이번 스핀 "전"에는 없다가(=위의 pre-spin 스냅샷) 결과로 새로 생겼다면
          // 프리스핀 첫 진입이다 — 방금 건 커튼 전환이 끝날 때까지(modeTransition to:'freeSpins',
          // phase:'end') 예약을 미룬다. releaseFreeSpinsEntryGate()가 그 신호를 받으면 실제로
          // 예약을 건다. 커튼은 방금(바로 위) 걸었으므로 'end'는 구조적으로 항상 이 지점보다
          // 나중에 온다 — 예전처럼 먼저 도착하는 경우를 따로 다룰 필요가 없다. 이미 진행 중이던
          // (재발동 포함) 프리스핀이면 커튼이 없으므로 곧장 예약한다.
          const enteringFreeSpins = freeSpins === null
          if (enteringFreeSpins) {
            pendingAutoSpinRelease = scheduleAutoSpin
          } else {
            scheduleAutoSpin()
          }
          // 프리스핀이 도는 동안 오토스핀은 쉰다 — 그 루프의 주인은 위 자동진행이고, 오토스핀은
          // 카운터를 그대로 든 채 프리스핀이 끝나면(아래 else 가지) 이어받는다.
        } else {
          // 오토스핀 — 프리스핀이 돌고 있지 않을 때만 다음 판을 예약한다.
          const armed = get().autoSpin
          const nextBet = math.betLevels[get().betIndex]
          const coins = useSessionStore.getState().wallet?.coins ?? 0

          if (armed && (nextBet === undefined || coins < nextBet)) {
            // 다음 판 베팅을 감당할 수 없으면 여기서 멈춘다(정지 조건 3) — 어차피 서버가
            // INSUFFICIENT_FUNDS로 거절할 판을 굳이 한 번 더 던지지 않는다.
            get().stopAutoSpin()
          } else if (armed) {
            const scheduleNext = (): void => {
              autoSpinTimeoutOwner = 'autoSpin'
              autoSpinTimeoutId = setTimeout(() => {
                autoSpinTimeoutId = null
                autoSpinTimeoutOwner = null
                void get().spin()
              }, AUTO_SPIN_INTERVAL_MS)
            }

            // 방금 프리스핀이 끝난 판이면 종료 커튼이 다 걷힐 때까지(modeTransition to:'base',
            // phase:'end' → resumeAutoSpin()) 예약을 미룬다 — 커튼이 화면을 덮은 채로 다음 판이
            // 돌면 릴과 배경이 어긋나 보인다. 렌더러가 아예 없으면 그 이벤트가 영영 오지 않으므로
            // 곧장 예약해 폴백한다.
            const exitingFreeSpins =
              freeSpins !== null && (result.freeSpins === null || result.freeSpins.left <= 0)
            if (exitingFreeSpins && renderer) {
              pendingAutoSpinResume = scheduleNext
            } else {
              scheduleNext()
            }
          }
        }
      }
    }
  },

  releaseFreeSpinsEntryGate() {
    // renderer.setMode()는 이제 spin()의 finally 안에서만 불리므로, 이 이벤트('end')는 항상
    // finally가 pendingAutoSpinRelease를 세운 뒤에 도착한다 — 예전처럼 더 일찍 도착해 놓칠 걱정이
    // 구조적으로 없다. 미뤄 둔 게 없으면(재발동/커튼 없음/렌더러 없음 등) 조용히 아무 일도 안 한다.
    if (pendingAutoSpinRelease) {
      const release = pendingAutoSpinRelease
      pendingAutoSpinRelease = null
      release()
    }
  },

  startAutoSpin(count) {
    if (!Number.isFinite(count) || count <= 0) return
    const { phase, freeSpins } = get()
    if (phase === 'loading' || phase === 'error') return

    set({ autoSpin: { remaining: Math.floor(count) } })

    // 프리스핀이 돌고 있으면 그 루프가 주인이다 — 오토스핀은 카운터만 들고 기다렸다가 끝난 뒤
    // 이어받는다. 스핀/승리 연출 중이면 그 판의 finally가 다음 판을 알아서 예약한다.
    if (freeSpins) return
    if (phase === 'idle') void get().spin()
  },

  stopAutoSpin() {
    // 지금 돌고 있는 판은 그대로 마치게 두고, 오토스핀이 걸어 둔 다음 판 예약만 거둬들인다.
    // 프리스핀 자동진행이 걸어 둔 타이머는 주인이 다르므로 건드리지 않는다.
    if (autoSpinTimeoutOwner === 'autoSpin') clearScheduledSpin()
    pendingAutoSpinResume = null
    if (get().autoSpin !== null) set({ autoSpin: null })
  },

  resumeAutoSpin() {
    if (pendingAutoSpinResume) {
      const resume = pendingAutoSpinResume
      pendingAutoSpinResume = null
      resume()
    }
  },

  async gamble(pick) {
    const session = get().gambleSession
    const token = useSessionStore.getState().token
    if (!session || !token) return null

    // 이전 시도가 남긴 키가 있으면 재사용한다 — 성공한 뒤에만 다음 단계를 위해 새 키를 만든다.
    // 실패한 시도는(네트워크든 GAMBLE_IN_PROGRESS/GAMBLE_TIMEOUT이든, 그 외 미분류 오류든) 전부
    // 같은 키로 재시도한다 — 서버가 idempotencyKey로 재전송을 판별하므로 같은 시도를 두 번
    // 판정하지 않는다.
    const idempotencyKey = get().gambleIdempotencyKey ?? newIdempotencyKey()
    set({ gambleIdempotencyKey: idempotencyKey })

    let response: GambleResponse
    try {
      response = await apiGamble(token, session.roundId, pick, idempotencyKey)
    } catch (err) {
      // NOT_GAMBLEABLE — 서버엔 이미 세션이 없다(예: 만료로 자동 회수됨). 재시도할 대상 자체가
      // 없으므로 로컬 세션/키를 지우고 잔액을 다시 물어 화면을 서버와 맞춘다. 그 외 오류는(재시도
      // 가능한 것이든 미분류든) 세션도 키도 그대로 둬서 같은 픽을 같은 키로 다시 시도할 수 있게 한다.
      const code = err instanceof ApiClientError ? err.code : undefined
      if (code === 'NOT_GAMBLEABLE' && get().gambleSession?.roundId === session.roundId) {
        set({ gambleSession: null, gambleIdempotencyKey: null })
        void useSessionStore.getState().refreshMe()
      }
      throw err
    }
    set({ gambleIdempotencyKey: null })

    // 서버 응답이 유일한 권위 — 이겼는지/졌는지는 절대 클라이언트가 스스로 판정하지 않는다.
    // 대기 당첨금은 에스크로(지갑 밖에 잠긴 돈)라 서버가 돌려준 wallet에는 이미 반영돼 있다.
    useSessionStore.setState({ wallet: response.wallet })
    if (get().gambleSession?.roundId !== session.roundId) return response

    // 'collected'(만료 등으로 판정 없이 회수됨)나 'lose', 혹은 이겼어도 stepsLeft가 0이면(상한
    // 도달로 즉시 회수) 세션이 끝난 것이다 — 그 외(진행 중인 승리)만 세션을 이어간다.
    if (response.outcome !== 'win' || response.stepsLeft === 0) {
      set({ gambleSession: null })
    } else {
      set({
        gambleSession: {
          ...session,
          pendingWin: response.pendingWin,
          stepsLeft: response.stepsLeft,
          // 만료 시각은 단계마다 새로 밀린다 — 응답에 있으면 그 값으로 갱신하고(카운트다운도 새로
          // 시작), 없으면(옛 서버 등) 기존 값을 그대로 둔다.
          expiresAt: response.expiresAt ?? session.expiresAt,
        },
      })
    }
    return response
  },

  async collectGamble() {
    const session = get().gambleSession
    const token = useSessionStore.getState().token
    if (!session || !token) return

    try {
      const response = await apiCollectGamble(token, session.roundId)
      useSessionStore.setState({ wallet: response.wallet })
      if (get().gambleSession?.roundId === session.roundId) {
        set({ gambleSession: null, gambleIdempotencyKey: null })
      }
    } catch (err) {
      // NOT_GAMBLEABLE — 서버엔 이미 끝나 있던 세션이다(예: 만료로 이미 자동 회수됨). 로컬도
      // 지우고 잔액을 다시 물어 화면을 서버와 맞춘다.
      const code = err instanceof ApiClientError ? err.code : undefined
      if (code === 'NOT_GAMBLEABLE' && get().gambleSession?.roundId === session.roundId) {
        set({ gambleSession: null, gambleIdempotencyKey: null })
        void useSessionStore.getState().refreshMe()
      }
      throw err
    }
  },

  async syncGambleExpiry() {
    const { gameId, gambleSession } = get()
    const token = useSessionStore.getState().token
    if (!gameId || !token || !gambleSession) return

    try {
      const state = await getGameState(token, gameId)
      // 그 사이 다른 세션으로 넘어가 있었으면(다음 스핀 등) 이 응답으로 덮어쓰지 않는다.
      if (get().gambleSession?.roundId !== gambleSession.roundId) return
      const nextSession = toGambleSession(state.state.gamble)
      set({ gambleSession: nextSession })
      // 상태 응답엔 지갑이 없다 — 세션이 사라졌으면(=서버가 방금 회수했으면) /me로 잔액을 맞춘다.
      if (!nextSession) void useSessionStore.getState().refreshMe()
    } catch (err) {
      console.error('[game] gamble offer expiry sync failed', err)
    }
  },

  requestSkip() {
    if (get().phase !== 'spinning') return
    if (currentSpinHandle) {
      currentSpinHandle.skip?.()
    } else {
      // spinTo가 아직 시작 안 됐다(서버 결과 대기 중) — 시작되는 즉시 skip하도록 표시만 해둔다.
      skipRequested = true
    }
  },

  dismissError() {
    set({ phase: 'idle', error: null, errorCode: null })
  },

  setDebugPreset(preset) {
    set({ debugPreset: preset })
  },

  dismissDebugMessage() {
    set({ debugMessage: null })
  },

  reset() {
    // 게임 화면을 벗어나는데 예약된 자동 프리스핀/건너뛰기 요청이 남아있으면 안 된다.
    cancelAutoSpin()
    currentSpinHandle = null
    skipRequested = false
    // 진행 중이던 승리 연출 순환을 걷어낸다 — 안 그러면 다음에 이 게임에 다시 들어왔을 때(또는
    // 렌더러가 재사용되는 경우) 이전 라운드의 라인 하이라이트가 화면에 남아있을 수 있다.
    get().renderer?.clearWins?.()
    set(initialState)
  },
}))
