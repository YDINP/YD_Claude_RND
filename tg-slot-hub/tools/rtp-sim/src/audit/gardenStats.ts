import type { GameMath, GardenSeed, GardenTrigger } from '@tgslot/slot-engine'
import type { RoundSpin } from './spinner.js'
import type { GateRow } from './types.js'

/**
 * 자라는 정원(growBoard) 팩 전용 통계·게이트·리포트 절. 기획서 `docs/PLAN_greenhouse-garden.md` §5-3.
 * 값은 전부 실제 지급 코인이고 RTP 분모는 유료 스핀 × 총 베팅액이다.
 */

/** 게이트 기준(§5-1·§5-3). */
export const GARDEN_GATES = {
  entryOddsLow: 120,
  entryOddsHigh: 250,
  meanPayLow: 30,
  meanPayHigh: 80,
  meanLengthLow: 10,
  meanLengthHigh: 12,
  maxRetriggerPerSpin: 0.1,
  maxRetriggerRounds: 0.15,
  first8Low: 0.45,
  first8High: 0.75,
  max8Share: 0.5,
  maxTopTierShare: 0.3,
  maxContinue: 0.55,
  maxMeanChain: 2.5,
  max16StepRate: 0.005,
  minObservedMax: 500,
} as const

/** 프리스핀 라운드 지급 분포 통(1배 단위, 마지막 칸은 그 이상). */
const PAY_BINS = 2001
const SUM_TOLERANCE = 1e-9

function addAt(values: number[], index: number, amount = 1): void {
  values[index] = (values[index] ?? 0) + amount
}

function gardenOf(features: readonly { type: string }[]): GardenTrigger | undefined {
  for (const feature of features) if (feature.type === 'garden') return feature as GardenTrigger
  return undefined
}

export class GardenAccumulator {
  readonly tiers: number
  readonly maxCascades: number
  readonly maxSpins: number
  paidSpins = 0
  rounds = 0
  totalWin = 0
  baseCluster = 0
  baseSeedExtra = 0
  baseScatter = 0
  freeWin = 0
  topUp = 0
  topUpRounds = 0
  baseHits = 0
  basePopSteps = 0
  baseContinue = 0
  baseChainSpins = 0
  growOnlySteps = 0
  allSteps = 0
  baseSeedsAppeared = 0
  baseSeedsBloomed = 0
  fsSeedsBloomed = 0
  seedCapHits = 0
  seededWins = 0
  fsSpins = 0
  fsRetriggers = 0
  maxRetriggerRounds = 0
  fs16Spins = 0
  spins8 = 0
  reached8Rounds = 0
  first8Sum = 0
  endSeeds = 0
  endTopTier = 0
  suns = 0
  cappedRounds = 0
  fsPaySum = 0
  fsPaySquareSum = 0
  fsPayMax = 0
  roundMax = 0
  overLength = 0
  /** 유료 스핀 마지막 판 크기 분포(4~8). */
  readonly baseFinal: number[] = [0, 0, 0, 0, 0]
  /** 프리스핀 시작 크기 분포(4~8). */
  readonly startSize: number[] = [0, 0, 0, 0, 0]
  /** 프리스핀 라운드 길이 분포(0~maxSpins+1, 마지막 칸은 초과). */
  readonly lengths: number[]
  /** 라운드당 햇살 횟수 분포(0~20). */
  readonly sunCounts: number[] = new Array<number>(21).fill(0)
  /** 개화한 씨앗 등급 분포(seedTiers 인덱스). */
  readonly bloomTiers: number[]
  readonly payBins: number[] = new Array<number>(PAY_BINS).fill(0)

  constructor(math: GameMath) {
    const config = math.growBoard
    if (config === undefined) throw new RangeError('growBoard 설정이 없는 게임에 GardenAccumulator를 만들었다')
    this.tiers = config.seedTiers.length
    this.maxCascades = config.maxCascades
    this.maxSpins = Math.max(...Object.values(config.bonus.spinsByCount)) + config.bonus.retriggerSpins * config.bonus.maxRetriggers
    this.lengths = new Array<number>(this.maxSpins + 2).fill(0)
    this.bloomTiers = new Array<number>(this.tiers).fill(0)
  }

