import { describe, expect, it } from 'vitest'
import type { WinLine } from '@tgslot/slot-engine'
import type { FeatureTrigger } from '@tgslot/shared'
import {
  BRIEF_PHASE_ALL_SCALE,
  PHASE_ALL_BIGWIN_MS,
  PHASE_ALL_MEGA_MS,
  PHASE_ALL_MS,
  PHASE_FEATURE_MS,
  PHASE_LINE_MS,
  REDUCED_WIN_CYCLE_MS,
  SPIN_SPEED_PROFILES,
  WIN_TIER_MULTIPLIERS,
} from './constants.js'
import {
  buildPresentation,
  defaultLineLabel,
  lineStepCount,
  phaseAllDurationMs,
  presentationCycleMs,
  presentationOptionsFor,
  runPresentation,
  shouldLoopPresentation,
  winLineEvent,
  type PresentationStep,
  type PresentationStepContext,
} from './presentation.js'
import { loadGameMath } from './testSupport.js'

const math = loadGameMath('classic-777')

function makeWin(line: number, win: number, multiplier: number): WinLine {
  return {
    line,
    symbol: 'seven',
    count: 3,
    multiplier,
    win,
    positions: [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  }
}

describe('buildPresentation', () => {
  it('승리가 없으면 아무것도 하지 않는다', () => {
    expect(buildPresentation([], math)).toEqual([])
  })

  it('A단계가 언제나 맨 앞에 온다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10), makeWin(2, 10, 5)], math, { totalBet: 10 })
    expect(steps[0]?.phase).toBe('all')
  })

  it('A단계 다음에 라인이 하나씩 이어진다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10), makeWin(2, 10, 5)], math, { totalBet: 100 })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'line', 'line'])
  })

  it('라인은 인덱스 순서로 정렬된다', () => {
    const steps = buildPresentation([makeWin(4, 10, 5), makeWin(1, 10, 5), makeWin(2, 10, 5)], math, {
      totalBet: 500,
    })
    const lines = steps.flatMap((step) => (step.phase === 'line' ? [step.win.line] : []))
    expect(lines).toEqual([1, 2, 4])
  })

  it('입력 배열을 건드리지 않는다', () => {
    const wins = [makeWin(4, 10, 5), makeWin(1, 10, 5)]
    buildPresentation(wins, math, { totalBet: 500 })
    expect(wins.map((win) => win.line)).toEqual([4, 1])
  })

  it('승리가 하나면 A단계와 그 라인만 돈다', () => {
    const steps = buildPresentation([makeWin(3, 10, 5)], math, { totalBet: 500 })
    expect(steps).toHaveLength(2)
    expect(steps[0]?.phase).toBe('all')
    expect(steps[1]).toMatchObject({ phase: 'line', durationMs: PHASE_LINE_MS })
  })

  it('A단계는 총배당을 합쳐서 들고 있다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10), makeWin(2, 30, 15)], math, { totalBet: 500 })
    const first = steps[0]
    expect(first?.phase).toBe('all')
    if (first?.phase === 'all') {
      expect(first.totalWin).toBe(50)
      expect(first.wins).toHaveLength(2)
    }
  })

  it('보통 승리의 A단계 길이는 900ms다', () => {
    const steps = buildPresentation([makeWin(0, 10, 5)], math, { totalBet: 500 })
    expect(steps[0]?.durationMs).toBe(PHASE_ALL_MS)
  })

  it('BIG 등급이면 A단계가 길어진다', () => {
    // 총배당 100, 베팅 10 -> 10배 = BIG
    const steps = buildPresentation([makeWin(0, 100, 50)], math, { totalBet: 10 })
    expect(steps[0]?.durationMs).toBe(PHASE_ALL_BIGWIN_MS)
  })

  it('MEGA 이상이면 A단계가 가장 길다', () => {
    // 총배당 200, 베팅 10 -> 20배 = MEGA
    const steps = buildPresentation([makeWin(0, 200, 100)], math, { totalBet: 10 })
    expect(steps[0]?.durationMs).toBe(PHASE_ALL_MEGA_MS)
  })

  it('A단계가 등급을 함께 실어 나른다', () => {
    const steps = buildPresentation([makeWin(0, 1000, 500)], math, { totalBet: 10 })
    const first = steps[0]
    expect(first?.phase).toBe('all')
    if (first?.phase === 'all') expect(first.tier).toBe('max')
  })

  it('라인 스텝은 1900ms다', () => {
    // 실사용에서 순환이 빠르다는 지적을 받아 1400ms에서 늘렸다.
    expect(PHASE_LINE_MS).toBe(1900)
  })

  it('한 바퀴 길이는 각 단계의 합이다', () => {
    const steps = buildPresentation([makeWin(0, 10, 5), makeWin(1, 10, 5)], math, { totalBet: 500 })
    expect(presentationCycleMs(steps)).toBe(PHASE_ALL_MS + PHASE_LINE_MS * 2)
  })
})


