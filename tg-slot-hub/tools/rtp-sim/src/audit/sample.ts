import { buildGrid, createSeededRng, evaluate, getBetPerLine } from '@tgslot/slot-engine'
import type { GameMath, Rng } from '@tgslot/slot-engine'
import type { SampleSpin } from './types.js'

function drawStops(math: GameMath, rng: Rng): number[] {
  const stops: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = math.strips[reel]
    if (strip === undefined) throw new RangeError(`릴 ${reel}의 스트립이 없다`)
    stops.push(rng.nextInt(strip.length))
  }
  return stops
}

/**
 * 시드로부터 스핀을 계속 뽑는 함수를 만든다. 같은 시드는 항상 같은 순서를 낸다.
 * GUI의 "스핀 1회" 버튼처럼 스트림을 이어가야 하는 곳에서 쓴다.
 */
export function createSampleSpinner(math: GameMath, totalBet: number, seed: string): () => SampleSpin {
  const betPerLine = getBetPerLine(math, totalBet)
  const rng = createSeededRng(`${seed}:sample`)
  let index = 0
  return () => {
    const stops = drawStops(math, rng)
    const grid = buildGrid(math, stops)
    const { wins, totalWin } = evaluate(grid, math, betPerLine)
    const winningCells = new Set<string>()
    for (const win of wins) {
      for (const [reel, row] of win.positions) winningCells.add(`${reel},${row}`)
    }
    index += 1
    return {
      index,
      stops,
      grid,
      wins,
      totalWin,
      multiplier: totalWin / totalBet,
      winningCells: [...winningCells],
    }
  }
}

/** 샘플 스핀 N회. 리포트와 GUI 목록용. */
export function sampleSpins(math: GameMath, totalBet: number, seed: string, count: number): SampleSpin[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`count는 1 이상의 정수여야 한다: ${count}`)
  const next = createSampleSpinner(math, totalBet, seed)
  return Array.from({ length: count }, () => next())
}
