/**
 * 디버그 패널의 스핀 결과 프리셋 — 다음 한 판만 이 결과가 나오도록 서버에 요청한다(원샷).
 * 프리셋 값 자체는 `@tgslot/shared`의 `SpinDebugPreset`(서버 계약)과 정확히 같아야 한다 —
 * 여기서 별도 유니온을 새로 선언하지 않고 그 타입을 그대로 재수출한다.
 */
import type { SpinDebugPreset } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'

export type DebugPreset = SpinDebugPreset

export const DEBUG_PRESETS: readonly DebugPreset[] = [
  'win',
  'bigWin',
  'freeSpins',
  'gamble',
  'lose',
  'winUnder',
  'winSmall',
  'winGood',
  'winGreat',
]

/**
 * 이 게임에서 보여 줄 프리셋. 서버가 409를 돌려줄 프리셋은 처음부터 뺀다.
 * - `freeSpins`: 스캐터 프리스핀이 있는 팩만. `gamble`: 더블업이 있는 팩만.
 * - `cascade3`는 연쇄 팩, `orderRound`·`orderComplete`는 주문 카드 라운드 팩에만.
 * - 라운드(프리스핀·주문 카드 라운드)가 이미 도는 중이면 진입 프리셋(`freeSpins`·`orderRound`)은 맞출 수 없다.
 */
export function presetsFor(
  math: Pick<GameMath, 'cascade' | 'orderRound' | 'scatter' | 'gamble' | 'coinRespin' | 'boardBonus'> & Partial<Pick<GameMath, 'stageRoulette' | 'forgeRail' | 'growBoard'>> | null,
  options: { inRound?: boolean } = {},
): readonly DebugPreset[] {
  if (math === null) return DEBUG_PRESETS
  const hasOrders = math.orderRound !== undefined
  // 코인 리스핀 팩은 프리스핀이 없다. 대신 리스핀 프리셋 4종(진입·도중 감기·보물·15칸)을 보여 준다.
  const hasCoins = math.coinRespin !== undefined
  const hasBoard = math.boardBonus !== undefined
  const hasRoulette = math.stageRoulette !== undefined
  const hasGarden = math.growBoard !== undefined
  const inRound = options.inRound === true
  const base = DEBUG_PRESETS.filter((preset) => {
    if (preset === 'freeSpins') return (math.scatter?.freeSpins !== undefined || hasGarden) && !inRound
    if (preset === 'gamble') return math.gamble !== undefined
    return true
  })
  return [
    ...base,
    ...(math.cascade !== undefined ? (['cascade3'] as const) : []),
    ...(hasOrders ? (inRound ? (['orderComplete'] as const) : (['orderRound', 'orderComplete'] as const)) : []),
    ...(hasCoins ? (['coinRespin', 'columnWrap', 'treasure', 'coinRespinFull'] as const) : []),
    ...(hasBoard ? (['boardBonus', 'boardGoal', 'boardTraps', 'boardFork', 'boardBig'] as const) : []),
    ...(hasRoulette ? STAGE_ROULETTE_PRESETS : []),
    // 화로 배율 줄 팩만. 화로 가득·추가 스핀은 프리스핀 안에서만 맞출 수 있다.
    ...(math.forgeRail !== undefined ? (inRound ? FORGE_PRESETS : (['forgeEmbers', 'forgeBig'] as const)) : []),
    ...(hasGarden ? (inRound ? GARDEN_ROUND_PRESETS : GARDEN_PAID_PRESETS) : []),
  ]
}

/** 화로 배율 줄 팩 전용 프리셋. 서버도 forgeRail이 없는 게임에는 409. 서버가 탐색 상한을 200,000으로 올린다. */
export const FORGE_PRESETS = ['forgeEmbers', 'forgeFull', 'forgeRetrigger', 'forgeBig'] as const

/** 자라는 정원 팩 전용 프리셋. 햇살·최저 보장은 정원 프리스핀 중에만 맞출 수 있다(서버도 유료 스핀이면 409). */
export const GARDEN_PAID_PRESETS = ['cascade3', 'gardenGrow', 'gardenGrow8', 'seedBloom', 'gardenBig'] as const
export const GARDEN_ROUND_PRESETS = [...GARDEN_PAID_PRESETS, 'gardenSun', 'gardenTopUp'] as const

/** 무대 룰렛 팩 전용 프리셋. 서버도 룰렛이 없는 게임에는 409. */
export const STAGE_ROULETTE_PRESETS = ['roulette', 'rouletteInner', 'roulette4', 'rouletteGrand', 'rouletteBig'] as const

/** 서버 시드 탐색 횟수. 드문 룰렛 프리셋(1/1,000~1/5,500)은 스키마 상한 20000을 쓴다. */
export function debugMaxTries(preset: DebugPreset): number {
  return preset === 'rouletteInner' || preset === 'roulette4' || preset === 'rouletteGrand' || preset === 'rouletteBig'
    ? 20000
    : 5000
}
