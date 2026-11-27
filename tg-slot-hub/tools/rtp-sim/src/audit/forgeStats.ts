import type { ForgeRailTrigger, GameMath } from '@tgslot/slot-engine'
import type { RoundSpin } from './spinner.js'
import type { GateRow } from './types.js'

/** 게이트 기준. 기획서 `PLAN_volcano-forge.md` §5-1·§5-3. */
export const FORGE_GATES = {
  minEntryOdds: 120,
  maxEntryOdds: 250,
  minRoundMean: 30,
  maxRoundMean: 80,
  /** 불씨 값 분포 |z| 상한 (3SE). */
  maxValueZ: 3,
} as const

/** 프리스핀 종료 화로 합계 구간 경계. 마지막 구간은 위가 열려 있다. */
export const FORGE_HEAT_BUCKETS = [0, 1, 10, 30, 60, 100, 200, 300] as const

function addAt(values: number[], index: number, amount = 1): void {
  values[index] = (values[index] ?? 0) + amount
}

function bump(map: Map<number, number>, key: number, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount)
}

function heatBucket(heat: number): number {
  let bucket = 0
  FORGE_HEAT_BUCKETS.forEach((edge, index) => {
    if (heat >= edge) bucket = index
  })
  return bucket
}

/**
 * 화로 배율 줄 팩 전용 통. 라운드(유료 스핀 + 프리스핀)를 하나씩 받아 불씨·화로 가득·합계·라운드 지급·캡을 센다.
 * 값은 전부 실제 지급 코인이다. 필드는 수·배열·Map이라 워커 사이 구조화 복제로 넘겨 `absorb`로 합친다.
 */
export class ForgeAccumulator {
  readonly heatCap: number
  readonly maxRoundSpins: number
  readonly retriggerSpins: number
  readonly valueWeights: [number, number][]
  paidSpins = 0
  paidWinSpins = 0
  paidSubBetWins = 0
  /** 유료 스핀: 연쇄 지급(배율 전) · 배율·상한 적용 후 연쇄 지급 · 스캐터 지급. */
  baseLines = 0
  baseBoosted = 0
  baseScatter = 0
  baseEmberSpins = 0
  baseEmbers = 0
  baseFulls = 0
  freeSpins = 0
  freeLines = 0
  freeBoosted = 0
  freeScatter = 0
  freeEmbers = 0
  freeFulls = 0
  freeWinSpins = 0
  totalWin = 0
  rounds = 0
  roundWin = 0
  roundSquare = 0
  maxRound = 0
  overLength = 0
  retriggers = 0
  cappedRetriggers = 0
  fullRounds = 0
  dryRounds = 0
  capRounds = 0
  heatCapSpins = 0
  winCappedSpins = 0
  capLoss = 0
  readonly values = new Map<number, number>()
  readonly roundLengths = new Map<number, number>()
  readonly roundEmbers = new Map<number, number>()
  readonly startHeat = new Map<number, number>()
  readonly finalHeat: number[] = new Array<number>(FORGE_HEAT_BUCKETS.length).fill(0)

  constructor(math: GameMath) {
    const config = math.forgeRail
    if (config === undefined) throw new RangeError('forgeRail 설정이 없는 게임에 ForgeAccumulator를 만들었다')
    this.heatCap = config.heatCap
    this.maxRoundSpins = config.maxRoundSpins
    this.retriggerSpins = config.retrigger?.spins ?? 0
    this.valueWeights = Object.entries(config.values).map(([value, weight]) => [Number(value), weight])
  }

