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
  CascadeStep,
  OrderRoundCarry,
  BoardBonusFeature,
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
import { debugMaxTries } from '../lib/debugPreset'
import { pickDefaultBetIndex, storedBetIndex } from '../lib/defaultBet'
import { exceedsLossLimit, type AutoSpinStopReason } from '../lib/autoSpinRules'
import { spinNetOf, usePlaySessionStore } from './playSession'
import { completedOrders, type CompletedOrder } from '../game/orders'
import { boardFeatureOf, saveBoardSnapshot } from '../game/boardPlayback'
import {
  ROUND_FLOW_IDLE,
  ROUND_POPUP_AUTO_CLOSE_MS,
  canStartSpin,
  ceremonyFor,
  roundFlowReducer,
  withForgePopup,
  withOrderPopup,
  withGardenPopup,
  winHoldMs,
  winPresentationMode,
  type RoundFlowEvent,
  type RoundFlowState,
} from '../game/roundFlow'
// celebrationTier/HURRIED_SCALE는 winTiers.ts(순수 등급 판정)의 것을 그대로 쓴다 — 일반 스핀의
// 빅윈 오버레이와 프리스핀 종료 팝업이 같은 배수에 같은 등급을 매겨야 하므로 여기서 새로 정하지
// 않는다. 이 모듈은 React/DOM에 기대지 않아 store에서 import해도 안전하다.
import { celebrationTier } from '../components/game/winTiers'
import { clearRespinReplay, hasCoinRespin, saveRespinReplay } from '../lib/respinReplay'
import { findFrostChain, frostHoldCoins, frostPlayInput } from '../game/frostFlow'
import {
  findRouletteFeature,
  rouletteRendererMode,
  sessionFromResult,
  type RouletteSession,
  type RouletteStage,
} from '../game/rouletteFlow'
import { clearRouletteCache, readRouletteCache, writeRouletteCache } from '../lib/rouletteResume'

/** SpinResponse.debug의 형태 — 어떤 프리셋이 실제로 적용됐고 몇 번 만에 그 결과를 찾았는지. */
type SpinDebugResponse = NonNullable<SpinResponse['debug']>

/** 진행 중인 오토스핀. lossLimit은 시작 잔액 대비 비율(null=제한 없음). */
export interface AutoSpinState {
  remaining: number
  startCoins: number
  /** 오토를 켠 뒤의 게임 손익(당첨+잭팟−베팅, 더블업 증감). 보너스는 넣지 않는다 — 손실 한도 판정용. */
  net: number
  lossLimit: number | null
  stopOnBigWin: boolean
}

export interface AutoSpinOptions {
  lossLimit?: number | null
  stopOnBigWin?: boolean
}

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

/** 오토스핀이 고를 수 있는 회수 — UI(GameScreen)와 공유한다. Infinity는 무제한(중지·프리스핀·잔액 부족 때만 멈춘다). */
export const AUTO_SPIN_COUNTS = [10, 25, 50, 100, Infinity] as const
export type AutoSpinCount = (typeof AUTO_SPIN_COUNTS)[number]

// 세리머니 팝업의 자동 닫힘 시간은 순수 모듈(roundFlow)이 소유한다 — 빅윈 오버레이의 결과
// 화면도 같은 값을 쓰고(winTiers의 bigWinTimeline), 그쪽이 store를 import할 수는 없기 때문이다.
// 여기서는 예전 import 경로를 그대로 살려 두기 위해 다시 내보내기만 한다.
export { ROUND_POPUP_AUTO_CLOSE_MS }
/** 위 자동 닫힘 타이머. 팝업이 떠 있는 동안에만 존재한다. */
let popupTimeoutId: ReturnType<typeof setTimeout> | null = null

/** 예약돼 있던 다음 자동 스핀 타이머만 거둬들인다(세리머니 상태는 건드리지 않는다). */
function clearScheduledSpin(): void {
  if (autoSpinTimeoutId !== null) {
    clearTimeout(autoSpinTimeoutId)
    autoSpinTimeoutId = null
  }
  autoSpinTimeoutOwner = null
}

function clearPopupTimeout(): void {
  if (popupTimeoutId !== null) {
    clearTimeout(popupTimeoutId)
    popupTimeoutId = null
  }
}

function cancelAutoSpin(): void {
  clearScheduledSpin()
}

/** 지금 진행 중인 spinTo() 손잡이 — 탭/스페이스로 "결과로 건너뛰기"를 할 때 이걸 통해 skip()한다. */
let currentSpinHandle: SpinToHandle | null = null
/**
 * 서버 결과가 아직 안 와서(= spinTo가 아직 시작 안 돼서) 건너뛸 손잡이가 없을 때 눌린 건너뛰기 요청.
 * spinTo가 막 시작되는 순간 이 플래그를 보고 즉시 skip()한다.
 */
let skipRequested = false

/**
 * 빅윈 오버레이 앞에 멈춰 서 있는 spin()을 다시 보내는 손잡이. 오버레이가 떠 있는 동안에만 있다.
 *
 * 오버레이는 릴이 멈춘 **직후·심볼 연출보다 먼저** 뜨고, 닫혀야 그 뒤가 이어진다(사용자 요구
 * 순서). 그래서 "한 판"의 서술은 여전히 spin() 하나에 선형으로 남고, 여기서는 사용자의 탭
 * (또는 오버레이의 자동 닫힘)을 그 자리로 되돌려 보내기만 한다.
 */
let winCelebrationGate: (() => void) | null = null

/** 오버레이를 걷고, 그 앞에 멈춰 서 있던 spin()을 이어 보낸다. 떠 있지 않으면 무동작이다. */
function settleWinCelebration(get: StoreGet, set: StoreSet): void {
  if (get().winCelebration !== null) set({ winCelebration: null })
  const resume = winCelebrationGate
  winCelebrationGate = null
  resume?.()
}

/**
 * 말판 보너스 앞에 멈춰 서 있는 spin()을 다시 보내는 손잡이. 말판이 재생되는 동안에만 있다.
 * 말판은 트리거 스핀 응답 하나에 통째로 들어 있고(서버 권위), 화면의 재생이 끝나야 그 판의 잔액·합계·빅윈이
 * 공개된다 — 그래서 한 판의 서술은 여전히 spin() 하나에 선형으로 남고 여기서는 재생 끝 신호만 되돌려 보낸다.
 */
let boardGate: (() => void) | null = null

/**
 * 말판 화면(GameScreen의 `useBoardBonus`)이 붙어 있는가. 붙어 있지 않으면(테스트·다른 화면) 말판 재생을 열어
 * 봤자 아무도 닫지 않으므로 spin()은 말판을 건너뛰고 곧장 결과를 공개한다.
 */
let boardPlayerReady = false
/** 얼림 재생 중인가. STOP/SPIN 연타가 남은 단계를 압축하게 한다. */
let currentFrostPlaying = false

/** 지갑에서 `held` 코인을 «아직 공개하지 않은 것»으로 덜어 낸 사본. 서버 값 자체는 건드리지 않는다. */
function withHeldCoins<T extends { coins: number }>(wallet: T, held: number): T {
  return held > 0 ? { ...wallet, coins: Math.max(0, wallet.coins - held) } : wallet
}

/**
 * 무대 룰렛 오버레이가 «요약 카드를 닫았다»고 알릴 때까지 멈춰 서 있는 판을 깨우는 손잡이. 룰렛이 떠 있는 동안만 있다.
 * 룰렛 한 판의 서술은 spin() 하나에 선형으로 남고(릴 → 강조 → 클립 → 룰렛 → 클립 → 정산), 여기서는 오버레이의 끝 신호를
 * 그 자리로 되돌려 보내기만 한다(`finishRoulette`). 화면을 나가면(`reset`) 같은 손잡이로 깨워 물러나게 한다.
 */
let rouletteGate: (() => void) | null = null
/** 룰렛 게이트 상한: 기본 + 회전당. 정상 연출(회전당 최대 약 7초 + 자동 대기 2초)보다 넉넉히 크다. */
const ROULETTE_GATE_BASE_MS = 120_000
const ROULETTE_GATE_PER_STEP_MS = 30_000

/** 렌더러 커튼(`modeTransition end`)을 기다리는 약속들. `notifyCurtain`이 깨운다. */
const curtainWaiters = new Set<{ to: 'freeSpins' | 'base'; resolve: () => void }>()
/** 커튼 이벤트가 끝내 안 와도(렌더러 폴백) 흐름이 멈추지 않게 하는 상한. */
const CURTAIN_WAIT_LIMIT_MS = 8000

function waitForCurtainEnd(to: 'freeSpins' | 'base'): Promise<void> {
  return new Promise<void>((resolve) => {
    const waiter = {
      to,
      resolve: () => {
        clearTimeout(timer)
        curtainWaiters.delete(waiter)
        resolve()
      },
    }
    const timer = setTimeout(waiter.resolve, CURTAIN_WAIT_LIMIT_MS)
    curtainWaiters.add(waiter)
  })
}

function resolveCurtainWaiters(to: 'freeSpins' | 'base'): void {
  for (const waiter of [...curtainWaiters]) if (waiter.to === to) waiter.resolve()
}

function releaseAllCurtainWaiters(): void {
  for (const waiter of [...curtainWaiters]) waiter.resolve()
}

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

