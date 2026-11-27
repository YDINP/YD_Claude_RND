import type { GameMath, GardenBounds, GardenSeed, GardenStep, GardenSun, GridPosition, SymbolId } from '@tgslot/slot-engine'
import type { Layout } from './layout.js'
import { cellPitch, reelLeft, rowTop } from './layout.js'
import type { SpinSpeed } from './timing.js'

/**
 * 자라는 정원(growBoard) 연출의 순수 계획. 타이머·픽시 없이 순서·시각·카메라를 그대로 검증한다.
 * 렌더러 루트는 slot-engine을 타입으로만 가져오므로 판 접기 규칙은 여기 사본을 둔다(테스트가 엔진 `applyGardenStep`·`foldGarden`과 비교한다).
 * 좌표는 전부 물리 8×8 판의 절대 좌표 `[reel, row]`다.
 */

type Grid = readonly (readonly SymbolId[])[]

// ------------------------------------------------------------------ 활성 범위

/** 성장 단계 → 활성 범위. 엔진 `gardenBoundsFor`와 같은 표다. */
export const GARDEN_STAGES: readonly GardenBounds[] = [
  { x: 2, y: 2, size: 4 },
  { x: 2, y: 1, size: 5 },
  { x: 1, y: 1, size: 6 },
  { x: 1, y: 0, size: 7 },
  { x: 0, y: 0, size: 8 },
]

export function gardenBounds(stage: number): GardenBounds {
  const bounds = GARDEN_STAGES[Math.max(0, Math.min(GARDEN_STAGES.length - 1, Math.round(stage)))]
  return { ...(bounds as GardenBounds) }
}

export function gardenStageOf(bounds: Pick<GardenBounds, 'size'>): number {
  const stage = GARDEN_STAGES.findIndex((b) => b.size === bounds.size)
  return stage < 0 ? 0 : stage
}

export function inGardenBounds(bounds: GardenBounds, reel: number, row: number): boolean {
  return reel >= bounds.x && reel < bounds.x + bounds.size && row >= bounds.y && row < bounds.y + bounds.size
}

export function sameGardenBounds(a: GardenBounds, b: GardenBounds): boolean {
  return a.x === b.x && a.y === b.y && a.size === b.size
}

/** `from`에서 `to`로 자랄 때 새로 열리는 칸. 행 오름차순, 같은 행은 열 오름차순(엔진 `gardenNewCells`와 같다). */
export function gardenNewCellsOf(from: GardenBounds, to: GardenBounds): GridPosition[] {
  const cells: GridPosition[] = []
  for (let row = to.y; row < to.y + to.size; row += 1) {
    for (let reel = to.x; reel < to.x + to.size; reel += 1) {
      if (!inGardenBounds(from, reel, row)) cells.push([reel, row])
    }
  }
  return cells
}

// ------------------------------------------------------------------ 판 접기

/** 정원 1단계의 «팝 → 활성 범위 안 중력 → 리필»을 입힌다. 엔진 `applyGardenStep`과 한 글자도 다르지 않아야 한다. */
export function applyGardenStepToGrid(
  grid: Grid,
  bounds: GardenBounds,
  step: Pick<GardenStep, 'index' | 'removed' | 'refill'>,
): SymbolId[][] {
  const next = grid.map((line) => [...line])
  if (step.removed.length === 0) {
    if (step.refill.some((column) => column.length > 0)) {
      throw new RangeError(`정원 단계 ${step.index}: 지운 칸이 없는데 refill이 있다`)
    }
    return next
  }
  const { x, y, size } = bounds
  const gone = new Set<number>()
  for (const [reel, row] of step.removed) {
    if (!inGardenBounds(bounds, reel, row)) {
      throw new RangeError(`정원 단계 ${step.index}: 지울 칸 [${reel}, ${row}]이 활성 범위 밖이다`)
    }
    gone.add(row * 64 + reel)
  }
  if (step.refill.length !== size) {
    throw new RangeError(`정원 단계 ${step.index}: refill 열 수(${step.refill.length})가 활성 한 변(${size})과 다르다`)
  }
  for (let column = 0; column < size; column += 1) {
    const reel = x + column
    const kept: SymbolId[] = []
    for (let row = y; row < y + size; row += 1) {
      if (!gone.has(row * 64 + reel)) kept.push(grid[row]?.[reel] as SymbolId)
    }
    const refill = step.refill[column] ?? []
    if (refill.length !== size - kept.length) {
      throw new RangeError(
        `정원 단계 ${step.index}: 열 ${reel} refill(${refill.length})이 지워진 칸 수(${size - kept.length})와 다르다`,
      )
    }
    const filled = [...refill, ...kept]
    for (let k = 0; k < size; k += 1) (next[y + k] as SymbolId[])[reel] = filled[k] as SymbolId
  }
  return next
}

