import { evaluateClusters } from './cluster.js'
import type { GameMath } from './schema.js'
import type { CascadeOutcome, CascadeStep, GridPosition, SymbolId, WinLine } from './types.js'

/**
 * 연쇄 1단계를 그리드에 입힌다. `grid[row][reel]`. 입력은 건드리지 않는다.
 *
 * 릴마다 지워진 칸을 빼고 남은 칸을 아래로 내린 뒤, 위 빈자리를 `step.refill[reel]`(위→아래)로 채운다.
 * 엔진·API 재전송·렌더러가 모두 이 함수로 다음 판을 만든다. 그래서 어긋난 단계는 조용히 넘기지 않고 던진다.
 */
export function applyCascadeStep(grid: readonly (readonly SymbolId[])[], step: CascadeStep): SymbolId[][] {
  const rows = grid.length
  const reels = grid[0]?.length ?? 0
  const gone: boolean[][] = Array.from({ length: reels }, () => new Array<boolean>(rows).fill(false))
  for (const [reel, row] of step.removed) {
    const column = gone[reel]
    if (column === undefined || row < 0 || row >= rows) {
      throw new RangeError(`연쇄 ${step.index}: 지울 칸 [${reel}, ${row}]이 그리드 밖이다`)
    }
    column[row] = true
  }
  if (step.refill.length !== reels) {
    throw new RangeError(`연쇄 ${step.index}: refill 릴 수(${step.refill.length})가 reels(${reels})와 다르다`)
  }

  const next: SymbolId[][] = Array.from({ length: rows }, () => new Array<SymbolId>(reels))
  for (let reel = 0; reel < reels; reel += 1) {
    const kept: SymbolId[] = []
    for (let row = 0; row < rows; row += 1) {
      if (gone[reel]?.[row] !== true) kept.push(grid[row]?.[reel] as SymbolId)
    }
    const refill = step.refill[reel] ?? []
    if (refill.length !== rows - kept.length) {
      throw new RangeError(
        `연쇄 ${step.index}: 릴 ${reel} refill(${refill.length})이 지워진 칸 수(${rows - kept.length})와 다르다`,
      )
    }
    const column = [...refill, ...kept]
    for (let row = 0; row < rows; row += 1) {
      ;(next[row] as SymbolId[])[reel] = column[row] as SymbolId
    }
  }
  return next
}

/** 단계를 순서대로 접는다. 결과는 엔진의 `finalGrid`와 같아야 한다. 단계가 없으면 복사본이다. */
export function foldCascades(grid: readonly (readonly SymbolId[])[], steps: readonly CascadeStep[]): SymbolId[][] {
  let current: SymbolId[][] = grid.map((row) => [...row])
  for (const step of steps) current = applyCascadeStep(current, step)
  return current
}

/**
 * 연쇄 루프. RNG를 쓰지 않는다. `grid`(뮤테이션까지 끝난 판)에서 시작해 승리가 없거나
 * `maxCascades`에 닿거나 지급 상한(`capRemaining`)에 닿을 때까지 평가, 제거, 중력, 리필을 반복한다.
 *
 * 리필은 스트립 끌어오기다. 릴마다 포인터를 `stops[reel] - 1`에서 시작해 위로 순환하며 읽고,
 * 처음 읽은 심볼이 기존 칸 바로 위에 놓인다(`refill`은 위에서 아래 순서라 읽은 순서의 역순이다).
 * 사다리 배수는 단계 k마다 `ladder[min(k, last)]`이고 스핀마다 0단계부터 다시 시작한다.
 * 상한에 닿은 단계는 지급을 잘라 마지막 단계로 삼고, `maxCascades`에서 멈춘 뒤 남은 클러스터는 지급하지 않는다.
 */
export function runCascades(
  math: GameMath,
  grid: readonly (readonly SymbolId[])[],
  stops: readonly number[],
  totalBet: number,
  capRemaining: number,
): CascadeOutcome {
  const config = math.cascade
  if (config === undefined) throw new RangeError('cascade 설정이 없는 게임에 runCascades를 호출했다')
  const ladder = config.multiplierLadder
  const reels = math.reels
  const wildIds = new Set(math.symbols.filter((s) => s.wild === true).map((s) => s.id))
  const pointers = stops.map((stop, reel) => {
    const length = math.strips[reel]?.length ?? 1
    return (((stop - 1) % length) + length) % length
  })

  const steps: CascadeStep[] = []
  const removedBySymbol: Record<SymbolId, number> = {}
  let current: SymbolId[][] = grid.map((row) => [...row])
  let win = 0
  let maxClusterSize = 0
  let capped = false
  let hitMaxCascades = false

  for (;;) {
    const index = steps.length
    const multiplier = ladder[Math.min(index, ladder.length - 1)] as number
    const evaluated = evaluateClusters(current, math, totalBet, multiplier)
    if (evaluated.wins.length === 0) break
    if (index >= config.maxCascades) {
      hitMaxCascades = true
      break
    }

    const wins: WinLine[] = evaluated.wins
    let stepWin = 0
    for (const line of wins) {
      line.cascade = index
      stepWin += line.win
    }
    const room = capRemaining - win
    if (stepWin > room) {
      capped = true
      let left = Math.max(0, room)
      for (const line of wins) {
        line.win = Math.min(line.win, left)
        left -= line.win
      }
      stepWin = Math.max(0, room)
    }
    for (const line of wins) if (line.count > maxClusterSize) maxClusterSize = line.count

    const removedPerReel = new Array<number>(reels).fill(0)
    for (const [reel, row] of evaluated.removed) {
      removedPerReel[reel] = (removedPerReel[reel] ?? 0) + 1
      const symbol = (current[row] as SymbolId[])[reel] as SymbolId
      if (!wildIds.has(symbol)) {
        removedBySymbol[symbol] = (removedBySymbol[symbol] ?? 0) + 1
      }
    }
    const refill: SymbolId[][] = []
    for (let reel = 0; reel < reels; reel += 1) {
      const strip = math.strips[reel] as readonly SymbolId[]
      const pulled: SymbolId[] = []
      for (let n = 0; n < (removedPerReel[reel] ?? 0); n += 1) {
        pulled.push(strip[pointers[reel] as number] as SymbolId)
        pointers[reel] = ((pointers[reel] as number) - 1 + strip.length) % strip.length
      }
      refill.push(pulled.reverse())
    }

    const step: CascadeStep = {
      index,
      wins,
      removed: evaluated.removed as GridPosition[],
      refill,
      multiplier,
      stepWin,
    }
    steps.push(step)
    win += stepWin
    current = applyCascadeStep(current, step)
    if (capped) break
  }
  return { steps, finalGrid: current, win, removedBySymbol, maxClusterSize, capped, hitMaxCascades }
}
