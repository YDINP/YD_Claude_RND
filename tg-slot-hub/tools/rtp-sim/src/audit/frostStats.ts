import { shapeCellCount } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { centerWaysAnalytic } from '../centerWaysAnalytic.js'
import type { RoundSpin } from './spinner.js'
import type { GateRow } from './types.js'

/** 진입 목표(aurora 기획서 §5-1: 약 1/160, 허용 1/140~1/190). */
export const FROST_ODDS_LOW = 140
export const FROST_ODDS_HIGH = 190
/** 피처 평균(총 베팅 배수) 허용 범위. */
export const FROST_MEAN_LOW = 36
export const FROST_MEAN_HIGH = 42
/** 얼림 대상 등급 비율 게이트. */
export const FROST_HIGH_MIN = 0.2
export const FROST_LOW_MAX = 0.55
/** «베팅 1배 미만 얼음 보너스(0 포함)» 비율 상한. */
export const FROST_BELOW_BET_MAX = 0.3
/** 유료 판 당첨 중 베팅 미만 당첨 비율 상한(LDW). */
export const FROST_LDW_MAX = 0.45
/** 라운드 배수 분포 통의 끝(이 배수 이상은 마지막 칸 하나). */
const MULTIPLE_BINS = 1000
const SUM_TOLERANCE = 1e-9

function addAt(values: number[], index: number, amount = 1): void {
  values[index] = (values[index] ?? 0) + amount
}

/**
 * 얼려 두기 프리스핀 팩 전용 통. 라운드(유료 판 + 프리스핀 전부)마다 진입, 프리스핀 판 수, 얼림 단계·칸 수,
 * 얼린 그림·등급, 얼음 보너스, 오로라, 상한, 지급 분해를 센다. 값은 실제 지급 코인이다.
 * 필드는 평범한 수·배열이라 워커 사이 구조화 복제로 넘겨 `absorb`로 합칠 수 있다.
 */
export class FrostAccumulator {
  readonly cells: number
  readonly hardCap: number
  readonly maxTotal: number
  paidSpins = 0
  paidHits = 0
  paidBelowBet = 0
  rounds = 0
  baseLine = 0
  baseLineSquare = 0
  baseScatter = 0
  freeLine = 0
  freeScatter = 0
  bonus = 0
  totalWin = 0
  capLoss = 0
  cappedSpins = 0
  roundsAtCap = 0
  freeSpins = 0
  freeHits = 0
  retriggers = 0
  overLength = 0
  longestRound = 0
  chains = 0
  steps = 0
  maxSteps = 0
  overSteps = 0
  hardCapHits = 0
  belowBet = 0
  palace = 0
  auroraUps = 0
  roundsWithUp = 0
  featureSum = 0
  featureSquareSum = 0
  featureMax = 0
  readonly tierChains: number[] = [0, 0, 0]
  readonly targetChains: Record<string, number> = {}
  readonly countHist: number[]
  readonly stepHist: number[]
  readonly roundLength: number[]
  readonly auroraEnd: number[]
  readonly featureBins: number[] = new Array<number>(MULTIPLE_BINS + 1).fill(0)

  constructor(math: GameMath) {
    const config = math.frostRespin
    if (config === undefined) throw new RangeError('frostRespin 설정이 없는 게임에 FrostAccumulator를 만들었다')
    this.cells = shapeCellCount(math)
    this.hardCap = config.hardCap
    this.maxTotal = config.freeSpins.maxTotal
    this.countHist = new Array<number>(this.cells + 1).fill(0)
    this.stepHist = new Array<number>(config.hardCap + 2).fill(0)
    this.roundLength = new Array<number>(config.freeSpins.maxTotal + 2).fill(0)
    this.auroraEnd = new Array<number>(config.aurora.ladder.length).fill(0)
  }

