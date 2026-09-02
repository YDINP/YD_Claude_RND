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

/**
 * 심볼 묶음. "아무 BAR"처럼 종류가 섞여도 지급하는 배당을 위한 것이다.
 * 페이테이블에서 그룹 id를 심볼 id와 같은 자리에 쓴다.
 */
export const SymbolGroupSchema = z.object({
  name: SymbolNameSchema,
  members: z.array(z.string().min(1)).min(2),
})
export type SymbolGroup = z.infer<typeof SymbolGroupSchema>

export const WildConfigSchema = z.object({
  /** 'all'이면 스캐터와 다른 와일드를 제외한 모든 심볼을 대체한다. */
  substitutesFor: z.union([z.literal('all'), z.array(z.string().min(1))]),
  excludes: z.array(z.string().min(1)).optional(),
})
export type WildConfig = z.infer<typeof WildConfigSchema>

/** { 매치 개수: betPerLine 배수 }. JSON 키는 문자열이므로 숫자로 강제 변환한다. */
export const PayruleSchema = z.record(z.coerce.number().int().positive(), z.number().nonnegative())

/**
 * 스캐터 설정. 스캐터는 페이라인과 무관하게 **화면에 보이는 칸 전부**를 센다.
 * 한 릴에 2개가 보이면 2개로 센다. 와일드는 스캐터를 대체하지 않는다.
 */
export const ScatterConfigSchema = z.object({
  symbol: z.string().min(1),
  /** { 개수: **총 베팅액** 배수 }. 라인당 베팅액이 아니다. */
  pays: z.record(z.coerce.number().int().positive(), z.number().nonnegative()).optional(),
  freeSpins: z
    .object({
      /** 프리스핀이 열리는 최소 스캐터 개수. */
      trigger: z.number().int().min(1),
      /** 한 번 열릴 때 부여되는 스핀 수. */
      count: z.number().int().min(1),
      /** 프리스핀 동안 승리에 곱하는 배수. */
      multiplier: z.number().min(1),
      /** 프리스핀 중 다시 트리거되면 스핀을 더 주는가. */
      retrigger: z.boolean(),
    })
    .optional(),
})
export type ScatterConfig = z.infer<typeof ScatterConfigSchema>

