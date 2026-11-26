import { describe, expect, it } from 'vitest'
import {
  BOARD_TIMINGS,
  BOARD_TIMINGS_REDUCED,
  FAST_PHASE_MS,
  SKIP_PHASE_MS,
  SUMMARY_SAFETY_CLOSE_MS,
  boardFlowReducer,
  boardTimingsFor,
  createBoardFlow,
  estimateAutoPlayMs,
  isBoardPlayback,
  planBoardThrows,
  subPhaseMs,
  type BoardFlowEffect,
  type BoardFlowEvent,
  type BoardFlowState,
  type PlannedThrow,
} from './boardFlow'
import { findBoardFeature, hanbokBoardConfig, makeBoardFeature } from '../test/hanbokMath'

const config = hanbokBoardConfig()
const timings = BOARD_TIMINGS.normal

function plan(n: number, extra: Partial<PlannedThrow> = {}): PlannedThrow[] {
  return Array.from({ length: n }, () => ({ steps: 2, hops: 2, fork: false, extraThrow: false, tile: 'coin' as const, ...extra }))
}

interface Run {
  state: BoardFlowState
  log: BoardFlowEffect[]
  /** 지금 걸려 있는 타이머(ms). null이면 없음. */
  timer: number | null
}

function start(planned: PlannedThrow[], opts: { auto?: boolean; resumeShown?: number } = {}): Run {
  const created = createBoardFlow({ plan: planned, timings, ...opts })
  const run: Run = { state: created.state, log: [], timer: null }
  apply(run, created.effects)
  return run
}

function apply(run: Run, effects: readonly BoardFlowEffect[]): void {
  for (const effect of effects) {
    run.log.push(effect)
    if (effect.type === 'schedule') run.timer = effect.ms
    if (effect.type === 'cancelTimer') run.timer = null
  }
}

function send(run: Run, event: BoardFlowEvent): void {
  const { state, effects } = boardFlowReducer(run.state, event)
  if (event.type === 'tick') run.timer = null
  run.state = state
  apply(run, effects)
}

/** 걸려 있는 타이머가 없을 때까지 tick을 보낸다(자동 진행). 무한 루프 방지로 상한을 둔다. */
function drain(run: Run, stopAt?: (state: BoardFlowState) => boolean): void {
  for (let i = 0; i < 400; i += 1) {
    if (stopAt?.(run.state)) return
    if (run.timer === null) return
    send(run, { type: 'tick' })
  }
  throw new Error('상태 기계가 끝나지 않는다')
}

const types = (run: Run): string[] => run.log.map((e) => e.type)

describe('시작', () => {
  it('진입 연출부터 시작하고 시간이 지나면 던지기 차례(ready)가 된다', () => {
    const run = start(plan(3))
    expect(run.state.phase).toBe('intro')
    expect(run.timer).toBe(timings.introMs)
    expect(types(run)).toEqual(['intro', 'schedule'])
    send(run, { type: 'tick' })
    expect(run.state.phase).toBe('ready')
    expect(run.timer).toBeNull() // 자동이 아니면 탭을 기다린다
  })

  it('진입 연출 중 화면 탭은 진입을 접는다', () => {
    const run = start(plan(3))
    send(run, { type: 'skip' })
    expect(run.state.phase).toBe('ready')
  })

  it('오토스핀 중 진입하면 자동으로 시작해 첫 던지기까지 1.2초 기다린다', () => {
    const run = start(plan(3), { auto: true })
    send(run, { type: 'tick' })
    expect(run.state.phase).toBe('ready')
    expect(run.state.auto).toBe(true)
    expect(run.timer).toBe(timings.firstAutoWaitMs)
  })

  it('복원: 보여 준 던지기 수부터 곧장 이어 간다(진입 연출 없음)', () => {
    const run = start(plan(5), { resumeShown: 2 })
    expect(run.state.phase).toBe('ready')
    expect(run.state.shown).toBe(2)
    expect(run.state.index).toBe(2)
    expect(types(run)).not.toContain('intro')
  })

  it('복원: 이미 다 본 만큼이면 요약부터 보여 준다', () => {
    const run = start(plan(4), { resumeShown: 4 })
    expect(run.state.phase).toBe('summary')
    expect(types(run)).toContain('summary')
  })
})

