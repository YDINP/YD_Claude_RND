/**
 * 라운드 세리머니 상태 기계 — 프리스핀 **진입/종료**에서 릴이 멈춘 뒤에 벌어지는
 * "팝업 → 커튼" 구간만 다루는 순수 모듈이다.
 *
 * 왜 따로 떼어냈나:
 * 예전에는 이 구간이 GameScreen과 store에 흩어진 불리언/ref 대여섯 개
 * (`modeTransitioning`, `freeSpinsIntroDataRef`, `freeSpinsComplete`, `freeSpinsSummaryRef`,
 * `pendingAutoSpinRelease`, `pendingAutoSpinResume`)로 표현돼 있었다. 그 조합에는 "팝업이
 * 떠 있는데 커튼도 돌고 있다", "게이트가 두 개 동시에 걸려 있다" 같은 **있을 수 없는 상태**가
 * 잔뜩 있었고, 실제로 프리스핀이 멈춘 것처럼 보이는 버그의 온상이었다.
 *
 * 여기서는 상태가 정확히 셋뿐이고(`idle` / `popup` / `curtain`), 팝업과 커튼은 타입 수준에서
 * 절대 겹칠 수 없다. 부수효과(커튼 걸기, 다음 판 예약, 타이머)는 실행하지 않고 `effects`로
 * 돌려주기만 한다 — 실제 실행은 store가 한다. 그래서 타이머도 렌더러도 없이 순서를 검증할 수 있다.
 */
import type { FeatureTrigger, FreeSpinsState, SpinResponse } from '@tgslot/shared'

/** 커튼이 향하는 곳. 렌더러의 `modeTransition.to`와 같은 어휘를 쓴다. */
export type CurtainTarget = 'freeSpins' | 'base'

/**
 * 세리머니 팝업 한 장. 진입은 "몇 판을 받았는지", 종료는 "총 얼마를 땄는지"만 말한다.
 * 둘 다 사용자가 탭해서 닫는 것이 기본이고, 자동 닫힘은 안전장치다(스핀 속도와 무관하게 고정).
 */
export type RoundPopup =
  | { readonly kind: 'freeSpinsEntry'; readonly spins: number; readonly multiplier: number }
  | { readonly kind: 'freeSpinsExit'; readonly totalWin: number }

export type RoundFlowState =
  | { readonly kind: 'idle' }
  /**
   * 팝업이 떠 있다. 커튼은 아직 시작도 안 했다 — 팝업이 닫혀야 시작한다(둘은 절대 겹치지 않는다).
   * `withCurtain`이 false면(렌더러가 없는 경우) 팝업이 닫히는 즉시 세리머니가 끝난다.
   */
  | {
      readonly kind: 'popup'
      readonly popup: RoundPopup
      readonly to: CurtainTarget
      readonly withCurtain: boolean
    }
  /**
   * 커튼이 돌고 있다. `ceremonial`이 true면 이 커튼이 세리머니의 마지막 단계라
   * 다 걷힌 뒤 다음 판 예약(`ceremonyFinished`)까지 이어진다. false면 세리머니 밖에서 걸린
   * 커튼(예: 프리스핀 도중 화면에 다시 들어와 렌더러가 모드를 맞추는 경우)이라 입력만 막는다.
   */
  | { readonly kind: 'curtain'; readonly to: CurtainTarget; readonly ceremonial: boolean }

export const ROUND_FLOW_IDLE: RoundFlowState = { kind: 'idle' }

export type RoundFlowEvent =
  /** 릴·승리 연출이 다 끝났고 이번 판이 모드 경계를 넘었다 — 팝업부터 띄운다. */
  | { readonly type: 'ceremonyStarted'; readonly popup: RoundPopup; readonly to: CurtainTarget; readonly withCurtain: boolean }
  /** 사용자가 탭했거나 자동 닫힘 시간이 지났다. */
  | { readonly type: 'popupDismissed' }
  /** 렌더러의 modeTransition(phase:'start'). */
  | { readonly type: 'curtainStarted'; readonly to: CurtainTarget }
  /** 렌더러의 modeTransition(phase:'end'). */
  | { readonly type: 'curtainEnded' }
  /** 게임 화면 이탈/리셋 — 무엇이 떠 있든 조용히 걷는다. */
  | { readonly type: 'aborted' }

