import type { GameMath } from './schema.js'
import { getLineCandidates, getWildChampions, getWildIds } from './evaluate.js'
import type { EvaluateResult, GridPosition, SymbolId, WinLine } from './types.js'

/**
 * 가운데 릴부터 양쪽으로 읽는 ways 평가(`ways.from: 'center'`). 릴 수는 홀수다(스키마).
 *
 * 1. 후보(심볼·와일드 대체)마다 릴별로 맞는 칸 수 `c_r`를 센다. 판 밖 칸(`VOID_CELL`)은 어떤 후보에도 안 맞는다.
 * 2. 가운데 릴에 없으면 지급 없음.
 * 3. 가운데에서 왼쪽으로 끊김 없이 맞는 릴 수 `L`, 오른쪽 `R`. 줄 길이 `n = 1 + L + R`.
 * 4. 길 수 = 줄에 든 릴들의 `c_r` 곱. 지급 = 길 수 × 배당(n) × 길당 베팅.
 * 5. 후보 하나는 한 번만 지급한다(줄은 «가운데에서 이어진 최대 범위» 하나로 유일하다. 고르는 단계 없음).
 * 6. 지급 칸이 전부 와일드인 길은 `getWildChampions`의 챔피언만 지급한다(`evaluateWays`와 같은 규칙).
 *
 * 반환 모양은 `evaluateWays`와 같다(`line: -1`, `ways`, `count = n`). `direction`은 `'center'`,
 * `positions`는 **가운데 릴부터 바깥으로**(가운데 → 왼쪽 1 → 오른쪽 1 → 왼쪽 2 → 오른쪽 2, 릴 안에서는 행 순서) 싣는다.
 * 렌더러가 «가운데부터 차례로 빛남»을 그대로 그릴 수 있게 하려는 순서다.
 *
 * 스키마가 배당 개수의 연속(최소 개수부터 reels까지 빈칸 없음)을 강제하므로 지급 개수는 항상 `n`이다.
 */
export function evaluateCenterWays(grid: SymbolId[][], math: GameMath, betPerWay: number): EvaluateResult {
  const candidates = getLineCandidates(math)
  const wildIds = getWildIds(math)
  const wildChampions = getWildChampions(math)
  const reels = math.reels
  const center = (reels - 1) >> 1

  const wins: WinLine[] = []
  let totalWin = 0

  for (const candidate of candidates) {
    const counts = new Array<number>(reels).fill(0)
    const nonWild = new Array<number>(reels).fill(0)
    const cells: GridPosition[][] = Array.from({ length: reels }, () => [])
    for (let row = 0; row < grid.length; row += 1) {
      const line = grid[row]
      if (line === undefined) continue
      for (let reel = 0; reel < reels; reel += 1) {
        const symbol = line[reel]
        if (symbol === undefined || !candidate.matches.has(symbol)) continue
        counts[reel] = (counts[reel] ?? 0) + 1
        if (!wildIds.has(symbol)) nonWild[reel] = (nonWild[reel] ?? 0) + 1
        cells[reel]?.push([reel, row])
      }
    }
    if ((counts[center] ?? 0) === 0) continue

    let left = 0
    while (center - left - 1 >= 0 && (counts[center - left - 1] ?? 0) > 0) left += 1
    let right = 0
    while (center + right + 1 < reels && (counts[center + right + 1] ?? 0) > 0) right += 1
    const n = 1 + left + right

    const multiplier = candidate.bestPayout[n] ?? 0
    if (multiplier <= 0) continue

    // 가운데부터 바깥으로 번갈아 담는다. 길 수 곱과 좌표 순서를 한 번에 만든다.
    const order: number[] = [center]
    for (let step = 1; step <= Math.max(left, right); step += 1) {
      if (step <= left) order.push(center - step)
      if (step <= right) order.push(center + step)
    }
    let ways = 1
    let wildOnly = 1
    for (const reel of order) {
      ways *= counts[reel] ?? 0
      wildOnly *= (counts[reel] ?? 0) - (nonWild[reel] ?? 0)
    }
    if (wildChampions[n] !== candidate.key) ways -= wildOnly
    if (ways <= 0) continue
    const win = Math.round(ways * multiplier * betPerWay)
    if (win <= 0) continue

    const positions: GridPosition[] = []
    for (const reel of order) for (const cell of cells[reel] ?? []) positions.push(cell)

    wins.push({
      line: -1,
      symbol: candidate.key,
      ...(candidate.group !== null ? { group: candidate.group } : {}),
      count: n,
      multiplier,
      win,
      positions,
      ways,
      direction: 'center',
    })
    totalWin += win
  }

  return { wins, totalWin }
}
