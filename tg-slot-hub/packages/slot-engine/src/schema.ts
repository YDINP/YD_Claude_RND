import { z } from 'zod'
import { VolatilitySchema } from '@tgslot/shared'

export { VolatilitySchema }
export type { Volatility } from '@tgslot/shared'

/** 심볼 이름은 en이 필수, ko는 선택. shared의 LocalizedString과 같은 규칙. */
export const SymbolNameSchema = z.object({ en: z.string().min(1), ko: z.string().min(1).optional() })

export const SymbolDefSchema = z.object({
  id: z.string().min(1),
  name: SymbolNameSchema,
  /** 다른 심볼을 대체하는 와일드. 스캐터는 절대 대체하지 않는다. */
  wild: z.boolean().optional(),
  scatter: z.boolean().optional(),
})
export type SymbolDef = z.infer<typeof SymbolDefSchema>

export const WildConfigSchema = z.object({
  /** 'all'이면 스캐터와 다른 와일드를 제외한 모든 심볼을 대체한다. */
  substitutesFor: z.union([z.literal('all'), z.array(z.string().min(1))]),
  excludes: z.array(z.string().min(1)).optional(),
})
export type WildConfig = z.infer<typeof WildConfigSchema>

/** { 매치 개수: betPerLine 배수 }. JSON 키는 문자열이므로 숫자로 강제 변환한다. */
export const PayruleSchema = z.record(z.coerce.number().int().positive(), z.number().nonnegative())

const BaseGameMathSchema = z.object({
  id: z.string().min(1),
  reels: z.number().int().min(1),
  rows: z.number().int().min(1),
  symbols: z.array(SymbolDefSchema).min(1),
  /** 릴별 스트립. strips.length === reels. */
  strips: z.array(z.array(z.string().min(1)).min(1)).min(1),
  /** 페이라인 1개 = 릴별 행 인덱스 배열. 예: [1,1,1]은 가운데 가로줄. */
  paylines: z.array(z.array(z.number().int().min(0)).min(1)).min(1),
  /** symbol -> { 매치 개수: betPerLine 배수 }. 왼쪽에서 오른쪽으로 연속 매치. */
  paytable: z.record(z.string().min(1), PayruleSchema),
  wild: WildConfigSchema.optional(),
  /** 총 베팅액(코인) 후보. 모두 paylines.length로 나누어떨어져야 한다. */
  betLevels: z.array(z.number().int().positive()).min(1),
  rtpTarget: z.number().gt(0).max(1),
  volatility: VolatilitySchema,
})

/** 페이룰의 매치 개수를 오름차순 숫자 배열로. */
function payruleCounts(payrule: Record<number, number>): number[] {
  return Object.keys(payrule)
    .map(Number)
    .sort((a, b) => a - b)
}

