import { createRoundSeed } from '../spin/provablyFair.js'
import { spinWithState } from './engineSpin.js'
import type { GameMath, Rng, RoundState, SpinResult } from '@tgslot/slot-engine'
import type { SpinDebugPreset } from '@tgslot/shared'

/** 요청에 `maxTries`가 없을 때 쓰는 기본값. `SpinDebugRequestSchema`의 기본값과 같다. */
export const DEFAULT_DEBUG_MAX_TRIES = 5000

/** 총 베팅의 몇 배부터 `bigWin`으로 치는지. */
const BIG_WIN_MULTIPLIER = 10

/**
 * `maxTries` 안에서 `preset` 조건을 만족하는 시드를 찾지 못했을 때.
 * 라우트가 `409 DEBUG_NO_MATCH`로 번역한다.
 */
export class DebugNoMatchError extends Error {
  constructor(
    readonly preset: SpinDebugPreset,
    message = `No spin matched debug preset "${preset}" within the try budget`
  ) {
    super(message)
    this.name = 'DebugNoMatchError'
  }
}

/**
 * 스핀 결과가 개발용 강제 프리셋 조건을 만족하는지 판정한다.
 *
 * `isFreeSpin`은 `gamble` 프리셋에만 쓰인다 — 더블업 제안은 **유료 스핀 당첨에만** 열리므로
 * (`economy/gamble.ts`의 `isGambleEligible`), 프리스핀 중에는 당첨이 있어도 절대 매칭시키지 않는다.
 */
export function matchesDebugPreset(
  preset: SpinDebugPreset,
  result: SpinResult,
  totalBet: number,
  isFreeSpin: boolean
): boolean {
  const hasFeature = result.features.length > 0
  switch (preset) {
    case 'win':
      return result.totalWin > 0 && !hasFeature
    case 'bigWin':
      return result.totalWin >= BIG_WIN_MULTIPLIER * totalBet
    case 'freeSpins':
      return result.features.some((feature) => feature.type === 'freeSpins')
    case 'gamble':
      return !isFreeSpin && result.totalWin > 0
    case 'lose':
      return result.totalWin === 0 && !hasFeature
    default: {
      const exhaustive: never = preset
      throw new Error(`[debugSpin] unknown preset: ${String(exhaustive)}`)
    }
  }
}

export interface DebugSeedSearchParams {
  math: GameMath
  /** 이 스핀에 실제로 적용되는 베팅액 (프리스핀이면 세션 진입 시점에 고정된 값). */
  totalBet: number
  /** 프리스핀 중이면 라운드 상태, 아니면 `undefined`. 실제 스핀 경로와 동일하게 넘긴다. */
  state: RoundState | undefined
  /**
   * 실제로 저장될 라운드와 **같은 nonce**여야 한다. 같은 시드라도 nonce가 다르면
   * `roundSeedInput`(`${seed}:${nonce}`)이 달라져 완전히 다른 RNG 수열이 나온다.
   */
  nonce: number
  preset: SpinDebugPreset
  maxTries: number
  createRng: (seed: string, nonce: number) => Rng
}

export interface DebugSeedSearchResult {
  seed: string
  /**
   * 매칭에 쓴 RNG. 릴 정지·뮤테이션만큼 이미 소비된 상태다. 호출부는 **이 인스턴스를 이어서**
   * 잭팟 판정(`rng.nextInt(JACKPOT_ODDS_DENOMINATOR)`)을 뽑아야 실제 스핀 경로와 RNG 소비
   * 순서가 같아진다. 새 RNG를 다시 만들면 안 된다.
   */
  rng: Rng
  result: SpinResult
  triesUsed: number
}

/**
 * `preset` 조건을 만족하는 시드가 나올 때까지 실제 스핀 경로(`spinWithState`)를 반복 실행한다.
 *
 * 지갑·원장·라운드를 전혀 건드리지 않는 순수 시뮬레이션이며(dry-run), 매 시도마다
 * `node:crypto` 기반의 새 시드로 새 RNG를 만든다. 실제 스핀이 쓰는 것과 같은 엔진 함수를
 * 그대로 재사용하므로 판정 로직을 이중으로 구현하지 않는다.
 *
 * 매칭된 시도의 결과가 곧 최종 라운드 결과다 — 같은 (seed, nonce) 쌍은 항상 같은 결과를
 * 내므로, 매칭을 찾은 뒤 스핀을 다시 돌릴 필요가 없다.
 */
export function findDebugSeed(params: DebugSeedSearchParams): DebugSeedSearchResult | null {
  const { math, totalBet, state, nonce, preset, maxTries, createRng } = params
  const isFreeSpin = state !== undefined

  for (let tries = 1; tries <= maxTries; tries += 1) {
    const seed = createRoundSeed()
    const rng = createRng(seed, nonce)
    const result = spinWithState(math, totalBet, rng, state)
    if (matchesDebugPreset(preset, result, totalBet, isFreeSpin)) {
      return { seed, rng, result, triesUsed: tries }
    }
  }

  return null
}