  observe(round: readonly RoundSpin[], totalBet: number): void {
    let free = 0
    let featureWin = 0
    let level = 0
    let ups = 0
    let roundPaid = 0
    for (const entry of round) {
      const spin = entry.spin
      this.totalWin += spin.totalWin
      for (const feature of spin.features) {
        if (feature.type === 'winCapped') {
          this.cappedSpins += 1
          this.capLoss += feature.requested - feature.granted
        }
        if (feature.type === 'freeSpins' && feature.retrigger) this.retriggers += 1
        if (feature.type !== 'frostChain') continue
        this.chains += 1
        this.bonus += feature.bonus
        this.steps += feature.steps.length
        this.maxSteps = Math.max(this.maxSteps, feature.steps.length)
        addAt(this.stepHist, Math.min(feature.steps.length, this.hardCap + 1))
        if (feature.steps.length > this.hardCap) this.overSteps += 1
        if (feature.hitHardCap) this.hardCapHits += 1
        addAt(this.countHist, Math.min(feature.count, this.cells))
        if (feature.count >= this.cells) this.palace += 1
        addAt(this.tierChains, feature.tier === 'high' ? 0 : feature.tier === 'mid' ? 1 : 2)
        this.targetChains[feature.target] = (this.targetChains[feature.target] ?? 0) + 1
        if (feature.bonus < totalBet) this.belowBet += 1
        if (feature.auroraAfter > feature.auroraBefore) ups += 1
        level = feature.auroraAfter
      }
      if (!entry.isFreeSpin) {
        this.paidSpins += 1
        this.baseLine += spin.lineWin
        this.baseLineSquare += (spin.lineWin / totalBet) ** 2
        this.baseScatter += spin.scatterWin
        if (spin.totalWin > 0) {
          this.paidHits += 1
          if (spin.totalWin < totalBet) this.paidBelowBet += 1
        }
        continue
      }
      free += 1
      featureWin += spin.totalWin
      roundPaid += spin.totalWin
      this.freeSpins += 1
      this.freeLine += spin.lineWin
      this.freeScatter += spin.scatterWin
      if (spin.wins.length > 0) this.freeHits += 1
    }
    if (free === 0) return
    this.rounds += 1
    this.longestRound = Math.max(this.longestRound, free)
    if (free > this.maxTotal) this.overLength += 1
    addAt(this.roundLength, Math.min(free, this.maxTotal + 1))
    addAt(this.auroraEnd, Math.min(level, this.auroraEnd.length - 1))
    this.auroraUps += ups
    if (ups > 0) this.roundsWithUp += 1
    const multiple = featureWin / totalBet
    if (roundPaid > 0 && multiple >= 2500 - 1e-9) this.roundsAtCap += 1
    this.featureSum += multiple
    this.featureSquareSum += multiple * multiple
    this.featureMax = Math.max(this.featureMax, multiple)
    addAt(this.featureBins, Math.min(MULTIPLE_BINS, Math.floor(multiple)))
  }

  absorb(other: FrostAccumulatorData): void {
    const keys = [
      'paidSpins', 'paidHits', 'paidBelowBet', 'rounds', 'baseLine', 'baseLineSquare', 'baseScatter', 'freeLine',
      'freeScatter', 'bonus', 'totalWin', 'capLoss', 'cappedSpins', 'roundsAtCap', 'freeSpins', 'freeHits', 'retriggers',
      'overLength', 'chains', 'steps', 'overSteps', 'hardCapHits', 'belowBet', 'palace', 'auroraUps', 'roundsWithUp',
      'featureSum', 'featureSquareSum',
    ] as const
    for (const key of keys) this[key] += other[key]
    this.longestRound = Math.max(this.longestRound, other.longestRound)
    this.maxSteps = Math.max(this.maxSteps, other.maxSteps)
    this.featureMax = Math.max(this.featureMax, other.featureMax)
    for (const [target, count] of Object.entries(other.targetChains)) {
      this.targetChains[target] = (this.targetChains[target] ?? 0) + count
    }
    const merge = (into: number[], from: readonly number[]): void => from.forEach((count, index) => addAt(into, index, count))
    merge(this.tierChains, other.tierChains)
    merge(this.countHist, other.countHist)
    merge(this.stepHist, other.stepHist)
    merge(this.roundLength, other.roundLength)
    merge(this.auroraEnd, other.auroraEnd)
    merge(this.featureBins, other.featureBins)
  }
}

