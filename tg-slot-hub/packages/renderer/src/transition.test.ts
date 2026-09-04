import { describe, expect, it } from 'vitest'
import {
  MODE_BANNER_MS,
  MODE_COVER_IN_MS,
  MODE_COVER_OUT_MS,
  MODE_TRANSITION_SPEED_SCALE,
  REDUCED_MODE_BANNER_MS,
  REDUCED_MODE_COVER_IN_MS,
  REDUCED_MODE_COVER_OUT_MS,
} from './constants.js'
import { buildModeTransition, coverAlphaAt, isFreeSpinsActive, modeTransitionTarget } from './transition.js'

const active = { freeSpins: { left: 7, total: 10, multiplier: 2 } }
const base = { freeSpins: null }

describe('isFreeSpinsActive', () => {
  it('상태가 있으면 켜진 것이다', () => {
    expect(isFreeSpinsActive(active)).toBe(true)
  })

  it('null이나 미지정이면 꺼진 것이다', () => {
    expect(isFreeSpinsActive(base)).toBe(false)
    expect(isFreeSpinsActive({})).toBe(false)
  })

  it('남은 횟수가 0이어도 켜져 있는 것으로 본다', () => {
    // 마지막 스핀을 아직 보여주는 중일 수 있다. 끄는 것은 허브가 null로 알린다.
    expect(isFreeSpinsActive({ freeSpins: { left: 0, total: 10, multiplier: 2 } })).toBe(true)
  })
})

describe('modeTransitionTarget', () => {
  it('꺼짐에서 켜짐으로 가면 프리스핀으로 전환한다', () => {
    expect(modeTransitionTarget(base, active)).toBe('freeSpins')
  })

  it('켜짐에서 꺼짐으로 가면 되돌아온다', () => {
    expect(modeTransitionTarget(active, base)).toBe('base')
  })

  it('남은 횟수만 바뀌면 전환하지 않는다', () => {
    // 매 스핀 화면이 번쩍이면 안 된다. 이것이 이 함수의 존재 이유다.
    const next = { freeSpins: { left: 6, total: 10, multiplier: 2 } }
    expect(modeTransitionTarget(active, next)).toBeNull()
  })

  it('배수가 바뀌어도 전환하지 않는다', () => {
    const next = { freeSpins: { left: 7, total: 10, multiplier: 3 } }
    expect(modeTransitionTarget(active, next)).toBeNull()
  })

  it('꺼진 상태끼리는 전환하지 않는다', () => {
    expect(modeTransitionTarget(base, base)).toBeNull()
    expect(modeTransitionTarget({}, base)).toBeNull()
  })

  it('같은 값을 다시 넣어도 전환하지 않는다', () => {
    expect(modeTransitionTarget(active, { ...active })).toBeNull()
  })
})

describe('buildModeTransition — 3단계(덮기/배너/걷기)', () => {
  const plan = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true })

  it('normal 속도 기준 각 구간이 상수와 맞는다', () => {
    expect(plan.coverInMs).toBe(MODE_COVER_IN_MS)
    expect(plan.bannerMs).toBe(MODE_BANNER_MS)
    expect(plan.coverOutMs).toBe(MODE_COVER_OUT_MS)
  })

  it('전체 길이는 세 구간의 합이다(약 1.5초)', () => {
    expect(plan.totalMs).toBe(plan.coverInMs + plan.bannerMs + plan.coverOutMs)
    expect(plan.totalMs).toBe(1500)
  })

  it('배경 교체 시각은 덮기가 끝나는 시각이다', () => {
    expect(plan.swapAtMs).toBe(plan.coverInMs)
  })

  it('걷기 시작 시각은 덮기+배너가 끝난 뒤다', () => {
    expect(plan.coverOutStartMs).toBe(plan.coverInMs + plan.bannerMs)
    expect(plan.coverOutStartMs).toBeLessThan(plan.totalMs)
  })

  it('전용 배경이 있으면 틴트를 쓰지 않는다', () => {
    expect(plan.useTint).toBe(false)
  })

  it('전용 배경이 없으면 금빛 틴트로 대신한다', () => {
    expect(buildModeTransition('freeSpins', { hasFreeSpinsBackground: false }).useTint).toBe(true)
  })

  it('되돌아가는 전환도 같은 길이·같은 구간이다(양방향 동일)', () => {
    const back = buildModeTransition('base', { hasFreeSpinsBackground: true })
    expect(back.to).toBe('base')
    expect(back.totalMs).toBe(plan.totalMs)
    expect(back.coverInMs).toBe(plan.coverInMs)
    expect(back.bannerMs).toBe(plan.bannerMs)
    expect(back.coverOutMs).toBe(plan.coverOutMs)
  })

  it('목표를 그대로 실어 나른다', () => {
    expect(plan.to).toBe('freeSpins')
  })
})

