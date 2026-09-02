import type { GameMath, GridPosition, WinLine } from '@tgslot/slot-engine'
import {
  findFreeSpins,
  scatterPositions,
  type FeatureTrigger,
  type FreeSpinsTrigger,
} from './features.js'
import {
  PHASE_ALL_BIGWIN_MS,
  PHASE_ALL_MEGA_MS,
  PHASE_ALL_MS,
  PHASE_FEATURE_MS,
  PHASE_LINE_MS,
  REDUCED_WIN_CYCLE_MS,
} from './constants.js'
import { totalWinOf, winTier, type WinTier } from './wins.js'

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
 * - `line`: 라인을 하나씩 짚어 가는 B단계
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

  const tier = winTier(wins, math, options.totalBet)
  const ordered = [...wins].sort((a, b) => a.line - b.line)

  const steps: PresentationStep[] = [
    {
      phase: 'all',
      wins: ordered,
      totalWin: totalWinOf(ordered),
      tier,
      scatters,
      durationMs: cap(phaseAllDurationMs(tier)),
    },
  ]
  if (freeSpins !== null) {
    steps.push({ phase: 'feature', feature: freeSpins, scatters, durationMs: cap(PHASE_FEATURE_MS) })
  }
  for (const win of ordered) {
    steps.push({ phase: 'line', win, scatters, durationMs: cap(PHASE_LINE_MS) })
  }
  return steps
}

/** 한 바퀴 전체 길이(ms). */
export function presentationCycleMs(steps: readonly PresentationStep[]): number {
  return steps.reduce((sum, step) => sum + step.durationMs, 0)
}

/**
 * 라인 옆 명판에 찍는 기본 문구. 게임이 `formatLineLabel`로 갈아끼울 수 있다.
 *
 * 이름 자리에는 그룹 배당이면 그룹 id(`anybar` 등), 아니면 심볼 id가 온다.
 * 렌더러는 번역을 모르므로 id를 그대로 쓴다. 사람이 읽을 이름은 허브가 넣는다.
 */
export function defaultLineLabel(win: WinLine): string {
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
  opts: { totalBet?: number; features?: readonly FeatureTrigger[] } | undefined,
  reducedMotion: boolean,
): PresentationOptions {
  const options: PresentationOptions = { reducedMotion }
  if (opts?.totalBet !== undefined) options.totalBet = opts.totalBet
  if (opts?.features !== undefined) options.features = opts.features
  return options
}
