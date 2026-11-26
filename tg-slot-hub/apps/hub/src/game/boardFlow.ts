/**
 * 말판 재생 상태 기계 — 순수 모듈. 타이머도 DOM도 없이 «순서와 길이»만 정한다(`roundFlow.ts`와 같은 방식).
 *
 * 서버가 말판 전체(던지기 목록)를 이미 정해 보냈고, 여기서 하는 일은 그 기록을 던지기 하나씩 보여 주는
 * 순서를 정하는 것뿐이다. **입력(탭·자동·빨리 감기)은 보여 주는 속도만 바꾸고 결과는 절대 바꾸지 못한다** —
 * 상태에는 결과 값이 아예 들어 있지 않고, 던지기 번호(`index`)와 몇 번 보여 줬는가(`shown`)만 있다.
 *
 * 한 던지기의 흐름:
 *   ready ─(탭/자동)→ throwing(윷가락이 돈다) → calling(「걸! 3칸」) → moving(말이 칸을 건넌다)
 *         → effect(칸 효과·갈림길 열림, 이때 HUD가 그 던지기 뒤 값으로 갱신) → ready … → summary → closing → done
 *
 * 컴포넌트는 `effects`를 실행(소리·애니메이션)한다. 타이머는 하나뿐이다 — `schedule`이 오면 기존 것을 갈아
 * 끼워 그 시간 뒤에 `tick`을 보내고, `cancelTimer`가 오면 거둔다. 둘 다 없으면 걸려 있던 타이머를 그대로 둔다.
 */
import type { BoardBonusFeature, BoardTileKind } from '@tgslot/shared'
import type { BoardBonusConfig } from '@tgslot/slot-engine'
import type { SpinSpeed } from '../store/settings'

export type BoardPhase = 'intro' | 'ready' | 'throwing' | 'calling' | 'moving' | 'effect' | 'summary' | 'closing' | 'done'

/** 던지기 하나를 재생하려면 알아야 하는 것만 추려 둔 계획. */
export interface PlannedThrow {
  steps: number
  /** 말이 건너는 칸 수(앞으로 칸이 더 옮긴 칸 포함). */
  hops: number
  /** 그 던지기가 갈림길에 딱 멈췄는가 → 지름길 열림 연출. */
  fork: boolean
  extraThrow: boolean
  tile: BoardTileKind
  /** 판의 마지막 던지기(결승 도착·마지막 등불 꺼짐·기회 끝) → 효과 뒤 «마무리» 시간을 더 머문다. */
  last?: boolean
}

/** 서버 기록 + 수학 설정 → 재생 계획. */
export function planBoardThrows(config: BoardBonusConfig, feature: Pick<BoardBonusFeature, 'throws'>): PlannedThrow[] {
  return feature.throws.map((record, i) => ({
    steps: record.steps,
    hops: record.path.length + (record.forward?.length ?? 0),
    fork: config.forks[record.at] !== undefined,
    extraThrow: record.extraThrow,
    tile: record.tile,
    last: i === feature.throws.length - 1,
  }))
}

// ───────────────────────── 시간 예산 ─────────────────────────

export interface BoardTimings {
  /** 진입: 등불 3개 점등 + 「말판 보너스 · 기회 N번」 배너. */
  introMs: number
  /** 윷가락이 날고 뒤집히는 시간. */
  throwMs: number
  /** 결과 표시(「걸! 3칸」). */
  callMs: number
  /** 칸당 이동 시간(앞으로 칸 추가 이동도 같다). */
  hopMs: number
  /** 모션 축소에서 이동 전체를 대신하는 한 번 페이드 시간. */
  moveFlatMs: number
  /** 칸 효과(코인·배수·함정·한 번 더). */
  effectMs: number
  /** 갈림길 열림이 더하는 시간(지름길 칸 등불이 차례로 켜진다). */
  forkMs: number
  /** 자동 모드에서 다음 던지기까지 대기. */
  autoWaitMs: number
  /** 자동 모드로 첫 던지기까지 대기. */
  firstAutoWaitMs: number
  /** 요약 카드가 자동으로 닫히기까지(자동 모드). */
  summaryAutoCloseMs: number
  /**
   * 마지막 던지기의 효과 뒤에 더 머무는 시간 — 결승 등불탑 점등·불꽃(또는 마지막 등불 꺼짐)을 보고 느낄 틈.
   * 이것이 없으면 «결승! 큰 상»이 0.45초 만에 요약 카드에 덮인다(플레이어 QA).
   */
  finaleMs: number
}

