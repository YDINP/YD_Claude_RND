import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSfxVolume, getSoundPreset, isAudioMuted, setAudioMuted, setSfxVolume, setSoundPreset } from './audio'

describe('audio mute flag', () => {
  it('defaults to unmuted and reflects setAudioMuted()', () => {
    setAudioMuted(false)
    expect(isAudioMuted()).toBe(false)

    setAudioMuted(true)
    expect(isAudioMuted()).toBe(true)

    setAudioMuted(false)
    expect(isAudioMuted()).toBe(false)
  })
})

describe('sfx volume', () => {
  it('clamps to 0..100 and keeps the value independent from mute', () => {
    setSfxVolume(40)
    expect(getSfxVolume()).toBe(40)
    setSfxVolume(400)
    expect(getSfxVolume()).toBe(100)
    setSfxVolume(-3)
    expect(getSfxVolume()).toBe(0)
    setAudioMuted(true)
    setSfxVolume(70)
    setAudioMuted(false)
    expect(getSfxVolume()).toBe(70)
    setSfxVolume(100)
  })
})

describe('sound preset', () => {
  it('defaults to bell and falls back to bell for unknown values', () => {
    setSoundPreset(undefined)
    expect(getSoundPreset()).toBe('bell')
    setSoundPreset('shrine')
    expect(getSoundPreset()).toBe('shrine')
    setSoundPreset('nope' as never)
    expect(getSoundPreset()).toBe('bell')
  })
})

/** 어느 노드든 호출을 삼키는 가짜 Web Audio. 레시피가 던지지 않는지만 본다. */
const targets: number[] = []

function fakeParam(): Record<string, unknown> {
  const p: Record<string, unknown> = { value: 0 }
  for (const fn of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime', 'cancelScheduledValues']) {
    p[fn] = vi.fn()
  }
  p.setTargetAtTime = vi.fn((v: number) => targets.push(v))
  return p
}

function fakeNode(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    connect: vi.fn((to: unknown) => to),
    start: vi.fn(),
    stop: vi.fn(),
    gain: fakeParam(),
    frequency: fakeParam(),
    Q: fakeParam(),
    detune: fakeParam(),
    playbackRate: fakeParam(),
    pan: fakeParam(),
    disconnect: vi.fn(),
    threshold: fakeParam(),
    ratio: fakeParam(),
    ...extra,
  }
  return node
}

class FakeAudioContext {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = fakeNode()
  static created = 0
  oscillators = 0
  constructor() {
    FakeAudioContext.created += 1
    lastContext = this
  }
  createGain = () => fakeNode()
  createOscillator = () => {
    this.oscillators += 1
    return fakeNode()
  }
  createBiquadFilter = () => fakeNode()
  createDynamicsCompressor = () => fakeNode()
  createBufferSource = () => {
    this.sources += 1
    return fakeNode()
  }
  createConvolver = () => fakeNode()
  createStereoPanner = () => fakeNode()
  sources = 0
  createBuffer = (_ch: number, len: number, rate: number) => ({ duration: len / rate, getChannelData: () => new Float32Array(len) })
  resume = vi.fn(() => Promise.resolve())
  suspend = vi.fn(() => Promise.resolve())
}
let lastContext: FakeAudioContext | null = null

