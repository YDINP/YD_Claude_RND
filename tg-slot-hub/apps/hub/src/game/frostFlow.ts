/**
 * 얼림(얼려 두기 프리스핀) 재생 입력을 서버 응답에서 꺼내는 순수 함수들.
 * store/game.ts가 같은 로직을 인라인으로 늘리지 않도록 여기 모았다.
 */
import type { FeatureTrigger, SpinResponse } from '@tgslot/shared'
import type { GameMath } from '@tgslot/slot-engine'

export type FrostChainFeature = Extract<FeatureTrigger, { type: 'frostChain' }>

/** 이번 응답의 얼림 피처. 얼림이 없는 판(착지 판에 당첨이 없었던 프리스핀, 유료 판)에는 없다. */
export function findFrostChain(features: readonly FeatureTrigger[]): FrostChainFeature | undefined {
  return features.find((feature): feature is FrostChainFeature => feature.type === 'frostChain')
}

/** 렌더러 `playFrost`가 받는 입력. 착지 판 + 눈금 + 서버 얼림 기록. */
export function frostPlayInput(
  result: Pick<SpinResponse, 'grid'>,
  chain: FrostChainFeature,
  math: Pick<GameMath, 'frostRespin'>,
): {
  chain: Omit<FrostChainFeature, 'type'>
  grid: string[][]
  thresholds: number[]
} {
  const { type: _type, ...rest } = chain
  return { chain: rest, grid: result.grid, thresholds: math.frostRespin?.thresholds ?? [] }
}

/**
 * 이 판의 얼음 보너스(코인). 지갑에서 «재생이 끝날 때까지» 덜어 둘 몫이다 — 보너스가 지갑에 먼저 오르면
 * 얼기도 전에 결과가 새어 나간다. 얼림을 그릴 수 없는 환경(렌더러 없음)이면 0이다.
 */
export function frostHoldCoins(features: readonly FeatureTrigger[], canPlay: boolean): number {
  if (!canPlay) return 0
  return findFrostChain(features)?.bonus ?? 0
}