/** 속도별 시간표(PLAN §7-4). 모션 축소면 이동·날기를 없애고 결과만 짧게 보여 준다. */
export const BOARD_TIMINGS: Record<SpinSpeed, BoardTimings> = {
  normal: {
    introMs: 1500,
    throwMs: 650,
    callMs: 350,
    hopMs: 180,
    moveFlatMs: 0,
    effectMs: 450,
    forkMs: 500,
    autoWaitMs: 600,
    firstAutoWaitMs: 1200,
    summaryAutoCloseMs: 3200,
    finaleMs: 1200,
  },
  quick: {
    introMs: 1100,
    throwMs: 450,
    callMs: 250,
    hopMs: 130,
    moveFlatMs: 0,
    effectMs: 320,
    forkMs: 350,
    autoWaitMs: 400,
    firstAutoWaitMs: 800,
    summaryAutoCloseMs: 2600,
    finaleMs: 1000,
  },
  turbo: {
    introMs: 700,
    throwMs: 300,
    callMs: 150,
    hopMs: 90,
    moveFlatMs: 0,
    effectMs: 220,
    forkMs: 250,
    autoWaitMs: 250,
    firstAutoWaitMs: 500,
    summaryAutoCloseMs: 2200,
    finaleMs: 800,
  },
}

/** 모션 축소: 날기 0, 결과 200, 이동은 한 번 페이드, 효과 150, 갈림길 추가 없음, 대기 300. */
export const BOARD_TIMINGS_REDUCED: BoardTimings = {
  introMs: 400,
  throwMs: 0,
  callMs: 200,
  hopMs: 0,
  moveFlatMs: 120,
  effectMs: 150,
  forkMs: 0,
  autoWaitMs: 300,
  firstAutoWaitMs: 400,
  summaryAutoCloseMs: 2000,
    finaleMs: 900,
}

export function boardTimingsFor(speed: SpinSpeed, reducedMotion: boolean): BoardTimings {
  return reducedMotion ? BOARD_TIMINGS_REDUCED : BOARD_TIMINGS[speed]
}

/** 탭으로 «지금 던지기 끝내기»를 눌렀을 때 남은 단계마다 주는 시간(전체로 약 120~200ms). */
export const SKIP_PHASE_MS = { throw: 30, call: 30, move: 60, effect: 60 } as const
/** ⏩ 1회: 남은 던지기를 던지기당 300ms로 압축한다(던지기 30 + 결과 30 + 이동 120 + 효과 120). */
export const FAST_PHASE_MS = { throw: 30, call: 30, move: 120, effect: 120 } as const
/** 마지막 던지기 마무리 시간 — ⏩ 빨리 감기 중(500)·탭으로 넘긴 던지기(300). ⏭ 요약 직행은 건너뛴다. */
export const FAST_FINALE_MS = 500
export const SKIP_FINALE_MS = 300
/** 요약 카드를 자동으로 닫을 수 없을 때(자동 꺼짐)를 위한 안전장치. 사용자가 탭하는 것이 기본이다. */
export const SUMMARY_SAFETY_CLOSE_MS = 12_000

export type BoardSubPhase = 'throw' | 'call' | 'move' | 'effect'

/** 한 단계의 길이(ms). `compress`가 켜져 있으면 속도와 무관하게 압축 값을 쓴다. */
export function subPhaseMs(
  sub: BoardSubPhase,
  planned: PlannedThrow,
  timings: BoardTimings,
  mode: { compress: boolean; fast: boolean },
): number {
  const finale = sub === 'effect' && planned.last === true
  if (mode.fast) {
    if (sub === 'move') return Math.min(FAST_PHASE_MS.move, planned.hops * 40 + 40)
    return FAST_PHASE_MS[sub] + (finale ? FAST_FINALE_MS : 0)
  }
  if (mode.compress) return SKIP_PHASE_MS[sub] + (finale ? SKIP_FINALE_MS : 0)
  switch (sub) {
    case 'throw':
      return timings.throwMs
    case 'call':
      return timings.callMs
    case 'move':
      return timings.hopMs === 0 ? timings.moveFlatMs : planned.hops * timings.hopMs
    case 'effect':
      return timings.effectMs + (planned.fork ? timings.forkMs : 0) + (finale ? timings.finaleMs : 0)
  }
}

