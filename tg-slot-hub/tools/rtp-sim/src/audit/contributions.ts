import type { GameMath, WinLine } from '@tgslot/slot-engine'
import type { ContributionRow, CountContributionRow, LineContributionRow } from './types.js'

/** 스캐터 배당을 심볼 기여 표에 넣을 때 쓰는 키. 스캐터 심볼 id를 모를 때의 폴백. */
export const SCATTER_FALLBACK_KEY = 'scatter'

export interface Bucket {
  win: number
  hits: number
}

function bump(map: Map<string, Bucket>, key: string, win: number): void {
  const found = map.get(key)
  if (found === undefined) map.set(key, { win, hits: 1 })
  else {
    found.win += win
    found.hits += 1
  }
}

/**
 * 승리를 심볼·그룹·라인·매치 개수로 나눠 담는 통. 전수 조사와 표본 조사가 같은 통을 쓴다.
 * 담기는 값은 **실제 지급 코인**이라 어느 쪽이든 합계가 곧 지급 총액이다.
 */
export class Accumulators {
  readonly symbols = new Map<string, Bucket>()
  readonly groups = new Map<string, Bucket>()
  readonly counts = new Map<number, Bucket>()
  readonly lineWin: number[]
  readonly lineHits: number[]
  /** 담긴 지급 코인 총합. */
  total = 0
  /** 스캐터로 지급된 코인 총합. */
  scatterWin = 0
  /** 스캐터가 지급된 횟수. */
  scatterHits = 0

  constructor(private readonly math: GameMath) {
    this.lineWin = new Array<number>(math.paylines.length).fill(0)
    this.lineHits = new Array<number>(math.paylines.length).fill(0)
  }

  /**
   * 페이라인 승리 1건.
   * @param multiplier 프리스핀 배수. 유료 스핀은 1. `WinLine.win`은 배수 적용 전 값이다.
   */
  addLine(win: WinLine, multiplier: number): void {
    const paid = win.win * multiplier
    this.total += paid
    bump(this.symbols, win.symbol, paid)
    if (win.group !== undefined) bump(this.groups, win.group, paid)

    const found = this.counts.get(win.count)
    if (found === undefined) this.counts.set(win.count, { win: paid, hits: 1 })
    else {
      found.win += paid
      found.hits += 1
    }

    this.lineWin[win.line] = (this.lineWin[win.line] ?? 0) + paid
    this.lineHits[win.line] = (this.lineHits[win.line] ?? 0) + 1
  }

  /** 스캐터 승리 1건. 라인이 아니므로 라인 표에는 넣지 않고 심볼 표에만 넣는다. */
  addScatter(count: number, paidWin: number): void {
    if (paidWin <= 0) return
    this.total += paidWin
    this.scatterWin += paidWin
    this.scatterHits += 1
    bump(this.symbols, this.math.scatter?.symbol ?? SCATTER_FALLBACK_KEY, paidWin)

    const found = this.counts.get(count)
    if (found === undefined) this.counts.set(count, { win: paidWin, hits: 1 })
    else {
      found.win += paidWin
      found.hits += 1
    }
  }
}

/** 이론상 정지 조합 수. */
export function comboCount(math: GameMath): number {
  return math.strips.reduce((acc, strip) => acc * strip.length, 1)
}

/**
 * 통을 표로 바꾼다.
 * @param denominator 관측 수 x 총 베팅액. 나누면 관측당 기대 배수가 된다.
 * @param uplift 프리스핀 배분 계수. 기본 게임 기여를 전체 RTP 기준으로 끌어올린다.
 */
export function toContributionRows(
  map: Map<string, Bucket>,
  labels: Map<string, string>,
  denominator: number,
  uplift: number,
): ContributionRow[] {
  const total = [...map.values()].reduce((acc, bucket) => acc + bucket.win, 0)
  return [...map.entries()]
    .map(([key, bucket]) => ({
      key,
      label: labels.get(key) ?? key,
      win: bucket.win,
      rtp: (bucket.win / denominator) * uplift,
      share: total === 0 ? 0 : bucket.win / total,
      hits: bucket.hits,
    }))
    .sort((a, b) => b.rtp - a.rtp)
}

export function lineRows(
  math: GameMath,
  acc: Accumulators,
  denominator: number,
  uplift: number,
): LineContributionRow[] {
  const total = acc.lineWin.reduce((sum, win) => sum + win, 0)
  return math.paylines.map((pattern, index) => {
    const win = acc.lineWin[index] ?? 0
    return {
      line: index,
      pattern: [...pattern],
      win,
      rtp: (win / denominator) * uplift,
      share: total === 0 ? 0 : win / total,
      hits: acc.lineHits[index] ?? 0,
    }
  })
}

export function countRows(acc: Accumulators, denominator: number, uplift: number): CountContributionRow[] {
  const total = [...acc.counts.values()].reduce((sum, bucket) => sum + bucket.win, 0)
  return [...acc.counts.entries()]
    .map(([count, bucket]) => ({
      count,
      win: bucket.win,
      rtp: (bucket.win / denominator) * uplift,
      share: total === 0 ? 0 : bucket.win / total,
      hits: bucket.hits,
    }))
    .sort((a, b) => a.count - b.count)
}
