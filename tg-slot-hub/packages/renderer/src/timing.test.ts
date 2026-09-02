import { describe, expect, it } from 'vitest'
import {
  BASE_REVOLUTIONS,
  DEFAULT_SPIN_DURATION_MS,
  DEFAULT_STAGGER_MS,
  FAST_SPIN_FACTOR,
  LANDING_SETTLE_MS,
  PULL_UP_MS,
  REDUCED_TOTAL_CAP_MS,
} from './constants.js'
import { buildSpinPlan } from './timing.js'

describe('buildSpinPlan 기본값', () => {
  const plan = buildSpinPlan({ reels: 5 })

  it('릴 수만큼 계획을 만든다', () => {
    expect(plan.reels).toHaveLength(5)
    expect(plan.reduced).toBe(false)
  })

  it('왼쪽에서 오른쪽으로 정지 시각이 단조증가한다', () => {
    for (let i = 1; i < plan.reels.length; i += 1) {
      expect(plan.reels[i]?.endMs ?? 0).toBeGreaterThan(plan.reels[i - 1]?.endMs ?? 0)
    }
  })

  it('정지 간격이 stagger와 같다', () => {
    for (let i = 1; i < plan.reels.length; i += 1) {
      const gap = (plan.reels[i]?.endMs ?? 0) - (plan.reels[i - 1]?.endMs ?? 0)
      expect(gap).toBeCloseTo(DEFAULT_STAGGER_MS, 9)
    }
  })

  it('오른쪽 릴일수록 더 많이 돈다', () => {
    expect(plan.reels[0]?.revolutions).toBe(BASE_REVOLUTIONS)
    for (let i = 1; i < plan.reels.length; i += 1) {
      expect(plan.reels[i]?.revolutions ?? 0).toBeGreaterThan(plan.reels[i - 1]?.revolutions ?? 0)
    }
  })
})

describe('buildSpinPlan 시작 반동', () => {
  const plan = buildSpinPlan({ reels: 3 })

  it('스핀은 뒤로 당기는 구간으로 시작한다', () => {
    expect(plan.pullUpMs).toBe(PULL_UP_MS)
    expect(plan.pullUpMs).toBeGreaterThan(0)
  })

  it('모든 릴이 반동이 끝난 같은 시각에 출발한다', () => {
    for (const reel of plan.reels) {
      expect(reel.startMs).toBe(plan.pullUpMs)
    }
  })

  it('전체 길이는 반동 + 회전 + stagger 누적이다', () => {
    expect(plan.totalMs).toBeCloseTo(PULL_UP_MS + DEFAULT_SPIN_DURATION_MS + DEFAULT_STAGGER_MS * 2, 9)
  })

  it('반동이 회전 시간을 잡아먹지 않는다', () => {
    const first = plan.reels[0]
    if (first === undefined) throw new Error('릴 계획 없음')
    expect(first.endMs - first.startMs).toBeCloseTo(DEFAULT_SPIN_DURATION_MS, 9)
  })
})

describe('buildSpinPlan 착지 마무리', () => {
  const plan = buildSpinPlan({ reels: 3 })

  it('마무리는 짧게만 붙는다', () => {
    for (const reel of plan.reels) {
      expect(reel.settleMs).toBe(LANDING_SETTLE_MS)
    }
  })

  it('회전 + 마무리 = 출발부터 정지까지다', () => {
    for (const reel of plan.reels) {
      expect(reel.spinMs + reel.settleMs).toBeCloseTo(reel.endMs - reel.startMs, 9)
    }
  })

  it('마무리가 회전보다 훨씬 짧다', () => {
    const first = plan.reels[0]
    if (first === undefined) throw new Error('릴 계획 없음')
    expect(first.settleMs).toBeLessThan(first.spinMs * 0.2)
  })

  it('아주 짧은 스핀에서는 마무리를 비율로 묶는다', () => {
    const quick = buildSpinPlan({ reels: 1, durationMs: 100 })
    const first = quick.reels[0]
    if (first === undefined) throw new Error('릴 계획 없음')
    expect(first.settleMs).toBeLessThan(LANDING_SETTLE_MS)
    expect(first.spinMs).toBeGreaterThan(0)
  })
})

