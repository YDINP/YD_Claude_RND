import type { CascadeStep, SymbolId } from './types.js'

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
