import type { FeatureTrigger } from '@tgslot/shared'
import type { GridPosition } from '@tgslot/slot-engine'

export type { FeatureTrigger }

/** 프리스핀 진입 트리거만 좁힌 형태. */
export type FreeSpinsTrigger = Extract<FeatureTrigger, { type: 'freeSpins' }>
/** 스캐터 배당 트리거만 좁힌 형태. 좌표를 들고 있는 유일한 피처다. */
export type ScatterWinTrigger = Extract<FeatureTrigger, { type: 'scatterWin' }>

export function isFreeSpinsTrigger(feature: FeatureTrigger): feature is FreeSpinsTrigger {
  return feature.type === 'freeSpins'
}

export function isScatterWinTrigger(feature: FeatureTrigger): feature is ScatterWinTrigger {
  return feature.type === 'scatterWin'
}

/** 목록에서 프리스핀 트리거 하나. 없으면 null. */
export function findFreeSpins(features: readonly FeatureTrigger[] = []): FreeSpinsTrigger | null {
  return features.find(isFreeSpinsTrigger) ?? null
}

/**
 * 스캐터가 놓였던 자리 전부.
 *
 * 이 좌표는 연출 내내 **어두워지지 않는다**. 스캐터는 페이라인과 무관하게 이겼으므로
 * 라인 순환 중에도 계속 밝게 남아 있어야 근거가 읽힌다.
 */
export function scatterPositions(features: readonly FeatureTrigger[] = []): GridPosition[] {
  const positions: GridPosition[] = []
  for (const feature of features) {
    if (!isScatterWinTrigger(feature)) continue
    for (const [reel, row] of feature.positions) positions.push([reel, row])
  }
  return positions
}

/** 프리스핀 진행 상태. 허브가 서버 응답에서 받아 그대로 넘긴다. */
export interface FreeSpinsMode {
  left: number
  total: number
  multiplier: number
}

export interface RendererMode {
  /** 프리스핀 중이면 상태, 아니면 null. */
  freeSpins?: FreeSpinsMode | null
}