export interface SpinToOptionsLike {
  durationMs?: number
  stagger?: number
  fast?: boolean
  gridBefore?: string[][]
  mutations?: MutationEvent[]
  cascades?: CascadeStep[]
  finalGrid?: string[][]
  /** 기본 판 코인(`coinBoard` 피처). 릴이 서는 순간 금액 얼굴을 단다. */
  coins?: Extract<FeatureTrigger, { type: 'coinBoard' }>['cells']
  /** 코인 리스핀 라운드(`coinRespin` 피처). 착지 뒤 재생한다. 결과는 이미 서버가 정했다. */
  respin?: Extract<FeatureTrigger, { type: 'coinRespin' }>
  /** 자라는 정원 스핀(`garden` 피처). 착지 뒤 단계(팝 → 낙하 → 성장)와 햇살을 재생한다. 결과는 이미 서버가 정했다. */
  garden?: Extract<FeatureTrigger, { type: 'garden' }>
  /** 얼림 팩: 프리스핀 판이면 정지 위치가 `freeStrips` 기준이다. 렌더러가 릴 스트립을 갈아 끼운다. */
  frost?: { freeSpin: boolean }
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
    options?: SpinToOptionsLike,
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
      /** 'brief'면 라인별 순차(B단계) 없이 전체 표시만 짧게 1회 — 오토스핀/프리스핀용. */
      presentation?: 'full' | 'brief'
      /** 'cascade'면 연쇄 재생 중 강조를 이미 마친 스핀이다 — A단계와 피처만 보여 준다. */
      mode?: 'standard' | 'cascade'
      totalBet?: number
      /** 베팅을 내고 얻은 판인지(기본 true). 프리스핀 판은 false — 베팅 미만 당첨(돌려받음)을 당첨으로 올려 보인다. */
      paid?: boolean
      features?: FeatureTrigger[]
      /**
       * 전체 표시(A단계)를 붙들 시간(ms) — 당첨 라인이 많을수록 길어진다(winHoldMs).
       * 렌더러가 아직 이 옵션을 받지 않으면 조용히 무시되고 기본 홀드가 쓰인다(계약 후속 과제).
       */
      holdMs?: number
    },
  ): Promise<void>
  /** 프리스핀 진입/종료 시 배경·프레임 등 시각 모드를 전환한다. `null`로 되돌리면 평소 모드다. */
  setMode?(mode: {
    freeSpins?: { left: number; total: number; multiplier: number } | null
    /** true면 커튼·클립 없이 곧장 모드를 맞춘다(서버 상태 복원용). */
    immediate?: boolean
    /** true면 전환이 덮은 순간 릴을 감춘다(무대 룰렛 — 릴 자리는 허브 오버레이가 쓴다). */
    hideReels?: boolean
  }): void
  /**
   * 보고 있던 승리 연출 바퀴를 곧장 접는다(showWins의 약속을 그 자리에서 resolve시킨다). 순환
   * 자체는 멈추지 않는다 — SPIN 버튼/스페이스로 "연출 스킵 + 즉시 다음 스핀"을 할 때 GameScreen이
   * 이걸 부른다(handleSkipWinsAndAdvance).
   */
  skipWins?(): void
  /** 승리 라인 순환 연출을 완전히 멈추고 화면에서 걷어낸다. store가 reset()/게임 이탈 시 부른다. */
  clearWins?(): void
  /**
   * 코인 리스핀이 끝난 동굴에서 기본 화면으로 돌아온다(복귀 전환). 동굴에 있지 않으면 곧장 resolve한다.
   * 빅윈 연출은 동굴 배경 위에서 먼저 끝나야 해서 `spinTo`가 resolve해도 자동으로 나가지 않는다.
   */
  endRespin?(): Promise<void>
  /** 얼림(`frostChain` 피처)을 재생한다. 얼림 팩이 아닌 렌더러에는 없다. 끝나면 화면은 서버 `finalGrid`와 같다. */
  playFrost?(input: {
    chain: ReturnType<typeof frostPlayInput>['chain']
    grid: string[][]
    thresholds: number[]
  }): Promise<void>
  /** 얼림 재생 중이면 남은 단계를 압축해 곧장 마친다. */
  skipFrost?(): void
  /** 이후 스핀의 릴 속도 프로파일을 바꾼다. 돌고 있는 스핀은 건드리지 않는다. */
  setSpinSpeed?(speed: 'normal' | 'quick' | 'turbo'): void
  /** 그리기 루프를 멈추거나 다시 돌린다. 말판 화면이 캔버스를 통째로 덮는 동안 GPU를 쉬게 한다. */
  setPaused?(paused: boolean): void
}

/** FreeSpinsState(허브/서버 형태)를 렌더러의 setMode가 받는 최소 형태로 줄인다. GameScreen도 재사용한다. */
export function toRendererFreeSpinsMode(
  freeSpins: FreeSpinsState | null,
): { left: number; total: number; multiplier: number } | null {
  // 남은 횟수가 0이면 렌더러에게도 "프리스핀 아님"이다 — 세리머니 판정(ceremonyFor)과 커튼
  // 판정(renderer의 modeTransitionTarget)이 같은 규칙을 봐야 둘이 어긋나지 않는다.
  if (!freeSpins || freeSpins.left <= 0) return null
  return { left: freeSpins.left, total: freeSpins.total, multiplier: freeSpins.multiplier }
}

const BET_INDEX_KEY_PREFIX = 'tgslot.bet.'

/**
 * 사용자가 고른 베팅 «금액». 새 형식은 {"v":2,"bet":금액}, 옛 형식(숫자 인덱스)은 그 인덱스의 금액으로
 * 읽는다 — 둘 다 사용자가 직접 고른 것으로 존중한다. 없거나 읽을 수 없으면 null.
 */
function readStoredBetAmount(gameId: string, betLevels: readonly number[]): number | null {
  try {
    const raw = localStorage.getItem(`${BET_INDEX_KEY_PREFIX}${gameId}`)
    if (raw === null) return null
    if (raw.trim().startsWith('{')) {
      const parsed = JSON.parse(raw) as { v?: unknown; bet?: unknown }
      return parsed.v === 2 && typeof parsed.bet === 'number' && Number.isFinite(parsed.bet) ? parsed.bet : null
    }
    const index = Number.parseInt(raw, 10)
    if (Number.isNaN(index)) return null
    return betLevels[index] ?? null
  } catch {
    return null
  }
}

/** 사용자가 −/+로 직접 바꿨을 때만 부른다. BET_LOCKED 보정 같은 자동 조정은 저장하지 않는다. */
function writeStoredBetAmount(gameId: string, bet: number): void {
  try {
    localStorage.setItem(`${BET_INDEX_KEY_PREFIX}${gameId}`, JSON.stringify({ v: 2, bet }))
  } catch {
    /* localStorage 접근 불가 — 베팅 레벨 기억 없이 계속 진행 */
  }
}

/**
 * spinTo()에 넘길 옵션을 만든다 — 아무것도 특별한 게 없으면(프리스핀도 아니고 gridBefore/mutations도
 * 없으면) `undefined`를 돌려준다(기존 테스트/렌더러 호출부가 기대하는 "옵션 없음" 그대로).
 */
export function buildSpinToOptions(
  result: SpinResponse,
  math?: { frostRespin?: unknown } | null,
): SpinToOptionsLike | undefined {
  const frostPack = math?.frostRespin !== undefined
  const hasGridBefore = result.gridBefore !== undefined
  const hasMutations = result.mutations.length > 0
  const hasCascades = hasCascadeSteps(result)
  const coinBoard = result.features.find((feature) => feature.type === 'coinBoard')
  const coinRespin = result.features.find((feature) => feature.type === 'coinRespin')
  const garden = result.features.find((feature) => feature.type === 'garden')
  if (
    !result.isFreeSpin &&
    !hasGridBefore &&
    !hasMutations &&
    !hasCascades &&
    coinBoard === undefined &&
    coinRespin === undefined &&
    garden === undefined &&
    !frostPack
  ) {
    return undefined
  }

  const options: SpinToOptionsLike = {}
  if (result.isFreeSpin) options.fast = true
  if (frostPack) options.frost = { freeSpin: result.isFreeSpin }
  if (hasGridBefore) options.gridBefore = result.gridBefore
  if (hasMutations) options.mutations = result.mutations
  if (hasCascades) {
    options.cascades = result.cascades
    if (result.finalGrid !== undefined) options.finalGrid = result.finalGrid
  }
  // 코인 리스핀 팩: 서버가 정한 코인 금액과 리스핀 라운드를 그대로 넘긴다(화면은 재생만 한다).
  if (coinBoard?.type === 'coinBoard') options.coins = coinBoard.cells
  if (coinRespin?.type === 'coinRespin') options.respin = coinRespin
  // 자라는 정원: 서버가 정한 단계 목록을 그대로 넘긴다. 시작 판은 응답의 8×8 착지 창(`grid`)이다 —
  // 프리스핀은 전용 스트립에서 착지하므로 렌더러가 스트립에서 되짚는 것보다 응답 값이 정확하다.
  if (garden?.type === 'garden') {
    options.garden = garden
    options.gridBefore = result.grid
  }
  return options
}

/** 이번 응답이 자라는 정원 단계를 담고 있는가. 정원은 연쇄처럼 중간 판을 재생하므로 승리 연출도 «연쇄 모드»(A단계만)다. */
export function hasGardenSteps(result: Pick<SpinResponse, 'features'>): boolean {
  return result.features.some((feature) => feature.type === 'garden')
}

/** 이번 응답이 연쇄 단계를 담고 있는가(연쇄 팩이 아니면 `cascades`가 없다). */
export function hasCascadeSteps(result: Pick<SpinResponse, 'cascades'>): boolean {
  return result.cascades !== undefined && result.cascades.length > 0
}

