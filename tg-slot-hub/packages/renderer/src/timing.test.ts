import { describe, expect, it } from 'vitest'
import {
  BASE_REVOLUTIONS,
  DEFAULT_SPIN_DURATION_MS,
  DEFAULT_STAGGER_MS,
  FAST_SPIN_FACTOR,
  LANDING_SETTLE_MS,
  PULL_UP_MS,
  REDUCED_TOTAL_CAP_MS,
  SKIP_SETTLE_MS,
  SKIP_STAGGER_MS,
  SPIN_SPEED_PROFILES,
  WIN_START_DELAY_MS,
} from './constants.js'
import { buildSkipPlan, buildSpinPlan, spinSpeedProfile, winStartDelayMs } from './timing.js'

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

describe('스핀 속도 프로파일', () => {
  function totalOf(speed: 'normal' | 'quick' | 'turbo'): number {
    return buildSpinPlan({ reels: 5, speed }).totalMs
  }

  it('빠를수록 총 길이가 짧아진다', () => {
    expect(totalOf('quick')).toBeLessThan(totalOf('normal'))
    expect(totalOf('turbo')).toBeLessThan(totalOf('quick'))
  })

  it('문서가 약속한 길이 안에 든다', () => {
    // normal 약 1.65초 / quick 약 0.9초 / turbo 약 0.45초.
    expect(totalOf('normal')).toBeCloseTo(1650, -2)
    expect(totalOf('quick')).toBeCloseTo(900, -2)
    expect(totalOf('turbo')).toBeCloseTo(450, -2)
  })

  it('quick은 normal의 55% 언저리다', () => {
    expect(totalOf('quick') / totalOf('normal')).toBeGreaterThan(0.5)
    expect(totalOf('quick') / totalOf('normal')).toBeLessThan(0.6)
  })

  it('터보는 당김을 생략한다', () => {
    expect(buildSpinPlan({ reels: 5, speed: 'turbo' }).pullUpMs).toBe(0)
    expect(buildSpinPlan({ reels: 5, speed: 'normal' }).pullUpMs).toBeGreaterThan(0)
  })

  it('터보는 릴이 거의 동시에 선다', () => {
    const plan = buildSpinPlan({ reels: 5, speed: 'turbo' })
    const first = plan.reels[0]?.endMs ?? 0
    const last = plan.reels[plan.reels.length - 1]?.endMs ?? 0
    expect(last - first).toBeLessThan(100)
  })

  it('속도를 안 주면 normal이다', () => {
    expect(buildSpinPlan({ reels: 5 }).totalMs).toBe(totalOf('normal'))
    expect(spinSpeedProfile()).toEqual(SPIN_SPEED_PROFILES.normal)
  })

  it('직접 준 길이가 프로파일보다 우선한다', () => {
    const plan = buildSpinPlan({ reels: 3, speed: 'turbo', durationMs: 2000, stagger: 300 })
    expect(plan.reels[0]?.endMs).toBeCloseTo(2000, 9)
    expect((plan.reels[1]?.endMs ?? 0) - (plan.reels[0]?.endMs ?? 0)).toBeCloseTo(300, 9)
  })

  it('모션 축소가 어떤 프로파일보다도 우선한다', () => {
    const plan = buildSpinPlan({ reels: 5, speed: 'normal', reducedMotion: true })
    expect(plan.totalMs).toBeLessThanOrEqual(REDUCED_TOTAL_CAP_MS + 1e-9)
    expect(plan.pullUpMs).toBe(0)
  })

  it('프리스핀 가속은 프로파일 위에 겹쳐 적용된다', () => {
    const plain = buildSpinPlan({ reels: 5, speed: 'quick' }).totalMs
    const fast = buildSpinPlan({ reels: 5, speed: 'quick', fast: true }).totalMs
    expect(fast).toBeLessThan(plain)
  })
})

