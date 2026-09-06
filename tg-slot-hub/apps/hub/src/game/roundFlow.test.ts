import { describe, expect, it } from 'vitest'
import type { FreeSpinsState } from '@tgslot/shared'
import {
  ROUND_FLOW_IDLE,
  WIN_HOLD_BASE_MS,
  WIN_HOLD_MAX_MS,
  activePopup,
  canStartSpin,
  ceremonyFor,
  isRoundFlowBusy,
  roundFlowReducer,
  winHoldMs,
  winPresentationMode,
  type RoundFlowEffect,
  type RoundFlowState,
  type RoundOutcome,
} from './roundFlow'

const entryPopup = { kind: 'freeSpinsEntry', spins: 8, multiplier: 2 } as const
const exitPopup = { kind: 'freeSpinsExit', totalWin: 1200 } as const

function makeFreeSpins(overrides: Partial<FreeSpinsState> = {}): FreeSpinsState {
  return {
    gameId: 'sheriff-sixgun',
    left: 8,
    total: 8,
    multiplier: 2,
    totalBet: 100,
    accumulatedWin: 0,
    ...overrides,
  }
}

function makeOutcome(overrides: Partial<RoundOutcome> = {}): RoundOutcome {
  return { freeSpins: null, features: [], totalWin: 0, ...overrides }
}

/** 이벤트를 차례로 먹이며 마지막 상태와 그동안 쌓인 효과를 돌려준다. */
function run(
  start: RoundFlowState,
  events: Parameters<typeof roundFlowReducer>[1][],
): { state: RoundFlowState; effects: RoundFlowEffect[] } {
  let state = start
  const effects: RoundFlowEffect[] = []
  for (const event of events) {
    const result = roundFlowReducer(state, event)
    state = result.state
    effects.push(...result.effects)
  }
  return { state, effects }
}

describe('roundFlowReducer — 진입 세리머니', () => {
  it('연출이 끝나면 팝업부터 뜬다 — 커튼은 아직 시작하지 않는다', () => {
    const { state, effects } = roundFlowReducer(ROUND_FLOW_IDLE, {
      type: 'ceremonyStarted',
      popup: entryPopup,
      to: 'freeSpins',
      withCurtain: true,
    })

    expect(state).toEqual({ kind: 'popup', popup: entryPopup, to: 'freeSpins', withCurtain: true })
    expect(effects).toEqual([{ type: 'armPopupTimeout' }])
    // 커튼을 거는 효과(runCurtain)가 이 시점에 나오면 팝업과 커튼이 겹친다.
    expect(effects.some((e) => e.type === 'runCurtain')).toBe(false)
  })

  it('팝업이 닫힌 뒤에야 커튼이 시작되고, 커튼이 다 걷혀야 세리머니가 끝난다', () => {
    const { state, effects } = run(ROUND_FLOW_IDLE, [
      { type: 'ceremonyStarted', popup: entryPopup, to: 'freeSpins', withCurtain: true },
      { type: 'popupDismissed' },
      { type: 'curtainStarted', to: 'freeSpins' },
      { type: 'curtainEnded' },
    ])

    expect(state).toEqual(ROUND_FLOW_IDLE)
    expect(effects).toEqual([
      { type: 'armPopupTimeout' },
      { type: 'clearPopupTimeout' },
      { type: 'runCurtain', to: 'freeSpins' },
      { type: 'ceremonyFinished', to: 'freeSpins' },
    ])
  })

  it('렌더러가 없으면(withCurtain false) 팝업이 닫히는 즉시 세리머니가 끝난다 — 오지 않을 커튼을 기다리지 않는다', () => {
    const { state, effects } = run(ROUND_FLOW_IDLE, [
      { type: 'ceremonyStarted', popup: entryPopup, to: 'freeSpins', withCurtain: false },
      { type: 'popupDismissed' },
    ])

    expect(state).toEqual(ROUND_FLOW_IDLE)
    expect(effects).toEqual([
      { type: 'armPopupTimeout' },
      { type: 'clearPopupTimeout' },
      { type: 'ceremonyFinished', to: 'freeSpins' },
    ])
  })
})

describe('roundFlowReducer — 종료 세리머니', () => {
  it('종료도 팝업 → 커튼 → 재개 순서를 그대로 따른다', () => {
    const { state, effects } = run(ROUND_FLOW_IDLE, [
      { type: 'ceremonyStarted', popup: exitPopup, to: 'base', withCurtain: true },
      { type: 'popupDismissed' },
      { type: 'curtainEnded' },
    ])

    expect(state).toEqual(ROUND_FLOW_IDLE)
    expect(effects).toEqual([
      { type: 'armPopupTimeout' },
      { type: 'clearPopupTimeout' },
      { type: 'runCurtain', to: 'base' },
      { type: 'ceremonyFinished', to: 'base' },
    ])
  })
})