function cloneSeeds(seeds: readonly GardenSeed[]): GardenSeed[] {
  return seeds.map((seed) => ({ reel: seed.reel, row: seed.row, tier: seed.tier }))
}

function sortSeeds(seeds: GardenSeed[]): GardenSeed[] {
  return seeds.sort((a, b) => a.row - b.row || a.reel - b.reel)
}

/** 씨앗을 한 등급씩 올린다(최고 등급에서 멈춤). 오른 수를 준다. */
function growSeedTiers(seeds: GardenSeed[], maxTier: number): number {
  let grown = 0
  for (const seed of seeds) {
    if (seed.tier < maxTier) {
      seed.tier += 1
      grown += 1
    }
  }
  return grown
}

/** 단계를 순서대로 접는다. 엔진 `foldGarden`과 같은 결과여야 한다. */
export function foldGardenGrid(
  grid: Grid,
  start: GardenBounds,
  steps: readonly GardenStep[],
  startSeeds: readonly GardenSeed[] = [],
  maxTier = Number.POSITIVE_INFINITY,
): { grid: SymbolId[][]; bounds: GardenBounds; seeds: GardenSeed[] } {
  let current = grid.map((line) => [...line])
  let bounds = { ...start }
  let seeds = cloneSeeds(startSeeds)
  for (const step of steps) {
    current = applyGardenStepToGrid(current, bounds, step)
    if (step.bloomed.length > 0) {
      const used = new Set(step.bloomed.map(([reel, row]) => row * 64 + reel))
      seeds = seeds.filter((seed) => !used.has(seed.row * 64 + seed.reel))
    }
    const grow = step.grow
    if (grow !== undefined) {
      if (!sameGardenBounds(grow.from, bounds)) {
        throw new RangeError(`정원 단계 ${step.index}: 성장 시작 범위가 현재 범위와 다르다`)
      }
      growSeedTiers(seeds, maxTier)
      seeds.push(...cloneSeeds(grow.seeds))
      sortSeeds(seeds)
      bounds = { ...grow.to }
    }
  }
  return { grid: current, bounds, seeds }
}

// ------------------------------------------------------------------ 카메라

/** 컨테이너 배율·위치. `cameraLayer`에 그대로 넣는다(콘텐츠 지역 좌표). */
export interface GardenCamera {
  scale: number
  x: number
  y: number
}

/** 활성 범위가 배열 창(`reelArea`)을 꽉 채우게 하는 카메라. 8×8이면 항등이다. */
export function gardenCameraFor(layout: Layout, bounds: GardenBounds): GardenCamera {
  const pitch = cellPitch(layout)
  const fullSpan = layout.reels * pitch - layout.gap
  const span = bounds.size * pitch - layout.gap
  const scale = fullSpan / span
  const regionCenterX = reelLeft(layout, bounds.x) + span / 2
  const regionCenterY = rowTop(layout, bounds.y) + span / 2
  const windowCenterX = layout.reelArea.x + layout.reelArea.width / 2
  const windowCenterY = layout.reelArea.y + layout.reelArea.height / 2
  return { scale, x: windowCenterX - scale * regionCenterX, y: windowCenterY - scale * regionCenterY }
}

export const GARDEN_IDENTITY_CAMERA: GardenCamera = { scale: 1, x: 0, y: 0 }

/** 카메라를 통과한 칸 사각형(콘텐츠 지역 좌표). */
export function gardenCellRect(
  layout: Layout,
  camera: GardenCamera,
  reel: number,
  row: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: reelLeft(layout, reel) * camera.scale + camera.x,
    y: rowTop(layout, row) * camera.scale + camera.y,
    w: layout.symbolSize * camera.scale,
    h: layout.symbolSize * camera.scale,
  }
}