export const GameMathSchema = BaseGameMathSchema.superRefine((math, ctx) => {
  const issue = (message: string, path: (string | number)[]): void => {
    ctx.addIssue({ code: 'custom', message, path })
  }

  const declared = new Map<string, SymbolDef>()
  math.symbols.forEach((symbol, index) => {
    if (declared.has(symbol.id)) issue(`중복 심볼 id: ${symbol.id}`, ['symbols', index, 'id'])
    declared.set(symbol.id, symbol)
  })

  const wilds = math.symbols.filter((s) => s.wild === true)
  if (wilds.length > 0 && wilds.some((s) => s.scatter === true)) {
    issue('심볼은 wild와 scatter를 동시에 가질 수 없다', ['symbols'])
  }

  if (math.strips.length !== math.reels) {
    issue(`strips 개수(${math.strips.length})가 reels(${math.reels})와 다르다`, ['strips'])
  }
  const onStrip = new Set<string>()
  math.strips.forEach((strip, reel) => {
    if (strip.length < math.rows) {
      issue(`릴 ${reel} 스트립 길이(${strip.length})가 rows(${math.rows})보다 짧다`, ['strips', reel])
    }
    strip.forEach((id, index) => {
      onStrip.add(id)
      if (!declared.has(id)) issue(`선언되지 않은 심볼: ${id}`, ['strips', reel, index])
    })
  })

  const seenPaylines = new Set<string>()
  math.paylines.forEach((line, index) => {
    if (line.length !== math.reels) {
      issue(`페이라인 ${index} 길이(${line.length})가 reels(${math.reels})와 다르다`, ['paylines', index])
    }
    line.forEach((row, reel) => {
      if (row >= math.rows) issue(`행 인덱스 ${row}가 rows(${math.rows}) 범위를 벗어났다`, ['paylines', index, reel])
    })
    const key = line.join(',')
    if (seenPaylines.has(key)) issue(`중복 페이라인: [${key}]`, ['paylines', index])
    seenPaylines.add(key)
  })

  const lineCount = math.paylines.length
  math.betLevels.forEach((level, index) => {
    if (level % lineCount !== 0) {
      issue(`베팅액 ${level}이 라인 수(${lineCount})로 나누어떨어지지 않는다`, ['betLevels', index])
    }
  })

  for (const [symbolId, payrule] of Object.entries(math.paytable)) {
    const symbol = declared.get(symbolId)
    if (symbol === undefined) {
      issue(`선언되지 않은 심볼의 페이테이블: ${symbolId}`, ['paytable', symbolId])
      continue
    }
    // 스캐터는 라인이 아니라 화면 전체로 세므로 페이라인 페이테이블을 가질 수 없다.
    if (symbol.scatter === true) {
      issue(`스캐터 ${symbolId}는 페이라인 페이테이블을 가질 수 없다`, ['paytable', symbolId])
    }
    if (!onStrip.has(symbolId)) {
      issue(`어느 스트립에도 없는 심볼의 페이테이블: ${symbolId}`, ['paytable', symbolId])
    }

    const counts = payruleCounts(payrule)
    for (const count of counts) {
      if (count < 1 || count > math.reels) {
        issue(`매치 개수 ${count}가 1..${math.reels} 범위를 벗어났다`, ['paytable', symbolId, String(count)])
      }
    }
    // "긴 연속이 이긴다" 규칙이 성립하려면 배수가 매치 개수에 대해 단조증가여야 한다.
    for (let i = 1; i < counts.length; i += 1) {
      const shorter = counts[i - 1]
      const longer = counts[i]
      if (shorter === undefined || longer === undefined) continue
      const shortPay = payrule[shorter] ?? 0
      const longPay = payrule[longer] ?? 0
      if (shortPay > longPay) {
        issue(
          `${symbolId}: ${shorter}개 배수(${shortPay})가 ${longer}개 배수(${longPay})보다 크다. 긴 연속이 더 많이 줘야 한다`,
          ['paytable', symbolId, String(longer)],
        )
      }
    }

    // 지급 코인이 정수가 되도록 강제한다. 라운딩이 RTP를 위로 밀지 않게 하는 유일한 방법.
    for (const level of math.betLevels) {
      if (level % lineCount !== 0) continue
      const betPerLine = level / lineCount
      for (const count of counts) {
        const multiplier = payrule[count] ?? 0
        if (!Number.isInteger(betPerLine * multiplier)) {
          issue(
            `${symbolId} ${count}개: 베팅액 ${level}(라인당 ${betPerLine}) x 배수 ${multiplier} = ${betPerLine * multiplier}로 정수가 아니다`,
            ['paytable', symbolId, String(count)],
          )
        }
      }
    }
  }

  if (math.wild) {
    const targets = math.wild.substitutesFor === 'all' ? [] : math.wild.substitutesFor
    for (const id of [...targets, ...(math.wild.excludes ?? [])]) {
      if (!declared.has(id)) issue(`선언되지 않은 심볼: ${id}`, ['wild'])
    }
  }
})

export type GameMath = z.infer<typeof GameMathSchema>

/** 검증 실패 시 zod 에러를 그대로 던진다. math.json 로딩의 유일한 관문. */
export function parseGameMath(json: unknown): GameMath {
  return GameMathSchema.parse(json)
}

export function safeParseGameMath(json: unknown): z.ZodSafeParseResult<GameMath> {
  return GameMathSchema.safeParse(json)
}
