import { buildGrid, computeExactRtp, evaluate, evaluateScatter, getBetPerLine } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { buildLabelMap } from './groups.js'
import { HISTOGRAM_BUCKETS, bucketIndexFor, buildHistogramRows } from './histogram.js'
import { Accumulators, comboCount, countRows, lineRows, toContributionRows, waysRows } from './contributions.js'
import type { DistributionReport } from './types.js'

/**
 * 모든 정지 위치 조합을 한 번 훑어 RTP·적중률·기여도·히스토그램을 동시에 만든다.
 * 엔진의 `computeExactRtp`와 같은 오도미터 순회를 쓰므로 rtp 값은 정확히 일치한다.
 * 차이는 승리 라인 하나하나를 심볼/그룹/라인/매치개수로 쪼개 귀속시킨다는 점뿐이다.
 *
 * 프리스핀은 조합을 세는 것으로 잡히지 않는다. 대신 엔진이 닫힌 식으로 낸 프리스핀 기대값을
 * **기본 게임 기여도에 비례 배분**한다. 프리스핀은 같은 스트립을 다시 돌리는 것이라
 * 그 안의 심볼 구성이 기본 게임과 같기 때문이다. 그래서 기여도 합계는 여전히 전체 RTP와 같다.
 */
export function enumerateAudit(math: GameMath, totalBet: number): DistributionReport {
  const betPerLine = getBetPerLine(math, totalBet)
  const lengths = math.strips.map((strip) => strip.length)
  const combos = comboCount(math)

  const labels = buildLabelMap(math)
  const acc = new Accumulators(math)
  const bucketCombos = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0)
  const bucketMultiplier = new Array<number>(HISTOGRAM_BUCKETS.length).fill(0)

  const stops = new Array<number>(math.reels).fill(0)
  let hits = 0
  let maxWin = 0

  for (let i = 0; i < combos; i += 1) {
    const grid = buildGrid(math, stops)
    const { wins, totalWin: lineWin } = evaluate(grid, math, betPerLine)
    const scatter = evaluateScatter(grid, math, totalBet)
    const baseWin = lineWin + scatter.win

    if (baseWin > 0) {
      hits += 1
      if (baseWin > maxWin) maxWin = baseWin
      for (const win of wins) acc.addLine(win, 1)
      if (scatter.win > 0) acc.addScatter(scatter.count, scatter.win)
    }

    const multiplier = baseWin / totalBet
    const bucket = bucketIndexFor(multiplier)
    bucketCombos[bucket] = (bucketCombos[bucket] ?? 0) + 1
    bucketMultiplier[bucket] = (bucketMultiplier[bucket] ?? 0) + multiplier

    // 오도미터 방식으로 다음 조합. 릴 0부터 올린다.
    for (let reel = 0; reel < math.reels; reel += 1) {
      const length = lengths[reel] ?? 1
      const next = ((stops[reel] ?? 0) + 1) % length
      stops[reel] = next
      if (next !== 0) break
    }
  }

  // 프리스핀 몫은 엔진에게 묻는다. 분포는 이미 여기서 정확히 셌으므로 표본은 필요 없다.
  const engine = computeExactRtp(math, totalBet, { sampleSpins: 0 })
  const denominator = combos * totalBet
  const base = acc.total / denominator
  // base가 0이면 나눌 것이 없다. 프리스핀도 0이므로 배분 계수는 1로 둔다.
  const uplift = base === 0 ? 1 : engine.rtp / base

  return {
    method: 'enumerate',
    estimated: false,
    totalBet,
    betPerLine,
    combos,
    observations: combos,
    sampleSeed: null,
    rtp: engine.rtp,
    breakdown: engine.breakdown,
    contributionTotal: base * uplift,
    hitRate: hits / combos,
    maxWinMultiplier: maxWin / totalBet,
    winObservations: hits,
    symbols: toContributionRows(acc.symbols, labels, denominator, uplift),
    groups: toContributionRows(acc.groups, labels, denominator, uplift),
    lines: lineRows(math, acc, denominator, uplift),
    ways: waysRows(acc, denominator, uplift),
    isWays: math.payModel === 'ways',
    // 전수 조사는 뮤테이션을 거치지 않은 정지 그리드를 세므로 뮤테이션 통계가 없다.
    mutations: [],
    counts: countRows(acc, denominator, uplift),
    histogram: buildHistogramRows(bucketCombos, bucketMultiplier, combos),
    observedFeatures: null,
    precision: null,
  }
}