  observe(round: readonly RoundSpin[], totalBet: number): void {
    let length = 0
    let embers = 0
    let fulls = 0
    let wins = 0
    let free = 0
    let lastHeat = 0
    let capped = false
    for (const entry of round) {
      const spin = entry.spin
      this.totalWin += spin.totalWin
      let rail: ForgeRailTrigger | undefined
      for (const feature of spin.features) {
        if (feature.type === 'forgeRail') rail = feature
        else if (feature.type === 'winCapped') {
          this.winCappedSpins += 1
          this.capLoss += feature.requested - feature.granted
          if (entry.isFreeSpin) capped = true
        } else if (feature.type === 'freeSpins' && feature.retrigger) this.retriggers += 1
        else if (feature.type === 'freeSpinsCapped' && entry.isFreeSpin) this.cappedRetriggers += 1
      }
      const boosted = spin.totalWin - spin.scatterWin
      for (const ember of rail?.embers ?? []) bump(this.values, ember.value)
      if (rail !== undefined && rail.heatAfter >= this.heatCap) this.heatCapSpins += 1
      if (!entry.isFreeSpin) {
        this.paidSpins += 1
        this.baseLines += spin.lineWin
        this.baseBoosted += boosted
        this.baseScatter += spin.scatterWin
        if (spin.totalWin > 0) {
          this.paidWinSpins += 1
          if (spin.totalWin < totalBet) this.paidSubBetWins += 1
        }
        if (rail !== undefined && rail.embers.length > 0) {
          this.baseEmberSpins += 1
          this.baseEmbers += rail.embers.length
          this.baseFulls += rail.fulls.length
        }
        const start = spin.nextState?.carry?.forge
        if (start !== undefined) bump(this.startHeat, start.heat)
        continue
      }
      length += 1
      this.freeSpins += 1
      this.freeLines += spin.lineWin
      this.freeBoosted += boosted
      this.freeScatter += spin.scatterWin
      free += spin.totalWin
      if (spin.lineWin > 0) {
        wins += 1
        this.freeWinSpins += 1
      }
      if (rail !== undefined) {
        embers += rail.embers.length
        fulls += rail.fulls.length
        lastHeat = rail.heatAfter
      }
    }
    this.freeEmbers += embers
    this.freeFulls += fulls
    if (length === 0) return
    this.rounds += 1
    this.roundWin += free
    const multiple = free / totalBet
    this.roundSquare += multiple * multiple
    if (multiple > this.maxRound) this.maxRound = multiple
    if (length > this.maxRoundSpins) this.overLength += 1
    bump(this.roundLengths, length)
    bump(this.roundEmbers, Math.min(embers, 20))
    if (fulls > 0) this.fullRounds += 1
    if (wins <= 1) this.dryRounds += 1
    if (capped) this.capRounds += 1
    addAt(this.finalHeat, heatBucket(lastHeat))
  }

  absorb(other: ForgeAccumulatorData): void {
    const sums = [
      'paidSpins', 'paidWinSpins', 'paidSubBetWins', 'baseLines', 'baseBoosted', 'baseScatter', 'baseEmberSpins',
      'baseEmbers', 'baseFulls', 'freeSpins', 'freeLines', 'freeBoosted', 'freeScatter', 'freeEmbers', 'freeFulls',
      'freeWinSpins', 'totalWin', 'rounds', 'roundWin', 'roundSquare', 'overLength', 'retriggers', 'cappedRetriggers',
      'fullRounds', 'dryRounds', 'capRounds', 'heatCapSpins', 'winCappedSpins', 'capLoss',
    ] as const
    for (const key of sums) this[key] += other[key]
    this.maxRound = Math.max(this.maxRound, other.maxRound)
    for (const [map, from] of [
      [this.values, other.values],
      [this.roundLengths, other.roundLengths],
      [this.roundEmbers, other.roundEmbers],
      [this.startHeat, other.startHeat],
    ] as const) {
      for (const [key, count] of from) bump(map, key, count)
    }
    other.finalHeat.forEach((count, index) => addAt(this.finalHeat, index, count))
  }
}

export type ForgeAccumulatorData = Omit<ForgeAccumulator, 'observe' | 'absorb'>

export interface ForgeValueRow {
  value: number
  hits: number
  rate: number
  expected: number
  z: number
}

export interface ForgeReport {
  paidSpins: number
  freeSpins: number
  heatCap: number
  maxRoundSpins: number
  /** 같은 표본의 RTP(총 지급 / 유료 스핀 × 베팅). 분해 합 검사용. */
  sampleRtp: number
  breakdown: {
    /** 기본 게임 연쇄 지급 ×1 (배율 전). */
    baseLines: number
    /** 기본 게임 불씨 배율 몫 = 배율·상한 적용 후 − 배율 전. */
    emberBoost: number
    baseScatter: number
    /** 프리스핀 전체 지급(연쇄·배율·모루). */
    freeSpins: number
    freeLines: number
    freeBoost: number
    freeScatter: number
  }
  hitRate: number
  /** 당첨 스핀 중 베팅 미만 비율 (유료 스핀). */
  subBetWinShare: number
  /** 기본 게임 당첨 스핀 중 불씨가 난 비율. */
  baseEmberRate: number
  baseEmbersPerSpin: number
  baseFullSpins: number
  freeEmbersPerSpin: number
  entryRate: number
  rounds: number
  roundMean: number
  roundSigma: number
  maxRound: number
  meanLength: number
  maxLength: number
  overLength: number
  embersPerRound: number
  fullsPerRound: number
  fullRoundRate: number
  /** 당첨 프리스핀이 1번 이하인 라운드 비율 (K14). */
  dryRoundRate: number
  /** 프리스핀 1회당 추가 스핀 발생률. */
  retriggerRate: number
  /** `추가 스핀 수 × 발생률`. 1 미만이어야 라운드가 짧게 끝난다. */
  retriggerGrowth: number
  cappedRetriggers: number
  heatCapRate: number
  capRoundRate: number
  winCappedRate: number
  winCappedSpins: number
  capLossRtp: number
  values: ForgeValueRow[]
  maxValueZ: number
  lengths: { length: number; rounds: number; probability: number }[]
  startHeat: { heat: number; rounds: number; probability: number }[]
  finalHeat: { range: string; rounds: number; probability: number }[]
  embersDistribution: { embers: string; rounds: number; probability: number }[]
}