  /** 단계를 따라가며 개화한 씨앗의 등급을 센다(성장 때 기존 씨앗 +1, 새 씨앗 추가). */
  private countBlooms(garden: GardenTrigger, free: boolean): void {
    const maxTier = this.tiers - 1
    let seeds: GardenSeed[] = garden.startSeeds.map((seed) => ({ ...seed }))
    for (const step of garden.steps) {
      if (step.bloomed.length > 0) {
        const used = new Set(step.bloomed.map(([reel, row]) => row * 64 + reel))
        for (const seed of seeds) if (used.has(seed.row * 64 + seed.reel)) addAt(this.bloomTiers, seed.tier)
        seeds = seeds.filter((seed) => !used.has(seed.row * 64 + seed.reel))
        if (free) this.fsSeedsBloomed += step.bloomed.length
        else this.baseSeedsBloomed += step.bloomed.length
      }
      if (step.grow !== undefined) {
        for (const seed of seeds) seed.tier = Math.min(maxTier, seed.tier + 1)
        seeds.push(...step.grow.seeds.map((seed) => ({ ...seed })))
        if (!free) this.baseSeedsAppeared += step.grow.seeds.length
      }
    }
  }

  observe(round: readonly RoundSpin[], totalBet: number, math: GameMath): void {
    const config = math.growBoard
    if (config === undefined) return
    const paid = round[0]
    if (paid === undefined) return
    this.paidSpins += 1
    let roundWin = 0
    let fsPay = 0
    let fsSpins = 0
    let retriggers = 0
    let first8 = -1
    let sunCount = 0
    let last: GardenTrigger | undefined

    for (const entry of round) {
      const spin = entry.spin
      const garden = gardenOf(spin.features)
      roundWin += spin.totalWin
      if (garden === undefined) continue
      const popSteps = garden.steps.filter((step) => step.wins.length > 0).length
      this.allSteps += garden.steps.length
      this.growOnlySteps += garden.steps.filter((step) => step.wins.length === 0).length
      for (const step of garden.steps) {
        for (const win of step.wins) {
          if (win.seed === undefined) continue
          this.seededWins += 1
          if (win.seed >= config.clusterSeedCap) this.seedCapHits += 1
        }
      }
      this.countBlooms(garden, entry.isFreeSpin)
      if (spin.features.some((feature) => feature.type === 'winCapped')) this.cappedRounds += 1

      if (!entry.isFreeSpin) {
        this.totalWin += spin.totalWin
        addAt(this.baseFinal, garden.final.size - 4)
        if (spin.totalWin > 0) this.baseHits += 1
        this.basePopSteps += popSteps
        this.baseContinue += Math.max(0, popSteps - 1)
        if (popSteps > 0) this.baseChainSpins += 1
        for (const step of garden.steps) {
          for (const win of step.wins) {
            const base = Math.round(win.multiplier * totalBet)
            this.baseCluster += Math.min(base, win.win)
            this.baseSeedExtra += Math.max(0, win.win - base)
          }
        }
        this.baseScatter += spin.scatterWin
        const carry = spin.nextState?.carry?.garden
        if (carry !== undefined) {
          this.rounds += 1
          addAt(this.startSize, carry.stage)
        }
        continue
      }

      fsSpins += 1
      this.fsSpins += 1
      this.totalWin += spin.totalWin
      this.freeWin += spin.totalWin
      fsPay += spin.totalWin
      if (popSteps >= this.maxCascades) this.fs16Spins += 1
      if (garden.final.size === 8) {
        this.spins8 += 1
        if (first8 < 0) first8 = fsSpins
      }
      sunCount += garden.sun?.length ?? 0
      for (const feature of spin.features) {
        if (feature.type === 'freeSpins' && feature.retrigger) retriggers += 1
        if (feature.type === 'gardenTopUp') {
          this.topUp += feature.amount
          this.topUpRounds += 1
        }
      }
      last = garden
    }

    if (round.length > 1) {
      this.fsRetriggers += retriggers
      if (retriggers >= config.bonus.maxRetriggers && config.bonus.maxRetriggers > 0) this.maxRetriggerRounds += 1
      addAt(this.lengths, Math.min(fsSpins, this.maxSpins + 1))
      if (fsSpins > this.maxSpins) this.overLength += 1
      addAt(this.sunCounts, Math.min(sunCount, 20))
      this.suns += sunCount
      if (first8 > 0) {
        this.reached8Rounds += 1
        this.first8Sum += first8 / fsSpins
      }
      const multiple = (paid.spin.totalWin + fsPay) / totalBet
      this.fsPaySum += multiple
      this.fsPaySquareSum += multiple * multiple
      this.fsPayMax = Math.max(this.fsPayMax, multiple)
      addAt(this.payBins, Math.min(PAY_BINS - 1, Math.floor(multiple)))
      for (const seed of last?.seeds ?? []) {
        this.endSeeds += 1
        if (seed.tier === this.tiers - 1) this.endTopTier += 1
      }
    }
    this.roundMax = Math.max(this.roundMax, roundWin / totalBet)
  }

