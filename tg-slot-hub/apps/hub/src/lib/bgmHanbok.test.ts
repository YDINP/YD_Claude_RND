import { describe, expect, it, vi } from 'vitest'
import { BEATS_PER_BAR, BGM_CYCLE_BARS, BGM_STYLES, barEvents, secondsPerBeat, type BgmNote, type BgmRole } from './bgm'
import { createBgmVoices } from './bgmVoices'

const style = BGM_STYLES.hanbok
const THIRD = 1 / 3

const roles = (bar: number, variant: 'base' | 'free', role: BgmRole): BgmNote[] => barEvents(style, bar, variant).filter((n) => n.role === role)

describe('hanbok score', () => {
  it('is goodgeori 12/8 in G pentatonic: dotted quarter = 80, four beats a bar', () => {
    expect(style.bpm).toBe(80)
    expect(BEATS_PER_BAR).toBe(4)
    expect(style.swing).toBe(0)
    expect(style.scale).toEqual([0, 2, 4, 7, 9])
    expect(style.key % 12).toBe(7)
  })

  it('every chord tone of the progression stays inside the pentatonic scale', () => {
    for (let bar = 0; bar < BGM_CYCLE_BARS; bar++) {
      for (const n of barEvents(style, bar, 'base').filter((x) => x.role === 'pad' || x.role === 'keys' || x.role === 'bass')) {
        expect(style.scale.includes((((n.midi - style.key) % 12) + 12) % 12), `bar ${bar} midi ${n.midi}`).toBe(true)
      }
    }
  })

  it('the full janggu pattern lands on the dotted-quarter pulse and on the thirds of a beat', () => {
    const bar = 9
    const kicks = roles(bar, 'base', 'kick').map((n) => n.beat)
    // 덩(0) 쿵(1) 쿵(2) 쿵(3): 박마다 한 번씩 궁편이 울린다
    for (const want of [0, 1, 2, 3]) expect(kicks.some((b) => Math.abs(b - want) < 0.03), `kick near ${want}`).toBe(true)
    const snares = roles(bar, 'base', 'snare').map((n) => n.beat)
    // 기덕은 박 뒤쪽 3분의 2 자리, 더러러는 그 뒤로 세 알
    for (const want of [THIRD * 2, 1 + THIRD * 2, 2 + THIRD * 2, 3 + THIRD]) {
      expect(snares.some((b) => Math.abs(b - want) < 0.03), `snare near ${want.toFixed(3)}`).toBe(true)
    }
    expect(snares.filter((b) => b > 1.6 && b < 2)).toHaveLength(3)
  })

  it('the arpeggio and the lead use triplet positions (thirds of a beat), not straight eighths', () => {
    const offbeat = (n: BgmNote): boolean => {
      const frac = n.beat - Math.floor(n.beat)
      return Math.abs(frac - THIRD) < 0.03 || Math.abs(frac - 2 * THIRD) < 0.03
    }
    let arp = 0
    for (let bar = 4; bar < BGM_CYCLE_BARS; bar++) arp += roles(bar, 'base', 'arp').filter(offbeat).length
    expect(arp).toBeGreaterThan(20)
    const straight = roles(5, 'base', 'arp').filter((n) => Math.abs(n.beat - Math.floor(n.beat) - 0.5) < 0.03)
    expect(straight).toHaveLength(0)
  })

  it('the gong strikes once every four bars on the first beat and nowhere else', () => {
    for (let bar = 0; bar < BGM_CYCLE_BARS * 2; bar++) {
      for (const variant of ['base', 'free'] as const) {
        const gongs = roles(bar, variant, 'gong')
        expect(gongs, `bar ${bar} ${variant}`).toHaveLength(bar % 4 === 0 ? 1 : 0)
        for (const g of gongs) expect(g.beat).toBeLessThan(0.05)
      }
    }
  })

  it('the board variation is 1.35x faster, two semitones up, with kkwaenggwari on the beat and no pitch shift on the gong', () => {
    expect(secondsPerBeat(style, 'base') / secondsPerBeat(style, 'free')).toBeCloseTo(1.35, 5)
    const bar = 10
    const baseBass = roles(bar, 'base', 'bass').map((n) => n.midi)
    const freeBass = roles(bar, 'free', 'bass').map((n) => n.midi)
    expect(freeBass).toEqual(baseBass.map((m) => m + 2))
    expect(roles(bar, 'base', 'hat')).toHaveLength(0)
    const hats = roles(bar, 'free', 'hat').map((n) => n.beat)
    for (const want of [0, 1, 2, 3]) expect(hats.some((b) => Math.abs(b - want) < 0.03), `hat near ${want}`).toBe(true)
    expect(roles(8, 'free', 'gong')[0]!.midi).toBe(roles(8, 'base', 'gong')[0]!.midi)
  })
})

/** 어느 노드든 호출을 삼키는 가짜 Web Audio. 오실레이터와 소스만 센다. */
function fakeContext() {
  const param = (): Record<string, unknown> => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  })
  const node = (): Record<string, unknown> => ({
    connect: vi.fn((to: unknown) => to),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    gain: param(),
    frequency: param(),
    Q: param(),
    detune: param(),
    playbackRate: param(),
    pan: param(),
  })
  const c = {
    oscillators: 0,
    sources: 0,
    sampleRate: 8000,
    createGain: node,
    createBiquadFilter: node,
    createConvolver: node,
    createStereoPanner: node,
    createOscillator: () => {
      c.oscillators += 1
      return node()
    },
    createBufferSource: () => {
      c.sources += 1
      return node()
    },
    createBuffer: (_ch: number, len: number, rate: number) => ({ duration: len / rate, getChannelData: () => new Float32Array(len) }),
  }
  return c
}

describe('hanbok instruments', () => {
  function play(role: BgmRole, bright: boolean): number {
    const c = fakeContext()
    const voices = createBgmVoices(c as unknown as BaseAudioContext, 'hanbok', node())
    voices.setBright(bright, 0)
    const before = c.oscillators + c.sources
    voices.play({ beat: 0, role, midi: role === 'gong' ? 43 : 72, dur: 2, vel: 0.8 }, 0, 0.75)
    return c.oscillators + c.sources - before
  }
  const node = (): AudioNode => ({ connect: vi.fn((to: unknown) => to) }) as unknown as AudioNode

  it('every role the score uses has an instrument (pad is left out on purpose)', () => {
    const used = new Set<BgmRole>()
    for (const variant of ['base', 'free'] as const) {
      for (let bar = 0; bar < BGM_CYCLE_BARS; bar++) for (const n of barEvents(style, bar, variant)) used.add(n.role)
    }
    for (const role of used) {
      if (role === 'pad') continue
      expect(play(role, false), role).toBeGreaterThan(0)
    }
    expect(play('pad', false)).toBe(0)
  })

  it('the lead changes from haegeum (bowed) to daegeum (breath) in the board variation', () => {
    const haegeum = play('lead', false)
    const daegeum = play('lead', true)
    expect(haegeum).toBeGreaterThan(0)
    expect(daegeum).toBeGreaterThan(0)
    expect(daegeum).not.toBe(haegeum)
    // 다른 역할은 변주에서도 그대로다
    expect(play('keys', true)).toBe(play('keys', false))
    expect(play('hat', true)).toBe(play('hat', false))
  })
})