const BaseGameMathSchema = z.object({
  id: z.string().min(1),
  reels: z.number().int().min(1),
  rows: z.number().int().min(1),
  symbols: z.array(SymbolDefSchema).min(1),
  /** 심볼 묶음 배당. 없으면 생략. */
  groups: z.record(z.string().min(1), SymbolGroupSchema).optional(),
  /** 릴별 스트립. strips.length === reels. */
  strips: z.array(z.array(z.string().min(1)).min(1)).min(1),
  /** 페이라인 1개 = 릴별 행 인덱스 배열. 예: [1,1,1]은 가운데 가로줄. */
  paylines: z.array(z.array(z.number().int().min(0)).min(1)).min(1),
  /**
   * `심볼 id 또는 그룹 id` -> { 매치 개수: betPerLine 배수 }.
   * 왼쪽에서 오른쪽으로 연속 매치. 매치 개수 1은 릴 0만 맞으면 지급한다는 뜻이다.
   */
  paytable: z.record(z.string().min(1), PayruleSchema),
  wild: WildConfigSchema.optional(),
  scatter: ScatterConfigSchema.optional(),
  /** 총 베팅액(코인) 후보. 모두 paylines.length로 나누어떨어져야 한다. */
  betLevels: z.array(z.number().int().positive()).min(1),
  /** 기본 게임만의 목표 RTP. 잭팟 같은 허브 기여분은 포함하지 않는다. */
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

  const groups = math.groups ?? {}
  for (const [groupId, group] of Object.entries(groups)) {
    if (declared.has(groupId)) {
      issue(`그룹 id ${groupId}가 심볼 id와 겹친다`, ['groups', groupId])
    }
    const seenMembers = new Set<string>()
    group.members.forEach((memberId, index) => {
      const member = declared.get(memberId)
      if (member === undefined) {
        issue(`선언되지 않은 심볼: ${memberId}`, ['groups', groupId, 'members', index])
        return
      }
      if (member.scatter === true) {
        issue(`스캐터 ${memberId}는 그룹 멤버가 될 수 없다`, ['groups', groupId, 'members', index])
      }
      if (!onStrip.has(memberId)) {
        issue(`어느 스트립에도 없는 그룹 멤버: ${memberId}`, ['groups', groupId, 'members', index])
      }
      if (seenMembers.has(memberId)) {
        issue(`중복 그룹 멤버: ${memberId}`, ['groups', groupId, 'members', index])
      }
      seenMembers.add(memberId)
    })
  }

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

  for (const [key, payrule] of Object.entries(math.paytable)) {
    const symbol = declared.get(key)
    const isGroup = Object.prototype.hasOwnProperty.call(groups, key)
    if (symbol === undefined && !isGroup) {
      issue(`선언되지 않은 심볼/그룹의 페이테이블: ${key}`, ['paytable', key])
      continue
    }
    if (symbol !== undefined) {
      // 스캐터는 라인이 아니라 화면 전체로 세므로 페이라인 페이테이블을 가질 수 없다.
      if (symbol.scatter === true) {
        issue(`스캐터 ${key}는 페이라인 페이테이블을 가질 수 없다`, ['paytable', key])
      }
      if (!onStrip.has(key)) {
        issue(`어느 스트립에도 없는 심볼의 페이테이블: ${key}`, ['paytable', key])
      }
    }

    const counts = payruleCounts(payrule)
    for (const count of counts) {
      if (count < 1 || count > math.reels) {
        issue(`매치 개수 ${count}가 1..${math.reels} 범위를 벗어났다`, ['paytable', key, String(count)])
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
          `${key}: ${shorter}개 배수(${shortPay})가 ${longer}개 배수(${longPay})보다 크다. 긴 연속이 더 많이 줘야 한다`,
          ['paytable', key, String(longer)],
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
            `${key} ${count}개: 베팅액 ${level}(라인당 ${betPerLine}) x 배수 ${multiplier} = ${betPerLine * multiplier}로 정수가 아니다`,
            ['paytable', key, String(count)],
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

  if (math.scatter) {
    const cells = math.reels * math.rows
    const scatterSymbol = declared.get(math.scatter.symbol)
    if (scatterSymbol === undefined) {
      issue(`선언되지 않은 심볼: ${math.scatter.symbol}`, ['scatter', 'symbol'])
    } else {
      if (scatterSymbol.scatter !== true) {
        issue(`${math.scatter.symbol}에 scatter: true가 없다`, ['scatter', 'symbol'])
      }
      if (!onStrip.has(math.scatter.symbol)) {
        issue(`어느 스트립에도 없는 스캐터: ${math.scatter.symbol}`, ['scatter', 'symbol'])
      }
    }

    const pays = math.scatter.pays
    if (pays !== undefined) {
      const counts = payruleCounts(pays)
      for (const count of counts) {
        if (count < 1 || count > cells) {
          issue(`스캐터 개수 ${count}가 1..${cells} 범위를 벗어났다`, ['scatter', 'pays', String(count)])
        }
      }
      for (let i = 1; i < counts.length; i += 1) {
        const shorter = counts[i - 1]
        const longer = counts[i]
        if (shorter === undefined || longer === undefined) continue
        if ((pays[shorter] ?? 0) > (pays[longer] ?? 0)) {
          issue(
            `스캐터: ${shorter}개 배수가 ${longer}개 배수보다 크다. 많이 나올수록 많이 줘야 한다`,
            ['scatter', 'pays', String(longer)],
          )
        }
      }
      // 스캐터 배수는 **총 베팅액** 기준이다. 지급 코인이 정수가 되도록 강제한다.
      for (const level of math.betLevels) {
        for (const count of counts) {
          const multiplier = pays[count] ?? 0
          if (!Number.isInteger(level * multiplier)) {
            issue(
              `스캐터 ${count}개: 총 베팅액 ${level} x 배수 ${multiplier} = ${level * multiplier}로 정수가 아니다`,
              ['scatter', 'pays', String(count)],
            )
          }
        }
      }
    }

    const freeSpins = math.scatter.freeSpins
    if (freeSpins !== undefined && freeSpins.trigger > cells) {
      issue(`프리스핀 트리거 ${freeSpins.trigger}개가 화면 칸 수(${cells})보다 많다`, ['scatter', 'freeSpins', 'trigger'])
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
