import type { GameMath, GridPosition, WinLine } from '@tgslot/slot-engine'
import {
  findFreeSpins,
  scatterPositions,
  type FeatureTrigger,
  type FreeSpinsTrigger,
} from './features.js'
import {
  BRIEF_PHASE_ALL_SCALE,
  PHASE_ALL_BIGWIN_MS,
  PHASE_ALL_MEGA_MS,
  PHASE_ALL_MS,
  PHASE_FEATURE_MS,
  PHASE_LINE_MS,
  REDUCED_WIN_CYCLE_MS,
} from './constants.js'
import { totalWinOf, winTier, type WinTier } from './wins.js'
import { defaultWaysLabel, isWaysGame, isWaysWin, sortWaysWins } from './ways.js'
import type { RendererEvent } from './types.js'
import { spinSpeedProfile, type SpinSpeed } from './timing.js'

/** 등급에 맞는 A단계 길이(ms). 등급이 높을수록 오래 머문다. */
export function phaseAllDurationMs(tier: WinTier): number {
  switch (tier) {
    case 'none':
      return PHASE_ALL_MS
    case 'big':
      return PHASE_ALL_BIGWIN_MS
    default:
      return PHASE_ALL_MEGA_MS
  }
}

/**
 * 승리 연출 한 스텝.
 *
 * - `all`: 이긴 심볼 전부를 동시에 보여주는 A단계
 * - `feature`: 프리스핀에 걸렸을 때 A와 B 사이에 한 번 끼는 스캐터 연출
 * - `line`: 라인을 하나씩 짚어 가는 B단계. ways 게임에서는 라인 대신 **심볼 하나**를 짚는다
 *
 * `scatters`는 모든 스텝이 함께 들고 다닌다. 스캐터는 페이라인과 무관하게 이긴 자리라
 * 라인 순환 중에도 어두워지면 안 되기 때문이다.
 */
export type PresentationStep =
  | {
      phase: 'all'
      wins: WinLine[]
      totalWin: number
      tier: WinTier
      scatters: GridPosition[]
      durationMs: number
    }
  | { phase: 'feature'; feature: FreeSpinsTrigger; scatters: GridPosition[]; durationMs: number }
  | { phase: 'line'; win: WinLine; scatters: GridPosition[]; durationMs: number }

export interface PresentationOptions {
  totalBet?: number
  reducedMotion?: boolean
  /** 서버가 준 피처 트리거. 스캐터 좌표와 프리스핀 진입이 여기서 온다. */
  features?: readonly FeatureTrigger[]
  /**
   * 지금 걸린 스핀 속도. A단계 홀드에 `winHoldScale`이 곱해진다.
   * 릴이 0.45초에 서는 터보에서 배당을 3초 붙들면 빨라진 것이 하나도 없기 때문이다.
   */
  speed?: SpinSpeed
  /**
   * 연출 분량. 기본 `'full'`(A단계 + 피처 + 라인별 B단계).
   *
   * `'brief'`는 **A단계(와 피처)만** 만들고 라인 스텝을 아예 만들지 않는다 — 오토스핀처럼
   * 다음 판으로 곧장 넘어가야 하는 흐름용이다. `loop: false`는 순환만 막을 뿐 첫 바퀴 전체
   * (A 1.26~3.08초 + 라인당 1.9초)를 그대로 재생해서, 라인이 4~5개면 연출만 9초를 넘겼다.
   * 홀드도 등급과 무관하게 `PHASE_ALL_MS * BRIEF_PHASE_ALL_SCALE`로 고정한다(속도 배율은 그대로).
   */
  presentation?: 'full' | 'brief'
}

