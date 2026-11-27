import { spinSpeedProfile, buildSpinPlan, type ReelSpinPlan, type SpinPlan, type SpinPlanInput } from './timing.js'
import { heightOf, type ShapeInput } from './shapeLayout.js'

/**
 * 릴 정지 순서(가운데부터). 순수 함수만 둔다.
 *
 * `from: 'center'` 판은 가운데 릴이 먼저 서고 안쪽 둘, 바깥 둘 순으로 선다.
 * 가운데가 먼저 서면 «맞을 수 있는 그림 후보»가 바로 보이고 기대가 두 번 생긴다.
 * 정지 순서는 연출만 바꾼다 — 결과·착지 위치는 그대로다.
 */

/** 가운데 릴부터 양옆으로 한 쌍씩. 5릴이면 `[[2],[1,3],[0,4]]`. 릴 수가 짝수면 가운데 둘이 먼저다. */
export function centerStopOrder(reels: number): number[][] {
  if (reels < 1) return []
  const order: number[][] = []
  if (reels % 2 === 1) {
    const mid = (reels - 1) / 2
    order.push([mid])
    for (let d = 1; d <= mid; d += 1) order.push([mid - d, mid + d])
  } else {
    const right = reels / 2
    order.push([right - 1, right])
    for (let d = 1; d < right; d += 1) order.push([right - 1 - d, right + d])
  }
  return order
}

/** 모든 릴이 정확히 한 번씩 나오는 순서인가. */
export function isValidStopOrder(order: readonly (readonly number[])[], reels: number): boolean {
  const seen = new Set<number>()
  for (const group of order) {
    if (group.length === 0) return false
    for (const reel of group) {
      if (!Number.isInteger(reel) || reel < 0 || reel >= reels || seen.has(reel)) return false
      seen.add(reel)
    }
  }
  return seen.size === reels
}

/** 한 묶음이 서는 간격을 기존 릴 간격의 몇 배로 할지. 꽝 판 총 길이가 기존 5릴(4간격) 이하가 되게 정한다. */
export const CENTER_GROUP_GAP_SCALE = 1.3

/**
 * 가운데부터 서는 판의 기대감 시간 배율. 먼저 서는 가운데·안쪽 릴(13칸)에 구슬 2개가 드는 일이 유료 판의 약 1/4이라
 * 기본 길이(+800ms)로 매번 끌면 기대감이 닳는다(검수). 짧게 한 번 숨을 고르는 정도로 줄인다.
 */
export const CENTER_ANTICIPATION_SCALE = 0.5

/** 릴별 스캐터 개수. 릴 높이(`h`)까지만 센다. 판 밖 칸은 보이지 않으므로 세지 않는다. */
export function shapeScatterCounts(
  math: ShapeInput & { strips: readonly (readonly string[])[] },
  stops: readonly number[],
  scatter: string,
): number[] {
  const counts: number[] = []
  for (let reel = 0; reel < math.reels; reel += 1) {
    const strip = math.strips[reel]
    const stop = stops[reel]
    let count = 0
    if (strip !== undefined && strip.length > 0 && stop !== undefined) {
      for (let row = 0; row < heightOf(math, reel); row += 1) {
        if (strip[(stop + row) % strip.length] === scatter) count += 1
      }
    }
    counts.push(count)
  }
  return counts
}

/**
 * 기대감을 걸 묶음 번호. 먼저 선 묶음들에 스캐터가 `trigger − 1`개 이상 떨어졌고 아직 `trigger`개엔 못 미쳤으며,
 * 그 묶음의 릴 스트립에 스캐터가 있을 때만이다(가짜 기대감 금지). 결과가 아니라 연출 시간만 정한다.
 */
export function anticipatedGroups(
  order: readonly (readonly number[])[],
  counts: readonly number[],
  trigger: number | undefined,
  canHold: (reel: number) => boolean,
): number[] {
  if (trigger === undefined) return []
  const result: number[] = []
  let landed = 0
  order.forEach((group, index) => {
    if (index > 0 && landed > 0 && landed >= trigger - 1 && landed < trigger && group.some(canHold)) result.push(index)
    for (const reel of group) landed += counts[reel] ?? 0
  })
  return result
}

export interface OrderedSpinInput extends Omit<SpinPlanInput, 'reels' | 'anticipation'> {
  reels: number
  /** 기대감을 걸 묶음 번호(`anticipatedGroups`). */
  anticipationGroups?: readonly number[]
}

/**
 * 묶음 순서대로 서는 스핀 계획. 한 묶음 안의 릴은 같은 시각에 선다.
 * 터보·모션 축소는 간격 0 — 한 번에 선다.
 */
export function buildOrderedSpinPlan(order: readonly (readonly number[])[], input: OrderedSpinInput): SpinPlan {
  const groupCount = Math.max(1, order.length)
  const reduced = input.reducedMotion === true
  const profile = spinSpeedProfile(input.speed)
  const simultaneous = reduced || input.speed === 'turbo'
  const stagger = input.stagger ?? (simultaneous ? 0 : Math.round(profile.staggerMs * CENTER_GROUP_GAP_SCALE))
  const base = buildSpinPlan({
    ...input,
    reels: groupCount,
    stagger,
    anticipation: input.anticipationGroups ?? [],
    anticipationScale: CENTER_ANTICIPATION_SCALE,
  })
  const plans: ReelSpinPlan[] = []
  order.forEach((group, g) => {
    const groupPlan = base.reels[g]
    if (groupPlan === undefined) return
    for (const reel of group) plans.push({ ...groupPlan, reel })
  })
  plans.sort((a, b) => a.reel - b.reel)
  return { reels: plans, pullUpMs: base.pullUpMs, totalMs: base.totalMs, reduced: base.reduced }
}

/** 이 릴이 속한 묶음 번호. */
export function groupIndexOf(order: readonly (readonly number[])[], reel: number): number {
  return order.findIndex((group) => group.includes(reel))
}

/** 묶음의 릴이 전부 섰는가. */
export function groupDone(order: readonly (readonly number[])[], group: number, landed: ReadonlySet<number>): boolean {
  return (order[group] ?? []).every((reel) => landed.has(reel))
}