describe('lineStepCount', () => {
  it('라인 스텝만 센다', () => {
    const steps = buildPresentation([makeWin(0, 10, 5), makeWin(1, 10, 5)], math, { totalBet: 500 })
    expect(steps).toHaveLength(3)
    expect(lineStepCount(steps)).toBe(2)
  })

  it('라인이 없으면 0이다', () => {
    expect(lineStepCount([])).toBe(0)
  })
})

describe('winLineEvent', () => {
  const context: PresentationStepContext = { cycle: 2, index: 1, total: 3 }

  it('허브가 문구를 만들 재료를 전부 싣는다', () => {
    expect(winLineEvent(makeWin(4, 120, 60), context)).toEqual({
      type: 'winLine',
      line: 4,
      win: 120,
      symbol: 'seven',
      count: 3,
      index: 1,
      total: 3,
      cycle: 2,
    })
  })

  it('없는 값은 키 자체를 넣지 않는다', () => {
    // ways: undefined가 들어가면 라인 승리가 ways 승리처럼 읽힌다.
    const event = winLineEvent(makeWin(0, 10, 5), context)
    expect('ways' in event).toBe(false)
    expect('group' in event).toBe(false)
    expect('direction' in event).toBe(false)
  })

  it('ways·그룹·방향은 있으면 그대로 넘긴다', () => {
    const win = { ...makeWin(-1, 300, 20), symbol: 'anybar', group: 'anybar', ways: 9, direction: 'rtl' as const }
    expect(winLineEvent(win, context)).toMatchObject({
      symbol: 'anybar',
      group: 'anybar',
      ways: 9,
      direction: 'rtl',
    })
  })
})

/**
 * 순환을 실제 시계 없이 돌린다. `wait`가 즉시 resolve하므로 `stopAfter`가 유일한 제동 장치다.
 * setTimeout으로 재우면 마이크로태스크가 굶겨 죽여 영영 깨어나지 않는다.
 */
function runHarness(
  steps: readonly PresentationStep[],
  opts: { loop?: boolean; stopAfter?: number } = {},
): {
  rendered: { phase: PresentationStep['phase']; context: PresentationStepContext }[]
  firstPass: Promise<void>
  skip: () => void
  cancel: () => void
} {
  const rendered: { phase: PresentationStep['phase']; context: PresentationStepContext }[] = []
  let cancelled = false
  const handle = runPresentation(steps, {
    render: (step, context) => {
      rendered.push({ phase: step.phase, context })
      if (opts.stopAfter !== undefined && rendered.length >= opts.stopAfter) cancelled = true
    },
    wait: () => Promise.resolve(),
    cancelled: () => cancelled,
    ...(opts.loop === undefined ? {} : { loop: opts.loop }),
  })
  return {
    rendered,
    firstPass: handle.firstPass,
    skip: handle.skip,
    cancel: () => (cancelled = true),
  }
}

/** 남은 마이크로태스크를 흘려보낸다. 순환은 `stopAfter`가 이미 멈춰 세운 뒤여야 한다. */
async function drain(times = 200): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve()
}

