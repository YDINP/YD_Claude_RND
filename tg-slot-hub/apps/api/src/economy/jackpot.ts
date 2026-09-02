import { JACKPOT_ACCRUAL_RATE, JACKPOT_ODDS_DENOMINATOR } from './config.js'

/**
 * 이 스핀이 풀에 넣는 금액. 하우스 몫에서 나가므로 유저 지갑과 원장은 건드리지 않는다.
 *
 * 베팅별 적립: 10 → 0, 20 → 0, 50 → 1, 100 → 1, 200 → 2, 500 → 5.
 */
export function jackpotAccrual(totalBet: number): number {
  return Math.round(totalBet * JACKPOT_ACCRUAL_RATE)
}

/**
 * 당첨 판정. 확률이 베팅이 아니라 **실제 적립액**에 비례한다는 점이 핵심이다.
 * 적립이 0인 베팅에는 기회를 주지 않아 "최소 베팅으로 잭팟만 노리기"를 차단한다.
 *
 * `roll`은 라운드 RNG가 릴을 뽑은 **뒤** `nextInt(JACKPOT_ODDS_DENOMINATOR)`로 뽑은 값이다.
 */
export function isJackpotHit(roll: number, accrual: number): boolean {
  return accrual > 0 && roll < accrual
}

export { JACKPOT_ODDS_DENOMINATOR }