export type FrostAccumulatorData = Omit<FrostAccumulator, 'observe' | 'absorb'>

/** 얼려 두기 프리스핀 통계(표본). 비율 분모는 따로 적지 않으면 얼림 횟수다. RTP 분모는 유료 스핀 x 총 베팅액. */
export interface FrostReport {
  paidSpins: number
  rounds: number
  entryRate: number
  oddsRange: [number, number]
  meanRangeX: [number, number]
  /** 유료 판 적중률과 그중 베팅 미만 당첨 비율. */
  paidHitRate: number
  paidBelowBetShare: number
  meanFeatureMultiplier: number
  featureSigma: number
  medianFeatureMultiplier: number
  featureUnder10: number
  featureOver100: number
  maxFeatureMultiplier: number
  spinsPerRound: number
  longestRound: number
  maxTotal: number
  overLength: number
  retriggerPerRound: number
  freeHitRate: number
  chains: number
  chainsPerRound: number
  meanSteps: number
  maxSteps: number
  hardCap: number
  overSteps: number
  hardCapHits: number
  tierRates: { high: number; mid: number; low: number }
  targetRates: { symbol: string; rate: number }[]
  belowBetBonusRate: number
  palaceRate: number
  roundsWithAuroraUp: number
  auroraEnd: { level: number; probability: number }[]
  counts: { count: number; probability: number }[]
  stepCounts: { steps: number; probability: number }[]
  roundLengths: { spins: number; probability: number }[]
  cappedSpins: number
  roundsAtCap: number
  /** 기본 판 길 지급: 몬테카를로 몫과 SE, 해석식 값(상한 off). */
  baseCheck: { mc: number; stdErr: number; analytic: number | null }
  breakdown: {
    baseLine: number
    baseScatter: number
    freeLine: number
    freeScatter: number
    bonus: number
    capLoss: number
    total: number
  }
}

