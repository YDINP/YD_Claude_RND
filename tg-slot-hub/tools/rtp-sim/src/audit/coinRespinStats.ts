import { coinRespinGrowthBound } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import type { RoundSpin } from './spinner.js'
import type { CoinRespinReport, GateRow } from './types.js'

/** 진입 빈도 기본 목표(kraken-cove 계획 §5-1: 1/185 ±15%). */
export const COIN_RESPIN_TARGET_ODDS = 185
export const COIN_RESPIN_ODDS_TOLERANCE = 0.15
/** 분해 합 검사 허용 오차(상대). 코인 정수 합이라 부동소수 오차뿐이다. */
const SUM_TOLERANCE = 1e-9

function addAt(values: number[], index: number, amount = 1): void {
  values[index] = (values[index] ?? 0) + amount
}

/**
 * 코인 리스핀 팩 전용 통. 유료 스핀(=라운드)마다 코인 리스핀 피처를 읽어 진입률, 종료 코인 수,
 * 리스핀 횟수, 촉수 감기, 보물 등장, 15칸 채움, 캡, 지급 분해를 센다. 값은 전부 실제 지급 코인이다.
 * 필드는 평범한 수·배열이라 워커 사이 구조화 복제로 넘겨 `absorb`로 합칠 수 있다.
 */
export class CoinRespinAccumulator {
  readonly cells: number
  readonly structuralMaxSteps: number
  readonly hardCap: number
  paidSpins = 0
  rounds = 0
  totalWin = 0
  lineWin = 0
  numericBase = 0
  wrapBonus = 0
  treasure = 0
  top = 0
  capLoss = 0
  cappedRounds = 0
  hardCapRounds = 0
  overSteps = 0
  fullRounds = 0
  entryWrapRounds = 0
  midWrapRounds = 0
  wraps = 0
  steps = 0
  maxSteps = 0
  featureSum = 0
  featureSquareSum = 0
  featureMax = 0
  coinBoardSpins = 0
  anticipationSpins = 0
  readonly tierRounds: number[] = [0, 0, 0]
  readonly finalCoins: number[]
  readonly stepCounts: number[]
  readonly wrapCounts: number[]

  constructor(math: GameMath) {
    const config = math.coinRespin
    if (config === undefined) throw new RangeError('coinRespin 설정이 없는 게임에 CoinRespinAccumulator를 만들었다')
    this.cells = math.reels * math.rows
    this.structuralMaxSteps = config.respins * (this.cells - config.trigger + 1)
    this.hardCap = config.hardCap
    this.finalCoins = new Array<number>(this.cells + 1).fill(0)
    this.stepCounts = new Array<number>(config.hardCap + 1).fill(0)
    this.wrapCounts = new Array<number>(math.reels + 1).fill(0)
  }

