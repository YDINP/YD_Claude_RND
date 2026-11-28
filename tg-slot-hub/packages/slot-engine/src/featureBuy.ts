import { spin } from './spin.js'
import type { FeatureBuyTrigger } from './featureBuySchema.js'
import type { GameMath } from './schema.js'
import type { Rng, RoundState, SpinResult } from './types.js'

/**
 * 유료 판 결과가 `trigger` 보너스에 진입했는가. 개발용 강제 프리셋(`freeSpins`·`orderRound`·`coinRespin`·
 * `boardBonus`·`roulette`)도 이 판정을 그대로 쓴다. 프리스핀 중 판(리트리거)은 호출부가 거른다.
 */
export function isFeatureBuyTriggered(trigger: FeatureBuyTrigger, result: SpinResult): boolean {
  return result.features.some((feature) => feature.type === trigger)
}

/**
 * 거절 표본 추출 상한. 가장 드문 대표 보너스(약 1/225 판)의 평균 시도 수의 약 90배다.
 * 이 안에서 못 찾을 확률은 e^-89 수준이라 사실상 «설정 오류»일 때만 닿는다.
 */
export const FEATURE_BUY_MAX_TRIES = 20_000

export interface FeatureBuySearchParams {
  math: GameMath
  trigger: FeatureBuyTrigger
  totalBet: number
  /** 실제로 저장될 라운드와 같은 nonce. RNG 파생 입력(`${seed}:${nonce}`)에 들어간다. */
  nonce: number
  /** 매 시도의 새 서버 시드. 서버는 `node:crypto` 32바이트 hex를 넣는다. */
  newSeed: () => string
  createRng: (seed: string, nonce: number) => Rng
  maxTries?: number
}

export interface FeatureBuySearchResult {
  seed: string
  /** 매칭에 쓴 RNG. 릴·피처만큼 소비된 상태라 호출부가 이어서 잭팟 판정을 뽑는다. */
  rng: Rng
  result: SpinResult
  tries: number
}

/**
 * 피처 구매 판 찾기 — 보너스가 열리는 유료 판이 나올 때까지 «새 시드로 평범한 유료 판»을 반복한다.
 *
 * 결과를 고치지 않고 거르기만 하므로(거절 표본 추출), 찾은 판은 «보너스가 열린 판» 분포에서 고르게 뽑힌 한 판이고
 * 공개된 시드·nonce로 평소와 똑같이 재현된다(provably fair 유지). 상한 안에서 못 찾으면 null.
 */
export function findFeatureBuySpin(params: FeatureBuySearchParams): FeatureBuySearchResult | null {
  const { math, trigger, totalBet, nonce, newSeed, createRng } = params
  const maxTries = params.maxTries ?? FEATURE_BUY_MAX_TRIES
  const noState: RoundState | undefined = undefined
  for (let tries = 1; tries <= maxTries; tries += 1) {
    const seed = newSeed()
    const rng = createRng(seed, nonce)
    const result = spin(math, { totalBet }, rng, noState)
    if (isFeatureBuyTriggered(trigger, result)) return { seed, rng, result, tries }
  }
  return null
}
