import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RendererEvent } from '@tgslot/renderer'

vi.mock('./audio', () => ({
  playCoinLand: vi.fn(),
  playCoinPin: vi.fn(),
  playCounterReset: vi.fn(),
  playFeature: vi.fn(),
  playLastRespin: vi.fn(),
  playReelStop: vi.fn(),
  playRespinSonar: vi.fn(),
  playSettleTick: vi.fn(),
  playTentacleWrap: vi.fn(),
  playTopTreasure: vi.fn(),
  playTreasure: vi.fn(),
  playWin: vi.fn(),
  playRollupTick: vi.fn(),
  playRollupEnd: vi.fn(),
}))

import * as audio from './audio'
import {
  RESPIN_PIN_STEPS,
  nextPinStep,
  playRespinCelebration,
  playRespinEventSound,
  resetRespinSfx,
  respinCelebrationSounded,
  stopRespinCelebration,
} from './respinSfx'

const coin = (kind: 'bet' | 'treasure', tier?: 'small' | 'medium' | 'large') => ({ pos: [0, 0] as [number, number], kind, value: 1, tier, amount: 10 })

function step(phase: 'start' | 'land' | 'pin' | 'end', extra: Partial<Extract<RendererEvent, { type: 'respinStep' }>> = {}): RendererEvent {
  return { type: 'respinStep', index: 0, total: 3, phase, last: false, left: 3, empty: 5, newCoins: [], coinTotal: 0, treasures: [], ...extra }
}