/** 자동 재생으로 처음부터 끝까지(요약 전까지) 걸리는 시간 추정(ms). 게이트 테스트와 문서용. */
export function estimateAutoPlayMs(plan: readonly PlannedThrow[], timings: BoardTimings): number {
  let total = timings.introMs + timings.firstAutoWaitMs
  plan.forEach((planned, i) => {
    const mode = { compress: false, fast: false }
    total +=
      subPhaseMs('throw', planned, timings, mode) +
      subPhaseMs('call', planned, timings, mode) +
      subPhaseMs('move', planned, timings, mode) +
      subPhaseMs('effect', planned, timings, mode)
    if (i < plan.length - 1) total += timings.autoWaitMs
  })
  return total
}

// ───────────────────────── 상태 기계 ─────────────────────────

export interface BoardFlowState {
  readonly phase: BoardPhase
  readonly plan: readonly PlannedThrow[]
  readonly timings: BoardTimings
  /** HUD에 반영된 던지기 수. 칸 효과가 시작되는 순간 `index + 1`이 된다. */
  readonly shown: number
  /** 지금 재생 중인(또는 다음에 던질) 던지기 번호(0부터). */
  readonly index: number
  readonly auto: boolean
  /**
   * 자동을 플레이어가 골랐는가(오토스핀 진입 또는 [자동] 버튼). ⏩가 켠 자동은 아니다 —
   * 요약 카드는 이것이 참일 때만 저절로 닫힌다(기획 7-6 «오토스핀이면 자동»). ⏩로 건너뛴 사람은 결과를 보고 [받기]를 누른다.
   */
  readonly autoChosen: boolean
  /** 0 보통 / 1 압축 재생(남은 던지기 전부) / 2 요약 직행. */
  readonly fast: 0 | 1 | 2
  /** 지금 던지기만 압축(탭). 다음 던지기에서 풀린다. */
  readonly compress: boolean
}

export type BoardFlowEvent =
  /** 던지기 버튼 / 스페이스. */
  | { readonly type: 'throw' }
  /** 시간이 다 됐다(컴포넌트가 `schedule`을 실행한 결과). */
  | { readonly type: 'tick' }
  | { readonly type: 'toggleAuto' }
  /** ⏩ 버튼. 1회 압축 재생, 2회 요약 직행. */
  | { readonly type: 'fastForward' }
  /** 재생 중 화면 탭 — 지금 던지기를 곧장 끝낸다. 진입 연출 중이면 진입을 접는다. */
  | { readonly type: 'skip' }
  /** [받기] 탭. */
  | { readonly type: 'closeSummary' }
  /** 복귀 커튼이 덮였다/끝났다. */
  | { readonly type: 'closed' }
  /** 화면 이탈 — 무엇이든 조용히 접는다. */
  | { readonly type: 'abort' }

export type BoardFlowEffect =
  /** 이 시간 뒤에 `tick`을 보낸다. 걸려 있던 타이머는 이것으로 갈아 끼운다. */
  | { readonly type: 'schedule'; readonly ms: number }
  /** 걸려 있던 타이머를 거둔다(자동을 껐거나 요약을 닫았다). */
  | { readonly type: 'cancelTimer' }
  /** 진입 연출(등불 점등 + 배너) 시작. */
  | { readonly type: 'intro' }
  /** 던지기 차례를 기다린다(버튼 활성). */
  | { readonly type: 'ready' }
  | { readonly type: 'throw'; readonly index: number; readonly compressed: boolean }
  | { readonly type: 'call'; readonly index: number; readonly compressed: boolean }
  | { readonly type: 'move'; readonly index: number; readonly compressed: boolean }
  /** HUD를 그 던지기 뒤 값으로 올리고 칸 효과를 보여 준다. */
  | { readonly type: 'applyTile'; readonly index: number; readonly compressed: boolean }
  /** 갈림길에 딱 멈췄다 — 지름길 칸 등불이 차례로 켜진다. */
  | { readonly type: 'openFork'; readonly index: number }
  /** 지금 돌고 있는 애니메이션을 끝 상태로 접는다. */
  | { readonly type: 'compress' }
  | { readonly type: 'summary' }
  /** 복귀 전환(커튼)을 시작한다. 덮이면 컴포넌트가 `closed`를 보낸다. */
  | { readonly type: 'finish' }

export interface BoardFlowResult {
  readonly state: BoardFlowState
  readonly effects: readonly BoardFlowEffect[]
}

const NONE: readonly BoardFlowEffect[] = []

export interface CreateBoardFlowOptions {
  plan: readonly PlannedThrow[]
  timings: BoardTimings
  /** 오토스핀 중 진입하면 자동 재생으로 시작한다. */
  auto?: boolean
  /** 복원: 이만큼 보여 준 상태에서 이어 간다(진입 연출 없음). */
  resumeShown?: number
}

