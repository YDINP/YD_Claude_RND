import { buildGrid, evaluate, getBetPerLine, MAX_ENUMERATION_COMBOS } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { buildLabelMap } from './groups.js'
import { HISTOGRAM_BUCKETS, bucketIndexFor, buildHistogramRows } from './histogram.js'
import type {
  ContributionRow,
  CountContributionRow,
  EnumerationReport,
  LineContributionRow,
} from './types.js'

interface Accumulator {
  win: number
  hits: number
}

function bump(map: Map<string, Accumulator>, key: string, win: number): void {
  const found = map.get(key)
  if (found === undefined) {
    map.set(key, { win, hits: 1 })
    return
  }
  found.win += win
  found.hits += 1
}

function toRows(
  map: Map<string, Accumulator>,
  labels: Map<string, string>,
  denominator: number,
  totalRtp: number,
): ContributionRow[] {
  return [...map.entries()]
    .map(([key, acc]) => ({
      key,
      label: labels.get(key) ?? key,
      win: acc.win,
      rtp: acc.win / denominator,
      share: totalRtp === 0 ? 0 : acc.win / denominator / totalRtp,
      hits: acc.hits,
    }))
    .sort((a, b) => b.rtp - a.rtp)
}

/**
 * 모든 정지 위치 조합을 한 번 훑어 RTP·적중률·기여도·히스토그램을 동시에 만든다.
 * 엔진의 `computeExactRtp`와 같은 오도미터 순회를 쓰므로 rtp 값은 정확히 일치한다.
 * 차이는 승리 라인 하나하나를 심볼/그룹/라인/매치개수로 쪼개 귀속시킨다는 점뿐이다.
 */
export function enumerateAudit(math: GameMath, totalBet: number): EnumerationReport {
  const betPerLine = getBetPerLine(math, totalBet)
  const lengths = math.strips.map((strip) => strip.length)
  const combos = lengths.reduce((acc, length) => acc * length, 1)
  if (combos > MAX_ENUMERATION_COMBOS) {
    throw new RangeError(
      `조합 수 ${combos}가 상한 ${MAX_ENUMERATION_COMBOS}를 넘는다. 전수 조사 대신 몬테카를로만 쓸 것`,
    )
  }

  const labels = buildLabelMap(math)
  const symbolAcc = new Map<string, Accumulator>()
  const groupAcc = new Map<string, Accumulator>()
  const countAcc = new Map<number, Accumulator>()
  const lineWin = new Array<number>(math.paylines.length).fill(0)
  const lineHits = new Array<number>(math.paylines.length).fill(0)
  const bucketCombos = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0)
  const bucketMultiplier = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0)

  const stops = new Array<number>(math.reels).fill(0)
  let winSum = 0
  let hits = 0
  let maxWin = 0

  for (let i = 0; i < combos; i += 1) {
    const grid = buildGrid(math, stops)
    const { wins, totalWin } = evaluate(grid, math, betPerLine)
    winSum += totalWin
    if (totalWin > 0) {
      hits += 1
      if (totalWin > maxWin) maxWin = totalWin
      for (const win of wins) {
        bump(symbolAcc, win.symbol, win.win)
        const group = win.group
        if (group !== undefined) bump(groupAcc, group, win.win)
        const countKey = win.count
        const found = countAcc.get(countKey)
        if (found === undefined) countAcc.set(countKey, { win: win.win, hits: 1 })
        else {
          found.win += win.win
          found.hits += 1
        }
        lineWin[win.line] = (lineWin[win.line] ?? 0) + win.win
        lineHits[win.line] = (lineHits[win.line] ?? 0) + 1
      }
    }
    const multiplier = totalWin / totalBet
    const bucket = bucketIndexFor(multiplier)
    bucketCombos[bucket] = (bucketCombos[bucket] ?? 0) + 1
    bucketMultiplier[bucket] = (bucketMultiplier[bucket] ?? 0) + multiplier

    for (let reel = 0; reel < math.reels; reel += 1) {
      const length = lengths[reel] ?? 1
      const next = ((stops[reel] ?? 0) + 1) % length
      stops[reel] = next
      if (next !== 0) break
    }
  }

  const denominator = combos * totalBet
  const rtp = winSum / denominator

  const counts: CountContributionRow[] = [...countAcc.entries()]
    .map(([count, acc]) => ({
      count,
      win: acc.win,
      rtp: acc.win / denominator,
      share: rtp === 0 ? 0 : acc.win / denominator / rtp,
      hits: acc.hits,
    }))
    .sort((a, b) => a.count - b.count)

  const lines: LineContributionRow[] = math.paylines.map((pattern, index) => ({
    line: index,
    pattern: [...pattern],
    win: lineWin[index] ?? 0,
    rtp: (lineWin[index] ?? 0) / denominator,
    share: rtp === 0 ? 0 : (lineWin[index] ?? 0) / denominator / rtp,
    hits: lineHits[index] ?? 0,
  }))

  return {
    totalBet,
    betPerLine,
    combos,
    rtp,
    hitRate: hits / combos,
    maxWinMultiplier: maxWin / totalBet,
    winCombos: hits,
    symbols: toRows(symbolAcc, labels, denominator, rtp),
    groups: toRows(groupAcc, labels, denominator, rtp),
    lines,
    counts,
    histogram: buildHistogramRows(bucketCombos, bucketMultiplier, combos),
  }
}
