import type { GameMath } from './schema.js'
import { payoutForCount } from './evaluate.js'
import type { GridPosition, SymbolId, WinLine } from './types.js'

/** 칸 번호는 row * reels + reel. 이웃은 상하좌우만 담고, 모자라는 자리는 -1로 채운다. */
interface Neighbors {
  reels: number
  rows: number
  table: Int16Array
}

const neighborCache = new Map<string, Neighbors>()

function getNeighbors(reels: number, rows: number): Neighbors {
  const key = `${reels}x${rows}`
  const cached = neighborCache.get(key)
  if (cached !== undefined) return cached
  const table = new Int16Array(reels * rows * 4).fill(-1)
  for (let row = 0; row < rows; row += 1) {
    for (let reel = 0; reel < reels; reel += 1) {
      const base = (row * reels + reel) * 4
      if (row > 0) table[base] = (row - 1) * reels + reel
      if (row < rows - 1) table[base + 1] = (row + 1) * reels + reel
      if (reel > 0) table[base + 2] = row * reels + reel - 1
      if (reel < reels - 1) table[base + 3] = row * reels + reel + 1
    }
  }
  const built = { reels, rows, table }
  neighborCache.set(key, built)
  return built
}

/**
 * 한 그리드의 클러스터 승리를 전부 찾는다. RNG를 쓰지 않는 순수 함수다.
 *
 * - 심볼을 `math.symbols` 선언 순서로 훑고, 시작점은 비와일드 칸이다.
 * - 와일드는 `wildJoins`일 때 통과할 수 있다. 여러 그룹에 동시에 끼며 크기에 포함된다.
 * - 스캐터와 다른 심볼은 막힌 칸이다. 와일드만으로 된 그룹은 시작점이 없어 생기지 않는다.
 * - 크기가 `minCluster` 미만이거나 지급표에 해당 티어가 없으면 지급하지 않는다.
 *
 * `removed`는 승리 그룹 좌표의 합집합이고 reel, row 오름차순이다.
 * `grid[row][reel]`.
 */
export function evaluateClusters(
  grid: readonly (readonly SymbolId[])[],
  math: GameMath,
  totalBet: number,
  ladder: number,
): { wins: WinLine[]; removed: GridPosition[] } {
  const cluster = math.cluster
  if (cluster === undefined) throw new RangeError('cluster 설정이 없는 게임에 evaluateClusters를 호출했다')
  const reels = math.reels
  const rows = math.rows
  const { table } = getNeighbors(reels, rows)
  const cells = reels * rows

  const flat: SymbolId[] = new Array<SymbolId>(cells)
  for (let row = 0; row < rows; row += 1) {
    const line = grid[row]
    for (let reel = 0; reel < reels; reel += 1) flat[row * reels + reel] = line?.[reel] as SymbolId
  }

  const wildIds = new Set(math.symbols.filter((s) => s.wild === true).map((s) => s.id))
  const wins: WinLine[] = []
  const removedMask = new Uint8Array(cells)
  const started = new Uint8Array(cells)
  const stamp = new Int32Array(cells)
  let stampId = 0
  const queue = new Int16Array(cells)

  for (const symbol of math.symbols) {
    if (symbol.wild === true || symbol.scatter === true) continue
    const payrule = math.paytable[symbol.id]
    if (payrule === undefined) continue
    for (let start = 0; start < cells; start += 1) {
      if (flat[start] !== symbol.id || started[start] === 1) continue
      stampId += 1
      let head = 0
      let tail = 0
      queue[tail++] = start
      stamp[start] = stampId
      started[start] = 1
      while (head < tail) {
        const at = queue[head++] as number
        for (let k = 0; k < 4; k += 1) {
          const next = table[at * 4 + k] as number
          if (next < 0 || stamp[next] === stampId) continue
          const there = flat[next] as SymbolId
          if (there === symbol.id) started[next] = 1
          else if (!(cluster.wildJoins && wildIds.has(there))) continue
          stamp[next] = stampId
          queue[tail++] = next
        }
      }
      const size = tail
      if (size < cluster.minCluster) continue
      const multiplier = payoutForCount(payrule, size)
      if (multiplier <= 0) continue
      const positions: GridPosition[] = []
      for (let i = 0; i < size; i += 1) {
        const at = queue[i] as number
        removedMask[at] = 1
        positions.push([at % reels, Math.floor(at / reels)])
      }
      positions.sort((a, b) => a[0] - b[0] || a[1] - b[1])
      wins.push({
        line: -1,
        symbol: symbol.id,
        count: size,
        multiplier,
        win: Math.round(multiplier * totalBet * ladder),
        positions,
        payKind: 'cluster',
        ladder,
      })
    }
  }

  const removed: GridPosition[] = []
  for (let reel = 0; reel < reels; reel += 1) {
    for (let row = 0; row < rows; row += 1) {
      if (removedMask[row * reels + reel] === 1) removed.push([reel, row])
    }
  }
  return { wins, removed }
}
