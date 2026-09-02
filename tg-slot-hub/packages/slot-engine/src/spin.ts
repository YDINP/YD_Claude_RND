import type { GameMath } from './schema.js'
import { evaluate, getBetPerLine } from './evaluate.js'
import type { Bet, Rng, SpinResult, SymbolId } from './types.js'

/**
 * 정지 위치로부터 화면에 보이는 심볼 격자를 만든다.
 * 스트립은 원형이라 끝을 지나면 처음으로 되돌아간다.
 * @returns `grid[row][reel]`
 */
export function buildGrid(math: GameMath, stops: number[]): SymbolId[][] {
  if (stops.length !== math.reels) {
    throw new RangeError(`stops 개수(${stops.length})가 reels(${math.reels})와 다르다`)
  }
  const grid: SymbolId[][] = []
  for (let row = 0; row < math.rows; row += 1) {
    const line: SymbolId[] = []
    for (let reel = 0; reel < math.reels; reel += 1) {
      const strip = math.strips[reel]
      const stop = stops[reel]
      if (strip === undefined || stop === undefined) {
        throw new RangeError(`릴 ${reel}의 스트립 또는 정지 위치가 없다`)
      }
      const symbol = strip[(stop + row) % strip.length]
      if (symbol === undefined) throw new RangeError(`릴 ${reel} 스트립이 비었다`)
      line.push(symbol)
    }
    grid.push(line)
  }
  return grid
}

/**
 * 총 베팅액이 `math.betLevels`에 선언된 값인지 확인한다.
 * 클라이언트가 임의 금액을 보내 페이테이블 라운딩을 노리는 것을 막는 서버 측 관문이다.
 */
export function assertBetLevel(math: GameMath, totalBet: number): void {
  if (!math.betLevels.includes(totalBet)) {
    throw new RangeError(`베팅액 ${totalBet}은 허용된 값이 아니다. 가능한 값: ${math.betLevels.join(', ')}`)
  }
}

/**
 * 베팅 레벨 검사를 건너뛰는 내부 스핀. RTP 도구가 임의 베팅액을 재는 용도로만 쓴다.
 * 패키지 밖으로 내보내지 않는다 (index.ts에 없음). 실제 스핀은 항상 `spin`을 쓸 것.
 */
export function spinUnchecked(math: GameMath, totalBet: number, rng: Rng): SpinResult {
  const betPerLine = getBetPerLine(math, totalBet)
  const stops: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = math.strips[reel]
    if (strip === undefined) throw new RangeError(`릴 ${reel}의 스트립이 없다`)
    stops.push(rng.nextInt(strip.length))
  }
  const grid = buildGrid(math, stops)
  const { wins, totalWin } = evaluate(grid, math, betPerLine)
  return { stops, grid, wins, totalWin, features: [] }
}

/**
 * 스핀 1회. 릴마다 스트립 위 정지 위치를 균등하게 뽑고 페이라인을 평가한다.
 * 같은 시드의 RNG를 주면 항상 같은 결과가 나온다 (provably fair 대비).
 * 베팅액은 `math.betLevels`에 선언된 값이어야 한다.
 */
export function spin(math: GameMath, bet: Bet, rng: Rng): SpinResult {
  assertBetLevel(math, bet.totalBet)
  return spinUnchecked(math, bet.totalBet, rng)
}
