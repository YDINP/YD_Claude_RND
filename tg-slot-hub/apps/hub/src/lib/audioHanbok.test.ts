import { describe, expect, it, vi } from 'vitest'

/** 어느 노드든 호출을 삼키는 가짜 Web Audio. 어떤 주파수로 울렸는지만 모은다. */
const freqs: number[] = []

function fakeParam(record = false): Record<string, unknown> {
  const p: Record<string, unknown> = { value: 0 }
  for (const fn of ['exponentialRampToValueAtTime', 'linearRampToValueAtTime', 'cancelScheduledValues', 'setTargetAtTime']) p[fn] = vi.fn()
  p.setValueAtTime = vi.fn((v: number) => {
    if (record) freqs.push(v)
  })
  return p
}

function fakeNode(record = false): Record<string, unknown> {
  return {
    connect: vi.fn((to: unknown) => to),
    start: vi.fn(),
    stop: vi.fn(),
    gain: fakeParam(),
    frequency: fakeParam(record),
    Q: fakeParam(),
    detune: fakeParam(),
    playbackRate: fakeParam(),
    pan: fakeParam(),
    disconnect: vi.fn(),
    threshold: fakeParam(),
    ratio: fakeParam(),
  }
}

class FakeAudioContext {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = fakeNode()
  oscillators = 0
  sources = 0
  createGain = () => fakeNode()
  createOscillator = () => {
    this.oscillators += 1
    return fakeNode(true)
  }
  createBiquadFilter = () => fakeNode()
  createDynamicsCompressor = () => fakeNode()
  createBufferSource = () => {
    this.sources += 1
    return fakeNode()
  }
  createConvolver = () => fakeNode()
  createStereoPanner = () => fakeNode()
  createBuffer = (_ch: number, len: number, rate: number) => ({ duration: len / rate, getChannelData: () => new Float32Array(len) })
  resume = vi.fn(() => Promise.resolve())
  suspend = vi.fn(() => Promise.resolve())
}

let lastContext: FakeAudioContext | null = null
class Recording extends FakeAudioContext {
  constructor() {
    super()
    lastContext = this
  }
}

async function freshAudio() {
  // 릴 정지·롤업 틱은 30·60ms 안에 거듭 부르면 버린다 — 호출마다 시계를 100ms 앞으로 보낸다.
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 100))
  vi.stubGlobal('AudioContext', Recording)
  vi.resetModules()
  const audio = await import('./audio')
  audio.installAudioUnlock()
  window.dispatchEvent(new Event('pointerdown'))
  audio.setSoundPreset('hanbok')
  return audio
}

/** 소리를 한 번 내고, 처음 만든 오실레이터의 주파수를 돌려준다. */
function firstFreq(play: () => void): number {
  freqs.length = 0
  play()
  return freqs[0]!
}

