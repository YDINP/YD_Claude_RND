import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSfxVolume, getSoundPreset, isAudioMuted, setAudioMuted, setSfxVolume, setSoundPreset } from './audio'

const PRESETS = ['bell', 'fruit', 'western', 'shrine', 'clockwork', 'candy', 'royal', 'deepsea', 'hanbok', 'idol', 'garden', 'forge', 'frost'] as const

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
const noop = (): void => undefined

function fakeParam(): Record<string, unknown> {
  const p: Record<string, unknown> = { value: 0 }
  // vi.fn()은 호출 기록을 테스트 파일 끝까지 쥐고 있어 노드가 수만 개면 힙이 4GB를 넘는다. 호출을 보지 않으므로 빈 함수를 쓴다.
  for (const fn of ['setValueAtTime', 'exponentialRampToValueAtTime', 'linearRampToValueAtTime', 'cancelScheduledValues']) {
    p[fn] = noop
  }
  p.setTargetAtTime = (v: number) => targets.push(v)
  return p
}

function fakeNode(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const node: Record<string, unknown> = {
    connect: (to: unknown) => to,
    start: noop,
    stop: noop,
    gain: fakeParam(),
    frequency: fakeParam(),
    Q: fakeParam(),
    detune: fakeParam(),
    playbackRate: fakeParam(),
    pan: fakeParam(),
    disconnect: noop,
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

    for (const preset of PRESETS) {
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
    // 프리셋이 9종으로 늘어 병렬 실행(pnpm -r test) 중에는 기본 5초를 넘길 때가 있다.
  }, 20_000)

  it('playWinBand: under·none·big은 소리 노드를 만들지 않고, small<good<great 순으로 소리가 늘어난다', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    const nodes = (): number => lastContext!.oscillators + lastContext!.sources
    for (const preset of PRESETS) {
      audio.setSoundPreset(preset)
      const silent = nodes()
      audio.playWinBand('under', 600)
      audio.playWinBand('none', 600)
      audio.playWinBand('big', 600)
      expect(nodes(), `${preset} 무음`).toBe(silent)

      const counts = (['small', 'good', 'great'] as const).map((band) => {
        const before = nodes()
        expect(() => audio.playWinBand(band, 900), `${preset} ${band}`).not.toThrow()
        return nodes() - before
      })
      expect(counts[0], `${preset} small`).toBeGreaterThan(0)
      expect(counts[1], `${preset} good > small`).toBeGreaterThan(counts[0]!)
      expect(counts[2], `${preset} great > good`).toBeGreaterThan(counts[1]!)
    }
    vi.unstubAllGlobals()
  }, 20_000)

  it('every preset plays the double-up cues, each mutation kind and the count-up, and each makes sound', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    const kinds = ['mystery', 'expandWild', 'upgrade', 'randomWild'] as const
    for (const preset of PRESETS) {
      audio.setSoundPreset(preset)
      const cues: [string, () => void][] = [
        ['gambleToss', () => audio.playGambleToss()],
        ['gambleWin', () => audio.playGambleWin()],
        ['gambleLose', () => audio.playGambleLose()],
        ['countUp', () => audio.playCountUp(2000, 'big')],
        ...kinds.map((kind): [string, () => void] => [`mutation:${kind}`, () => audio.playMutation(kind)]),
      ]
      for (const [name, play] of cues) {
        const before = lastContext!.oscillators + lastContext!.sources
        expect(play, `${preset} ${name}`).not.toThrow()
        expect(lastContext!.oscillators + lastContext!.sources, `${preset} ${name}`).toBeGreaterThan(before)
      }
      expect(() => audio.stopCountUp()).not.toThrow()
    }
    vi.unstubAllGlobals()
  })

  it('keeps the royal set as its own preset and still falls back to bell for unknown ones', () => {
    setSoundPreset('royal')
    expect(getSoundPreset()).toBe('royal')
    setSoundPreset('nope' as never)
    expect(getSoundPreset()).toBe('bell')
  })

  it('count-up lays its ticks ahead on the audio clock and is cut cleanly by stopCountUp or mute', async () => {
    const starts: number[] = []
    class RecordingContext extends FakeAudioContext {
      createOscillator = () => {
        this.oscillators += 1
        const node = fakeNode()
        node.start = vi.fn((t: number) => starts.push(t))
        return node
      }
    }
    vi.stubGlobal('AudioContext', RecordingContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.setSoundPreset('clockwork')
    audio.playCountUp(3000, 'big')
    expect(starts.length).toBeGreaterThan(20)
    expect(Math.min(...starts)).toBeCloseTo(0, 5)
    // 마감음까지 3초 안팎에 걸쳐 미리 깔린다
    expect(Math.max(...starts)).toBeGreaterThan(2.5)
    expect(Math.max(...starts)).toBeLessThan(3.5)
    // 일반 호출은 예약 오프셋을 물려받지 않는다
    starts.length = 0
    audio.playRollupTick(0.5)
    expect(starts.every((t) => t < 0.05)).toBe(true)
    audio.stopCountUp()
    audio.playCountUp(1000, 'none')
    audio.setAudioMuted(true)
    expect(() => audio.stopCountUp()).not.toThrow()
    vi.unstubAllGlobals()
  })

  it('clockwork tells an expanding wild from an upgrade, and each preset anticipates with its own sound', async () => {
    const seen: number[] = []
    class RecordingContext extends FakeAudioContext {
      createOscillator = () => {
        this.oscillators += 1
        const node = fakeNode()
        const freq = node.frequency as { setValueAtTime: (v: number) => void }
        freq.setValueAtTime = vi.fn((v: number) => seen.push(Math.round(v)))
        return node
      }
    }
    vi.stubGlobal('AudioContext', RecordingContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.setSoundPreset('clockwork')
    const record = (play: () => void): number[] => {
      seen.length = 0
      play()
      return [...seen]
    }
    const expand = record(() => audio.playMutation('expandWild'))
    const upgrade = record(() => audio.playMutation('upgrade'))
    const plain = record(() => audio.playMutation())
    expect(expand.length).toBeGreaterThan(0)
    expect(upgrade.length).toBeGreaterThan(0)
    expect(expand).not.toEqual(upgrade)
    expect(plain).not.toEqual(upgrade)
    // 확장은 아래에서 위로 쭉 올라가는 소리라 시작 음이 낮고, 승급은 높은 두 음이다
    expect(Math.min(...expand)).toBeLessThan(800)
    expect(Math.min(...upgrade)).toBeGreaterThan(500)

    // 기대감은 프리셋마다 다른 소리를 깐다
    const risers = new Set<string>()
    for (const preset of PRESETS) {
      audio.setSoundPreset(preset)
      const freqs = record(() => {
        audio.startAnticipation()
        audio.stopAnticipation()
      })
      expect(freqs.length, preset).toBeGreaterThan(0)
      risers.add(JSON.stringify(freqs))
    }
    expect(risers.size).toBe(PRESETS.length)
    vi.unstubAllGlobals()
  })

  it('loads the western gunshot recording lazily, plays it, and frees it when the preset changes', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    expect(audio.hasGunshotSample()).toBe(false)
    audio.setSoundPreset('western')
    await vi.waitFor(() => expect(audio.hasGunshotSample()).toBe(true))

    const before = lastContext!.sources
    audio.playWin('big', 2000)
    expect(lastContext!.sources).toBeGreaterThan(before)

    audio.setSoundPreset('bell')
    expect(audio.hasGunshotSample()).toBe(false)
    audio.setSoundPreset('western')
    await vi.waitFor(() => expect(audio.hasGunshotSample()).toBe(true))
    vi.unstubAllGlobals()
  })

  it('plays the synthesized gunshot when the recording has not loaded yet', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.setSoundPreset('western')
    expect(audio.hasGunshotSample()).toBe(false)
    const before = lastContext!.sources
    expect(() => audio.playFeature()).not.toThrow()
    expect(lastContext!.sources).toBeGreaterThan(before)
    vi.unstubAllGlobals()
  })

  it('candy cascade and order cues make sound, and the pop pitch rises with every step', async () => {
    const firstFreqs: number[] = []
    class RecordingContext extends FakeAudioContext {
      createOscillator = () => {
        this.oscillators += 1
        const node = fakeNode()
        const freq = node.frequency as { setValueAtTime: (v: number) => void }
        freq.setValueAtTime = vi.fn((v: number) => firstFreqs.push(v))
        return node
      }
    }
    vi.stubGlobal('AudioContext', RecordingContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.setSoundPreset('candy')

    const leadFreq = (step: number): number => {
      firstFreqs.length = 0
      audio.playCascadePop(step)
      return firstFreqs[0]!
    }
    const pops = Array.from({ length: 10 }, (_, step) => leadFreq(step))
    for (let i = 1; i < pops.length; i++) expect(pops[i]!, `step ${i}`).toBeGreaterThan(pops[i - 1]!)
    expect(leadFreq(30)).toBe(pops[9])

    for (const cue of ['playLadderUp', 'playCascadeDrop', 'playOrderTick', 'playOrderComplete', 'playOrderDeal'] as const) {
      const before = lastContext!.oscillators
      ;(audio[cue] as (n?: number) => void)(2)
      expect(lastContext!.oscillators, cue).toBeGreaterThan(before)
    }
    vi.unstubAllGlobals()
  })

  it('deepsea respin cues make sound, and the coin pin pitch climbs a semitone per step up to one octave', async () => {
    const firstFreqs: number[] = []
    class RecordingContext extends FakeAudioContext {
      createOscillator = () => {
        this.oscillators += 1
        const node = fakeNode()
        const freq = node.frequency as { setValueAtTime: (v: number) => void }
        freq.setValueAtTime = vi.fn((v: number) => firstFreqs.push(v))
        return node
      }
    }
    vi.stubGlobal('AudioContext', RecordingContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.setSoundPreset('deepsea')

    // 핀 하나는 몸통(110Hz 오실레이터)이 먼저, 금화 «칭»의 기음이 그다음에 기록된다 — 높이가 변하는 건 둘째다.
    const ringFreq = (step: number): number => {
      firstFreqs.length = 0
      audio.playCoinPin(step)
      return firstFreqs[1]!
    }
    const rings = Array.from({ length: 13 }, (_, step) => ringFreq(step))
    for (let i = 1; i < rings.length; i++) expect(rings[i]!, `step ${i}`).toBeGreaterThan(rings[i - 1]!)
    expect(rings[12]! / rings[0]!).toBeCloseTo(2, 5)
    expect(ringFreq(40)).toBe(rings[12])

    const landFreq = (index: number): number => {
      firstFreqs.length = 0
      audio.playCoinLand(index)
      return firstFreqs[0]!
    }
    const lands = Array.from({ length: 8 }, (_, index) => landFreq(index))
    for (let i = 1; i < lands.length; i++) expect(lands[i]!, `land ${i}`).toBeGreaterThan(lands[i - 1]!)
    expect(landFreq(30)).toBe(lands[7])

    const cues: [string, () => void][] = [
      ['sonar', () => audio.playRespinSonar()],
      ['reset', () => audio.playCounterReset()],
      ['last', () => audio.playLastRespin()],
      ['wrapStart', () => audio.playTentacleWrap('start')],
      ['wrapEnd', () => audio.playTentacleWrap('end')],
      ['small', () => audio.playTreasure('small')],
      ['medium', () => audio.playTreasure('medium')],
      ['large', () => audio.playTreasure('large')],
      ['settle', () => audio.playSettleTick(0.5)],
      ['top', () => audio.playTopTreasure()],
    ]
    for (const [name, play] of cues) {
      const before = lastContext!.oscillators
      expect(play, name).not.toThrow()
      expect(lastContext!.oscillators, name).toBeGreaterThan(before)
    }
    vi.unstubAllGlobals()
  })

  it('deepsea treasure chords stack two, three and four bell notes', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    const count = (size: 'small' | 'medium' | 'large'): number => {
      const before = lastContext!.oscillators
      audio.playTreasure(size)
      return lastContext!.oscillators - before
    }
    const small = count('small')
    const medium = count('medium')
    const large = count('large')
    expect(medium).toBeGreaterThan(small)
    expect(large).toBeGreaterThan(medium)
    vi.unstubAllGlobals()
  })

  it('idol roulette cues make sound for every landing, tick and light, and the light pitch rises', async () => {
    const firstFreqs: number[] = []
    class RecordingContext extends FakeAudioContext {
      createOscillator = () => {
        this.oscillators += 1
        const node = fakeNode()
        const freq = node.frequency as { setValueAtTime: (v: number) => void }
        freq.setValueAtTime = vi.fn((v: number) => firstFreqs.push(v))
        return node
      }
    }
    vi.stubGlobal('AudioContext', RecordingContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.setSoundPreset('idol')

    const lights = Array.from({ length: 6 }, (_, index) => {
      firstFreqs.length = 0
      audio.playRouletteLight(index)
      return firstFreqs[0]!
    })
    for (let i = 1; i < lights.length; i++) expect(lights[i]!, `light ${i}`).toBeGreaterThan(lights[i - 1]!)

    const made = (fn: () => void): number => {
      const before = lastContext!.oscillators + lastContext!.sources
      fn()
      return lastContext!.oscillators + lastContext!.sources - before
    }
    for (const kind of ['coin', 'stepUp', 'encore', 'grand'] as const) {
      expect(made(() => audio.playRouletteLand(kind, false)), kind).toBeGreaterThan(0)
      expect(made(() => audio.playRouletteLand(kind, true)), `${kind} lit`).toBeGreaterThan(0)
    }
    expect(made(() => audio.playRouletteTick(1))).toBeGreaterThan(0)
    expect(made(() => audio.playRouletteTick(0))).toBeGreaterThan(0)
    expect(made(() => audio.playRouletteZoom())).toBeGreaterThan(0)
    expect(made(() => audio.playRouletteSummary(true))).toBeGreaterThan(0)
    expect(made(() => audio.playRouletteSummary(false))).toBeGreaterThan(0)

    audio.setAudioMuted(true)
    expect(made(() => audio.playRouletteLand('grand', true))).toBe(0)
    expect(made(() => audio.playRouletteTick(0.5))).toBe(0)
    vi.unstubAllGlobals()
  })

  it('idol riser adds a clap roll that stops with the anticipation', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.resetModules()
    const audio = await import('./audio')
    audio.installAudioUnlock()
    window.dispatchEvent(new Event('pointerdown'))
    audio.setSoundPreset('idol')

    const sourcesNow = (): number => lastContext!.sources
    audio.startAnticipation()
    const start = sourcesNow()
    vi.advanceTimersByTime(700)
    expect(sourcesNow()).toBeGreaterThan(start)
    audio.stopAnticipation()
    const stopped = sourcesNow()
    vi.advanceTimersByTime(2000)
    expect(sourcesNow()).toBe(stopped)
    vi.useRealTimers()
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
