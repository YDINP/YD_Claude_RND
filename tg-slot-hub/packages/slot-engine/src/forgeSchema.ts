import { z } from 'zod'
import { MAX_FREE_SPINS_PER_ROUND } from './limits.js'

/**
 * 위치 무관 지불(pay anywhere). 연쇄 단계마다 판 전체에서 그림별 개수를 세고 `minCount`개 이상이면
 * 그 그림 전부를 지급하고 지운다. 배당 기준은 **총 베팅액**이고 페이테이블 키는 판 전체 개수다.
 */
export const AnywhereConfigSchema = z.object({
  minCount: z.number().int().min(2),
})
export type AnywhereConfig = z.infer<typeof AnywhereConfigSchema>

/** 양의 정수 키 → 양의 정수 값 표. JSON 키는 문자열이라 숫자로 강제 변환한다. */
const PositiveIntTableSchema = z.record(z.coerce.number().int().positive(), z.number().int().positive())

/**
 * 화로 배율 줄(volcano-forge). 연쇄 리필 칸마다 불씨 판정을 하고, 불씨 값을 판 밖 줄(합계)에 더한다.
 * 칸 `slots`개가 다 차면 합계가 `fullMultiplier`배가 된다. 스핀이 끝나면 연쇄 지급에 합계를 곱한다.
 * 프리스핀 동안에는 줄이 `carry.forge`로 라운드 내내 이어진다. 결과는 전부 서버 RNG가 정한다.
 */
export const ForgeRailConfigSchema = z.object({
  /** 화로 칸 수. 불씨 하나가 칸 하나를 켠다. */
  slots: z.number().int().min(2).max(8),
  /** 칸이 다 찼을 때 합계에 곱하는 정수 배수. */
  fullMultiplier: z.number().int().min(2),
  /** 합계 상한(두 배 포함). 넘는 몫은 버린다. */
  heatCap: z.number().int().min(1),
  /** 리필 칸 하나가 불씨를 낼 확률. **만분율 정수**(45 = 0.45%). */
  spawn: z.object({
    chanceBase: z.number().int().min(0).max(10_000),
    chanceFree: z.number().int().min(0).max(10_000),
  }),
  /** 불씨 값(배율) → 가중치. 기본 게임과 프리스핀이 같은 표를 쓴다. */
  values: PositiveIntTableSchema,
  /** 진입 스핀 스캐터 개수 → 프리스핀 시작 합계. 개수 이하에서 가장 큰 키를 쓴다. 없으면 0에서 시작. */
  startHeat: z.record(z.coerce.number().int().positive(), z.number().int().min(0)).default({}),
  /** 프리스핀 안 추가 스핀. 끝난 판의 스캐터가 `trigger`개 이상이면 `spins`회를 더한다. */
  retrigger: z.object({ trigger: z.number().int().min(1), spins: z.number().int().min(1) }).optional(),
  /** 라운드 총 프리스핀 상한(진입 몫 포함). 넘는 추가 스핀은 잘라 `freeSpinsCapped`를 남긴다. */
  maxRoundSpins: z.number().int().min(1),
})
export type ForgeRailConfig = z.infer<typeof ForgeRailConfigSchema>

/** 두 검사가 읽는 수학 모델 필드. 순환 import를 피하려고 구조만 받는다. */
interface ForgeHost {
  reels: number
  rows: number
  symbols: { id: string; wild?: boolean; scatter?: boolean }[]
  paytable: Record<string, Record<number, number>>
  paylines: number[][]
  payModel?: string
  anywhere?: AnywhereConfig
  ways?: unknown
  cluster?: unknown
  wild?: unknown
  cascade?: { maxCascades: number; multiplierLadder: number[] }
  round?: { maxWinCap: number }
  scatter?: { freeSpins?: { trigger: number; count: number; multiplier: number; retrigger: boolean } }
  orderRound?: unknown
  coinRespin?: unknown
  boardBonus?: unknown
  stageRoulette?: unknown
  mutations?: unknown[]
  forgeRail?: ForgeRailConfig
}

type Issue = (message: string, path: (string | number)[]) => void

/** `payModel: 'anywhere'` 정합성. superRefine의 payModel 분기에서 부른다. */
export function checkAnywhere(math: ForgeHost, issue: Issue): void {
  const cells = math.reels * math.rows
  if (math.anywhere === undefined) issue("payModel이 'anywhere'면 anywhere 설정이 필요하다", ['anywhere'])
  if (math.cascade === undefined) issue("payModel이 'anywhere'면 cascade 설정이 필요하다", ['cascade'])
  if (math.paylines.length > 0) issue('위치 무관 게임은 paylines를 두지 않는다', ['paylines'])
  if (math.ways !== undefined) issue('위치 무관 게임은 ways를 두지 않는다', ['ways'])
  if (math.cluster !== undefined) issue('위치 무관 게임은 cluster를 두지 않는다', ['cluster'])
  // 와일드는 «개수를 채우는 칸»일 뿐이라 판정이 흐려진다. 이 지불 방식은 와일드 없이 쓴다.
  if (math.wild !== undefined || math.symbols.some((symbol) => symbol.wild === true)) {
    issue('위치 무관 게임은 와일드를 두지 않는다', ['symbols'])
  }
  const minCount = math.anywhere?.minCount
  if (minCount === undefined) return
  if (minCount > cells) issue(`minCount(${minCount})가 화면 칸 수(${cells})보다 많다`, ['anywhere', 'minCount'])
  for (const [key, payrule] of Object.entries(math.paytable)) {
    for (const count of Object.keys(payrule).map(Number)) {
      if (count < minCount) {
        issue(`${key} ${count}개: minCount(${minCount}) 미만 키는 지급되지 않는다`, ['paytable', key, String(count)])
      }
    }
  }
}

