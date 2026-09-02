import type { GameMath, WinLine } from '@tgslot/slot-engine'
import { DEFAULT_WAYS_BET_DIVISOR } from './constants.js'

/** ways 지급 방향. 왼쪽부터 읽었는지 오른쪽부터 읽었는지. */
export type WaysDirection = 'ltr' | 'rtl'

/** 페이라인이 없는 ways 게임인지. */
export function isWaysGame(math: GameMath): boolean {
  return math.payModel === 'ways'
}

/** 오른쪽에서도 읽는 게임인지. 빛이 거꾸로 흐를지를 여기서 정한다. */
export function isBothWays(math: GameMath): boolean {
  return math.ways?.bothWays === true
}

/** 배당 단위 개수. 라인 게임은 라인 수, ways 게임은 `ways.betDivisor`다. */
export function betUnitCount(math: GameMath): number {
  if (!isWaysGame(math)) return math.paylines.length
  return math.ways?.betDivisor ?? DEFAULT_WAYS_BET_DIVISOR
}

/**
 * 이 승리가 ways 지급인지.
 *
 * 엔진은 ways 승리에 `ways`를 채우고 `line`을 -1로 둔다. 둘 중 하나만 봐도 되지만
 * 라인 인덱스가 음수인 것을 라인 승리로 오해하면 페이라인 배열을 음수로 읽게 된다.
 */
export function isWaysWin(win: WinLine): boolean {
  return win.ways !== undefined || win.line < 0
}

/**
 * 경로 수. 엔진이 알려 주면 그 값을 쓰고, 없으면 좌표에서 되짚는다.
 * 되짚는 값은 릴별 매칭 칸 수의 곱이다 (ways의 정의 그대로).
 */
export function waysCountOf(win: WinLine): number {
  if (typeof win.ways === 'number' && win.ways > 0) return win.ways
  const perReel = new Map<number, number>()
  for (const [reel] of win.positions) perReel.set(reel, (perReel.get(reel) ?? 0) + 1)
  if (perReel.size === 0) return 0
  let product = 1
  for (const count of perReel.values()) product *= count
  return product
}

/** 지급 방향. 엔진이 알려 주지 않으면 왼쪽부터로 본다. */
export function waysDirectionOf(win: WinLine): WaysDirection {
  return win.direction === 'rtl' ? 'rtl' : 'ltr'
}

/**
 * ways 승리의 기본 명판 문구. `{심볼} × {경로 수} ways · {배당}`.
 *
 * 이름 자리에는 그룹 배당이면 그룹 id가 온다. 렌더러는 번역을 모르므로 id를 그대로 쓴다.
 * 금액을 빼면 라인 게임 명판보다 정보가 적어진다. 라인 문구와 같은 구분자를 쓴다.
 */
export function defaultWaysLabel(win: WinLine): string {
  const name = win.group ?? win.symbol
  const ways = waysCountOf(win).toLocaleString('en-US')
  return `${name} × ${ways} ways · ${win.win.toLocaleString('en-US')}`
}

/**
 * ways 승리의 재생 순서. 큰 배당부터 보여주고, 같으면 심볼 id와 방향으로 갈라 결정론을 지킨다.
 *
 * 라인 게임처럼 `line` 인덱스로 정렬할 수 없다. ways에는 라인이 없어 전부 -1이기 때문이다.
 */
export function sortWaysWins(wins: readonly WinLine[]): WinLine[] {
  return [...wins].sort((a, b) => {
    if (b.win !== a.win) return b.win - a.win
    const nameA = a.group ?? a.symbol
    const nameB = b.group ?? b.symbol
    if (nameA !== nameB) return nameA < nameB ? -1 : 1
    const dirA = waysDirectionOf(a)
    const dirB = waysDirectionOf(b)
    if (dirA !== dirB) return dirA < dirB ? -1 : 1
    return 0
  })
}
