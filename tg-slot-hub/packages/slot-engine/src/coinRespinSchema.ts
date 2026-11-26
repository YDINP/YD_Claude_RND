import { z } from 'zod'

/** 코인 금액표 1행. 숫자 코인은 총 베팅액 배수 `value`, 보물 코인은 단계 `tier`(금액은 `treasures`). */
export const CoinValueEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bet'),
    /** 총 베팅액 배수. */
    value: z.number().gt(0),
    weight: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('treasure'),
    tier: z.enum(['small', 'medium', 'large']),
    weight: z.number().int().positive(),
  }),
])
export type CoinValueEntry = z.infer<typeof CoinValueEntrySchema>

/**
 * 코인 리스핀(홀드 앤 스핀) 설정. `scatter.freeSpins`·`cascade`·`orderRound` 대신 쓰는 보너스다.
 *
 * 기본 판에 `symbol`이 `trigger`개 이상이면 그 스핀이 곧 리스핀 라운드가 된다. 코인은 그 자리에 고정되고
 * 고정 안 된 칸만 릴별 `respinStrips`에서 칸마다 한 칸씩 다시 뽑는다. 새 코인이 붙으면 남은 횟수가
 * `respins`로 돌아가고, 없으면 1 줄어든다. 세로줄이 다 차면 그 줄 숫자 코인에 `columnBonus.multiplier`를
 * 곱한다(줄마다 1회). 판을 다 채우면 `treasures.top`을 더 준다. 라운드는 트리거 스핀 응답 하나에서 끝난다.
 */
export const CoinRespinSchema = z.object({
  /** 코인 심볼 id. 라인 배당이 없는 심볼이어야 한다. */
  symbol: z.string().min(1),
  /** 진입 코인 개수(기본 판 기준). */
  trigger: z.number().int().min(1),
  /** 리셋 값이자 시작 횟수. */
  respins: z.number().int().min(1),
  /** 리스핀 횟수 안전망. 구조상 최대(`respins x (칸 수 - trigger + 1)`)보다 커야 의미가 있다. */
  hardCap: z.number().int().min(1),
  /** 릴별 리스핀 칸 스트립. 고정 안 된 칸이 칸마다 독립으로 한 칸을 뽑는다. */
  respinStrips: z.array(z.array(z.string().min(1)).min(2)).min(1),
  values: z.array(CoinValueEntrySchema).min(1),
  /** 보물 금액(총 베팅액 배수). `top`은 판을 다 채울 때만 지급한다. */
  treasures: z.object({
    small: z.number().gt(0),
    medium: z.number().gt(0),
    large: z.number().gt(0),
    top: z.number().gt(0),
  }),
  /** 촉수 감기. 다 찬 세로줄의 숫자 코인에 곱하는 정수 배수. */
  columnBonus: z.object({ multiplier: z.number().int().min(2) }),
})
export type CoinRespinConfig = z.infer<typeof CoinRespinSchema>

/** `checkCoinRespin`이 읽는 수학 모델 필드. 순환 import를 피하려고 구조만 받는다. */
interface CoinRespinHost {
  reels: number
  rows: number
  symbols: { id: string; wild?: boolean; scatter?: boolean }[]
  strips: string[][]
  paytable: Record<string, unknown>
  wild?: { substitutesFor: 'all' | string[]; excludes?: string[] }
  scatter?: { freeSpins?: unknown; pays?: Record<number, number> }
  payModel?: string
  round?: { maxWinCap: number }
  cascade?: unknown
  cluster?: unknown
  orderRound?: unknown
  mutations?: unknown[]
  betLevels: number[]
  coinRespin?: CoinRespinConfig
}

function isWholeCoin(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9
}

/** 리스핀 한 번에 새 코인이 붙을 기대 개수의 상한. `max_r q_r x 빈칸 최대`. 1 미만이어야 종료가 빠르다. */
export function coinRespinGrowthBound(config: CoinRespinConfig, cells: number): number {
  const empties = Math.max(0, cells - config.trigger)
  let q = 0
  for (const strip of config.respinStrips) {
    const coins = strip.filter((id) => id === config.symbol).length
    q = Math.max(q, coins / strip.length)
  }
  return q * empties
}

/**
 * 코인 리스핀 정합성 검사. `GameMathSchema`의 superRefine이 부른다.
 * 종료 보장(GAME_CATALOG §4 규칙 1~3)과 정수 지급, 다른 보너스와의 동시 사용 금지를 여기서 막는다.
 */