describe('buildSpinPlan 사용자 지정', () => {
  it('durationMs와 stagger를 그대로 쓴다', () => {
    const plan = buildSpinPlan({ reels: 3, durationMs: 500, stagger: 100 })
    expect(plan.reels[0]?.endMs).toBe(PULL_UP_MS + 500)
    expect(plan.totalMs).toBe(PULL_UP_MS + 700)
  })

  it('stagger 0이면 모든 릴이 동시에 멈춘다', () => {
    const plan = buildSpinPlan({ reels: 4, stagger: 0 })
    expect(new Set(plan.reels.map((reel) => reel.endMs)).size).toBe(1)
  })

  it('릴 수는 최소 1이다', () => {
    expect(buildSpinPlan({ reels: 0 }).reels).toHaveLength(1)
  })
})

describe('buildSpinPlan 모션 축소', () => {
  it('반동과 마무리를 모두 없앤다', () => {
    const plan = buildSpinPlan({ reels: 3, reducedMotion: true })
    expect(plan.pullUpMs).toBe(0)
    for (const reel of plan.reels) {
      expect(reel.startMs).toBe(0)
      expect(reel.settleMs).toBe(0)
      expect(reel.spinMs).toBe(reel.endMs)
    }
  })

  it('릴 수와 무관하게 전체 길이가 상한을 넘지 않는다', () => {
    for (const reels of [1, 3, 5, 8, 12]) {
      const plan = buildSpinPlan({ reels, reducedMotion: true })
      expect(plan.reduced).toBe(true)
      expect(plan.totalMs).toBeLessThanOrEqual(REDUCED_TOTAL_CAP_MS + 1e-9)
      expect(plan.totalMs).toBeGreaterThan(0)
    }
  })

  it('긴 durationMs를 넣어도 잘라낸다', () => {
    const plan = buildSpinPlan({ reels: 5, durationMs: 5000, stagger: 800, reducedMotion: true })
    expect(plan.totalMs).toBeLessThanOrEqual(REDUCED_TOTAL_CAP_MS + 1e-9)
  })

  it('축소 상태에서도 정지 순서는 왼쪽에서 오른쪽이다', () => {
    const plan = buildSpinPlan({ reels: 5, reducedMotion: true })
    for (let i = 1; i < plan.reels.length; i += 1) {
      expect(plan.reels[i]?.endMs ?? 0).toBeGreaterThanOrEqual(plan.reels[i - 1]?.endMs ?? 0)
    }
  })
})

describe('buildSpinPlan 빠른 스핀', () => {
  it('프리스핀에서는 회전이 짧아진다', () => {
    const normal = buildSpinPlan({ reels: 5 })
    const fast = buildSpinPlan({ reels: 5, fast: true })
    expect(fast.totalMs).toBeLessThan(normal.totalMs)
  })

  it('회전 시간이 정확히 0.8배다', () => {
    const fast = buildSpinPlan({ reels: 3, durationMs: 1000, stagger: 0, fast: true })
    const first = fast.reels[0]
    if (first === undefined) throw new Error('릴 계획 없음')
    expect(first.endMs - first.startMs).toBeCloseTo(1000 * FAST_SPIN_FACTOR, 9)
  })

  it('반동 시간은 그대로다', () => {
    expect(buildSpinPlan({ reels: 3, fast: true }).pullUpMs).toBe(PULL_UP_MS)
  })

  it('정지 순서는 여전히 왼쪽에서 오른쪽이다', () => {
    const plan = buildSpinPlan({ reels: 5, fast: true })
    for (let i = 1; i < plan.reels.length; i += 1) {
      expect(plan.reels[i]?.endMs ?? 0).toBeGreaterThan(plan.reels[i - 1]?.endMs ?? 0)
    }
  })

  it('모션 축소와 함께 써도 상한을 지킨다', () => {
    const plan = buildSpinPlan({ reels: 5, fast: true, reducedMotion: true })
    expect(plan.totalMs).toBeLessThanOrEqual(REDUCED_TOTAL_CAP_MS + 1e-9)
  })
})