describe('던지기 한 번의 순서', () => {
  it('ready → throwing → calling → moving → effect → ready, 효과 순서가 맞다', () => {
    const run = start(plan(3))
    send(run, { type: 'tick' })
    run.log.length = 0
    send(run, { type: 'throw' })
    expect(run.state.phase).toBe('throwing')
    expect(run.timer).toBe(timings.throwMs)
    send(run, { type: 'tick' })
    expect(run.state.phase).toBe('calling')
    expect(run.timer).toBe(timings.callMs)
    send(run, { type: 'tick' })
    expect(run.state.phase).toBe('moving')
    expect(run.timer).toBe(2 * timings.hopMs)
    send(run, { type: 'tick' })
    expect(run.state.phase).toBe('effect')
    expect(run.state.shown).toBe(1) // HUD는 칸 효과가 시작될 때 그 던지기 뒤 값으로 올라간다
    expect(run.timer).toBe(timings.effectMs)
    send(run, { type: 'tick' })
    expect(run.state.phase).toBe('ready')
    expect(run.state.index).toBe(1)
    expect(types(run).filter((t) => t !== 'schedule')).toEqual(['throw', 'call', 'move', 'applyTile', 'ready'])
  })

  it('갈림길에 멈춘 던지기는 효과 단계에 지름길 열림이 더해지고 시간이 늘어난다', () => {
    const run = start(plan(2, { fork: true }))
    send(run, { type: 'tick' })
    send(run, { type: 'throw' })
    send(run, { type: 'tick' })
    send(run, { type: 'tick' })
    send(run, { type: 'tick' })
    expect(run.state.phase).toBe('effect')
    expect(types(run)).toContain('openFork')
    expect(run.timer).toBe(timings.effectMs + timings.forkMs)
  })

  it('마지막 던지기의 효과가 끝나면 요약이 열린다', () => {
    const run = start(plan(1))
    send(run, { type: 'tick' })
    send(run, { type: 'throw' })
    drain(run, (s) => s.phase === 'summary')
    expect(run.state.phase).toBe('summary')
    expect(run.state.shown).toBe(1)
    expect(types(run)).toContain('summary')
    expect(run.timer).toBe(SUMMARY_SAFETY_CLOSE_MS) // 자동이 아니면 안전장치 시간만 건다
  })

  it('요약을 닫으면 복귀 커튼(finish)이 시작되고 덮이면 끝난다', () => {
    const run = start(plan(1))
    send(run, { type: 'tick' })
    send(run, { type: 'throw' })
    drain(run, (s) => s.phase === 'summary')
    send(run, { type: 'closeSummary' })
    expect(run.state.phase).toBe('closing')
    expect(run.timer).toBeNull()
    expect(types(run)).toContain('finish')
    send(run, { type: 'closed' })
    expect(run.state.phase).toBe('done')
  })

  it('늦게 온 이벤트는 무시한다 — 두 번 눌린 던지기·끝난 뒤의 tick', () => {
    const run = start(plan(2))
    send(run, { type: 'tick' })
    send(run, { type: 'throw' })
    const before = run.state
    send(run, { type: 'throw' })
    expect(run.state).toBe(before)
    send(run, { type: 'closeSummary' })
    expect(run.state).toBe(before)
    send(run, { type: 'abort' })
    expect(run.state.phase).toBe('done')
    const done = run.state
    send(run, { type: 'tick' })
    send(run, { type: 'throw' })
    expect(run.state).toBe(done)
  })
})