/** 시작 상태와 첫 효과. 복원이 아니면 진입 연출부터, 복원이면 곧장 그 던지기 차례부터다. */
export function createBoardFlow(options: CreateBoardFlowOptions): BoardFlowResult {
  const { plan, timings } = options
  const auto = options.auto === true
  const base = { plan, timings, auto, autoChosen: auto, fast: 0 as const, compress: false }
  if (options.resumeShown === undefined) {
    return {
      state: { ...base, phase: 'intro', shown: 0, index: 0 },
      effects: [{ type: 'intro' }, { type: 'schedule', ms: timings.introMs }],
    }
  }
  const shown = Math.max(0, Math.min(options.resumeShown, plan.length))
  if (shown >= plan.length) {
    return {
      state: { ...base, phase: 'summary', shown: plan.length, index: Math.max(0, plan.length - 1) },
      effects: [{ type: 'summary' }, summarySchedule({ ...base, phase: 'summary', shown, index: 0 })],
    }
  }
  const state: BoardFlowState = { ...base, phase: 'ready', shown, index: shown }
  return { state, effects: readyEffects(state, true) }
}

function summarySchedule(state: BoardFlowState): BoardFlowEffect {
  return { type: 'schedule', ms: state.autoChosen ? state.timings.summaryAutoCloseMs : SUMMARY_SAFETY_CLOSE_MS }
}

/** ready에 들어갈 때의 효과: 버튼 활성 + (자동이면) 대기 시간 뒤 자동 던지기. */
function readyEffects(state: BoardFlowState, first: boolean): BoardFlowEffect[] {
  const effects: BoardFlowEffect[] = [{ type: 'ready' }]
  if (state.fast > 0) effects.push({ type: 'schedule', ms: 0 })
  else if (state.auto) effects.push({ type: 'schedule', ms: first && state.shown === 0 ? state.timings.firstAutoWaitMs : state.timings.autoWaitMs })
  return effects
}

function plannedAt(state: BoardFlowState, index: number): PlannedThrow {
  const planned = state.plan[index]
  if (planned === undefined) throw new RangeError(`던지기 ${index}번이 계획에 없다`)
  return planned
}

function isCompressed(state: BoardFlowState): boolean {
  return state.compress || state.fast > 0
}

function subDuration(state: BoardFlowState, sub: BoardSubPhase): number {
  return subPhaseMs(sub, plannedAt(state, state.index), state.timings, { compress: state.compress, fast: state.fast > 0 })
}

function startThrow(state: BoardFlowState): BoardFlowResult {
  const next: BoardFlowState = { ...state, phase: 'throwing', index: state.shown, compress: false }
  const compressed = isCompressed(next)
  return {
    state: next,
    effects: [
      { type: 'throw', index: next.index, compressed },
      { type: 'schedule', ms: subDuration(next, 'throw') },
    ],
  }
}

function jumpToSummary(state: BoardFlowState): BoardFlowResult {
  const next: BoardFlowState = { ...state, phase: 'summary', shown: state.plan.length, index: Math.max(0, state.plan.length - 1), fast: 2, compress: true }
  return { state: next, effects: [{ type: 'compress' }, { type: 'summary' }, summarySchedule(next)] }
}

/** 진행 중(throwing~effect)인 상태에서 다음 단계로. */
function advance(state: BoardFlowState): BoardFlowResult {
  const compressed = isCompressed(state)
  switch (state.phase) {
    case 'throwing': {
      const next: BoardFlowState = { ...state, phase: 'calling' }
      return {
        state: next,
        effects: [{ type: 'call', index: next.index, compressed }, { type: 'schedule', ms: subDuration(next, 'call') }],
      }
    }
    case 'calling': {
      const next: BoardFlowState = { ...state, phase: 'moving' }
      return {
        state: next,
        effects: [{ type: 'move', index: next.index, compressed }, { type: 'schedule', ms: subDuration(next, 'move') }],
      }
    }
    case 'moving': {
      const next: BoardFlowState = { ...state, phase: 'effect', shown: state.index + 1 }
      const planned = plannedAt(next, next.index)
      const effects: BoardFlowEffect[] = [{ type: 'applyTile', index: next.index, compressed }]
      if (planned.fork) effects.push({ type: 'openFork', index: next.index })
      effects.push({ type: 'schedule', ms: subDuration(next, 'effect') })
      return { state: next, effects }
    }
    case 'effect': {
      if (state.index + 1 >= state.plan.length) {
        const next: BoardFlowState = { ...state, phase: 'summary', compress: false }
        return { state: next, effects: [{ type: 'summary' }, summarySchedule(next)] }
      }
      const next: BoardFlowState = { ...state, phase: 'ready', index: state.index + 1, compress: false }
      return { state: next, effects: readyEffects(next, false) }
    }
    default:
      return { state, effects: NONE }
  }
}