  absorb(other: GardenAccumulatorData): void {
    const keys = [
      'paidSpins', 'rounds', 'totalWin', 'baseCluster', 'baseSeedExtra', 'baseScatter', 'freeWin', 'topUp', 'topUpRounds',
      'baseHits', 'basePopSteps', 'baseContinue', 'baseChainSpins', 'growOnlySteps', 'allSteps', 'baseSeedsAppeared',
      'baseSeedsBloomed', 'fsSeedsBloomed', 'seedCapHits', 'seededWins', 'fsSpins', 'fsRetriggers', 'maxRetriggerRounds',
      'fs16Spins', 'spins8', 'reached8Rounds', 'first8Sum', 'endSeeds', 'endTopTier', 'suns', 'cappedRounds', 'fsPaySum',
      'fsPaySquareSum', 'overLength',
    ] as const
    for (const key of keys) this[key] += other[key]
    this.fsPayMax = Math.max(this.fsPayMax, other.fsPayMax)
    this.roundMax = Math.max(this.roundMax, other.roundMax)
    for (const name of ['baseFinal', 'startSize', 'lengths', 'sunCounts', 'bloomTiers', 'payBins'] as const) {
      other[name].forEach((count, index) => addAt(this[name], index, count))
    }
  }
}

export type GardenAccumulatorData = Omit<GardenAccumulator, 'observe' | 'absorb'>

export interface GardenReport {
  paidSpins: number
  rounds: number
  entryRate: number
  hitRate: number
  /** 유료 스핀 마지막 판이 그 크기 이상(5×5·6×6·7×7·8×8)인 비율. */
  growthAtLeast: number[]
  growOnlyStepShare: number
  continueProbability: number
  meanChain: number
  baseSeedsPerSpin: number
  baseBloomsPerSpin: number
  bloomTierShare: number[]
  seedCapRate: number
  startSizeShare: number[]
  meanStartSize: number
  lengthShare: { spins: number; probability: number }[]
  meanLength: number
  maxLength: number
  overLength: number
  maxSpins: number
  retriggerPerSpin: number
  maxRetriggerRoundShare: number
  meanPay: number
  medianPay: number
  paySigma: number
  maxPay: number
  under10Share: number
  sunsPerRound: number
  sunCountShare: { suns: number; probability: number }[]
  reach8Share: number
  first8Position: number
  spins8Share: number
  topTierEndShare: number
  fs16Rate: number
  cappedRounds: number
  roundMax: number
  breakdown: {
    baseCluster: number
    baseSeedExtra: number
    baseScatter: number
    freeSpins: number
    topUp: number
    total: number
  }
  seedTiers: number[]
}

