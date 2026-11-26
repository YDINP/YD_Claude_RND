import { maxRouletteSteps } from '@tgslot/slot-engine'
import type { GameMath, StageRouletteTrigger } from '@tgslot/slot-engine'
import type { RoundSpin } from './spinner.js'
import type { GateRow } from './types.js'

/** 룰렛 결과 구간 경계 (총 베팅 배수). 마지막 구간은 위가 열려 있다. */
export const ROULETTE_BUCKETS = [0, 15, 20, 40, 80, 150] as const

/** 게이트 기준. 계획서 `PLAN_idol-stage-live.md` §5-5. */
export const ROULETTE_GATES = {
  minEntryOdds: 200,
  maxEntryOdds: 260,
  minMean: 30,
  maxMean: 80,
  maxSmallRate: 0.1,
  smallBelow: 15,
  /** 칸별 착지율 |z| 상한. 칸이 30개라 3SE 하나씩 보면 우연 탈락이 8%쯤 나서 본페로니로 4를 쓴다. */
  maxSegmentZ: 4,
} as const

/** 응원봉 분포 칸 수 (0..6+, 마지막 칸이 6 이상). */
const CHEER_BINS = 7

function addAt(values: number[], index: number, amount = 1): void {
  values[index] = (values[index] ?? 0) + amount
}

/**
 * 무대 룰렛 팩 전용 통. 유료 스핀을 하나씩 받아 진입·시작 고리·응원봉 수·고리 도달·칸별 착지·앙코르·대상·회전 수·
 * 결과 구간·캡을 센다. 값은 전부 실제 지급 코인이다. 필드는 수·배열뿐이라 워커 사이 구조화 복제로 넘겨 `absorb`로 합친다.
 */
export class RouletteAccumulator {
  readonly ringSizes: number[]
  readonly maxSteps: number
  readonly maxEncores: number
  paidSpins = 0
  waysWin = 0
  rouletteWin = 0
  rouletteSquare = 0
  triggers = 0
  readonly startRing: number[] = [0, 0]
  readonly cheer: number[] = new Array<number>(CHEER_BINS).fill(0)
  readonly cheerWin: number[] = new Array<number>(CHEER_BINS).fill(0)
  readonly ringReach: number[]
  readonly segmentHits: number[][]
  readonly encores: number[]
  grandTriggers = 0
  grandHits = 0
  readonly stepCounts: number[]
  overSteps = 0
  readonly buckets: number[] = new Array<number>(ROULETTE_BUCKETS.length).fill(0)
  endedCapped = 0
  winCappedSpins = 0
  capLoss = 0
  maxRoulette = 0

  constructor(math: GameMath) {
    const config = math.stageRoulette
    if (config === undefined) throw new RangeError('stageRoulette 설정이 없는 게임에 RouletteAccumulator를 만들었다')
    this.ringSizes = config.rings.map((ring) => ring.segments.length)
    this.maxSteps = maxRouletteSteps(config, 0)
    this.maxEncores = config.maxEncores
    this.ringReach = new Array<number>(config.rings.length).fill(0)
    this.segmentHits = config.rings.map((ring) => new Array<number>(ring.segments.length).fill(0))
    this.encores = new Array<number>(config.maxEncores + 1).fill(0)
    this.stepCounts = new Array<number>(13).fill(0)
  }

  observe(round: readonly RoundSpin[], totalBet: number): void {
    for (const entry of round) {
      const spin = entry.spin
      if (entry.isFreeSpin) continue
      this.paidSpins += 1
      const roulette = spin.rouletteWin ?? 0
      this.waysWin += spin.totalWin - roulette
      for (const feature of spin.features) {
        if (feature.type === 'winCapped') {
          this.winCappedSpins += 1
          this.capLoss += feature.requested - feature.granted
        } else if (feature.type === 'stageRoulette') {
          this.observeRoulette(feature, totalBet)
        }
      }
    }
  }