export function buildFrostReport(math: GameMath, acc: FrostAccumulatorData, totalBet: number): FrostReport {
  const paid = acc.paidSpins
  const rounds = acc.rounds
  const chains = acc.chains
  const denominator = paid * totalBet
  const rtpOf = (coins: number): number => (denominator === 0 ? 0 : coins / denominator)
  const perRound = (count: number): number => (rounds === 0 ? 0 : count / rounds)
  const perChain = (count: number): number => (chains === 0 ? 0 : count / chains)
  const mean = perRound(acc.featureSum)
  const variance = rounds > 1 ? Math.max(0, (acc.featureSquareSum - rounds * mean * mean) / (rounds - 1)) : 0
  let cumulative = 0
  let median = 0
  for (let bin = 0; bin < acc.featureBins.length; bin += 1) {
    cumulative += acc.featureBins[bin] ?? 0
    if (cumulative * 2 >= rounds) {
      median = bin
      break
    }
  }
  const under10 = acc.featureBins.slice(0, 10).reduce((sum, count) => sum + count, 0)
  const over100 = acc.featureBins.slice(100).reduce((sum, count) => sum + count, 0)
  const baseMean = paid === 0 ? 0 : acc.baseLine / totalBet / paid
  const baseVar = paid > 1 ? Math.max(0, (acc.baseLineSquare - paid * baseMean * baseMean) / (paid - 1)) : 0
  let analytic: number | null = null
  if (math.ways?.from === 'center') analytic = centerWaysAnalytic(math).lines
  return {
    paidSpins: paid,
    rounds,
    entryRate: paid === 0 ? 0 : rounds / paid,
    oddsRange: [FROST_ODDS_LOW, FROST_ODDS_HIGH],
    meanRangeX: [FROST_MEAN_LOW, FROST_MEAN_HIGH],
    paidHitRate: paid === 0 ? 0 : acc.paidHits / paid,
    paidBelowBetShare: acc.paidHits === 0 ? 0 : acc.paidBelowBet / acc.paidHits,
    meanFeatureMultiplier: mean,
    featureSigma: Math.sqrt(variance),
    medianFeatureMultiplier: median,
    featureUnder10: perRound(under10),
    featureOver100: perRound(over100),
    maxFeatureMultiplier: acc.featureMax,
    spinsPerRound: perRound(acc.freeSpins),
    longestRound: acc.longestRound,
    maxTotal: acc.maxTotal,
    overLength: acc.overLength,
    retriggerPerRound: perRound(acc.retriggers),
    freeHitRate: acc.freeSpins === 0 ? 0 : acc.freeHits / acc.freeSpins,
    chains,
    chainsPerRound: perRound(chains),
    meanSteps: perChain(acc.steps),
    maxSteps: acc.maxSteps,
    hardCap: acc.hardCap,
    overSteps: acc.overSteps,
    hardCapHits: acc.hardCapHits,
    tierRates: {
      high: perChain(acc.tierChains[0] ?? 0),
      mid: perChain(acc.tierChains[1] ?? 0),
      low: perChain(acc.tierChains[2] ?? 0),
    },
    targetRates: math.symbols
      .filter((symbol) => acc.targetChains[symbol.id] !== undefined)
      .map((symbol) => ({ symbol: symbol.id, rate: perChain(acc.targetChains[symbol.id] ?? 0) })),
    belowBetBonusRate: perChain(acc.belowBet),
    palaceRate: perChain(acc.palace),
    roundsWithAuroraUp: perRound(acc.roundsWithUp),
    auroraEnd: acc.auroraEnd.map((count, level) => ({ level, probability: perRound(count) })),
    counts: acc.countHist
      .map((count, cells) => ({ count: cells, probability: perChain(count) }))
      .filter((row) => row.probability > 0),
    stepCounts: acc.stepHist
      .map((count, steps) => ({ steps, probability: perChain(count) }))
      .filter((row) => row.probability > 0),
    roundLengths: acc.roundLength
      .map((count, spins) => ({ spins, probability: perRound(count) }))
      .filter((row) => row.probability > 0),
    cappedSpins: acc.cappedSpins,
    roundsAtCap: acc.roundsAtCap,
    baseCheck: { mc: baseMean, stdErr: paid === 0 ? 0 : Math.sqrt(baseVar / paid), analytic },
    breakdown: {
      baseLine: rtpOf(acc.baseLine),
      baseScatter: rtpOf(acc.baseScatter),
      freeLine: rtpOf(acc.freeLine),
      freeScatter: rtpOf(acc.freeScatter),
      bonus: rtpOf(acc.bonus),
      capLoss: rtpOf(acc.capLoss),
      total: rtpOf(acc.totalWin),
    },
  }
}

function pct(value: number, digits = 2): string {
  return `${(value * 100).toFixed(digits)}%`
}

function odds(rate: number): string {
  return rate > 0 ? (1 / rate).toFixed(1) : '-'
}

