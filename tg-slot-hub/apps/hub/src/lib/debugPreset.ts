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
 * 이 게임에서 보여 줄 프리셋. 서버가 409를 돌려줄 프리셋은 처음부터 뺀다.
 * - `freeSpins`: 스캐터 프리스핀이 있는 팩만. `gamble`: 더블업이 있는 팩만.
 * - `cascade3`는 연쇄 팩, `orderRound`·`orderComplete`는 주문 카드 라운드 팩에만.
 * - 라운드(프리스핀·주문 카드 라운드)가 이미 도는 중이면 진입 프리셋(`freeSpins`·`orderRound`)은 맞출 수 없다.
 */
export function presetsFor(
  math: Pick<GameMath, 'cascade' | 'orderRound' | 'scatter' | 'gamble'> | null,
  options: { inRound?: boolean } = {},
): readonly DebugPreset[] {
  if (math === null) return DEBUG_PRESETS
  const hasOrders = math.orderRound !== undefined
  const inRound = options.inRound === true
  const base = DEBUG_PRESETS.filter((preset) => {
    if (preset === 'freeSpins') return math.scatter?.freeSpins !== undefined && !inRound
    if (preset === 'gamble') return math.gamble !== undefined
    return true
  })
  return [
    ...base,
    ...(math.cascade !== undefined ? (['cascade3'] as const) : []),
    ...(hasOrders ? (inRound ? (['orderComplete'] as const) : (['orderRound', 'orderComplete'] as const)) : []),
  ]
}
