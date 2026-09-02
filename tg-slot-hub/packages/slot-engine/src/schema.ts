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

/**
 * 정지 그리드를 평가 **직전에** 변형하는 파이프라인. 선언된 순서대로 적용한다.
 *
 * RNG 소비 순서는 `릴 정지 -> 뮤테이션(선언 순서)`으로 고정한다.
 * provably fair 검증이 같은 시드로 같은 결과를 재현하려면 이 순서가 계약이다.
 */
export const MutationSchema = z.discriminatedUnion('type', [
  /** 미스터리 심볼을 가중 추첨한 심볼 하나로 **일괄** 교체한다. 스핀당 추첨 1회. */
  z.object({
    type: z.literal('mystery'),
    symbol: z.string().min(1),
    weights: z.record(z.string().min(1), z.number().positive()),
  }),
  /** 지정 릴에 와일드가 minCount개 이상이면 그 릴 전체를 와일드로 덮는다. */
  z.object({
    type: z.literal('expandWild'),
    symbol: z.string().min(1),
    /** 대상 릴 인덱스. 없으면 전 릴. */
    reels: z.array(z.number().int().min(0)).optional(),
    minCount: z.number().int().min(1).default(1),
    /** 스캐터 칸까지 덮을지. 기본은 덮지 않는다 (프리스핀 RTP가 흔들린다). */
    coverScatter: z.boolean().default(false),
    /** 확장 후 승리가 있을 때만 확장을 남긴다. */
    onlyIfWin: z.boolean().default(false),
  }),
  /** from 심볼이 화면에 minCount개 이상이면 to 심볼로 승급한다. */
  z.object({
    type: z.literal('upgrade'),
    from: z.string().min(1),
    to: z.string().min(1),
    minCount: z.number().int().min(1),
    /** 확률형으로 쓰려면 지정. 없으면 조건 충족 시 항상 승급. */
    chance: z.number().gt(0).max(1).optional(),
  }),
  /** 확률 chance로 와일드 k개를 빈 칸에 떨어뜨린다. k는 countWeights 가중 추첨. */
  z.object({
    type: z.literal('randomWild'),
    symbol: z.string().min(1),
    chance: z.number().gt(0).max(1),
    countWeights: z.record(z.coerce.number().int().positive(), z.number().positive()),
    reels: z.array(z.number().int().min(0)).optional(),
    coverScatter: z.boolean().default(false),
  }),
])
export type Mutation = z.infer<typeof MutationSchema>
export type MutationType = Mutation['type']

/**
 * ways 페이 모델 설정.
 *
 * 배당 기준은 **"웨이당 베팅액" = 총 베팅액 / betDivisor**다. 총 베팅액이 아니다.
 * 243 ways 게임의 5연속이 총 베팅액의 500배면 말이 안 되므로, 라인 게임의
 * "라인당 베팅액"에 해당하는 단위를 하나 둔다. 업계 관례대로 기본값은 25다.
 */
export const WaysConfigSchema = z.object({
  /** 경로 수. `rows^reels`와 같아야 한다 (5x3=243, 5x4=1024). refine이 강제한다. */
  base: z.number().int().min(2),
  /** 오른쪽에서 왼쪽으로도 평가한다. 전 릴 매칭은 한 번만 센다. */
  bothWays: z.boolean().default(false),
  betDivisor: z.number().int().positive().default(25),
})
export type WaysConfig = z.infer<typeof WaysConfigSchema>

/**
 * 더블업(갬블) 설정. **엔진은 검증만 하고 추첨은 API가 한다.**
 *
 * 승리 후 판돈을 걸어 `chance` 확률로 `payout`배가 되거나 전부 잃는다.
 * 기대값이 중립(`chance x payout = 1`)이면 RTP를 바꾸지 않고 분산만 키운다.
 */
export const GambleConfigSchema = z.object({
  type: z.literal('coin-flip'),
  /** 한 단계 성공 확률. 0과 1 사이의 열린 구간. */
  chance: z.number().gt(0).lt(1),
  /** 성공 시 배수. 코인 플립은 2. */
  payout: z.number().gt(1),
  /** 연속 도전 상한. 여기 도달하면 자동 회수한다. */
  maxSteps: z.number().int().min(1).max(10),
  /** 자동 회수를 부르는 판돈 상한. **총 베팅액의 배수**다. */
  maxWinCap: z.number().gt(0).optional(),
})
export type GambleConfig = z.infer<typeof GambleConfigSchema>