/**
 * 한 바퀴 분량의 연출 순서. 호출 측이 이 목록을 반복 재생한다.
 *
 * - 라인 승리도 피처도 없으면 빈 목록이다.
 * - A단계는 보여줄 것이 하나라도 있으면 언제나 맨 앞에 온다. 등급이 높을수록 더 길게 머문다.
 * - 프리스핀에 걸렸으면 A 다음에 스캐터 연출이 한 번 끼어든다.
 * - B단계는 라인 인덱스 순서다. 승리가 하나뿐이어도 그 라인 하나가 그대로 반복된다.
 * - 라인 승리 없이 스캐터만 이겨도 A단계와 피처 단계는 나온다.
 *
 * 순수 함수라 타이머 없이 순서와 길이를 그대로 검증할 수 있다.
 */
export function buildPresentation(
  wins: readonly WinLine[],
  math: GameMath,
  options: PresentationOptions = {},
): PresentationStep[] {
  const features = options.features ?? []
  const scatters = scatterPositions(features)
  const freeSpins = findFreeSpins(features)
  if (wins.length === 0 && scatters.length === 0 && freeSpins === null) return []

  const reduced = options.reducedMotion === true
  const cap = (ms: number): number => (reduced ? Math.min(ms, REDUCED_WIN_CYCLE_MS) : ms)

  const brief = options.presentation === 'brief'
  const tier = winTier(wins, math, options.totalBet)
  // 홀드만 속도를 탄다. 라인 스텝은 읽는 시간이라 속도와 무관하게 같은 길이를 지킨다.
  // brief는 등급을 홀드에 반영하지 않는다 — 빅윈에서도 같은 길이로 스쳐 지나가야 짧다.
  // (등급 자체는 살아 있다: 스텝의 `tier`와 그에 딸린 코인/색종이 연출은 그대로 간다.)
  const holdBase = brief ? PHASE_ALL_MS * BRIEF_PHASE_ALL_SCALE : phaseAllDurationMs(tier)
  const hold = Math.round(holdBase * spinSpeedProfile(options.speed).winHoldScale)
  // ways 게임에는 라인 인덱스가 없다(-1 고정). 배당 큰 심볼부터 보여준다.
  const ordered = isWaysGame(math) ? sortWaysWins(wins) : [...wins].sort((a, b) => a.line - b.line)

  const steps: PresentationStep[] = [
    {
      phase: 'all',
      wins: ordered,
      totalWin: totalWinOf(ordered),
      tier,
      scatters,
      durationMs: cap(hold),
    },
  ]
  if (freeSpins !== null) {
    steps.push({ phase: 'feature', feature: freeSpins, scatters, durationMs: cap(PHASE_FEATURE_MS) })
  }
  // brief는 여기서 끝난다 — 라인별 순차(B단계)를 만들지 않는 것이 이 모드의 전부다.
  // 피처 스텝은 남긴다: 그걸 빼면 `featureTriggered`가 나가지 않아 허브의 프리스핀 인트로
  // 배너와 진입 게이트가 조용히 끊긴다(연출 단축보다 계약이 우선이다).
  if (brief) return steps
  for (const win of ordered) {
    steps.push({ phase: 'line', win, scatters, durationMs: cap(PHASE_LINE_MS) })
  }
  return steps
}

/** 한 바퀴 전체 길이(ms). */
export function presentationCycleMs(steps: readonly PresentationStep[]): number {
  return steps.reduce((sum, step) => sum + step.durationMs, 0)
}

/** 한 바퀴에서 라인 스텝이 몇 개인지. `winLine` 이벤트의 `total`이 이 값이다. */
export function lineStepCount(steps: readonly PresentationStep[]): number {
  return steps.reduce((count, step) => (step.phase === 'line' ? count + 1 : count), 0)
}

/**
 * 스텝 하나가 이번 바퀴에서 어디쯤인지.
 *
 * - `cycle`: 몇 바퀴째인지. 0부터 늘어난다.
 * - `index`: 이번 바퀴의 라인 스텝 중 몇 번째인지. 라인 스텝이 아닌 자리에서는 뜻이 없다.
 * - `total`: 이번 바퀴의 라인 스텝 개수.
 */
export interface PresentationStepContext {
  cycle: number
  index: number
  total: number
}

