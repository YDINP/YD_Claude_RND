import { z } from 'zod'

/** 씨앗 표 1행. `tier`는 `seedTiers` 인덱스, `-1`은 «씨앗 없음». 가중치는 정수(추첨 확률이 정확하다). */
export const GardenSeedEntrySchema = z.object({
  tier: z.number().int().min(-1),
  weight: z.number().int().positive(),
})
export type GardenSeedEntry = z.infer<typeof GardenSeedEntrySchema>

/**
 * 자라는 정원(growBoard). `cascade`·`orderRound`·`scatter.freeSpins` 대신 쓰는 형태다.
 *
 * 물리 판은 `maxSize × maxSize`(= reels = rows)이고 활성 영역은 `startSize`에서 시작한다.
 * 한 스핀에 터진 칸이 `thresholds[k]`에 닿으면 한 겹씩 자라고(최대 `maxSize`), 새 칸마다 씨앗을 한 번 뽑는다.
 * 씨앗은 판이 자랄 때마다 한 등급씩 커지고, 씨앗이 든 칸이 당첨 클러스터에 끼면 그 클러스터에 씨앗 값의 합을 곱한다.
 * 스캐터 `bonus.trigger`개 이상이면 정원 프리스핀 — 판 크기·막대·씨앗이 스핀 사이에 남는다.
 * 기획서 `docs/PLAN_greenhouse-garden.md` §3·§6-3.
 */
export const GrowBoardSchema = z.object({
  startSize: z.literal(4),
  maxSize: z.literal(8),
  /** 누적 터진 칸 문턱 4개(오름차순). k번째를 넘으면 (4+k+1)×(4+k+1)로 자란다. */
  thresholds: z.array(z.number().int().positive()).length(4),
  /** 한 스핀 팝 단계 상한. */
  maxCascades: z.number().int().min(1).max(20),
  /** 씨앗 등급 값(오름차순). 예: [2, 3, 5, 10, 20]. */
  seedTiers: z.array(z.number().int().min(2)).min(1).max(8),
  /** 기본 게임 씨앗 표. */
  seedTable: z.array(GardenSeedEntrySchema).min(1),
  /** 클러스터 하나의 씨앗 합 상한. */
  clusterSeedCap: z.number().int().min(1),
  /** 판 위 씨앗 최대 수. 넘는 추첨은 «없음»으로 친다(RNG 호출 수는 그대로). */
  maxSeeds: z.number().int().min(1).max(48),
  bonus: z.object({
    /** 스핀이 끝난 활성 판에서 이만큼 스캐터가 보이면 정원 프리스핀. */
    trigger: z.number().int().min(1),
    /** { 스캐터 개수: 스핀 수 }. 개수 이하 최대 키를 고른다. */
    spinsByCount: z.record(z.coerce.number().int().positive(), z.number().int().min(1)),
    /** 프리스핀 시작 판 한 변 하한(진입 스핀이 더 작게 끝났으면 범위만 올린다, RNG 0회). */
    minStartSize: z.number().int().min(4).max(8),
    retriggerSpins: z.number().int().min(1),
    maxRetriggers: z.number().int().min(0),
    /** 프리스핀 씨앗 표. */
    seedTable: z.array(GardenSeedEntrySchema).min(1),
    /** 8×8 뒤 터진 칸 이만큼마다 햇살. */
    sunEvery: z.number().int().min(1),
    /** 햇살 1회에 심는 새 씨앗 수(가장 작은 등급). */
    sunPlant: z.number().int().min(0),
    /** 한 스핀 최대 햇살 수(넘친 막대는 다음 스핀에 이어서 센다). */
    maxSunsPerSpin: z.number().int().min(0),
    /** 프리스핀 지급 합(진입 스핀 제외) 최저 보장. 총 베팅액 배수. */
    minRoundPay: z.number().min(0),
    /** 프리스핀 전용 문턱. 없으면 `thresholds`. */
    thresholds: z.array(z.number().int().positive()).length(4).optional(),
    /** 프리스핀 전용 스트립(릴별 길이는 기본 스트립과 같아야 한다). 없으면 `strips`. */
    strips: z.array(z.array(z.string().min(1)).min(1)).optional(),
  }),
})
export type GrowBoardConfig = z.infer<typeof GrowBoardSchema>

