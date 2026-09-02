import { buildGrid, getBetPerLine, resolveSpin } from '@tgslot/slot-engine'
import type { GameMath, Rng, RoundState, SpinResult } from '@tgslot/slot-engine'

/**
 * 베팅 레벨 검사를 건너뛰는 스핀 1회. 검수 도구는 임의 베팅액도 재야 한다.
 * 엔진의 `resolveSpin`을 그대로 쓰므로 스캐터·프리스핀 규칙이 실제 스핀과 어긋나지 않는다.
 */
export function drawSpin(
  math: GameMath,
  totalBet: number,
  betPerLine: number,
  rng: Rng,
  state?: RoundState,
): SpinResult {
  const stops: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = math.strips[reel]
    if (strip === undefined) throw new RangeError(`릴 ${reel}의 스트립이 없다`)
    stops.push(rng.nextInt(strip.length))
  }
  const grid = buildGrid(math, stops)
  return resolveSpin(math, grid, stops, totalBet, betPerLine, state)
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

/** 총 베팅액에서 라인당 베팅액. 엔진 규칙을 그대로 쓴다. */
export function betPerLineOf(math: GameMath, totalBet: number): number {
  return getBetPerLine(math, totalBet)
}
