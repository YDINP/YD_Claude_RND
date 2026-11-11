import type { GameMath } from './schema.js'
import { evaluate, evaluateScatter, getBetPerLine, triggersFreeSpins } from './evaluate.js'
import { runCascades } from './cascade.js'
import { applyMutations } from './mutations.js'
import { drawOrderCards, tallyOrders } from './orders.js'
import { evaluateWays, getBetPerWay } from './ways.js'
import { MAX_FREE_SPINS_PER_ROUND } from './limits.js'
import type {
  Bet,
  FeatureTrigger,
  MutationEvent,
  OrderCard,
  Rng,
  RoundState,
  SpinResult,
  SymbolId,
} from './types.js'

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
 * 배당 단위. 라인 게임은 라인당 베팅액, ways 게임은 웨이당 베팅액, 클러스터 게임은 총 베팅액이다.
 * 어느 쪽이든 `단위 x 단위 수 = 총 베팅액`이 성립하도록 스키마가 강제한다.
 */
export function getBetUnit(math: GameMath, totalBet: number): number {
  if (math.payModel === 'cluster') return totalBet
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
  return resolveSpin(math, mutated.grid, stops, totalBet, betUnit, state, gridBefore, mutated.events, rng)
}

/**
 * 그리드가 정해진 뒤의 정산. 라인·스캐터·프리스핀을 한자리에서 처리한다.
 * 연쇄 팩이 아니면 RNG를 쓰지 않으므로 전수 조사와 재현 검증이 같은 코드를 공유한다.
 * 주문 카드 라운드 팩만 카드 추첨에 `rng`가 필요하다(없으면 던진다). 이 추첨이 스핀의 마지막 RNG 소비다.
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
  rng?: Rng,
): SpinResult {
  if (math.cascade !== undefined) {
    return resolveCascadeSpin(math, grid, stops, totalBet, state, gridBefore, mutations, rng)
  }
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
 * 연쇄 팩의 정산. 클러스터 연쇄를 돌리고, 스캐터는 연쇄가 끝난 판에서 센다.
 * 주문 카드 라운드(진입·진행·완료·종료)도 여기서 처리한다. `grid`는 연쇄 시작 판이다.
 *
 * 지급 상한(`round.maxWinCap x totalBet`)은 **스핀 단위**로 건다. 클러스터, 스캐터, 주문 상품 순으로 채우고
 * 넘치는 몫은 잘라 `winCapped` 피처를 남긴다. RoundCarry에 라운드 누적 지급이 없어 라운드 누적 상한은 못 건다.
 */