export type RoundFlowEffect =
  /** 자동 닫힘 안전장치를 건다. */
  | { readonly type: 'armPopupTimeout' }
  /** 걸려 있던 자동 닫힘 안전장치를 거둔다. */
  | { readonly type: 'clearPopupTimeout' }
  /** 커튼의 방아쇠를 당긴다(= renderer.setMode). 팝업이 닫힌 **뒤에만** 나온다. */
  | { readonly type: 'runCurtain'; readonly to: CurtainTarget }
  /** 세리머니가 완전히 끝났다 — 다음 판(프리스핀 자동진행 또는 오토스핀 재개)을 예약해도 된다. */
  | { readonly type: 'ceremonyFinished'; readonly to: CurtainTarget }

export interface RoundFlowResult {
  readonly state: RoundFlowState
  readonly effects: readonly RoundFlowEffect[]
}

const NO_EFFECTS: readonly RoundFlowEffect[] = []

/**
 * 다음 상태와 그때 실행해야 할 부수효과. 받아들일 수 없는 이벤트는 조용히 무시한다
 * (상태를 그대로 돌려준다) — 렌더러 이벤트는 늦게/두 번 올 수 있고, 그때 예약이 두 번 걸리거나
 * 팝업이 되살아나는 일은 없어야 한다.
 */
export function roundFlowReducer(state: RoundFlowState, event: RoundFlowEvent): RoundFlowResult {
  if (event.type === 'aborted') {
    if (state.kind === 'idle') return { state, effects: NO_EFFECTS }
    return {
      state: ROUND_FLOW_IDLE,
      effects: state.kind === 'popup' ? [{ type: 'clearPopupTimeout' }] : NO_EFFECTS,
    }
  }

  switch (state.kind) {
    case 'idle':
      if (event.type === 'ceremonyStarted') {
        return {
          state: { kind: 'popup', popup: event.popup, to: event.to, withCurtain: event.withCurtain },
          effects: [{ type: 'armPopupTimeout' }],
        }
      }
      // 세리머니 밖에서 걸린 커튼 — 입력만 막고, 걷히면 아무 것도 이어가지 않는다.
      if (event.type === 'curtainStarted') {
        return { state: { kind: 'curtain', to: event.to, ceremonial: false }, effects: NO_EFFECTS }
      }
      return { state, effects: NO_EFFECTS }

    case 'popup':
      if (event.type === 'popupDismissed') {
        if (!state.withCurtain) {
          return {
            state: ROUND_FLOW_IDLE,
            effects: [{ type: 'clearPopupTimeout' }, { type: 'ceremonyFinished', to: state.to }],
          }
        }
        return {
          state: { kind: 'curtain', to: state.to, ceremonial: true },
          effects: [{ type: 'clearPopupTimeout' }, { type: 'runCurtain', to: state.to }],
        }
      }
      // 팝업이 떠 있는 동안에는 커튼이 시작될 수 없다 — 방아쇠를 아직 당기지 않았다.
      return { state, effects: NO_EFFECTS }

    case 'curtain':
      if (event.type === 'curtainEnded') {
        return {
          state: ROUND_FLOW_IDLE,
          effects: state.ceremonial ? [{ type: 'ceremonyFinished', to: state.to }] : NO_EFFECTS,
        }
      }
      return { state, effects: NO_EFFECTS }
  }
}

/**
 * 지금 새 스핀을 시작해도 되는가. 팝업이 떠 있거나 커튼이 도는 동안은 **어떤 경로로도**
 * (자동진행·오토스핀·스핀 버튼·스테이지 탭·스페이스) 릴이 다시 돌면 안 된다.
 */
export function canStartSpin(state: RoundFlowState): boolean {
  return state.kind === 'idle'
}

/** 팝업/커튼이 화면을 붙들고 있는 동안인가(UI 입력 잠금과 같은 뜻). */
export function isRoundFlowBusy(state: RoundFlowState): boolean {
  return state.kind !== 'idle'
}

/** 지금 떠 있는 팝업. 없으면 null. */
export function activePopup(state: RoundFlowState): RoundPopup | null {
  return state.kind === 'popup' ? state.popup : null
}