  private observeRoulette(feature: StageRouletteTrigger, totalBet: number): void {
    this.triggers += 1
    const total = feature.total
    this.rouletteWin += total
    const multiple = total / totalBet
    this.rouletteSquare += multiple * multiple
    if (multiple > this.maxRoulette) this.maxRoulette = multiple
    addAt(this.startRing, feature.startRing)
    const cheerBin = Math.min(feature.cheer, CHEER_BINS - 1)
    addAt(this.cheer, cheerBin)
    addAt(this.cheerWin, cheerBin, multiple)
    let deepest = feature.startRing
    let encores = 0
    let grand = 0
    for (const step of feature.steps) {
      deepest = Math.max(deepest, step.ring)
      const ring = this.segmentHits[step.ring]
      if (ring !== undefined) addAt(ring, step.segment)
      if (step.kind === 'encore' && step.encoreCounted) encores += 1
      if (step.kind === 'grand') grand += 1
    }
    for (let ring = 0; ring <= deepest; ring += 1) addAt(this.ringReach, ring)
    addAt(this.encores, Math.min(encores, this.maxEncores))
    if (grand > 0) this.grandTriggers += 1
    this.grandHits += grand
    addAt(this.stepCounts, Math.min(feature.steps.length, this.stepCounts.length - 1))
    if (feature.steps.length > this.maxSteps) this.overSteps += 1
    if (feature.endedBy === 'capped') this.endedCapped += 1
    let bucket = 0
    for (let i = 0; i < ROULETTE_BUCKETS.length; i += 1) if (multiple >= (ROULETTE_BUCKETS[i] ?? 0)) bucket = i
    addAt(this.buckets, bucket)
  }

  absorb(other: RouletteAccumulatorData): void {
    this.paidSpins += other.paidSpins
    this.waysWin += other.waysWin
    this.rouletteWin += other.rouletteWin
    this.rouletteSquare += other.rouletteSquare
    this.triggers += other.triggers
    this.grandTriggers += other.grandTriggers
    this.grandHits += other.grandHits
    this.overSteps += other.overSteps
    this.endedCapped += other.endedCapped
    this.winCappedSpins += other.winCappedSpins
    this.capLoss += other.capLoss
    this.maxRoulette = Math.max(this.maxRoulette, other.maxRoulette)
    const add = (into: number[], from: readonly number[]): void => from.forEach((value, index) => addAt(into, index, value))
    add(this.startRing, other.startRing)
    add(this.cheer, other.cheer)
    add(this.cheerWin, other.cheerWin)
    add(this.ringReach, other.ringReach)
    other.segmentHits.forEach((ring, index) => {
      const into = this.segmentHits[index]
      if (into !== undefined) add(into, ring)
    })
    add(this.encores, other.encores)
    add(this.stepCounts, other.stepCounts)
    add(this.buckets, other.buckets)
  }
}

export type RouletteAccumulatorData = Omit<RouletteAccumulator, 'observe' | 'absorb'>

export interface RouletteSegmentRow {
  ring: number
  segment: number
  label: string
  hits: number
  rate: number
  expected: number
  z: number
}

export interface RouletteReport {
  paidSpins: number
  triggers: number
  /** 같은 표본의 라운드 배수 평균. 분해 합 검사용. */
  sampleRtp: number
  /** 진입률 (유료 스핀 기준). */
  entryRate: number
  /** RTP 몫. ways는 ways·스캐터 지급(캡 적용 후), roulette는 룰렛 지급. */
  waysRtp: number
  rouletteRtp: number
  /** 진입당 룰렛 평균·표준편차 (총 베팅 배수). */
  mean: number
  sigma: number
  maxMultiple: number
  middleStartRate: number
  cheer: { cheer: string; triggers: number; rate: number; mean: number }[]
  ringReachRate: number[]
  segments: RouletteSegmentRow[]
  maxSegmentZ: number
  encores: { encores: number; triggers: number; rate: number }[]
  grandTriggerRate: number
  grandHitsPerTrigger: number
  steps: { steps: number; triggers: number; rate: number }[]
  meanSteps: number
  maxSteps: number
  maxStepsAllowed: number
  overSteps: number
  buckets: { range: string; triggers: number; rate: number }[]
  smallRate: number
  endedCappedRate: number
  winCappedRate: number
  winCappedSpins: number
  capLossRtp: number
}

function segmentLabel(math: GameMath, ring: number, segment: number): string {
  const picked = math.stageRoulette?.rings[ring]?.segments[segment]
  if (picked === undefined) return '?'
  if (picked.kind === 'stepUp') return '위로'
  if (picked.kind === 'encore') return `앙코르 ×${picked.value}`
  if (picked.kind === 'grand') return `대상 ×${picked.value}`
  return `×${picked.value}`
}

