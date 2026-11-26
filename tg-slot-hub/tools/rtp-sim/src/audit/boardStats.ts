import { boardExpectation } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import type { RoundSpin } from './spinner.js'
import type { BoardReport } from './types.js'

/** 말판 지급 구간(총 베팅 배수). 기획서 §3-6 지급 분포와 같은 경계다. */
export const BOARD_PAYOUT_BUCKETS = [10, 20, 40, 80, 150] as const

function bump(map: Map<number, number>, key: number, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount)
}

/**
 * 말판 팩 전용 통. 유료 스핀마다 말판 피처를 찾아 진입·지급·종료 사유·던지기 수·갈림길을 센다.
 * 필드는 평범한 수와 Map이라 워커 사이 구조화 복제로 넘겨 `absorb`로 합칠 수 있다.
 */
export class BoardAccumulator {
  readonly maxThrows: number
  readonly maxWin: number
  readonly forks: readonly string[]
  paidSpins = 0
  boards = 0
  payoutSum = 0
  payoutSquareSum = 0
  maxPayout = 0
  boardWin = 0
  baseLines = 0
  baseScatter = 0
  goal = 0
  traps = 0
  throwsEnd = 0
  forked = 0
  minPayoutHits = 0
  overMaxThrows = 0
  overMaxWin = 0
  winCappedSpins = 0
  capLoss = 0
  readonly throwCounts = new Map<number, number>()
  readonly multipliers = new Map<number, number>()
  readonly buckets: number[] = new Array<number>(BOARD_PAYOUT_BUCKETS.length + 1).fill(0)

  constructor(math: GameMath) {
    const config = math.boardBonus
    if (config === undefined) throw new RangeError('boardBonus 설정이 없는 게임에 BoardAccumulator를 만들었다')
    this.maxThrows = config.maxThrows
    this.maxWin = config.maxWin
    this.forks = Object.keys(config.forks)
  }

  observe(round: readonly RoundSpin[], minPayout: number): void {
    for (const entry of round) {
      const spin = entry.spin
      if (entry.isFreeSpin) continue
      this.paidSpins += 1
      this.baseLines += spin.lineWin
      this.baseScatter += spin.scatterWin
      for (const feature of spin.features) {
        if (feature.type === 'winCapped') {
          this.winCappedSpins += 1
          this.capLoss += feature.requested - feature.granted
          continue
        }
        if (feature.type !== 'boardBonus') continue
        this.boards += 1
        this.boardWin += feature.win
        this.payoutSum += feature.payout
        this.payoutSquareSum += feature.payout * feature.payout
        if (feature.payout > this.maxPayout) this.maxPayout = feature.payout
        if (feature.payout > this.maxWin) this.overMaxWin += 1
        if (feature.pot * feature.multiplier < minPayout) this.minPayoutHits += 1
        if (feature.end === 'goal') this.goal += 1
        else if (feature.end === 'traps') this.traps += 1
        else this.throwsEnd += 1
        const thrown = feature.throws.length
        if (thrown > this.maxThrows) this.overMaxThrows += 1
        bump(this.throwCounts, thrown)
        bump(this.multipliers, feature.multiplier)
        if (feature.throws.some((row) => this.forks.includes(row.at))) this.forked += 1
        let bucket = BOARD_PAYOUT_BUCKETS.findIndex((edge) => feature.payout < edge)
        if (bucket < 0) bucket = BOARD_PAYOUT_BUCKETS.length
        this.buckets[bucket] = (this.buckets[bucket] ?? 0) + 1
      }
    }
  }