describe('runPresentation', () => {
  const twoWins = (): PresentationStep[] =>
    buildPresentation([makeWin(0, 10, 5), makeWin(1, 10, 5)], math, { totalBet: 500 })

  it('한 바퀴는 A단계 다음에 라인이 이어진다', async () => {
    const run = runHarness(twoWins(), { loop: false })
    await run.firstPass
    expect(run.rendered.map((entry) => entry.phase)).toEqual(['all', 'line', 'line'])
  })

  it('약속은 첫 바퀴 분량만 보여 준 뒤 resolve한다', async () => {
    // 허브 store가 이 약속을 기다렸다 showingWin을 뜬다. 순환은 그 뒤로도 배경에서 계속 돈다.
    const run = runHarness(twoWins(), { stopAfter: 12 })
    await run.firstPass
    expect(run.rendered.filter((entry) => entry.context.cycle === 0)).toHaveLength(3)
    expect(run.rendered.length).toBeGreaterThanOrEqual(3)
  })

  it('기본값은 순환이다 — 첫 바퀴 뒤에도 계속 돈다', async () => {
    const run = runHarness(twoWins(), { stopAfter: 9 })
    await run.firstPass
    await drain()
    expect(run.rendered).toHaveLength(9)
    expect(run.rendered.map((entry) => entry.context.cycle)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2])
    expect(run.rendered.map((entry) => entry.phase)).toEqual([
      'all',
      'line',
      'line',
      'all',
      'line',
      'line',
      'all',
      'line',
      'line',
    ])
  })

  it('loop: false면 한 바퀴로 끝난다', async () => {
    const run = runHarness(twoWins(), { loop: false, stopAfter: 30 })
    await run.firstPass
    await drain()
    expect(run.rendered).toHaveLength(3)
  })

  it('승리가 하나여도 매 바퀴 그 라인을 다시 짚는다', async () => {
    const steps = buildPresentation([makeWin(3, 10, 5)], math, { totalBet: 500 })
    const run = runHarness(steps, { stopAfter: 6 })
    await run.firstPass
    await drain()
    // all-line-all-line-all-line. 하나뿐이어도 주기적으로 되살아나야 한다.
    expect(run.rendered.map((entry) => entry.phase)).toEqual(['all', 'line', 'all', 'line', 'all', 'line'])
    expect(run.rendered.map((entry) => entry.context.cycle)).toEqual([0, 0, 1, 1, 2, 2])
  })

  it('라인 스텝은 이번 바퀴에서의 자리를 함께 들고 간다', async () => {
    const run = runHarness(twoWins(), { stopAfter: 6 })
    await run.firstPass
    await drain()
    const lines = run.rendered.filter((entry) => entry.phase === 'line')
    expect(lines.map((entry) => entry.context.index)).toEqual([0, 1, 0, 1])
    expect(lines.every((entry) => entry.context.total === 2)).toBe(true)
  })

  it('취소하면 그 자리에서 멈추고 다시 그리지 않는다', async () => {
    // clearWins()가 부르는 경로다. 다음 스핀이 시작됐는데 지난 승리가 계속 뜨면 안 된다.
    const run = runHarness(twoWins(), { stopAfter: 2 })
    await run.firstPass
    await drain()
    expect(run.rendered).toHaveLength(2)
  })

  it('첫 바퀴 도중에 취소해도 약속은 매달리지 않는다', async () => {
    const run = runHarness(twoWins())
    run.cancel()
    await expect(run.firstPass).resolves.toBeUndefined()
  })

  it('보여줄 것이 없으면 순환도 없다', async () => {
    const run = runHarness([], { stopAfter: 5 })
    await run.firstPass
    await drain()
    expect(run.rendered).toEqual([])
  })

  it('피처 단계도 매 바퀴 함께 돈다', async () => {
    const freeSpins: FeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }
    const steps = buildPresentation([makeWin(0, 20, 10)], math, { totalBet: 500, features: [freeSpins] })
    const run = runHarness(steps, { stopAfter: 6 })
    await run.firstPass
    await drain()
    expect(run.rendered.map((entry) => entry.phase)).toEqual([
      'all',
      'feature',
      'line',
      'all',
      'feature',
      'line',
    ])
  })
})