describe('respin event sounds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRespinSfx()
  })

  it('plays one sonar ping per respin, plus a heartbeat on the last one', () => {
    playRespinEventSound(step('start'))
    expect(audio.playRespinSonar).toHaveBeenCalledTimes(1)
    expect(audio.playLastRespin).not.toHaveBeenCalled()
    playRespinEventSound(step('start', { last: true }))
    expect(audio.playRespinSonar).toHaveBeenCalledTimes(2)
    expect(audio.playLastRespin).toHaveBeenCalledTimes(1)
  })

  it('climbs the pin pitch one step per locked coin and stops at the octave', () => {
    for (let i = 0; i < RESPIN_PIN_STEPS + 4; i += 1) playRespinEventSound(step('pin', { newCoins: [coin('bet')] }))
    const steps = vi.mocked(audio.playCoinPin).mock.calls.map((c) => c[0])
    expect(steps.slice(0, 4)).toEqual([0, 1, 2, 3])
    expect(Math.max(...steps)).toBe(RESPIN_PIN_STEPS)
    expect(steps.at(-1)).toBe(RESPIN_PIN_STEPS)
    resetRespinSfx()
    expect(nextPinStep()).toBe(0)
  })

  it('delays the second pin when two coins lock at once', () => {
    vi.useFakeTimers()
    playRespinEventSound(step('pin', { newCoins: [coin('bet'), coin('bet')] }))
    expect(audio.playCoinPin).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(200)
    expect(audio.playCoinPin).toHaveBeenCalledTimes(2)
    expect(vi.mocked(audio.playCoinPin).mock.calls.map((c) => c[0])).toEqual([0, 1])
    vi.useRealTimers()
  })

  it('plays the counter reset whenever a new coin locks, even if the count was already full', () => {
    playRespinEventSound({ type: 'respinStart', respins: 3, coinTotal: 0, empty: 5, treasures: [] })
    playRespinEventSound(step('end', { left: 2 }))
    playRespinEventSound(step('end', { left: 1 }))
    expect(audio.playCounterReset).not.toHaveBeenCalled()
    playRespinEventSound(step('end', { left: 3, newCoins: [coin('bet')] }))
    expect(audio.playCounterReset).toHaveBeenCalledTimes(1)
    playRespinEventSound(step('end', { left: 3, newCoins: [coin('bet')] }))
    expect(audio.playCounterReset).toHaveBeenCalledTimes(2)
    playRespinEventSound(step('end', { left: 2 }))
    expect(audio.playCounterReset).toHaveBeenCalledTimes(2)
  })

  it('adds the treasure chime when a treasure coin locks, and reset cancels pending sounds', () => {
    vi.useFakeTimers()
    playRespinEventSound(step('pin', { newCoins: [coin('treasure', 'medium')] }))
    expect(audio.playTreasure).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(audio.playTreasure).toHaveBeenCalledWith('medium')

    playRespinEventSound(step('pin', { newCoins: [coin('bet'), coin('treasure', 'large')] }))
    resetRespinSfx()
    vi.advanceTimersByTime(300)
    expect(audio.playCoinPin).toHaveBeenCalledTimes(2)
    expect(audio.playTreasure).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('plays a soft stop when a respin brings no new coin, and nothing else on land', () => {
    playRespinEventSound(step('land'))
    expect(audio.playReelStop).toHaveBeenCalledTimes(1)
    playRespinEventSound(step('land', { newCoins: [coin('bet')] }))
    expect(audio.playReelStop).toHaveBeenCalledTimes(1)
  })

  it('maps tentacle wraps, treasure tiers, settle ticks and the top treasure', () => {
    playRespinEventSound({ type: 'columnWrap', reel: 1, phase: 'start', entry: false, before: [], after: [] })
    playRespinEventSound({ type: 'columnWrap', reel: 1, phase: 'end', entry: false, before: [], after: [] })
    expect(vi.mocked(audio.playTentacleWrap).mock.calls.map((c) => c[0])).toEqual(['start', 'end'])

    playRespinEventSound({ type: 'respinCollect', index: 0, total: 3, cell: coin('treasure', 'large'), running: 10 })
    expect(audio.playTreasure).toHaveBeenCalledWith('large')
    playRespinEventSound({ type: 'respinCollect', index: 1, total: 3, cell: coin('bet'), running: 20 })
    expect(audio.playSettleTick).toHaveBeenCalledWith(0.5)
    playRespinEventSound({ type: 'respinCollect', index: 0, total: 1, cell: coin('bet'), running: 20 })
    expect(audio.playSettleTick).toHaveBeenLastCalledWith(1)

    playRespinEventSound({ type: 'respinTop', amount: 100, phase: 'end' })
    expect(audio.playTopTreasure).not.toHaveBeenCalled()
    playRespinEventSound({ type: 'respinTop', amount: 100, phase: 'start' })
    expect(audio.playTopTreasure).toHaveBeenCalledTimes(1)
  })

  it('ignores events that are not about the coin respin', () => {
    playRespinEventSound({ type: 'respinEnd', coinWin: 1, topWin: 0, full: false })
    for (const fn of Object.values(audio)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('respin big-win celebration sound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRespinSfx()
  })

  it('plays the big win, ticks through the rollup, then one closing sound', () => {
    vi.useFakeTimers()
    playRespinCelebration('rolling', 'storm', 2000)
    expect(audio.playWin).toHaveBeenCalledWith('epic', 2000)
    expect(respinCelebrationSounded()).toBe(true)
    vi.advanceTimersByTime(1000)
    const ticks = vi.mocked(audio.playRollupTick).mock.calls.length
    expect(ticks).toBeGreaterThan(5)
    vi.advanceTimersByTime(3000)
    // 롤업 시간이 지나면 틱은 저절로 멈춘다.
    expect(vi.mocked(audio.playRollupTick).mock.calls.length).toBeLessThanOrEqual(Math.ceil(2000 / 60))
    playRespinCelebration('settled', 'storm', 2000)
    playRespinCelebration('settled', 'storm', 2000)
    expect(audio.playRollupEnd).toHaveBeenCalledTimes(1)
    expect(audio.playRollupEnd).toHaveBeenCalledWith('epic')
    vi.useRealTimers()
  })

  it('a tap that skips the rollup stops the ticks and closes at once', () => {
    vi.useFakeTimers()
    playRespinCelebration('rolling', 'surge', 4000)
    expect(audio.playWin).toHaveBeenCalledWith('big', 4000)
    vi.advanceTimersByTime(300)
    playRespinCelebration('settled', 'surge', 4000)
    const ticks = vi.mocked(audio.playRollupTick).mock.calls.length
    vi.advanceTimersByTime(2000)
    expect(vi.mocked(audio.playRollupTick).mock.calls.length).toBe(ticks)
    expect(audio.playRollupEnd).toHaveBeenCalledWith('big')
    vi.useRealTimers()
  })

  it('leaving mid-roll stops the ticks without a closing sound, and a new round forgets it', () => {
    vi.useFakeTimers()
    playRespinCelebration('rolling', 'cataclysm', 3000)
    stopRespinCelebration()
    playRespinCelebration('settled', 'cataclysm', 3000)
    expect(audio.playRollupEnd).not.toHaveBeenCalled()
    expect(respinCelebrationSounded()).toBe(true)
    resetRespinSfx()
    expect(respinCelebrationSounded()).toBe(false)
    vi.useRealTimers()
  })
})
