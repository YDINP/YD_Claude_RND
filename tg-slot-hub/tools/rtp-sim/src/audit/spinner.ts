import { MAX_FREE_SPINS_PER_ROUND, getBetUnit, spinUnchecked } from '@tgslot/slot-engine'
import type { GameMath, Rng, RoundState, SpinResult } from '@tgslot/slot-engine'

/** 이 게임이 정지 그리드를 평가 전에 변형하는가. */
export function hasMutations(math: GameMath): boolean {
  const mutations = math.mutations
  return mutations !== undefined && mutations.length > 0
}

/**
 * 베팅 레벨 검사를 건너뛰는 스핀 1회. 검수 도구는 튜닝을 위해 레벨 밖 베팅액도 재야 한다.
 *
 * 엔진의 `spinUnchecked`를 그대로 부른다. RNG 소비 순서(릴 정지 → 뮤테이션 → 주문 카드 추첨)는
 * provably fair 계약이라 도구 쪽에 복제하면 연쇄·주문 팩에서 다른 게임을 재게 된다.
 * `betUnit`은 예전 호출 모양을 지키려고 남긴 인자다. 엔진이 `getBetUnit`으로 같은 값을 다시 낸다.
 */
export function drawSpin(
  math: GameMath,
  totalBet: number,
  _betUnit: number,
  rng: Rng,
  state?: RoundState,
): SpinResult {
  return spinUnchecked(math, totalBet, rng, state)
}

export { MAX_FREE_SPINS_PER_ROUND }

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
    // 엔진이 캡으로 강제하므로 여기까지 오면 캡이 동작하지 않았다는 뜻이다.
    // 시뮬레이터가 무한 루프에 빠지지 않도록 남겨 두는 방어적 단언이다.
    if (played > MAX_FREE_SPINS_PER_ROUND) {
      throw new RangeError(
        `한 라운드의 프리스핀이 상한 ${MAX_FREE_SPINS_PER_ROUND}회를 넘었다. 엔진의 캡이 동작하지 않았다`,
      )
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
/**
 * 배당 단위의 개수. 라인 게임은 페이라인 수, ways 게임은 `ways.betDivisor`다.
 * `단위 수 x 단위당 베팅액 = 총 베팅액`이 성립한다.
 */
export function betUnitCount(math: GameMath, totalBet: number): number {
  return Math.round(totalBet / getBetUnit(math, totalBet))
}

/** ways 게임인가. 표를 라인 대신 웨이즈로 그릴지 정한다. */
export function isWaysGame(math: GameMath): boolean {
  return math.payModel === 'ways'
}
