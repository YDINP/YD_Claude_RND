/**
 * 기본 베팅 고르기 — 잔액의 0.2~0.5% 안에서 0.3%에 가장 가까운 베팅 단계.
 * 순수 함수라 서버·스토어 없이 표로 검증한다(defaultBet.test.ts가 10종 manifest를 읽어 고정).
 *
 * 1) 레벨이 허용한 단계(maxBet 이하) 중 [0.2%, 0.5%] 안에 드는 것이 있으면 목표(0.3%)에 가장 가까운 것(같으면 작은 쪽)
 * 2) 없으면 0.2%보다 작은 단계 중 가장 큰 것
 * 3) 그것도 없으면 허용된 단계의 최소(허용된 단계가 하나도 없으면 전체의 최소)
 */

export const DEFAULT_BET_LOW_RATIO = 0.002
export const DEFAULT_BET_HIGH_RATIO = 0.005
export const DEFAULT_BET_TARGET_RATIO = 0.003

/** betLevels(오름차순 아님도 허용)에서 규칙에 맞는 «인덱스»를 돌려준다. betLevels가 비면 0. */
export function pickDefaultBetIndex(betLevels: readonly number[], balance: number, maxBet: number): number {
  if (betLevels.length === 0) return 0
  const safeBalance = Number.isFinite(balance) && balance > 0 ? balance : 0
  const lo = DEFAULT_BET_LOW_RATIO * safeBalance
  const hi = DEFAULT_BET_HIGH_RATIO * safeBalance
  const target = DEFAULT_BET_TARGET_RATIO * safeBalance

  let poolIdx = betLevels.map((_, i) => i).filter((i) => (betLevels[i] as number) <= maxBet)
  if (poolIdx.length === 0) {
    const minIdx = betLevels.reduce((best, v, i) => (v < (betLevels[best] as number) ? i : best), 0)
    poolIdx = [minIdx]
  }
  const bet = (i: number): number => betLevels[i] as number

  const inBand = poolIdx.filter((i) => bet(i) >= lo && bet(i) <= hi)
  if (inBand.length > 0) {
    return inBand.reduce((best, i) => {
      const db = Math.abs(bet(best) - target)
      const di = Math.abs(bet(i) - target)
      if (di < db) return i
      if (di === db && bet(i) < bet(best)) return i
      return best
    })
  }

  const below = poolIdx.filter((i) => bet(i) < lo)
  if (below.length > 0) return below.reduce((best, i) => (bet(i) > bet(best) ? i : best))

  return poolIdx.reduce((best, i) => (bet(i) < bet(best) ? i : best))
}

/** 저장된 «금액»(없으면 null)이 지금 쓸 수 있으면 그 단계 인덱스, 아니면 -1. */
export function storedBetIndex(
  betLevels: readonly number[],
  storedAmount: number | null,
  balance: number,
  maxBet: number,
): number {
  if (storedAmount === null) return -1
  const idx = betLevels.indexOf(storedAmount)
  if (idx < 0) return -1
  if (storedAmount > maxBet || storedAmount > balance) return -1
  return idx
}