// ------------------------------------------------------------------ 시간표

export type GardenSpeedRow = SpinSpeed | 'reduced'

export function gardenSpeedRow(speed?: SpinSpeed, reducedMotion = false): GardenSpeedRow {
  if (reducedMotion) return 'reduced'
  return speed ?? 'normal'
}

/** 팝 단계의 기본 길이(강조·팝·낙하). 합이 기획서 §7-3 표의 단계 길이다(760/530/400/180). */
export const GARDEN_PHASE_MS: Record<GardenSpeedRow, { highlightMs: number; popMs: number; dropMs: number }> = {
  normal: { highlightMs: 280, popMs: 180, dropMs: 300 },
  quick: { highlightMs: 190, popMs: 130, dropMs: 210 },
  turbo: { highlightMs: 140, popMs: 100, dropMs: 160 },
  reduced: { highlightMs: 60, popMs: 50, dropMs: 70 },
}

/** 3번째 팝 단계(index 2)부터 ×0.78씩 줄고 하한은 기본의 0.27배다(candy R2와 같은 규칙). */
export const GARDEN_DECAY_FROM_INDEX = 2
export const GARDEN_DECAY = 0.78
export const GARDEN_FLOOR_RATIO = 0.27

/** 성장 한 번의 길이(첫 성장 기준). 이후 성장은 `GARDEN_GROW_DECAY`를 곱한다(650 → 520 → 420 → 340). */
export const GARDEN_GROW_MS: Record<GardenSpeedRow, number> = { normal: 650, quick: 450, turbo: 300, reduced: 200 }
export const GARDEN_GROW_DECAY: readonly number[] = [1, 0.8, 0.65, 0.52]

/** 씨앗 개화 연출이 단계에 더하는 시간. 처음 두 번만이다(세 번째부터는 강조 구간 안에서 처리). */
export const GARDEN_BLOOM_MS: Record<GardenSpeedRow, number> = { normal: 240, quick: 160, turbo: 0, reduced: 0 }
export const GARDEN_BLOOM_EXTRA_LIMIT = 2

/** 성장 공개 직전 기대감 지연. 판 상태만 조건이다. turbo·모션 축소는 0. */
export const GARDEN_ANTICIPATION_MS: Record<GardenSpeedRow, number> = { normal: 300, quick: 300, turbo: 0, reduced: 0 }

/** 햇살 1회의 길이. */
export const GARDEN_SUN_MS: Record<GardenSpeedRow, number> = { normal: 700, quick: 500, turbo: 350, reduced: 200 }

/** 스핀 시작에 카메라가 시작 범위로 돌아가는 시간. */
export const GARDEN_CAMERA_RESET_MS = 280

/** STOP 뒤 단계 하나의 길이 범위와 총 예산(캐스케이드와 같은 규칙). */
export const GARDEN_SKIP_BUDGET_MS = 1200
export const GARDEN_SKIP_MIN_MS = 90
export const GARDEN_SKIP_MAX_MS = 220
/** STOP 뒤 성장은 카메라를 150ms에 옮기고 덮개를 한꺼번에 연다. */
export const GARDEN_SKIP_GROW_MS = 150
export const GARDEN_SKIP_DROP_PORTION = 0.5
export const GARDEN_SKIP_MIN_DROP_MS = 45
export const GARDEN_SKIP_POP_PORTION = 0.2
/** 낙하에서 열마다 늦게 출발하는 간격 상한(ms)과 낙하 길이 대비 총 지연 상한. */
export const GARDEN_DROP_STAGGER_MS = 24
export const GARDEN_MAX_STAGGER_PORTION = 0.3

export interface GardenStepDurations {
  highlightMs: number
  popMs: number
  dropMs: number
  /** 씨앗 개화 연출(강조 뒤, 팝 앞). 개화가 없는 단계는 0. */
  bloomMs: number
  /** 성장 연출 전체(기대감 지연 제외). 성장이 없는 단계는 0. */
  growMs: number
  /** 성장 직전 기대감 지연. */
  anticipationMs: number
  staggerMs: number
  totalMs: number
}

