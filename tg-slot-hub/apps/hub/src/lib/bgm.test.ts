import { describe, expect, it } from 'vitest'
import {
  BEATS_PER_BAR,
  BGM_CYCLE_BARS,
  BGM_STYLES,
  BgmSequencer,
  arrangement,
  barEvents,
  mulberry32,
  parseChord,
  placeTones,
  secondsPerBeat,
  type BgmNote,
} from './bgm'
import { karplusStrong } from './bgmVoices'

const PRESETS = Object.keys(BGM_STYLES) as (keyof typeof BGM_STYLES)[]

describe('chords', () => {
  it('parses symbols and stacks a closed voicing above the floor', () => {
    expect(placeTones(parseChord('F:maj7'), 53)).toEqual([53, 57, 60, 64])
    expect(placeTones(parseChord('A:m'), 57)).toEqual([57, 60, 64])
    expect(placeTones(parseChord('Bb:m6'), 58)).toEqual([58, 61, 65, 67])
    expect(() => parseChord('H:maj7')).toThrow()
  })
})

describe('arrangement', () => {
  it('builds up, breathes at bars 16-19 and fills every 8th bar', () => {
    expect(arrangement(0)).toMatchObject({ lead: false, arp: false, perc: 1 })
    expect(arrangement(5)).toMatchObject({ arp: true, lead: false, perc: 2 })
    expect(arrangement(7).perc).toBe(3)
    expect(arrangement(10)).toMatchObject({ lead: true, keys: true })
    expect(arrangement(16)).toMatchObject({ keys: false, bass: false, lead: false, perc: 0 })
    expect(arrangement(24)).toMatchObject({ lead: true, perc: 2 })
    expect(arrangement(32)).toEqual(arrangement(0))
  })

  it('keeps the free-spins variant full all the way through', () => {
    for (let b = 0; b < BGM_CYCLE_BARS; b++) {
      expect(arrangement(b, 'free')).toMatchObject({ pad: true, keys: true, arp: true, lead: true, bass: true })
    }
  })
})

