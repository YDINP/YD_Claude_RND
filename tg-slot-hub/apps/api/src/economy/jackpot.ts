import {
  JACKPOT_ACCRUAL_RATE,
  JACKPOT_HUNDREDTHS_PER_COIN,
  JACKPOT_ODDS_DENOMINATOR,
} from './config.js'

/**
 * 이 스핀이 풀에 넣는 금액. **1/100 코인 단위**다. 하우스 몫에서 나가므로
 * 유저 지갑과 원장은 건드리지 않는다.
 *
 * 적립률 1%에서는 결과가 곧 `totalBet`이다: 10 → 10(=0.1 코인), 50 → 50, 100 → 100, 500 → 500.
 * 코인 단위로 반올림하지 않으므로 **모든 베팅 레벨의 실효 적립률이 정확히 1%**로 같다.
 */
export function jackpotAccrualHundredths(totalBet: number): number {
  return Math.round(totalBet * JACKPOT_ACCRUAL_RATE * JACKPOT_HUNDREDTHS_PER_COIN)
}

/**
 * 당첨 판정. 확률이 베팅이 아니라 **그 스핀이 실제로 넣은 적립액**에 비례한다.
 * 적립이 0이면(적립률을 0으로 낮춘 경우 등) 기회를 주지 않는다.
 *
 * `roll`은 라운드 RNG가 릴을 뽑은 **뒤** `nextInt(JACKPOT_ODDS_DENOMINATOR)`로 뽑은 값이다.
 */
export function isJackpotHit(roll: number, accrualHundredths: number): boolean {
  return accrualHundredths > 0 && roll < accrualHundredths
}

/** 내부 1/100 코인 단위를 지급·표시용 코인으로 내린다. 1코인 미만은 풀에 남지 않고 버려진다. */
export function hundredthsToCoins(hundredths: number): number {
  return Math.floor(hundredths / JACKPOT_HUNDREDTHS_PER_COIN)
}

export { JACKPOT_ODDS_DENOMINATOR }