function dropStaggerMs(dropMs: number, columns: number): number {
  if (columns <= 1) return 0
  return Math.min(GARDEN_DROP_STAGGER_MS, Math.floor((dropMs * GARDEN_MAX_STAGGER_PORTION) / (columns - 1)))
}

function finishDurations(parts: Omit<GardenStepDurations, 'staggerMs' | 'totalMs'>, columns: number): GardenStepDurations {
  const staggerMs = dropStaggerMs(parts.dropMs, columns)
  const totalMs = parts.highlightMs + parts.bloomMs + parts.popMs + parts.dropMs + parts.anticipationMs + parts.growMs
  return { ...parts, staggerMs, totalMs }
}

/** 팝 단계 `index`(0부터)의 팝 쪽 길이 배율. */
export function gardenPopScale(index: number): number {
  const decay = index < GARDEN_DECAY_FROM_INDEX ? 1 : GARDEN_DECAY ** (index - GARDEN_DECAY_FROM_INDEX + 1)
  return Math.max(GARDEN_FLOOR_RATIO, decay)
}

/** `growIndex`(0부터)번째 성장의 길이. */
export function gardenGrowDuration(growIndex: number, row: GardenSpeedRow): number {
  const factor = GARDEN_GROW_DECAY[Math.min(growIndex, GARDEN_GROW_DECAY.length - 1)] ?? 1
  return Math.round(GARDEN_GROW_MS[row] * factor)
}

export interface GardenStepTimingInput {
  index: number
  row: GardenSpeedRow
  columns: number
  /** 이 단계에 당첨(= 팝)이 있는가. 성장 전용 단계는 팝 구간이 0이다. */
  hasPop: boolean
  /** 이 단계가 씨앗 개화를 포함하고, 그것이 이 스핀의 몇 번째 개화인가(0부터). 개화가 없으면 undefined. */
  bloomOrdinal?: number
  /** 이 단계에서 자라는가, 그리고 몇 번째 성장인가(0부터). */
  growIndex?: number
  /** 성장 직전 기대감 지연을 넣을 단계인가. */
  anticipate?: boolean
}

export function gardenStepDurations(input: GardenStepTimingInput): GardenStepDurations {
  const base = GARDEN_PHASE_MS[input.row]
  const scale = gardenPopScale(input.index)
  const bloomed = input.bloomOrdinal !== undefined && input.bloomOrdinal < GARDEN_BLOOM_EXTRA_LIMIT
  return finishDurations(
    {
      highlightMs: input.hasPop ? Math.round(base.highlightMs * scale) : 0,
      popMs: input.hasPop ? Math.round(base.popMs * scale) : 0,
      dropMs: input.hasPop ? Math.round(base.dropMs * scale) : 0,
      bloomMs: input.hasPop && bloomed ? GARDEN_BLOOM_MS[input.row] : 0,
      anticipationMs: input.growIndex !== undefined && input.anticipate === true ? GARDEN_ANTICIPATION_MS[input.row] : 0,
      growMs: input.growIndex === undefined ? 0 : gardenGrowDuration(input.growIndex, input.row),
    },
    input.columns,
  )
}

/** STOP 뒤 단계 하나의 길이. 남은 단계 수로 나눠 [90, 220]ms로 묶는다. */
export function gardenSkipStepMs(remaining: number): number {
  const count = Math.max(1, remaining)
  return Math.max(GARDEN_SKIP_MIN_MS, Math.min(GARDEN_SKIP_MAX_MS, GARDEN_SKIP_BUDGET_MS / count))
}

/** STOP 뒤 단계 하나를 `stepMs`(+ 성장이면 150ms)에 맞춘다. 낙하는 언제나 위치 트윈이라 제자리 교체가 없다. */
export function compressGardenStep(stepMs: number, columns: number, hasPop: boolean, grows: boolean): GardenStepDurations {
  const total = Math.round(stepMs)
  const growMs = grows ? GARDEN_SKIP_GROW_MS : 0
  if (!hasPop) {
    return finishDurations({ highlightMs: 0, popMs: 0, dropMs: 0, bloomMs: 0, anticipationMs: 0, growMs }, columns)
  }
  const dropMs = Math.max(GARDEN_SKIP_MIN_DROP_MS, Math.ceil(total * GARDEN_SKIP_DROP_PORTION))
  const popMs = Math.max(0, Math.min(total - dropMs, Math.round(total * GARDEN_SKIP_POP_PORTION)))
  const highlightMs = Math.max(0, total - dropMs - popMs)
  return finishDurations({ highlightMs, popMs, dropMs, bloomMs: 0, anticipationMs: 0, growMs }, columns)
}

