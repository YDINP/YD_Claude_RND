import type { GameMath, WinLine } from '@tgslot/slot-engine'
import {
  PHASE_ALL_BIGWIN_MS,
  PHASE_ALL_MEGA_MS,
  PHASE_ALL_MS,
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
 * `all`은 이긴 심볼 전부를 동시에 보여주는 A단계,
 * `line`은 라인을 하나씩 짚어 가는 B단계다.
 */
export type PresentationStep =
  | { phase: 'all'; wins: WinLine[]; totalWin: number; tier: WinTier; durationMs: number }
  | { phase: 'line'; win: WinLine; durationMs: number }

export interface PresentationOptions {
  totalBet?: number
  reducedMotion?: boolean
}

/**
 * 한 바퀴 분량의 연출 순서. 호출 측이 이 목록을 반복 재생한다.
 *
 * - 승리가 없으면 빈 목록이다.
 * - A단계는 승리가 하나라도 있으면 언제나 맨 앞에 온다. 빅윈이면 더 길게 머문다.
 * - B단계는 라인 인덱스 순서다. 승리가 하나뿐이어도 그 라인 하나가 그대로 반복된다.
 *
 * 순수 함수라 타이머 없이 순서와 길이를 그대로 검증할 수 있다.
 */
export function buildPresentation(
  wins: readonly WinLine[],
  math: GameMath,
  options: PresentationOptions = {},
): PresentationStep[] {
  if (wins.length === 0) return []

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
      durationMs: cap(phaseAllDurationMs(tier)),
    },
  ]
  for (const win of ordered) {
    steps.push({ phase: 'line', win, durationMs: cap(PHASE_LINE_MS) })
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