function resolveCascadeSpin(
  math: GameMath,
  grid: SymbolId[][],
  stops: number[],
  totalBet: number,
  state: RoundState | undefined,
  gridBefore: SymbolId[][],
  mutations: MutationEvent[],
  rng: Rng | undefined,
): SpinResult {
  const cap = math.round === undefined ? Infinity : Math.round(math.round.maxWinCap * totalBet)
  const outcome = runCascades(math, grid, stops, totalBet, cap)
  const wins = outcome.steps.flatMap((step) => step.wins)
  const lineWin = outcome.win
  const scatter = evaluateScatter(outcome.finalGrid, math, totalBet)
  const multiplier = state?.multiplier ?? 1

  const features: FeatureTrigger[] = []
  let requested = lineWin
  let room = Math.max(0, cap - lineWin)
  const scatterGranted = Math.min(scatter.win, room)
  room -= scatterGranted
  requested += scatter.win
  if (scatter.win > 0) {
    features.push({
      type: 'scatterWin',
      symbol: math.scatter?.symbol ?? '',
      count: scatter.count,
      win: scatterGranted,
      positions: scatter.positions,
    })
  }

  const orders = math.orderRound
  const carry = state?.carry?.orders
  let orderWin = 0
  let nextState: RoundState | undefined
  let roundSpin = false

  if (orders !== undefined && state === undefined) {
    if (scatter.count >= orders.trigger) {
      if (rng === undefined) throw new RangeError('주문 카드 추첨에는 rng가 필요하다')
      const granted = Math.min(orders.spins, MAX_FREE_SPINS_PER_ROUND)
      const cards = drawOrderCards(math, [], orders.slots, rng)
      features.push({ type: 'freeSpins', spins: granted, multiplier: 1, retrigger: false })
      features.push({ type: 'orderRound', cards })
      nextState = {
        freeSpinsLeft: granted,
        freeSpinsTotal: granted,
        multiplier: 1,
        carry: { orders: { cards, drawn: cards.length, completed: 0, prizeTotal: 0 } },
      }
    }
  } else if (orders !== undefined && state !== undefined && carry !== undefined) {
    roundSpin = true
    const tallied = tallyOrders(carry.cards, outcome)
    const finished = new Set(tallied.completed.map((card) => card.id))
    const board: (OrderCard | null)[] = tallied.cards.map((card) => (finished.has(card.id) ? null : card))
    let drawn = carry.drawn
    let completed = carry.completed
    let prizeTotal = carry.prizeTotal
    let extra = 0
    const drawLimit = orders.maxOrders + orders.slots - 1

    // 상한을 넘은 완료는 상품만 주고 스핀은 주지 않는다.
    for (const card of tallied.completed) {
      const requestedPrize = Math.round(card.prize * totalBet)
      const prize = Math.min(requestedPrize, room)
      room -= prize
      requested += requestedPrize
      orderWin += prize
      prizeTotal += prize
      features.push({ type: 'orderComplete', id: card.id, prize })
      if (completed < orders.maxOrders) {
        completed += 1
        extra += orders.extraSpinsPerOrder
      }
    }
    // 완료로 빈 칸은 왼쪽부터 새 카드로 채운다. 이번 스핀에 완료한 카드는 다시 뽑지 않는다.
    for (let slot = 0; slot < board.length; slot += 1) {
      if (board[slot] !== null || drawn >= drawLimit) continue
      if (rng === undefined) throw new RangeError('주문 카드 추첨에는 rng가 필요하다')
      const onBoard = board.filter((card): card is OrderCard => card !== null)
      // 후보가 모자란 작은 풀이면 방금 낸 카드도 다시 허용한다. 빈손 추첨은 RNG를 쓰지 않는다.
      const card =
        drawOrderCards(math, [...onBoard, ...tallied.completed], 1, rng)[0] ?? drawOrderCards(math, onBoard, 1, rng)[0]
      if (card === undefined) continue
      board[slot] = card
      drawn += 1
    }
    const cards = board.filter((card): card is OrderCard => card !== null)
    const left = Math.max(0, state.freeSpinsLeft - 1) + extra
    if (left > 0) {
      nextState = {
        freeSpinsLeft: left,
        freeSpinsTotal: state.freeSpinsTotal + extra,
        multiplier: state.multiplier,
        carry: { orders: { cards, drawn, completed, prizeTotal } },
      }
    }
  } else if (orders === undefined) {
    const config = math.scatter?.freeSpins
    const triggered = triggersFreeSpins(scatter.count, math)
    if (state === undefined) {
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
      let left = Math.max(0, state.freeSpinsLeft - 1)
      let total = state.freeSpinsTotal
      if (triggered && config !== undefined && config.retrigger) {
        const spare = Math.max(0, MAX_FREE_SPINS_PER_ROUND - state.freeSpinsTotal)
        const granted = Math.min(config.count, spare)
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
  }

  const granted = lineWin + scatterGranted + orderWin
  if (Number.isFinite(cap) && (outcome.capped || granted < requested)) {
    features.push({ type: 'winCapped', requested: Math.max(requested, granted), granted, cap })
  }

  const result: SpinResult = {
    stops,
    gridBefore,
    grid,
    mutations,
    wins,
    lineWin,
    scatterWin: scatterGranted,
    totalWin: Math.round((lineWin + scatterGranted) * multiplier + orderWin),
    features,
    cascades: outcome.steps,
    finalGrid: outcome.finalGrid,
  }
  if (roundSpin) result.orderWin = orderWin
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