/**
 * 프리스핀 배수를 당첨 표시에 반영한다. 엔진의 `wins[].win`과 스캐터 배당(`scatterWin.win`)은
 * **배수 전** 값이고 서버 `totalWin`·지갑은 배수 후라서, 그대로 보여 주면 표시가 지갑 증가의 절반이 된다.
 * 연쇄 팩은 배수를 사다리로 이미 반영하므로 건드리지 않는다. 배수가 1이면 원본을 그대로 돌려준다.
 */
export function winsForDisplay(
  result: Pick<SpinResponse, 'wins' | 'features' | 'cascades'>,
  multiplier: number,
): { wins: WinLine[]; features: FeatureTrigger[] } {
  if (!(multiplier > 1) || hasCascadeSteps(result)) return { wins: result.wins, features: result.features }
  return {
    wins: result.wins.map((win) => ({ ...win, win: Math.round(win.win * multiplier) })),
    features: result.features.map((feature) =>
      feature.type === 'scatterWin' ? { ...feature, win: Math.round(feature.win * multiplier) } : feature,
    ),
  }
}

/**
 * 결과만 보고 프리스핀 배수를 되짚는다(디버그 «연출 다시 재생»처럼 스핀 전 상태가 없을 때).
 * 서버 `totalWin = round((라인 + 스캐터) × 배수)`의 역산이라 정수 배수는 정확히 돌아온다.
 */
export function freeSpinMultiplierOf(
  result: Pick<SpinResponse, 'isFreeSpin' | 'wins' | 'features' | 'totalWin' | 'orderWin' | 'cascades'>,
): number {
  if (!result.isFreeSpin || hasCascadeSteps(result)) return 1
  let base = 0
  for (const win of result.wins) base += win.win
  for (const feature of result.features) if (feature.type === 'scatterWin') base += feature.win
  if (base <= 0) return 1
  const ratio = (result.totalWin - (result.orderWin ?? 0)) / base
  return ratio > 1 ? Math.round(ratio * 100) / 100 : 1
}

/** 서버 응답의 주문 카드 이월 상태. 쓰는 피처가 없으면 null. 값의 출처는 서버뿐이다. */
export function orderCarryOf(freeSpins: FreeSpinsState | null | undefined): OrderRoundCarry | null {
  return freeSpins?.carry?.orders ?? null
}

/** 라운드 동안 완료한 카드 기록. 라운드 진입 응답이면 비우고 시작한다. */
export function nextOrderLog(
  log: readonly CompletedOrder[],
  result: Pick<SpinResponse, 'features'>,
  math: GameMath | null,
): CompletedOrder[] {
  const base = result.features.some((f) => f.type === 'orderRound') ? [] : [...log]
  return [...base, ...completedOrders(math, result.features)]
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
  /**
   * 지금 연출 중인 스핀의 응답(공개 전). 화로 배율 줄처럼 «연쇄 도중에» 서버 값이 필요한 화면이 읽는다.
   * 스핀 연출이 시작될 때 채우고 다음 스핀 시작 또는 게임 리셋에서 비운다.
   */
  playing: SpinResponse | null
  error: string | null
  errorCode: string | null
  /** 실패한(또는 진행 중인) 스핀의 idempotencyKey. 재시도 시 재사용해 서버가 같은 결과를 재생하게 한다 */
  idempotencyKey: string | null
  renderer: SpinRenderer | null
  /** 진행 중인 프리스핀. null이면 없음. load() 시 서버에서 이어받고, 매 spin() 응답으로 갱신된다. */
  freeSpins: FreeSpinsState | null
  /**
   * 주문 카드 라운드의 서버 확정 상태(`freeSpins.carry.orders`). 쓰는 곳은 load·스핀 공개·재동기화뿐이고
   * 값은 전부 서버 응답이다. 연쇄 재생 중의 화면 진행도는 OrderBoard 안에서만 따로 센다.
   */
  orderRound: OrderRoundCarry | null
  /** 이번 라운드에서 완료한 주문 카드(종료 팝업용). 서버의 orderComplete 피처에서만 쌓인다. */
  orderCompleted: CompletedOrder[]
  /** 진행 중인 더블업. null이면 없음. load() 시 서버에서 이어받고, 스핀 응답의 gambleOffer로 새로 생긴다. */
  gambleSession: GambleSession | null
  /**
   * 진행 중인 오토스핀. null이면 꺼져 있다. `remaining`은 아직 돌지 않은 유료 판의 수 —
   * 지금 돌고 있는 판은 끝날 때 하나 깎이고, 0이 되면 스스로 꺼진다(=null).
   * 프리스핀 중에 도는 판은 서버가 공짜로 주는 것이므로 이 카운터를 소모하지 않는다.
   */
  autoSpin: AutoSpinState | null
  /**
   * 오토스핀이 스스로 멈춘 이유 알림(토스트용). `id`는 같은 이유가 연달아 와도 토스트를 다시 띄우기 위한 번호.
   * 사용자가 직접 중지하거나 횟수가 끝난 경우에는 만들지 않는다.
   */
  autoSpinNotice: { reason: AutoSpinStopReason; limitAmount: number | null; id: number } | null
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
  /**
   * 프리스핀 진입/종료 세리머니(팝업 → 커튼)의 현재 단계. `idle`이 아닌 동안에는 어떤 경로로도
   * 새 스핀이 시작되지 않는다(canStartSpin). 자세한 규칙은 `game/roundFlow.ts` 참고.
   */
  roundFlow: RoundFlowState
  /**
   * 일반 스핀(또는 진행 중인 프리스핀)의 빅윈(≥10×) 오버레이. null이면 없음.
   *
   * **한 판 안에서의 자리**: 릴(과 뮤테이션)이 멈춘 직후 여기가 세워지고, 닫힌 뒤에야 심볼
   * 연출(renderer.showWins)이 시작된다 — 사용자 요구("당첨되면 빅윈연출부터 진행되고 심볼연출이
   * 진행되어야 함"). 그래서 이 값이 null이 아닌 동안 spin()은 아직 끝나지 않은 상태로 대기한다.
   *
   * `roundFlow`에 합치지 않은 이유 — 그쪽은 소유자가 다르고(프리스핀 진입/종료 팝업↔커튼의
   * 정확한 순서를 지키는 게 목적), 이 오버레이는 팝업/커튼과 같은 판에 절대 겹치지 않는다
   * (`ceremonyFor`가 이번 판에 팝업을 만들기로 하면 여기는 애초에 세팅되지 않는다 — 세리머니
   * 종료 팝업이 이미 같은 등급 연출(`WinCelebration`)로 총액을 보여주므로 두 번 띄울 이유가
   * 없다). 그래서 별개의 단순한 nullable 값 하나로 충분하고, roundFlow처럼 popup/curtain을
   * 오가는 상태 기계가 필요 없다 — canStartSpin의 게이트에도 이 값을 별도로 더한다(spin() 참고).
   */
  winCelebration: { totalWin: number; totalBet: number; hurried: boolean } | null
  /**
   * 지금 재생해야 하는 말판 보너스. null이면 없음. 값은 전부 서버 응답에서 온다.
   * 진짜 판이면 spin()이 재생이 끝날 때까지 기다리고, 복원(`resumeBoard`)이면 기다리는 spin()이 없다.
   */
  boardPlay: BoardPlayRequest | null
  /**
   * 무대 룰렛 연출 세션. null이면 룰렛이 없다. 값은 전부 서버 응답(`features[].stageRoulette`)에서 온다.
   *
   * 룰렛 스핀은 정산이 응답 하나에 끝나 있지만 **보이는 것**(잔액·lastResult·더블업·빅윈)은 룰렛 연출이 끝난 뒤에야
   * 공개한다(`reveal`을 미룬다). 단계(`stage`)는 `game/rouletteFlow.ts` 참고. 이 값이 있는 동안 입력은 잠긴다.
   */
  roulette: RouletteSession | null
}

