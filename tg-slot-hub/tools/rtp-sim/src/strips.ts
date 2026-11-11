/**
 * 튜닝 도구. 밀도표로 릴 스트립을 만들고, 페이테이블·상품을 선형 배율로 조정한다.
 * 결과는 정해진 시드에서 항상 같다. `tune-cli.ts`가 쓴다.
 */
import { createSeededRng } from '@tgslot/slot-engine'
import type { GameMath, Rng, SymbolId } from '@tgslot/slot-engine'

/** 스트립 하나의 최소 길이(계획 §3 M1). */
export const MIN_STRIP_LENGTH = 100

/** 배당 눈금. 최소 베팅 20에서 1코인이 되는 값이다. */
export const PAY_GRID = 0.05

export interface DensityTable {
  /** 릴마다 심볼 개수. 객체 하나면 모든 릴에 같은 표를 쓴다. 합이 스트립 길이다. */
  reels: Record<SymbolId, number>[] | Record<SymbolId, number>
  /** 직전 칸과 같은 심볼을 한 번 더 놓을 확률(0~1). 뭉침이 클수록 세로 클러스터와 연쇄가 잦아진다. */
  clump?: number
  /** 심볼별 뭉침 확률. `clump`보다 우선한다. */
  clumpBy?: Record<SymbolId, number>
  /**
   * 고르게 흩어 놓을 심볼과 같은 심볼끼리의 최소 간격. 기본은 와일드·스캐터에 행 수.
   * 이 심볼들은 뭉치지 않는다.
   */
  spacing?: Record<SymbolId, number>
  /**
   * 구역 뭉침. 스트립을 `size`칸 구역으로 나누고 구역마다 주 심볼 하나를 남은 개수에 비례해 고른다.
   * 각 칸은 `bias` 확률로 그 주 심볼을 놓는다. 창(행 수)보다 긴 상관을 만들어
   * 클러스터가 터진 릴 위에서 같은 심볼이 다시 떨어지게 한다(연쇄 지속).
   */
  zone?: { size: number; bias: number }
}

function reelTables(math: GameMath, table: DensityTable): Record<SymbolId, number>[] {
  const reels = Array.isArray(table.reels) ? table.reels : Array.from({ length: math.reels }, () => table.reels)
  if (reels.length !== math.reels) throw new RangeError(`밀도표 릴 수(${reels.length})가 reels(${math.reels})와 다르다`)
  const known = new Set(math.symbols.map((symbol) => symbol.id))
  for (const [index, counts] of reels.entries()) {
    for (const [symbol, count] of Object.entries(counts as Record<SymbolId, number>)) {
      if (!known.has(symbol)) throw new RangeError(`릴 ${index}: 모르는 심볼 ${symbol}`)
      if (!Number.isInteger(count) || count < 0) throw new RangeError(`릴 ${index}: ${symbol} 개수(${count})가 0 이상 정수가 아니다`)
    }
  }
  return reels as Record<SymbolId, number>[]
}

function defaultSpacing(math: GameMath): Record<SymbolId, number> {
  const spacing: Record<SymbolId, number> = {}
  for (const symbol of math.symbols) if (symbol.wild === true || symbol.scatter === true) spacing[symbol.id] = math.rows
  return spacing
}

function pickByCount(counts: Map<SymbolId, number>, rng: Rng): SymbolId {
  const keys = [...counts.keys()].sort()
  let total = 0
  for (const key of keys) total += counts.get(key) ?? 0
  let roll = rng.nextInt(total)
  for (const key of keys) {
    const count = counts.get(key) ?? 0
    if (roll < count) return key
    roll -= count
  }
  throw new RangeError('남은 심볼이 없다')
}

/**
 * 릴 하나. 흩어 놓을 심볼을 먼저 고른 간격으로 박고, 나머지 칸을 앞에서부터 채운다.
 * 각 칸은 `clump` 확률로 직전 심볼을 잇고, 아니면 남은 개수에 비례해 뽑는다(뭉침 0이면 균등 셔플과 같다).
 */