describe('runPresentation 스킵', () => {
  const twoWins = (): PresentationStep[] =>
    buildPresentation([makeWin(0, 10, 5), makeWin(1, 10, 5)], math, { totalBet: 500 })

  /**
   * 한 스텝씩 손으로 넘긴다. 스킵이 남은 시간을 버리는지 보려면 기다림을 붙잡고 있어야 한다.
   * 즉시 resolve하는 `wait`으로는 "안 기다렸다"를 구분할 수 없다.
   */
  function heldHarness(steps: readonly PresentationStep[], stopAfter: number) {
    const rendered: { phase: PresentationStep['phase']; context: PresentationStepContext }[] = []
    const held: (() => void)[] = []
    let cancelled = false
    const handle = runPresentation(steps, {
      render: (step, context) => {
        rendered.push({ phase: step.phase, context })
        if (rendered.length >= stopAfter) cancelled = true
      },
      wait: () =>
        new Promise<void>((resolve) => {
          held.push(resolve)
        }),
      cancelled: () => cancelled,
    })
    return { rendered, held, handle }
  }

  it('첫 바퀴 도중에 접으면 약속이 곧장 resolve한다', async () => {
    const run = heldHarness(twoWins(), 20)
    await drain()
    // A단계를 그리고 그 자리에서 기다리는 중이다. 아직 아무도 놓아 주지 않았다.
    expect(run.rendered.map((entry) => entry.phase)).toEqual(['all'])
    run.handle.skip()
    await expect(run.handle.firstPass).resolves.toBeUndefined()
  })

  it('접은 바퀴의 남은 라인은 그리지도 알리지도 않는다', async () => {
    const run = heldHarness(twoWins(), 4)
    await drain()
    run.handle.skip()
    await drain()
    const firstCycle = run.rendered.filter((entry) => entry.context.cycle === 0)
    // A단계 하나만 나가고 라인 두 개는 통째로 접혔다.
    expect(firstCycle.map((entry) => entry.phase)).toEqual(['all'])
  })

  it('접은 자리에서 다음 바퀴가 A단계부터 다시 시작한다', async () => {
    const run = heldHarness(twoWins(), 4)
    await drain()
    run.handle.skip()
    await drain()
    expect(run.rendered.map((entry) => entry.phase)).toEqual(['all', 'all'])
    expect(run.rendered.map((entry) => entry.context.cycle)).toEqual([0, 1])
  })

  it('접은 뒤에도 순환은 정상적으로 라인을 다시 짚는다', async () => {
    const run = runHarness(twoWins(), { stopAfter: 7 })
    run.skip()
    await run.firstPass
    await drain()
    // 0바퀴는 접혔고, 1바퀴부터는 A-라인-라인이 온전히 나온다.
    const later = run.rendered.filter((entry) => entry.context.cycle >= 1)
    expect(later.map((entry) => entry.phase)).toEqual(['all', 'line', 'line', 'all', 'line', 'line'])
    expect(later.filter((entry) => entry.phase === 'line').map((entry) => entry.context.index)).toEqual([
      0, 1, 0, 1,
    ])
  })

  it('loop: false면 접었을 때 그대로 끝난다', async () => {
    const rendered: string[] = []
    // 영영 resolve하지 않는 기다림. 스킵 말고는 다음 스텝으로 갈 방법이 없다.
    const single = runPresentation(twoWins(), {
      render: (step) => rendered.push(step.phase),
      wait: () => new Promise<void>(() => undefined),
      cancelled: () => false,
      loop: false,
    })
    single.skip()
    await expect(single.firstPass).resolves.toBeUndefined()
    await drain()
    expect(rendered).toEqual(['all'])
  })

  it('연출이 이미 끝난 뒤에 접어도 아무 일도 없다', async () => {
    const run = runHarness(twoWins(), { loop: false })
    await run.firstPass
    const before = run.rendered.length
    run.skip()
    await drain()
    expect(run.rendered).toHaveLength(before)
  })
})

