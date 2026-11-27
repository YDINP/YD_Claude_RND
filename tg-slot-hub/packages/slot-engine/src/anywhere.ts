import type { GameMath } from './schema.js'
import { payoutForCount } from './evaluate.js'
import type { GridPosition, SymbolId, WinLine } from './types.js'

/**
 * 위치 무관 지불 평가. RNG를 쓰지 않는 순수 함수다. `grid[row][reel]`.
 *
 * - 심볼을 `math.symbols` 선언 순서로 훑고, 스캐터·와일드는 세지 않는다.
 * - 판 전체 개수가 `anywhere.minCount` 이상이고 지급표에 해당 구간이 있으면 그 그림 **전부**를 지급한다.
 * - 배당 기준은 총 베팅액이다. `ladder`는 `runCascades`와 모양을 맞추려는 인자이고 이 지불 방식에서는 늘 1이다.
 *
 * `positions`는 그 그림 칸 전부(reel, row 오름차순), `removed`는 승리 칸의 합집합(reel, row 오름차순)이다.
 */
export function evaluateAnywhere(
  grid: readonly (readonly SymbolId[])[],
  math: GameMath,
  totalBet: number,
  ladder: number,
): { wins: WinLine[]; removed: GridPosition[] } {
  const config = math.anywhere
  if (config === undefined) throw new RangeError('anywhere 설정이 없는 게임에 evaluateAnywhere를 호출했다')
  const reels = math.reels
  const rows = math.rows

  const counts = new Map<SymbolId, number>()
  for (let row = 0; row < rows; row += 1) {
    const line = grid[row]
    for (let reel = 0; reel < reels; reel += 1) {
      const symbol = line?.[reel] as SymbolId
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
    }
  }

  const wins: WinLine[] = []
  const paying = new Set<SymbolId>()
  for (const symbol of math.symbols) {
    if (symbol.wild === true || symbol.scatter === true) continue
    const count = counts.get(symbol.id) ?? 0
    if (count < config.minCount) continue
    const multiplier = payoutForCount(math.paytable[symbol.id], count)
    if (multiplier <= 0) continue
    paying.add(symbol.id)
    const positions: GridPosition[] = []
    for (let reel = 0; reel < reels; reel += 1) {
      for (let row = 0; row < rows; row += 1) {
        if (grid[row]?.[reel] === symbol.id) positions.push([reel, row])
      }
    }
    wins.push({
      line: -1,
      symbol: symbol.id,
      count,
      multiplier,
      win: Math.round(multiplier * totalBet * ladder),
      positions,
      payKind: 'anywhere',
      ladder,
    })
  }

  const removed: GridPosition[] = []
  if (paying.size > 0) {
    for (let reel = 0; reel < reels; reel += 1) {
      for (let row = 0; row < rows; row += 1) {
        if (paying.has(grid[row]?.[reel] as SymbolId)) removed.push([reel, row])
      }
    }
  }
  return { wins, removed }
}