describe.each(PRESETS)('score: %s', (preset) => {
  const style = BGM_STYLES[preset]

  it('has a 32-bar progression of valid chords and a tempo in the lounge range', () => {
    expect(style.progression).toHaveLength(BGM_CYCLE_BARS)
    for (const sym of style.progression) expect(() => parseChord(sym)).not.toThrow()
    expect(style.bpm).toBeGreaterThanOrEqual(70)
    expect(style.bpm).toBeLessThanOrEqual(110)
  })

  it('produces sorted, in-bar, in-range notes for two whole cycles', () => {
    for (const variant of ['base', 'free'] as const) {
      for (let bar = 0; bar < BGM_CYCLE_BARS * 2; bar++) {
        const notes = barEvents(style, bar, variant)
        expect(notes.length, `bar ${bar}`).toBeGreaterThan(0)
        for (let i = 0; i < notes.length; i++) {
          const n = notes[i]!
          expect(n.beat).toBeGreaterThanOrEqual(0)
          expect(n.beat).toBeLessThan(BEATS_PER_BAR)
          if (i > 0) expect(n.beat).toBeGreaterThanOrEqual(notes[i - 1]!.beat)
          expect(n.midi).toBeGreaterThanOrEqual(24)
          expect(n.midi).toBeLessThanOrEqual(100)
          expect(n.dur).toBeGreaterThan(0)
          expect(n.vel).toBeGreaterThan(0)
          expect(n.vel).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is deterministic per bar but writes a different melody on the next cycle', () => {
    expect(barEvents(style, 9)).toEqual(barEvents(style, 9))
    const lead = (bar: number): number[] => barEvents(style, bar).filter((n) => n.role === 'lead').map((n) => n.midi * 100 + n.beat)
    const first: number[] = []
    const second: number[] = []
    for (let b = 8; b < 16; b++) {
      first.push(...lead(b))
      second.push(...lead(b + BGM_CYCLE_BARS))
    }
    expect(first.length + second.length).toBeGreaterThan(0)
    expect(second).not.toEqual(first)
  })

  it('keeps the melody inside the scale or the current chord', () => {
    for (let bar = 0; bar < BGM_CYCLE_BARS * 3; bar++) {
      const chord = parseChord(style.progression[bar % BGM_CYCLE_BARS]!)
      const pcs = chord.intervals.map((iv) => (chord.root + iv) % 12)
      for (const n of barEvents(style, bar).filter((x) => x.role === 'lead')) {
        const inScale = style.scale.includes((((n.midi - style.key) % 12) + 12) % 12)
        expect(inScale || pcs.includes(n.midi % 12), `bar ${bar} midi ${n.midi}`).toBe(true)
        expect(n.midi).toBeGreaterThanOrEqual(style.lead.lo)
        expect(n.midi).toBeLessThanOrEqual(style.lead.hi)
      }
    }
  })

  it('makes the free-spins variant faster and busier', () => {
    expect(secondsPerBeat(style, 'free')).toBeLessThan(secondsPerBeat(style, 'base'))
    let base = 0
    let free = 0
    for (let b = 0; b < BGM_CYCLE_BARS; b++) {
      base += barEvents(style, b, 'base').length
      free += barEvents(style, b, 'free').length
    }
    expect(free).toBeGreaterThan(base)
  })
})

describe('BgmSequencer', () => {
  const style = BGM_STYLES.bell
  const spb = secondsPerBeat(style, 'base')
  const bar = BEATS_PER_BAR * spb

  function run(times: number[], setup?: (seq: BgmSequencer) => void, onPump?: (seq: BgmSequencer, now: number) => void) {
    const got: { note: BgmNote; time: number; spb: number; now: number }[] = []
    let now = 0
    const seq = new BgmSequencer(style, { lookahead: 0.3, onNote: (note, time, s) => got.push({ note, time, spb: s, now }) })
    setup?.(seq)
    seq.start(times[0] ?? 0)
    for (now of times) {
      onPump?.(seq, now)
      seq.pump(now)
    }
    return got
  }

  it('schedules each note once, ahead of time but never more than the lookahead', () => {
    const times = Array.from({ length: Math.ceil((bar * 3) / 0.05) }, (_, i) => i * 0.05)
    const got = run(times)
    const expected = [0, 1, 2].reduce((sum, b) => sum + barEvents(style, b).length, 0)
    expect(got.length).toBeGreaterThanOrEqual(expected - barEvents(style, 2).length)
    for (let i = 0; i < got.length; i++) {
      const g = got[i]!
      expect(g.time).toBeGreaterThanOrEqual(g.now - 0.01)
      expect(g.time).toBeLessThan(g.now + 0.3)
      if (i > 0) expect(g.time).toBeGreaterThanOrEqual(got[i - 1]!.time - 1e-9)
    }
    const bar1 = barEvents(style, 1)
    const firstOfBar1 = got.find((g) => g.time >= bar - 1e-9)!
    expect(firstOfBar1.time).toBeCloseTo(bar + bar1[0]!.beat * spb, 6)
  })

  it('does not drift with an irregular timer', () => {
    const rng = mulberry32(7)
    const times: number[] = []
    for (let t = 0; t < bar * 4; t += 0.02 + rng() * 0.2) times.push(t)
    const got = run(times)
    const bar3 = barEvents(style, 3)
    const first = got.find((g) => g.time >= bar * 3 - 1e-9)!
    expect(first.time).toBeCloseTo(bar * 3 + bar3[0]!.beat * spb, 6)
  })

  it('switches tempo and variant only at the next bar line', () => {
    const times = Array.from({ length: Math.ceil((bar * 2.5) / 0.05) }, (_, i) => i * 0.05)
    let switched = false
    const got = run(times, undefined, (seq, now) => {
      if (!switched && now > bar * 0.5) {
        seq.setVariant('free')
        switched = true
      }
    })
    const inBar0 = got.filter((g) => g.time < bar - 1e-9)
    const inBar1 = got.filter((g) => g.time >= bar - 1e-9)
    expect(inBar0.every((g) => g.spb === spb)).toBe(true)
    expect(inBar1.length).toBeGreaterThan(0)
    expect(inBar1.every((g) => g.spb === secondsPerBeat(style, 'free'))).toBe(true)
  })

  it('re-anchors after a long stall instead of flushing stale notes', () => {
    const got = run([0, 0.05, 120])
    const late = got.filter((g) => g.now === 120)
    expect(late.length).toBeGreaterThan(0)
    expect(late.every((g) => g.time >= 120 - 0.01 && g.time < 120.3)).toBe(true)
  })
})

describe('karplusStrong', () => {
  it('tunes through the playback rate and decays', () => {
    const rate = 24000
    const { data, playbackRate } = karplusStrong(rate, rate, 440, { bright: 0.6, decay: 0.996, pick: 0.2 }, mulberry32(3))
    expect((rate / Math.round(rate / 440)) * playbackRate).toBeCloseTo(440, 6)
    const energy = (from: number, to: number): number => {
      let e = 0
      for (let i = from; i < to; i++) e += data[i]! ** 2
      return e
    }
    expect(energy(rate * 0.8, rate * 0.9)).toBeLessThan(energy(0, rate * 0.1) * 0.2)
    expect(Math.max(...Array.from(data.subarray(0, 200), Math.abs))).toBeLessThanOrEqual(1)
    expect(data[data.length - 1]).toBeCloseTo(0, 6)
  })
})