// ------------------------------------------------------------------ 이동

/** 칸 하나의 이동. `fromRow`는 물리 행이고 활성 범위 위쪽이면 창 밖에서 들어오는 리필이다. */
export interface GardenMove {
  reel: number
  fromRow: number
  toRow: number
  symbol: SymbolId
  refill: boolean
}

/** 단계의 이동 목록. 남은 칸은 지워진 만큼 아래로, 리필은 활성 범위 위에 쌓아 두었다가 떨어진다. */
export function gardenMoves(grid: Grid, bounds: GardenBounds, step: Pick<GardenStep, 'removed' | 'refill'>): GardenMove[] {
  const gone = new Set(step.removed.map(([reel, row]) => row * 64 + reel))
  const moves: GardenMove[] = []
  for (let column = 0; column < bounds.size; column += 1) {
    const reel = bounds.x + column
    const keptRows: number[] = []
    for (let row = bounds.y; row < bounds.y + bounds.size; row += 1) if (!gone.has(row * 64 + reel)) keptRows.push(row)
    const removedCount = bounds.size - keptRows.length
    if (removedCount === 0) continue
    const refill = step.refill[column] ?? []
    refill.forEach((symbol, j) => {
      moves.push({ reel, fromRow: bounds.y + j - removedCount, toRow: bounds.y + j, symbol, refill: true })
    })
    keptRows.forEach((fromRow, i) => {
      const toRow = bounds.y + removedCount + i
      if (toRow === fromRow) return
      moves.push({ reel, fromRow, toRow, symbol: grid[fromRow]?.[reel] as SymbolId, refill: false })
    })
  }
  return moves
}

// ------------------------------------------------------------------ 계획

/** 한 칸에 자리 잡은 씨앗 표시(배율 값은 `seedTiers[tier]`). */
export type GardenSeedView = GardenSeed

export interface GardenWinGroup {
  positions: GridPosition[]
  /** 씨앗 배율. 씨앗이 없으면 undefined. */
  seed?: number
  symbol: SymbolId
  win: number
}

export interface GardenGrowPlan {
  from: GardenBounds
  to: GardenBounds
  /** 새로 열린 칸과 그 칸에 드러나는 심볼(착지 때 정해진 값). */
  cells: { position: GridPosition; symbol: SymbolId }[]
  /** 이번 성장으로 새로 나온 씨앗. */
  newSeeds: GardenSeed[]
  /** 등급이 오른 기존 씨앗 수. */
  grown: number
  /** 몇 번째 성장인가(0부터). */
  growIndex: number
}

export interface GardenPlanStep {
  index: number
  step: GardenStep
  boundsBefore: GardenBounds
  boundsAfter: GardenBounds
  gridBefore: SymbolId[][]
  gridAfter: SymbolId[][]
  /** 승리 하나당 칸 묶음(절대 좌표). 씨앗 배율은 `seed`. */
  groups: GardenWinGroup[]
  removed: GridPosition[]
  removedSymbols: SymbolId[]
  /** 이 단계 시작에 판 위 씨앗. */
  seedsBefore: GardenSeed[]
  /** 쓰인 씨앗 자리를 뺀 뒤(성장 전). */
  seedsPopped: GardenSeed[]
  /** 이 단계가 끝났을 때 씨앗(성장 반영). */
  seedsAfter: GardenSeed[]
  /** 이 단계에 쓰인 씨앗. 등급(배율 표 인덱스)을 함께 준다. */
  bloomed: GardenSeed[]
  moves: GardenMove[]
  grow?: GardenGrowPlan
  stepWin: number
  cumulativeWin: number
  popped: number
  durations: GardenStepDurations
  atMs: number
}