/** 이번 스핀 응답 중 세리머니 판단에 필요한 부분만. store 테스트가 통째로 SpinResponse를 만들지 않아도 된다. */
export type RoundOutcome = Pick<SpinResponse, 'freeSpins' | 'features' | 'totalWin'> &
  Partial<Pick<SpinResponse, 'freeSpinsSummary'>>

function freeSpinsGrant(features: readonly FeatureTrigger[]): { spins: number; multiplier: number } | null {
  for (const feature of features) {
    if (feature.type === 'freeSpins' && !feature.retrigger) {
      return { spins: feature.spins, multiplier: feature.multiplier }
    }
  }
  return null
}

/**
 * 이번 판이 프리스핀 모드 경계를 넘었는지, 넘었다면 어떤 팝업을 띄우고 커튼을 어디로 걸어야 하는지.
 *
 * `before`는 **스핀 시작 전**의 프리스핀 상태다(응답이 아니라). 경계를 넘지 않은 판
 * (평범한 유료 판, 진행 중인 프리스핀, 재발동)은 null이라 세리머니 자체가 없다.
 *
 * 종료 팝업의 총액은 서버가 준 `freeSpinsSummary.total`이 유일한 권위다. 옛 서버/재전송 응답처럼
 * 그 필드가 없을 때만 "세션 누적 + 이번 판 당첨"으로 되짚는다 — 마지막 판의 당첨은 서버가
 * freeSpins를 이미 null로 내려보내 accumulatedWin에 실리지 않기 때문이다.
 */
export function ceremonyFor(
  before: FreeSpinsState | null,
  result: RoundOutcome,
): { popup: RoundPopup; to: CurtainTarget } | null {
  const after = result.freeSpins !== null && result.freeSpins.left > 0 ? result.freeSpins : null

  if (before === null && after !== null) {
    const grant = freeSpinsGrant(result.features)
    return {
      to: 'freeSpins',
      popup: {
        kind: 'freeSpinsEntry',
        spins: grant?.spins ?? after.total,
        multiplier: grant?.multiplier ?? after.multiplier,
      },
    }
  }

  if (before !== null && after === null) {
    const totalWin = result.freeSpinsSummary?.total ?? before.accumulatedWin + result.totalWin
    return { to: 'base', popup: { kind: 'freeSpinsExit', totalWin } }
  }

  return null
}

// ---- 승리 연출 분량 결정 (순수) ----

/**
 * 승리 연출 A단계(전체 표시) 기본 홀드(ms). 렌더러의 `PHASE_ALL_MS`와 같은 값이다 —
 * 여기서 정하는 건 "읽는 시간" 정책이고, 등급/스핀 속도 배율은 렌더러가 그 위에 곱한다.
 */
export const WIN_HOLD_BASE_MS = 1260
/** 당첨 라인이 하나 늘 때마다 더 붙드는 시간(ms). 라인이 많으면 한 화면에 다 못 읽는다. */
export const WIN_HOLD_PER_WIN_MS = 220
/** 아무리 많이 당첨돼도 A단계는 이 이상 붙들지 않는다(ms). */
export const WIN_HOLD_MAX_MS = 2600

/** 당첨 라인 수에 따른 A단계 홀드(ms). 0~1개는 기본값 그대로다. */
export function winHoldMs(winCount: number): number {
  if (winCount <= 1) return WIN_HOLD_BASE_MS
  return Math.min(WIN_HOLD_MAX_MS, WIN_HOLD_BASE_MS + (winCount - 1) * WIN_HOLD_PER_WIN_MS)
}

/**
 * 이번 판의 승리 연출 분량.
 *
 * `'brief'`는 라인별 순차(B단계) 없이 전체 표시만 짧게 1회다 — **프리스핀이 도는 동안**과
 * **오토스핀 중**에는 항상 이쪽이다. 순환하는 전체 연출이 프리스핀 사이에 끼면 판 간격이
 * 20초를 넘겨 "진행이 멈춘 것"처럼 보인다(실측). 수동 기본 게임만 순환하는 전체 연출을 쓴다.
 */
export function winPresentationMode(context: {
  autoSpinActive: boolean
  freeSpinsActive: boolean
}): 'full' | 'brief' {
  return context.autoSpinActive || context.freeSpinsActive ? 'brief' : 'full'
}
