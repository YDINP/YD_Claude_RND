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
  math: Pick<GameMath, 'cascade' | 'orderRound' | 'scatter'> & Partial<Pick<GameMath, 'stageRoulette'>> | null,
): readonly DebugPreset[] {
  if (math === null) return DEBUG_PRESETS
  const hasOrders = math.orderRound !== undefined
  const hasRoulette = math.stageRoulette !== undefined
  const base =
    (hasOrders || hasRoulette) && math.scatter?.freeSpins === undefined
      ? DEBUG_PRESETS.filter((p) => p !== 'freeSpins')
      : DEBUG_PRESETS
  return [
    ...base,
    ...(math.cascade !== undefined ? (['cascade3'] as const) : []),
    ...(hasOrders ? (['orderRound', 'orderComplete'] as const) : []),
    ...(hasRoulette ? STAGE_ROULETTE_PRESETS : []),
  ]
}

/** 무대 룰렛 팩 전용 프리셋. 서버도 룰렛이 없는 게임에는 409. */
export const STAGE_ROULETTE_PRESETS = ['roulette', 'rouletteInner', 'roulette4', 'rouletteGrand', 'rouletteBig'] as const

/** 서버 시드 탐색 횟수. 드문 룰렛 프리셋(1/1,000~1/5,500)은 스키마 상한 20000을 쓴다. */
export function debugMaxTries(preset: DebugPreset): number {
  return preset === 'rouletteInner' || preset === 'roulette4' || preset === 'rouletteGrand' || preset === 'rouletteBig'
    ? 20000
    : 5000
}
