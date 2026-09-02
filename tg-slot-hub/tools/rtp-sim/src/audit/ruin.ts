import { buildGrid, createSeededRng, evaluate, getBetPerLine } from '@tgslot/slot-engine'
import type { GameMath, Rng } from '@tgslot/slot-engine'
import type { RuinReport } from './types.js'

export const DEFAULT_RUIN_TRIALS = 500
export const DEFAULT_RUIN_SPINS = 1000
export const DEFAULT_RUIN_START_MULTIPLE = 100

export interface RuinOptions {
  trials?: number
  spins?: number
  /** 시작 잔액 = 이 값 x 총 베팅액. */
  startMultiple?: number
}

/** 베팅 레벨 검사를 하지 않는 스핀 1회. 검수 도구는 임의 베팅액도 재야 한다. */
function spinWin(math: GameMath, betPerLine: number, rng: Rng): number {
  const stops: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = math.strips[reel]
    if (strip === undefined) throw new RangeError(`릴 ${reel}의 스트립이 없다`)
    stops.push(rng.nextInt(strip.length))
  }
  return evaluate(buildGrid(math, stops), math, betPerLine).totalWin
}

/**
 * 파산 확률 시뮬레이션.
 * 잔액 `startMultiple x 총 베팅액`으로 시작해 매 스핀 베팅액을 빼고 승리 코인을 더한다.
 * 다음 스핀의 베팅액을 낼 수 없게 되면(잔액 < 총 베팅액) 그 판은 파산으로 센다.
 */
export function simulateRuin(
  math: GameMath,
  totalBet: number,
  seed: string,
  options: RuinOptions = {},
): RuinReport {
  const trials = options.trials ?? DEFAULT_RUIN_TRIALS
  const spins = options.spins ?? DEFAULT_RUIN_SPINS
  const startMultiple = options.startMultiple ?? DEFAULT_RUIN_START_MULTIPLE
  if (!Number.isInteger(trials) || trials < 1) throw new RangeError(`trials는 1 이상의 정수여야 한다: ${trials}`)
  if (!Number.isInteger(spins) || spins < 1) throw new RangeError(`spins는 1 이상의 정수여야 한다: ${spins}`)

  const betPerLine = getBetPerLine(math, totalBet)
  const rng = createSeededRng(`${seed}:ruin`)
  const start = startMultiple * totalBet
  const endBalances: number[] = []
  let ruined = 0
  let ruinSpinSum = 0

  for (let trial = 0; trial < trials; trial += 1) {
    let balance = start
    let survivedSpins = 0
    for (let i = 0; i < spins; i += 1) {
      if (balance < totalBet) break
      balance -= totalBet
      balance += spinWin(math, betPerLine, rng)
      survivedSpins += 1
    }
    if (balance < totalBet) {
      ruined += 1
      ruinSpinSum += survivedSpins
    }
    endBalances.push(balance)
  }

  const sorted = [...endBalances].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0)

  return {
    trials,
    spins,
    startBalanceMultiple: startMultiple,
    ruined,
    ruinRate: ruined / trials,
    medianEndMultiple: median / totalBet,
    meanSpinsToRuin: ruined === 0 ? null : ruinSpinSum / ruined,
  }
}
