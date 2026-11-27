import { z } from 'zod'
import { MAX_FREE_SPINS_PER_ROUND } from './limits.js'
import { VOID_CELL, reelHeight, shapeCellCount } from './shape.js'

/**
 * 얼려 두기 프리스핀 설정(aurora-ice-palace). `scatter.freeSpins` 대신 쓰는 보너스다.
 *
 * 유료 판에서 스캐터가 `freeSpins.trigger`개 이상이면 `counts[개수]`회 프리스핀이 열린다(스캐터 배당은 그대로).
 * 프리스핀 판은 `freeStrips`로 멈추고, 당첨이 있으면 금액이 가장 큰 그림과 와일드 칸을 전부 얼린다.
 * 얼지 않은 칸만 `respinStrips`에서 칸마다 한 번씩 다시 뽑고, 새로 언 칸이 없거나 판이 다 차면 끝난다.
 * 얼린 칸 수를 `thresholds`·`bonus` 표에 대 총 베팅 배수를 구하고 오로라 배수를 곱해 한 번 더 준다.
 * 한 판에 `aurora.threshold`칸 이상 얼리면 오로라가 한 단계 오르고 **그 판 보너스부터** 오른 배수를 쓴다.
 */
export const FrostRespinSchema = z.object({
  freeSpins: z.object({
    /** 진입 스캐터 개수. */
    trigger: z.number().int().min(1),
    /** { 스캐터 개수: 프리스핀 횟수 }. 개수가 표보다 많으면 표의 가장 큰 개수를 쓴다. */
    counts: z.record(z.coerce.number().int().positive(), z.number().int().min(1)),
    /** 프리스핀 **착지 판** 스캐터 `trigger`개 이상이면 더하는 횟수. 0이면 리트리거 없음. */
    retrigger: z.number().int().min(0),
    /** 라운드 총 부여 상한. 넘는 리트리거는 잘라 `freeSpinsCapped`를 남긴다. */
    maxTotal: z.number().int().min(1),
  }),
  /** 프리스핀 착지 판 릴 스트립(릴별). 기본 `strips` 대신 쓴다. 프리스핀 응답의 `stops`는 이 스트립의 인덱스다. */
  freeStrips: z.array(z.array(z.string().min(1)).min(1)).min(1),
  /** 얼림 다시 돌리기 칸 스트립(릴별). 칸마다 독립으로 한 칸을 뽑는다. 스캐터 금지. */
  respinStrips: z.array(z.array(z.string().min(1)).min(2)).min(1),
  /** 한 판의 다시 돌리기 안전망. 구조상 최대(`칸 수 − 최소 얼림 칸 + 1`) 이상이어야 한다. */
  hardCap: z.number().int().min(1),
  /** 얼린 칸 수 눈금(오름차순). 보너스표의 열이다. */
  thresholds: z.array(z.number().int().min(1)).min(1),
  /** 등급별 그림 id. 와일드·스캐터가 아닌 배당 심볼은 정확히 한 등급에 속한다. */
  tiers: z.object({
    high: z.array(z.string().min(1)),
    mid: z.array(z.string().min(1)),
    low: z.array(z.string().min(1)),
  }),
  /** 등급별 보너스표(총 베팅액 배수, 오로라 곱하기 전). 길이 = thresholds 길이, 단조 증가. */
  bonus: z.object({
    high: z.array(z.number().nonnegative()),
    mid: z.array(z.number().nonnegative()),
    low: z.array(z.number().nonnegative()),
  }),
  aurora: z.object({
    /** 단계별 배수. 첫 값은 1, 단조 증가하는 정수. */
    ladder: z.array(z.number().int().min(1)).min(1),
    /** 한 판에 이만큼 이상 얼리면 한 단계 오른다. */
    threshold: z.number().int().min(1),
  }),
})
export type FrostRespinConfig = z.infer<typeof FrostRespinSchema>