/** 말판 재생 요청. */
export interface BoardPlayRequest {
  roundId: string
  feature: BoardBonusFeature
  totalBet: number
  /** 이 판 응답의 `totalWin`(라인 + 초롱 + 말판). 재생이 끝난 뒤 WinStrip이 이 값까지 오른다. */
  totalWin: number
  /** 복원이면 이만큼 보여 준 상태에서 이어 간다. 진짜 판이면 undefined. */
  resumeShown?: number
  /** 오토스핀·프리스핀 중 진입했는가 — 자동 재생으로 시작한다. */
  auto: boolean
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
   * 세리머니 팝업을 닫는다 — 사용자가 탭했을 때, 그리고 자동 닫힘 안전장치가 터졌을 때.
   * 팝업이 떠 있지 않으면 아무 일도 하지 않는다. 닫힌 **뒤에야** 커튼이 시작된다.
   */
  dismissRoundPopup: () => void
  /**
   * 렌더러의 modeTransition(커튼) 이벤트를 그대로 넘긴다. GameScreen이 유일한 호출자다.
   * 커튼이 다 걷히면(`end`) 세리머니가 끝나고 다음 판(프리스핀 자동진행/오토스핀 재개)이 예약된다.
   */
  notifyCurtain: (to: 'freeSpins' | 'base', phase: 'start' | 'end') => void
  /**
   * 빅윈 오버레이를 닫는다 — 결과 화면에서 사용자가 탭했을 때, 그리고 그 자동 닫힘 시간이
   * 지났을 때. 닫히면 멈춰 서 있던 그 판이 이어진다 — 심볼 연출이 그제서야 시작되고, 다음 판
   * 예약(scheduleNextRound)은 평범한 판과 똑같이 그 연출까지 끝난 뒤에 걸린다.
   */
  dismissWinCelebration: () => void
  /** 말판 화면이 붙었다/떨어졌다. 붙어 있을 때만 spin()이 말판 재생을 열고 기다린다. */
  setBoardPlayerReady: (ready: boolean) => void
  /** 말판 재생(요약 [받기] 뒤 복귀 커튼까지)이 끝났다 — 멈춰 서 있던 spin()이 이어진다. */
  finishBoard: () => void
  /** 새로고침 뒤 복원: 보던 말판을 이어서 재생한다(기다리는 spin()은 없다). 이미 재생 중이면 무시한다. */
  resumeBoard: (request: BoardPlayRequest) => void
  /** 무대 룰렛 오버레이가 요약 카드를 닫았다고 알린다. 멈춰 서 있던 판이 퇴장 클립 → 정산으로 이어진다. */
  finishRoulette: () => void
  /**
   * 새로고침·재진입 뒤 «무대 룰렛 이어 보기». 세션 캐시(10분 이내, 같은 게임)가 있으면 끝까지 본 회전 다음부터
   * 연출만 다시 튼다. 정산은 이미 끝났으니 잔액은 서버 값 그대로다. 캐시가 없으면 아무 일도 하지 않는다.
   */
  resumeRoulette: () => Promise<void>
  /**
   * 오토스핀을 `count`판만큼 무장하고, 지금 바로 돌 수 있는 상태면(idle, 프리스핀 아님) 첫 판을
   * 곧장 시작한다. 이미 스핀 중이면 예약만 해두고 그 판이 끝나는 대로 이어진다.
   */
  startAutoSpin: (count: number, options?: AutoSpinOptions) => void
  /**
   * 오토스핀을 멈춘다 — 지금 돌고 있는 판은 그대로 끝나고, 예약돼 있던 다음 판만 거둬들인다
   * (업계 관행 "이번 스핀만 마치고 중단"). 프리스핀 자동진행이 걸어 둔 예약은 건드리지 않는다.
   */
  stopAutoSpin: (reason?: AutoSpinStopReason) => void
  /** 오토스핀 멈춤 알림 토스트를 닫는다. */
  dismissAutoSpinNotice: () => void
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
  /**
   * 코인 리스핀 «이어 보기» — 연출 도중 새로고침한 라운드를 저장된 서버 응답으로 **표시 전용** 재생한다.
   * 잔액·마지막 결과는 건드리지 않는다(이미 서버가 확정했고 `/me`가 정답이다). 재생 중에는 스핀 버튼이 STOP이 되고
   * STOP 한 번이면 압축 재생으로 끝난다. idle이 아니거나 렌더러가 없으면 아무 일도 하지 않는다.
   */
  replayRespin: (response: SpinResponse) => Promise<void>
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
  playing: null,
  error: null,
  errorCode: null,
  idempotencyKey: null,
  renderer: null,
  freeSpins: null,
  orderRound: null,
  orderCompleted: [],
  gambleSession: null,
  autoSpin: null,
  autoSpinNotice: null,
  debugPreset: null,
  debugMessage: null,
  lastSpinTiming: null,
  lastSpinDebug: null,
  gambleIdempotencyKey: null,
  roundFlow: ROUND_FLOW_IDLE,
  winCelebration: null,
  boardPlay: null,
  roulette: null,
}

type StoreGet = () => GameStore
type StoreSet = (partial: Partial<GameStore>) => void

/** 다음 자동 스핀 한 판을 예약한다. owner는 "오토스핀 중지"가 프리스핀 자동진행까지 거두지 않도록 구분한다. */
function scheduleSpinAfter(delayMs: number, owner: 'freeSpins' | 'autoSpin', get: StoreGet): void {
  autoSpinTimeoutOwner = owner
  autoSpinTimeoutId = setTimeout(() => {
    autoSpinTimeoutId = null
    autoSpinTimeoutOwner = null
    void get().spin()
  }, delayMs)
}

/**
 * 다음 판을 예약한다 — 프리스핀이 남아 있으면 그 자동진행이 주인이고, 아니면 무장된 오토스핀이
 * 이어받는다. 예약할 이유가 없으면 아무 일도 하지 않는다.
 *
 * 세리머니가 없는 평범한 판의 끝과, 세리머니(팝업→커튼)가 완전히 끝난 시점 둘 다 여기로 온다 —
 * 예전처럼 "미뤄 둔 예약 클로저"를 두 종류나 들고 있을 필요가 없다. 무엇을 이어갈지는 언제나
 * 지금 store 상태에서 다시 읽으면 되기 때문이다.
 */
function scheduleNextRound(get: StoreGet): void {
  const freeSpins = get().freeSpins
  if (freeSpins && freeSpins.left > 0) {
    scheduleSpinAfter(AUTO_SPIN_DELAY_MS, 'freeSpins', get)
    return
  }
  if (get().autoSpin === null) return

  // 다음 판 베팅을 감당할 수 없으면 여기서 멈춘다(오토스핀 정지 조건 3) — 어차피 서버가
  // INSUFFICIENT_FUNDS로 거절할 판을 굳이 한 번 더 던지지 않는다.
  const nextBet = get().math?.betLevels[get().betIndex]
  const coins = useSessionStore.getState().wallet?.coins ?? 0
  if (nextBet === undefined || coins < nextBet) {
    get().stopAutoSpin()
    return
  }
  // 손실 한도 — 다음 «유료» 판을 걸기 직전에 판정한다(한도를 넘기기 전에 멈춘다).
  const armed = get().autoSpin
  if (armed && exceedsLossLimit({ startCoins: armed.startCoins, net: armed.net, nextBet, lossLimit: armed.lossLimit })) {
    get().stopAutoSpin('lossLimit')
    return
  }
  scheduleSpinAfter(AUTO_SPIN_INTERVAL_MS, 'autoSpin', get)
}

/**
 * 세리머니 상태 기계에 이벤트를 넣고, 돌려받은 부수효과를 실제로 실행한다.
 * 판단은 전부 순수 모듈(roundFlow)에 있고 여기는 그 결정을 집행만 한다.
 */
function applyRoundFlow(event: RoundFlowEvent, get: StoreGet, set: StoreSet): void {
  const { state, effects } = roundFlowReducer(get().roundFlow, event)
  // 상태부터 반영한다 — 효과(커튼 걸기/다음 판 예약)가 도는 동안 이미 "스핀 금지" 판정이 서 있어야 한다.
  if (state !== get().roundFlow) set({ roundFlow: state })

  for (const effect of effects) {
    switch (effect.type) {
      case 'armPopupTimeout':
        clearPopupTimeout()
        popupTimeoutId = setTimeout(() => {
          popupTimeoutId = null
          get().dismissRoundPopup()
        }, ROUND_POPUP_AUTO_CLOSE_MS)
        break
      case 'clearPopupTimeout':
        clearPopupTimeout()
        break
      case 'runCurtain':
        // 커튼의 방아쇠는 여기 한 곳뿐이다 — 팝업이 닫힌 뒤에만 당겨지므로 둘이 겹칠 수 없다.
        get().renderer?.setMode?.({ freeSpins: toRendererFreeSpinsMode(get().freeSpins) })
        break
      case 'ceremonyFinished':
        scheduleNextRound(get)
        break
    }
  }
}

/**
 * 무대 룰렛의 클립·오버레이 구간(진입 클립 → 오버레이 → 퇴장 클립). 릴 위 강조(pre)는 이미 끝난 뒤에 부른다.
 *
 * 렌더러의 `setMode`(프리스핀 전환과 같은 커튼·클립 경로)를 재사용한다: 진입은 `freeSpins` 모드(배경 → 룰렛 무대,
 * 릴 감춤), 퇴장은 모드 해제. 커튼이 걷히는 `modeTransition end`를 기다린 뒤 다음 단계로 간다.
 * `immediate`는 이어 보기용 — 진입 클립 없이 곧장 룰렛 모드로 맞춘다.
 */