  observe(round: readonly RoundSpin[], totalBet: number, math: GameMath): void {
    const config = math.coinRespin
    if (config === undefined) return
    for (const entry of round) {
      const spin = entry.spin
      if (entry.isFreeSpin) continue
      this.paidSpins += 1
      this.totalWin += spin.totalWin
      this.lineWin += spin.totalWin - (spin.respinWin ?? 0)

      // 기대감(남은 릴 감속) 규칙: 릴 3이 멈춘 뒤 코인 ≥ 4 또는 릴 4가 멈춘 뒤 코인 ≥ 5.
      let first3 = 0
      let first4 = 0
      spin.grid.forEach((line) =>
        line.forEach((symbol, reel) => {
          if (symbol !== config.symbol) return
          if (reel < 3) first3 += 1
          if (reel < 4) first4 += 1
        }),
      )
      if (first3 >= 4 || first4 >= 5) this.anticipationSpins += 1

      for (const feature of spin.features) {
        if (feature.type === 'coinBoard') this.coinBoardSpins += 1
        if (feature.type === 'winCapped') {
          this.cappedRounds += 1
          this.capLoss += feature.requested - feature.granted
        }
        if (feature.type !== 'coinRespin') continue
        this.rounds += 1
        const steps = feature.steps.length
        this.steps += steps
        this.maxSteps = Math.max(this.maxSteps, steps)
        addAt(this.stepCounts, Math.min(steps, this.hardCap))
        if (steps > this.structuralMaxSteps) this.overSteps += 1
        if (feature.hitHardCap) this.hardCapRounds += 1
        if (feature.full) this.fullRounds += 1
        addAt(this.finalCoins, feature.final.length)
        const midWraps = feature.steps.reduce((sum, step) => sum + step.wraps.length, 0)
        const allWraps = feature.entryWraps.length + midWraps
        if (feature.entryWraps.length > 0) this.entryWrapRounds += 1
        if (midWraps > 0) this.midWrapRounds += 1
        this.wraps += allWraps
        addAt(this.wrapCounts, allWraps)

        let numeric = 0
        let treasure = 0
        const tiers = new Set<string>()
        for (const cell of feature.final) {
          if (cell.kind === 'bet') numeric += cell.amount
          else {
            treasure += cell.amount
            if (cell.tier !== undefined) tiers.add(cell.tier)
          }
        }
        if (tiers.has('small')) addAt(this.tierRounds, 0)
        if (tiers.has('medium')) addAt(this.tierRounds, 1)
        if (tiers.has('large')) addAt(this.tierRounds, 2)
        let bonus = 0
        for (const wrap of [...feature.entryWraps, ...feature.steps.flatMap((step) => step.wraps)]) {
          wrap.before.forEach((before, row) => (bonus += (wrap.after[row] ?? before) - before))
        }
        this.wrapBonus += bonus
        this.numericBase += numeric - bonus
        this.treasure += treasure
        this.top += feature.full ? Math.round(config.treasures.top * totalBet) : 0

        const multiple = feature.win / totalBet
        this.featureSum += multiple
        this.featureSquareSum += multiple * multiple
        this.featureMax = Math.max(this.featureMax, multiple)
      }
    }
  }

  /** 다른 샤드의 통을 더한다. */
  absorb(other: CoinRespinAccumulatorData): void {
    const keys = [
      'paidSpins', 'rounds', 'totalWin', 'lineWin', 'numericBase', 'wrapBonus', 'treasure', 'top', 'capLoss',
      'cappedRounds', 'hardCapRounds', 'overSteps', 'fullRounds', 'entryWrapRounds', 'midWrapRounds', 'wraps',
      'steps', 'featureSum', 'featureSquareSum', 'coinBoardSpins', 'anticipationSpins',
    ] as const
    for (const key of keys) this[key] += other[key]
    this.maxSteps = Math.max(this.maxSteps, other.maxSteps)
    this.featureMax = Math.max(this.featureMax, other.featureMax)
    other.tierRounds.forEach((count, index) => addAt(this.tierRounds, index, count))
    other.finalCoins.forEach((count, index) => addAt(this.finalCoins, index, count))
    other.stepCounts.forEach((count, index) => addAt(this.stepCounts, index, count))
    other.wrapCounts.forEach((count, index) => addAt(this.wrapCounts, index, count))
  }
}

export type CoinRespinAccumulatorData = Omit<CoinRespinAccumulator, 'observe' | 'absorb'>

