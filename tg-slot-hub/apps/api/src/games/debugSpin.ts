import { createRoundSeed } from '../spin/provablyFair.js'
import { spinWithState } from './engineSpin.js'
import type { GameMath, Rng, RoundState, SpinResult } from '@tgslot/slot-engine'
import type { SpinDebugPreset } from '@tgslot/shared'

/** 요청에 `maxTries`가 없을 때 쓰는 기본값. `SpinDebugRequestSchema`의 기본값과 같다. */
export const DEFAULT_DEBUG_MAX_TRIES = 5000

/**
 * `coinRespinFull`(15칸 채움, 약 1/26,000 스핀)만 쓰는 내부 탐색 상한. 공용 `maxTries` 상한(20,000)으로는
 * 찾을 확률이 54% 남짓이라 이 프리셋만 서버 안에서 올린다. 요청의 `maxTries`가 더 크면 그것을 쓴다.
 *
 * 운영 주의: 요청 하나가 서버 CPU를 수 초 붙든다(동기 루프). `API_ALLOW_DEBUG_SPIN`은 로컬 개발 전용이고 스테이징·운영에서
 * 켜 두지 않는다. 켜야 한다면 앞단에서 요청 빈도를 제한할 것.
 */
export const COIN_RESPIN_FULL_MAX_TRIES = 200_000

/** 총 베팅의 몇 배부터 `bigWin`으로 치는지. */
const BIG_WIN_MULTIPLIER = 10

/** 말판 지급이 총 베팅의 몇 배부터 `boardBig`으로 치는지. */
export const BOARD_BIG_PAYOUT = 100
/** 룰렛 합계가 총 베팅의 몇 배부터 `rouletteBig`으로 치는지. */
const BIG_ROULETTE_MULTIPLIER = 100

/** 정원 지급이 총 베팅의 몇 배부터 `gardenBig`으로 치는지. */
export const GARDEN_BIG_MULTIPLIER = 50

/**
 * 드문 정원 프리셋(`gardenGrow8` 기본 게임 약 1/430, `gardenBig`, 프리스핀 중 `gardenSun`)의 내부 탐색 상한.
 * 공용 `maxTries` 상한(20,000)보다 크게 잡아 못 찾을 확률을 무시할 만큼 줄인다. 요청 값이 더 크면 그것을 쓴다.
 */
export const GARDEN_RARE_MAX_TRIES = 50_000

/** 이 프리셋은 자라는 정원(growBoard)이 있는 팩에서만 만족될 수 있다. */
export function isGardenPreset(preset: SpinDebugPreset): boolean {
  return (
    preset === 'gardenGrow' ||
    preset === 'gardenGrow8' ||
    preset === 'seedBloom' ||
    preset === 'gardenSun' ||
    preset === 'gardenBig' ||
    preset === 'gardenTopUp'
  )
}

/** 프리스핀 중에만 나올 수 있는 정원 프리셋(햇살·최저 보장). 유료 스핀이면 탐색 없이 실패한다. */
export function isGardenRoundOnlyPreset(preset: SpinDebugPreset): boolean {
  return preset === 'gardenSun' || preset === 'gardenTopUp'
}

