import { spin } from '@tgslot/slot-engine'
import type {
  FeatureTrigger as EngineFeatureTrigger,
  GameMath,
  Rng,
  RoundState,
  SpinResult,
} from '@tgslot/slot-engine'
import type { FeatureTrigger, FreeSpinsState } from '@tgslot/shared'
import type { FreeSpinsAward } from '../economy/freeSpins.js'

/** 저장된 프리스핀 세션 → 엔진이 받는 라운드 상태. 필드 이름만 옮긴다. */
export function toRoundState(freeSpins: FreeSpinsState | null): RoundState | undefined {
  if (!freeSpins) return undefined
  return {
    freeSpinsLeft: freeSpins.left,
    freeSpinsTotal: freeSpins.total,
    multiplier: freeSpins.multiplier,
  }
}

/**
 * 라운드 상태를 실어 엔진을 돌린다. 상태가 없으면 기본 게임 스핀과 같다.
 * 베팅 레벨 검증(`assertBetLevel`)은 엔진의 `spin`이 한다.
 */
export function spinWithState(math: GameMath, totalBet: number, rng: Rng, state?: RoundState): SpinResult {
  return spin(math, { totalBet }, rng, state)
}

/**
 * 엔진 피처 → shared 피처. 두 타입은 지금 구조가 같지만 소유 패키지가 다르므로 명시적으로 옮긴다.
 * (`toSharedWinLine`과 같은 이유다. 한쪽이 바뀌면 여기서 컴파일 에러가 나야 한다.)
 */
export function toSharedFeature(feature: EngineFeatureTrigger): FeatureTrigger {
  if (feature.type === 'freeSpins') {
    return {
      type: 'freeSpins',
      spins: feature.spins,
      multiplier: feature.multiplier,
      retrigger: feature.retrigger,
    }
  }
  return {
    type: 'scatterWin',
    symbol: feature.symbol,
    count: feature.count,
    win: feature.win,
    positions: feature.positions.map(([reel, row]) => [reel, row] as [number, number]),
  }
}

export function toSharedFeatures(features: readonly EngineFeatureTrigger[]): FeatureTrigger[] {
  return features.map(toSharedFeature)
}

/**
 * 이번 스핀이 부여한 프리스핀. 한 스핀에 `freeSpins` 피처가 여러 개 올 일은 없지만,
 * 온다면 횟수는 더하고 배수는 큰 쪽을 쓴다 (세션 배수는 하나뿐이다).
 */
export function freeSpinsAwardFrom(features: readonly FeatureTrigger[]): FreeSpinsAward | undefined {
  let award: FreeSpinsAward | undefined
  for (const feature of features) {
    if (feature.type !== 'freeSpins') continue
    award = award
      ? { spins: award.spins + feature.spins, multiplier: Math.max(award.multiplier, feature.multiplier) }
      : { spins: feature.spins, multiplier: feature.multiplier }
  }
  return award
}
