import type { CascadeStep, GridPosition, SymbolId } from '@tgslot/slot-engine'
import {
  CASCADE_DECAY,
  CASCADE_DECAY_FROM_INDEX,
  CASCADE_DROP_STAGGER_MS,
  CASCADE_FLOOR_RATIO,
  CASCADE_MAX_STAGGER_PORTION,
  CASCADE_PHASE_MS,
  CASCADE_SKIP_BUDGET_MS,
  CASCADE_SKIP_DROP_PORTION,
  CASCADE_SKIP_MAX_MS,
  CASCADE_SKIP_MIN_DROP_MS,
  CASCADE_SKIP_MIN_MS,
  CASCADE_SKIP_POP_PORTION,
} from './constants.js'
import type { SpinSpeed } from './timing.js'

type Grid = readonly (readonly SymbolId[])[]

/**
 * 연쇄 1단계를 그리드에 입힌다. 엔진 `applyCascadeStep`과 한 글자도 다르지 않아야 한다(테스트가 비교한다).
 * 렌더러 루트는 slot-engine을 타입으로만 가져오므로 같은 규칙을 여기 둔다.
 */
export function applyCascadeStepToGrid(grid: Grid, step: CascadeStep): SymbolId[][] {
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

/** 시간표 행. 속도 프로파일 셋에 모션 축소가 하나 더 붙는다. */
export type CascadeSpeedRow = keyof typeof CASCADE_PHASE_MS

export function cascadeSpeedRow(speed?: SpinSpeed, reducedMotion = false): CascadeSpeedRow {
  if (reducedMotion) return 'reduced'
  return speed ?? 'normal'
}

export interface CascadeStepDurations {
  highlightMs: number
  popMs: number
  dropMs: number
  /** 낙하 안에서 릴마다 늦게 출발하는 간격. 릴 r은 `r * staggerMs`에 출발한다. */
  staggerMs: number
  totalMs: number
}

function dropStaggerMs(dropMs: number, reels: number): number {
  if (reels <= 1) return 0
  return Math.min(CASCADE_DROP_STAGGER_MS, Math.floor((dropMs * CASCADE_MAX_STAGGER_PORTION) / (reels - 1)))
}

function durations(highlightMs: number, popMs: number, dropMs: number, reels: number): CascadeStepDurations {
  return { highlightMs, popMs, dropMs, staggerMs: dropStaggerMs(dropMs, reels), totalMs: highlightMs + popMs + dropMs }
}

/** 단계 `index`(0부터)의 길이. 3단계부터 ×0.78씩 줄고 하한은 그 행 기본의 0.27배다. */
export function cascadeStepDurations(index: number, row: CascadeSpeedRow, reels: number): CascadeStepDurations {
  const base = CASCADE_PHASE_MS[row]
  const decay = index < CASCADE_DECAY_FROM_INDEX ? 1 : CASCADE_DECAY ** (index - CASCADE_DECAY_FROM_INDEX + 1)
  const scale = Math.max(CASCADE_FLOOR_RATIO, decay)
  return durations(
    Math.round(base.highlightMs * scale),
    Math.round(base.popMs * scale),
    Math.round(base.dropMs * scale),
    reels,
  )
}

/** STOP 뒤 단계 하나의 길이. 남은 단계 수로 나눠 정하고 [90, 220]ms로 묶는다. */
export function cascadeSkipStepMs(remaining: number): number {
  const count = Math.max(1, remaining)
  return Math.max(CASCADE_SKIP_MIN_MS, Math.min(CASCADE_SKIP_MAX_MS, CASCADE_SKIP_BUDGET_MS / count))
}

/**
 * STOP 뒤 단계 하나를 `stepMs`에 맞춘다. 건너뛰지 않는다 — 낙하는 언제나 위치 트윈이라
 * 착지한 판에서 심볼이 제자리에서 바뀌어 보이는 일이 없다.
 */
export function compressCascadeStep(stepMs: number, reels: number): CascadeStepDurations {
  const total = Math.round(stepMs)
  const dropMs = Math.max(CASCADE_SKIP_MIN_DROP_MS, Math.ceil(total * CASCADE_SKIP_DROP_PORTION))
  const popMs = Math.min(total - dropMs, Math.round(total * CASCADE_SKIP_POP_PORTION))
  const highlightMs = Math.max(0, total - dropMs - popMs)
  return durations(highlightMs, Math.max(0, popMs), dropMs, reels)
}

/** 칸 하나의 이동. `fromRow`가 음수면 창 위에서 들어오는 리필이다. */
export interface CascadeMove {
  reel: number
  fromRow: number
  toRow: number
  symbol: SymbolId
  refill: boolean
}

export interface CascadePlanStep {
  index: number
  step: CascadeStep
  gridBefore: SymbolId[][]
  /** 이 단계를 끝냈을 때 화면에 있어야 할 판. 마지막 단계의 값은 `finalGrid`와 같다. */
  gridAfter: SymbolId[][]
  removed: GridPosition[]
  /** `removed`와 같은 순서의 원래 심볼. */
  removedSymbols: SymbolId[]
  /** 승리 하나당 칸 묶음. 외곽선을 그룹마다 그린다. */
  groups: GridPosition[][]
  /** 실제로 움직이는 칸만. 제자리 칸은 빠진다. */
  moves: CascadeMove[]
  stepWin: number
  cumulativeWin: number
  multiplier: number
  durations: CascadeStepDurations
  atMs: number
}

export interface CascadePlan {
  steps: CascadePlanStep[]
  totalMs: number
  /** 마지막 판. `finalGrid`를 주면 그 값이고, 아니면 단계를 접은 값이다. */
  finalGrid: SymbolId[][]
  /** 접은 판이 받은 `finalGrid`와 다르면 true. 화면은 `finalGrid`를 따른다. */
  mismatch: boolean
}

export interface CascadePlanOptions {
  speed?: SpinSpeed
  reducedMotion?: boolean
  finalGrid?: Grid
}

function sameGrid(a: Grid, b: Grid): boolean {
  if (a.length !== b.length) return false
  return a.every((row, r) => row.length === b[r]?.length && row.every((symbol, c) => b[r]?.[c] === symbol))
}

/** 단계의 이동 목록. 남은 칸은 지워진 만큼 아래로, 리필은 창 위에 쌓아 두었다가 떨어진다. */
export function cascadeMoves(grid: Grid, step: CascadeStep): CascadeMove[] {
  const rows = grid.length
  const reels = grid[0]?.length ?? 0
  const gone = new Set(step.removed.map(([reel, row]) => `${reel}:${row}`))
  const moves: CascadeMove[] = []
  for (let reel = 0; reel < reels; reel += 1) {
    const keptRows: number[] = []
    for (let row = 0; row < rows; row += 1) if (!gone.has(`${reel}:${row}`)) keptRows.push(row)
    const removedCount = rows - keptRows.length
    if (removedCount === 0) continue
    const refill = step.refill[reel] ?? []
    refill.forEach((symbol, j) => {
      moves.push({ reel, fromRow: j - removedCount, toRow: j, symbol, refill: true })
    })
    keptRows.forEach((fromRow, i) => {
      const toRow = removedCount + i
      if (toRow === fromRow) return
      moves.push({ reel, fromRow, toRow, symbol: grid[fromRow]?.[reel] as SymbolId, refill: false })
    })
  }
  return moves
}

/**
 * 연쇄 재생 목록. 중간 판·이동·길이·누적 지급을 전부 여기서 정한다.
 * 순수 함수라 타이머 없이 순서와 시각을 그대로 검증할 수 있다. 어긋난 단계는 던진다.
 */
export function buildCascadePlan(
  grid: Grid,
  steps: readonly CascadeStep[],
  options: CascadePlanOptions = {},
): CascadePlan {
  const row = cascadeSpeedRow(options.speed, options.reducedMotion === true)
  const reels = grid[0]?.length ?? 0
  const planned: CascadePlanStep[] = []
  let current: SymbolId[][] = grid.map((line) => [...line])
  let atMs = 0
  let cumulativeWin = 0

  steps.forEach((step, index) => {
    const gridAfter = applyCascadeStepToGrid(current, step)
    const removed = step.removed.map(([reel, r]): GridPosition => [reel, r])
    cumulativeWin += step.stepWin
    const stepDurations = cascadeStepDurations(index, row, reels)
    planned.push({
      index,
      step,
      gridBefore: current,
      gridAfter,
      removed,
      removedSymbols: removed.map(([reel, r]) => current[r]?.[reel] as SymbolId),
      groups: step.wins.map((win) => win.positions.map(([reel, r]): GridPosition => [reel, r])),
      moves: cascadeMoves(current, step),
      stepWin: step.stepWin,
      cumulativeWin,
      multiplier: step.multiplier,
      durations: stepDurations,
      atMs,
    })
    atMs += stepDurations.totalMs
    current = gridAfter
  })

  const folded = current.map((line) => [...line])
  const finalGrid = options.finalGrid === undefined ? folded : options.finalGrid.map((line) => [...line])
  return { steps: planned, totalMs: atMs, finalGrid, mismatch: !sameGrid(folded, finalGrid) }
}

/**
 * `skippedAt`번째 단계(0부터)가 재생 중일 때 STOP이 들어온 뒤의 길이표.
 * 단계 길이는 그 순간 남은 단계 수로 한 번만 정한다. 단계를 거듭하며 다시 나누면 합이 예산을 넘는다.
 */
export function compressedCascadeSchedule(plan: CascadePlan, skippedAt: number): CascadeStepDurations[] {
  const reels = plan.finalGrid[0]?.length ?? 0
  const from = Math.max(0, Math.min(skippedAt, plan.steps.length))
  const stepMs = cascadeSkipStepMs(plan.steps.length - from)
  return plan.steps.slice(from).map(() => compressCascadeStep(stepMs, reels))
}

/** 외곽선 한 변. 단위는 칸이다(x는 릴, y는 행 경계). */
export interface OutlineSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * 그룹 칸들의 합집합 경계. 그룹 밖과 맞닿은 칸 변만 남기고 한 줄로 이어지는 변은 합친다.
 * 안쪽 변(그룹 칸끼리 맞닿은 변)은 그리지 않는다.
 */
export function clusterOutlineSegments(positions: readonly (readonly [number, number])[]): OutlineSegment[] {
  const cells = new Set(positions.map(([reel, row]) => `${reel}:${row}`))
  const has = (reel: number, row: number): boolean => cells.has(`${reel}:${row}`)
  // 방향을 함께 키에 넣는다. 위 변과 아래 변이 같은 선에 놓여도 섞이면 안 된다.
  const horizontal = new Map<string, number[]>()
  const vertical = new Map<string, number[]>()
  const push = (map: Map<string, number[]>, key: string, value: number): void => {
    const list = map.get(key)
    if (list === undefined) map.set(key, [value])
    else list.push(value)
  }
  for (const key of cells) {
    const [reel, row] = key.split(':').map(Number) as [number, number]
    if (!has(reel, row - 1)) push(horizontal, `t:${row}`, reel)
    if (!has(reel, row + 1)) push(horizontal, `b:${row + 1}`, reel)
    if (!has(reel - 1, row)) push(vertical, `l:${reel}`, row)
    if (!has(reel + 1, row)) push(vertical, `r:${reel + 1}`, row)
  }
  const segments: OutlineSegment[] = []
  const merge = (map: Map<string, number[]>, toSegment: (line: number, from: number, to: number) => OutlineSegment): void => {
    const keys = [...map.keys()].sort()
    for (const key of keys) {
      const line = Number(key.slice(2))
      const units = [...(map.get(key) ?? [])].sort((a, b) => a - b)
      let start = units[0] as number
      let prev = start
      for (let i = 1; i <= units.length; i += 1) {
        const unit = units[i]
        if (unit !== undefined && unit === prev + 1) {
          prev = unit
          continue
        }
        segments.push(toSegment(line, start, prev + 1))
        if (unit !== undefined) {
          start = unit
          prev = unit
        }
      }
    }
  }
  merge(horizontal, (y, from, to) => ({ x1: from, y1: y, x2: to, y2: y }))
  merge(vertical, (x, from, to) => ({ x1: x, y1: from, x2: x, y2: to }))
  return segments
}
