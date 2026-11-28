import { z } from 'zod'
import type { GameMath } from './schema.js'

/**
 * 피처 구매(보너스 바로 사기)가 «사는» 보너스의 종류. 진입 판의 피처 이름과 같다.
 *
 * - `freeSpins`: 프리스핀이 열린 판(스캐터·정원·얼려 두기·화로 프리스핀 전부)
 * - `orderRound`: 주문 카드 라운드가 열린 판
 * - `coinRespin`·`boardBonus`·`stageRoulette`: 그 판 안에서 끝까지 정산되는 보너스가 열린 판
 */
export const FEATURE_BUY_TRIGGERS = ['freeSpins', 'orderRound', 'coinRespin', 'boardBonus', 'stageRoulette'] as const
export const FeatureBuyTriggerSchema = z.enum(FEATURE_BUY_TRIGGERS)
export type FeatureBuyTrigger = z.infer<typeof FeatureBuyTriggerSchema>

/**
 * 피처 구매 설정. `price`는 **총 베팅액 배수**이고, 구매 비용 = `price × totalBet`이다.
 * 모든 베팅 단계에서 비용이 정수 코인이어야 한다(스키마 refine이 강제한다).
 * 진입 판의 베팅은 이 비용에 들어 있다(따로 차감하지 않는다).
 */
export const FeatureBuyConfigSchema = z.object({
  price: z.number().min(2),
  trigger: FeatureBuyTriggerSchema,
})
export type FeatureBuyConfig = z.infer<typeof FeatureBuyConfigSchema>

/**
 * 이 팩 설정으로 `trigger` 보너스가 열릴 수 있는가. 스키마가 «만족될 수 없는 구매»를 막는 데 쓴다.
 * 프리스핀은 스캐터 프리스핀 말고도 정원·얼려 두기·주문 카드 라운드가 같은 `freeSpins` 피처로 연다.
 */
export function canTriggerFeatureBuy(
  math: Pick<GameMath, 'scatter' | 'growBoard' | 'frostRespin' | 'orderRound' | 'coinRespin' | 'boardBonus' | 'stageRoulette'>,
  trigger: FeatureBuyTrigger,
): boolean {
  switch (trigger) {
    case 'freeSpins':
      return (
        math.scatter?.freeSpins !== undefined ||
        math.growBoard !== undefined ||
        math.frostRespin !== undefined ||
        math.orderRound !== undefined
      )
    case 'orderRound':
      return math.orderRound !== undefined
    case 'coinRespin':
      return math.coinRespin !== undefined
    case 'boardBonus':
      return math.boardBonus !== undefined
    case 'stageRoulette':
      return math.stageRoulette !== undefined
  }
}