/**
 * 화로 배율 줄 정합성. `GameMathSchema`의 superRefine이 부른다.
 * 종료 보장(GAME_CATALOG §4 규칙 1~3: 정수 하드 캡)과 다른 보너스와의 동시 사용 금지를 막는다.
 */
export function checkForgeRail(math: ForgeHost, issue: Issue): void {
  const config = math.forgeRail
  if (config === undefined) return
  const at = (...path: (string | number)[]): (string | number)[] => ['forgeRail', ...path]
  const cells = math.reels * math.rows

  if (math.payModel !== 'anywhere') issue("forgeRail은 payModel 'anywhere'에서만 쓴다", at())
  if (math.cascade === undefined) issue('forgeRail은 cascade가 필요하다(불씨는 리필 칸에서 솟는다)', at())
  if (math.round === undefined) issue('forgeRail 팩은 round.maxWinCap이 필요하다', ['round'])
  if (math.orderRound !== undefined) issue('forgeRail과 orderRound는 함께 둘 수 없다', at())
  if (math.coinRespin !== undefined) issue('forgeRail과 coinRespin은 함께 둘 수 없다', at())
  if (math.boardBonus !== undefined) issue('forgeRail과 boardBonus는 함께 둘 수 없다', at())
  if (math.stageRoulette !== undefined) issue('forgeRail과 stageRoulette는 함께 둘 수 없다', at())
  // 뮤테이션이 끼면 RNG 소비 계약(릴 정지 → 불씨)이 흔들린다.
  if ((math.mutations ?? []).length > 0) issue('forgeRail 팩은 mutations를 둘 수 없다', at())

  // 배율의 출처는 화로 하나다. 사다리를 함께 두면 두 배율이 곱으로 엮인다.
  const ladder = math.cascade?.multiplierLadder ?? []
  if (ladder.some((step) => step !== 1)) issue('forgeRail 팩의 cascade.multiplierLadder는 전부 1이어야 한다', ['cascade', 'multiplierLadder'])

  const freeSpins = math.scatter?.freeSpins
  if (freeSpins === undefined) {
    issue('forgeRail 팩은 scatter.freeSpins(진입 규칙)가 필요하다', ['scatter', 'freeSpins'])
  } else {
    // 추가 스핀은 forgeRail.retrigger가 정한다. 공용 리트리거와 겹치면 규칙이 두 벌이 된다.
    if (freeSpins.retrigger) issue('forgeRail 팩은 scatter.freeSpins.retrigger를 false로 두고 forgeRail.retrigger를 쓴다', ['scatter', 'freeSpins', 'retrigger'])
    // 프리스핀 배율은 화로 합계가 대신한다. 카운터에 ×N이 두 곳 뜨지 않게 1로 고정한다.
    if (freeSpins.multiplier !== 1) issue('forgeRail 팩의 scatter.freeSpins.multiplier는 1이어야 한다', ['scatter', 'freeSpins', 'multiplier'])
    if (config.maxRoundSpins < freeSpins.count) {
      issue(`maxRoundSpins(${config.maxRoundSpins})가 진입 스핀 수(${freeSpins.count})보다 작다`, at('maxRoundSpins'))
    }
    for (const key of Object.keys(config.startHeat).map(Number)) {
      if (key < freeSpins.trigger) issue(`startHeat 키 ${key}가 진입 개수(${freeSpins.trigger})보다 작다`, at('startHeat', key))
      if (key > cells) issue(`startHeat 키 ${key}가 화면 칸 수(${cells})보다 많다`, at('startHeat', key))
    }
  }
  if (config.maxRoundSpins > MAX_FREE_SPINS_PER_ROUND) {
    issue(`maxRoundSpins(${config.maxRoundSpins})가 엔진 상한(${MAX_FREE_SPINS_PER_ROUND})을 넘는다`, at('maxRoundSpins'))
  }
  if (config.retrigger !== undefined && config.retrigger.trigger > cells) {
    issue(`추가 스핀 트리거 ${config.retrigger.trigger}개가 화면 칸 수(${cells})보다 많다`, at('retrigger', 'trigger'))
  }

  const values = Object.keys(config.values).map(Number)
  if (values.length === 0) issue('불씨 값표가 비었다', at('values'))
  const maxValue = Math.max(0, ...values)
  if (config.heatCap < maxValue) issue(`heatCap(${config.heatCap})이 불씨 최대값(${maxValue})보다 작다`, at('heatCap'))

  const starts = Object.entries(config.startHeat)
    .map(([key, heat]) => [Number(key), heat] as const)
    .sort((a, b) => a[0] - b[0])
  for (let i = 0; i < starts.length; i += 1) {
    const [key, heat] = starts[i] as readonly [number, number]
    if (heat > config.heatCap) issue(`startHeat ${key}개 값(${heat})이 heatCap(${config.heatCap})보다 크다`, at('startHeat', key))
    const prev = starts[i - 1]
    if (prev !== undefined && prev[1] > heat) issue('startHeat는 개수가 많을수록 작아질 수 없다', at('startHeat', key))
  }
}
