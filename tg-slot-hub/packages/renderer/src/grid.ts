import type { GameMath, GridPosition, SymbolId } from '@tgslot/slot-engine'

/**
 * 스트립 인덱스를 길이로 정규화한다. 음수도 감아 준다.
 * 릴은 원형이라 -1은 마지막 칸이다.
 */
export function wrapIndex(index: number, length: number): number {
  if (!Number.isFinite(length) || length <= 0) throw new RangeError(`스트립 길이가 올바르지 않다: ${length}`)
  return ((index % length) + length) % length
}

function stripAt(math: GameMath, reel: number): readonly SymbolId[] {
  const strip = math.strips[reel]
  if (strip === undefined) throw new RangeError(`릴 ${reel}의 스트립이 없다`)
  return strip
}

/**
 * 릴 `reel`의 화면 행 `row`에 보이는 심볼.
 * 엔진 `buildGrid`와 같은 규칙이다: `strip[(stop + row) % len]`.
 * `row`는 -1(위 오버스캔)이나 `rows`(아래 오버스캔)도 받는다.
 */
export function symbolAt(math: GameMath, reel: number, stop: number, row: number): SymbolId {
  const strip = stripAt(math, reel)
  const symbol = strip[wrapIndex(stop + row, strip.length)]
  if (symbol === undefined) throw new RangeError(`릴 ${reel} 스트립이 비었다`)
  return symbol
}

/**
 * 정지 위치 -> 화면 격자. 엔진 `buildGrid`와 **같은 값**을 낸다 (`grid[row][reel]`).
 * 렌더러는 엔진을 런타임 의존성으로 끌어오지 않기 위해 이 함수를 따로 갖고,
 * 테스트에서 엔진 결과와 교차 검증한다.
 */
export function stopsToGrid(math: GameMath, stops: readonly number[]): SymbolId[][] {
  if (stops.length !== math.reels) {
    throw new RangeError(`stops 개수(${stops.length})가 reels(${math.reels})와 다르다`)
  }
  const grid: SymbolId[][] = []
  for (let row = 0; row < math.rows; row += 1) {
    const line: SymbolId[] = []
    for (let reel = 0; reel < math.reels; reel += 1) {
      const stop = stops[reel]
      if (stop === undefined) throw new RangeError(`릴 ${reel}의 정지 위치가 없다`)
      line.push(symbolAt(math, reel, stop, row))
    }
    grid.push(line)
  }
  return grid
}

/** 오버스캔을 포함한 릴 1개의 세로 심볼 목록. 인덱스 0이 위쪽 오버스캔(row -1)이다. */
export function reelStripWindow(math: GameMath, reel: number, stop: number): SymbolId[] {
  const window: SymbolId[] = []
  for (let row = -1; row <= math.rows; row += 1) {
    window.push(symbolAt(math, reel, stop, row))
  }
  return window
}

/**
 * 릴의 연속 위치값(소수 포함)을 스트립 길이 안으로 정규화한다.
 * 위치는 "화면 행 0에 오는 스트립 인덱스"를 뜻하고, 소수부는 칸 사이 이동량이다.
 */
export function normalizePosition(position: number, stripLength: number): number {
  if (stripLength <= 0) throw new RangeError(`스트립 길이가 올바르지 않다: ${stripLength}`)
  const wrapped = position % stripLength
  return wrapped < 0 ? wrapped + stripLength : wrapped
}

/**
 * 현재 위치에서 `stop`까지 아래로 내려가며 돌 때의 목표 위치.
 *
 * 릴은 아래로 흐르므로 위치는 감소한다. `revolutions`바퀴를 먼저 돌고 남은 거리를 마저 간다.
 * **0을 주면 한 바퀴도 돌지 않고 남은 거리만 간다.** 스킵이 이 경로를 쓴다.
 * 한 바퀴를 억지로 더 돌리면 260ms 안에 스트립 전체가 지나가 화면이 번쩍인다.
 *
 * 결과는 항상 `stop`과 스트립 길이 나머지가 같다.
 */
export function spinTargetPosition(
  current: number,
  stop: number,
  stripLength: number,
  revolutions: number,
): number {
  const from = normalizePosition(current, stripLength)
  const to = normalizePosition(stop, stripLength)
  const gap = normalizePosition(from - to, stripLength)
  const turns = Math.max(0, Math.floor(revolutions))
  return from - (turns * stripLength + gap)
}

/**
 * 화면 격자에서 `[reel, row]` 좌표의 심볼.
 * 격자는 `grid[row][reel]` 순서라는 엔진 규약을 여기서 한 번만 푼다.
 */
export function symbolAtPosition(grid: readonly (readonly SymbolId[])[], position: GridPosition): SymbolId {
  const [reel, row] = position
  const symbol = grid[row]?.[reel]
  if (symbol === undefined) throw new RangeError(`격자 범위를 벗어난 좌표: [${reel}, ${row}]`)
  return symbol
}

/**
 * 승리 좌표 목록에 **실제로 놓인** 심볼들.
 *
 * 그룹 배당(`WinLine.group`)에서는 `win.symbol`이 그룹 id(`anybar` 등)라서
 * 심볼 에셋이나 연출을 찾는 열쇠로 쓸 수 없다. 화면에 무엇이 보이는지는 격자만 안다.
 */
export function symbolsAtPositions(
  grid: readonly (readonly SymbolId[])[],
  positions: readonly GridPosition[],
): SymbolId[] {
  return positions.map((position) => symbolAtPosition(grid, position))
}