describe('buildPresentation 모션 축소', () => {
  it('모든 단계를 짧은 상한으로 자른다', () => {
    const steps = buildPresentation([makeWin(0, 200, 100), makeWin(1, 10, 5)], math, {
      totalBet: 10,
      reducedMotion: true,
    })
    for (const step of steps) {
      expect(step.durationMs).toBeLessThanOrEqual(REDUCED_WIN_CYCLE_MS)
    }
  })

  it('단계 순서는 그대로다', () => {
    const steps = buildPresentation([makeWin(0, 10, 5), makeWin(1, 10, 5)], math, {
      totalBet: 500,
      reducedMotion: true,
    })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'line', 'line'])
  })
})

describe('스핀 속도와 승리 연출', () => {
  it('터보는 A단계 홀드를 줄인다', () => {
    const normal = buildPresentation([makeWin(0, 10, 5)], math, { totalBet: 500 })
    const turbo = buildPresentation([makeWin(0, 10, 5)], math, { totalBet: 500, speed: 'turbo' })
    expect(turbo[0]?.durationMs ?? 0).toBeLessThan(normal[0]?.durationMs ?? 0)
    expect(turbo[0]?.durationMs).toBe(Math.round(PHASE_ALL_MS * SPIN_SPEED_PROFILES.turbo.winHoldScale))
  })

  it('quick은 홀드를 건드리지 않는다', () => {
    const normal = buildPresentation([makeWin(0, 10, 5)], math, { totalBet: 500 })
    const quick = buildPresentation([makeWin(0, 10, 5)], math, { totalBet: 500, speed: 'quick' })
    expect(quick[0]?.durationMs).toBe(normal[0]?.durationMs)
  })

  it('라인 스텝은 속도와 무관하게 같은 길이다', () => {
    // B단계는 읽는 시간이다. 여기까지 줄이면 무엇으로 이겼는지 읽을 수 없다.
    const turbo = buildPresentation([makeWin(0, 10, 5), makeWin(1, 10, 5)], math, {
      totalBet: 500,
      speed: 'turbo',
    })
    for (const step of turbo) {
      if (step.phase === 'line') expect(step.durationMs).toBe(PHASE_LINE_MS)
    }
  })

  it('등급이 높아도 터보 비율은 그대로 적용된다', () => {
    const turbo = buildPresentation([makeWin(0, 200, 100)], math, { totalBet: 10, speed: 'turbo' })
    expect(turbo[0]?.durationMs).toBe(
      Math.round(PHASE_ALL_MEGA_MS * SPIN_SPEED_PROFILES.turbo.winHoldScale),
    )
  })

  it('모션 축소 상한이 속도보다 먼저다', () => {
    const steps = buildPresentation([makeWin(0, 200, 100)], math, {
      totalBet: 10,
      speed: 'normal',
      reducedMotion: true,
    })
    for (const step of steps) expect(step.durationMs).toBeLessThanOrEqual(REDUCED_WIN_CYCLE_MS)
  })

  it('옵션 변환이 속도를 함께 옮긴다', () => {
    expect(presentationOptionsFor({ totalBet: 10 }, false, 'turbo').speed).toBe('turbo')
    expect(presentationOptionsFor({ totalBet: 10 }, false).speed).toBeUndefined()
  })
})