describe('자동 · 빨리 감기 · 탭 압축', () => {
  it('자동이면 던지기 사이를 기다렸다가 스스로 던진다', () => {
    const run = start(plan(3), { auto: true })
    send(run, { type: 'tick' }) // intro → ready
    drain(run, (s) => s.phase === 'summary')
    expect(run.state.phase).toBe('summary')
    expect(run.state.shown).toBe(3)
    expect(run.timer).toBe(timings.summaryAutoCloseMs)
    send(run, { type: 'tick' }) // 자동 닫힘
    expect(run.state.phase).toBe('closing')
  })

  it('ready에서 자동을 켜면 대기 타이머가 걸리고, 끄면 거둔다', () => {
    const run = start(plan(3))
    send(run, { type: 'tick' })
    send(run, { type: 'toggleAuto' })
    expect(run.state.auto).toBe(true)
    expect(run.timer).toBe(timings.autoWaitMs)
    send(run, { type: 'toggleAuto' })
    expect(run.state.auto).toBe(false)
    expect(run.timer).toBeNull()
  })

  it('재생 중 자동을 바꿔도 걸려 있는 타이머는 건드리지 않는다', () => {
    const run = start(plan(3))
    send(run, { type: 'tick' })
    send(run, { type: 'throw' })
    const timer = run.timer
    send(run, { type: 'toggleAuto' })
    expect(run.timer).toBe(timer)
    expect(run.state.auto).toBe(true)
  })

  it('재생 중 화면 탭(skip)은 지금 던지기의 남은 단계를 압축하고 compress 효과를 낸다', () => {
    const run = start(plan(3))
    send(run, { type: 'tick' })
    send(run, { type: 'throw' })
    send(run, { type: 'skip' })
    expect(run.state.compress).toBe(true)
    expect(types(run)).toContain('compress')
    expect(run.timer).toBe(SKIP_PHASE_MS.throw)
    // 남은 단계도 압축된 길이로 흐른다
    send(run, { type: 'tick' })
    expect(run.timer).toBe(SKIP_PHASE_MS.call)
    send(run, { type: 'tick' })
    expect(run.timer).toBe(SKIP_PHASE_MS.move)
    send(run, { type: 'tick' })
    expect(run.timer).toBe(SKIP_PHASE_MS.effect)
    send(run, { type: 'tick' })
    // 다음 던지기는 다시 정상 속도
    expect(run.state.compress).toBe(false)
    send(run, { type: 'throw' })
    expect(run.timer).toBe(timings.throwMs)
  })

  it('압축은 두 번 눌러도 한 번만 먹는다', () => {
    const run = start(plan(3))
    send(run, { type: 'tick' })
    send(run, { type: 'throw' })
    send(run, { type: 'skip' })
    const state = run.state
    send(run, { type: 'skip' })
    expect(run.state).toBe(state)
  })

  it('⏩로 건너뛴 요약은 저절로 닫히지 않는다(안전 닫힘만) — 오토스핀·[자동]이면 자동 닫힘', () => {
    const manual = start(plan(3))
    send(manual, { type: 'tick' })
    send(manual, { type: 'fastForward' })
    send(manual, { type: 'fastForward' })
    expect(manual.state.phase).toBe('summary')
    expect(manual.timer).toBe(SUMMARY_SAFETY_CLOSE_MS)

    const autospin = start(plan(3), { auto: true })
    send(autospin, { type: 'tick' })
    send(autospin, { type: 'fastForward' })
    send(autospin, { type: 'fastForward' })
    expect(autospin.timer).toBe(timings.summaryAutoCloseMs)

    const toggled = start(plan(3))
    send(toggled, { type: 'tick' })
    send(toggled, { type: 'toggleAuto' })
    drain(toggled, (s) => s.phase === 'summary')
    expect(toggled.timer).toBe(timings.summaryAutoCloseMs)
  })

  it('⏩ 1회: 남은 던지기를 압축 재생(자동 켜짐) — 던지기당 300ms 안팎, 대기 없음', () => {
    const run = start(plan(4))
    send(run, { type: 'tick' })
    send(run, { type: 'fastForward' })
    expect(run.state.fast).toBe(1)
    expect(run.state.auto).toBe(true)
    expect(run.state.phase).toBe('throwing')
    let total = run.timer ?? 0
    // 한 던지기 분량을 센다(다음 ready의 0ms 대기 직전까지)
    const phaseOf = (): string => run.state.phase
    while (phaseOf() !== 'ready') {
      send(run, { type: 'tick' })
      if (phaseOf() !== 'ready') total += run.timer ?? 0
    }
    expect(total).toBeLessThanOrEqual(FAST_PHASE_MS.throw + FAST_PHASE_MS.call + FAST_PHASE_MS.move + FAST_PHASE_MS.effect)
    expect(total).toBeLessThanOrEqual(320)
    expect(run.timer).toBe(0)
    drain(run, (s) => s.phase === 'summary')
    expect(run.state.shown).toBe(4)
    // ⏩가 켠 자동은 플레이어가 고른 자동이 아니다 — 요약은 [받기]를 기다린다(안전 닫힘만).
    expect(run.timer).toBe(SUMMARY_SAFETY_CLOSE_MS)
  })

  it('⏩ 2회: 요약으로 직행하고 shown이 끝까지 올라간다', () => {
    const run = start(plan(6))
    send(run, { type: 'tick' })
    send(run, { type: 'fastForward' })
    send(run, { type: 'fastForward' })
    expect(run.state.phase).toBe('summary')
    expect(run.state.shown).toBe(6)
    expect(types(run)).toContain('summary')
  })

  it('⏩는 진입 연출 중에도 먹는다 — 요약 직행', () => {
    const run = start(plan(3))
    send(run, { type: 'fastForward' })
    expect(run.state.phase).toBe('summary')
  })

  it('요약 중 ⏩·skip은 무시된다', () => {
    const run = start(plan(1))
    send(run, { type: 'tick' })
    send(run, { type: 'fastForward' })
    send(run, { type: 'fastForward' })
    const state = run.state
    send(run, { type: 'fastForward' })
    send(run, { type: 'skip' })
    expect(run.state).toBe(state)
  })
})