export function buildForgeReport(acc: ForgeAccumulatorData, totalBet: number): ForgeReport {
  const paid = acc.paidSpins
  const denominator = paid * totalBet
  const rtpOf = (coins: number): number => (denominator === 0 ? 0 : coins / denominator)
  const rounds = acc.rounds
  const roundMean = rounds === 0 ? 0 : acc.roundWin / totalBet / rounds
  const roundVar = rounds > 1 ? Math.max(0, (acc.roundSquare - rounds * roundMean * roundMean) / (rounds - 1)) : 0

  const totalEmbers = [...acc.values.values()].reduce((sum, count) => sum + count, 0)
  const weightSum = acc.valueWeights.reduce((sum, [, weight]) => sum + weight, 0)
  const values = acc.valueWeights
    .map(([value, weight]) => {
      const p = weightSum === 0 ? 0 : weight / weightSum
      const hits = acc.values.get(value) ?? 0
      const se = Math.sqrt((totalEmbers * p * (1 - p)) || 1)
      return { value, hits, rate: totalEmbers === 0 ? 0 : hits / totalEmbers, expected: p, z: (hits - totalEmbers * p) / se }
    })
    .sort((a, b) => a.value - b.value)

  let lengthSum = 0
  let maxLength = 0
  for (const [length, count] of acc.roundLengths) {
    lengthSum += length * count
    if (length > maxLength) maxLength = length
  }
  const retriggerRate = acc.freeSpins === 0 ? 0 : acc.retriggers / acc.freeSpins
  const share = (count: number): number => (rounds === 0 ? 0 : count / rounds)
  const edges = FORGE_HEAT_BUCKETS
  return {
    paidSpins: paid,
    freeSpins: acc.freeSpins,
    heatCap: acc.heatCap,
    maxRoundSpins: acc.maxRoundSpins,
    sampleRtp: rtpOf(acc.totalWin),
    breakdown: {
      baseLines: rtpOf(acc.baseLines),
      emberBoost: rtpOf(acc.baseBoosted - acc.baseLines),
      baseScatter: rtpOf(acc.baseScatter),
      freeSpins: rtpOf(acc.freeBoosted + acc.freeScatter),
      freeLines: rtpOf(acc.freeLines),
      freeBoost: rtpOf(acc.freeBoosted - acc.freeLines),
      freeScatter: rtpOf(acc.freeScatter),
    },
    hitRate: paid === 0 ? 0 : acc.paidWinSpins / paid,
    subBetWinShare: acc.paidWinSpins === 0 ? 0 : acc.paidSubBetWins / acc.paidWinSpins,
    baseEmberRate: acc.paidWinSpins === 0 ? 0 : acc.baseEmberSpins / acc.paidWinSpins,
    baseEmbersPerSpin: paid === 0 ? 0 : acc.baseEmbers / paid,
    baseFullSpins: acc.baseFulls,
    freeEmbersPerSpin: acc.freeSpins === 0 ? 0 : acc.freeEmbers / acc.freeSpins,
    entryRate: paid === 0 ? 0 : rounds / paid,
    rounds,
    roundMean,
    roundSigma: Math.sqrt(roundVar),
    maxRound: acc.maxRound,
    meanLength: rounds === 0 ? 0 : lengthSum / rounds,
    maxLength,
    overLength: acc.overLength,
    embersPerRound: rounds === 0 ? 0 : acc.freeEmbers / rounds,
    fullsPerRound: rounds === 0 ? 0 : acc.freeFulls / rounds,
    fullRoundRate: share(acc.fullRounds),
    dryRoundRate: share(acc.dryRounds),
    retriggerRate,
    retriggerGrowth: retriggerRate * acc.retriggerSpins,
    cappedRetriggers: acc.cappedRetriggers,
    heatCapRate: acc.paidSpins + acc.freeSpins === 0 ? 0 : acc.heatCapSpins / (acc.paidSpins + acc.freeSpins),
    capRoundRate: share(acc.capRounds),
    winCappedRate: acc.paidSpins + acc.freeSpins === 0 ? 0 : acc.winCappedSpins / (acc.paidSpins + acc.freeSpins),
    winCappedSpins: acc.winCappedSpins,
    capLossRtp: rtpOf(acc.capLoss),
    values,
    maxValueZ: values.reduce((max, row) => Math.max(max, Math.abs(row.z)), 0),
    lengths: [...acc.roundLengths.entries()]
      .map(([length, count]) => ({ length, rounds: count, probability: share(count) }))
      .sort((a, b) => a.length - b.length),
    startHeat: [...acc.startHeat.entries()]
      .map(([heat, count]) => ({ heat, rounds: count, probability: share(count) }))
      .sort((a, b) => a.heat - b.heat),
    finalHeat: acc.finalHeat.map((count, index) => {
      const low = edges[index] ?? 0
      const high = edges[index + 1]
      const range = high === undefined ? `${low}+` : low + 1 === high ? `${low}` : `${low}~${high - 1}`
      return { range, rounds: count, probability: share(count) }
    }),
    embersDistribution: [...acc.roundEmbers.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([embers, count]) => ({ embers: embers >= 20 ? '20+' : String(embers), rounds: count, probability: share(count) })),
  }
}