  /** 다른 샤드의 통을 더한다. */
  absorb(other: BoardAccumulatorData): void {
    this.paidSpins += other.paidSpins
    this.boards += other.boards
    this.payoutSum += other.payoutSum
    this.payoutSquareSum += other.payoutSquareSum
    this.maxPayout = Math.max(this.maxPayout, other.maxPayout)
    this.boardWin += other.boardWin
    this.baseLines += other.baseLines
    this.baseScatter += other.baseScatter
    this.goal += other.goal
    this.traps += other.traps
    this.throwsEnd += other.throwsEnd
    this.forked += other.forked
    this.minPayoutHits += other.minPayoutHits
    this.overMaxThrows += other.overMaxThrows
    this.overMaxWin += other.overMaxWin
    this.winCappedSpins += other.winCappedSpins
    this.capLoss += other.capLoss
    for (const [key, count] of other.throwCounts) bump(this.throwCounts, key, count)
    for (const [key, count] of other.multipliers) bump(this.multipliers, key, count)
    other.buckets.forEach((count, index) => {
      this.buckets[index] = (this.buckets[index] ?? 0) + count
    })
  }
}

export type BoardAccumulatorData = Omit<BoardAccumulator, 'observe' | 'absorb'>

/** 통을 리포트 모양으로. 분모는 유료 스핀 x 총 베팅액, 말판 비율은 말판 수가 분모다. */
export function buildBoardReport(math: GameMath, acc: BoardAccumulatorData, totalBet: number): BoardReport {
  const config = math.boardBonus
  if (config === undefined) throw new RangeError('boardBonus 설정이 없다')
  const exact = boardExpectation(config)
  const paid = acc.paidSpins
  const n = acc.boards
  const rtpOf = (coins: number): number => (paid === 0 ? 0 : coins / (paid * totalBet))
  const share = (count: number): number => (n === 0 ? 0 : count / n)
  const mean = n === 0 ? 0 : acc.payoutSum / n
  const variance = n > 1 ? Math.max(0, (acc.payoutSquareSum - n * mean * mean) / (n - 1)) : 0
  const stdErr = n === 0 ? 0 : Math.sqrt(variance / n)
  let throwSum = 0
  let longest = 0
  for (const [thrown, count] of acc.throwCounts) {
    throwSum += thrown * count
    if (thrown > longest) longest = thrown
  }
  const edges = ['<10', '10~19', '20~39', '40~79', '80~149', '150+']
  return {
    paidSpins: paid,
    boards: n,
    entryRate: paid === 0 ? 0 : n / paid,
    meanPayout: mean,
    sdPayout: Math.sqrt(variance),
    stdErr,
    exactMean: exact.mean,
    exactSd: exact.sd,
    exactMax: exact.max,
    maxWin: config.maxWin,
    maxPayout: acc.maxPayout,
    overMaxWin: acc.overMaxWin,
    longestThrows: longest,
    maxThrows: config.maxThrows,
    overMaxThrows: acc.overMaxThrows,
    meanThrows: n === 0 ? 0 : throwSum / n,
    exactMeanThrows: exact.meanThrows,
    ends: [
      { end: 'goal', count: acc.goal, probability: share(acc.goal), exact: exact.pEnd.goal },
      { end: 'traps', count: acc.traps, probability: share(acc.traps), exact: exact.pEnd.traps },
      { end: 'throws', count: acc.throwsEnd, probability: share(acc.throwsEnd), exact: exact.pEnd.throws },
    ],
    forkRate: share(acc.forked),
    exactForkRate: exact.pFork,
    minPayoutRate: share(acc.minPayoutHits),
    exactMinPayoutRate: exact.pMinPayout,
    throws: [...acc.throwCounts.entries()]
      .map(([thrown, count]) => ({ throws: thrown, count, probability: share(count), exact: exact.throwsDistribution[thrown] ?? 0 }))
      .sort((a, b) => a.throws - b.throws),
    multipliers: [...acc.multipliers.entries()]
      .map(([multiplier, count]) => ({
        multiplier,
        count,
        probability: share(count),
        exact: exact.multiplierDistribution[multiplier] ?? 0,
      }))
      .sort((a, b) => a.multiplier - b.multiplier),
    payoutBuckets: acc.buckets.map((count, index) => ({ label: edges[index] ?? '', count, probability: share(count) })),
    winCappedSpins: acc.winCappedSpins,
    capLossRtp: rtpOf(acc.capLoss),
    breakdown: {
      lines: rtpOf(acc.baseLines),
      scatter: rtpOf(acc.baseScatter),
      board: rtpOf(acc.boardWin),
    },
  }
}