export function buildRouletteReport(
  math: GameMath,
  acc: RouletteAccumulatorData,
  totalBet: number,
  sampleRtp: number,
): RouletteReport {
  const n = Math.max(1, acc.paidSpins)
  const t = Math.max(1, acc.triggers)
  const mean = acc.rouletteWin / totalBet / t
  const variance = acc.triggers > 1 ? Math.max(0, (acc.rouletteSquare - acc.triggers * mean * mean) / (acc.triggers - 1)) : 0
  const segments: RouletteSegmentRow[] = []
  acc.segmentHits.forEach((hits, ring) => {
    const total = hits.reduce((sum, value) => sum + value, 0)
    const expected = 1 / hits.length
    hits.forEach((count, segment) => {
      const rate = total > 0 ? count / total : 0
      const se = total > 0 ? Math.sqrt((expected * (1 - expected)) / total) : 0
      segments.push({
        ring,
        segment,
        label: segmentLabel(math, ring, segment),
        hits: count,
        rate,
        expected,
        z: se > 0 ? (rate - expected) / se : 0,
      })
    })
  })
  let observedMaxSteps = 0
  acc.stepCounts.forEach((count, steps) => {
    if (count > 0) observedMaxSteps = steps
  })
  const stepTotal = acc.stepCounts.reduce((sum, count, steps) => sum + count * steps, 0)
  const bucketLabel = (index: number): string => {
    const low = ROULETTE_BUCKETS[index] ?? 0
    const high = ROULETTE_BUCKETS[index + 1]
    return high === undefined ? `${low}× 이상` : `${low}~${high}×`
  }
  const smallIndex = ROULETTE_BUCKETS.findIndex((edge) => edge >= ROULETTE_GATES.smallBelow)
  const small = acc.buckets.slice(0, smallIndex).reduce((sum, value) => sum + value, 0)
  return {
    paidSpins: acc.paidSpins,
    triggers: acc.triggers,
    sampleRtp,
    entryRate: acc.triggers / n,
    waysRtp: acc.waysWin / (n * totalBet),
    rouletteRtp: acc.rouletteWin / (n * totalBet),
    mean,
    sigma: Math.sqrt(variance),
    maxMultiple: acc.maxRoulette,
    middleStartRate: (acc.startRing[1] ?? 0) / t,
    cheer: acc.cheer.map((count, index) => ({
      cheer: index === acc.cheer.length - 1 ? `${index}+` : String(index),
      triggers: count,
      rate: count / t,
      mean: count > 0 ? (acc.cheerWin[index] ?? 0) / count : 0,
    })),
    ringReachRate: acc.ringReach.map((count) => count / t),
    segments,
    maxSegmentZ: segments.reduce((max, row) => Math.max(max, Math.abs(row.z)), 0),
    encores: acc.encores.map((count, encores) => ({ encores, triggers: count, rate: count / t })),
    grandTriggerRate: acc.grandTriggers / t,
    grandHitsPerTrigger: acc.grandHits / t,
    steps: acc.stepCounts
      .map((count, steps) => ({ steps, triggers: count, rate: count / t }))
      .filter((row) => row.triggers > 0),
    meanSteps: stepTotal / t,
    maxSteps: observedMaxSteps,
    maxStepsAllowed: acc.maxSteps,
    overSteps: acc.overSteps,
    buckets: acc.buckets.map((count, index) => ({ range: bucketLabel(index), triggers: count, rate: count / t })),
    smallRate: small / t,
    endedCappedRate: acc.endedCapped / t,
    winCappedRate: acc.winCappedSpins / n,
    winCappedSpins: acc.winCappedSpins,
    capLossRtp: acc.capLoss / (n * totalBet),
  }
}

const pct = (value: number, digits = 2): string => `${(value * 100).toFixed(digits)}%`
const num = (value: number): string => value.toLocaleString('en-US')
const odds = (rate: number): string => (rate > 0 ? `1/${Math.round(1 / rate).toLocaleString('en-US')}` : '-')

/** 룰렛 게이트. 계획서 §5-5 «룰렛» 줄. */
export function rouletteGates(report: RouletteReport): GateRow[] {
  const sampleRtp = report.sampleRtp
  const g = ROULETTE_GATES
  const odd = report.entryRate > 0 ? 1 / report.entryRate : Infinity
  const sum = report.waysRtp + report.rouletteRtp
  return [
    {
      label: `룰렛 회전 수 ≤ ${report.maxStepsAllowed} (위반 0건)`,
      pass: report.overSteps === 0 && report.triggers > 0,
      detail: `최장 ${report.maxSteps}회, 위반 ${report.overSteps}건 / ${num(report.triggers)}진입`,
    },
    {
      label: `칸별 착지율이 칸 수 비율과 일치 (max |z| ≤ ${g.maxSegmentZ})`,
      pass: report.maxSegmentZ <= g.maxSegmentZ,
      detail: `max |z| ${report.maxSegmentZ.toFixed(2)} / ${report.segments.length}칸`,
    },
    {
      label: `룰렛 진입률 1/${g.minEntryOdds}~1/${g.maxEntryOdds}`,
      pass: odd >= g.minEntryOdds && odd <= g.maxEntryOdds,
      detail: `${odds(report.entryRate)} (${num(report.triggers)}회 / ${num(report.paidSpins)}스핀)`,
    },
    {
      label: `룰렛 평균 ${g.minMean}~${g.maxMean}×`,
      pass: report.mean >= g.minMean && report.mean <= g.maxMean,
      detail: `${report.mean.toFixed(2)}× (σ ${report.sigma.toFixed(1)}×, 최대 ${report.maxMultiple.toFixed(0)}×)`,
    },
    {
      label: `룰렛 ${g.smallBelow}× 미만 ≤ ${pct(g.maxSmallRate, 0)}`,
      pass: report.smallRate <= g.maxSmallRate,
      detail: pct(report.smallRate),
    },
    {
      label: 'ways 몫 + 룰렛 몫 = 표본 RTP',
      pass: Math.abs(sum - sampleRtp) < 1e-9,
      detail: `${pct(report.waysRtp, 3)} + ${pct(report.rouletteRtp, 3)} = ${pct(sum, 3)} / 표본 ${pct(sampleRtp, 3)}`,
    },
    {
      label: '지급 상한 도달률과 캡 on/off 차 (기록)',
      pass: true,
      detail: `${pct(report.winCappedRate, 6)} (${num(report.winCappedSpins)}스핀), 잘린 지급 ${pct(report.capLossRtp, 4)}`,
    },
  ]
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n')
}

