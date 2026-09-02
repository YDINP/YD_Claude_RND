import { createSeededRng } from '@tgslot/slot-engine'
import type { GameMath, SpinResult } from '@tgslot/slot-engine'
import { betPerLineOf, playRound } from './spinner.js'
import type { SampleSpin } from './types.js'

function winningCellsOf(spin: SpinResult): string[] {
  const cells = new Set<string>()
  for (const win of spin.wins) {
    for (const [reel, row] of win.positions) cells.add(`${reel},${row}`)
  }
  for (const feature of spin.features) {
    if (feature.type !== 'scatterWin') continue
    for (const [reel, row] of feature.positions) cells.add(`${reel},${row}`)
  }
  return [...cells]
}

function scatterInfoOf(spin: SpinResult): { count: number; awarded: number } {
  let count = 0
  let awarded = 0
  for (const feature of spin.features) {
    if (feature.type === 'scatterWin') count = feature.count
    if (feature.type === 'freeSpins') awarded += feature.spins
  }
  return { count, awarded }
}

/**
 * 시드로부터 라운드를 계속 뽑는 함수를 만든다. 같은 시드는 항상 같은 순서를 낸다.
 *
 * 한 번 호출하면 **라운드 하나**가 통째로 나온다. 유료 스핀이 프리스핀을 열었다면
 * 그 프리스핀들도 같은 배열에 이어 붙는다 (`isFreeSpin: true`).
 * GUI의 "스핀 1회"가 프리스핀 세션을 반쪽만 보여 주지 않게 하려는 것이다.
 */
export function createSampleSpinner(math: GameMath, totalBet: number, seed: string): () => SampleSpin[] {
  const betPerLine = betPerLineOf(math, totalBet)
  const rng = createSeededRng(`${seed}:sample`)
  let index = 0
  let round = 0

  return () => {
    round += 1
    return playRound(math, totalBet, betPerLine, rng).map((entry) => {
      index += 1
      const { count, awarded } = scatterInfoOf(entry.spin)
      return {
        index,
        round,
        stops: entry.spin.stops,
        grid: entry.spin.grid,
        wins: entry.spin.wins,
        totalWin: entry.spin.totalWin,
        multiplier: entry.spin.totalWin / totalBet,
        isFreeSpin: entry.isFreeSpin,
        winMultiplier: entry.multiplier,
        scatterCount: count,
        scatterWin: entry.spin.scatterWin * entry.multiplier,
        freeSpinsAwarded: awarded,
        winningCells: winningCellsOf(entry.spin),
      }
    })
  }
}

/**
 * 샘플 라운드 N회를 펼친 스핀 목록. 프리스핀이 붙으면 목록은 N보다 길어진다.
 * @param rounds 유료 스핀 기준 라운드 수
 */
export function sampleSpins(math: GameMath, totalBet: number, seed: string, rounds: number): SampleSpin[] {
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new RangeError(`rounds는 1 이상의 정수여야 한다: ${rounds}`)
  }
  const next = createSampleSpinner(math, totalBet, seed)
  const spins: SampleSpin[] = []
  for (let i = 0; i < rounds; i += 1) spins.push(...next())
  return spins
}