/** `winLine` 이벤트 한 개. 타입은 렌더러 이벤트 유니온에서 그대로 뽑아 쓴다. */
export type WinLineEvent = Extract<RendererEvent, { type: 'winLine' }>

/**
 * 라인 스텝 하나를 `winLine` 이벤트로 옮긴다.
 *
 * 허브가 릴 밖에 문구를 그리는 데 필요한 것을 전부 싣는다. 렌더러는 번역도 이름도 모르므로
 * 심볼/그룹은 id 그대로 간다. 없는 값은 키 자체를 넣지 않는다 —
 * `ways: undefined`가 들어가면 라인 승리가 ways 승리처럼 보인다.
 */
export function winLineEvent(win: WinLine, context: PresentationStepContext): WinLineEvent {
  const event: WinLineEvent = {
    type: 'winLine',
    line: win.line,
    win: win.win,
    symbol: win.symbol,
    count: win.count,
    index: context.index,
    total: context.total,
    cycle: context.cycle,
  }
  if (win.ways !== undefined) event.ways = win.ways
  if (win.group !== undefined) event.group = win.group
  if (win.direction !== undefined) event.direction = win.direction
  return event
}

export interface PresentationRunnerDeps {
  /** 스텝 하나를 화면에 올린다. 이벤트도 여기서 나간다. */
  render: (step: PresentationStep, context: PresentationStepContext) => void
  /** `ms`만큼 기다린다. 실제 렌더러는 setTimeout, 테스트는 즉시 resolve를 넣는다. */
  wait: (ms: number) => Promise<void>
  /** true가 되면 그 자리에서 멈춘다. 다음 스핀·`clearWins`·`destroy`가 이걸 켠다. */
  cancelled: () => boolean
  /** 기본 true. false면 한 바퀴만 돌고 끝낸다. */
  loop?: boolean
}

export interface PresentationHandle {
  /**
   * 첫 바퀴가 끝나면 resolve. `skip()`으로 접으면 그 자리에서 곧장 resolve한다.
   * 기다리는 쪽(허브 store)은 이것만 보고 `showingWin`을 빠져나간다.
   */
  firstPass: Promise<void>
  /**
   * 지금 돌고 있는 바퀴를 곧장 접는다. 남은 스텝은 렌더하지 않고 이벤트도 내지 않는다.
   * 순환은 멈추지 않는다 — 접은 자리에서 다음 바퀴가 A단계부터 다시 시작한다.
   * 이미 순환이 끝났거나 취소된 뒤에 불러도 아무 일도 일어나지 않는다.
   */
  skip: () => void
}

/**
 * 연출을 재생한다. `firstPass`는 **첫 바퀴**가 끝나면 resolve한다.
 *
 * `loop`면 그 뒤로도 배경에서 A→B→A로 계속 돈다. 기다리는 쪽(허브 store)은 첫 바퀴만 보고
 * `showingWin`을 빠져나가고, 화면은 다음 스핀까지 계속 순환한다. 승리가 하나뿐이어도
 * 매 바퀴 같은 스텝을 다시 렌더하므로 하이라이트와 심볼 연출이 주기적으로 되살아난다.
 *
 * 타이머를 직접 만들지 않고 `wait`/`cancelled`를 받아 쓰므로 순서와 횟수를 그대로 검증할 수 있다.
 */