/** `checkShape`·`checkFrostRespin`이 읽는 수학 모델 필드. 순환 import를 피하려고 구조만 받는다. */
interface ShapeCheckHost {
  reels: number
  rows: number
  reelHeights?: number[] | undefined
  symbols: { id: string; wild?: boolean | undefined; scatter?: boolean | undefined }[]
  groups?: Record<string, unknown> | undefined
  strips: string[][]
  paytable: Record<string, Record<number, number>>
  payModel?: string | undefined
  ways?: { from?: 'left' | 'center' | undefined; bothWays?: boolean | undefined } | undefined
  paylines: number[][]
  scatter?: { symbol: string; freeSpins?: unknown } | undefined
  round?: { maxWinCap: number } | undefined
  cascade?: unknown
  cluster?: unknown
  orderRound?: unknown
  coinRespin?: unknown
  boardBonus?: unknown
  stageRoulette?: unknown
  mutations?: unknown[] | undefined
  betLevels: number[]
  frostRespin?: FrostRespinConfig | undefined
}

type Issue = (message: string, path: (string | number)[]) => void

function isWholeCoin(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-9
}

/**
 * 릴별 높이(`reelHeights`)·가운데부터 지급(`ways.from: 'center'`) 정합성. `GameMathSchema`의 superRefine이 부른다.
 * 두 필드가 없는 팩은 `VOID_CELL` 이름 검사만 받는다(기존 팩은 해당 없음).
 */
export function checkShape(math: ShapeCheckHost, issue: Issue): void {
  math.symbols.forEach((symbol, index) => {
    if (symbol.id === VOID_CELL) issue(`${VOID_CELL}은 판 밖 표시라 심볼 id로 쓸 수 없다`, ['symbols', index, 'id'])
  })
  if (math.groups !== undefined && Object.prototype.hasOwnProperty.call(math.groups, VOID_CELL)) {
    issue(`${VOID_CELL}은 그룹 id로 쓸 수 없다`, ['groups'])
  }

  const heights = math.reelHeights
  if (heights !== undefined) {
    if (heights.length !== math.reels) issue(`reelHeights 길이(${heights.length})가 reels(${math.reels})와 다르다`, ['reelHeights'])
    heights.forEach((height, reel) => {
      if (height > math.rows) issue(`릴 ${reel} 높이(${height})가 rows(${math.rows})보다 크다`, ['reelHeights', reel])
    })
    if (Math.max(...heights) !== math.rows) issue(`rows(${math.rows})는 reelHeights 최댓값과 같아야 한다`, ['rows'])
    // 라인·클러스터·연쇄·뮤테이션은 직사각 판을 전제로 짜여 있다. 판 밖 칸을 지나는 경로를 막는다.
    if (math.payModel !== 'ways') issue("reelHeights 팩은 payModel이 'ways'여야 한다", ['payModel'])
    if (math.paylines.length > 0) issue('reelHeights 팩은 paylines를 둘 수 없다', ['paylines'])
    if (math.cascade !== undefined) issue('reelHeights 팩은 cascade를 둘 수 없다', ['cascade'])
    if ((math.mutations ?? []).length > 0) issue('reelHeights 팩은 mutations를 둘 수 없다', ['mutations'])
    if (math.coinRespin !== undefined) issue('reelHeights 팩은 coinRespin을 둘 수 없다', ['coinRespin'])
  }

  if (math.ways?.from === 'center') {
    const center = (math.reels - 1) >> 1
    if (math.payModel !== 'ways') issue("ways.from 'center'는 payModel 'ways'에서만 쓴다", ['ways', 'from'])
    if (math.reels % 2 !== 1) issue(`ways.from 'center'는 릴 수가 홀수여야 한다: ${math.reels}`, ['ways', 'from'])
    if (reelHeight(math, center) !== math.rows) {
      issue(`가운데 릴 높이(${reelHeight(math, center)})는 rows(${math.rows})와 같아야 한다`, ['reelHeights', center])
    }
    // 양방향과 섞이면 같은 줄을 두 번 준다.
    if (math.ways.bothWays === true) issue("ways.from 'center'와 bothWays는 함께 둘 수 없다", ['ways', 'bothWays'])
    // 지급 개수 = 줄 길이가 되려면 배당 개수가 최소값부터 reels까지 빈칸 없이 있어야 한다.
    for (const [key, payrule] of Object.entries(math.paytable)) {
      const counts = Object.keys(payrule)
        .map(Number)
        .filter((count) => (payrule[count] ?? 0) > 0)
        .sort((a, b) => a - b)
      const first = counts[0]
      if (first === undefined) continue
      for (let count = first; count <= math.reels; count += 1) {
        if ((payrule[count] ?? 0) <= 0) {
          issue(`${key}: 가운데부터 지급은 ${first}~${math.reels}개 배당이 빈칸 없이 있어야 한다 (${count}개 없음)`, ['paytable', key])
          break
        }
      }
    }
  }
}