const pct = (value: number, digits = 2): string => `${(value * 100).toFixed(digits)}%`
const num = (value: number): string => value.toLocaleString('en-US')
const odds = (rate: number): string => (rate > 0 ? `1/${(1 / rate).toFixed(1)}` : '-')

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}

/** 화로 배율 줄 게이트. 기획서 §5-3 «화로»·«프리스핀»·«캡» 줄. */
export function forgeGates(report: ForgeReport): GateRow[] {
  const g = FORGE_GATES
  const b = report.breakdown
  const odd = report.entryRate > 0 ? 1 / report.entryRate : Infinity
  const sum = b.baseLines + b.emberBoost + b.baseScatter + b.freeSpins
  return [
    {
      label: `프리스핀 라운드 길이 ≤ ${report.maxRoundSpins} (위반 0건)`,
      pass: report.overLength === 0 && report.rounds > 0,
      detail: `최장 ${report.maxLength}스핀, 위반 ${report.overLength}건 / ${num(report.rounds)}라운드`,
    },
    {
      label: `프리스핀 진입률 1/${g.minEntryOdds}~1/${g.maxEntryOdds}`,
      pass: odd >= g.minEntryOdds && odd <= g.maxEntryOdds,
      detail: `${odds(report.entryRate)} (${num(report.rounds)}회 / ${num(report.paidSpins)}스핀)`,
    },
    {
      label: `프리스핀 평균 지급 ${g.minRoundMean}~${g.maxRoundMean}× 베팅`,
      pass: report.roundMean >= g.minRoundMean && report.roundMean <= g.maxRoundMean,
      detail: `${report.roundMean.toFixed(2)}× (σ ${report.roundSigma.toFixed(1)}×, 최대 ${report.maxRound.toFixed(0)}×)`,
    },
    {
      label: `불씨 값 분포가 값표와 일치 (max |z| ≤ ${g.maxValueZ})`,
      pass: report.maxValueZ <= g.maxValueZ && report.values.some((row) => row.hits > 0),
      detail: `max |z| ${report.maxValueZ.toFixed(2)} / ${report.values.length}값, 불씨 ${num(report.values.reduce((s, r) => s + r.hits, 0))}개`,
    },
    {
      label: '추가 스핀 수 × 발생률 < 1',
      pass: report.retriggerGrowth < 1,
      detail: `${report.retriggerGrowth.toFixed(4)} (발생 ${odds(report.retriggerRate)} / 프리스핀)`,
    },
    {
      label: '분해: 연쇄 ×1 + 불씨 몫 + 모루 + 프리스핀 = 표본 RTP',
      pass: Math.abs(sum - report.sampleRtp) < 1e-9,
      detail: `${pct(b.baseLines, 3)} + ${pct(b.emberBoost, 3)} + ${pct(b.baseScatter, 3)} + ${pct(b.freeSpins, 3)} = ${pct(sum, 3)} / 표본 ${pct(report.sampleRtp, 3)}`,
    },
    {
      label: '화로 지표(불씨 등장·가득·합계 상한·캡)가 리포트에 있다',
      pass: report.rounds > 0 && report.values.length > 0,
      detail:
        `기본 불씨 ${pct(report.baseEmberRate, 1)}(당첨 스핀 대비) · 라운드당 불씨 ${report.embersPerRound.toFixed(2)} · ` +
        `가득 1회+ 라운드 ${pct(report.fullRoundRate, 1)} · 합계 ${report.heatCap} 도달 ${pct(report.heatCapRate, 4)} · 라운드 캡 ${pct(report.capRoundRate, 4)}`,
    },
  ]
}