describe('buildModeTransition — 스핀 속도별 배율', () => {
  it('quick은 0.7배로 줄어들되 구간 비율은 유지한다', () => {
    const plan = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true, speed: 'quick' })
    expect(plan.coverInMs).toBeCloseTo(MODE_COVER_IN_MS * MODE_TRANSITION_SPEED_SCALE.quick, 9)
    expect(plan.bannerMs).toBeCloseTo(MODE_BANNER_MS * MODE_TRANSITION_SPEED_SCALE.quick, 9)
    expect(plan.coverOutMs).toBeCloseTo(MODE_COVER_OUT_MS * MODE_TRANSITION_SPEED_SCALE.quick, 9)
    expect(plan.totalMs).toBeLessThan(1500)
  })

  it('turbo는 0.45배로 더 줄어든다', () => {
    const plan = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true, speed: 'turbo' })
    expect(plan.coverInMs).toBeCloseTo(MODE_COVER_IN_MS * MODE_TRANSITION_SPEED_SCALE.turbo, 9)
    expect(plan.totalMs).toBeCloseTo(1500 * MODE_TRANSITION_SPEED_SCALE.turbo, 9)
  })

  it('normal은 배율 1배 — speed를 안 주면 normal과 같다', () => {
    const withoutSpeed = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true })
    const withNormal = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true, speed: 'normal' })
    expect(withoutSpeed).toEqual(withNormal)
  })

  it('quick보다 turbo가 항상 더 짧다', () => {
    const quick = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true, speed: 'quick' })
    const turbo = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true, speed: 'turbo' })
    expect(turbo.totalMs).toBeLessThan(quick.totalMs)
  })
})

describe('buildModeTransition — 모션 축소', () => {
  it('스핀 속도와 무관하게 고정된 짧은 길이를 쓴다', () => {
    const quick = buildModeTransition('freeSpins', {
      hasFreeSpinsBackground: true,
      reducedMotion: true,
      speed: 'quick',
    })
    const turbo = buildModeTransition('freeSpins', {
      hasFreeSpinsBackground: true,
      reducedMotion: true,
      speed: 'turbo',
    })
    expect(quick).toEqual(turbo)
    expect(quick.coverInMs).toBe(REDUCED_MODE_COVER_IN_MS)
    expect(quick.bannerMs).toBe(REDUCED_MODE_BANNER_MS)
    expect(quick.coverOutMs).toBe(REDUCED_MODE_COVER_OUT_MS)
  })

  it('총 길이가 400ms를 넘지 않는다', () => {
    const plan = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true, reducedMotion: true })
    expect(plan.totalMs).toBeLessThanOrEqual(400)
  })

  it('일반 전환보다 훨씬 짧다', () => {
    const normal = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true })
    const reduced = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true, reducedMotion: true })
    expect(reduced.totalMs).toBeLessThan(normal.totalMs)
  })
})

describe('coverAlphaAt — 완전 차폐 구간 검증', () => {
  const plan = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true })

  it('시작 전(0ms 이하)에는 완전히 투명하다', () => {
    expect(coverAlphaAt(plan, 0)).toBe(0)
    expect(coverAlphaAt(plan, -10)).toBe(0)
  })

  it('덮기 도중에는 0과 1 사이다', () => {
    const mid = coverAlphaAt(plan, plan.coverInMs / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('덮기가 끝나는 순간(swapAtMs) 알파가 1.0에 닿는다 — 완전히 가려진다', () => {
    expect(coverAlphaAt(plan, plan.swapAtMs)).toBe(1)
  })

  it('배너 구간 내내(중간 프레임에서도) 알파 1.0을 유지한다', () => {
    expect(coverAlphaAt(plan, plan.swapAtMs)).toBe(1)
    expect(coverAlphaAt(plan, (plan.swapAtMs + plan.coverOutStartMs) / 2)).toBe(1)
    expect(coverAlphaAt(plan, plan.coverOutStartMs - 1)).toBe(1)
  })

  it('걷기 도중에는 다시 0과 1 사이로 줄어든다', () => {
    const mid = coverAlphaAt(plan, plan.coverOutStartMs + plan.coverOutMs / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('걷기가 끝나면(totalMs) 다시 완전히 투명하다', () => {
    expect(coverAlphaAt(plan, plan.totalMs)).toBe(0)
  })

  it('되돌아가는 전환도 똑같이 완전히 가려지는 구간을 가진다(양방향 동일)', () => {
    const back = buildModeTransition('base', { hasFreeSpinsBackground: true })
    expect(coverAlphaAt(back, back.swapAtMs)).toBe(1)
  })
})