describe("buildPresentation — presentation: 'brief' (오토스핀용 단축 연출)", () => {
  const fiveWins = [
    makeWin(0, 20, 10),
    makeWin(1, 20, 10),
    makeWin(2, 20, 10),
    makeWin(3, 20, 10),
    makeWin(4, 20, 10),
  ]

  it('라인 스텝(B단계)을 아예 만들지 않는다 — A단계 하나뿐이다', () => {
    const steps = buildPresentation(fiveWins, math, { totalBet: 500, presentation: 'brief' })
    expect(steps.map((step) => step.phase)).toEqual(['all'])
    expect(lineStepCount(steps)).toBe(0)
  })

  it("기본값('full')과 명시적 'full'은 예전 그대로 라인별 순차를 만든다", () => {
    const implicit = buildPresentation(fiveWins, math, { totalBet: 500 })
    const explicit = buildPresentation(fiveWins, math, { totalBet: 500, presentation: 'full' })
    expect(implicit).toEqual(explicit)
    expect(lineStepCount(implicit)).toBe(5)
  })

  it('A단계 홀드가 등급을 타지 않는다 — 빅윈/메가도 보통 승리와 같은 길이로 스쳐 지나간다', () => {
    const brief = PHASE_ALL_MS * BRIEF_PHASE_ALL_SCALE
    // 같은 승리를 full로 만들면 등급별로 길이가 갈린다(대조군).
    expect(buildPresentation([makeWin(0, 200, 100)], math, { totalBet: 10 })[0]?.durationMs).toBe(
      PHASE_ALL_MEGA_MS,
    )

    for (const totalBet of [10, 100, 500]) {
      const steps = buildPresentation([makeWin(0, 200, 100)], math, {
        totalBet,
        presentation: 'brief',
      })
      expect(steps[0]?.durationMs).toBe(Math.round(brief))
    }
    // 등급 자체는 스텝에 그대로 남는다(코인/색종이 연출이 이 값을 본다).
    expect(buildPresentation([makeWin(0, 200, 100)], math, { totalBet: 10, presentation: 'brief' })[0]).toMatchObject(
      { phase: 'all', tier: 'mega' },
    )
  })

  it('속도 프로파일 배율은 그대로 얹힌다', () => {
    const turbo = buildPresentation(fiveWins, math, {
      totalBet: 500,
      presentation: 'brief',
      speed: 'turbo',
    })
    expect(turbo[0]?.durationMs).toBe(
      Math.round(PHASE_ALL_MS * BRIEF_PHASE_ALL_SCALE * SPIN_SPEED_PROFILES.turbo.winHoldScale),
    )
  })

  it('한 바퀴 총 길이가 1.2초(터보는 0.6초) 안에 들어온다 — 라인이 5개여도', () => {
    for (const speed of ['normal', 'quick'] as const) {
      const steps = buildPresentation(fiveWins, math, {
        totalBet: 10, // 최고 등급으로 판정되는 배수
        presentation: 'brief',
        speed,
      })
      expect(presentationCycleMs(steps)).toBeLessThanOrEqual(1200)
    }
    const turbo = buildPresentation(fiveWins, math, {
      totalBet: 10,
      presentation: 'brief',
      speed: 'turbo',
    })
    expect(presentationCycleMs(turbo)).toBeLessThanOrEqual(600)

    // 대조군 — full은 같은 입력에서 9초를 넘긴다(이 작업의 출발점이 된 실측 문제).
    const full = buildPresentation(fiveWins, math, { totalBet: 10 })
    expect(presentationCycleMs(full)).toBeGreaterThan(9000)
  })

  it('프리스핀 피처 스텝은 남는다 — featureTriggered가 끊기면 허브 인트로/진입 게이트가 죽는다', () => {
    const freeSpins: FeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }
    const steps = buildPresentation(fiveWins, math, {
      totalBet: 500,
      presentation: 'brief',
      features: [freeSpins],
    })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'feature'])
  })

  it('모션 축소 상한이 brief 위에도 그대로 얹힌다', () => {
    const steps = buildPresentation(fiveWins, math, {
      totalBet: 10,
      presentation: 'brief',
      reducedMotion: true,
    })
    for (const step of steps) expect(step.durationMs).toBeLessThanOrEqual(REDUCED_WIN_CYCLE_MS)
  })

  it('보여줄 것이 없으면 brief도 빈 목록이다', () => {
    expect(buildPresentation([], math, { presentation: 'brief' })).toEqual([])
  })

  it('옵션 변환이 presentation을 함께 옮긴다', () => {
    expect(presentationOptionsFor({ presentation: 'brief' }, false).presentation).toBe('brief')
    expect(presentationOptionsFor({ totalBet: 10 }, false).presentation).toBeUndefined()
  })

  it('brief는 loop을 함께 넘겨도 언제나 한 바퀴다', () => {
    expect(shouldLoopPresentation(undefined)).toBe(true)
    expect(shouldLoopPresentation({})).toBe(true)
    expect(shouldLoopPresentation({ loop: true })).toBe(true)
    expect(shouldLoopPresentation({ loop: false })).toBe(false)
    expect(shouldLoopPresentation({ presentation: 'full' })).toBe(true)
    expect(shouldLoopPresentation({ presentation: 'brief' })).toBe(false)
    // loop:true를 함께 줘도 brief가 이긴다 — 아니면 오토스핀이 짧은 연출을 무한 반복한다.
    expect(shouldLoopPresentation({ presentation: 'brief', loop: true })).toBe(false)
  })
})

