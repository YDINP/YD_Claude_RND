import { describe, expect, it } from 'vitest'
import {
  MODE_FLASH_PORTION,
  MODE_TRANSITION_MS,
  MODE_WIPE_PORTION,
  REDUCED_MODE_TRANSITION_MS,
} from './constants.js'
import { buildModeTransition, isFreeSpinsActive, modeTransitionTarget } from './transition.js'

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

describe('buildModeTransition', () => {
  const plan = buildModeTransition('freeSpins', { hasFreeSpinsBackground: true })

  it('전체 길이가 700ms다', () => {
    expect(plan.totalMs).toBe(MODE_TRANSITION_MS)
  })

  it('구간 비율이 상수와 맞는다', () => {
    expect(plan.flashMs).toBeCloseTo(MODE_TRANSITION_MS * MODE_FLASH_PORTION, 9)
    expect(plan.wipeMs).toBeCloseTo(MODE_TRANSITION_MS * MODE_WIPE_PORTION, 9)
  })

  it('와이프는 섬광이 정점을 지난 뒤 시작한다', () => {
    expect(plan.wipeStartMs).toBeCloseTo(plan.flashMs / 2, 9)
    expect(plan.wipeStartMs).toBeGreaterThan(0)
    expect(plan.wipeStartMs).toBeLessThan(plan.flashMs)
  })

  it('광채는 와이프와 함께 끝난다', () => {
    expect(plan.glowMs).toBeCloseTo(plan.wipeStartMs + plan.wipeMs, 9)
  })

  it('모든 구간이 전체 길이 안에 들어온다', () => {
    expect(plan.wipeStartMs + plan.wipeMs).toBeLessThanOrEqual(plan.totalMs + 1e-9)
    expect(plan.flashMs).toBeLessThanOrEqual(plan.totalMs)
  })

  it('전용 배경이 있으면 틴트를 쓰지 않는다', () => {
    expect(plan.useTint).toBe(false)
  })

  it('전용 배경이 없으면 금빛 틴트로 대신한다', () => {
    expect(buildModeTransition('freeSpins', { hasFreeSpinsBackground: false }).useTint).toBe(true)
  })

  it('되돌아가는 전환도 같은 길이다', () => {
    const back = buildModeTransition('base', { hasFreeSpinsBackground: true })
    expect(back.to).toBe('base')
    expect(back.totalMs).toBe(plan.totalMs)
    expect(back.wipeMs).toBeCloseTo(plan.wipeMs, 9)
  })

  it('모션 축소에서는 짧아지되 구간 비율은 유지한다', () => {
    const reduced = buildModeTransition('freeSpins', {
      hasFreeSpinsBackground: true,
      reducedMotion: true,
    })
    expect(reduced.totalMs).toBe(REDUCED_MODE_TRANSITION_MS)
    expect(reduced.totalMs).toBeLessThan(MODE_TRANSITION_MS)
    expect(reduced.flashMs / reduced.totalMs).toBeCloseTo(MODE_FLASH_PORTION, 9)
  })

  it('목표를 그대로 실어 나른다', () => {
    expect(plan.to).toBe('freeSpins')
  })
})
