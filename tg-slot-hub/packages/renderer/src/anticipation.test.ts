import { describe, expect, it } from 'vitest'
import { anticipatedReels, scatterCountsByReel, type AnticipationMath } from './anticipation.js'
import { ANTICIPATION_EXTRA_MS, SPIN_SPEED_PROFILES } from './constants.js'
import { buildSpinPlan } from './timing.js'

const strip = ['a', 'b', 'S', 'c', 'd', 'e']
const math: AnticipationMath = {
  reels: 5,
  rows: 3,
  strips: [strip, strip, strip, strip, strip],
  scatter: { symbol: 'S', freeSpins: { trigger: 3, count: 10, multiplier: 1, retrigger: false } },
}

/** stop 0 -> 창은 a,b,S (스캐터 보임). stop 3 -> c,d,e (안 보임). */
const HIT = 0
const MISS = 3

describe('scatterCountsByReel', () => {
  it('릴마다 창에 보이는 스캐터를 센다', () => {
    expect(scatterCountsByReel(math, [HIT, MISS, HIT, MISS, MISS])).toEqual([1, 0, 1, 0, 0])
  })

  it('스캐터가 없는 게임은 null', () => {
    expect(scatterCountsByReel({ ...math, scatter: undefined }, [0, 0, 0, 0, 0])).toBeNull()
  })
})

describe('anticipatedReels', () => {
  it('앞 두 릴에 스캐터가 떨어지면 남은 세 릴이 대상이다', () => {
    expect(anticipatedReels(math, [HIT, HIT, MISS, MISS, MISS])).toEqual([2, 3, 4])
  })

  it('세 번째 릴에도 안 나오면 다음 릴이 계속 대상이다', () => {
    expect(anticipatedReels(math, [MISS, HIT, HIT, MISS, MISS])).toEqual([3, 4])
  })

  it('이미 트리거 개수에 닿았으면 더 걸지 않는다', () => {
    expect(anticipatedReels(math, [HIT, HIT, HIT, MISS, MISS])).toEqual([2])
  })

  it('스캐터가 하나뿐이면 대상이 없다', () => {
    expect(anticipatedReels(math, [HIT, MISS, MISS, MISS, MISS])).toEqual([])
  })

  it('프리스핀 트리거가 없으면 비어 있다', () => {
    const noFeature = { ...math, scatter: { symbol: 'S' } }
    expect(anticipatedReels(noFeature, [HIT, HIT, MISS, MISS, MISS])).toEqual([])
  })

  it('릴 뒤쪽에서 트리거에 닿으면 마지막 릴까지 이어진다', () => {
    expect(anticipatedReels(math, [MISS, MISS, HIT, HIT, MISS])).toEqual([4])
  })
})

describe('buildSpinPlan 기대감', () => {
  const base = buildSpinPlan({ reels: 5 })

  it('기대감이 없으면 계획이 그대로다', () => {
    const plan = buildSpinPlan({ reels: 5, anticipation: [] })
    expect(plan.reels.map((r) => r.endMs)).toEqual(base.reels.map((r) => r.endMs))
    expect(plan.reels.every((r) => r.anticipationMs === 0)).toBe(true)
  })

  it('대상 릴과 그 뒤 릴만 늦게 서고 앞 릴은 그대로다', () => {
    const plan = buildSpinPlan({ reels: 5, anticipation: [2] })
    for (const reel of [0, 1]) expect(plan.reels[reel]?.endMs).toBe(base.reels[reel]?.endMs)
    for (const reel of [2, 3, 4]) {
      expect(plan.reels[reel]?.endMs).toBe((base.reels[reel]?.endMs ?? 0) + ANTICIPATION_EXTRA_MS)
    }
    expect(plan.reels[2]?.anticipationMs).toBe(ANTICIPATION_EXTRA_MS)
    expect(plan.reels[3]?.anticipationMs).toBe(0)
  })

  it('릴이 연속으로 대상이면 지연이 누적된다', () => {
    const plan = buildSpinPlan({ reels: 5, anticipation: [3, 4] })
    expect(plan.reels[4]?.endMs).toBe((base.reels[4]?.endMs ?? 0) + ANTICIPATION_EXTRA_MS * 2)
    expect(plan.totalMs).toBe(plan.reels[4]?.endMs)
  })

  it('모션 축소와 터보에서는 무시한다', () => {
    const reduced = buildSpinPlan({ reels: 5, anticipation: [2], reducedMotion: true })
    expect(reduced.reels.every((r) => r.anticipationMs === 0)).toBe(true)
    const turbo = buildSpinPlan({ reels: 5, anticipation: [2], speed: 'turbo' })
    const turboBase = buildSpinPlan({ reels: 5, speed: 'turbo' })
    expect(turbo.totalMs).toBe(turboBase.totalMs)
    expect(SPIN_SPEED_PROFILES.turbo.durationMs).toBeGreaterThan(0)
  })

  it('정지 위치와 무관하다 - 결과는 계획에 들어 있지 않다', () => {
    const plan = buildSpinPlan({ reels: 5, anticipation: [2] })
    expect(Object.keys(plan.reels[2] ?? {})).not.toContain('stop')
  })
})