export interface GardenPlan {
  steps: GardenPlanStep[]
  totalMs: number
  /** 마지막 판. `finalGrid`를 주면 그 값이고 아니면 접은 값이다. */
  finalGrid: SymbolId[][]
  /** 접은 판이 받은 `finalGrid`와 다르면 true. 화면은 `finalGrid`를 따른다. */
  mismatch: boolean
  startBounds: GardenBounds
  finalBounds: GardenBounds
  /** 단계·성장이 모두 끝난 뒤 씨앗(햇살 전). */
  seeds: GardenSeed[]
}

export interface GardenPlanInput {
  start: GardenBounds
  startSeeds: readonly GardenSeed[]
  steps: readonly GardenStep[]
  finalGrid?: Grid
}

export interface GardenPlanOptions {
  speed?: SpinSpeed
  reducedMotion?: boolean
  /** `seedTiers.length - 1`. 없으면 올림에 상한이 없다. */
  maxTier?: number
  /** 활성 범위 안의 스캐터 수가 이 값 이상 `trigger`개 미만이면 성장 직전에 기대감 지연을 넣는다. */
  scatter?: { symbol: SymbolId; trigger: number }
}

function sameGrid(a: Grid, b: Grid): boolean {
  if (a.length !== b.length) return false
  return a.every((line, r) => line.length === b[r]?.length && line.every((symbol, c) => b[r]?.[c] === symbol))
}

/** 활성 범위 안 스캐터 수. */
export function gardenScatterCount(grid: Grid, bounds: GardenBounds, scatter: SymbolId): number {
  let count = 0
  for (let row = bounds.y; row < bounds.y + bounds.size; row += 1) {
    for (let reel = bounds.x; reel < bounds.x + bounds.size; reel += 1) {
      if (grid[row]?.[reel] === scatter) count += 1
    }
  }
  return count
}

/**
 * 정원 재생 목록. 중간 판·씨앗·카메라 범위·길이·누적 지급을 전부 여기서 정한다.
 * 어긋난 단계(리필 길이·범위 밖 칸)는 던진다 — 호출 측은 던지면 연출만 버리고 판을 서버 값으로 확정한다.
 */