describe('roundFlowReducer — 있을 수 없는 전이는 조용히 무시한다', () => {
  it('팝업이 떠 있는 동안 커튼 시작/종료 신호가 와도 팝업은 그대로다', () => {
    const popupState = roundFlowReducer(ROUND_FLOW_IDLE, {
      type: 'ceremonyStarted',
      popup: entryPopup,
      to: 'freeSpins',
      withCurtain: true,
    }).state

    for (const event of [
      { type: 'curtainStarted', to: 'freeSpins' },
      { type: 'curtainEnded' },
    ] as const) {
      const result = roundFlowReducer(popupState, event)
      expect(result.state).toBe(popupState)
      expect(result.effects).toEqual([])
    }
  })

  it('팝업을 두 번 닫아도 커튼이 두 번 걸리지 않는다', () => {
    const { state, effects } = run(ROUND_FLOW_IDLE, [
      { type: 'ceremonyStarted', popup: entryPopup, to: 'freeSpins', withCurtain: true },
      { type: 'popupDismissed' },
      { type: 'popupDismissed' },
    ])

    expect(state).toEqual({ kind: 'curtain', to: 'freeSpins', ceremonial: true })
    expect(effects.filter((e) => e.type === 'runCurtain')).toHaveLength(1)
  })

  it('커튼 종료 신호가 두 번 와도 다음 판이 두 번 예약되지 않는다', () => {
    const { state, effects } = run(ROUND_FLOW_IDLE, [
      { type: 'ceremonyStarted', popup: exitPopup, to: 'base', withCurtain: true },
      { type: 'popupDismissed' },
      { type: 'curtainEnded' },
      { type: 'curtainEnded' },
    ])

    expect(state).toEqual(ROUND_FLOW_IDLE)
    expect(effects.filter((e) => e.type === 'ceremonyFinished')).toHaveLength(1)
  })

  it('세리머니 밖에서 걸린 커튼은 입력만 막고, 걷혀도 아무 것도 이어가지 않는다', () => {
    const { state, effects } = run(ROUND_FLOW_IDLE, [
      { type: 'curtainStarted', to: 'freeSpins' },
      { type: 'curtainEnded' },
    ])

    expect(state).toEqual(ROUND_FLOW_IDLE)
    expect(effects).toEqual([])
  })

  it('중단(aborted)은 어느 단계에서든 idle로 되돌리고, 팝업 타이머만 거둔다', () => {
    const popupState = roundFlowReducer(ROUND_FLOW_IDLE, {
      type: 'ceremonyStarted',
      popup: entryPopup,
      to: 'freeSpins',
      withCurtain: true,
    }).state
    expect(roundFlowReducer(popupState, { type: 'aborted' })).toEqual({
      state: ROUND_FLOW_IDLE,
      effects: [{ type: 'clearPopupTimeout' }],
    })

    const curtainState: RoundFlowState = { kind: 'curtain', to: 'base', ceremonial: true }
    expect(roundFlowReducer(curtainState, { type: 'aborted' })).toEqual({
      state: ROUND_FLOW_IDLE,
      effects: [],
    })
    expect(roundFlowReducer(ROUND_FLOW_IDLE, { type: 'aborted' }).state).toBe(ROUND_FLOW_IDLE)
  })
})

describe('canStartSpin / isRoundFlowBusy / activePopup', () => {
  it('팝업이 떠 있거나 커튼이 도는 동안은 새 스핀을 시작할 수 없다', () => {
    expect(canStartSpin(ROUND_FLOW_IDLE)).toBe(true)
    expect(canStartSpin({ kind: 'popup', popup: entryPopup, to: 'freeSpins', withCurtain: true })).toBe(false)
    expect(canStartSpin({ kind: 'curtain', to: 'freeSpins', ceremonial: true })).toBe(false)
    // 세리머니와 무관한 커튼(모드 재동기화 등)도 마찬가지로 막는다.
    expect(canStartSpin({ kind: 'curtain', to: 'base', ceremonial: false })).toBe(false)
  })

  it('isRoundFlowBusy는 canStartSpin의 반대이고, activePopup은 팝업 단계에서만 값을 준다', () => {
    const popupState: RoundFlowState = { kind: 'popup', popup: exitPopup, to: 'base', withCurtain: true }
    expect(isRoundFlowBusy(ROUND_FLOW_IDLE)).toBe(false)
    expect(isRoundFlowBusy(popupState)).toBe(true)
    expect(activePopup(popupState)).toEqual(exitPopup)
    expect(activePopup(ROUND_FLOW_IDLE)).toBeNull()
    expect(activePopup({ kind: 'curtain', to: 'base', ceremonial: true })).toBeNull()
  })
})

