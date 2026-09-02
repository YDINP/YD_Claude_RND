import { describe, expect, it } from 'vitest'
import {
  BASE_REVOLUTIONS,
  DEFAULT_SPIN_DURATION_MS,
  DEFAULT_STAGGER_MS,
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

  it('회전 + 바운스 = 전체 시간이다', () => {
    for (const reel of plan.reels) {
      expect(reel.spinMs + reel.bounceMs).toBeCloseTo(reel.endMs, 9)
      expect(reel.bounceMs).toBeGreaterThan(0)
      expect(reel.startMs).toBe(0)
    }
  })

  it('오른쪽 릴일수록 더 많이 돈다', () => {
    expect(plan.reels[0]?.revolutions).toBe(BASE_REVOLUTIONS)
    for (let i = 1; i < plan.reels.length; i += 1) {
      expect(plan.reels[i]?.revolutions ?? 0).toBeGreaterThan(plan.reels[i - 1]?.revolutions ?? 0)
    }
  })

  it('전체 길이는 기본 스핀 + stagger 누적이다', () => {
    expect(plan.totalMs).toBeCloseTo(DEFAULT_SPIN_DURATION_MS + DEFAULT_STAGGER_MS * 4, 9)
  })
})

describe('buildSpinPlan 사용자 지정', () => {
  it('durationMs와 stagger를 그대로 쓴다', () => {
    const plan = buildSpinPlan({ reels: 3, durationMs: 500, stagger: 100 })
    expect(plan.reels[0]?.endMs).toBe(500)
    expect(plan.totalMs).toBe(700)
  })

  it('stagger 0이면 모든 릴이 동시에 멈춘다', () => {
    const plan = buildSpinPlan({ reels: 4, stagger: 0 })
    const ends = plan.reels.map((reel) => reel.endMs)
    expect(new Set(ends).size).toBe(1)
  })

  it('릴 수는 최소 1이다', () => {
    expect(buildSpinPlan({ reels: 0 }).reels).toHaveLength(1)
  })
})

describe('buildSpinPlan 모션 축소', () => {
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