/** 감사 리포트의 «무대 룰렛» 절. */
export function rouletteSections(report: RouletteReport): string[] {
  const ringNames = ['바깥', '가운데', '안쪽']
  return [
    '## 5-3. 무대 룰렛',
    '',
    '룰렛 상은 **총 베팅액 배수**다. 진입·도달·착지는 유료 스핀 표본에서 센 값이다. _(표본 추정)_',
    '',
    table(
      ['지표', '값'],
      [
        ['진입률 (유료 스핀)', `${odds(report.entryRate)} (${pct(report.entryRate, 4)}, ${num(report.triggers)}회)`],
        ['RTP 몫', `ways ${pct(report.waysRtp, 3)} + 룰렛 ${pct(report.rouletteRtp, 3)}`],
        ['진입당 룰렛 평균 / σ / 최대', `${report.mean.toFixed(2)}× / ${report.sigma.toFixed(2)}× / ${report.maxMultiple.toFixed(0)}×`],
        ['가운데 고리 시작 (초대권 4장+)', pct(report.middleStartRate)],
        ['고리 도달률', report.ringReachRate.map((rate, ring) => `${ringNames[ring] ?? ring} ${pct(rate, 1)}`).join(' · ')],
        ['대상 착지 (진입 대비) / 진입당 횟수', `${pct(report.grandTriggerRate)} / ${report.grandHitsPerTrigger.toFixed(4)}`],
        ['평균 회전 / 최장 / 상한', `${report.meanSteps.toFixed(2)} / ${report.maxSteps} / ${report.maxStepsAllowed} (위반 ${report.overSteps})`],
        ['캡으로 끝난 공연 (진입 대비)', pct(report.endedCappedRate, 4)],
        ['winCapped 도달 (전 스핀)', `${pct(report.winCappedRate, 6)} (${num(report.winCappedSpins)}스핀)`],
        ['캡 on/off 차 (잘린 지급)', `${pct(report.capLossRtp, 4)} — 캡을 끄면 RTP가 대략 이만큼 오른다`],
      ],
    ),
    '',
    '### 응원봉 수별 진입·평균',
    '',
    table(
      ['응원봉', '진입', '비율', '평균'],
      report.cheer.map((row) => [row.cheer, num(row.triggers), pct(row.rate), `${row.mean.toFixed(2)}×`]),
    ),
    '',
    '### 룰렛 결과 구간',
    '',
    table(
      ['구간', '진입', '비율'],
      report.buckets.map((row) => [row.range, num(row.triggers), pct(row.rate)]),
    ),
    '',
    '### 회전 수 분포',
    '',
    table(
      ['회전', '진입', '비율'],
      report.steps.map((row) => [String(row.steps), num(row.triggers), pct(row.rate)]),
    ),
    '',
    '### 앙코르 사용 수',
    '',
    table(
      ['앙코르(돌리기 늘림)', '진입', '비율'],
      report.encores.map((row) => [String(row.encores), num(row.triggers), pct(row.rate)]),
    ),
    '',
    '### 칸별 착지율',
    '',
    `기대값은 칸 수 비율(1/칸 수)이다. z = (관측 − 기대) / SE. max |z| ${report.maxSegmentZ.toFixed(2)}.`,
    '',
    table(
      ['고리', '칸', '내용', '착지', '비율', '기대', 'z'],
      report.segments.map((row) => [
        ringNames[row.ring] ?? String(row.ring),
        String(row.segment),
        row.label,
        num(row.hits),
        pct(row.rate, 3),
        pct(row.expected, 3),
        row.z.toFixed(2),
      ]),
    ),
    '',
  ]
}