/** 얼려 두기 프리스핀 게이트(aurora 기획서 §5-5). */
export function frostGates(report: FrostReport): GateRow[] {
  const b = report.breakdown
  const sum = b.baseLine + b.baseScatter + b.freeLine + b.freeScatter + b.bonus
  const oddsValue = report.entryRate > 0 ? 1 / report.entryRate : Infinity
  const gates: GateRow[] = [
    {
      label: `피처 진입 1/${FROST_ODDS_LOW} ~ 1/${FROST_ODDS_HIGH}`,
      pass: oddsValue >= FROST_ODDS_LOW && oddsValue <= FROST_ODDS_HIGH,
      detail: `1/${odds(report.entryRate)} (${report.rounds.toLocaleString('en-US')}라운드 / ${report.paidSpins.toLocaleString('en-US')}스핀)`,
    },
    {
      label: `피처 평균 ${FROST_MEAN_LOW}~${FROST_MEAN_HIGH}배`,
      pass: report.meanFeatureMultiplier >= FROST_MEAN_LOW && report.meanFeatureMultiplier <= FROST_MEAN_HIGH,
      detail: `${report.meanFeatureMultiplier.toFixed(2)}x (중앙값 ${report.medianFeatureMultiplier}x대, 10배 미만 ${pct(report.featureUnder10)}, 100배 이상 ${pct(report.featureOver100)})`,
    },
    {
      label: `얼림 다시 돌리기 ≤ hardCap(${report.hardCap}) (위반 0건)`,
      pass: report.overSteps === 0 && report.hardCapHits === 0 && report.chains > 0,
      detail: `최장 ${report.maxSteps}번, 위반 ${report.overSteps}건, 하드캡 도달 ${report.hardCapHits}건 / ${report.chains.toLocaleString('en-US')}얼림`,
    },
    {
      label: `라운드 판 수 ≤ ${report.maxTotal} (위반 0건)`,
      pass: report.overLength === 0 && report.rounds > 0,
      detail: `최장 ${report.longestRound}판, 위반 ${report.overLength}건`,
    },
    {
      label: `얼림 대상 등급: 상 ≥ ${pct(FROST_HIGH_MIN, 0)} · 하 ≤ ${pct(FROST_LOW_MAX, 0)}`,
      pass: report.tierRates.high >= FROST_HIGH_MIN && report.tierRates.low <= FROST_LOW_MAX,
      detail: `상 ${pct(report.tierRates.high)} · 중 ${pct(report.tierRates.mid)} · 하 ${pct(report.tierRates.low)}`,
    },
    {
      label: `베팅 1배 미만 얼음 보너스(0 포함) ≤ ${pct(FROST_BELOW_BET_MAX, 0)}`,
      pass: report.belowBetBonusRate <= FROST_BELOW_BET_MAX,
      detail: pct(report.belowBetBonusRate),
    },
    {
      label: `유료 판 당첨 중 베팅 미만 당첨 ≤ ${pct(FROST_LDW_MAX, 0)}`,
      pass: report.paidBelowBetShare <= FROST_LDW_MAX,
      detail: `${pct(report.paidBelowBetShare)} (적중률 ${pct(report.paidHitRate)})`,
    },
    {
      label: '분해 합(기본 길 + 구슬 + 프리스핀 길 + 프리스핀 구슬 + 얼음 보너스) = 전체 (분해용 독립 표본)',
      pass: Math.abs(sum - b.total) <= SUM_TOLERANCE * Math.max(1, b.total),
      detail: `${pct(sum, 4)} / 전체 ${pct(b.total, 4)}`,
    },
  ]
  const check = report.baseCheck
  if (check.analytic !== null) {
    const diff = check.mc - check.analytic
    gates.push({
      label: '기본 길 몫: 해석식(가운데부터, 상한 off) vs 몬테카를로 3SE 안',
      pass: Math.abs(diff) <= 3 * check.stdErr + 1e-12,
      detail: `해석 ${pct(check.analytic, 4)} / MC ${pct(check.mc, 4)} (차 ${(diff * 100).toFixed(4)}%p, 3SE ${(3 * check.stdErr * 100).toFixed(4)}%p)`,
    })
  }
  return gates
}

