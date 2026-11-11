import { evaluateClusters } from '@tgslot/slot-engine'
import type { GameMath, OrderCard } from '@tgslot/slot-engine'
import { mergeBuckets } from './contributions.js'
import type { Bucket } from './contributions.js'
import type { RoundSpin } from './spinner.js'
import type { CascadeReport, OrderReport } from './types.js'

interface OrderStat {
  kind: string
  target: number
  prize: number
  dealt: number
  completed: number
  prizeWin: number
}

function addAt(values: number[], index: number, amount: number): void {
  values[index] = (values[index] ?? 0) + amount
}

function bumpCount<K>(map: Map<K, number>, key: K, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount)
}

/**
 * 연쇄 팩 전용 통. 라운드(유료 스핀 + 라운드 스핀)를 하나씩 받아 연쇄 깊이, 사다리 단계,
 * 클러스터 크기, 캡, 주문 카드 진행을 센다. 값은 전부 실제 지급 코인이다.
 * 필드는 평범한 수·배열·Map이라 워커 사이 구조화 복제로 넘겨 `absorb`로 합칠 수 있다.
 */
export class CascadeAccumulator {
  readonly maxCascades: number
  readonly ladder: readonly number[]
  paidSpins = 0
  roundSpins = 0
  readonly baseDepth: number[]
  readonly roundDepth: number[]
  readonly ladderWin: number[]
  readonly ladderHits: number[]
  readonly clusterSizes = new Map<number, Bucket>()
  maxCascadesHits = 0
  winCappedSpins = 0
  capLoss = 0
  baseLines = 0
  baseScatter = 0
  roundClusters = 0
  orderPrize = 0
  roundTotal = 0
  rounds = 0
  readonly roundLengths = new Map<number, number>()
  readonly roundCompletions = new Map<number, number>()
  readonly orders = new Map<string, OrderStat>()

  constructor(private readonly math: GameMath) {
    const config = math.cascade
    if (config === undefined) throw new RangeError('cascade 설정이 없는 게임에 CascadeAccumulator를 만들었다')
    this.maxCascades = config.maxCascades
    this.ladder = [...config.multiplierLadder]
    this.baseDepth = new Array<number>(config.maxCascades + 1).fill(0)
    this.roundDepth = new Array<number>(config.maxCascades + 1).fill(0)
    this.ladderWin = new Array<number>(config.maxCascades).fill(0)
    this.ladderHits = new Array<number>(config.maxCascades).fill(0)
    for (const entry of math.orderRound?.pool ?? []) {
      this.orders.set(entry.id, {
        kind: entry.kind,
        target: entry.target,
        prize: entry.prize,
        dealt: 0,
        completed: 0,
        prizeWin: 0,
      })
    }
  }

  private deal(card: OrderCard): void {
    const stat = this.orders.get(card.id)
    if (stat !== undefined) stat.dealt += 1
  }