/** 얼림 시작에 필요한 최소 칸 수. 가장 짧은 배당 개수(릴 1칸씩)다. */
function minimumFrozen(math: ShapeCheckHost): number {
  let least = Infinity
  for (const payrule of Object.values(math.paytable)) {
    for (const [raw, pay] of Object.entries(payrule)) if (pay > 0) least = Math.min(least, Number(raw))
  }
  return Number.isFinite(least) ? Math.max(1, least) : 1
}

/**
 * 프리스핀 착지 판 스캐터 개수 ≥ trigger 확률의 마르코프 상한 `Σ_r h_r·q_r / trigger`.
 * `retrigger x 이 값 < 1`이면 리트리거 기대 증가가 1판 미만이라 라운드가 짧게 끝난다(GAME_CATALOG §4 규칙 1).
 */
export function frostRetriggerBound(math: ShapeCheckHost, config: FrostRespinConfig): number {
  const scatter = math.scatter?.symbol
  if (scatter === undefined) return 0
  let expected = 0
  config.freeStrips.forEach((strip, reel) => {
    const q = strip.filter((id) => id === scatter).length / Math.max(1, strip.length)
    expected += reelHeight(math, reel) * q
  })
  return expected / config.freeSpins.trigger
}

/**
 * 얼려 두기 프리스핀 정합성 검사. 종료 보장(GAME_CATALOG §4 규칙 1~3), 정수 지급, 다른 보너스와의 동시 사용 금지.
 */
