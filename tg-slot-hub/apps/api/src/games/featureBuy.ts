import { findFeatureBuySpin } from '@tgslot/slot-engine'
import type { FeatureBuyConfig, FeatureBuySearchResult, GameMath, Rng } from '@tgslot/slot-engine'
import { createRoundSeed } from '../spin/provablyFair.js'

/**
 * 피처 구매 판 찾기(프로덕션 경로). 개발용 강제 프리셋(`debugSpin.ts`)과 달리 빌드에서 빠지지 않는다.
 *
 * 하는 일은 «평범한 유료 판을 새 서버 시드로 돌려 보고, 대표 보너스가 열린 판이 나오면 그 판을 쓴다»뿐이다.
 * 결과를 바꾸지 않으므로 저장된 시드·nonce로 평소 판과 똑같이 재현된다. 판정과 탐색은 엔진(`findFeatureBuySpin`)이 한다.
 */
export class FeatureBuyNoMatchError extends Error {
  constructor(readonly gameId: string) {
    super(`No bonus-entry spin was found for game "${gameId}" within the search budget`)
    this.name = 'FeatureBuyNoMatchError'
  }
}

export function findFeatureBuyRound(params: {
  math: GameMath
  config: FeatureBuyConfig
  totalBet: number
  nonce: number
  createRng: (seed: string, nonce: number) => Rng
}): FeatureBuySearchResult {
  const found = findFeatureBuySpin({
    math: params.math,
    trigger: params.config.trigger,
    totalBet: params.totalBet,
    nonce: params.nonce,
    newSeed: createRoundSeed,
    createRng: params.createRng,
  })
  if (found === null) throw new FeatureBuyNoMatchError(params.math.id)
  return found
}
