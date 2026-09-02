import type { GameMath } from './schema.js'
import { getLineCandidates } from './evaluate.js'
import type { EvaluateResult, GridPosition, SymbolId, WinLine } from './types.js'

/** ways 게임의 "웨이당 베팅액". 총 베팅액을 `ways.betDivisor`로 나눈다. */
export function getBetPerWay(math: GameMath, totalBet: number): number {
  const divisor = math.ways?.betDivisor ?? 25
  if (!Number.isInteger(totalBet) || totalBet <= 0) {
    throw new RangeError(`totalBet은 양의 정수여야 한다: ${totalBet}`)
  }
  if (totalBet % divisor !== 0) {
    throw new RangeError(`totalBet(${totalBet})이 betDivisor(${divisor})로 나누어떨어지지 않는다`)
  }
  return totalBet / divisor
}

/** 릴별로 후보 심볼과 일치하는 칸 수와 좌표. */
function reelMatches(
  grid: SymbolId[][],
  math: GameMath,
  matches: ReadonlySet<SymbolId>,
): { counts: number[]; cells: GridPosition[][] } {
  const counts = new Array<number>(math.reels).fill(0)
  const cells: GridPosition[][] = Array.from({ length: math.reels }, () => [])
  for (let row = 0; row < math.rows; row += 1) {
    const line = grid[row]
    if (line === undefined) continue
    for (let reel = 0; reel < math.reels; reel += 1) {
      const symbol = line[reel]
      if (symbol === undefined || !matches.has(symbol)) continue
      counts[reel] = (counts[reel] ?? 0) + 1
      cells[reel]?.push([reel, row])
    }
  }
  return { counts, cells }
}

interface Direction {
  /** 왼쪽부터 훑을 릴 순서. */
  order: number[]
  label: 'ltr' | 'rtl'
}

/**
 * ways 평가. 페이라인이 없고 **인접한 릴의 매칭 칸 수를 곱한** 것이 경로 수다.
 *
 * 왼쪽 릴부터 연속으로 매칭이 이어져야 하고, 끊긴 지점에서 길이가 확정된다.
 * 지급액 = 경로 수 x 배수 x 웨이당 베팅액.
 *
 * `bothWays`면 오른쪽에서도 훑는다. 전 릴 매칭은 양방향이 같은 사건이므로
 * 왼쪽 방향에서 한 번만 센다.
 */
export function evaluateWays(grid: SymbolId[][], math: GameMath, betPerWay: number): EvaluateResult {
  const candidates = getLineCandidates(math)
  const bothWays = math.ways?.bothWays === true
  const forward: number[] = Array.from({ length: math.reels }, (_, index) => index)
  const directions: Direction[] = bothWays
    ? [
        { order: forward, label: 'ltr' },
        { order: [...forward].reverse(), label: 'rtl' },
      ]
    : [{ order: forward, label: 'ltr' }]

  const wins: WinLine[] = []
  let totalWin = 0

  for (const candidate of candidates) {
    const { counts, cells } = reelMatches(grid, math, candidate.matches)

    for (const direction of directions) {
      // 릴별 누적 곱을 들고 간다. 지급 길이가 연속 길이보다 짧을 수 있기 때문이다.
      const cumulative: number[] = [1]
      let run = 0
      for (const reel of direction.order) {
        const count = counts[reel] ?? 0
        if (count === 0) break
        cumulative.push((cumulative[run] ?? 1) * count)
        run += 1
      }
      if (run === 0) continue
      // 전 릴 매칭은 왼쪽 방향에서 이미 셌다. 오른쪽에서 다시 세면 이중 지급이다.
      if (direction.label === 'rtl' && run === math.reels) continue

      const multiplier = candidate.bestPayout[run] ?? 0
      if (multiplier <= 0) continue
      const paidCount = candidate.bestCount[run] ?? run
      // 경로 수는 **지급되는 길이까지만** 곱한다. 4연속인데 3개까지만 배당이 있으면 3릴 곱이다.
      const ways = cumulative[paidCount] ?? 0
      if (ways <= 0) continue
      const win = Math.round(ways * multiplier * betPerWay)
      if (win <= 0) continue

      const positions: GridPosition[] = []
      for (let i = 0; i < paidCount; i += 1) {
        const reel = direction.order[i]
        if (reel === undefined) continue
        for (const cell of cells[reel] ?? []) positions.push(cell)
      }

      wins.push({
        line: -1,
        symbol: candidate.key,
        ...(candidate.group !== null ? { group: candidate.group } : {}),
        count: paidCount,
        multiplier,
        win,
        positions,
        ways,
        direction: direction.label,
      })
      totalWin += win
    }
  }

  return { wins, totalWin }
}