export function checkCoinRespin(math: CoinRespinHost, issue: (message: string, path: (string | number)[]) => void): void {
  const config = math.coinRespin
  if (config === undefined) return
  const at = (...path: (string | number)[]): (string | number)[] => ['coinRespin', ...path]
  const cells = math.reels * math.rows
  const declared = new Map(math.symbols.map((symbol) => [symbol.id, symbol]))
  const coin = declared.get(config.symbol)

  if (math.cascade !== undefined) issue('coinRespin과 cascade는 함께 둘 수 없다', at())
  if (math.cluster !== undefined) issue('coinRespin과 cluster는 함께 둘 수 없다', at())
  if (math.orderRound !== undefined) issue('coinRespin과 orderRound는 함께 둘 수 없다', at())
  if (math.scatter?.freeSpins !== undefined) issue('coinRespin과 scatter.freeSpins는 함께 둘 수 없다', at())
  // 뮤테이션이 코인 칸을 바꾸면 화면에 보이던 코인 수와 진입 판정이 어긋난다.
  if ((math.mutations ?? []).length > 0) issue('coinRespin 팩은 mutations를 둘 수 없다', at())

  if (coin === undefined) {
    issue(`선언되지 않은 심볼: ${config.symbol}`, at('symbol'))
  } else {
    if (coin.wild === true || coin.scatter === true) issue(`코인 ${config.symbol}은 와일드·스캐터일 수 없다`, at('symbol'))
    if (!math.strips.some((strip) => strip.includes(config.symbol))) {
      issue(`어느 스트립에도 없는 코인: ${config.symbol}`, at('symbol'))
    }
  }
  if (math.paytable[config.symbol] !== undefined) issue(`코인 ${config.symbol}은 라인 배당을 가질 수 없다`, at('symbol'))
  // 와일드가 코인을 대신하면 코인 칸이 라인을 잇는다. 코인은 라인을 끊는 칸이어야 한다.
  if (math.wild !== undefined) {
    const substitutes =
      math.wild.substitutesFor === 'all'
        ? !(math.wild.excludes ?? []).includes(config.symbol)
        : math.wild.substitutesFor.includes(config.symbol)
    if (substitutes) issue(`와일드가 코인 ${config.symbol}을 대체한다. wild.excludes에 넣을 것`, ['wild'])
  }

  if (config.trigger > cells) issue(`트리거 ${config.trigger}개가 화면 칸 수(${cells})보다 많다`, at('trigger'))
  const longest = config.respins * (Math.max(0, cells - config.trigger) + 1)
  if (config.hardCap < longest) {
    issue(`hardCap(${config.hardCap})이 구조상 최대 리스핀(${longest})보다 작다`, at('hardCap'))
  }

  if (config.respinStrips.length !== math.reels) {
    issue(`respinStrips 개수(${config.respinStrips.length})가 reels(${math.reels})와 다르다`, at('respinStrips'))
  }
  config.respinStrips.forEach((strip, reel) => {
    strip.forEach((id, index) => {
      const symbol = declared.get(id)
      if (symbol === undefined) issue(`선언되지 않은 심볼: ${id}`, at('respinStrips', reel, index))
      else if (symbol.wild === true || symbol.scatter === true) {
        issue(`리스핀 칸 스트립에 와일드·스캐터 ${id}를 둘 수 없다`, at('respinStrips', reel, index))
      }
    })
    const coins = strip.filter((id) => id === config.symbol).length
    if (coins === 0) issue(`릴 ${reel} 리스핀 칸 스트립에 코인이 없다`, at('respinStrips', reel))
    if (coins === strip.length) issue(`릴 ${reel} 리스핀 칸 스트립이 전부 코인이다`, at('respinStrips', reel))
  })
  // 규칙 1(기대 반복 수렴): 리스핀 한 번에 붙는 코인 기대값이 1 미만이어야 라운드가 짧게 끝난다.
  const growth = coinRespinGrowthBound(config, cells)
  if (growth >= 1) {
    issue(`max q x 빈칸(${growth.toFixed(4)})이 1 이상이다. 리스핀 칸 스트립의 코인을 줄일 것`, at('respinStrips'))
  }

  const tiers = new Set<string>()
  let betEntries = 0
  config.values.forEach((entry, index) => {
    if (entry.kind === 'bet') {
      betEntries += 1
      for (const level of math.betLevels) {
        for (const factor of [1, config.columnBonus.multiplier]) {
          if (!isWholeCoin(level * entry.value * factor)) {
            issue(
              `코인 x${entry.value}(감기 x${factor}): 총 베팅액 ${level}에서 ${level * entry.value * factor}로 정수가 아니다`,
              at('values', index, 'value'),
            )
          }
        }
      }
    } else {
      if (tiers.has(entry.tier)) issue(`보물 단계 ${entry.tier}가 금액표에 두 번 있다`, at('values', index, 'tier'))
      tiers.add(entry.tier)
    }
  })
  // 보물이 다 판에 있으면 숫자 코인만 후보로 남는다. 숫자 코인이 없으면 뽑을 것이 없다.
  if (betEntries === 0) issue('금액표에 숫자 코인(kind: bet)이 하나도 없다', at('values'))

  // 지급 상한은 리스핀에 들어간 스핀에만 건다(라인 당첨을 먼저 채우고 남은 몫을 리스핀에 준다). 진입하지 않은 스핀이
  // 상한을 넘지 못하도록 «라인 최대 + 스캐터 최대»가 상한보다 작아야 한다. 라인 모델에서 한 판의 라인 합은
  // 라인 수 x 최고 배당 x 라인당 베팅 = 최고 배당 x 총 베팅을 넘지 못한다.
  if (math.round !== undefined && (math.payModel === undefined || math.payModel === 'lines')) {
    let lineMax = 0
    for (const rule of Object.values(math.paytable)) {
      if (rule === null || typeof rule !== 'object') continue
      for (const pay of Object.values(rule as Record<string, unknown>)) {
        if (typeof pay === 'number') lineMax = Math.max(lineMax, pay)
      }
    }
    const scatterMax = Math.max(0, ...Object.values(math.scatter?.pays ?? {}))
    if (lineMax + scatterMax >= math.round.maxWinCap) {
      issue(
        `라인 최대(x${lineMax}) + 스캐터 최대(x${scatterMax})가 지급 상한 x${math.round.maxWinCap} 이상이다. 진입하지 않은 스핀은 상한을 걸지 않으므로 배당을 낮출 것`,
        ['paytable'],
      )
    }
  }

  const { small, medium, large, top } = config.treasures
  if (!(small < medium && medium < large && large < top)) {
    issue('보물 금액은 small < medium < large < top 이어야 한다', at('treasures'))
  }
  for (const [tier, value] of Object.entries(config.treasures)) {
    for (const level of math.betLevels) {
      if (!isWholeCoin(level * value)) {
        issue(`보물 ${tier} x${value}: 총 베팅액 ${level}에서 ${level * value}로 정수가 아니다`, at('treasures', tier))
      }
    }
  }
}