export function buildGardenReport(math: GameMath, acc: GardenAccumulatorData, totalBet: number): GardenReport {
  const config = math.growBoard
  if (config === undefined) throw new RangeError('growBoard 설정이 없다')
  const paid = acc.paidSpins
  const rounds = acc.rounds
  const denominator = paid * totalBet
  const rtpOf = (coins: number): number => (denominator === 0 ? 0 : coins / denominator)
  const perPaid = (count: number): number => (paid === 0 ? 0 : count / paid)
  const perRound = (count: number): number => (rounds === 0 ? 0 : count / rounds)
  const meanPay = perRound(acc.fsPaySum)
  const variance = rounds > 1 ? Math.max(0, (acc.fsPaySquareSum - rounds * meanPay * meanPay) / (rounds - 1)) : 0
  let median = 0
  let seen = 0
  for (let i = 0; i < acc.payBins.length; i += 1) {
    seen += acc.payBins[i] ?? 0
    if (seen * 2 >= rounds) {
      median = i + 0.5
      break
    }
  }
  const lengthTotal = acc.lengths.reduce((sum, count, n) => sum + count * n, 0)
  let maxLength = 0
  acc.lengths.forEach((count, n) => {
    if (count > 0) maxLength = n
  })
  const blooms = acc.bloomTiers.reduce((a, b) => a + b, 0)
  return {
    paidSpins: paid,
    rounds,
    entryRate: perPaid(rounds),
    hitRate: perPaid(acc.baseHits),
    growthAtLeast: [1, 2, 3, 4].map((k) => perPaid(acc.baseFinal.slice(k).reduce((a, b) => a + b, 0))),
    growOnlyStepShare: acc.allSteps === 0 ? 0 : acc.growOnlySteps / acc.allSteps,
    continueProbability: acc.basePopSteps === 0 ? 0 : acc.baseContinue / acc.basePopSteps,
    meanChain: acc.baseChainSpins === 0 ? 0 : acc.basePopSteps / acc.baseChainSpins,
    baseSeedsPerSpin: perPaid(acc.baseSeedsAppeared),
    baseBloomsPerSpin: perPaid(acc.baseSeedsBloomed),
    bloomTierShare: acc.bloomTiers.map((count) => (blooms === 0 ? 0 : count / blooms)),
    seedCapRate: acc.seededWins === 0 ? 0 : acc.seedCapHits / acc.seededWins,
    startSizeShare: acc.startSize.map((count) => perRound(count)),
    meanStartSize: perRound(acc.startSize.reduce((sum, count, stage) => sum + count * (stage + 4), 0)),
    lengthShare: acc.lengths
      .map((count, spins) => ({ spins, probability: perRound(count) }))
      .filter((row) => row.probability > 0),
    meanLength: perRound(lengthTotal),
    maxLength,
    overLength: acc.overLength,
    maxSpins: acc.maxSpins,
    retriggerPerSpin: acc.fsSpins === 0 ? 0 : acc.fsRetriggers / acc.fsSpins,
    maxRetriggerRoundShare: perRound(acc.maxRetriggerRounds),
    meanPay,
    medianPay: median,
    paySigma: Math.sqrt(variance),
    maxPay: acc.fsPayMax,
    under10Share: perRound(acc.topUpRounds),
    sunsPerRound: perRound(acc.suns),
    sunCountShare: acc.sunCounts.map((count, suns) => ({ suns, probability: perRound(count) })).filter((row) => row.probability > 0),
    reach8Share: perRound(acc.reached8Rounds),
    first8Position: acc.reached8Rounds === 0 ? 0 : acc.first8Sum / acc.reached8Rounds,
    spins8Share: acc.fsSpins === 0 ? 0 : acc.spins8 / acc.fsSpins,
    topTierEndShare: acc.endSeeds === 0 ? 0 : acc.endTopTier / acc.endSeeds,
    fs16Rate: acc.fsSpins === 0 ? 0 : acc.fs16Spins / acc.fsSpins,
    cappedRounds: acc.cappedRounds,
    roundMax: acc.roundMax,
    breakdown: {
      baseCluster: rtpOf(acc.baseCluster),
      baseSeedExtra: rtpOf(acc.baseSeedExtra),
      baseScatter: rtpOf(acc.baseScatter),
      freeSpins: rtpOf(acc.freeWin),
      topUp: rtpOf(acc.topUp),
      total: rtpOf(acc.totalWin),
    },
    seedTiers: [...config.seedTiers],
  }
}

const pct = (value: number, digits = 2): string => `${(value * 100).toFixed(digits)}%`
const num = (value: number): string => value.toLocaleString('en-US')
const odds = (rate: number): string => (rate > 0 ? `1/${(1 / rate).toFixed(1)}` : '-')