describe('buildSkipPlan', () => {
  const plan = buildSkipPlan(5)

  it('릴 수만큼 계획을 만든다', () => {
    expect(plan.reels).toHaveLength(5)
  })

  it('전체가 120ms 안에 끝난다', () => {
    expect(plan.totalMs).toBe(SKIP_SETTLE_MS)
    for (const reel of plan.reels) {
      expect(reel.durationMs).toBeLessThanOrEqual(SKIP_SETTLE_MS + 1e-9)
    }
  })

  it('왼쪽부터 차례로 멈춘다', () => {
    for (let i = 1; i < plan.reels.length; i += 1) {
      expect(plan.reels[i]?.durationMs ?? 0).toBeGreaterThan(plan.reels[i - 1]?.durationMs ?? 0)
    }
  })

  it('마지막 릴이 예산을 다 쓴다', () => {
    expect(plan.reels[plan.reels.length - 1]?.durationMs).toBeCloseTo(SKIP_SETTLE_MS, 9)
  })

  it('릴 사이 간격은 상한을 넘지 않고 0보다는 크다', () => {
    const three = buildSkipPlan(3)
    const gap = (three.reels[1]?.durationMs ?? 0) - (three.reels[0]?.durationMs ?? 0)
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThanOrEqual(SKIP_STAGGER_MS)
  })

  it('첫 릴도 착지에 시간을 쓴다', () => {
    // 0이면 첫 릴만 순간이동처럼 보인다. 스냅이어도 내려앉는 동작은 남겨야 한다.
    expect(plan.reels[0]?.durationMs ?? 0).toBeGreaterThan(0)
  })

  it('릴이 많으면 간격을 줄여 예산을 지킨다', () => {
    const many = buildSkipPlan(20)
    expect(many.totalMs).toBe(SKIP_SETTLE_MS)
    const gap = (many.reels[1]?.durationMs ?? 0) - (many.reels[0]?.durationMs ?? 0)
    expect(gap).toBeLessThan(SKIP_STAGGER_MS)
    expect(many.reels[0]?.durationMs ?? 0).toBeGreaterThan(0)
  })

  it('릴이 하나면 간격이 없다', () => {
    const one = buildSkipPlan(1)
    expect(one.reels).toHaveLength(1)
    expect(one.reels[0]?.durationMs).toBe(SKIP_SETTLE_MS)
  })

  it('스킵이 정상 스핀보다 훨씬 짧다', () => {
    expect(buildSkipPlan(5).totalMs).toBeLessThan(buildSpinPlan({ reels: 5 }).totalMs)
  })

  it('예산을 직접 줄 수 있다', () => {
    expect(buildSkipPlan(3, 500).totalMs).toBe(500)
  })
})

describe('winStartDelayMs — 릴 정지 후 연출 시작까지의 숨 고르기', () => {
  it('normal 속도는 기본 여백을 그대로 쓴다', () => {
    expect(winStartDelayMs('normal')).toBe(WIN_START_DELAY_MS)
    expect(winStartDelayMs()).toBe(WIN_START_DELAY_MS) // 속도를 안 주면 normal과 같다.
  })

  it('quick/turbo는 스핀 리듬이 짧은 만큼 여백도 비례해 줄어든다', () => {
    expect(winStartDelayMs('quick')).toBeLessThan(winStartDelayMs('normal'))
    expect(winStartDelayMs('turbo')).toBeLessThan(winStartDelayMs('quick'))
  })

  it('터보는 요구사항 그대로 ×0.45로 줄어든다', () => {
    expect(winStartDelayMs('turbo')).toBe(Math.round(WIN_START_DELAY_MS * 0.45))
  })

  it('모션 축소에서는 인위적인 대기를 더하지 않는다(속도와 무관하게 0)', () => {
    expect(winStartDelayMs('normal', true)).toBe(0)
    expect(winStartDelayMs('quick', true)).toBe(0)
    expect(winStartDelayMs('turbo', true)).toBe(0)
  })

  it('타임라인 계획과 비교하면, 연출은 마지막 릴이 정착을 끝낸 시각(spinPlan.totalMs)보다 항상 늦게 시작된다', () => {
    // showWins()는 "마지막 릴 정착 시각 + winStartDelayMs"가 지나야 연출을 시작한다
    // (pixiRenderer.ts) — 순수 데이터로 그 합이 정착 시각보다 항상 더 크다는 것만 확인한다.
    // 스킵 경로(buildSkipPlan)도 showWins()를 그대로 거치므로 같은 여백이 적용된다.
    for (const speed of ['normal', 'quick', 'turbo'] as const) {
      const spinPlan = buildSpinPlan({ reels: 5, speed })
      const skipPlan = buildSkipPlan(5)
      const delay = winStartDelayMs(speed)
      expect(delay).toBeGreaterThan(0)
      expect(spinPlan.totalMs + delay).toBeGreaterThan(spinPlan.totalMs)
      expect(skipPlan.totalMs + delay).toBeGreaterThan(skipPlan.totalMs)
    }
  })
})