/** 이 프리셋은 무대 룰렛이 있는 팩에서만 만족될 수 있다. */
export function isRoulettePreset(preset: SpinDebugPreset): boolean {
  return (
    preset === 'roulette' ||
    preset === 'rouletteInner' ||
    preset === 'roulette4' ||
    preset === 'rouletteGrand' ||
    preset === 'rouletteBig'
  )
}

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
  isFreeSpin: boolean,
  math?: GameMath
): boolean {
  // 정원 팩은 매 스핀 `garden` 피처를 싣는다. 성장·개화·햇살이 없는 정원 피처는 «평범한 스핀»으로 친다.
  const hasFeature = result.features.some((feature) => !isPlainGarden(feature))
  switch (preset) {
    case 'win':
      return result.totalWin > 0 && !hasFeature
    case 'bigWin':
      return result.totalWin >= BIG_WIN_MULTIPLIER * totalBet
    case 'freeSpins':
      return result.features.some((feature) => feature.type === 'freeSpins')
    case 'gamble':
      // 프리스핀을 여는 스핀은 더블업을 열지 않는다(isGambleEligible) — 그런 판은 맞추지 않는다.
      return !isFreeSpin && result.totalWin > 0 && result.nextState === undefined
    case 'lose':
      return result.totalWin === 0 && !hasFeature
    case 'cascade3':
      return (result.cascades?.length ?? 0) >= 3 || gardenPopSteps(result) >= 3
    case 'orderRound':
      return !isFreeSpin && result.features.some((feature) => feature.type === 'orderRound')
    case 'orderComplete':
      return result.features.some((feature) => feature.type === 'orderComplete')
    case 'coinRespin':
      return result.features.some((feature) => feature.type === 'coinRespin')
    case 'columnWrap':
      // 진입 감기만으로는 리스핀 중 촉수 연출 순서를 볼 수 없다. **도중** 감기가 있어야 한다.
      return result.features.some(
        (feature) => feature.type === 'coinRespin' && feature.steps.some((step) => step.wraps.length > 0),
      )
    case 'treasure':
      return result.features.some(
        (feature) => feature.type === 'coinRespin' && feature.final.some((cell) => cell.kind === 'treasure'),
      )
    case 'coinRespinFull':
      return result.features.some((feature) => feature.type === 'coinRespin' && feature.full)
    case 'boardBonus':
      return boardOf(result) !== undefined
    case 'boardGoal':
      return boardOf(result)?.end === 'goal'
    case 'boardTraps':
      return boardOf(result)?.end === 'traps'
    case 'boardFork':
      // 갈림길 칸 목록은 math가 갖는다(math 없이 부르면 false).
      return boardOf(result)?.throws.some((row) => math?.boardBonus?.forks[row.at] !== undefined) ?? false
    case 'boardBig':
      return (boardOf(result)?.payout ?? 0) >= BOARD_BIG_PAYOUT
    case 'roulette':
    case 'rouletteInner':
    case 'roulette4':
    case 'rouletteGrand':
    case 'rouletteBig': {
      const roulette = result.features.find((feature) => feature.type === 'stageRoulette')
      if (isFreeSpin || roulette?.type !== 'stageRoulette') return false
      if (preset === 'rouletteInner') return roulette.steps.some((step) => step.ring >= 2)
      if (preset === 'roulette4') return roulette.startRing === 1
      if (preset === 'rouletteGrand') return roulette.steps.some((step) => step.kind === 'grand')
      if (preset === 'rouletteBig') return roulette.total >= BIG_ROULETTE_MULTIPLIER * totalBet
      return true
    }
    case 'gardenGrow':
      return gardenOf(result)?.steps.some((step) => step.grow !== undefined) ?? false
    case 'gardenGrow8':
      return gardenOf(result)?.steps.some((step) => step.grow?.to.size === 8) ?? false
    case 'seedBloom':
      return gardenOf(result)?.steps.some((step) => step.bloomed.length > 0) ?? false
    case 'gardenSun':
      return isFreeSpin && (gardenOf(result)?.sun?.length ?? 0) > 0
    case 'gardenBig':
      return gardenOf(result) !== undefined && result.totalWin >= GARDEN_BIG_MULTIPLIER * totalBet
    case 'gardenTopUp':
      return isFreeSpin && result.features.some((feature) => feature.type === 'gardenTopUp')
    default: {
      const exhaustive: never = preset
      throw new Error(`[debugSpin] unknown preset: ${String(exhaustive)}`)
    }
  }
}

type GardenFeature = Extract<SpinResult['features'][number], { type: 'garden' }>

/** 스핀 결과의 정원 피처. 정원 팩이 아니면 undefined. */
function gardenOf(result: SpinResult): GardenFeature | undefined {
  for (const feature of result.features) if (feature.type === 'garden') return feature
  return undefined
}

/** 당첨이 있었던 정원 단계 수(연쇄 단계에 해당). */
function gardenPopSteps(result: SpinResult): number {
  return gardenOf(result)?.steps.filter((step) => step.wins.length > 0).length ?? 0
}

/** 성장·개화·햇살이 없는 정원 피처. `win`·`lose` 프리셋이 «피처 없는 스핀»으로 본다. */
function isPlainGarden(feature: SpinResult['features'][number]): boolean {
  return (
    feature.type === 'garden' &&
    feature.sun === undefined &&
    feature.steps.every((step) => step.grow === undefined && step.bloomed.length === 0)
  )
}

/** 스핀 결과의 말판 피처. 말판이 없으면 undefined. */
function boardOf(result: SpinResult): Extract<SpinResult['features'][number], { type: 'boardBonus' }> | undefined {
  for (const feature of result.features) if (feature.type === 'boardBonus') return feature
  return undefined
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
  const { math, totalBet, state, nonce, preset, createRng } = params
  const isFreeSpin = state !== undefined
  // 햇살·최저 보장은 프리스핀에서만 나온다. 유료 스핀에서 탐색해 봐야 CPU만 쓴다.
  if (!isFreeSpin && isGardenRoundOnlyPreset(preset)) return null
  const rare = preset === 'gardenGrow8' || preset === 'gardenBig' || preset === 'gardenSun'
  const maxTries =
    preset === 'coinRespinFull'
      ? Math.max(params.maxTries, COIN_RESPIN_FULL_MAX_TRIES)
      : rare
        ? Math.max(params.maxTries, GARDEN_RARE_MAX_TRIES)
        : params.maxTries

  for (let tries = 1; tries <= maxTries; tries += 1) {
    const seed = createRoundSeed()
    const rng = createRng(seed, nonce)
    const result = spinWithState(math, totalBet, rng, state)
    if (matchesDebugPreset(preset, result, totalBet, isFreeSpin, math)) {
      return { seed, rng, result, triesUsed: tries }
    }
  }

  return null
}