const BaseGameMathSchema = z.object({
  id: z.string().min(1),
  reels: z.number().int().min(1),
  rows: z.number().int().min(1),
  symbols: z.array(SymbolDefSchema).min(1),
  /** 심볼 묶음 배당. 없으면 생략. */
  groups: z.record(z.string().min(1), SymbolGroupSchema).optional(),
  /** 릴별 스트립. strips.length === reels. */
  strips: z.array(z.array(z.string().min(1)).min(1)).min(1),
  /** 'lines'면 페이라인, 'ways'면 인접 카운트 곱. 없으면 'lines'. */
  payModel: z.enum(['lines', 'ways']).default('lines'),
  ways: WaysConfigSchema.optional(),
  /** 페이라인 1개 = 릴별 행 인덱스 배열. 예: [1,1,1]은 가운데 가로줄. ways 게임은 비운다. */
  paylines: z.array(z.array(z.number().int().min(0)).min(1)).default([]),
  /** 평가 직전에 그리드를 변형하는 파이프라인. 선언 순서대로 적용한다. */
  mutations: z.array(MutationSchema).optional(),
  /**
   * `심볼 id 또는 그룹 id` -> { 매치 개수: betPerLine 배수 }.
   * 왼쪽에서 오른쪽으로 연속 매치. 매치 개수 1은 릴 0만 맞으면 지급한다는 뜻이다.
   */
  paytable: z.record(z.string().min(1), PayruleSchema),
  wild: WildConfigSchema.optional(),
  scatter: ScatterConfigSchema.optional(),
  /** 더블업. 엔진은 검증만 하고 추첨은 API가 한다. */
  gamble: GambleConfigSchema.optional(),
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

  // ways 게임은 페이라인이 없고 배당 단위가 betDivisor다. 라인 게임은 라인 수가 단위다.
  if (math.payModel === 'ways') {
    if (math.ways === undefined) {
      issue("payModel이 'ways'면 ways 설정이 필요하다", ['ways'])
    } else {
      const expected = math.rows ** math.reels
      if (math.ways.base !== expected) {
        issue(`ways.base(${math.ways.base})가 rows^reels(${expected})와 다르다`, ['ways', 'base'])
      }
    }
    if (math.paylines.length > 0) {
      issue('ways 게임은 paylines를 두지 않는다', ['paylines'])
    }
  } else if (math.paylines.length === 0) {
    issue("payModel이 'lines'면 paylines가 최소 1개 필요하다", ['paylines'])
  }

  const unitCount = math.payModel === 'ways' ? (math.ways?.betDivisor ?? 25) : math.paylines.length
  const unitLabel = math.payModel === 'ways' ? 'betDivisor' : '라인 수'
  if (unitCount > 0) {
    math.betLevels.forEach((level, index) => {
      if (level % unitCount !== 0) {
        issue(`베팅액 ${level}이 ${unitLabel}(${unitCount})로 나누어떨어지지 않는다`, ['betLevels', index])
      }
    })
  }
  const lineCount = unitCount

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

  const declaredIds = new Set(declared.keys())
  const cellCount = math.reels * math.rows
  ;(math.mutations ?? []).forEach((mutation, index) => {
    const at = (field: string): (string | number)[] => ['mutations', index, field]
    const requireSymbol = (id: string, field: string): void => {
      if (!declaredIds.has(id)) issue(`선언되지 않은 심볼: ${id}`, at(field))
      else if (!onStrip.has(id)) issue(`어느 스트립에도 없는 심볼: ${id}`, at(field))
    }
    const requireReels = (reels: number[] | undefined): void => {
      for (const reel of reels ?? []) {
        if (reel >= math.reels) issue(`릴 인덱스 ${reel}이 reels(${math.reels}) 범위를 벗어났다`, at('reels'))
      }
    }

    switch (mutation.type) {
      case 'mystery': {
        requireSymbol(mutation.symbol, 'symbol')
        // 미스터리 심볼 자체는 배당이 없다. 공개된 뒤의 심볼로만 지급한다.
        if (math.paytable[mutation.symbol] !== undefined) {
          issue(`미스터리 심볼 ${mutation.symbol}은 페이테이블을 가질 수 없다`, at('symbol'))
        }
        // 스캐터가 공개로 사라지면 트리거 확률이, 와일드면 대체 규칙이 스핀마다 흔들린다.
        const placeholder = declared.get(mutation.symbol)
        if (placeholder?.scatter === true) {
          issue(`스캐터 ${mutation.symbol}은 미스터리 심볼이 될 수 없다`, at('symbol'))
        }
        if (placeholder?.wild === true) {
          issue(`와일드 ${mutation.symbol}은 미스터리 심볼이 될 수 없다`, at('symbol'))
        }
        const entries = Object.entries(mutation.weights)
        if (entries.length === 0) issue('공개 가중 표가 비었다', at('weights'))
        for (const [id] of entries) {
          const target = declared.get(id)
          if (target === undefined) {
            issue(`선언되지 않은 심볼: ${id}`, at('weights'))
            continue
          }
          // 공개 후 스캐터가 늘면 프리스핀 트리거가 흔들린다. 와일드도 같은 이유로 뺀다.
          if (target.scatter === true) issue(`스캐터 ${id}는 공개 풀에 넣을 수 없다`, at('weights'))
          if (target.wild === true) issue(`와일드 ${id}는 공개 풀에 넣을 수 없다`, at('weights'))
          if (math.paytable[id] === undefined) {
            issue(`공개 풀 심볼 ${id}에 페이테이블이 없다`, at('weights'))
          }
        }
        break
      }
      case 'expandWild': {
        requireSymbol(mutation.symbol, 'symbol')
        if (declared.get(mutation.symbol)?.wild !== true) {
          issue(`${mutation.symbol}에 wild: true가 없다`, at('symbol'))
        }
        requireReels(mutation.reels)
        if (mutation.minCount > math.rows) {
          issue(`minCount(${mutation.minCount})가 rows(${math.rows})보다 크다`, at('minCount'))
        }
        break
      }
      case 'upgrade': {
        requireSymbol(mutation.from, 'from')
        requireSymbol(mutation.to, 'to')
        if (mutation.from === mutation.to) issue('from과 to가 같다', at('to'))
        if (mutation.minCount > cellCount) {
          issue(`minCount(${mutation.minCount})가 화면 칸 수(${cellCount})보다 많다`, at('minCount'))
        }
        break
      }
      case 'randomWild': {
        requireSymbol(mutation.symbol, 'symbol')
        if (declared.get(mutation.symbol)?.wild !== true) {
          issue(`${mutation.symbol}에 wild: true가 없다`, at('symbol'))
        }
        requireReels(mutation.reels)
        const counts = Object.keys(mutation.countWeights).map(Number)
        if (counts.length === 0) issue('개수 가중 표가 비었다', at('countWeights'))
        for (const count of counts) {
          if (count > cellCount) {
            issue(`드롭 개수 ${count}가 화면 칸 수(${cellCount})보다 많다`, at('countWeights'))
          }
        }
        break
      }
    }
  })

  // 두 뮤테이션이 같은 심볼을 **읽으면** 결과가 선언 순서에 통째로 좌우된다.
  // (예: q를 공개하는 미스터리 둘, 또는 q를 승급시키면서 동시에 공개하는 조합)
  // 앞 단계가 그 심볼을 화면에서 지워 버리므로 뒤 단계는 사실상 죽은 규칙이 되고,
  // 해석적 RTP도 어느 쪽을 기준으로 삼아야 할지 정할 수 없다. 그래서 막는다.
  // randomWild의 symbol은 **놓는** 심볼이라 읽기 대상이 아니다.
  // 랜덤 와일드로 뿌린 뒤 확장 와일드로 늘리는 조합은 의도된 설계라 허용한다.
  const mutationSources = new Map<string, number>()
  ;(math.mutations ?? []).forEach((mutation, index) => {
    const source =
      mutation.type === 'upgrade'
        ? mutation.from
        : mutation.type === 'randomWild'
          ? undefined
          : mutation.symbol
    if (source === undefined) return
    const first = mutationSources.get(source)
    if (first !== undefined) {
      issue(
        `뮤테이션 ${first}과 ${index}가 같은 심볼(${source})을 읽는다. 순서에 따라 결과가 달라진다`,
        ['mutations', index],
      )
      return
    }
    mutationSources.set(source, index)
  })

  if (math.gamble) {
    // 기대값이 1을 넘으면 갬블만 반복해 하우스 엣지가 사라진다.
    const expected = math.gamble.chance * math.gamble.payout
    if (expected > 1 + 1e-9) {
      issue(
        `갬블 기대값(${expected})이 1을 넘는다. chance x payout <= 1 이어야 한다`,
        ['gamble', 'payout'],
      )
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