export function checkFrostRespin(math: ShapeCheckHost, issue: Issue): void {
  const config = math.frostRespin
  if (config === undefined) return
  const at = (...path: (string | number)[]): (string | number)[] => ['frostRespin', ...path]
  const declared = new Map(math.symbols.map((symbol) => [symbol.id, symbol]))
  const cells = shapeCellCount(math)

  if (math.scatter === undefined) issue('얼려 두기 프리스핀은 스캐터로 열린다. scatter 설정이 필요하다', at())
  if (math.scatter?.freeSpins !== undefined) issue('frostRespin과 scatter.freeSpins는 함께 둘 수 없다', at())
  for (const key of ['cascade', 'cluster', 'orderRound', 'coinRespin', 'boardBonus', 'stageRoulette'] as const) {
    if (math[key] !== undefined) issue(`frostRespin과 ${key}는 함께 둘 수 없다`, at())
  }
  if ((math.mutations ?? []).length > 0) issue('frostRespin 팩은 mutations를 둘 수 없다', at())
  if (math.round === undefined) issue('frostRespin 팩은 round.maxWinCap이 필요하다', ['round'])

  const fs = config.freeSpins
  if (fs.trigger > cells) issue(`트리거 ${fs.trigger}개가 판 칸 수(${cells})보다 많다`, at('freeSpins', 'trigger'))
  if (fs.maxTotal > MAX_FREE_SPINS_PER_ROUND) issue(`maxTotal(${fs.maxTotal})이 상한 ${MAX_FREE_SPINS_PER_ROUND}을 넘는다`, at('freeSpins', 'maxTotal'))
  const countKeys = Object.keys(fs.counts).map(Number).sort((a, b) => a - b)
  if (countKeys.length === 0) issue('freeSpins.counts가 비었다', at('freeSpins', 'counts'))
  if (countKeys[0] !== undefined && countKeys[0] !== fs.trigger) {
    issue(`counts의 가장 작은 개수(${countKeys[0]})는 trigger(${fs.trigger})와 같아야 한다`, at('freeSpins', 'counts'))
  }
  for (const key of countKeys) {
    if ((fs.counts[key] ?? 0) > fs.maxTotal) issue(`counts[${key}]가 maxTotal(${fs.maxTotal})보다 크다`, at('freeSpins', 'counts', key))
  }

  const checkStrips = (name: 'freeStrips' | 'respinStrips'): void => {
    const strips = config[name]
    if (strips.length !== math.reels) issue(`${name} 개수(${strips.length})가 reels(${math.reels})와 다르다`, at(name))
    strips.forEach((strip, reel) => {
      if (name === 'freeStrips' && strip.length < reelHeight(math, reel)) {
        issue(`릴 ${reel} ${name} 길이(${strip.length})가 릴 높이보다 짧다`, at(name, reel))
      }
      strip.forEach((id, index) => {
        const symbol = declared.get(id)
        if (symbol === undefined) issue(`선언되지 않은 심볼: ${id}`, at(name, reel, index))
        else if (name === 'respinStrips' && symbol.scatter === true) {
          issue(`다시 돌리기 칸 스트립에 스캐터 ${id}를 둘 수 없다`, at(name, reel, index))
        }
      })
    })
  }
  checkStrips('freeStrips')
  checkStrips('respinStrips')

  const least = minimumFrozen(math)
  const longest = cells - least + 1
  if (config.hardCap < longest) issue(`hardCap(${config.hardCap})이 구조상 최대 다시 돌리기(${longest})보다 작다`, at('hardCap'))

  const thresholds = config.thresholds
  thresholds.forEach((value, index) => {
    if (index > 0 && value <= (thresholds[index - 1] ?? 0)) issue('thresholds는 순증가여야 한다', at('thresholds', index))
    if (value > cells) issue(`눈금 ${value}이 판 칸 수(${cells})보다 크다`, at('thresholds', index))
  })

  const tierOf = new Map<string, string>()
  for (const tier of ['high', 'mid', 'low'] as const) {
    config.tiers[tier].forEach((id, index) => {
      const symbol = declared.get(id)
      if (symbol === undefined) issue(`선언되지 않은 심볼: ${id}`, at('tiers', tier, index))
      else if (symbol.wild === true || symbol.scatter === true) issue(`와일드·스캐터 ${id}는 등급에 넣지 않는다`, at('tiers', tier, index))
      if (tierOf.has(id)) issue(`${id}가 두 등급(${tierOf.get(id)}, ${tier})에 있다`, at('tiers', tier, index))
      tierOf.set(id, tier)
    })
    const table = config.bonus[tier]
    if (table.length !== thresholds.length) {
      issue(`bonus.${tier} 길이(${table.length})가 thresholds 길이(${thresholds.length})와 다르다`, at('bonus', tier))
    }
    table.forEach((value, index) => {
      if (index > 0 && value < (table[index - 1] ?? 0)) issue(`bonus.${tier}는 단조 증가여야 한다`, at('bonus', tier, index))
      for (const level of math.betLevels) {
        if (!isWholeCoin(level * value)) {
          issue(`보너스 x${value}: 총 베팅액 ${level}에서 ${level * value}로 정수가 아니다`, at('bonus', tier, index))
        }
      }
    })
  }
  for (const symbol of math.symbols) {
    if (symbol.wild === true || symbol.scatter === true) continue
    if (math.paytable[symbol.id] === undefined) continue
    if (!tierOf.has(symbol.id)) issue(`배당 심볼 ${symbol.id}가 어느 등급에도 없다`, at('tiers'))
  }

  const ladder = config.aurora.ladder
  if (ladder[0] !== 1) issue('aurora.ladder 첫 값은 1이어야 한다', at('aurora', 'ladder', 0))
  ladder.forEach((value, index) => {
    if (index > 0 && value < (ladder[index - 1] ?? 0)) issue('aurora.ladder는 단조 증가여야 한다', at('aurora', 'ladder', index))
  })
  if (config.aurora.threshold > cells) issue(`aurora.threshold(${config.aurora.threshold})가 판 칸 수보다 크다`, at('aurora', 'threshold'))

  if (fs.retrigger > 0) {
    const bound = frostRetriggerBound(math, config)
    if (fs.retrigger * bound >= 1) {
      issue(`retrigger x P상한(${(fs.retrigger * bound).toFixed(4)})이 1 이상이다. freeStrips의 스캐터를 줄일 것`, at('freeStrips'))
    }
  }
}