export function runPresentation(
  steps: readonly PresentationStep[],
  deps: PresentationRunnerDeps,
): PresentationHandle {
  const total = lineStepCount(steps)
  /** 스킵마다 늘어난다. 돌고 있던 바퀴는 자기 토큰이 밀리면 그 자리에서 접는다. */
  let skipToken = 0
  /** 지금 기다리는 중인 스텝을 깨우는 함수. 기다리는 중이 아니면 null이다. */
  let wake: (() => void) | null = null
  let settleFirstPass: (() => void) | null = null
  let failFirstPass: ((error: unknown) => void) | null = null

  const firstPass = new Promise<void>((resolve, reject) => {
    settleFirstPass = resolve
    failFirstPass = reject
  })

  /** 스텝 하나만큼 기다린다. 스킵이 들어오면 남은 시간을 버리고 곧장 깨어난다. */
  const waitStep = async (ms: number): Promise<void> => {
    await Promise.race([
      deps.wait(ms),
      new Promise<void>((resolve) => {
        wake = resolve
      }),
    ])
    wake = null
  }

  const runPass = async (cycle: number): Promise<void> => {
    const token = skipToken
    let index = 0
    for (const step of steps) {
      if (deps.cancelled() || token !== skipToken) return
      deps.render(step, { cycle, index, total })
      if (step.phase === 'line') index += 1
      await waitStep(step.durationMs)
      // 스킵으로 깨어났다면 남은 스텝은 그리지도 알리지도 않는다.
      if (token !== skipToken) return
    }
  }

  const drive = async (): Promise<void> => {
    try {
      await runPass(0)
    } catch (error) {
      failFirstPass?.(error)
      return
    }
    settleFirstPass?.()
    if (deps.loop === false || steps.length === 0) return

    let cycle = 1
    while (!deps.cancelled()) {
      await runPass(cycle)
      cycle += 1
    }
  }

  void drive().catch(() => {
    // 배경 순환에는 기다리는 사람이 없다. 첫 바퀴의 오류만 호출 측으로 올라간다.
  })

  return {
    firstPass,
    skip: () => {
      skipToken += 1
      wake?.()
    },
  }
}

/**
 * 릴 밖 문구의 기본형. 렌더러는 이제 릴 위에 아무 글자도 찍지 않는다.
 * 허브가 `winLine` 이벤트로 문구를 만들기 전에 쓸 수 있는 폴백이다.
 *
 * 이름 자리에는 그룹 배당이면 그룹 id(`anybar` 등), 아니면 심볼 id가 온다.
 * 렌더러는 번역을 모르므로 id를 그대로 쓴다. 사람이 읽을 이름은 허브가 넣는다.
 *
 * ways 승리에는 라인 번호가 없으므로 `{심볼} × {경로 수} ways`로 바꿔 찍는다.
 */
export function defaultLineLabel(win: WinLine): string {
  if (isWaysWin(win)) return defaultWaysLabel(win)
  const name = win.group ?? win.symbol
  return `Line ${win.line + 1} · ${name} · ${win.win.toLocaleString('en-US')}`
}

/**
 * `showWins`의 옵션을 연출 계획 옵션으로 옮긴다.
 *
 * 손으로 옮기다 `features`를 빠뜨리면 스캐터 링도 피처 단계도 조용히 사라진다.
 * 실제로 그런 적이 있어서 이 한 줄을 따로 떼어 테스트한다.
 */
export function presentationOptionsFor(
  opts:
    | { totalBet?: number; features?: readonly FeatureTrigger[]; presentation?: 'full' | 'brief' }
    | undefined,
  reducedMotion: boolean,
  speed?: SpinSpeed,
): PresentationOptions {
  const options: PresentationOptions = { reducedMotion }
  if (opts?.totalBet !== undefined) options.totalBet = opts.totalBet
  if (opts?.features !== undefined) options.features = opts.features
  if (opts?.presentation !== undefined) options.presentation = opts.presentation
  if (speed !== undefined) options.speed = speed
  return options
}

/**
 * `showWins` 옵션이 순환을 원하는지. 기본은 순환(true)이다.
 *
 * `presentation: 'brief'`는 언제나 한 바퀴다 — `loop`를 함께 넘겨도 무시한다(계약 그대로).
 * `presentationOptionsFor`와 같은 이유로 한 줄이지만 따로 떼어 둔다: 여기가 틀리면 오토스핀이
 * 짧은 연출을 무한히 반복하며 다음 판을 영영 걸지 않는다.
 */
export function shouldLoopPresentation(
  opts: { loop?: boolean; presentation?: 'full' | 'brief' } | undefined,
): boolean {
  if (opts?.presentation === 'brief') return false
  return opts?.loop !== false
}