/** 통을 리포트 모양으로. RTP 분모는 유료 스핀 x 총 베팅액이다. */
export function buildCoinRespinReport(math: GameMath, acc: CoinRespinAccumulatorData, totalBet: number): CoinRespinReport {
  const config = math.coinRespin
  if (config === undefined) throw new RangeError('coinRespin 설정이 없다')
  const paid = acc.paidSpins
  const rounds = acc.rounds
  const denominator = paid * totalBet
  const rtpOf = (coins: number): number => (denominator === 0 ? 0 : coins / denominator)
  const perRound = (count: number): number => (rounds === 0 ? 0 : count / rounds)
  const mean = perRound(acc.featureSum)
  const variance = rounds > 1 ? Math.max(0, (acc.featureSquareSum - rounds * mean * mean) / (rounds - 1)) : 0
  const respin = acc.numericBase + acc.wrapBonus + acc.treasure + acc.top - acc.capLoss
  const dist = (values: number[], from = 0): { value: number; rounds: number; probability: number }[] =>
    values
      .map((count, value) => ({ value, rounds: count, probability: perRound(count) }))
      .filter((row) => row.value >= from && (row.rounds > 0 || row.value <= config.trigger))
  return {
    paidSpins: paid,
    rounds,
    entryRate: paid === 0 ? 0 : rounds / paid,
    targetOdds: COIN_RESPIN_TARGET_ODDS,
    meanFeatureMultiplier: mean,
    featureSigma: Math.sqrt(variance),
    maxFeatureMultiplier: acc.featureMax,
    meanSteps: perRound(acc.steps),
    maxSteps: acc.maxSteps,
    structuralMaxSteps: acc.structuralMaxSteps,
    overSteps: acc.overSteps,
    hardCap: acc.hardCap,
    hardCapRounds: acc.hardCapRounds,
    growthBound: coinRespinGrowthBound(config, acc.cells),
    meanFinalCoins: perRound(acc.finalCoins.reduce((sum, count, coins) => sum + count * coins, 0)),
    fullRate: perRound(acc.fullRounds),
    entryWrapRate: perRound(acc.entryWrapRounds),
    midWrapRate: perRound(acc.midWrapRounds),
    wrapsPerRound: perRound(acc.wraps),
    tierRates: { small: perRound(acc.tierRounds[0] ?? 0), medium: perRound(acc.tierRounds[1] ?? 0), large: perRound(acc.tierRounds[2] ?? 0) },
    winCappedRounds: acc.cappedRounds,
    capLossRtp: rtpOf(acc.capLoss),
    coinBoardRate: paid === 0 ? 0 : acc.coinBoardSpins / paid,
    anticipationRate: paid === 0 ? 0 : acc.anticipationSpins / paid,
    finalCoins: dist(acc.finalCoins, config.trigger).map((row) => ({ coins: row.value, rounds: row.rounds, probability: row.probability })),
    stepCounts: dist(acc.stepCounts).filter((row) => row.rounds > 0).map((row) => ({ steps: row.value, rounds: row.rounds, probability: row.probability })),
    wrapCounts: dist(acc.wrapCounts).map((row) => ({ wraps: row.value, rounds: row.rounds, probability: row.probability })),
    breakdown: {
      lines: rtpOf(acc.lineWin),
      respinNumeric: rtpOf(acc.numericBase),
      respinWrapBonus: rtpOf(acc.wrapBonus),
      respinTreasure: rtpOf(acc.treasure),
      respinTop: rtpOf(acc.top),
      capLoss: rtpOf(acc.capLoss),
      respin: rtpOf(respin),
      total: rtpOf(acc.totalWin),
    },
  }
}

/** 코인 리스핀 게이트. 계획 §5-6. */
export function coinRespinGates(report: CoinRespinReport): GateRow[] {
  const odds = report.entryRate > 0 ? 1 / report.entryRate : Infinity
  const low = report.targetOdds * (1 - COIN_RESPIN_ODDS_TOLERANCE)
  const high = report.targetOdds * (1 + COIN_RESPIN_ODDS_TOLERANCE)
  const b = report.breakdown
  const sum = b.lines + b.respin
  return [
    {
      label: `코인 리스핀 진입 1/${report.targetOdds} ± ${Math.round(COIN_RESPIN_ODDS_TOLERANCE * 100)}%`,
      pass: odds >= low && odds <= high,
      detail: `1/${Number.isFinite(odds) ? odds.toFixed(1) : '-'} (${report.rounds.toLocaleString('en-US')}라운드 / ${report.paidSpins.toLocaleString('en-US')}스핀)`,
    },
    {
      label: `리스핀 ≤ 구조상 최대 ${report.structuralMaxSteps}회 (위반 0건)`,
      pass: report.overSteps === 0 && report.rounds > 0,
      detail: `최장 ${report.maxSteps}회, 위반 ${report.overSteps}건`,
    },
    {
      label: `hardCap(${report.hardCap}) 도달 0건`,
      pass: report.hardCapRounds === 0,
      detail: `${report.hardCapRounds}라운드`,
    },
    {
      label: 'q x 빈칸 < 1 (정적 검사)',
      pass: report.growthBound < 1,
      detail: report.growthBound.toFixed(4),
    },
    {
      label: '라인 + 리스핀 분해 합 = 전체 (분해용 독립 표본 — 본문 RTP와 다른 표본이라 숫자가 다르다)',
      pass: Math.abs(sum - b.total) <= SUM_TOLERANCE * Math.max(1, b.total),
      detail: `${(b.lines * 100).toFixed(4)}% + ${(b.respin * 100).toFixed(4)}% = ${(sum * 100).toFixed(4)}% / 전체 ${(b.total * 100).toFixed(4)}%`,
    },
  ]
}