describe('결과는 입력으로 바뀌지 않는다', () => {
  it('어떤 입력 순서로 재생해도 «보여 주는 던지기 번호»는 같다 — 탭·자동·빨리 감기 섞기', () => {
    const feature = makeBoardFeature('flow-input')
    const planned = planBoardThrows(config, feature)
    const sequences: BoardFlowEvent[][] = [
      [],
      [{ type: 'toggleAuto' }],
      [{ type: 'skip' }, { type: 'skip' }],
      [{ type: 'fastForward' }],
      [{ type: 'toggleAuto' }, { type: 'fastForward' }, { type: 'fastForward' }],
    ]
    for (const events of sequences) {
      const run = start(planned)
      const shownIndexes: number[] = []
      send(run, { type: 'tick' })
      for (const event of events) send(run, event)
      for (let i = 0; i < 200 && run.state.phase !== 'summary'; i += 1) {
        if (run.state.phase === 'ready' && run.timer === null) send(run, { type: 'throw' })
        else send(run, { type: 'tick' })
        const last = run.log[run.log.length - 1]
        if (last !== undefined) shownIndexes.push(run.state.shown)
      }
      expect(run.state.phase).toBe('summary')
      expect(run.state.shown).toBe(feature.throws.length)
      // 보여 준 수는 절대 줄지 않고 한 번에 1씩(요약 직행 제외) 오른다
      for (let i = 1; i < shownIndexes.length; i += 1) {
        expect(shownIndexes[i] as number).toBeGreaterThanOrEqual(shownIndexes[i - 1] as number)
      }
    }
  })

  it('상태에는 결과 값(바구니·배수·지급)이 없다 — 번호와 순서만 안다', () => {
    const run = start(plan(3))
    const keys = Object.keys(run.state).sort()
    expect(keys).toEqual(['auto', 'autoChosen', 'compress', 'fast', 'index', 'phase', 'plan', 'shown', 'timings'])
  })
})