  observe(round: readonly RoundSpin[], totalBet: number): void {
    let triggered = false
    let length = 0
    let completions = 0
    let board: string[] = []

    for (const entry of round) {
      const spin = entry.spin
      const steps = spin.cascades ?? []
      const depth = Math.min(steps.length, this.maxCascades)
      if (entry.isFreeSpin) {
        triggered = true
        length += 1
        this.roundSpins += 1
        addAt(this.roundDepth, depth, 1)
      } else {
        this.paidSpins += 1
        addAt(this.baseDepth, depth, 1)
      }

      for (const step of steps) {
        for (const win of step.wins) {
          const paid = win.win * entry.multiplier
          addAt(this.ladderWin, step.index, paid)
          addAt(this.ladderHits, step.index, 1)
          const found = this.clusterSizes.get(win.count)
          if (found === undefined) this.clusterSizes.set(win.count, { win: paid, hits: 1 })
          else {
            found.win += paid
            found.hits += 1
          }
        }
      }
      // 상한에서 멈췄는지는 끝난 판에 클러스터가 남았는지로만 알 수 있다. 드물어서 다시 평가해도 싸다.
      if (steps.length >= this.maxCascades && spin.finalGrid !== undefined) {
        if (evaluateClusters(spin.finalGrid, this.math, totalBet, 1).wins.length > 0) this.maxCascadesHits += 1
      }

      const completedIds: string[] = []
      for (const feature of spin.features) {
        if (feature.type === 'winCapped') {
          this.winCappedSpins += 1
          this.capLoss += feature.requested - feature.granted
        } else if (feature.type === 'orderRound') {
          this.rounds += 1
          board = feature.cards.map((card) => card.id)
          for (const card of feature.cards) this.deal(card)
        } else if (feature.type === 'orderComplete') {
          completions += 1
          completedIds.push(feature.id)
          const stat = this.orders.get(feature.id)
          if (stat !== undefined) {
            stat.completed += 1
            stat.prizeWin += feature.prize
          }
        }
      }

      const orderWin = spin.orderWin ?? 0
      if (entry.isFreeSpin) {
        this.roundTotal += spin.totalWin
        this.orderPrize += orderWin
        this.roundClusters += spin.totalWin - orderWin
        // 다음 판의 카드 중 이번 판에서 살아남은 것이 아니면 새로 나온 카드다.
        const kept = board.filter((id) => !completedIds.includes(id))
        const next = spin.nextState?.carry?.orders?.cards ?? []
        for (const card of next) {
          const at = kept.indexOf(card.id)
          if (at >= 0) kept.splice(at, 1)
          else this.deal(card)
        }
        board = next.map((card) => card.id)
      } else {
        this.baseLines += spin.lineWin
        this.baseScatter += spin.totalWin - spin.lineWin
      }
    }

    if (triggered) {
      bumpCount(this.roundLengths, length)
      if (this.math.orderRound !== undefined) bumpCount(this.roundCompletions, completions)
    }
  }

  /** 다른 샤드의 통을 더한다. */
  absorb(other: CascadeAccumulatorData): void {
    this.paidSpins += other.paidSpins
    this.roundSpins += other.roundSpins
    other.baseDepth.forEach((count, index) => addAt(this.baseDepth, index, count))
    other.roundDepth.forEach((count, index) => addAt(this.roundDepth, index, count))
    other.ladderWin.forEach((win, index) => addAt(this.ladderWin, index, win))
    other.ladderHits.forEach((hits, index) => addAt(this.ladderHits, index, hits))
    mergeBuckets(this.clusterSizes, other.clusterSizes)
    this.maxCascadesHits += other.maxCascadesHits
    this.winCappedSpins += other.winCappedSpins
    this.capLoss += other.capLoss
    this.baseLines += other.baseLines
    this.baseScatter += other.baseScatter
    this.roundClusters += other.roundClusters
    this.orderPrize += other.orderPrize
    this.roundTotal += other.roundTotal
    this.rounds += other.rounds
    for (const [length, count] of other.roundLengths) bumpCount(this.roundLengths, length, count)
    for (const [done, count] of other.roundCompletions) bumpCount(this.roundCompletions, done, count)
    for (const [id, stat] of other.orders) {
      const found = this.orders.get(id)
      if (found === undefined) this.orders.set(id, { ...stat })
      else {
        found.dealt += stat.dealt
        found.completed += stat.completed
        found.prizeWin += stat.prizeWin
      }
    }
  }
}

export type CascadeAccumulatorData = Omit<CascadeAccumulator, 'observe' | 'absorb'>