describe('defaultLineLabel', () => {
  it('라인 번호와 심볼 이름과 배당을 보여준다', () => {
    expect(defaultLineLabel(makeWin(0, 1234, 617))).toBe('Line 1 · seven · 1,234')
    expect(defaultLineLabel(makeWin(4, 20, 10))).toBe('Line 5 · seven · 20')
  })

  it('그룹 배당이면 그룹 id를 쓴다', () => {
    // win.symbol이 그룹 id와 같더라도 group 쪽을 우선한다.
    const groupWin = { ...makeWin(2, 60, 30), symbol: 'anybar', group: 'anybar' }
    expect(defaultLineLabel(groupWin)).toBe('Line 3 · anybar · 60')
  })

  it('그룹이 없으면 심볼 id로 되돌아간다', () => {
    const plain = { ...makeWin(1, 40, 20), symbol: 'bell' }
    expect(defaultLineLabel(plain)).toBe('Line 2 · bell · 40')
  })
})

describe('phaseAllDurationMs', () => {
  it('등급이 오를수록 길어지거나 같다', () => {
    const none = phaseAllDurationMs('none')
    const big = phaseAllDurationMs('big')
    const mega = phaseAllDurationMs('mega')
    expect(big).toBeGreaterThan(none)
    expect(mega).toBeGreaterThan(big)
  })

  it('MEGA 이상은 모두 같은 길이다', () => {
    expect(phaseAllDurationMs('epic')).toBe(phaseAllDurationMs('mega'))
    expect(phaseAllDurationMs('max')).toBe(phaseAllDurationMs('mega'))
  })

  it('문서가 정한 값과 일치한다', () => {
    // 기존 900 / 1600 / 2200에서 1.4배로 늘린 값이다.
    expect(phaseAllDurationMs('none')).toBe(1260)
    expect(phaseAllDurationMs('big')).toBe(2240)
    expect(phaseAllDurationMs('mega')).toBe(3080)
  })
})

describe('승리 등급 문턱', () => {
  it('10 / 20 / 50 / 100배다', () => {
    expect(WIN_TIER_MULTIPLIERS).toEqual({ big: 10, mega: 20, epic: 50, max: 100 })
  })
})

