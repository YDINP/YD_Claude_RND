import type { GameMath, WinLine } from '@tgslot/slot-engine'
import { BIG_WIN_BET_MULTIPLIER, WIN_CYCLE_MS, WIN_TIER_MULTIPLIERS } from './constants.js'
import { betUnitCount, isWaysGame, waysCountOf } from './ways.js'

/** 승리 라인의 총 지급 코인. */
export function totalWinOf(wins: readonly WinLine[]): number {
  return wins.reduce((sum, win) => sum + win.win, 0)
}

/**
 * 총 배당이 베팅액의 몇 배인지.
 *
 * `totalBet`을 주면 정확히 계산한다. 없으면 배당 단위로 나눠 추정한다.
 * - 라인 게임: `win = multiplier x betPerLine`, `totalBet = betPerLine x lines`
 * - ways 게임: `win = ways x multiplier x betPerWay`, `totalBet = betPerWay x betDivisor`
 *
 * ways에서 라인 수로 나누면 0으로 나누게 된다. 페이라인이 아예 없기 때문이다.
 */
export function winBetMultiple(wins: readonly WinLine[], math: GameMath, totalBet?: number): number {
  if (typeof totalBet === 'number' && totalBet > 0) return totalWinOf(wins) / totalBet
  const units = betUnitCount(math)
  if (units <= 0) return 0
  if (isWaysGame(math)) {
    return wins.reduce((sum, win) => sum + waysCountOf(win) * win.multiplier, 0) / units
  }
  return wins.reduce((sum, win) => sum + win.multiplier, 0) / units
}

/**
 * 승리 등급. 배당이 클수록 위로 올라간다.
 * `none`은 등급에 못 미친 보통 승리이고, 승리가 아예 없을 때도 `none`이다.
 */
export type WinTier = 'none' | 'big' | 'mega' | 'epic' | 'max'

/** 낮은 등급부터 높은 등급 순서. 배너와 코인 세기를 고를 때 인덱스로 쓴다. */
export const WIN_TIERS: readonly WinTier[] = ['none', 'big', 'mega', 'epic', 'max']

/**
 * 총 배당이 베팅액의 몇 배인지로 등급을 정한다.
 * 문턱은 `docs/REFERENCE_PRAGMATIC.md` §2를 따른다: 10 / 20 / 50 / 100배.
 */
export function winTier(wins: readonly WinLine[], math: GameMath, totalBet?: number): WinTier {
  if (wins.length === 0) return 'none'
  const multiple = winBetMultiple(wins, math, totalBet)
  if (multiple >= WIN_TIER_MULTIPLIERS.max) return 'max'
  if (multiple >= WIN_TIER_MULTIPLIERS.epic) return 'epic'
  if (multiple >= WIN_TIER_MULTIPLIERS.mega) return 'mega'
  if (multiple >= WIN_TIER_MULTIPLIERS.big) return 'big'
  return 'none'
}

/** 빅윈(코인 샤워) 판정. 등급이 붙었다는 뜻이고 기본 기준은 베팅액의 10배다. */
export function isBigWin(
  wins: readonly WinLine[],
  math: GameMath,
  totalBet?: number,
  threshold: number = BIG_WIN_BET_MULTIPLIER,
): boolean {
  if (wins.length === 0) return false
  return winBetMultiple(wins, math, totalBet) >= threshold
}

/** 페이라인 색. 라인 인덱스를 팔레트 길이로 감아 고른다. */
export function paylineColor(palette: readonly string[], line: number): string {
  if (palette.length === 0) throw new RangeError('winLine 팔레트가 비었다')
  const color = palette[((line % palette.length) + palette.length) % palette.length]
  if (color === undefined) throw new RangeError(`팔레트 색을 찾지 못했다: ${line}`)
  return color
}

export interface WinCycleStep {
  /** 이 단계에서 보여줄 승리 라인. */
  win: WinLine
  /** 스텝 시작 시각(ms). */
  atMs: number
}

/**
 * 승리 라인을 한 줄씩 순환하는 재생 목록.
 * `loop`가 false면 목록 1회분만, true면 호출 측이 이 목록을 반복한다.
 */
export function buildWinCycle(wins: readonly WinLine[], cycleMs: number = WIN_CYCLE_MS): WinCycleStep[] {
  return wins.map((win, index) => ({ win, atMs: index * cycleMs }))
}

/** 라인 옆에 띄우는 배당 라벨. 코인 단위 정수. */
export function formatWinLabel(win: WinLine): string {
  return `+${win.win.toLocaleString('en-US')}`
}
