import type { GameMath } from './schema.js'
import { evaluate, evaluateScatter, getBetPerLine, triggersFreeSpins } from './evaluate.js'
import { applyMutations } from './mutations.js'
import { evaluateWays, getBetPerWay } from './ways.js'
import { MAX_FREE_SPINS_PER_ROUND } from './limits.js'
import type { Bet, FeatureTrigger, MutationEvent, Rng, RoundState, SpinResult, SymbolId } from './types.js'

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
/**
 * 배당 단위. 라인 게임은 라인당 베팅액, ways 게임은 웨이당 베팅액이다.
 * 어느 쪽이든 `단위 x 단위 수 = 총 베팅액`이 성립하도록 스키마가 강제한다.
 */
export function getBetUnit(math: GameMath, totalBet: number): number {
  return math.payModel === 'ways' ? getBetPerWay(math, totalBet) : getBetPerLine(math, totalBet)
}

export function assertBetLevel(math: GameMath, totalBet: number): void {
  if (!math.betLevels.includes(totalBet)) {
    throw new RangeError(`베팅액 ${totalBet}은 허용된 값이 아니다. 가능한 값: ${math.betLevels.join(', ')}`)
  }
}

/**
 * 베팅 레벨 검사를 건너뛰는 스핀. **RTP 시뮬레이터와 감사 도구 전용이다.**
 *
 * 임의 베팅액으로 돌릴 수 있어야 배당 단위 공식을 도구 쪽에서 다시 구현하지 않아도 된다.
 * 뮤테이션까지 적용된 완전한 스핀이라 `spin`과 결과가 같고, 다른 점은 베팅 레벨 검사뿐이다.
 *
 * **실제 스핀 경로에서는 절대 쓰지 말 것.** 클라이언트가 보낸 금액을 그대로 태우면
 * 선언되지 않은 베팅액으로 페이테이블의 빈틈을 노릴 수 있다. 서버는 항상 `spin`을 쓴다.
 */
export function spinUnchecked(
  math: GameMath,
  totalBet: number,
  rng: Rng,
  state?: RoundState,
): SpinResult {
  const betUnit = getBetUnit(math, totalBet)
  // RNG 소비 순서는 계약이다. 릴 정지를 전부 뽑은 **뒤에** 뮤테이션이 뽑는다.
  const stops: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = math.strips[reel]
    if (strip === undefined) throw new RangeError(`릴 ${reel}의 스트립이 없다`)
    stops.push(rng.nextInt(strip.length))
  }
  const gridBefore = buildGrid(math, stops)
  const mutated = applyMutations(math, gridBefore, rng)
  return resolveSpin(math, mutated.grid, stops, totalBet, betUnit, state, gridBefore, mutated.events)
}

/**
 * 그리드가 정해진 뒤의 정산. 라인·스캐터·프리스핀을 한자리에서 처리한다.
 * RNG를 쓰지 않으므로 전수 조사와 재현 검증이 같은 코드를 공유한다.
 */
export function resolveSpin(
  math: GameMath,
  grid: SymbolId[][],
  stops: number[],
  totalBet: number,
  betUnit: number,
  state?: RoundState,
  gridBefore: SymbolId[][] = grid,
  mutations: MutationEvent[] = [],
): SpinResult {
  const { wins, totalWin: lineWin } =
    math.payModel === 'ways' ? evaluateWays(grid, math, betUnit) : evaluate(grid, math, betUnit)
  const scatter = evaluateScatter(grid, math, totalBet)
  const multiplier = state?.multiplier ?? 1
  const totalWin = Math.round((lineWin + scatter.win) * multiplier)

  const features: FeatureTrigger[] = []
  if (scatter.win > 0) {
    features.push({
      type: 'scatterWin',
      symbol: math.scatter?.symbol ?? '',
      count: scatter.count,
      win: scatter.win,
      positions: scatter.positions,
    })
  }

  const config = math.scatter?.freeSpins
  const triggered = triggersFreeSpins(scatter.count, math)
  let nextState: RoundState | undefined

  if (state === undefined) {
    // 유료 스핀. 트리거되면 프리스핀 세션이 열린다.
    if (triggered && config !== undefined) {
      const granted = Math.min(config.count, MAX_FREE_SPINS_PER_ROUND)
      if (granted > 0) {
        features.push({ type: 'freeSpins', spins: granted, multiplier: config.multiplier, retrigger: false })
        nextState = { freeSpinsLeft: granted, freeSpinsTotal: granted, multiplier: config.multiplier }
      }
      if (granted < config.count) {
        features.push({ type: 'freeSpinsCapped', requested: config.count, granted, cap: MAX_FREE_SPINS_PER_ROUND })
      }
    }
  } else {
    // 프리스핀. 이번 스핀을 소진하고, 리트리거가 허용되면 스핀을 더 얹는다.
    let left = Math.max(0, state.freeSpinsLeft - 1)
    let total = state.freeSpinsTotal
    if (triggered && config !== undefined && config.retrigger) {
      // 라운드는 반드시 끝나야 한다. 상한을 넘기는 리트리거는 잘라내고 사실을 남긴다.
      const room = Math.max(0, MAX_FREE_SPINS_PER_ROUND - state.freeSpinsTotal)
      const granted = Math.min(config.count, room)
      if (granted > 0) {
        features.push({ type: 'freeSpins', spins: granted, multiplier: state.multiplier, retrigger: true })
        left += granted
        total += granted
      }
      if (granted < config.count) {
        features.push({ type: 'freeSpinsCapped', requested: config.count, granted, cap: MAX_FREE_SPINS_PER_ROUND })
      }
    }
    if (left > 0) nextState = { freeSpinsLeft: left, freeSpinsTotal: total, multiplier: state.multiplier }
  }

  const result: SpinResult = {
    stops,
    gridBefore,
    grid,
    mutations,
    wins,
    lineWin,
    scatterWin: scatter.win,
    totalWin,
    features,
  }
  if (nextState !== undefined) result.nextState = nextState
  return result
}

/**
 * 스핀 1회. 릴마다 스트립 위 정지 위치를 균등하게 뽑고 페이라인과 스캐터를 평가한다.
 * 같은 시드의 RNG를 주면 항상 같은 결과가 나온다 (provably fair 대비).
 * 베팅액은 `math.betLevels`에 선언된 값이어야 한다.
 *
 * @param state 있으면 **프리스핀**으로 처리한다. 승리에 `state.multiplier`가 곱해지고
 *   `state.freeSpinsLeft`가 1 줄어든다. 0이 되면 `nextState`가 없다.
 */
export function spin(math: GameMath, bet: Bet, rng: Rng, state?: RoundState): SpinResult {
  assertBetLevel(math, bet.totalBet)
  return spinUnchecked(math, bet.totalBet, rng, state)
}