describe('hanbok sound preset', () => {
  it('is a known preset and plays every recipe cue', async () => {
    const audio = await freshAudio()
    expect(audio.getSoundPreset()).toBe('hanbok')
    const before = lastContext!.oscillators
    expect(() => {
      audio.playSpinStart()
      for (let reel = 0; reel < 5; reel++) audio.playReelStop(reel)
      audio.playWin('none', 800)
      for (const tier of ['big', 'mega', 'epic', 'max'] as const) audio.playWin(tier, 4000)
      audio.playFeature()
      audio.playMutation()
      audio.startAnticipation()
      audio.startAnticipation()
      audio.stopAnticipation()
      audio.playRollupTick(0)
      audio.playRollupTick(1)
      audio.playRollupEnd('none')
      audio.playRollupEnd('mega')
      audio.stopSpinLoop()
    }).not.toThrow()
    expect(lastContext!.oscillators).toBeGreaterThan(before)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('the last reel adds the low drum thump and earlier reels do not', async () => {
    const audio = await freshAudio()
    const count = (reel: number): number => {
      const before = lastContext!.oscillators
      audio.playReelStop(reel)
      return lastContext!.oscillators - before
    }
    // 채편 몸통 하나 vs 채편 + 궁편 두 겹
    const early = count(0)
    const last = count(4)
    expect(last).toBeGreaterThan(early)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('anticipation adds the gong drone layer and stops with the rest', async () => {
    const audio = await freshAudio()
    const before = lastContext!.oscillators
    audio.startAnticipation()
    // 기본 상승음은 오실레이터 3개(주음·5도·떨림)이고 징 저음이 둘 더 얹힌다.
    // 공통 심장박동 층(창을 모르면 1.6초 — 세 박 × 두 음)이 6개를 더한다.
    expect(lastContext!.oscillators - before).toBe(5 + 6)
    expect(() => audio.stopAnticipation()).not.toThrow()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})

describe('hanbok board cues', () => {
  it('every cue makes sound', async () => {
    const audio = await freshAudio()
    const cues: [string, () => void][] = [
      ['toss', () => audio.playYutToss()],
      ['land', () => audio.playYutLand(3)],
      ['call', () => audio.playYutCall(3)],
      ['hop', () => audio.playTokenHop(2)],
      ['coin', () => audio.playTileCoin()],
      ['mult', () => audio.playTileMult(1)],
      ['trap', () => audio.playTileTrap()],
      ['fork', () => audio.playFork()],
      ['goal', () => audio.playGoal()],
      ['summary', () => audio.playBoardSummary()],
    ]
    for (const [name, play] of cues) {
      const before = lastContext!.oscillators + lastContext!.sources
      play()
      expect(lastContext!.oscillators + lastContext!.sources, name).toBeGreaterThan(before)
    }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('the yut call climbs the pentatonic scale from do to mo', async () => {
    const audio = await freshAudio()
    const notes = [1, 2, 3, 4, 5].map((n) => firstFreq(() => audio.playYutCall(n)))
    for (let i = 1; i < notes.length; i++) expect(notes[i]!, `step ${i + 1}`).toBeGreaterThan(notes[i - 1]!)
    // 범위를 벗어나도 도·모 음에서 멈춘다
    expect(firstFreq(() => audio.playYutCall(9))).toBe(notes[4])
    expect(firstFreq(() => audio.playYutCall(0))).toBe(notes[0])
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('the multiplier slide goes one scale step higher with every level', async () => {
    const audio = await freshAudio()
    const levels = [0, 1, 2, 3, 4].map((n) => firstFreq(() => audio.playTileMult(n)))
    for (let i = 1; i < levels.length; i++) expect(levels[i]!, `level ${i}`).toBeGreaterThan(levels[i - 1]!)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('the token hop rises by one semitone per square and stops climbing after an octave', async () => {
    const audio = await freshAudio()
    const hops = [0, 1, 2, 12, 40].map((n) => firstFreq(() => audio.playTokenHop(n)))
    expect(hops[1]! / hops[0]!).toBeCloseTo(2 ** (1 / 12), 5)
    expect(hops[2]! / hops[1]!).toBeCloseTo(2 ** (1 / 12), 5)
    expect(hops[3]! / hops[0]!).toBeCloseTo(2, 5)
    expect(hops[4]).toBe(hops[3])
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('four sticks land every time, and the all-round throw (mo) sounds duller than all-flat (yut)', async () => {
    const audio = await freshAudio()
    for (const steps of [1, 2, 3, 4, 5]) {
      const before = lastContext!.oscillators
      audio.playYutLand(steps)
      // 막대마다 몸통 울림 하나 + 부딪는 소리 하나
      expect(lastContext!.oscillators - before, `steps ${steps}`).toBe(8)
    }
    // 첫 가락의 부딪는 소리(몸통 울림 다음에 만들어진다)로 비교한다
    const strike = (steps: number): number => {
      freqs.length = 0
      audio.playYutLand(steps)
      return freqs[1]!
    }
    expect(strike(5)).toBeLessThan(strike(4))
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stays silent while muted', async () => {
    const audio = await freshAudio()
    audio.setAudioMuted(true)
    const before = lastContext!.oscillators + lastContext!.sources
    audio.playYutToss()
    audio.playYutLand(2)
    audio.playYutCall(4)
    audio.playGoal()
    expect(lastContext!.oscillators + lastContext!.sources).toBe(before)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
