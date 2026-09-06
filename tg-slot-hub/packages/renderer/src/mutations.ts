import type { MutationCellChange, MutationEvent, SymbolId } from '@tgslot/slot-engine'
import { wrapIndex } from './grid.js'
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

/**
 * 변형이 앉힌 심볼을 화면에 붙들어 두는 층.
 *
 * **자리를 스트립 인덱스로 기억하는 것이 핵심이다.** 화면 행으로 기억하면 릴이 돌기 시작할 때
 * 얹힌 심볼만 그 행에 붙박이고, 원래 심볼(미스터리는 `?`)이 아래에서 드러난다.
 * 스트립 자리로 못 박으면 변형 심볼도 다른 심볼과 똑같이 아래로 흘러 나간다.
 *
 * 상태는 셋뿐이고 그 사이에 중간이 없다.
 * - `none`: 얹힌 것이 없다.
 * - `resting`: 릴이 멈춰 있고 층이 그대로 보인다.
 * - `fading`: 스핀이 시작됐다. 릴마다 시작 자리를 기억해 두고, 충분히 지나가면 릴 단위로 놓는다.
 *   놓지 않으면 한 바퀴를 돌아 같은 자리가 돌아올 때 변형 심볼이 다시 스쳐 지나간다.
 */
export type MutationOverlay =
  | { readonly kind: 'none' }
  | { readonly kind: 'resting'; readonly cells: OverlayCells }
  | {
      readonly kind: 'fading'
      readonly cells: OverlayCells
      /** 릴 -> 스핀이 시작될 때의 위치. */
      readonly anchors: ReadonlyMap<number, number>
    }

/** 릴 -> 스트립 자리 -> 그 자리에 얹힌 심볼. */
export type OverlayCells = ReadonlyMap<number, ReadonlyMap<number, SymbolId>>

/** 아무것도 얹지 않은 상태. */
export const NO_MUTATION_OVERLAY: MutationOverlay = { kind: 'none' }

/**
 * 변형 결과를 스트립 자리에 못 박는다.
 *
 * @param grid `grid[row][reel]`. 화면에 보이는 행만 담는다.
 * @param positions 릴별 현재 위치. 화면 행 0에 오는 스트립 자리다(정지 중이므로 정수).
 * @param stripLengths 릴별 스트립 길이. 릴마다 다를 수 있다.
 */
export function holdMutationOverlay(
  grid: readonly (readonly SymbolId[])[],
  positions: readonly number[],
  stripLengths: readonly number[],
): MutationOverlay {
  const cells = new Map<number, Map<number, SymbolId>>()
  grid.forEach((rowSymbols, row) => {
    rowSymbols.forEach((symbol, reel) => {
      const length = stripLengths[reel]
      const position = positions[reel]
      if (length === undefined || position === undefined || length <= 0) return
      const perReel = cells.get(reel) ?? new Map<number, SymbolId>()
      perReel.set(wrapIndex(Math.round(position) + row, length), symbol)
      cells.set(reel, perReel)
    })
  })
  return cells.size === 0 ? NO_MUTATION_OVERLAY : { kind: 'resting', cells }
}

/**
 * 스핀이 시작됐다. 층을 **걷지 않고** 릴마다 지금 자리를 기억해 둔다.
 *
 * 여기서 걷어 버리면 릴이 움직이기도 전에 변형이 풀린 모습이 한 프레임 그대로 보인다 —
 * 사용자가 "스핀을 누르면 다시 물음표가 된다"고 말한 자리가 정확히 이곳이다.
 */
export function fadeMutationOverlay(
  overlay: MutationOverlay,
  positions: readonly number[],
): MutationOverlay {
  if (overlay.kind === 'none') return overlay
  const anchors = new Map<number, number>()
  for (const reel of overlay.cells.keys()) {
    const position = positions[reel]
    if (position !== undefined) anchors.set(reel, position)
  }
  return anchors.size === 0 ? NO_MUTATION_OVERLAY : { kind: 'fading', cells: overlay.cells, anchors }
}

/**
 * 릴 하나가 층을 놓는다. 그 릴의 칸은 곧장 스트립으로 돌아간다.
 * 마지막 릴이 놓으면 층 자체가 사라진다.
 *
 * 멈춰 있는 층(`resting`)은 놓지 않는다 — 놓을 시점을 아는 것은 도는 릴뿐이다.
 */
export function releaseMutationOverlayReel(overlay: MutationOverlay, reel: number): MutationOverlay {
  if (overlay.kind !== 'fading') return overlay
  if (!overlay.anchors.has(reel)) return overlay
  const anchors = new Map(overlay.anchors)
  anchors.delete(reel)
  const cells = new Map(overlay.cells)
  cells.delete(reel)
  return cells.size === 0 ? NO_MUTATION_OVERLAY : { kind: 'fading', cells, anchors }
}

/**
 * 릴이 시작 자리에서 `clearance`칸 이상 지났으면 층을 놓는다.
 *
 * `clearance`는 얹힌 띠가 화면 밖으로 완전히 빠져나가는 거리다(행 수보다 조금 크게).
 * 이보다 짧으면 아직 보이는 심볼이 사라지고, 스트립 길이만큼 길면 한 바퀴 돌아온 변형 심볼이
 * 다시 스쳐 지나간다.
 */
export function expireMutationOverlay(
  overlay: MutationOverlay,
  reel: number,
  position: number,
  clearance: number,
): MutationOverlay {
  if (overlay.kind !== 'fading') return overlay
  const anchor = overlay.anchors.get(reel)
  if (anchor === undefined || Math.abs(position - anchor) < clearance) return overlay
  return releaseMutationOverlayReel(overlay, reel)
}

/** 이 스트립 자리에 얹힌 심볼. 없으면 undefined이고 그리는 쪽이 스트립을 그대로 쓴다. */
export function mutationOverlaySymbolAt(
  overlay: MutationOverlay,
  reel: number,
  stripIndex: number,
): SymbolId | undefined {
  if (overlay.kind === 'none') return undefined
  return overlay.cells.get(reel)?.get(stripIndex)
}