/** `checkGrowBoard`가 읽는 수학 모델 필드. 순환 import를 피하려고 구조만 받는다. */
interface GrowBoardHost {
  reels: number
  rows: number
  symbols: { id: string; wild?: boolean; scatter?: boolean }[]
  strips: string[][]
  payModel?: string
  cluster?: unknown
  cascade?: unknown
  orderRound?: unknown
  coinRespin?: unknown
  boardBonus?: unknown
  stageRoulette?: unknown
  ways?: unknown
  paylines: unknown[]
  mutations?: unknown[]
  scatter?: { symbol: string; freeSpins?: unknown; pays?: Record<number, number> }
  round?: { maxWinCap: number }
  betLevels: number[]
  growBoard?: GrowBoardConfig
}

/** 한 스핀 한 열에서 리필이 읽을 수 있는 최대 칸 수 + 창 = 스트립 최소 길이. 리필이 창(덮인 화분 포함)과 겹치지 않는다. */
export function gardenMinStripLength(config: GrowBoardConfig): number {
  return config.maxSize + config.maxCascades * config.maxSize
}

/** 정원 프리스핀 최장 길이(리트리거 상한까지). */
export function gardenMaxSpins(config: GrowBoardConfig): number {
  const most = Math.max(...Object.values(config.bonus.spinsByCount))
  return most + config.bonus.retriggerSpins * config.bonus.maxRetriggers
}

function ascending(values: readonly number[]): boolean {
  for (let i = 1; i < values.length; i += 1) if ((values[i] as number) <= (values[i - 1] as number)) return false
  return true
}

/**
 * 자라는 정원 정합성 검사. `GameMathSchema`의 superRefine이 부른다.
 * 종료 보장(GAME_CATALOG §4)과 리필·창 비겹침(provably fair 재생), 다른 보너스와의 동시 사용 금지를 여기서 막는다.
 */