/** 리포트 본문 절. */
export function frostSections(report: FrostReport): string[] {
  const b = report.breakdown
  const table = (head: string[], rows: string[][]): string =>
    [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
  return [
    '## 5-3. 얼려 두기 프리스핀',
    '',
    '보너스·지급은 **총 베팅액 배수**다. 비율 분모는 따로 적지 않으면 얼림 횟수, RTP 몫의 분모는 유료 스핀이다. _(표본 추정)_',
    '',
    table(
      ['지표', '값'],
      [
        ['진입 (유료 스핀)', `1/${odds(report.entryRate)} (${pct(report.entryRate, 4)}) · 허용 1/${report.oddsRange[0]}~1/${report.oddsRange[1]}`],
        ['유료 판 적중률 / 베팅 미만 당첨 비율', `${pct(report.paidHitRate)} / ${pct(report.paidBelowBetShare)}`],
        ['피처 평균 / σ / 최대', `${report.meanFeatureMultiplier.toFixed(2)}x / ${report.featureSigma.toFixed(2)}x / ${report.maxFeatureMultiplier.toFixed(1)}x`],
        ['피처 중앙값 · 10배 미만 · 100배 이상', `${report.medianFeatureMultiplier}x대 · ${pct(report.featureUnder10)} · ${pct(report.featureOver100)}`],
        ['라운드 평균 판 수 / 최장', `${report.spinsPerRound.toFixed(2)} / ${report.longestRound} (상한 ${report.maxTotal})`],
        ['리트리거 (라운드당)', report.retriggerPerRound.toFixed(4)],
        ['프리스핀 당첨률(얼림 발생)', pct(report.freeHitRate)],
        ['라운드당 얼림 횟수', report.chainsPerRound.toFixed(2)],
        ['얼림 1회 평균 다시 돌리기 / 최장', `${report.meanSteps.toFixed(2)} / ${report.maxSteps} (hardCap ${report.hardCap})`],
        ['얼림 대상 등급 (상 / 중 / 하)', `${pct(report.tierRates.high)} / ${pct(report.tierRates.mid)} / ${pct(report.tierRates.low)}`],
        ['얼림 대상 그림', report.targetRates.map((row) => `${row.symbol} ${pct(row.rate, 1)}`).join(', ')],
        ['베팅 1배 미만 얼음 보너스(0 포함)', pct(report.belowBetBonusRate)],
        ['궁전 완성(판 전체)', pct(report.palaceRate, 3)],
        ['오로라 1회 이상 오른 라운드', pct(report.roundsWithAuroraUp)],
        ['라운드 끝 오로라 단계', report.auroraEnd.map((row) => `${row.level}단 ${pct(row.probability)}`).join(' · ')],
        ['지급 상한 도달', `${report.cappedSpins.toLocaleString('en-US')}스핀 · 상한 도달 라운드 ${report.roundsAtCap.toLocaleString('en-US')} · 캡 on/off 차 ${pct(b.capLoss, 4)}`],
        [
          '기본 길 몫 해석식 vs MC',
          report.baseCheck.analytic === null
            ? '-'
            : `${pct(report.baseCheck.analytic, 4)} / ${pct(report.baseCheck.mc, 4)} (SE ${(report.baseCheck.stdErr * 100).toFixed(4)}%p)`,
        ],
      ],
    ),
    '',
    '### 지급 분해',
    '',
    table(
      ['출처', 'RTP 몫'],
      [
        ['기본 길 (유료 판)', pct(b.baseLine, 4)],
        ['오로라 구슬 (유료 판)', pct(b.baseScatter, 4)],
        ['프리스핀 길', pct(b.freeLine, 4)],
        ['프리스핀 구슬', pct(b.freeScatter, 4)],
        ['얼음 보너스', pct(b.bonus, 4)],
        ['캡 손실', `−${pct(b.capLoss, 4)}`],
        ['합계 (표본)', pct(b.total, 4)],
      ],
    ),
    '',
    '### 얼린 칸 수 분포',
    '',
    table(['칸', '확률'], report.counts.map((row) => [String(row.count), pct(row.probability, 3)])),
    '',
    '### 다시 돌리기 단계 수 분포',
    '',
    table(['단계', '확률'], report.stepCounts.map((row) => [String(row.steps), pct(row.probability, 3)])),
    '',
    '### 라운드 판 수 분포',
    '',
    table(['판', '확률'], report.roundLengths.map((row) => [String(row.spins), pct(row.probability, 3)])),
    '',
  ]
}