async function playRouletteSession(
  gameId: string,
  songs: number,
  options: { immediate: boolean },
  get: StoreGet,
  set: StoreSet,
): Promise<void> {
  const setStage = (stage: RouletteStage): void => {
    const current = get().roulette
    if (current !== null && get().gameId === gameId) set({ roulette: { ...current, stage } })
  }
  const renderer = (): SpinRenderer | null => (get().gameId === gameId ? get().renderer : null)

  setStage('curtain')
  const enter = renderer()
  if (enter?.setMode) {
    if (options.immediate) {
      enter.setMode({ ...rouletteRendererMode(songs), immediate: true })
    } else {
      const ended = waitForCurtainEnd('freeSpins')
      enter.setMode(rouletteRendererMode(songs))
      await ended
    }
  }
  if (get().gameId !== gameId) return

  setStage('show')
  // 안전망 — 연출이 끝내 onFinished를 부르지 못해도 결과 길이로 잡은 상한 뒤에는 공개·잠금 해제로 넘어간다.
  const steps = get().roulette?.feature.steps.length ?? 0
  const gateLimitMs = ROULETTE_GATE_BASE_MS + steps * ROULETTE_GATE_PER_STEP_MS
  await new Promise<void>((resolve) => {
    const release = (): void => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(release, gateLimitMs)
    rouletteGate = release
  })
  rouletteGate = null
  if (get().gameId !== gameId) return

  setStage('exit')
  const leave = renderer()
  if (leave?.setMode) {
    const ended = waitForCurtainEnd('base')
    leave.setMode({ freeSpins: null })
    await ended
  }
  if (get().gameId !== gameId) return
  set({ roulette: null })
  clearRouletteCache()
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  async load(gameId) {
    set({ ...initialState, gameId, phase: 'loading' })
    // 게임 주소로 바로 들어오면(새로고침 등) 허브 레벨 정보(베팅 상한)가 아직 없다. 상한을 모른 채 고르면
    // 기본 베팅 규칙이 «상한 100» 가정으로 계산돼 로비를 거쳤을 때와 다른 값이 나온다(예: 레벨 5+·잔액 6만 → 200 대신 100).
    // math와 함께 /me를 받기 시작하고, 진입은 기다리지 않는다(아래에서 도착하면 기본 베팅만 다시 고른다).
    const levelInfoReady =
      useHubStore.getState().levelInfo === null ? useHubStore.getState().refreshLevelInfo() : null
    try {
      const raw = await getGameMath(gameId)
      const math = parseGameMath(raw)
      // 기본 베팅 — 사용자가 고른 금액(저장)이 아직 쓸 수 있으면 그대로, 아니면 잔액의 0.2~0.5% 규칙.
      // 저장된 선택은 지우지 않는다(잔액이 회복되면 다시 쓴다).
      // 레벨 정보가 아직 없으면, 상한을 100으로 가정했을 때 높은 레벨 사용자가 고른 베팅을 «상한 초과»로 잘못 버리므로
      // 저장된 선택은 그대로 쓰고(잘못이면 서버 BET_LOCKED가 바로잡는다) 규칙 값만 잠정적으로 100을 상한으로 가정한다.
      const pickBet = (maxBet: number | undefined): number => {
        const balance = useSessionStore.getState().wallet?.coins ?? 0
        const storedIndex = storedBetIndex(
          math.betLevels,
          readStoredBetAmount(gameId, math.betLevels),
          balance,
          maxBet ?? Number.POSITIVE_INFINITY,
        )
        return storedIndex >= 0 ? storedIndex : pickDefaultBetIndex(math.betLevels, balance, maxBet ?? 100)
      }
      const betIndex = pickBet(useHubStore.getState().levelInfo?.maxBet)
      // load()가 재호출됐을 수 있으므로(재시도), 여전히 같은 게임을 보고 있을 때만 반영한다.
      if (get().gameId !== gameId) return
      set({ math, betIndex, phase: 'idle', error: null, errorCode: null })
      if (levelInfoReady) {
        void levelInfoReady.then(() => {
          const maxBet = useHubStore.getState().levelInfo?.maxBet
          const now = get()
          // 상한을 받았을 때 아직 잠정 값 그대로 쉬고 있을 때만 다시 고른다. 그 사이 사용자가 베팅을 바꿨거나,
          // 판이 시작됐거나, 프리스핀을 이어받았거나, 실패한 판의 재시도 키가 남아 있으면 손대지 않는다.
          if (maxBet === undefined || now.gameId !== gameId || now.math !== math) return
          if (now.betIndex !== betIndex || now.phase !== 'idle' || now.freeSpins !== null || now.idempotencyKey !== null) return
          const next = pickBet(maxBet)
          if (next !== betIndex) set({ betIndex: next })
        })
      }

      // 진행 중인 프리스핀/더블업 재개 — 화면을 나갔다 돌아오거나 새로고침해도 서버에 남은 상태를
      // 그대로 잇는다. 실패해도(네트워크 등) 게임 자체는 계속 플레이할 수 있어야 하므로 감싸 무시한다.
      const token = useSessionStore.getState().token
      if (token) {
        try {
          const state = await getGameState(token, gameId)
          const gambleSession = toGambleSession(state.state.gamble)
          if (get().gameId === gameId) {
            set({ freeSpins: state.freeSpins, orderRound: orderCarryOf(state.freeSpins), gambleSession })
            // 렌더러가 이 응답보다 먼저 준비됐으면 GameScreen의 복원 effect는 null을 보고 지나갔다.
            // 새로고침·재진입으로 이어지는 프리스핀이면 여기서 배경·테두리를 곧장(커튼·클립 없이) 맞춘다.
            if (state.freeSpins !== null) {
              get().renderer?.setMode?.({ freeSpins: toRendererFreeSpinsMode(state.freeSpins), immediate: true })
            }
          }
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
    const amount = math.betLevels[index]
    if (amount !== undefined) writeStoredBetAmount(gameId, amount)
  },

  setRenderer(renderer) {
    set({ renderer })
  },

  async spin() {
    // 세리머니(프리스핀 진입/종료 팝업 + 커튼)나 빅윈 오버레이가 도는 동안에는 어떤 경로로도
    // 릴이 다시 돌지 않는다 — 자동진행·오토스핀·스핀 버튼·스테이지 탭·스페이스 전부 여기서
    // 한 번에 막힌다. 예약을 거두기 **전에** 돌아간다: 막힌 입력이 예약된 다음 판까지 지워버리면 안 된다.
    if (!canStartSpin(get().roundFlow) || get().winCelebration !== null || get().boardPlay !== null) return

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

    // 새 스핀을 시작하면 지난 룰렛의 «이어 보기» 캐시는 쓸모없다.
    clearRouletteCache()

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
      playing: null,
      gambleSession: null,
      gambleIdempotencyKey: null,
      // 디버그 프리셋은 원샷 — 요청을 만드는 이 시점에 바로 지운다(성공/실패와 무관하게 다음
      // 스핀에 새어 들어가면 안 된다). 남은 비차단 디버그 메시지도 새 스핀에서는 지운다.
      debugPreset: null,
      debugMessage: null,
    })

    const requestBody: SpinRequest = { totalBet, idempotencyKey }
    // preset이 무장돼 있으면 이번 요청에만 실어 보낸다 — maxTries는 서버 기본값을 그대로 쓴다.
    if (debugPreset) requestBody.debug = { preset: debugPreset, maxTries: debugMaxTries(debugPreset) }

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
              set({
                freeSpins: state.freeSpins,
                orderRound: orderCarryOf(state.freeSpins),
                gambleSession: toGambleSession(state.state.gamble),
              })
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

    // 응답이 도착했다. 여기서 곧장 세우는 것은 **화면에 결과를 누설하지 않는 것**뿐이다 —
    // 실패했던 스핀의 idempotencyKey는 이제 쓸모가 없으니 지운다.
    set({ idempotencyKey: null })

    // 코인 리스핀: 결과·잔액은 이 응답으로 이미 확정이다. 연출 도중 새로고침해도 이어 볼 수 있게 응답을 저장해 둔다
    // (연출이 끝나면 아래 finally가 지운다). 저장소를 못 쓰는 환경에서는 조용히 건너뛴다.
    saveRespinReplay(gameId, result)
    // 말판 보너스: 응답을 받는 **즉시**(릴이 돌기 전) 복원 스냅숏을 쓴다. 릴이 도는 중이든 말판을 보는 중이든
    // 새로고침하면 이 판을 이어서(또는 처음부터) 다시 보여 줄 수 있다. 지갑에는 아무 영향이 없다.
    const board = boardFeatureOf(result.features)
    if (board !== undefined) {
      const userId = useSessionStore.getState().user?.id
      saveBoardSnapshot(gameId, {
        roundId: result.roundId,
        savedAt: Date.now(),
        totalBet: result.totalBet,
        feature: board,
        shown: 0,
        totalWin: result.totalWin,
        ...(userId === undefined ? {} : { userId }),
      })
    }
    /** 릴 착지 때 아직 보여 주면 안 되는 말판 몫(코인). 말판 재생이 끝나야 풀린다. */
    // 얼림 판은 얼음 보너스 몫도 재생이 끝날 때까지 덜어 둔다(얼기도 전에 지갑에 오르면 결과가 새어 나간다).
    const frostChain = findFrostChain(result.features)
    const canPlayFrost = renderer?.playFrost !== undefined && math !== null && frostChain !== undefined
    const boardHoldCoins =
      board !== undefined && boardPlayerReady ? board.win : frostHoldCoins(result.features, canPlayFrost)
    let boardHeld = 0

    // 더블업 세션 — gambleOffer가 있으면 이번 스핀 당첨을 걸 수 있는 새 세션이다. 값은 지금
    // 만들어 두되 **공개는 릴이 멈춘 뒤**다(아래 reveal).
    const gambleSession: GambleSession | null = result.gambleOffer
      ? {
          roundId: result.roundId,
          pendingWin: result.gambleOffer.pendingWin,
          stepsLeft: result.gambleOffer.maxSteps,
          maxSteps: result.gambleOffer.maxSteps,
          expiresAt: result.gambleOffer.expiresAt,
        }
      : null

    /**
     * 이 판의 결과 중 **플레이어가 보게 되는 것**을 한 번에 공개한다.
     *
     * 릴이 도는 동안에는 아무것도 새어 나가면 안 된다. 예전에는 응답이 오자마자 전부 세웠고,
     * 그래서 더블업 패널과 당첨 금액이 **릴 정지보다 1.6초 먼저** 떴다(390×844 실측) —
     * 이길지 질지가 릴이 멈추기도 전에 확정돼 보였다. 커튼(시각 모드)만 미뤄 두고 나머지가
     * 새고 있었던 셈이라, 이제 "보이는 것"은 전부 이 한 곳에서 같은 시각에 공개한다:
     *  - 지갑(당첨금이 얹힌 잔액)과 잭팟 풀(당첨이면 풀이 비워진다)
     *  - 프리스핀 상태(재발동으로 늘어난 횟수가 스캐터 착지보다 먼저 보이면 안 된다)
     *  - 더블업 세션(받기/더블 패널과 대기 금액)
     *  - lastResult(공정성 탭·디버그 패널·아이콘 해석이 읽는 이번 판의 원본)
     *
     * 부르는 자리는 둘뿐이다 — 릴(과 뮤테이션 연출)이 끝난 직후의 정상 경로, 그리고 무슨 일이
     * 있어도 결과가 유실되지 않도록 마지막에 한 번 더 부르는 finally의 안전망. 멱등이라
     * 두 번 불려도 xp가 두 번 오르거나 하지 않는다. 스탑으로 릴을 즉시 세운 경우에도 spinTo가
     * 그 자리에서 resolve되므로 공개는 스냅 착지 직후 — 따로 지연이 붙지 않는다.
     */
    let revealed = false
    const reveal = (): void => {
      if (revealed) return
      revealed = true

      // 지갑·허브는 게임 화면을 벗어난 뒤에도 반영한다 — 이미 확정된 서버 권위 값이라
      // 유실되면 로비 잔액이 스핀 전 값으로 남는다. 다만 말판 판은 말판 몫을 «재생이 끝날 때까지» 덜어 두고
      // 보여 준다(결과 누설 방지) — 화면을 벗어났으면 곧장 서버 값 그대로다.
      const holdNow = get().gameId === gameId ? boardHoldCoins : 0
      boardHeld = holdNow
      useSessionStore.setState({ wallet: withHeldCoins(result.wallet, holdNow) })
      useHubStore.getState().setJackpotPool(result.jackpot)
      const spinNet = spinNetOf({
        totalWin: result.totalWin,
        jackpotWin: result.jackpotWin,
        totalBet: result.totalBet,
        isFreeSpin: result.isFreeSpin,
      })
      usePlaySessionStore.getState().recordSpin({
        totalWin: result.totalWin,
        jackpotWin: result.jackpotWin,
        totalBet: result.totalBet,
        isFreeSpin: result.isFreeSpin,
      })
      const armedNow = get().autoSpin
      if (armedNow) set({ autoSpin: { ...armedNow, net: armedNow.net + spinNet } })
      if (result.missions && result.missions.length > 0) {
        useHubStore.getState().setMissions(result.missions)
      }
      // xp는 누적 베팅액이라 결과를 누설하지 않지만(이 판의 승패와 무관), 레벨 바가 판의 끝에
      // 한 번에 차오르도록 다른 것들과 같은 시각에 반영한다.
      // levelUp에는 from/to/bonus만 있고 새 xp/maxBet은 없으므로, 레벨이 오른 스핀은 /me로 확정값을 덮어쓴다.
      useHubStore.getState().addXp(result.totalBet)
      if (result.levelUp) {
        void useHubStore.getState().refreshLevelInfo()
      }

      // 게임 화면 상태는 여전히 그 게임을 보고 있을 때만 — 다른 게임 화면에 남의 결과가 뜨면 안 된다.
      if (get().gameId !== gameId) return
      // 프리스핀 상태는 이 스핀이 프리스핀을 새로 시작/재발동했든, 계속 진행 중이든, 방금 끝났든
      // 서버 응답이 유일한 출처다 — 클라이언트는 카운트다운을 스스로 계산하지 않는다.
      set({
        lastResult: result,
        freeSpins: result.freeSpins,
        orderRound: orderCarryOf(result.freeSpins),
        orderCompleted: orderLogAfter,
        gambleSession,
        // 이번 스핀이 디버그 프리셋으로 강제됐을 때만 서버가 실어 보낸다(같은 idempotencyKey로
        // 재전송된 응답에는 안 실린다) — 그 외에는 항상 null이다.
        lastSpinDebug: result.debug ?? null,
      })
    }

    /**
     * 말판 재생이 끝났다 — 덜어 둔 말판 몫을 지갑에 돌려놓는다. 그 사이 지갑이 서버 값으로 이미 맞춰졌으면
     * (`/me` 새로고침 등) 그대로 둔다. 멱등이라 finally 안전망이 한 번 더 불러도 된다.
     */
    const releaseBoardHold = (): void => {
      if (boardHeld === 0) return
      const held = boardHeld
      boardHeld = 0
      const current = useSessionStore.getState().wallet
      if (current === null || current.coins >= result.wallet.coins) return
      useSessionStore.setState({ wallet: { ...current, coins: current.coins + held } })
    }

    // 그 사이 다른 게임으로 옮겨 갔으면 이 판의 연출은 남의 화면에 그릴 수 없다. 그래도 지갑·
    // 허브는 확정된 값이므로 공개는 하고 물러난다(위 reveal의 gameId 가드가 나머지를 거른다).
    if (get().gameId !== gameId) {
      reveal()
      return
    }

    // 시각 모드 전환(커튼)도 여기서 곧장 걸지 않는다 — 릴 회전·뮤테이션·승리 연출이 다 끝난
    // 뒤에야 건다(아래 finally). 결과가 화면에 다 드러나기도 전에 배경부터 바뀌면 인과가
    // 뒤집힌다(스캐터가 보이기도 전에 프리스핀 복장이 되는 문제).

    // 이번 판이 프리스핀 모드 경계를 넘었나(진입 또는 종료). 연출 순서를 정하는 두 자리 —
    // 빅윈 오버레이를 띄울지(아래 try)와 커튼/팝업을 걸지(finally) — 가 **같은 판정**을 봐야
    // 하므로 여기서 한 번만 계산한다. 판단의 재료(스핀 전 freeSpins + 응답)는 이미 다 나왔다.
    const orderLogAfter = nextOrderLog(get().orderCompleted, result, get().math)
    // 무대 룰렛 진입 스핀이면 보이는 것(잔액·lastResult·더블업·빅윈)을 룰렛이 끝난 뒤에 공개한다.
    const rouletteFeature = math.stageRoulette === undefined ? null : findRouletteFeature(result.features)
    const baseCeremony = ceremonyFor(freeSpins, result)
    const orderCeremony = baseCeremony
      ? withOrderPopup(baseCeremony, result, orderLogAfter, get().math?.orderRound !== undefined)
      : null
    const ceremony = orderCeremony
      ? withGardenPopup(withForgePopup(orderCeremony, result), result, freeSpins?.totalBet ?? result.totalBet)
      : null

    try {
      let reelStopAt: number | null = null
      if (renderer) {
        // spinTo가 돌려주는 손잡이를 모듈 스코프에 잡아둔다 — 탭/스페이스로 건너뛰기를 하면
        // requestSkip()이 이 손잡이의 skip()을 부른다. 결과를 기다리는 동안(=이 handle이 생기기
        // 전에) 이미 건너뛰기가 눌려 있었다면(skipRequested) 시작하자마자 바로 skip()한다.
        // gridBefore/mutations를 함께 넘기면(뮤테이션이 있는 게임) 렌더러가 리빌 연출까지 재생한
        // 뒤에야 이 손잡이가 resolve된다 — 승리 연출은 항상 그 다음이다(아래 흐름 그대로).
        set({ playing: result })
        const handle = renderer.spinTo(result.stops, buildSpinToOptions(result, math))
        currentSpinHandle = handle
        if (skipRequested) {
          skipRequested = false
          handle.skip?.()
        }
        await handle
        currentSpinHandle = null
        reelStopAt = Date.now()
      }

      // 릴이 멈췄다(뮤테이션 리빌까지 끝났다) — 이제서야 결과를 화면에 공개한다. 렌더러가 아예
      // 없으면 기다릴 릴도 없으니 이 자리가 곧 응답 직후다.
      // 무대 룰렛 스핀은 룰렛 연출이 끝난 뒤에 공개한다(아래) — 잔액이 먼저 오르면 결과가 새어 나간다.
      if (rouletteFeature === null) reveal()
      else {
        const session = sessionFromResult(gameId, result, rouletteFeature)
        set({ roulette: session })
        writeRouletteCache({
          gameId,
          roundId: session.roundId,
          feature: rouletteFeature,
          baseWin: session.baseWin,
          totalWin: session.totalWin,
          totalBet: session.totalBet,
          shownSteps: 0,
          savedAt: Date.now(),
        })
      }

      // ---- 빅윈 오버레이 — 릴(과 뮤테이션)이 멈춘 «직후», 심볼 연출보다 먼저 ----
      //
      // 사용자 요구: "당첨되면 빅윈연출부터 진행되고 심볼연출이 진행되어야 함". 예전에는 순환하는
      // 심볼 연출이 한 바퀴 다 돈 뒤에야 오버레이가 떴다 — 정작 "얼마를 땄는지"가 맨 나중에 나왔다.
      //
      // 세리머니(프리스핀 진입/종료 팝업)가 있는 판에서는 아예 띄우지 않는다 — 그 팝업이 이미 같은
      // 등급 연출로 총액을 보여주므로 두 번 띄울 이유가 없다(판정은 위에서 한 번만 한다).
      //
      // 말판 판은 여기서 띄우지 않는다 — 합계(라인 + 초롱 + 말판)는 말판 요약이 끝난 뒤 한 번만 축하한다.
      const celebrateIfBig = async (): Promise<boolean> => {
        if (celebrationTier(result.totalWin, result.totalBet) === 'none') return true
        // 오토스핀이 돌고 있었거나 이미 프리스핀 중이었으면(둘 다 winPresentationMode와 같은
        // 신호) 서두른다 — 오버레이가 롤업·강조를 줄이고 붙드는 시간도 짧게 잡는다(winTiers.ts).
        set({
          phase: 'showingWin',
          winCelebration: {
            totalWin: result.totalWin,
            totalBet: result.totalBet,
            hurried: get().autoSpin !== null || freeSpins !== null,
          },
        })
        // 오버레이가 닫힐 때까지 이 판은 여기서 멈춰 선다(dismissWinCelebration / reset이 깨운다).
        await new Promise<void>((resolve) => {
          winCelebrationGate = resolve
        })
        // 기다리는 동안 화면을 벗어났으면(reset) 남은 연출은 이 게임의 것이 아니다 — finally가 정리한다.
        return get().gameId === gameId
      }
      // 무대 룰렛 스핀은 룰렛이 끝난 뒤(아래)에 한 번만 띄운다.
      // 얼림 판은 얼음 보너스까지 정산된 뒤(아래) 한 번만 축하한다.
      if (!ceremony && board === undefined && rouletteFeature === null && !canPlayFrost && !(await celebrateIfBig())) return

      // 코인 리스핀: 빅윈 연출까지 동굴 배경 위에서 마쳤다. 복귀 전환으로 기본 화면에 돌아온 뒤 라인 당첨을 보여 준다.
      if (renderer?.endRespin !== undefined && hasCoinRespin(result)) {
        set({ phase: 'showingWin' })
        await renderer.endRespin()
        if (get().gameId !== gameId) return
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
          // 오토스핀 중이거나 프리스핀이 도는 동안에는 라인별 순차(B단계)를 통째로 건너뛰고
          // 전체 표시만 짧게 1회 보여준다 — 순환하는 전체 연출이 프리스핀 사이에 끼면 판
          // 간격이 20초를 넘겨 "진행이 멈춘 것"처럼 보인다(실측). 수동 기본 게임만 full +
          // 순환이다(옵션 자체를 넘기지 않아 기존 호출 형태를 그대로 유지한다).
          // 말판 판은 «초롱 3개 → 말판»이 주인공이라(무대 룰렛 진입도 같다) 라인 연출은 전체 표시 한 번으로 짧게 보여 주고 넘어간다.
          // 얼림 팩의 유료 판 프리스핀 진입은 «구슬 3개 → 프리스핀»이 주인공이다 — 길마다 순환하면 진입까지 5초가 더 걸렸다.
          const frostEntry =
            math?.frostRespin !== undefined && freeSpins === null && result.features.some((feature) => feature.type === 'freeSpins')
          const presentation =
            board !== undefined || rouletteFeature !== null || frostEntry
              ? 'brief'
              : winPresentationMode({
                  autoSpinActive: get().autoSpin !== null,
                  freeSpinsActive: freeSpins !== null,
                })
          // freeSpins는 이 스핀 **전** 상태다 — 이번 스핀에 걸린 배수가 그것이다.
          const shown = winsForDisplay(result, freeSpins?.multiplier ?? 1)
          await renderer.showWins(shown.wins, {
            totalBet: result.totalBet,
            // 프리스핀 판은 베팅을 내지 않았다 — 베팅 미만 당첨을 «돌려받음»으로 낮춰 보이지 않게 렌더러에 알린다.
            paid: freeSpins === null,
            features: shown.features,
            ...(hasCascadeSteps(result) || hasGardenSteps(result) ? { mode: 'cascade' as const } : {}),
            // brief는 자기만의 짧은 홀드를 쓴다 — 여기서 늘리면 짧게 스쳐 지나간다는 약속이 깨진다.
            ...(presentation === 'brief'
              ? { presentation: 'brief' as const }
              : { holdMs: winHoldMs(result.wins.length) }),
          })
          timing.firstPassMs = Date.now() - winStartAt
        }
      }

      // ---- 얼림 — 착지 판의 평소 당첨을 보여 준 뒤, 가장 큰 그림이 얼고 나머지가 다시 돌고 보너스가 정산된다 ----
      if (canPlayFrost && renderer?.playFrost !== undefined && frostChain !== undefined && math !== null && get().gameId === gameId) {
        set({ phase: 'showingWin' })
        currentFrostPlaying = true
        try {
          await renderer.playFrost(frostPlayInput(result, frostChain, math))
        } finally {
          currentFrostPlaying = false
        }
        if (get().gameId !== gameId) return
        releaseBoardHold()
        if (!ceremony && !(await celebrateIfBig())) return
      }

      // ---- 말판 보너스 — 릴·라인 연출이 끝난 뒤, 요약 [받기]와 복귀 커튼이 끝날 때까지 이 판은 여기서 멈춰 선다 ----
      if (board !== undefined && boardPlayerReady && get().gameId === gameId) {
        set({
          phase: 'showingWin',
          boardPlay: {
            roundId: result.roundId,
            feature: board,
            totalBet: result.totalBet,
            totalWin: result.totalWin,
            auto: get().autoSpin !== null || freeSpins !== null,
          },
        })
        await new Promise<void>((resolve) => {
          boardGate = resolve
        })
        // 기다리는 동안 화면을 벗어났으면(reset) 남은 연출은 이 게임의 것이 아니다 — finally가 정리한다.
        if (get().gameId !== gameId) return
        releaseBoardHold()
        // 합계 축하는 말판 요약이 끝난 뒤 한 번만이다.
        if (!(await celebrateIfBig())) return
      }
      // ---- 무대 룰렛 ---- 릴 위 강조(위 showWins 첫 바퀴)가 끝났다. 클립 → 오버레이 → 클립 순서로 이어 간다.
      if (rouletteFeature !== null && get().gameId === gameId) {
        await playRouletteSession(gameId, math.stageRoulette?.songs ?? 3, { immediate: false }, get, set)
        if (get().gameId !== gameId) return
        // 이제서야 잔액·lastResult·더블업을 공개한다(위 reveal을 미뤄 둔 판).
        reveal()
        if (!ceremony && celebrationTier(result.totalWin, result.totalBet) !== 'none') {
          set({
            phase: 'showingWin',
            // 요약 카드가 이미 총액을 보여 줬다 — 빅윈은 서둘러(짧은 롤업·짧은 머묾) 한 번 더 축하만 한다.
            winCelebration: {
              totalWin: result.totalWin,
              totalBet: result.totalBet,
              hurried: true,
            },
          })
          await new Promise<void>((resolve) => {
            winCelebrationGate = resolve
          })
          if (get().gameId !== gameId) return
        }
      }
    } catch (err) {
      // 연출 실패는 서버 권위 결과에 영향을 주지 않는다 — 원인만 남기고 아래 finally가 phase를 회복시킨다.
      console.error('[game] renderer playback failed', err)
    } finally {
      // 안전망 — 릴 연출이 중간에 터졌든 화면을 벗어났든, 확정된 결과가 유실된 채로 판이 끝나면
      // 안 된다. 정상 경로에서는 이미 공개됐으므로 여기서는 아무 일도 일어나지 않는다.
      reveal()
      releaseBoardHold()
      currentSpinHandle = null
      if (hasCoinRespin(result)) {
        // 연출이 끝났다(또는 도중에 터졌다). 이어 볼 기록을 지우고, 동굴에 남아 있으면 안전망으로 돌려보낸다.
        clearRespinReplay(gameId)
        void renderer?.endRespin?.()
      }
      if (get().gameId === gameId) {
        // 말판·룰렛 연출 중 예외로 빠져나왔다면 세션이 남아 roundBusy가 풀리지 않는다 — 여기서 함께 정리한다.
        set({ phase: 'idle', lastSpinTiming: timing, boardPlay: null, roulette: null })

        // 오토스핀 카운터 — 이번 판이 "유료" 판일 때만 하나 깎는다(프리스핀 중에 도는 판은 서버가
        // 공짜로 주는 것이라 오토스핀의 몫에서 빼지 않는다). 0이 되면 스스로 꺼진다.
        const armedBefore = get().autoSpin
        if (armedBefore && freeSpins === null) {
          const left = Math.max(0, armedBefore.remaining - 1)
          set({ autoSpin: left > 0 ? { ...armedBefore, remaining: left } : null })
        }
        // 큰 당첨 멈춤 — 유료든 프리스핀 판이든 방금 판이 빅윈(베팅의 10배 이상)이면 오토스핀을 끈다.
        // 프리스핀 자동진행은 주인이 달라(autoSpinTimeoutOwner) 그대로 끝까지 돈다.
        const armedNow = get().autoSpin
        if (armedNow?.stopOnBigWin && celebrationTier(result.totalWin, result.totalBet) !== 'none') {
          get().stopAutoSpin('bigWin')
        }

        // 이번 판이 프리스핀 모드 경계를 넘었으면(위에서 판정해 둔 ceremony) 곧장 커튼을 걸지 않고
        // 먼저 팝업부터 띄운다 — 커튼은 팝업이 닫힌 뒤에야 시작하고, 그동안 릴은 완전히 멈춰
        // 있는다. 경계를 넘지 않은 판(평범한 유료 판, 진행 중인 프리스핀, 재발동)은 예전 그대로
        // 곧바로 setMode를 부르고(렌더러가 같은 모드면 알아서 커튼을 건너뛴다) 다음 판을 예약한다.
        if (ceremony) {
          applyRoundFlow(
            { type: 'ceremonyStarted', popup: ceremony.popup, to: ceremony.to, withCurtain: renderer !== null },
            get,
            set,
          )
        } else {
          // 시각 모드 전환(커튼) — 스핀/뮤테이션/승리 연출이 다 끝난 지금에서야 건다. 같은 모드면
          // 렌더러가 스스로 건너뛴다(modeTransitionTarget) — store가 판단하지 않는다.
          renderer?.setMode?.({ freeSpins: toRendererFreeSpinsMode(result.freeSpins) })

          // 빅윈 오버레이는 이 판의 **앞쪽**에서 이미 뜨고 닫혔다(위 try 참고) — 여기서는 평범한
          // 판과 똑같이 다음 판만 예약한다. 오버레이가 화면을 붙들고 있던 동안에는 이 자리에
          // 도달하지도 않으므로, 그 사이에 다음 판이 걸릴 수 없다.
          scheduleNextRound(get)
        }
      }
    }
  },

  async replayRespin(response) {
    const { gameId, math, renderer, phase } = get()
    if (!gameId || !math || !renderer || phase !== 'idle') return
    // 스핀 버튼이 STOP이 되고 입력이 잠긴다. 지난 판의 건너뛰기 요청은 비운다.
    currentSpinHandle = null
    skipRequested = false
    set({ phase: 'spinning' })
    try {
      const handle = renderer.spinTo(response.stops, buildSpinToOptions(response))
      currentSpinHandle = handle
      await handle
      currentSpinHandle = null
      if (get().gameId !== gameId) return
      if (renderer.endRespin !== undefined) {
        set({ phase: 'showingWin' })
        await renderer.endRespin()
      }
    } catch (err) {
      // 연출 실패는 서버 결과와 무관하다(표시 전용 재생이다). 원인만 남기고 평소 화면으로 돌아간다.
      console.error('[game] respin replay failed', err)
    } finally {
      currentSpinHandle = null
      clearRespinReplay(gameId)
      if (get().gameId === gameId) set({ phase: 'idle' })
    }
  },

  dismissRoundPopup() {
    applyRoundFlow({ type: 'popupDismissed' }, get, set)
  },

  dismissWinCelebration() {
    settleWinCelebration(get, set)
  },

  setBoardPlayerReady(ready) {
    boardPlayerReady = ready
  },

  finishBoard() {
    if (get().boardPlay !== null) set({ boardPlay: null })
    const resume = boardGate
    boardGate = null
    resume?.()
  },

  resumeBoard(request) {
    const { phase, boardPlay, gameId } = get()
    if (boardPlay !== null || gameId === null) return
    if (phase === 'spinning' || phase === 'showingWin') return
    set({ boardPlay: request })
  },

  notifyCurtain(to, phase) {
    applyRoundFlow(phase === 'start' ? { type: 'curtainStarted', to } : { type: 'curtainEnded' }, get, set)
    // 룰렛 진입·퇴장 클립이 다 걷혔다 — 기다리던 흐름을 깨운다.
    if (phase === 'end') resolveCurtainWaiters(to)
  },

  finishRoulette() {
    const resume = rouletteGate
    rouletteGate = null
    resume?.()
  },

  async resumeRoulette() {
    const { gameId, math, phase, roulette } = get()
    if (!gameId || !math?.stageRoulette || roulette !== null || phase !== 'idle') return
    const cache = readRouletteCache(gameId)
    if (cache === null) return
    const session: RouletteSession = {
      gameId,
      roundId: cache.roundId,
      feature: cache.feature,
      totalBet: cache.totalBet,
      baseWin: cache.baseWin,
      totalWin: cache.totalWin,
      startAt: cache.shownSteps,
      resumed: true,
      stage: 'curtain',
    }
    // 입력을 잠그고(showingWin) 이어 본다. 정산은 이미 끝났으니 지갑·lastResult는 건드리지 않는다.
    set({ roulette: session, phase: 'showingWin' })
    try {
      await playRouletteSession(gameId, math.stageRoulette.songs, { immediate: true }, get, set)
    } finally {
      if (get().gameId === gameId) {
        set({ roulette: null, phase: 'idle' })
        scheduleNextRound(get)
      }
    }
  },

  startAutoSpin(count, options = {}) {
    if (Number.isNaN(count) || count <= 0) return
    const { phase, freeSpins } = get()
    if (phase === 'loading' || phase === 'error') return

    const startCoins = useSessionStore.getState().wallet?.coins ?? 0
    const lossLimit = options.lossLimit ?? null
    // 첫 판부터 한도를 넘는 베팅이면(예: 시작 잔액이 작은데 베팅이 큼) 시작하지 않고 이유를 알린다.
    const firstBet = freeSpins ? undefined : get().math?.betLevels[get().betIndex]
    if (firstBet !== undefined && exceedsLossLimit({ startCoins, net: 0, nextBet: firstBet, lossLimit })) {
      set({ autoSpinNotice: { reason: 'lossLimitStart', limitAmount: Math.floor(startCoins * (lossLimit ?? 0)), id: Date.now() } })
      return
    }

    set({
      autoSpin: {
        remaining: Math.floor(count),
        startCoins,
        net: 0,
        lossLimit,
        stopOnBigWin: options.stopOnBigWin === true,
      },
      autoSpinNotice: null,
    })

    // 프리스핀이 돌고 있으면 그 루프가 주인이다 — 오토스핀은 카운터만 들고 기다렸다가 끝난 뒤
    // 이어받는다. 스핀/승리 연출 중이면 그 판의 finally가 다음 판을 알아서 예약한다.
    if (freeSpins) return
    if (phase === 'idle') void get().spin()
  },

  dismissAutoSpinNotice() {
    if (get().autoSpinNotice !== null) set({ autoSpinNotice: null })
  },

  stopAutoSpin(reason) {
    // 지금 돌고 있는 판은 그대로 마치게 두고, 오토스핀이 걸어 둔 다음 판 예약만 거둬들인다.
    // 프리스핀 자동진행이 걸어 둔 타이머는 주인이 다르므로 건드리지 않는다. 세리머니가 끝난 뒤의
    // 재개도 따로 지울 게 없다 — 무엇을 이어갈지는 그때 store 상태를 다시 읽어 정하므로
    // (scheduleNextRound), autoSpin을 null로 만드는 것만으로 재개가 사라진다.
    if (autoSpinTimeoutOwner === 'autoSpin') clearScheduledSpin()
    const armed = get().autoSpin
    if (armed === null) return
    if (reason) {
      set({
        autoSpin: null,
        autoSpinNotice: {
          reason,
          limitAmount: armed.lossLimit === null ? null : Math.floor(armed.startCoins * armed.lossLimit),
          id: Date.now(),
        },
      })
    } else {
      set({ autoSpin: null })
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
    const walletBefore = useSessionStore.getState().wallet?.coins ?? 0
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
    // 세션 손익 — 요청 전후 지갑 차이에 «걸려 있는 금액(에스크로)»의 변화를 더한다. 졌을 때는 지갑이 그대로여도
    // 걸려 있던 금액만큼 잃은 것이고, 이겨서 계속 걸면 늘어난 만큼 번 것이다.
    const escrowAfter = response.outcome === 'win' && response.stepsLeft > 0 && !response.autoCollected ? response.pendingWin : 0
    usePlaySessionStore
      .getState()
      .recordGambleDelta(walletBefore + session.pendingWin, response.wallet.coins + escrowAfter)
    const armedGamble = get().autoSpin
    if (armedGamble) {
      const gambleNet = response.wallet.coins + escrowAfter - (walletBefore + session.pendingWin)
      set({ autoSpin: { ...armedGamble, net: armedGamble.net + gambleNet } })
    }
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
    if (currentFrostPlaying) {
      // 얼림 도중 STOP: 남은 단계를 압축해 곧장 마친다(결과·순서 그대로).
      get().renderer?.skipFrost?.()
      return
    }
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
    // 게임 화면을 벗어나는데 예약된 자동 프리스핀/건너뛰기 요청이나 떠 있는 세리머니 팝업이
    // 남아있으면 안 된다.
    cancelAutoSpin()
    applyRoundFlow({ type: 'aborted' }, get, set)
    // 오버레이 앞에 멈춰 서 있던 판이 있으면 깨워 보낸다 — 안 그러면 그 spin()이 영영 대기한다
    // (깨어난 쪽은 gameId가 달라진 것을 보고 남은 연출 없이 물러난다).
    settleWinCelebration(get, set)
    // 말판 앞에 멈춰 서 있던 판도 깨워 보낸다(깨어난 쪽은 gameId가 달라진 것을 보고 물러난다).
    const resumeBoard = boardGate
    boardGate = null
    resumeBoard?.()
    // 무대 룰렛 앞에 멈춰 서 있던 판과 커튼을 기다리던 약속도 깨워 보낸다(깨어난 쪽은 gameId가 달라진 것을 보고 물러난다).
    const rouletteResume = rouletteGate
    rouletteGate = null
    rouletteResume?.()
    releaseAllCurtainWaiters()
    currentSpinHandle = null
    skipRequested = false
    // 진행 중이던 승리 연출 순환을 걷어낸다 — 안 그러면 다음에 이 게임에 다시 들어왔을 때(또는
    // 렌더러가 재사용되는 경우) 이전 라운드의 라인 하이라이트가 화면에 남아있을 수 있다.
    get().renderer?.clearWins?.()
    set(initialState)
  },
}))

/** 얼림이 재생되는 중인가. SPIN/STOP 버튼이 «다음 스핀» 대신 «남은 단계 압축»을 하게 한다. */
export function isFrostPlaying(): boolean {
  return currentFrostPlaying
}