function buildReel(
  counts: Record<SymbolId, number>,
  spacing: Record<SymbolId, number>,
  table: DensityTable,
  rng: Rng,
): SymbolId[] {
  const length = Object.values(counts).reduce((sum, count) => sum + count, 0)
  if (length < 1) throw new RangeError('스트립 길이가 0이다')
  const strip: (SymbolId | null)[] = new Array<SymbolId | null>(length).fill(null)

  for (const symbol of Object.keys(spacing).sort()) {
    const count = counts[symbol] ?? 0
    if (count === 0) continue
    const gap = length / count
    const minGap = spacing[symbol] ?? 1
    if (gap < minGap) throw new RangeError(`${symbol} ${count}개는 길이 ${length}에서 간격 ${minGap}을 지킬 수 없다`)
    const offset = rng.nextInt(length)
    for (let i = 0; i < count; i += 1) {
      let at = (offset + Math.round(i * gap)) % length
      while (strip[at] !== null) at = (at + 1) % length
      strip[at] = symbol
    }
  }

  const left = new Map<SymbolId, number>()
  for (const [symbol, count] of Object.entries(counts)) {
    if (spacing[symbol] === undefined && count > 0) left.set(symbol, count)
  }
  const chance = (probability: number): boolean => probability > 0 && rng.nextInt(1_000_000) < probability * 1_000_000
  let previous: SymbolId | null = null
  let dominant: SymbolId | null = null
  for (let at = 0; at < length; at += 1) {
    if (table.zone !== undefined && at % table.zone.size === 0) dominant = left.size > 0 ? pickByCount(left, rng) : null
    const fixed = strip[at]
    if (fixed !== null && fixed !== undefined) {
      previous = null
      continue
    }
    const clump = previous === null ? 0 : (table.clumpBy?.[previous] ?? table.clump ?? 0)
    let symbol: SymbolId
    if (previous !== null && (left.get(previous) ?? 0) > 0 && chance(clump)) {
      symbol = previous
    } else if (dominant !== null && (left.get(dominant) ?? 0) > 0 && chance(table.zone?.bias ?? 0)) {
      symbol = dominant
    } else {
      symbol = pickByCount(left, rng)
    }
    const remaining = (left.get(symbol) ?? 0) - 1
    if (remaining > 0) left.set(symbol, remaining)
    else left.delete(symbol)
    strip[at] = symbol
    previous = symbol
  }
  return strip as SymbolId[]
}

/** 밀도표와 시드로 스트립 전부를 만든다. 릴 i의 RNG 시드는 `${seed}:reel-${i}`. */
export function generateStrips(math: GameMath, table: DensityTable, seed: string | number): SymbolId[][] {
  const spacing = { ...defaultSpacing(math), ...(table.spacing ?? {}) }
  return reelTables(math, table).map((counts, reel) =>
    buildReel(counts, spacing, table, createSeededRng(`${String(seed)}:reel-${reel}`)),
  )
}

/** 0.05 눈금으로 반올림. 0 아래로는 내리지 않고 가장 작은 눈금을 남긴다. */
export function snapToGrid(value: number, grid = PAY_GRID): number {
  const steps = Math.max(1, Math.round(value / grid))
  return Number((steps * grid).toFixed(10))
}

/** 기본 페이테이블에 선형 배율을 곱하고 눈금에 맞춘다. 스캐터 지급표는 건드리지 않는다. */
export function scalePaytable(math: GameMath, scale: number): GameMath['paytable'] {
  const next: GameMath['paytable'] = {}
  for (const [symbol, rule] of Object.entries(math.paytable)) {
    const scaled: Record<string, number> = {}
    for (const [count, value] of Object.entries(rule as Record<string, number>)) scaled[count] = snapToGrid(value * scale)
    next[symbol] = scaled as GameMath['paytable'][string]
  }
  return next
}

/** 주문 카드 상품에 선형 배율을 곱하고 눈금에 맞춘다. */
export function scalePrizes(math: GameMath, scale: number): NonNullable<GameMath['orderRound']>['pool'] {
  const pool = math.orderRound?.pool ?? []
  return pool.map((entry) => ({ ...entry, prize: snapToGrid(entry.prize * scale) }))
}

/** 스트립별 심볼 개수. 리포트·검증용. */
export function stripCounts(strips: readonly (readonly SymbolId[])[]): Record<SymbolId, number>[] {
  return strips.map((strip) => {
    const counts: Record<SymbolId, number> = {}
    for (const symbol of strip) counts[symbol] = (counts[symbol] ?? 0) + 1
    return counts
  })
}
