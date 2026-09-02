import { applyMutations, buildGrid, getBetUnit, resolveSpin } from '@tgslot/slot-engine'
import type { GameMath, Rng, RoundState, SpinResult } from '@tgslot/slot-engine'

/** 이 게임이 정지 그리드를 평가 전에 변형하는가. */
export function hasMutations(math: GameMath): boolean {
  const mutations = math.mutations
  return mutations !== undefined && mutations.length > 0
}

/**
 * 베팅 레벨 검사를 건너뛰는 스핀 1회. 검수 도구는 튜닝을 위해 레벨 밖 베팅액도 재야 한다.
 *
 * 엔진의 `spinUnchecked`와 **같은 순서**로 돌린다: 릴 정지를 전부 뽑은 뒤 뮤테이션이 뽑는다.
 * 이 순서는 provably fair 계약이라 어기면 같은 시드에서 다른 결과가 나온다.
 * (`spinUnchecked` 자체는 패키지 밖으로 나오지 않아 `applyMutations`로 조립한다.)
 */
export function drawSpin(
  math: GameMath,
  totalBet: number,
  betUnit: number,
  rng: Rng,
  state?: RoundState,
): SpinResult {
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

/** 한 라운드가 낳을 수 있는 프리스핀 상한. 엔진과 같은 값으로 발산을 막는다. */
export const MAX_FREE_SPINS_PER_ROUND = 10_000

export interface RoundSpin {
  spin: SpinResult
  /** 이 스핀에 곱해진 배수. 유료 스핀은 1. */
  multiplier: number
  isFreeSpin: boolean
}

/**
 * 유료 스핀 1회와 그것이 연 프리스핀 전부. 라운드가 끝날 때까지 돌린다.
 * `simulate`가 재는 것과 같은 단위(라운드)를 만들어 준다.
 */
export function playRound(math: GameMath, totalBet: number, betPerLine: number, rng: Rng): RoundSpin[] {
  const paid = drawSpin(math, totalBet, betPerLine, rng)
  const round: RoundSpin[] = [{ spin: paid, multiplier: 1, isFreeSpin: false }]

  let state = paid.nextState
  let played = 0
  while (state !== undefined) {
    played += 1
    if (played > MAX_FREE_SPINS_PER_ROUND) {
      throw new RangeError(`한 라운드의 프리스핀이 ${MAX_FREE_SPINS_PER_ROUND}회를 넘었다. 모델이 발산한다`)
    }
    const multiplier = state.multiplier
    const free = drawSpin(math, totalBet, betPerLine, rng, state)
    round.push({ spin: free, multiplier, isFreeSpin: true })
    state = free.nextState
  }
  return round
}

/**
 * 배당 단위. 라인 게임은 라인당 베팅액, ways 게임은 웨이당 베팅액이다.
 * 엔진의 `getBetUnit`을 그대로 쓴다 (예전에는 여기서 다시 계산했다).
 */
export function betPerLineOf(math: GameMath, totalBet: number): number {
  return getBetUnit(math, totalBet)
}

/** ways 게임인가. 라인 표를 웨이즈 표로 바꿀지 정하는 데 쓴다. */
export function isWaysGame(math: GameMath): boolean {
  return math.payModel === 'ways'
}