export function forgeSections(report: ForgeReport): string[] {
  const b = report.breakdown
  return [
    '## 5-3. 화로 배율 줄',
    '',
    '불씨 값은 **배율**, 지급은 총 베팅액 기준 코인이다. 몫의 분모는 유료 스핀 × 총 베팅액이다. _(표본 추정)_',
    '',
    table(
      ['지표', '값'],
      [
        ['RTP 몫', `연쇄 ×1 ${pct(b.baseLines, 3)} + 불씨 배율 ${pct(b.emberBoost, 3)} + 모루 ${pct(b.baseScatter, 3)} + 프리스핀 ${pct(b.freeSpins, 3)}`],
        ['  └ 프리스핀', `연쇄 ×1 ${pct(b.freeLines, 3)} + 화로 배율 ${pct(b.freeBoost, 3)} + 모루 ${pct(b.freeScatter, 3)}`],
        ['적중률 (유료 스핀) / 베팅 미만 당첨 비율', `${pct(report.hitRate)} / ${pct(report.subBetWinShare, 1)}`],
        ['기본 게임 불씨 (당첨 스핀 대비) / 스핀당 개수', `${pct(report.baseEmberRate)} / ${report.baseEmbersPerSpin.toFixed(5)}`],
        ['기본 게임 화로 가득', `${num(report.baseFullSpins)}회`],
        ['프리스핀 진입률', `${odds(report.entryRate)} (${num(report.rounds)}회)`],
        ['프리스핀 평균 지급 / σ / 최대', `${report.roundMean.toFixed(2)}× / ${report.roundSigma.toFixed(2)}× / ${report.maxRound.toFixed(0)}×`],
        ['평균 길이 / 최장 / 상한', `${report.meanLength.toFixed(2)} / ${report.maxLength} / ${report.maxRoundSpins} (위반 ${report.overLength})`],
        ['라운드당 불씨 / 스핀당 불씨', `${report.embersPerRound.toFixed(2)} / ${report.freeEmbersPerSpin.toFixed(3)}`],
        ['라운드당 화로 가득 / 가득 1회+ 라운드', `${report.fullsPerRound.toFixed(3)} / ${pct(report.fullRoundRate, 1)}`],
        ['당첨 프리스핀 ≤ 1회 라운드', pct(report.dryRoundRate, 1)],
        ['추가 스핀 (프리스핀당) / 30 상한에 잘림', `${odds(report.retriggerRate)} / ${num(report.cappedRetriggers)}회`],
        [`합계 ${report.heatCap} 도달 (전 스핀)`, pct(report.heatCapRate, 5)],
        ['라운드 캡으로 끝난 라운드', pct(report.capRoundRate, 4)],
        ['winCapped 도달 (전 스핀)', `${pct(report.winCappedRate, 6)} (${num(report.winCappedSpins)}스핀)`],
        ['캡 on/off 차 (잘린 지급)', `${pct(report.capLossRtp, 4)} — 캡을 끄면 RTP가 대략 이만큼 오른다`],
      ],
    ),
    '',
    '### 불씨 값 분포',
    '',
    table(
      ['값', '개수', '실측', '값표', 'z'],
      report.values.map((row) => [`×${row.value}`, num(row.hits), pct(row.rate, 3), pct(row.expected, 3), row.z.toFixed(2)]),
    ),
    '',
    '### 프리스핀 시작 합계 (모루 4 → 0, 5 → 5, 6+ → 10)',
    '',
    table(['시작 합계', '라운드', '비율'], report.startHeat.map((row) => [`×${row.heat}`, num(row.rounds), pct(row.probability, 3)])),
    '',
    '### 프리스핀 종료 화로 합계',
    '',
    table(['합계', '라운드', '비율'], report.finalHeat.map((row) => [row.range, num(row.rounds), pct(row.probability, 3)])),
    '',
    '### 라운드당 불씨 수',
    '',
    table(['불씨', '라운드', '비율'], report.embersDistribution.map((row) => [row.embers, num(row.rounds), pct(row.probability, 3)])),
    '',
    '### 프리스핀 라운드 길이',
    '',
    table(['스핀', '라운드', '비율'], report.lengths.map((row) => [String(row.length), num(row.rounds), pct(row.probability, 4)])),
    '',
  ]
}