describe('recipe table', () => {
  afterEach(() => {
    setSoundPreset(undefined)
  })

  it('every preset plays every cue without throwing and makes sound', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    expect(lastContext).not.toBeNull()

    for (const preset of ['bell', 'fruit', 'western', 'shrine', 'clockwork'] as const) {
      audio.setSoundPreset(preset)
      const before = lastContext!.oscillators
      expect(() => {
        audio.playSpinStart()
        audio.playReelStop(0)
        audio.playReelStop(4)
        audio.playWin('none', 800)
        audio.playWin('big', 2000)
        audio.playWin('max', 5000)
        audio.playFeature()
        audio.playMutation()
        audio.startAnticipation()
        audio.startAnticipation()
        audio.stopAnticipation()
        audio.playRollupTick(0.5)
        audio.playRollupEnd('none')
        audio.playRollupEnd('mega')
        audio.stopSpinLoop()
      }, preset).not.toThrow()
      expect(lastContext!.oscillators, preset).toBeGreaterThan(before)
    }
    vi.unstubAllGlobals()
  })

  it('ui sounds play for every kind and stay silent while muted', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    const kinds = ['tap', 'up', 'down', 'toggle', 'open', 'close'] as const
    for (const kind of kinds) {
      const before = lastContext!.oscillators
      audio.playUiSound(kind)
      expect(lastContext!.oscillators, kind).toBeGreaterThan(before)
    }
    audio.setAudioMuted(true)
    const before = lastContext!.oscillators
    audio.playUiSound('tap')
    audio.startAnticipation()
    expect(lastContext!.oscillators).toBe(before)
    vi.unstubAllGlobals()
  })
})


describe('background music', () => {
  async function freshAudio() {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    lastContext = null
    return import('./audio')
  }

  const madeSound = (): number => lastContext!.oscillators + lastContext!.sources

  it('waits for the unlock gesture, then follows enable, mute, preset and stop', async () => {
    const audio = await freshAudio()
    audio.installAudioUnlock()
    audio.startBgm()
    expect(audio.isBgmPlaying()).toBe(false)

    window.dispatchEvent(new Event('pointerdown'))
    expect(audio.isBgmPlaying()).toBe(true)
    expect(madeSound()).toBeGreaterThan(0)

    audio.setSoundPreset('western')
    expect(audio.isBgmPlaying()).toBe(true)

    audio.setBgmEnabled(false)
    expect(audio.isBgmPlaying()).toBe(false)
    audio.setBgmEnabled(true)
    expect(audio.isBgmPlaying()).toBe(true)

    audio.setAudioMuted(true)
    expect(audio.isBgmPlaying()).toBe(false)
    audio.setAudioMuted(false)
    expect(audio.isBgmPlaying()).toBe(true)

    audio.stopBgm()
    expect(audio.isBgmPlaying()).toBe(false)
    window.dispatchEvent(new Event('pointerdown'))
    expect(audio.isBgmPlaying()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('stops while the tab is hidden and comes back when it is visible again', async () => {
    const audio = await freshAudio()
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.startBgm()
    expect(audio.isBgmPlaying()).toBe(true)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(audio.isBgmPlaying()).toBe(false)

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    await Promise.resolve()
    expect(audio.isBgmPlaying()).toBe(true)
    audio.stopBgm()
    vi.unstubAllGlobals()
  })

  it('ducks about 6 dB for big wins and anticipation and dips deeper during the mode curtain', async () => {
    const audio = await freshAudio()
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.startBgm()

    targets.length = 0
    audio.playWin('big', 2000)
    expect(targets).toContain(0.5)

    targets.length = 0
    audio.startAnticipation()
    expect(targets).toContain(0.5)
    audio.stopAnticipation()

    targets.length = 0
    audio.bgmModeTransition('freeSpins', 'start')
    expect(targets).toContain(0.2)
    audio.bgmModeTransition('freeSpins', 'end')
    expect(audio.isBgmPlaying()).toBe(true)
    audio.stopBgm()
    vi.unstubAllGlobals()
  })

  it('clamps the music volume and keeps it apart from the SFX volume', async () => {
    const audio = await freshAudio()
    audio.setBgmVolume(140)
    expect(audio.getBgmVolume()).toBe(100)
    audio.setBgmVolume(-1)
    expect(audio.getBgmVolume()).toBe(0)
    audio.setBgmVolume(55)
    audio.setSfxVolume(10)
    expect(audio.getBgmVolume()).toBe(55)
    vi.unstubAllGlobals()
  })
})