describe('ceremonyFor — 어떤 판이 세리머니를 부르는가', () => {
  it('평범한 유료 판은 세리머니가 없다', () => {
    expect(ceremonyFor(null, makeOutcome())).toBeNull()
  })

  it('진행 중인 프리스핀(같은 모드)도, 재발동도 세리머니가 없다 — 커튼이 뜨지 않는 구간이다', () => {
    expect(ceremonyFor(makeFreeSpins({ left: 5 }), makeOutcome({ freeSpins: makeFreeSpins({ left: 4 }) }))).toBeNull()
    expect(
      ceremonyFor(
        makeFreeSpins({ left: 5 }),
        makeOutcome({
          freeSpins: makeFreeSpins({ left: 9, total: 13 }),
          features: [{ type: 'freeSpins', spins: 5, multiplier: 2, retrigger: true }],
        }),
      ),
    ).toBeNull()
  })

  it('진입: features의 freeSpins 트리거가 부여 횟수/배수의 원천이다', () => {
    expect(
      ceremonyFor(
        null,
        makeOutcome({
          freeSpins: makeFreeSpins({ left: 8, total: 8, multiplier: 3 }),
          features: [{ type: 'freeSpins', spins: 8, multiplier: 3, retrigger: false }],
        }),
      ),
    ).toEqual({ to: 'freeSpins', popup: { kind: 'freeSpinsEntry', spins: 8, multiplier: 3 } })
  })

  it('진입: 트리거 피처가 없으면(재전송 응답 등) 세션 값으로 되짚는다', () => {
    expect(ceremonyFor(null, makeOutcome({ freeSpins: makeFreeSpins({ left: 10, total: 10, multiplier: 1 }) }))).toEqual(
      { to: 'freeSpins', popup: { kind: 'freeSpinsEntry', spins: 10, multiplier: 1 } },
    )
  })

  it('종료: 총액은 서버의 freeSpinsSummary.total이 권위다', () => {
    expect(
      ceremonyFor(
        makeFreeSpins({ left: 1, accumulatedWin: 900 }),
        makeOutcome({ freeSpins: null, totalWin: 300, freeSpinsSummary: { total: 1200, spins: 8 } }),
      ),
    ).toEqual({ to: 'base', popup: { kind: 'freeSpinsExit', totalWin: 1200 } })
  })

  it('종료: summary가 없으면 "세션 누적 + 이번 판 당첨"으로 되짚는다', () => {
    expect(
      ceremonyFor(makeFreeSpins({ left: 1, accumulatedWin: 900 }), makeOutcome({ freeSpins: null, totalWin: 300 })),
    ).toEqual({ to: 'base', popup: { kind: 'freeSpinsExit', totalWin: 1200 } })
  })

  it('남은 횟수가 0인 세션은 없는 것으로 본다 — 렌더러의 커튼 판정과 같은 규칙이라 둘이 어긋나지 않는다', () => {
    expect(
      ceremonyFor(makeFreeSpins({ left: 1, accumulatedWin: 500 }), makeOutcome({ freeSpins: makeFreeSpins({ left: 0 }) })),
    ).toEqual({ to: 'base', popup: { kind: 'freeSpinsExit', totalWin: 500 } })
    expect(ceremonyFor(null, makeOutcome({ freeSpins: makeFreeSpins({ left: 0 }) }))).toBeNull()
  })
})

describe('winPresentationMode — 어떤 판이 짧은 연출을 쓰는가', () => {
  it('프리스핀이 도는 동안과 오토스핀 중에는 brief다', () => {
    expect(winPresentationMode({ autoSpinActive: false, freeSpinsActive: true })).toBe('brief')
    expect(winPresentationMode({ autoSpinActive: true, freeSpinsActive: false })).toBe('brief')
    expect(winPresentationMode({ autoSpinActive: true, freeSpinsActive: true })).toBe('brief')
  })

  it('수동 기본 게임만 순환하는 전체 연출을 쓴다', () => {
    expect(winPresentationMode({ autoSpinActive: false, freeSpinsActive: false })).toBe('full')
  })
})

describe('winHoldMs — 당첨 라인이 많을수록 전체 표시를 더 붙든다', () => {
  it('0~1개는 기본 홀드 그대로다', () => {
    expect(winHoldMs(0)).toBe(WIN_HOLD_BASE_MS)
    expect(winHoldMs(1)).toBe(WIN_HOLD_BASE_MS)
  })

  it('라인이 하나 늘 때마다 220ms씩 붙는다', () => {
    expect(winHoldMs(2)).toBe(1480)
    expect(winHoldMs(3)).toBe(1700)
    expect(winHoldMs(5)).toBe(2140)
  })

  it('아무리 많아도 상한(2600ms)을 넘지 않는다', () => {
    expect(winHoldMs(7)).toBe(2580)
    expect(winHoldMs(8)).toBe(WIN_HOLD_MAX_MS)
    expect(winHoldMs(50)).toBe(WIN_HOLD_MAX_MS)
  })
})
