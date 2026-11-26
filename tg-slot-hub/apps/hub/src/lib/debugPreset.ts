/**
 * 디버그 패널의 스핀 결과 프리셋 — 다음 한 판만 이 결과가 나오도록 서버에 요청한다(원샷).
 * 프리셋 값 자체는 `@tgslot/shared`의 `SpinDebugPreset`(서버 계약)과 정확히 같아야 한다 —
 * 여기서 별도 유니온을 새로 선언하지 않고 그 타입을 그대로 재수출한다.
 */
import type { SpinDebugPreset } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'

export type DebugPreset = SpinDebugPreset

export const DEBUG_PRESETS: readonly DebugPreset[] = ['win', 'bigWin', 'freeSpins', 'gamble', 'lose']

/**
 * 이 게임에서 보여 줄 프리셋. `cascade3`는 연쇄 팩, `orderRound`·`orderComplete`는 주문 카드 라운드 팩에만
 * 나온다(서버도 해당 피처가 없는 게임에는 409). 스캐터 프리스핀이 없는 주문 카드 팩은 `freeSpins`를 뺀다.
 */
export function presetsFor(
  math: Pick<GameMath, 'cascade' | 'orderRound' | 'scatter' | 'coinRespin'> | null,
): readonly DebugPreset[] {
  if (math === null) return DEBUG_PRESETS
  const hasOrders = math.orderRound !== undefined
  // 코인 리스핀 팩은 프리스핀이 없다. 대신 리스핀 프리셋 4종(진입·도중 감기·보물·15칸)을 보여 준다.
  const hasCoins = math.coinRespin !== undefined
  const noFreeSpins = (hasOrders || hasCoins) && math.scatter?.freeSpins === undefined
  const base = noFreeSpins ? DEBUG_PRESETS.filter((p) => p !== 'freeSpins') : DEBUG_PRESETS
  return [
    ...base,
    ...(math.cascade !== undefined ? (['cascade3'] as const) : []),
    ...(hasOrders ? (['orderRound', 'orderComplete'] as const) : []),
    ...(hasCoins ? (['coinRespin', 'columnWrap', 'treasure', 'coinRespinFull'] as const) : []),
  ]
}