export function checkGrowBoard(math: GrowBoardHost, issue: (message: string, path: (string | number)[]) => void): void {
  const config = math.growBoard
  if (config === undefined) return
  const at = (...path: (string | number)[]): (string | number)[] => ['growBoard', ...path]

  if (math.payModel !== 'cluster') issue("growBoard는 payModel 'cluster' 전용이다", at())
  if (math.cluster === undefined) issue('growBoard에는 cluster 설정이 필요하다', ['cluster'])
  for (const [key, label] of [
    ['cascade', 'cascade'],
    ['orderRound', 'orderRound'],
    ['coinRespin', 'coinRespin'],
    ['boardBonus', 'boardBonus'],
    ['stageRoulette', 'stageRoulette'],
    ['ways', 'ways'],
  ] as const) {
    if (math[key] !== undefined) issue(`growBoard와 ${label}는 함께 둘 수 없다`, at())
  }
  if (math.paylines.length > 0) issue('growBoard 팩은 paylines를 두지 않는다', at())
  if ((math.mutations ?? []).length > 0) issue('growBoard 팩은 mutations를 둘 수 없다', at())
  if (math.scatter === undefined) issue('정원 프리스핀은 스캐터로 열린다. scatter 설정이 필요하다', at())
  if (math.scatter?.freeSpins !== undefined) issue('growBoard와 scatter.freeSpins는 함께 둘 수 없다', at())
  if (math.round === undefined) issue('growBoard 팩은 round.maxWinCap이 필요하다', ['round'])
  if (math.reels !== config.maxSize || math.rows !== config.maxSize) {
    issue(`growBoard 팩은 reels = rows = maxSize(${config.maxSize})여야 한다`, at('maxSize'))
  }

  if (!ascending(config.thresholds)) issue('thresholds는 오름차순이어야 한다', at('thresholds'))
  if (config.bonus.thresholds !== undefined && !ascending(config.bonus.thresholds)) {
    issue('bonus.thresholds는 오름차순이어야 한다', at('bonus', 'thresholds'))
  }
  if (!ascending(config.seedTiers)) issue('seedTiers는 오름차순이어야 한다', at('seedTiers'))

  const checkTable = (table: readonly GardenSeedEntry[], path: (string | number)[]): void => {
    const seen = new Set<number>()
    table.forEach((row, index) => {
      if (row.tier >= config.seedTiers.length) {
        issue(`씨앗 등급 ${row.tier}이 seedTiers 길이(${config.seedTiers.length}) 밖이다`, [...path, index, 'tier'])
      }
      if (seen.has(row.tier)) issue(`씨앗 표 등급 중복: ${row.tier}`, [...path, index, 'tier'])
      seen.add(row.tier)
    })
  }
  checkTable(config.seedTable, at('seedTable'))
  checkTable(config.bonus.seedTable, at('bonus', 'seedTable'))

  const needed = gardenMinStripLength(config)
  math.strips.forEach((strip, reel) => {
    if (strip.length < needed) {
      issue(`릴 ${reel} 스트립 길이(${strip.length})가 maxSize + maxCascades × maxSize = ${needed}보다 짧다. 리필이 덮인 화분과 겹칠 수 있다`, ['strips', reel])
    }
  })
  const bonusStrips = config.bonus.strips
  if (bonusStrips !== undefined) {
    const declared = new Set(math.symbols.map((symbol) => symbol.id))
    if (bonusStrips.length !== math.reels) {
      issue(`bonus.strips 개수(${bonusStrips.length})가 reels(${math.reels})와 다르다`, at('bonus', 'strips'))
    }
    bonusStrips.forEach((strip, reel) => {
      // 릴 정지는 기본 스트립 길이로 뽑는다. 길이가 같아야 프리스핀 정지 분포가 균등하다.
      if (strip.length !== math.strips[reel]?.length) {
        issue(`bonus.strips 릴 ${reel} 길이(${strip.length})가 기본 스트립 길이(${math.strips[reel]?.length})와 다르다`, at('bonus', 'strips', reel))
      }
      strip.forEach((id, index) => {
        if (!declared.has(id)) issue(`선언되지 않은 심볼: ${id}`, at('bonus', 'strips', reel, index))
      })
    })
  }

  const scatter = math.scatter
  if (scatter !== undefined) {
    const symbol = math.symbols.find((s) => s.id === scatter.symbol)
    if (symbol?.scatter !== true) issue(`scatter.symbol ${scatter.symbol}이 scatter 심볼이 아니다`, ['scatter', 'symbol'])
  }
  const counts = Object.keys(config.bonus.spinsByCount).map(Number)
  if (!counts.includes(config.bonus.trigger)) {
    issue(`spinsByCount에 trigger(${config.bonus.trigger})개 행이 없다`, at('bonus', 'spinsByCount'))
  }
  if (config.bonus.trigger > config.startSize * config.startSize) {
    issue(`trigger ${config.bonus.trigger}개가 시작 판 칸 수보다 많다`, at('bonus', 'trigger'))
  }
  if (gardenMaxSpins(config) > 40) issue(`최장 프리스핀 ${gardenMaxSpins(config)}스핀이 상한 40을 넘는다`, at('bonus'))

  for (const level of math.betLevels) {
    if (Math.abs(level * config.bonus.minRoundPay - Math.round(level * config.bonus.minRoundPay)) > 1e-9) {
      issue(`총 베팅액 ${level} x 최저 보장 ${config.bonus.minRoundPay}가 정수가 아니다`, at('bonus', 'minRoundPay'))
    }
  }
}