export function buildGardenPlan(grid: Grid, input: GardenPlanInput, options: GardenPlanOptions = {}): GardenPlan {
  const row = gardenSpeedRow(options.speed, options.reducedMotion === true)
  const maxTier = options.maxTier ?? Number.POSITIVE_INFINITY
  const planned: GardenPlanStep[] = []
  let current: SymbolId[][] = grid.map((line) => [...line])
  let bounds: GardenBounds = { ...input.start }
  let seeds = sortSeeds(cloneSeeds(input.startSeeds))
  let atMs = 0
  let cumulativeWin = 0
  let growCount = 0
  let bloomCount = 0

  input.steps.forEach((step, index) => {
    const gridBefore = current
    const boundsBefore = bounds
    const seedsBefore = cloneSeeds(seeds)
    const gridAfter = applyGardenStepToGrid(current, bounds, step)
    const removed = step.removed.map(([reel, r]): GridPosition => [reel, r])
    const removedSymbols = removed.map(([reel, r]) => gridBefore[r]?.[reel] as SymbolId)

    // 쓰인 씨앗: 자리와 등급을 함께 남긴다(개화 연출이 등급 얼굴을 보여 준다).
    const bloomedKeys = new Set(step.bloomed.map(([reel, r]) => r * 64 + reel))
    const bloomed = seeds.filter((seed) => bloomedKeys.has(seed.row * 64 + seed.reel)).map((seed) => ({ ...seed }))
    seeds = seeds.filter((seed) => !bloomedKeys.has(seed.row * 64 + seed.reel))
    const seedsPopped = cloneSeeds(seeds)

    let growPlan: GardenGrowPlan | undefined
    let boundsAfter = bounds
    if (step.grow !== undefined) {
      if (!sameGardenBounds(step.grow.from, bounds)) {
        throw new RangeError(`정원 단계 ${step.index}: 성장 시작 범위가 현재 범위와 다르다`)
      }
      growSeedTiers(seeds, maxTier)
      seeds.push(...cloneSeeds(step.grow.seeds))
      sortSeeds(seeds)
      boundsAfter = { ...step.grow.to }
      growPlan = {
        from: { ...step.grow.from },
        to: boundsAfter,
        cells: step.grow.cells.map(([reel, r]) => ({
          position: [reel, r] as GridPosition,
          symbol: gridAfter[r]?.[reel] as SymbolId,
        })),
        newSeeds: cloneSeeds(step.grow.seeds),
        grown: step.grow.grown,
        growIndex: growCount,
      }
      growCount += 1
    }

    const seedWins = step.wins.filter((win) => win.seed !== undefined && win.seed > 1)
    const bloomOrdinal = seedWins.length > 0 || bloomed.length > 0 ? bloomCount : undefined
    if (bloomOrdinal !== undefined) bloomCount += 1

    // 기대감: 성장 직전 활성 판(성장 전, 팝·리필을 끝낸 판)에 스캐터가 trigger-1개 있을 때만. 결과가 아니라 판 상태가 조건이다.
    const anticipate =
      growPlan !== undefined &&
      options.scatter !== undefined &&
      gardenScatterCount(gridAfter, boundsBefore, options.scatter.symbol) === options.scatter.trigger - 1

    const durations = gardenStepDurations({
      index,
      row,
      columns: boundsBefore.size,
      hasPop: step.removed.length > 0,
      ...(bloomOrdinal === undefined ? {} : { bloomOrdinal }),
      ...(growPlan === undefined ? {} : { growIndex: growPlan.growIndex }),
      ...(anticipate ? { anticipate: true } : {}),
    })

    cumulativeWin += step.stepWin
    planned.push({
      index,
      step,
      boundsBefore,
      boundsAfter,
      gridBefore,
      gridAfter,
      groups: step.wins.map((win) => ({
        positions: win.positions.map(([reel, r]): GridPosition => [reel, r]),
        ...(win.seed === undefined ? {} : { seed: win.seed }),
        symbol: win.symbol,
        win: win.win,
      })),
      removed,
      removedSymbols,
      seedsBefore,
      seedsPopped,
      seedsAfter: cloneSeeds(seeds),
      bloomed,
      moves: gardenMoves(gridBefore, boundsBefore, step),
      ...(growPlan === undefined ? {} : { grow: growPlan }),
      stepWin: step.stepWin,
      cumulativeWin,
      popped: step.popped,
      durations,
      atMs,
    })
    atMs += durations.totalMs
    current = gridAfter
    bounds = boundsAfter
  })

  const folded = current.map((line) => [...line])
  const finalGrid = input.finalGrid === undefined ? folded : input.finalGrid.map((line) => [...line])
  return {
    steps: planned,
    totalMs: atMs,
    finalGrid,
    mismatch: !sameGrid(folded, finalGrid),
    startBounds: { ...input.start },
    finalBounds: bounds,
    seeds,
  }
}

/** STOP이 `skippedAt`번째 단계(0부터) 재생 중에 들어온 뒤의 길이표. 단계 길이는 그 순간 남은 단계 수로 한 번만 정한다. */
export function compressedGardenSchedule(plan: GardenPlan, skippedAt: number): GardenStepDurations[] {
  const from = Math.max(0, Math.min(skippedAt, plan.steps.length))
  const remaining = plan.steps.slice(from)
  const stepMs = gardenSkipStepMs(remaining.length)
  return remaining.map((planned) =>
    compressGardenStep(stepMs, planned.boundsBefore.size, planned.step.removed.length > 0, planned.grow !== undefined),
  )
}

// ------------------------------------------------------------------ 햇살

export interface GardenSunPlan {
  /** 햇살 전 씨앗. */
  before: GardenSeed[]
  /** 등급이 오른 뒤(새 씨앗을 심기 전). */
  grownSeeds: GardenSeed[]
  planted: GardenSeed[]
  /** 햇살 뒤 판 위 씨앗 전부. */
  after: GardenSeed[]
  grown: number
  durationMs: number
}