/** 통을 리포트 모양으로. 분모는 유료 스핀 x 총 베팅액이다. */
export function buildCascadeReport(math: GameMath, acc: CascadeAccumulatorData, totalBet: number): CascadeReport {
  const paid = acc.paidSpins
  const denominator = paid * totalBet
  const rtpOf = (coins: number): number => (denominator === 0 ? 0 : coins / denominator)
  const observed = paid + acc.roundSpins

  let firstCluster = 0
  let steps = 0
  let deep = 0
  acc.baseDepth.forEach((count, depth) => {
    if (depth >= 1) firstCluster += count
    if (depth >= 3) deep += count
    steps += depth * count
  })

  const clusterTotal = [...acc.clusterSizes.values()].reduce((sum, bucket) => sum + bucket.win, 0)
  const lastLadder = acc.ladder.length - 1

  return {
    paidSpins: paid,
    roundSpins: acc.roundSpins,
    firstClusterRate: paid === 0 ? 0 : firstCluster / paid,
    meanCascades: firstCluster === 0 ? 0 : steps / firstCluster,
    continueProbability: steps === 0 ? 0 : (steps - firstCluster) / steps,
    depth3PlusRate: paid === 0 ? 0 : deep / paid,
    maxCascades: acc.maxCascades,
    maxCascadesHitRate: observed === 0 ? 0 : acc.maxCascadesHits / observed,
    maxCascadesHits: acc.maxCascadesHits,
    winCappedRate: observed === 0 ? 0 : acc.winCappedSpins / observed,
    winCappedSpins: acc.winCappedSpins,
    capLossRtp: rtpOf(acc.capLoss),
    depth: acc.baseDepth.map((base, depth) => ({
      depth,
      base,
      baseProbability: paid === 0 ? 0 : base / paid,
      round: acc.roundDepth[depth] ?? 0,
    })),
    ladder: acc.ladderWin.map((win, index) => ({
      index,
      multiplier: acc.ladder[Math.min(index, lastLadder)] ?? 1,
      hits: acc.ladderHits[index] ?? 0,
      win,
      rtp: rtpOf(win),
    })),
    clusterSizes: [...acc.clusterSizes.entries()]
      .map(([size, bucket]) => ({
        size,
        hits: bucket.hits,
        win: bucket.win,
        rtp: rtpOf(bucket.win),
        share: clusterTotal === 0 ? 0 : bucket.win / clusterTotal,
      }))
      .sort((a, b) => a.size - b.size),
    breakdown: {
      lines: rtpOf(acc.baseLines),
      scatter: rtpOf(acc.baseScatter),
      orderPrize: rtpOf(acc.orderPrize),
      roundClusters: rtpOf(acc.roundClusters),
      base: rtpOf(acc.baseLines + acc.baseScatter),
      round: rtpOf(acc.roundTotal),
    },
    orders: buildOrderReport(math, acc, totalBet),
  }
}

function buildOrderReport(math: GameMath, acc: CascadeAccumulatorData, totalBet: number): OrderReport | null {
  const config = math.orderRound
  if (config === undefined) return null
  const rounds = acc.rounds
  const longestAllowed = config.spins + config.extraSpinsPerOrder * config.maxOrders
  const denominator = acc.paidSpins * totalBet

  let lengthSum = 0
  let maxLength = 0
  let overLength = 0
  for (const [length, count] of acc.roundLengths) {
    lengthSum += length * count
    if (length > maxLength) maxLength = length
    if (length > longestAllowed) overLength += count
  }
  let completedSum = 0
  for (const [done, count] of acc.roundCompletions) completedSum += done * count

  const kinds = new Map<string, { dealt: number; completed: number }>()
  let dealt = 0
  let completed = 0
  const byId = [...acc.orders.entries()].map(([id, stat]) => {
    dealt += stat.dealt
    completed += stat.completed
    const kind = kinds.get(stat.kind) ?? { dealt: 0, completed: 0 }
    kind.dealt += stat.dealt
    kind.completed += stat.completed
    kinds.set(stat.kind, kind)
    return {
      id,
      kind: stat.kind,
      target: stat.target,
      prize: stat.prize,
      dealt: stat.dealt,
      dealtPerRound: rounds === 0 ? 0 : stat.dealt / rounds,
      completed: stat.completed,
      rate: stat.dealt === 0 ? 0 : stat.completed / stat.dealt,
      prizeRtp: denominator === 0 ? 0 : stat.prizeWin / denominator,
    }
  })

  return {
    rounds,
    entryRate: acc.paidSpins === 0 ? 0 : rounds / acc.paidSpins,
    meanLength: rounds === 0 ? 0 : lengthSum / rounds,
    maxLength,
    longestAllowed,
    overLength,
    lengths: [...acc.roundLengths.entries()]
      .map(([length, count]) => ({ length, rounds: count, probability: rounds === 0 ? 0 : count / rounds }))
      .sort((a, b) => a.length - b.length),
    completions: [...acc.roundCompletions.entries()]
      .map(([done, count]) => ({ completed: done, rounds: count, probability: rounds === 0 ? 0 : count / rounds }))
      .sort((a, b) => a.completed - b.completed),
    cardsPerRound: rounds === 0 ? 0 : completedSum / rounds,
    completionRate: dealt === 0 ? 0 : completed / dealt,
    byKind: [...kinds.entries()].map(([kind, stat]) => ({
      kind,
      dealt: stat.dealt,
      completed: stat.completed,
      rate: stat.dealt === 0 ? 0 : stat.completed / stat.dealt,
    })),
    byId,
  }
}