describe('피처가 있는 연출', () => {
  const freeSpins: FeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }
  const scatterWin: FeatureTrigger = {
    type: 'scatterWin',
    symbol: 'scatter',
    count: 3,
    win: 200,
    positions: [
      [0, 0],
      [2, 1],
      [4, 2],
    ],
  }

  it('프리스핀에 걸리면 A단계 바로 뒤에 피처 단계가 낀다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10)], math, {
      totalBet: 500,
      features: [scatterWin, freeSpins],
    })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'feature', 'line'])
  })

  it('피처 단계는 프리스핀 트리거를 그대로 들고 있다', () => {
    const steps = buildPresentation([], math, { totalBet: 500, features: [scatterWin, freeSpins] })
    const feature = steps.find((step) => step.phase === 'feature')
    expect(feature?.phase).toBe('feature')
    if (feature?.phase === 'feature') expect(feature.feature).toEqual(freeSpins)
  })

  it('피처 단계 길이는 900ms다', () => {
    const steps = buildPresentation([], math, { totalBet: 500, features: [freeSpins] })
    const feature = steps.find((step) => step.phase === 'feature')
    expect(feature?.durationMs).toBe(PHASE_FEATURE_MS)
  })

  it('프리스핀이 없으면 피처 단계도 없다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10)], math, {
      totalBet: 500,
      features: [scatterWin],
    })
    expect(steps.map((step) => step.phase)).toEqual(['all', 'line'])
  })

  it('모든 스텝이 스캐터 좌표를 함께 들고 다닌다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10), makeWin(1, 20, 10)], math, {
      totalBet: 500,
      features: [scatterWin, freeSpins],
    })
    expect(steps).toHaveLength(4)
    for (const step of steps) {
      expect(step.scatters).toEqual(scatterWin.positions)
    }
  })

  it('라인 승리가 없어도 스캐터만으로 연출이 생긴다', () => {
    const steps = buildPresentation([], math, { totalBet: 500, features: [scatterWin] })
    expect(steps.map((step) => step.phase)).toEqual(['all'])
    expect(steps[0]?.scatters).toHaveLength(3)
  })

  it('라인도 피처도 없으면 아무것도 하지 않는다', () => {
    expect(buildPresentation([], math, { totalBet: 500, features: [] })).toEqual([])
  })

  it('스캐터가 없으면 좌표 목록이 비어 있다', () => {
    const steps = buildPresentation([makeWin(0, 20, 10)], math, { totalBet: 500 })
    expect(steps[0]?.scatters).toEqual([])
  })

  it('모션 축소에서도 피처 단계는 살아 있고 길이만 줄어든다', () => {
    const steps = buildPresentation([], math, {
      totalBet: 500,
      features: [scatterWin, freeSpins],
      reducedMotion: true,
    })
    const feature = steps.find((step) => step.phase === 'feature')
    expect(feature).toBeDefined()
    expect(feature?.durationMs).toBeLessThanOrEqual(REDUCED_WIN_CYCLE_MS)
  })
})

describe('showWins 옵션 전달', () => {
  const scatterWin: FeatureTrigger = {
    type: 'scatterWin',
    symbol: 'scatter',
    count: 3,
    win: 200,
    positions: [[0, 0]],
  }
  const freeSpins: FeatureTrigger = { type: 'freeSpins', spins: 10, multiplier: 2, retrigger: false }

  it('피처를 그대로 넘긴다', () => {
    // 이걸 빠뜨리면 스캐터 링도 피처 단계도 조용히 사라진다.
    const options = presentationOptionsFor({ features: [scatterWin, freeSpins] }, false)
    expect(options.features).toEqual([scatterWin, freeSpins])
  })

  it('베팅액을 그대로 넘긴다', () => {
    expect(presentationOptionsFor({ totalBet: 50 }, false).totalBet).toBe(50)
  })

  it('모션 축소 여부를 함께 싣는다', () => {
    expect(presentationOptionsFor(undefined, true).reducedMotion).toBe(true)
  })

  it('옵션이 없어도 동작한다', () => {
    const options = presentationOptionsFor(undefined, false)
    expect(options.features).toBeUndefined()
    expect(options.totalBet).toBeUndefined()
  })

  it('옮긴 옵션으로 피처 단계가 실제로 생긴다', () => {
    // showWins가 실제로 만드는 계획과 같은 경로다.
    const steps = buildPresentation(
      [],
      math,
      presentationOptionsFor({ totalBet: 500, features: [scatterWin, freeSpins] }, false),
    )
    expect(steps.map((step) => step.phase)).toEqual(['all', 'feature'])
    expect(steps[0]?.scatters).toEqual([[0, 0]])
  })

  it('라인 승리가 없어도 스캐터만으로 연출이 생긴다', () => {
    const steps = buildPresentation(
      [],
      math,
      presentationOptionsFor({ features: [scatterWin] }, false),
    )
    expect(steps.length).toBeGreaterThan(0)
  })
})