/** 햇살 1회의 재생 계획. `before`는 직전 씨앗(단계 뒤 또는 이전 햇살 뒤)이다. */
export function buildGardenSunPlan(
  before: readonly GardenSeed[],
  sun: Pick<GardenSun, 'grown' | 'planted' | 'seeds'>,
  options: { speed?: SpinSpeed; reducedMotion?: boolean; maxTier?: number } = {},
): GardenSunPlan {
  const maxTier = options.maxTier ?? Number.POSITIVE_INFINITY
  const grownSeeds = cloneSeeds(before)
  growSeedTiers(grownSeeds, maxTier)
  return {
    before: cloneSeeds(before),
    grownSeeds: sortSeeds(grownSeeds),
    planted: cloneSeeds(sun.planted),
    after: sortSeeds(cloneSeeds(sun.seeds)),
    grown: sun.grown,
    durationMs: GARDEN_SUN_MS[gardenSpeedRow(options.speed, options.reducedMotion === true)],
  }
}

// ------------------------------------------------------------------ 착지·기대감

/** 스핀 시작에 쓸 활성 열 범위. 이 밖의 열은 카메라 밖이라 정지 순서만 맞춘다. */
export interface GardenActiveReels {
  from: number
  count: number
}

export function gardenActiveReels(bounds: GardenBounds): GardenActiveReels {
  return { from: bounds.x, count: bounds.size }
}

/** 릴 `reel`이 정지 계획의 몇 번째 활성 릴을 따르는가. 활성 범위 밖 열은 가장 가까운 활성 릴을 따른다. */
export function gardenPlanIndexOf(reel: number, active: GardenActiveReels): number {
  return Math.max(0, Math.min(active.count - 1, reel - active.from))
}

/** 기대감 한 건: 보너스를 여는 스캐터 개수. 정원 팩은 `growBoard.bonus.trigger`다. */
export function gardenTriggerCount(math: Pick<GameMath, 'growBoard'>): number | undefined {
  return math.growBoard?.bonus.trigger
}

/**
 * 기대감을 걸 릴 목록(활성 열 안, 왼쪽부터). 활성 범위 **밖**(덮인 화분) 칸의 스캐터는 세지 않는다 —
 * 보이지 않는 칸 때문에 감속하는 일이 없어야 한다. `grid`는 서버 착지 창이 아니라 스트립에서 되짚은 값이어도 된다.
 */
export function gardenAnticipatedReels(
  math: Pick<GameMath, 'growBoard' | 'scatter'>,
  window: Grid,
  bounds: GardenBounds,
): number[] {
  const trigger = gardenTriggerCount(math)
  const scatter = math.scatter?.symbol
  if (trigger === undefined || scatter === undefined) return []
  const result: number[] = []
  let landed = 0
  for (let reel = bounds.x; reel < bounds.x + bounds.size; reel += 1) {
    let count = 0
    for (let row = bounds.y; row < bounds.y + bounds.size; row += 1) if (window[row]?.[reel] === scatter) count += 1
    if (landed > 0 && landed >= trigger - 1 && landed < trigger) result.push(reel)
    landed += count
  }
  return result
}

/** 스트립과 정지 위치에서 8×8 창을 되짚는다(`grid[row][reel]`). */
export function gardenWindowFromStops(
  strips: readonly (readonly SymbolId[])[],
  stops: readonly number[],
  size: number,
): SymbolId[][] {
  const grid: SymbolId[][] = Array.from({ length: size }, () => new Array<SymbolId>(strips.length))
  strips.forEach((strip, reel) => {
    const stop = stops[reel] ?? 0
    for (let row = 0; row < size; row += 1) {
      ;(grid[row] as SymbolId[])[reel] = strip[(stop + row) % strip.length] as SymbolId
    }
  })
  return grid
}

/** 이 단계의 시간을 최악 스핀 게이트와 비교하려고 계획 없이 합산한다(테스트용). */
export function gardenWorstCaseMs(row: GardenSpeedRow, options: { popSteps: number; grows: number; blooms: number; anticipations: number; suns: number }): number {
  let total = 0
  for (let i = 0; i < options.popSteps; i += 1) {
    total += gardenStepDurations({ index: i, row, columns: 8, hasPop: true, ...(i < options.blooms ? { bloomOrdinal: i } : {}) }).totalMs
  }
  for (let g = 0; g < options.grows; g += 1) total += gardenGrowDuration(g, row)
  total += options.anticipations * GARDEN_ANTICIPATION_MS[row]
  total += options.suns * GARDEN_SUN_MS[row]
  return total
}
