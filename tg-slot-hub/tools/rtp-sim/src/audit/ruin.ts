import { createSeededRng } from '@tgslot/slot-engine'
import type { GameMath } from '@tgslot/slot-engine'
import { betPerLineOf, playRound } from './spinner.js'
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

/**
 * 파산 확률 시뮬레이션.
 * 잔액 `startMultiple x 총 베팅액`으로 시작해 매 스핀 베팅액을 빼고 승리 코인을 더한다.
 * 프리스핀이 열리면 그 라운드를 끝까지 돌린 뒤 다음 유료 스핀으로 넘어간다.
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

  const betPerLine = betPerLineOf(math, totalBet)
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
      // 프리스핀까지 끝낸 라운드 전체가 한 번의 베팅에 대한 환급이다.
      for (const entry of playRound(math, totalBet, betPerLine, rng)) balance += entry.spin.totalWin
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
