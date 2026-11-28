/**
 * 피처 구매(보너스 바로 사기) — 화면이 쓰는 순수 계산. 비용·막힌 이유·«무엇이 바로 시작되는지»에 쓸 숫자를 낸다.
 * 실제 차감·판정은 서버가 한다(여기 값은 보여 주기용이고, 서버가 거절하면 그 응답이 이긴다).
 */
import type { FeatureBuyTrigger, GameMath } from '@tgslot/slot-engine'

/** 구매 비용 코인. 서버(`featureBuyCost`)와 같은 식이다. */
export function featureBuyCost(price: number, totalBet: number): number {
  return Math.round(price * totalBet)
}

/** 버튼이 막힌 이유. 우선순위 순서대로 하나만 보여 준다. */
export type FeatureBuyBlock = 'autoSpin' | 'freeSpins' | 'spinning' | 'gamble' | 'funds'

export function featureBuyBlockReason(input: {
  autoSpinning: boolean
  /** 프리스핀·주문 라운드가 이어지는 중 */
  inRound: boolean
  /** 릴이 돌거나 당첨·보너스 연출이 끝나지 않았다 */
  busy: boolean
  gambleOpen: boolean
  balance: number
  cost: number
}): FeatureBuyBlock | null {
  if (input.autoSpinning) return 'autoSpin'
  if (input.inRound) return 'freeSpins'
  if (input.busy) return 'spinning'
  if (input.gambleOpen) return 'gamble'
  if (input.balance < input.cost) return 'funds'
  return null
}

/** 구매 판이 «몇 개가 떨어진 판»인지. 스캐터(코인 리스핀은 코인) 진입 개수. 알 수 없으면 null. */
export function featureBuyTriggerCount(math: GameMath, trigger: FeatureBuyTrigger): number | null {
  switch (trigger) {
    case 'coinRespin':
      return math.coinRespin?.trigger ?? null
    case 'boardBonus':
      return math.boardBonus?.trigger ?? null
    case 'stageRoulette':
      return math.stageRoulette?.trigger ?? null
    case 'orderRound':
      return math.orderRound?.trigger ?? null
    case 'freeSpins':
      return (
        math.scatter?.freeSpins?.trigger ??
        math.frostRespin?.freeSpins.trigger ??
        math.growBoard?.bonus.trigger ??
        math.orderRound?.trigger ??
        null
      )
  }
}
