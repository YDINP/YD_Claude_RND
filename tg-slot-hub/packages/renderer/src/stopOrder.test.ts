import { describe, expect, it } from 'vitest'
import { buildSpinPlan } from './timing.js'
import {
  anticipatedGroups,
  buildOrderedSpinPlan,
  centerStopOrder,
  groupDone,
  groupIndexOf,
  isValidStopOrder,
  shapeScatterCounts,
} from './stopOrder.js'

describe('stopOrder', () => {
  it('5릴은 가운데 → 안쪽 둘 → 바깥 둘', () => {
    expect(centerStopOrder(5)).toEqual([[2], [1, 3], [0, 4]])
    expect(centerStopOrder(3)).toEqual([[1], [0, 2]])
    expect(centerStopOrder(4)).toEqual([
      [1, 2],
      [0, 3],
    ])
    expect(centerStopOrder(0)).toEqual([])
  })

  it('모든 릴이 한 번씩이어야 유효하다', () => {
    expect(isValidStopOrder(centerStopOrder(5), 5)).toBe(true)
    expect(isValidStopOrder([[0], [0, 1]], 2)).toBe(false)
    expect(isValidStopOrder([[0]], 2)).toBe(false)
    expect(isValidStopOrder([[]], 0)).toBe(false)
    expect(isValidStopOrder([[5]], 5)).toBe(false)
  })

  it('묶음 안 릴은 같은 시각에 서고 바깥 릴이 가장 늦다', () => {
    const plan = buildOrderedSpinPlan(centerStopOrder(5), { reels: 5, speed: 'normal' })
    const end = plan.reels.map((r) => r.endMs)
    expect(end[1]).toBe(end[3])
    expect(end[0]).toBe(end[4])
    expect(end[2]).toBeLessThan(end[1] ?? 0)
    expect(end[1]).toBeLessThan(end[0] ?? 0)
    expect(plan.reels.map((r) => r.reel)).toEqual([0, 1, 2, 3, 4])
  })

  it('꽝 판 총 길이는 기존 5릴(4간격) 이하다', () => {
    for (const speed of ['normal', 'quick'] as const) {
      const ordered = buildOrderedSpinPlan(centerStopOrder(5), { reels: 5, speed })
      const legacy = buildSpinPlan({ reels: 5, speed })
      expect(ordered.totalMs).toBeLessThanOrEqual(legacy.totalMs)
    }
  })

  it('터보와 모션 축소는 한 번에 선다', () => {
    const turbo = buildOrderedSpinPlan(centerStopOrder(5), { reels: 5, speed: 'turbo' })
    expect(new Set(turbo.reels.map((r) => r.endMs)).size).toBe(1)
    const reduced = buildOrderedSpinPlan(centerStopOrder(5), { reels: 5, reducedMotion: true })
    expect(new Set(reduced.reels.map((r) => r.endMs)).size).toBe(1)
  })

  it('기대감은 앞 묶음에 구슬이 trigger-1개 있을 때만, 구슬이 들 수 있는 릴에만 건다', () => {
    const order = centerStopOrder(5)
    // 가운데 1 + 안쪽 1 = 2개 → 바깥(묶음 2)에 기대감
    expect(anticipatedGroups(order, [0, 1, 1, 0, 0], 3, () => true)).toEqual([2])
    // 가운데 1개뿐이면 안쪽(묶음 1)에는 걸리지 않는다(landed=1 < 2)
    expect(anticipatedGroups(order, [0, 0, 1, 0, 0], 3, () => true)).toEqual([])
    // 이미 3개면 없다
    expect(anticipatedGroups(order, [0, 1, 1, 1, 0], 3, () => true)).toEqual([])
    // 구슬이 못 드는 릴이면 가짜 기대감 금지
    expect(anticipatedGroups(order, [0, 1, 1, 0, 0], 3, () => false)).toEqual([])
    expect(anticipatedGroups(order, [0, 1, 1, 0, 0], undefined, () => true)).toEqual([])
    // 기대감 묶음은 정지가 늦어진다
    const plan = buildOrderedSpinPlan(order, { reels: 5, speed: 'normal', anticipationGroups: [2] })
    const base = buildOrderedSpinPlan(order, { reels: 5, speed: 'normal' })
    expect(plan.reels[0]?.endMs).toBeGreaterThan(base.reels[0]?.endMs ?? 0)
    expect(plan.reels[2]?.endMs).toBe(base.reels[2]?.endMs)
    expect(plan.reels[0]?.anticipationMs).toBeGreaterThan(0)
  })

  it('스캐터 세기는 릴 높이까지만 본다', () => {
    const strips = [
      ['s', 's', 's', 's', 's'],
      ['s', 's', 's', 's', 's'],
    ]
    expect(shapeScatterCounts({ reels: 2, rows: 5, reelHeights: [3, 5], strips }, [0, 0], 's')).toEqual([3, 5])
  })

  it('묶음 보조 함수', () => {
    const order = centerStopOrder(5)
    expect(groupIndexOf(order, 3)).toBe(1)
    expect(groupDone(order, 1, new Set([1]))).toBe(false)
    expect(groupDone(order, 1, new Set([1, 3]))).toBe(true)
  })
})