function inPlayback(phase: BoardPhase): boolean {
  return phase === 'throwing' || phase === 'calling' || phase === 'moving' || phase === 'effect'
}

/**
 * 다음 상태와 그때 실행할 효과. 받아들일 수 없는 이벤트(늦게 온 tick, 두 번 눌린 버튼)는
 * 조용히 무시한다 — 상태를 그대로 돌려준다.
 */
export function boardFlowReducer(state: BoardFlowState, event: BoardFlowEvent): BoardFlowResult {
  if (event.type === 'abort') {
    return state.phase === 'done' ? { state, effects: NONE } : { state: { ...state, phase: 'done' }, effects: NONE }
  }
  if (state.phase === 'done') return { state, effects: NONE }

  if (event.type === 'toggleAuto') {
    const auto = !state.auto
    const next: BoardFlowState = { ...state, auto, autoChosen: auto, fast: auto ? state.fast : 0 }
    // ready에서는 타이머 유무가 바뀐다. 재생 중인 단계의 타이머는 그대로 두고 다음 전이가 자동 여부를 읽는다.
    if (state.phase === 'ready') {
      return { state: next, effects: auto ? [{ type: 'schedule', ms: next.timings.autoWaitMs }] : [{ type: 'cancelTimer' }] }
    }
    if (state.phase === 'summary') return { state: next, effects: [summarySchedule(next)] }
    return { state: next, effects: NONE }
  }

  switch (state.phase) {
    case 'intro':
      if (event.type === 'tick' || event.type === 'skip') {
        const next: BoardFlowState = { ...state, phase: 'ready', index: state.shown }
        return { state: next, effects: readyEffects(next, true) }
      }
      if (event.type === 'fastForward') return jumpToSummary(state)
      return { state, effects: NONE }

    case 'ready':
      if (event.type === 'throw' || event.type === 'tick') return startThrow(state)
      if (event.type === 'fastForward') {
        if (state.fast === 0) {
          const next: BoardFlowState = { ...state, fast: 1, auto: true }
          return startThrow(next)
        }
        return jumpToSummary(state)
      }
      return { state, effects: NONE }

    case 'throwing':
    case 'calling':
    case 'moving':
    case 'effect':
      if (event.type === 'tick') return advance(state)
      if (event.type === 'skip') {
        if (state.compress || state.fast > 0) return { state, effects: NONE }
        const next: BoardFlowState = { ...state, compress: true }
        // 지금 단계의 남은 시간을 압축한 값으로 다시 건다.
        const sub: BoardSubPhase =
          state.phase === 'throwing' ? 'throw' : state.phase === 'calling' ? 'call' : state.phase === 'moving' ? 'move' : 'effect'
        return { state: next, effects: [{ type: 'compress' }, { type: 'schedule', ms: subDuration(next, sub) }] }
      }
      if (event.type === 'fastForward') {
        if (state.fast === 0) {
          const next: BoardFlowState = { ...state, fast: 1, auto: true, compress: true }
          const sub: BoardSubPhase =
            state.phase === 'throwing' ? 'throw' : state.phase === 'calling' ? 'call' : state.phase === 'moving' ? 'move' : 'effect'
          return { state: next, effects: [{ type: 'compress' }, { type: 'schedule', ms: subDuration(next, sub) }] }
        }
        return jumpToSummary(state)
      }
      return { state, effects: NONE }

    case 'summary':
      if (event.type === 'closeSummary' || event.type === 'tick') {
        return { state: { ...state, phase: 'closing' }, effects: [{ type: 'cancelTimer' }, { type: 'finish' }] }
      }
      return { state, effects: NONE }

    case 'closing':
      if (event.type === 'closed') return { state: { ...state, phase: 'done' }, effects: NONE }
      return { state, effects: NONE }

    default:
      return { state, effects: NONE }
  }
}

/** 재생 중인가(탭이 «지금 던지기 끝내기»로 읽혀야 하는가). */
export function isBoardPlayback(state: Pick<BoardFlowState, 'phase'>): boolean {
  return inPlayback(state.phase) || state.phase === 'intro'
}