/** 정원 게이트. 기획서 §5-3. */
export function gardenGates(report: GardenReport): GateRow[] {
  const g = GARDEN_GATES
  const entryOdds = report.entryRate > 0 ? 1 / report.entryRate : Infinity
  const b = report.breakdown
  const sum = b.baseCluster + b.baseSeedExtra + b.baseScatter + b.freeSpins
  return [
    {
      label: `정원 프리스핀 진입 1/${g.entryOddsLow} ~ 1/${g.entryOddsHigh}`,
      pass: entryOdds >= g.entryOddsLow && entryOdds <= g.entryOddsHigh,
      detail: `${odds(report.entryRate)} (${num(report.rounds)}라운드 / ${num(report.paidSpins)}스핀)`,
    },
    {
      label: `프리스핀 평균 지급 ${g.meanPayLow}~${g.meanPayHigh}× (진입 스핀 포함)`,
      pass: report.meanPay >= g.meanPayLow && report.meanPay <= g.meanPayHigh,
      detail: `${report.meanPay.toFixed(2)}× (중앙값 ≈ ${report.medianPay.toFixed(1)}×, σ ${report.paySigma.toFixed(1)}×, 최대 ${report.maxPay.toFixed(1)}×)`,
    },
    {
      label: `프리스핀 평균 길이 ${g.meanLengthLow}~${g.meanLengthHigh}스핀, 최장 ≤ ${report.maxSpins} (초과 0건)`,
      pass: report.meanLength >= g.meanLengthLow && report.meanLength <= g.meanLengthHigh && report.overLength === 0,
      detail: `평균 ${report.meanLength.toFixed(2)} · 최장 ${report.maxLength} · 초과 ${report.overLength}`,
    },
    {
      label: `리트리거 스핀당 ≤ ${pct(g.maxRetriggerPerSpin, 0)} · 최대 리트리거 라운드 ≤ ${pct(g.maxRetriggerRounds, 0)}`,
      pass: report.retriggerPerSpin <= g.maxRetriggerPerSpin && report.maxRetriggerRoundShare <= g.maxRetriggerRounds,
      detail: `${pct(report.retriggerPerSpin)} · ${pct(report.maxRetriggerRoundShare)} (4 × p̂ = ${(4 * report.retriggerPerSpin).toFixed(3)} < 1)`,
    },
    {
      label: `8×8 첫 도달 라운드의 ${pct(g.first8Low, 0)}~${pct(g.first8High, 0)} 지점 · 8×8 스핀 비율 ≤ ${pct(g.max8Share, 0)}`,
      pass: report.first8Position >= g.first8Low && report.first8Position <= g.first8High && report.spins8Share <= g.max8Share,
      detail: `${pct(report.first8Position)} 지점(도달 라운드 ${pct(report.reach8Share)}) · ${pct(report.spins8Share)}`,
    },
    {
      label: `라운드 끝 남은 씨앗 중 최고 등급 비율 ≤ ${pct(g.maxTopTierShare, 0)}`,
      pass: report.topTierEndShare <= g.maxTopTierShare,
      detail: pct(report.topTierEndShare),
    },
    {
      label: `기본 게임 P(지속) ≤ ${g.maxContinue} · 평균 연쇄 ≤ ${g.maxMeanChain}`,
      pass: report.continueProbability <= g.maxContinue && report.meanChain <= g.maxMeanChain,
      detail: `${report.continueProbability.toFixed(4)} · ${report.meanChain.toFixed(3)}`,
    },
    {
      label: `프리스핀 팝 단계 상한 도달 < ${pct(g.max16StepRate, 1)}`,
      pass: report.fs16Rate < g.max16StepRate,
      detail: pct(report.fs16Rate, 4),
    },
    {
      label: `라운드 최대 관측 ≥ ${g.minObservedMax}× (상한 5,000×)`,
      pass: report.roundMax >= g.minObservedMax,
      detail: `${report.roundMax.toFixed(1)}× · winCapped ${num(report.cappedRounds)}회`,
    },
    {
      label: '기본 클러스터 + 씨앗 추가분 + 물뿌리개 + 정원 프리스핀 = 전체 (분해용 독립 표본)',
      pass: Math.abs(sum - b.total) <= SUM_TOLERANCE * Math.max(1, b.total) + 1e-12,
      detail: `${pct(b.baseCluster, 3)} + ${pct(b.baseSeedExtra, 3)} + ${pct(b.baseScatter, 3)} + ${pct(b.freeSpins, 3)} = ${pct(sum, 3)} / 전체 ${pct(b.total, 3)}`,
    },
  ]
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}