describe('재생 계획 / 시간 예산', () => {
  it('planBoardThrows: 이동 칸 수에 앞으로 칸 추가 이동이 들어가고 갈림길은 forks 표로 정한다', () => {
    const forkFeature = findBoardFeature((f) => f.throws.some((t) => config.forks[t.at] !== undefined))
    const planned = planBoardThrows(config, forkFeature)
    forkFeature.throws.forEach((record, i) => {
      expect(planned[i]?.hops).toBe(record.path.length + (record.forward?.length ?? 0))
      expect(planned[i]?.fork).toBe(config.forks[record.at] !== undefined)
      expect(planned[i]?.steps).toBe(record.steps)
    })
    expect(planned.some((p) => p.fork)).toBe(true)
    const forwardFeature = findBoardFeature((f) => f.throws.some((t) => t.forward !== undefined))
    const forward = forwardFeature.throws.find((t) => t.forward !== undefined)
    expect(forward).toBeDefined()
    const idx = forwardFeature.throws.indexOf(forward as (typeof forwardFeature.throws)[number])
    expect(planBoardThrows(config, forwardFeature)[idx]?.hops).toBe((forward?.path.length ?? 0) + (forward?.forward?.length ?? 0))
  })

  it('게이트: 자동 재생 p95(던지기 7번·칸 2.5·갈림길 2회) normal ≤ 20s, turbo ≤ 10s', () => {
    const p95: PlannedThrow[] = plan(7, { hops: 3 })
    p95[1] = { ...p95[1], fork: true } as PlannedThrow
    p95[4] = { ...p95[4], fork: true } as PlannedThrow
    p95[6] = { ...p95[6], last: true } as PlannedThrow
    // 정상 속도 말판 전체(진입 연출 제외, 던지기 구간만)
    const normal = estimateAutoPlayMs(p95, BOARD_TIMINGS.normal) - BOARD_TIMINGS.normal.introMs - BOARD_TIMINGS.normal.firstAutoWaitMs
    expect(normal).toBeLessThanOrEqual(20_000)
    const turbo = estimateAutoPlayMs(p95, BOARD_TIMINGS.turbo) - BOARD_TIMINGS.turbo.introMs - BOARD_TIMINGS.turbo.firstAutoWaitMs
    expect(turbo).toBeLessThanOrEqual(10_000)
  })

  it('마지막 던지기(결승 도착 등)는 효과 뒤 마무리 시간을 더 머문 뒤 요약으로 간다', () => {
    const mode = { compress: false, fast: false }
    const goal: PlannedThrow = { steps: 3, hops: 3, fork: false, extraThrow: false, tile: 'goal', last: true }
    const mid: PlannedThrow = { ...goal, tile: 'coin', last: false }
    for (const t of [BOARD_TIMINGS.normal, BOARD_TIMINGS.quick, BOARD_TIMINGS.turbo, BOARD_TIMINGS_REDUCED]) {
      // 결승 효과 시작 → 요약까지 최소 0.8초(PLAN §7-6 «점등 + 불꽃 → +0.8s 요약»)
      expect(subPhaseMs('effect', goal, t, mode)).toBeGreaterThanOrEqual(800)
      expect(subPhaseMs('effect', goal, t, mode)).toBe(subPhaseMs('effect', mid, t, mode) + t.finaleMs)
    }
    expect(subPhaseMs('effect', goal, timings, mode)).toBeGreaterThanOrEqual(1200)
    // 빨리 감기·탭 넘김 중에도 짧게나마 머문다
    expect(subPhaseMs('effect', goal, timings, { compress: false, fast: true })).toBeGreaterThan(subPhaseMs('effect', mid, timings, { compress: false, fast: true }))
    expect(subPhaseMs('effect', goal, timings, { compress: true, fast: false })).toBeGreaterThan(subPhaseMs('effect', mid, timings, { compress: true, fast: false }))
  })

  it('계획의 마지막 던지기에만 last가 붙는다', () => {
    const planned = planBoardThrows(config, findBoardFeature((f) => f.end === 'goal' && f.throws.length > 2))
    expect(planned.map((p) => p.last)).toEqual(planned.map((_, i) => i === planned.length - 1))
  })

  it('평균 던지기(2.3칸, 자동) 약 2.5초(normal)', () => {
    const one: PlannedThrow = { steps: 2, hops: 2.3, fork: false, extraThrow: false, tile: 'coin' }
    const mode = { compress: false, fast: false }
    const total =
      subPhaseMs('throw', one, timings, mode) +
      subPhaseMs('call', one, timings, mode) +
      subPhaseMs('move', one, timings, mode) +
      subPhaseMs('effect', one, timings, mode) +
      timings.autoWaitMs
    expect(total).toBeGreaterThan(2300)
    expect(total).toBeLessThan(2700)
  })

  it('속도가 빨라질수록 단계마다 짧아지고, 모션 축소는 날기·칸 이동이 없다', () => {
    const one = plan(1)[0] as PlannedThrow
    const m = { compress: false, fast: false }
    expect(subPhaseMs('throw', one, BOARD_TIMINGS.quick, m)).toBeLessThan(subPhaseMs('throw', one, BOARD_TIMINGS.normal, m))
    expect(subPhaseMs('throw', one, BOARD_TIMINGS.turbo, m)).toBeLessThan(subPhaseMs('throw', one, BOARD_TIMINGS.quick, m))
    expect(boardTimingsFor('normal', true)).toBe(BOARD_TIMINGS_REDUCED)
    expect(subPhaseMs('throw', one, BOARD_TIMINGS_REDUCED, m)).toBe(0)
    expect(subPhaseMs('move', one, BOARD_TIMINGS_REDUCED, m)).toBe(BOARD_TIMINGS_REDUCED.moveFlatMs)
    expect(subPhaseMs('effect', { ...one, fork: true }, BOARD_TIMINGS_REDUCED, m)).toBe(BOARD_TIMINGS_REDUCED.effectMs)
  })

  it('모션 축소로 던지기 하나는 약 0.7초(결과 200 + 이동 120 + 효과 150 + 대기 300 = 770ms)', () => {
    const one = plan(1)[0] as PlannedThrow
    const m = { compress: false, fast: false }
    const t = BOARD_TIMINGS_REDUCED
    const total =
      subPhaseMs('throw', one, t, m) + subPhaseMs('call', one, t, m) + subPhaseMs('move', one, t, m) + subPhaseMs('effect', one, t, m) + t.autoWaitMs
    expect(total).toBe(770)
  })

  it('재생 중인지 판정(탭을 «지금 던지기 끝내기»로 읽을 때)', () => {
    expect(isBoardPlayback({ phase: 'moving' })).toBe(true)
    expect(isBoardPlayback({ phase: 'intro' })).toBe(true)
    expect(isBoardPlayback({ phase: 'ready' })).toBe(false)
    expect(isBoardPlayback({ phase: 'summary' })).toBe(false)
  })
})
