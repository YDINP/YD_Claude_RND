/**
 * 코인 리스핀 표시용 진행 — HUD(남은 횟수 점·판 위 코인 합계)와 보물 띠가 읽는 작은 스토어.
 *
 * **값의 주인은 서버다.** 여기에 들어오는 숫자는 전부 렌더러가 서버 피처(`coinRespin`)를 재생하며 내보내는 이벤트에서만
 * 온다. 클라이언트가 스스로 정하는 것은 없다. 공용 `store/game.ts`는 건드리지 않는다(세 팀이 함께 고치는 파일).
 * 이벤트를 접는 규칙은 순수 함수(`reduceRespinView`)라 타이머·렌더러 없이 순서를 그대로 검증한다.
 */
import { create } from 'zustand'
import type { RendererEvent } from '@tgslot/renderer'

export type TreasureTier = 'small' | 'medium' | 'large'

export type RespinPhase = 'idle' | 'pulse' | 'cave' | 'spinning' | 'wrapping' | 'collecting' | 'done'

export interface RespinView {
  /** 동굴 안인가(HUD를 보인다). 복귀 전환이 덮은 순간 꺼진다. */
  active: boolean
  phase: RespinPhase
  /** 시작 횟수(점의 개수). */
  respins: number
  /** 남은 횟수. */
  left: number
  /** 지금 도는 리스핀이 «1회 남음»인가. */
  last: boolean
  /** 비어 있는 칸. */
  empty: number
  /** 판 위 코인 금액 합(감기까지 반영). */
  coinTotal: number
  /** 이번 라운드에 판에 나온 보물 단계(띠가 «등장»으로 켠다). */
  seen: readonly TreasureTier[]
  /** 정산에서 지급이 확인된 보물 단계(띠가 «지급»으로 켠다). */
  paid: readonly TreasureTier[]
  /** 15칸을 채워 «최고 보물»이 지급됐나. */
  topPaid: boolean
  /** «최고 보물» 연출이 지금 도는 중인가(띠의 최고 보물 칸이 커진다). */
  topShowing: boolean
  /** 정산 중 지금까지 센 누적 금액. */
  collected: number
  /** 지금 감기는 줄(없으면 null). */
  wrapping: number | null
  /** 지금까지 판에 올라온 코인 수(진입 펄스 진행). */
  pulses: number
}

export const INITIAL_RESPIN_VIEW: RespinView = {
  active: false,
  phase: 'idle',
  respins: 3,
  left: 3,
  last: false,
  empty: 0,
  coinTotal: 0,
  seen: [],
  paid: [],
  topPaid: false,
  topShowing: false,
  collected: 0,
  wrapping: null,
  pulses: 0,
}

const TIER_ORDER: readonly TreasureTier[] = ['small', 'medium', 'large']

function mergeTiers(a: readonly TreasureTier[], b: readonly TreasureTier[]): readonly TreasureTier[] {
  const set = new Set([...a, ...b])
  return TIER_ORDER.filter((tier) => set.has(tier))
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

/** 이 이벤트가 코인 리스핀 표시에 쓰이는 것인가. 나머지는 이 스토어가 건드리지 않는다. */
export function isRespinEvent(event: RendererEvent): boolean {
  return (
    event.type === 'respinPulse' ||
    event.type === 'respinStart' ||
    event.type === 'respinStep' ||
    event.type === 'columnWrap' ||
    event.type === 'respinCollect' ||
    event.type === 'respinTop' ||
    event.type === 'respinEnd' ||
    (event.type === 'modeTransition' && event.to === 'base' && event.phase === 'start')
  )
}

/**
 * 렌더러 이벤트 하나를 표시 상태에 접는다. 입력을 바꾸지 않고 새 객체를 돌려준다.
 *
 * - `respinStep`의 `left`·`coinTotal`·`empty`·`treasures`는 그 리스핀이 끝난 뒤의 값이지만, 새 코인이 붙는 리스핀은
 *   `pin`(고정된 순간)에, 헛도는 리스핀은 `land`(칸이 선 순간)에 화면에 올린다. 코인이 서기도 전에 합계가 오르면 안 된다.
 * - `coinTotal`은 감기 전 값이다. 감기는 `columnWrap`의 `end`가 «전후 합의 차»만큼 더한다.
 */
export function reduceRespinView(view: RespinView, event: RendererEvent): RespinView {
  switch (event.type) {
    case 'respinPulse':
      return { ...view, phase: 'pulse', pulses: event.index + 1 }
    case 'respinStart':
      return {
        ...INITIAL_RESPIN_VIEW,
        active: true,
        phase: 'cave',
        respins: event.respins,
        left: event.respins,
        empty: event.empty,
        coinTotal: event.coinTotal,
        seen: mergeTiers([], event.treasures),
      }
    case 'respinStep': {
      if (event.phase === 'start') return { ...view, phase: 'spinning', last: event.last }
      if (event.phase === 'land') {
        // 헛돈 리스핀: 점 하나가 톡 빠진다. 새 코인이 있으면 `pin`까지 기다린다.
        if (event.newCoins.length > 0) return view
        return { ...view, left: event.left, empty: event.empty }
      }
      if (event.phase === 'pin') {
        return {
          ...view,
          left: event.left,
          empty: event.empty,
          coinTotal: event.coinTotal,
          seen: mergeTiers(view.seen, event.treasures),
        }
      }
      return { ...view, last: false }
    }
    case 'columnWrap': {
      if (event.phase === 'start') return { ...view, phase: 'wrapping', wrapping: event.reel }
      return {
        ...view,
        phase: 'cave',
        wrapping: null,
        coinTotal: view.coinTotal + (sum(event.after) - sum(event.before)),
      }
    }
    case 'respinCollect': {
      const tier = event.cell.kind === 'treasure' ? event.cell.tier : undefined
      return {
        ...view,
        phase: 'collecting',
        collected: event.running,
        paid: tier === undefined ? view.paid : mergeTiers(view.paid, [tier]),
      }
    }
    case 'respinTop':
      // 최고 보물이 상자와 함께 뜨는 순간 합계에도 바로 더한다(빅윈 롤업까지 숨기지 않는다).
      return event.phase === 'start'
        ? { ...view, topPaid: true, topShowing: true, collected: view.collected + event.amount }
        : { ...view, topShowing: false }
    case 'respinEnd':
      return {
        ...view,
        phase: 'done',
        collected: event.coinWin + event.topWin,
        topPaid: event.full || view.topPaid,
        topShowing: false,
      }
    case 'modeTransition':
      // 복귀 전환이 화면을 덮은 순간 HUD가 사라진다. 지급 표시(띠)는 다음 스핀까지 남는다.
      return event.to === 'base' && event.phase === 'start' ? { ...view, active: false, last: false, wrapping: null } : view
    default:
      return view
  }
}

interface CoinRespinStore {
  view: RespinView
  apply(event: RendererEvent): void
  /** 새 스핀·게임 이탈에서 비운다. */
  reset(): void
}

export const useCoinRespinStore = create<CoinRespinStore>((set) => ({
  view: INITIAL_RESPIN_VIEW,
  apply(event) {
    if (!isRespinEvent(event)) return
    set((state) => ({ view: reduceRespinView(state.view, event) }))
  },
  reset() {
    set({ view: INITIAL_RESPIN_VIEW })
  },
}))
