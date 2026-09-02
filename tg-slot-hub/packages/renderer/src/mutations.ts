import type { MutationCellChange, MutationEvent, SymbolId } from '@tgslot/slot-engine'
import {
  MUTATION_COMMIT_RATIO,
  MUTATION_DROP_STAGGER_MS,
  MUTATION_MAX_STAGGER_PORTION,
  MUTATION_MS_BY_TYPE,
  REDUCED_MUTATION_MS,
} from './constants.js'

/** 변형 종류. 엔진의 `MutationEvent['type']`을 그대로 쓴다. */
export type MutationKind = MutationEvent['type']

/**
 * 착지 그리드에 변형 이벤트를 순서대로 적용한다.
 *
 * **이 함수의 결과는 엔진의 `SpinResult.grid`와 반드시 같아야 한다.**
 * 렌더러는 릴을 `gridBefore`에 세우고 이 함수가 말하는 최종 그리드로 화면을 맞춘다.
 * 둘이 어긋나면 화면과 배당이 다른 것을 말하게 되므로, 테스트가 엔진 결과와 직접 비교한다.
 *
 * 좌표는 `[reel, row]`이고 그리드는 `grid[row][reel]`이다. 뒤집으면 조용히 엉뚱한 칸이 바뀐다.
 */
export function applyMutationEventsToGrid(
  gridBefore: readonly (readonly SymbolId[])[],
  mutations: readonly MutationEvent[],
): SymbolId[][] {
  const grid = gridBefore.map((row) => [...row])
  for (const mutation of mutations) {
    for (const cell of mutation.cells) {
      const [reel, row] = cell.position
      const line = grid[row]
      // 화면 밖 좌표는 조용히 버린다. 렌더러가 엔진보다 작은 격자를 그릴 이유는 없지만,
      // 여기서 던지면 연출 하나 때문에 스핀 전체가 멎는다.
      if (line === undefined || reel < 0 || reel >= line.length) continue
      line[reel] = cell.to
    }
  }
  return grid
}

/** 변형 1단계의 기본 길이(ms). */
export function mutationDurationMs(kind: MutationKind, reducedMotion = false): number {
  const base = MUTATION_MS_BY_TYPE[kind]
  return reducedMotion ? Math.min(base, REDUCED_MUTATION_MS) : base
}

/**
 * 텍스처를 갈아 끼우는 시각(단계 시작 기준 ms).
 * 모션 축소에서는 0이다. 연출 없이 결과만 보여준다.
 */
export function mutationCommitMs(kind: MutationKind, durationMs: number, reducedMotion = false): number {
  if (reducedMotion) return 0
  return Math.round(durationMs * MUTATION_COMMIT_RATIO[kind])
}

/**
 * 칸 하나가 시작을 기다리는 시간(ms).
 * 낙하만 차례로 떨어진다. 리빌·승급·확장은 한꺼번에 움직여야 "일괄"로 읽힌다.
 */
export function mutationCellDelayMs(kind: MutationKind, index: number, durationMs: number): number {
  if (kind !== 'randomWild') return 0
  const cap = durationMs * MUTATION_MAX_STAGGER_PORTION
  return Math.min(Math.max(0, index) * MUTATION_DROP_STAGGER_MS, cap)
}

/** 확장 와일드가 덮은 릴. 이벤트가 알려 주지 않으면 바뀐 칸에서 되짚는다. */
export function mutationReels(mutation: MutationEvent): number[] {
  if (mutation.reels !== undefined && mutation.reels.length > 0) return [...mutation.reels]
  const seen = new Set<number>()
  for (const cell of mutation.cells) seen.add(cell.position[0])
  return [...seen].sort((a, b) => a - b)
}

/** 연출 한 단계. `grid`는 이 단계까지 적용한 화면이다. */
export interface MutationStep {
  /** 재생 순서. 엔진이 준 이벤트 순서와 같다. */
  index: number
  type: MutationKind
  mutation: MutationEvent
  /** 이 단계가 끝났을 때 화면에 있어야 할 그리드 (`grid[row][reel]`). */
  grid: SymbolId[][]
  /** 이 단계가 실제로 바꾸는 칸. */
  cells: readonly MutationCellChange[]
  durationMs: number
  /** 단계 시작 기준으로 텍스처를 바꾸는 시각(ms). */
  commitMs: number
  /** 연출 전체 기준 시작 시각(ms). */
  atMs: number
}

export interface MutationPlan {
  steps: MutationStep[]
  /** 모든 단계를 순서대로 재생했을 때의 총 길이(ms). */
  totalMs: number
  /** 마지막 그리드. 변형이 없으면 `gridBefore`의 사본이다. */
  finalGrid: SymbolId[][]
}

export interface MutationPlanOptions {
  reducedMotion?: boolean
}

/**
 * 변형 연출 재생 목록. 순서·길이·중간 그리드를 전부 여기서 정한다.
 *
 * 아무것도 바꾸지 않는 이벤트는 빼 버린다. 화면에 변화가 없는데 배너만 뜨면 거짓말이 된다.
 * 순수 함수라 타이머 없이 순서와 시각을 그대로 검증할 수 있다.
 */
export function buildMutationPlan(
  gridBefore: readonly (readonly SymbolId[])[],
  mutations: readonly MutationEvent[],
  options: MutationPlanOptions = {},
): MutationPlan {
  const reduced = options.reducedMotion === true
  const played = mutations.filter((mutation) => mutation.cells.length > 0)

  const steps: MutationStep[] = []
  let grid = gridBefore.map((row) => [...row])
  let atMs = 0

  played.forEach((mutation, index) => {
    grid = applyMutationEventsToGrid(grid, [mutation])
    const durationMs = mutationDurationMs(mutation.type, reduced)
    steps.push({
      index,
      type: mutation.type,
      mutation,
      grid: grid.map((row) => [...row]),
      cells: mutation.cells,
      durationMs,
      commitMs: mutationCommitMs(mutation.type, durationMs, reduced),
      atMs,
    })
    atMs += durationMs
  })

  return { steps, totalMs: atMs, finalGrid: grid }
}