/** 리포트 «자라는 정원» 절. */
export function gardenSections(report: GardenReport): string[] {
  const b = report.breakdown
  const sizes = ['4×4', '5×5', '6×6', '7×7', '8×8']
  return [
    '## 5-3. 자라는 정원',
    '',
    '배당·지급은 **총 베팅액 배수**다. 비율의 분모는 따로 적지 않으면 유료 스핀(성장·씨앗) 또는 정원 프리스핀 라운드(프리스핀)다. _(표본 추정)_',
    '',
    '### 지급 분해',
    '',
    table(
      ['출처', 'RTP 몫'],
      [
        ['기본 클러스터 (씨앗 없이)', pct(b.baseCluster, 3)],
        ['기본 씨앗 추가분', pct(b.baseSeedExtra, 3)],
        ['물뿌리개 지급 (기본)', pct(b.baseScatter, 3)],
        ['정원 프리스핀 (최저 보장 포함)', pct(b.freeSpins, 3)],
        ['  └ 최저 보장', pct(b.topUp, 3)],
        ['합계', pct(b.total, 3)],
      ],
    ),
    '',
    '### 성장·연쇄·씨앗 (기본 게임)',
    '',
    table(
      ['지표', '값'],
      [
        ['적중률 (유료 스핀 지급 > 0)', pct(report.hitRate)],
        ['판 크기 ≥ 5×5 / 6×6 / 7×7 / 8×8', report.growthAtLeast.map((v) => pct(v, 3)).join(' / ')],
        ['성장 전용 단계 비율 (전체 단계 중)', pct(report.growOnlyStepShare)],
        ['연쇄 P(지속) / 평균 연쇄', `${report.continueProbability.toFixed(4)} / ${report.meanChain.toFixed(3)}`],
        ['씨앗 등장 / 개화 (유료 스핀당)', `${report.baseSeedsPerSpin.toFixed(4)} / ${report.baseBloomsPerSpin.toFixed(4)}`],
        [
          '개화 등급 분포 (전체)',
          report.bloomTierShare.map((v, i) => `×${report.seedTiers[i]} ${pct(v, 1)}`).join(' · '),
        ],
        ['씨앗 합 상한 도달 (씨앗 붙은 클러스터 중)', pct(report.seedCapRate, 4)],
      ],
    ),
    '',
    '### 정원 프리스핀',
    '',
    table(
      ['지표', '값'],
      [
        ['진입 (유료 스핀)', `${odds(report.entryRate)} (${num(report.rounds)}라운드)`],
        ['시작 크기 분포', report.startSizeShare.map((v, i) => `${sizes[i]} ${pct(v, 1)}`).join(' · ') + ` (평균 ${report.meanStartSize.toFixed(2)})`],
        ['평균 지급 / 중앙값 / 최대', `${report.meanPay.toFixed(2)}× / ≈${report.medianPay.toFixed(1)}× / ${report.maxPay.toFixed(1)}× (σ ${report.paySigma.toFixed(1)}×)`],
        ['최저 보장 발동 (프리스핀 합이 ×10 미만이던 라운드)', pct(report.under10Share)],
        ['평균 길이 / 최장 / 초과', `${report.meanLength.toFixed(2)} / ${report.maxLength} / ${report.overLength}`],
        ['길이 분포', report.lengthShare.map((row) => `${row.spins}:${pct(row.probability, 1)}`).join(' · ')],
        ['리트리거 (스핀당) / 최대 리트리거 라운드', `${pct(report.retriggerPerSpin)} / ${pct(report.maxRetriggerRoundShare)}`],
        ['8×8 도달 라운드 / 첫 도달 지점 / 8×8 스핀 비율', `${pct(report.reach8Share)} / ${pct(report.first8Position)} / ${pct(report.spins8Share)}`],
        ['햇살 (라운드당)', `${report.sunsPerRound.toFixed(2)}회 — ${report.sunCountShare.map((row) => `${row.suns}:${pct(row.probability, 1)}`).join(' · ')}`],
        ['라운드 끝 최고 등급 씨앗 비율', pct(report.topTierEndShare)],
        ['팝 단계 상한 도달 (프리스핀 스핀)', pct(report.fs16Rate, 4)],
        ['라운드 최대 관측 / winCapped', `${report.roundMax.toFixed(1)}× / ${num(report.cappedRounds)}회`],
      ],
    ),
    '',
  ]
}
