/**
 * 배경음악 악보와 시퀀서. Web Audio를 모른다 — 마디마다 어떤 음을 언제 칠지만 계산한다.
 * 소리는 `bgmVoices.ts`가 내고, 시계·타이머는 `audio.ts`가 쥔다.
 *
 * 한 바퀴는 32마디(A 16 + B 16). 마디마다 편성(패드·반주·아르페지오·선율·베이스·타악)이 달라지고,
 * 반주·아르페지오 무늬와 선율은 (바퀴, 마디)로 씨앗을 정한 난수로 고른다 — 같은 마디는 늘 같은 음이지만
 * 다음 바퀴는 다른 선율이 나온다.
 */
import type { SoundPreset } from '@tgslot/renderer'

export type BgmRole = 'pad' | 'keys' | 'arp' | 'lead' | 'bass' | 'kick' | 'snare' | 'hat' | 'shaker' | 'wood' | 'tick' | 'counter'
export type BgmVariant = 'base' | 'free'

export interface BgmNote {
  /** 마디 시작부터의 박(0..4). 스윙·흔들림이 이미 들어 있다. */
  beat: number
  role: BgmRole
  midi: number
  /** 길이(박). */
  dur: number
  vel: number
}

interface Step {
  beat: number
  dur: number
  vel?: number
  /** 화음에서 위쪽 몇 음만 칠지. 없으면 전부. */
  n?: number
}

interface ArpStep {
  beat: number
  idx: number
  dur: number
  vel?: number
}

type BassDegree = 'r' | '3' | '5' | 'o' | 'a'

interface BassStep {
  beat: number
  deg: BassDegree
  dur: number
  vel?: number
}

interface PercStep {
  beat: number
  role: BgmRole
  vel: number
  midi?: number
}

export interface BgmStyle {
  seed: number
  bpm: number
  /** 뒷박 8분음표를 얼마나 늦출지(0 = 곧게, 1/3 = 셋잇단 셔플). */
  swing: number
  humanize: number
  /** 화음을 쓸어내리는 간격(박). */
  strum: number
  key: number
  scale: readonly number[]
  progression: readonly string[]
  padLo: number
  keysLo: number
  arpLo: number
  bassLo: number
  freeArpShift: number
  freeTempo: number
  lead: { lo: number; hi: number; rest: number; cells: readonly (readonly Step[])[] }
  keys: readonly (readonly Step[])[]
  arp: readonly (readonly ArpStep[])[]
  bass: readonly (readonly BassStep[])[]
  /** [가볍게, 꽉 차게, 필인]. */
  perc: readonly [readonly PercStep[], readonly PercStep[], readonly PercStep[]]
  freePerc: readonly PercStep[]
  /** 변주(free)에서 음정 악기를 몇 반음 올릴지. 없으면 0. */
  freeKeyShift?: number
  /** 변주(free)에서만 얹는 대선율(화음 구성음 인덱스 무늬). */
  counter?: { lo: number; patterns: readonly (readonly ArpStep[])[] }
}

export const BGM_CYCLE_BARS = 32
export const BEATS_PER_BAR = 4

// ── 화음 ──────────────────────────────────────────────────

const PITCH_CLASS: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

const QUALITY: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  '7b9': [0, 4, 7, 10, 13],
  sus: [0, 5, 7],
  sus2: [0, 2, 7],
  '7sus': [0, 5, 7, 10],
}

export interface Chord {
  root: number
  intervals: readonly number[]
}

/** `F:maj7`, `A:m`, `G` 꼴. */
export function parseChord(symbol: string): Chord {
  const [name = '', quality = ''] = symbol.split(':')
  const root = PITCH_CLASS[name]
  const intervals = QUALITY[quality]
  if (root === undefined || !intervals) throw new Error(`bad chord ${symbol}`)
  return { root, intervals }
}

function placeAbove(pc: number, lo: number): number {
  return lo + ((((pc - lo) % 12) + 12) % 12)
}

/** 화음 구성음을 `lo` 이상 한 옥타브 안에 모은다(닫힌 자리바꿈). */
export function placeTones(chord: Chord, lo: number): number[] {
  const tones = chord.intervals.map((iv) => placeAbove((chord.root + iv) % 12, lo))
  return [...new Set(tones)].sort((a, b) => a - b)
}

function toneAt(tones: readonly number[], idx: number): number {
  const n = tones.length
  return tones[((idx % n) + n) % n]! + 12 * Math.floor(idx / n)
}

// ── 난수 ──────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedOf(a: number, b: number, c: number): number {
  return (Math.imul(a, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 7, 83492791)) >>> 0
}

function pick<T>(list: readonly T[], r: number): T {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))]!
}

// ── 편성 ──────────────────────────────────────────────────

export interface BgmLayers {
  pad: boolean
  keys: boolean
  arp: boolean
  lead: boolean
  bass: boolean
  /** 0 없음, 1 가볍게, 2 꽉 차게, 3 필인. */
  perc: 0 | 1 | 2 | 3
}

/** 32마디 안의 자리에 따른 편성. 도입 → 쌓기 → 선율 → 숨 고르기(16~19) → 다시 꽉 차게. */
export function arrangement(barInCycle: number, variant: BgmVariant = 'base'): BgmLayers {
  const b = ((barInCycle % BGM_CYCLE_BARS) + BGM_CYCLE_BARS) % BGM_CYCLE_BARS
  const fill = b % 8 === 7
  if (variant === 'free') return { pad: true, keys: true, arp: true, lead: true, bass: true, perc: fill ? 3 : 2 }
  if (b < 4) return { pad: true, keys: true, arp: false, lead: false, bass: true, perc: 1 }
  if (b < 8) return { pad: true, keys: true, arp: true, lead: false, bass: true, perc: fill ? 3 : 2 }
  if (b < 16) return { pad: true, keys: true, arp: true, lead: true, bass: true, perc: fill ? 3 : 2 }
  if (b < 18) return { pad: true, keys: false, arp: true, lead: false, bass: false, perc: 0 }
  if (b < 20) return { pad: true, keys: false, arp: true, lead: false, bass: true, perc: 1 }
  return { pad: true, keys: true, arp: true, lead: true, bass: true, perc: fill ? 3 : 2 }
}

// ── 한 마디 ───────────────────────────────────────────────

function swingBeat(beat: number, swing: number): number {
  const frac = beat - Math.floor(beat)
  return Math.abs(frac - 0.5) < 1e-6 ? beat + swing * 0.5 : beat
}

function inScale(style: BgmStyle, midi: number): boolean {
  return style.scale.includes((((midi - style.key) % 12) + 12) % 12)
}

function nearest(pool: readonly number[], target: number, r: number): number {
  let best = pool[0]!
  let bestD = Infinity
  for (const m of pool) {
    const d = Math.abs(m - target) + (r < 0.5 ? (m > target ? 0.1 : 0) : m < target ? 0.1 : 0)
    if (d < bestD) {
      best = m
      bestD = d
    }
  }
  return best
}

/** 선율은 두 마디 한 악구로 만든다. 악구 안에서는 앞 음에서 가까운 음으로 걷는다. */
export function leadPhrase(style: BgmStyle, cycle: number, phrase: number, variant: BgmVariant = 'base'): BgmNote[] {
  const rng = mulberry32(seedOf(style.seed + 101, cycle, phrase))
  if (variant === 'base' && rng() < 0.2) return []
  const { lo, hi } = style.lead
  const range: number[] = []
  for (let m = lo; m <= hi; m++) range.push(m)
  const scaleTones = range.filter((m) => inScale(style, m))
  let prev = Math.round((lo + hi) / 2)
  const out: BgmNote[] = []
  for (let half = 0; half < 2; half++) {
    const bar = (phrase * 2 + half) % BGM_CYCLE_BARS
    const chord = parseChord(style.progression[bar]!)
    const pcs = chord.intervals.map((iv) => (chord.root + iv) % 12)
    const chordTones = range.filter((m) => pcs.includes(m % 12))
    const cell = pick(style.lead.cells, rng())
    cell.forEach((step, i) => {
      const skip = rng() < style.lead.rest
      if (skip && !(half === 0 && i === 0)) return
      const strong = Math.abs(step.beat - Math.round(step.beat)) < 1e-6
      const pool = strong && chordTones.length > 0 ? chordTones : scaleTones
      const target = prev + Math.round((rng() * 2 - 1) * 4)
      const midi = nearest(pool, Math.min(hi, Math.max(lo, target)), rng())
      prev = midi
      out.push({ beat: half * BEATS_PER_BAR + step.beat, role: 'lead', midi, dur: step.dur, vel: step.vel ?? 0.8 })
    })
  }
  return out
}

function heldBars(style: BgmStyle, bar: number): number {
  let n = 1
  while (bar + n < BGM_CYCLE_BARS && style.progression[bar + n] === style.progression[bar]) n++
  return n
}

/** `bar`번째 마디(0부터, 바퀴를 넘어 계속 센다)에 칠 음 전부. 박 순서로 정렬돼 있다. */
export function barEvents(style: BgmStyle, bar: number, variant: BgmVariant = 'base'): BgmNote[] {
  const cycle = Math.floor(bar / BGM_CYCLE_BARS)
  const b = ((bar % BGM_CYCLE_BARS) + BGM_CYCLE_BARS) % BGM_CYCLE_BARS
  const layers = arrangement(b, variant)
  const rng = mulberry32(seedOf(style.seed, cycle, b))
  const chord = parseChord(style.progression[b]!)
  const nextChord = parseChord(style.progression[(b + 1) % BGM_CYCLE_BARS]!)
  const out: BgmNote[] = []
  const shift = variant === 'free' ? (style.freeKeyShift ?? 0) : 0
  const push = (role: BgmRole, beat: number, midi: number, dur: number, vel: number, straight = false): void => {
    const jitter = style.humanize > 0 ? (rng() * 2 - 1) * style.humanize : 0
    const at = Math.max(0, (straight ? beat : swingBeat(beat, style.swing)) + jitter)
    if (at >= BEATS_PER_BAR) return
    const pitched = role === 'pad' || role === 'keys' || role === 'arp' || role === 'lead' || role === 'bass' || role === 'counter'
    out.push({ beat: at, role, midi: pitched ? midi + shift : midi, dur, vel: Math.min(1, vel) })
  }

  if (layers.pad && (b === 0 || style.progression[b - 1] !== style.progression[b])) {
    const hold = heldBars(style, b)
    for (const m of placeTones(chord, style.padLo)) push('pad', 0, m, BEATS_PER_BAR * hold, 0.8, true)
  }

  if (layers.keys) {
    const tones = placeTones(chord, style.keysLo)
    for (const step of pick(style.keys, rng())) {
      const sel = step.n ? tones.slice(-step.n) : tones
      const vel = (step.vel ?? 0.8) * (0.88 + rng() * 0.16)
      sel.forEach((m, i) => push('keys', step.beat + i * style.strum, m, step.dur, vel))
    }
  }

  if (layers.arp) {
    const shift = variant === 'free' ? style.freeArpShift : 0
    const tones = placeTones(chord, style.arpLo + shift)
    const group = mulberry32(seedOf(style.seed + 31, cycle, Math.floor(b / 4)))()
    const ceiling = style.arpLo + shift + 21
    for (const step of pick(style.arp, group)) {
      let midi = toneAt(tones, step.idx)
      while (midi > ceiling) midi -= 12
      push('arp', step.beat, midi, step.dur, (step.vel ?? 0.7) * (0.9 + rng() * 0.15))
    }
  }

  if (variant === 'free' && style.counter) {
    const tones = placeTones(chord, style.counter.lo)
    const group = mulberry32(seedOf(style.seed + 67, cycle, Math.floor(b / 2)))()
    for (const step of pick(style.counter.patterns, group)) {
      push('counter', step.beat, toneAt(tones, step.idx), step.dur, (step.vel ?? 0.6) * (0.9 + rng() * 0.15))
    }
  }

  if (layers.bass) {
    const root = placeAbove(chord.root, style.bassLo)
    const nextRoot = placeAbove(nextChord.root, style.bassLo)
    const pattern = pick(style.bass, mulberry32(seedOf(style.seed + 53, cycle, Math.floor(b / 8)))())
    for (const step of pattern) {
      let midi = root
      if (step.deg === '3') midi = root + (chord.intervals[1] ?? 4)
      else if (step.deg === '5') midi = root + (chord.intervals.includes(7) ? 7 : (chord.intervals[2] ?? 7))
      else if (step.deg === 'o') midi = root + 12
      else if (step.deg === 'a') midi = nextRoot === root ? root + 7 : nextRoot + (nextRoot > root ? -1 : 1)
      push('bass', step.beat, midi, step.dur, (step.vel ?? 0.85) * (0.92 + rng() * 0.1))
    }
  }

  if (layers.lead) {
    const phrase = Math.floor(b / 2)
    const half = b % 2
    for (const n of leadPhrase(style, cycle, phrase, variant)) {
      const local = n.beat - half * BEATS_PER_BAR
      if (local >= 0 && local < BEATS_PER_BAR) push('lead', local, n.midi, n.dur, n.vel)
    }
  }

  const percSets: (readonly PercStep[])[] = []
  if (layers.perc > 0) percSets.push(style.perc[layers.perc - 1]!)
  if (variant === 'free') percSets.push(style.freePerc)
  for (const set of percSets) {
    for (const p of set) push(p.role, p.beat, p.midi ?? 60, 0.25, p.vel * (0.85 + rng() * 0.2))
  }

  return out.sort((x, y) => x.beat - y.beat)
}

export function secondsPerBeat(style: BgmStyle, variant: BgmVariant): number {
  return 60 / (style.bpm * (variant === 'free' ? style.freeTempo : 1))
}

// ── 시퀀서 ────────────────────────────────────────────────

export interface BgmSequencerOptions {
  /** 지금부터 몇 초 앞까지 미리 예약할지. */
  lookahead?: number
  onNote: (note: BgmNote, time: number, secPerBeat: number) => void
}

/**
 * 앞을 내다보는 예약기. 타이머가 `pump(ctx.currentTime)`을 자주 부르면, 그 순간부터 `lookahead`초 안에
 * 시작하는 음만 오디오 시계 시각으로 넘긴다. 템포와 변주(`variant`)는 마디 경계에서만 바뀐다.
 * 탭이 멈췄다 돌아와 시계가 한참 앞서 있으면 지난 음은 버리고 지금에 다시 맞춘다.
 */
export class BgmSequencer {
  private bar = 0
  private barStart = 0
  private spb = 0.5
  private events: BgmNote[] = []
  private cursor = 0
  private variant: BgmVariant = 'base'
  private readonly lookahead: number

  constructor(
    private readonly style: BgmStyle,
    private readonly opts: BgmSequencerOptions,
  ) {
    this.lookahead = opts.lookahead ?? 0.25
  }

  start(time: number, bar = 0): void {
    this.bar = bar
    this.barStart = time
    this.spb = secondsPerBeat(this.style, this.variant)
    this.events = barEvents(this.style, bar, this.variant)
    this.cursor = 0
  }

  setVariant(variant: BgmVariant): void {
    this.variant = variant
  }

  getVariant(): BgmVariant {
    return this.variant
  }

  get currentBar(): number {
    return this.bar
  }

  /** 예약한 음의 개수를 돌려준다. */
  pump(now: number): number {
    const horizon = now + this.lookahead
    let scheduled = 0
    if (this.barStart + BEATS_PER_BAR * this.spb < now) this.start(now + 0.05, this.bar + 1)
    for (;;) {
      if (this.cursor < this.events.length) {
        const note = this.events[this.cursor]!
        const time = this.barStart + note.beat * this.spb
        if (time >= horizon) break
        this.cursor++
        if (time >= now - 0.01) {
          this.opts.onNote(note, time, this.spb)
          scheduled++
        }
        continue
      }
      const nextStart = this.barStart + BEATS_PER_BAR * this.spb
      if (nextStart >= horizon) break
      this.bar += 1
      this.barStart = nextStart
      this.spb = secondsPerBeat(this.style, this.variant)
      this.events = barEvents(this.style, this.bar, this.variant)
      this.cursor = 0
    }
    return scheduled
  }
}

// ── 프리셋별 곡 ───────────────────────────────────────────

const s = (beat: number, dur: number, vel?: number, n?: number): Step => ({ beat, dur, vel, n })
const a = (beat: number, idx: number, dur: number, vel?: number): ArpStep => ({ beat, idx, dur, vel })
const bs = (beat: number, deg: BassDegree, dur: number, vel?: number): BassStep => ({ beat, deg, dur, vel })
const p = (beat: number, role: BgmRole, vel: number, midi?: number): PercStep => ({ beat, role, vel, midi })
const beats = (list: readonly number[], role: BgmRole, vel: number, midi?: number): PercStep[] => list.map((b) => p(b, role, vel, midi))

/** 라운지 재즈: 로즈 피아노 컴핑, 비브라폰 선율, 브러시. F장조, 2-5-1. */
const LOUNGE: BgmStyle = {
  seed: 11,
  bpm: 84,
  swing: 0.2,
  humanize: 0.012,
  strum: 0.012,
  key: 65,
  scale: [0, 2, 4, 5, 7, 9, 11],
  progression: [
    'F:maj9', 'D:m9', 'G:m9', 'C:9', 'F:maj7', 'Bb:maj7', 'A:m7', 'D:7b9',
    'G:m7', 'C:7', 'A:m7', 'D:m7', 'G:m7', 'C:7sus', 'F:maj7', 'C:7',
    'Bb:maj7', 'Bb:m6', 'A:m7', 'D:7', 'G:m9', 'C:9', 'F:maj7', 'D:7b9',
    'G:m7', 'Eb:9', 'A:m7', 'D:7', 'G:m9', 'C:7sus', 'F:6', 'C:9',
  ],
  padLo: 53,
  keysLo: 57,
  arpLo: 69,
  bassLo: 36,
  freeArpShift: 12,
  freeTempo: 1.05,
  lead: {
    lo: 72,
    hi: 86,
    rest: 0.25,
    cells: [
      [s(0, 1.5), s(1.5, 1), s(3, 1)],
      [s(0.5, 0.5), s(1, 0.5), s(1.5, 1.5), s(3.5, 0.5)],
      [s(0, 3)],
      [s(1, 0.5), s(1.5, 0.5), s(2, 2)],
      [s(0, 0.5), s(0.5, 0.5), s(1, 1), s(2.5, 1.5)],
    ],
  },
  keys: [
    [s(0, 1.5, 0.8), s(2.5, 1.2, 0.65)],
    [s(1.5, 0.5, 0.7), s(3, 1, 0.75)],
    [s(0, 0.5, 0.8), s(1.5, 1, 0.7), s(3.5, 0.5, 0.6)],
    [s(0.5, 1, 0.7), s(2, 1.5, 0.75)],
  ],
  arp: [
    [a(0, 2, 1), a(1.5, 3, 1), a(3, 4, 1)],
    [a(0.5, 1, 1), a(2, 3, 1), a(2.5, 4, 1.5)],
    [a(1, 2, 1), a(3.5, 4, 0.5)],
    [a(0, 4, 1), a(1, 3, 0.5), a(1.5, 2, 1), a(3, 1, 1)],
  ],
  bass: [
    [bs(0, 'r', 1.6), bs(2, '5', 1.6)],
    [bs(0, 'r', 0.9), bs(1, '3', 0.9), bs(2, '5', 0.9), bs(3, 'a', 0.9)],
  ],
  perc: [
    [...beats([1, 3], 'snare', 0.45), ...beats([0, 2], 'hat', 0.35)],
    [p(0, 'kick', 0.5), ...beats([1, 3], 'snare', 0.5), ...beats([0, 1, 1.5, 2, 3, 3.5], 'hat', 0.45)],
    [p(0, 'kick', 0.5), ...beats([1, 3, 3.5], 'snare', 0.55), ...beats([0, 1, 1.5, 2, 2.5], 'hat', 0.45)],
  ],
  freePerc: beats([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 'shaker', 0.35),
}

/** 열대 칼립소: 마림바 8분 아르페지오, 스틸드럼 선율, 셰이커와 콩가. C장조. */
const TROPICAL: BgmStyle = {
  seed: 23,
  bpm: 108,
  swing: 0,
  humanize: 0.01,
  strum: 0,
  key: 60,
  scale: [0, 2, 4, 7, 9],
  progression: [
    'C', 'F', 'G:7', 'C', 'A:m', 'F', 'G', 'G:7',
    'C', 'E:m', 'F', 'G', 'A:m', 'F', 'G:sus', 'G:7',
    'F', 'G', 'E:m', 'A:m', 'D:m7', 'G:7', 'C', 'C:7',
    'F', 'F:m6', 'C', 'A:m', 'D:m7', 'G:7', 'C', 'G:7',
  ],
  padLo: 55,
  keysLo: 62,
  arpLo: 60,
  bassLo: 36,
  freeArpShift: 7,
  freeTempo: 1.05,
  lead: {
    lo: 65,
    hi: 81,
    rest: 0.2,
    cells: [
      [s(0, 0.75), s(0.75, 0.75), s(1.5, 0.5), s(2, 1.5)],
      [s(0, 0.5), s(0.5, 0.5), s(1, 1), s(2.5, 0.5), s(3, 1)],
      [s(0.5, 0.5), s(1, 0.5), s(1.5, 0.5), s(2, 2)],
      [s(0, 1.5), s(1.5, 0.5), s(2, 0.75), s(2.75, 1.25)],
    ],
  },
  keys: [
    [s(0, 0.4, 0.6, 2), s(0.75, 0.4, 0.5, 2), s(1.5, 0.4, 0.55, 2), s(2.75, 0.4, 0.5, 2)],
    [s(0.5, 0.4, 0.55, 2), s(1.5, 0.4, 0.55, 2), s(2.5, 0.4, 0.55, 2), s(3.5, 0.4, 0.5, 2)],
  ],
  arp: [
    [a(0, 0, 0.5, 0.75), a(0.5, 1, 0.5, 0.5), a(1, 2, 0.5, 0.6), a(1.5, 3, 0.5, 0.5), a(2, 2, 0.5, 0.7), a(2.5, 1, 0.5, 0.5), a(3, 2, 0.5, 0.6), a(3.5, 3, 0.5, 0.5)],
    [a(0, 0, 0.5, 0.75), a(0.5, 2, 0.5, 0.5), a(1, 1, 0.5, 0.6), a(1.5, 3, 0.5, 0.5), a(2, 2, 0.5, 0.7), a(2.5, 4, 0.5, 0.5), a(3, 3, 0.5, 0.6), a(3.5, 2, 0.5, 0.5)],
    [a(0, 3, 0.5, 0.75), a(0.5, 2, 0.5, 0.5), a(1, 1, 0.5, 0.6), a(1.5, 0, 0.5, 0.5), a(2, 1, 0.5, 0.7), a(2.5, 2, 0.5, 0.5), a(3, 3, 0.5, 0.6), a(3.5, 4, 0.5, 0.5)],
    [a(0, 0, 0.5, 0.75), a(0.75, 2, 0.5, 0.6), a(1.5, 1, 0.5, 0.6), a(2, 3, 0.5, 0.7), a(2.75, 2, 0.5, 0.6), a(3.5, 1, 0.5, 0.5)],
  ],
  bass: [
    [bs(0, 'r', 0.6), bs(1.5, 'r', 0.4), bs(2, '5', 0.6), bs(3.5, 'a', 0.4)],
    [bs(0, 'r', 0.4), bs(0.75, '5', 0.4), bs(1.5, 'o', 0.4), bs(2, 'r', 0.8), bs(3, '5', 0.4), bs(3.5, '3', 0.4)],
  ],
  perc: [
    [...beats([0, 1, 2, 3], 'shaker', 0.45), ...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.3)],
    [
      p(0, 'kick', 0.5), p(2, 'kick', 0.45),
      ...beats([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 'shaker', 0.4),
      p(0.75, 'wood', 0.5, 64), p(1.5, 'wood', 0.45, 57), p(2.75, 'wood', 0.5, 64), p(3.5, 'wood', 0.4, 57),
    ],
    [
      p(0, 'kick', 0.5),
      ...beats([0, 0.5, 1, 1.5, 2], 'shaker', 0.4),
      p(0.75, 'wood', 0.5, 64), p(1.5, 'wood', 0.45, 57),
      p(2.5, 'wood', 0.45, 64), p(3, 'wood', 0.5, 64), p(3.25, 'wood', 0.45, 60), p(3.5, 'wood', 0.5, 57), p(3.75, 'wood', 0.55, 57),
    ],
  ],
  freePerc: beats([0.5, 1.5, 2.5, 3.5], 'hat', 0.35),
}

/** 황야: 느린 셔플, 손가락으로 뜯는 기타, 휘파람 선율, 말발굽 같은 나무 소리. A단조. */
const WESTERN: BgmStyle = {
  seed: 37,
  bpm: 76,
  swing: 1 / 3,
  humanize: 0.015,
  strum: 0.04,
  key: 57,
  scale: [0, 2, 3, 5, 7, 8, 10],
  progression: [
    'A:m', 'A:m', 'G', 'G', 'F', 'F', 'E', 'E',
    'A:m', 'C', 'G', 'D', 'F', 'E', 'A:m', 'E:7',
    'D:m', 'D:m', 'A:m', 'A:m', 'F', 'G', 'C', 'E',
    'D:m', 'F', 'A:m', 'G', 'F', 'E:7', 'A:m', 'E',
  ],
  padLo: 52,
  keysLo: 52,
  arpLo: 57,
  bassLo: 33,
  freeArpShift: 0,
  freeTempo: 1.06,
  lead: {
    lo: 69,
    hi: 84,
    rest: 0.15,
    cells: [
      [s(0, 2.5), s(3, 1)],
      [s(0, 1), s(1, 1), s(2, 2)],
      [s(0.5, 0.5), s(1, 3)],
      [s(0, 1.5), s(1.5, 0.5), s(2, 2)],
    ],
  },
  keys: [
    [s(0, 3, 0.55)],
    [s(0, 1.5, 0.5), s(2.5, 1.5, 0.45, 3)],
  ],
  arp: [
    [a(0.5, 2, 0.5), a(1, 1, 0.5), a(1.5, 3, 0.5), a(2.5, 2, 0.5), a(3, 1, 0.5), a(3.5, 3, 0.5)],
    [a(0, 3, 0.5), a(0.5, 2, 0.5), a(1.5, 1, 0.5), a(2, 3, 0.5), a(2.5, 2, 0.5), a(3.5, 4, 0.5)],
    [a(0.5, 1, 0.5), a(1, 2, 0.5), a(1.5, 3, 1), a(2.5, 4, 0.5), a(3, 3, 0.5), a(3.5, 2, 0.5)],
  ],
  bass: [
    [bs(0, 'r', 1.5), bs(2, '5', 1.5)],
    [bs(0, 'r', 1), bs(1, '5', 1), bs(2, 'r', 1), bs(3, '5', 0.5), bs(3.5, 'a', 0.5)],
  ],
  perc: [
    [...beats([0, 1, 2, 3], 'wood', 0.35, 67), ...beats([0.5, 1.5, 2.5, 3.5], 'wood', 0.25, 62)],
    [
      p(0, 'kick', 0.45), p(2, 'kick', 0.4),
      ...beats([1, 3], 'snare', 0.4),
      ...beats([0, 1, 2, 3], 'wood', 0.35, 67), ...beats([0.5, 1.5, 2.5, 3.5], 'wood', 0.25, 62),
    ],
    [
      p(0, 'kick', 0.45),
      ...beats([1, 2.5, 3, 3.5], 'snare', 0.45),
      ...beats([0, 1, 2], 'wood', 0.35, 67), ...beats([0.5, 1.5], 'wood', 0.25, 62),
    ],
  ],
  freePerc: beats([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 'shaker', 0.3),
}

/** 신사: 미야코부시 음계(E F A B C)의 고토, 쇼 같은 패드, 퉁소 선율, 목탁. */
const SHRINE: BgmStyle = {
  seed: 41,
  bpm: 72,
  swing: 0,
  humanize: 0.012,
  strum: 0.03,
  key: 64,
  scale: [0, 1, 5, 7, 8],
  progression: [
    'A:m', 'A:m', 'F:maj7', 'E:sus', 'A:m', 'F', 'E:sus', 'E:5',
    'F:maj7', 'F:maj7', 'A:m', 'A:m', 'F', 'E:sus', 'A:5', 'A:5',
    'F:maj7', 'E:sus', 'F:maj7', 'E:5', 'A:m', 'A:m', 'F:5', 'F:5',
    'E:sus', 'F:maj7', 'A:m', 'E:sus', 'F:maj7', 'E:5', 'A:m', 'A:5',
  ],
  padLo: 52,
  keysLo: 57,
  arpLo: 64,
  bassLo: 40,
  freeArpShift: 0,
  freeTempo: 1.06,
  lead: {
    lo: 69,
    hi: 84,
    rest: 0.15,
    cells: [
      [s(0, 3)],
      [s(0, 1.5), s(2, 2)],
      [s(1, 0.5), s(1.5, 2.5)],
      [s(0, 2), s(2, 1), s(3, 1)],
    ],
  },
  keys: [
    [s(0, 2, 0.6, 2)],
    [s(0, 1, 0.55, 2), s(2.5, 1.5, 0.5, 2)],
    [s(1, 2, 0.5, 3)],
  ],
  arp: [
    [a(0, 0, 0.5), a(0.5, 2, 0.5), a(1, 1, 0.5), a(2, 3, 0.5), a(2.5, 2, 0.5), a(3, 4, 1)],
    [a(0, 4, 0.5), a(1, 3, 0.5), a(1.5, 2, 0.5), a(2, 1, 1), a(3, 0, 0.5), a(3.5, 1, 0.5)],
    [a(0, 2, 0.25, 0.6), a(0.25, 2, 0.25, 0.45), a(0.5, 2, 0.5, 0.55), a(1.5, 3, 0.5), a(2, 4, 1), a(3.5, 3, 0.5)],
    [a(0.5, 1, 0.5), a(1, 2, 0.5), a(2, 3, 0.5), a(2.5, 4, 0.5), a(3, 5, 1)],
  ],
  bass: [[bs(0, 'r', 3)], [bs(0, 'r', 2), bs(2, '5', 2)]],
  perc: [
    [p(0, 'wood', 0.4, 72), p(2, 'wood', 0.25, 67)],
    [p(0, 'kick', 0.45), p(0, 'wood', 0.4, 72), p(1, 'wood', 0.25, 67), p(2, 'wood', 0.35, 72), p(3, 'wood', 0.25, 67)],
    [p(0, 'kick', 0.45), p(0, 'wood', 0.4, 72), p(2, 'wood', 0.3, 67), p(3, 'wood', 0.35, 72), p(3.25, 'wood', 0.35, 72), p(3.5, 'wood', 0.4, 72), p(3.75, 'kick', 0.4)],
  ],
  freePerc: beats([1, 3], 'hat', 0.35),
}

/** 태엽 시계: 오르골 아르페지오, 첼레스타 화음, 똑딱이는 박. D장조. */
const CLOCKWORK: BgmStyle = {
  seed: 53,
  bpm: 96,
  swing: 0,
  humanize: 0,
  strum: 0.02,
  key: 62,
  scale: [0, 2, 4, 6, 7, 9, 11],
  progression: [
    'D:maj7', 'B:m7', 'G:maj7', 'A:7sus', 'D:maj7', 'F#:m7', 'G:maj9', 'A:7',
    'B:m7', 'G:maj7', 'E:m7', 'A:7sus', 'D:maj7', 'B:m7', 'E:m9', 'A:7',
    'G:maj7', 'A:6', 'F#:m7', 'B:m7', 'E:m7', 'A:7', 'D:maj7', 'D:7',
    'G:maj7', 'G:m6', 'F#:m7', 'B:7', 'E:m9', 'A:7sus', 'D:6', 'A:7',
  ],
  padLo: 50,
  keysLo: 62,
  arpLo: 74,
  bassLo: 38,
  freeArpShift: 0,
  freeTempo: 1.05,
  lead: {
    lo: 81,
    hi: 93,
    rest: 0.2,
    cells: [
      [s(0, 1), s(1, 0.5), s(1.5, 0.5), s(2, 2)],
      [s(0, 0.5), s(0.5, 0.5), s(1, 0.5), s(1.5, 0.5), s(2, 1), s(3, 1)],
      [s(0, 2), s(2, 1), s(3, 1)],
      [s(0.5, 0.5), s(1, 1), s(2.5, 0.5), s(3, 1)],
    ],
  },
  keys: [
    [s(0, 1.5, 0.55, 3), s(2, 1.5, 0.45, 3)],
    [s(0, 3, 0.55, 3)],
  ],
  arp: [
    [a(0, 0, 0.5), a(0.5, 1, 0.5), a(1, 2, 0.5), a(1.5, 3, 0.5), a(2, 4, 0.5), a(2.5, 3, 0.5), a(3, 2, 0.5), a(3.5, 1, 0.5)],
    [a(0, 0, 0.5), a(0.5, 2, 0.5), a(1, 4, 0.5), a(1.5, 2, 0.5), a(2, 1, 0.5), a(2.5, 3, 0.5), a(3, 5, 0.5), a(3.5, 3, 0.5)],
    [a(0, 4, 0.5), a(0.5, 3, 0.5), a(1, 2, 0.5), a(1.5, 1, 0.5), a(2, 0, 0.5), a(2.5, 1, 0.5), a(3, 2, 1)],
    [a(0, 0, 1), a(1, 2, 0.5), a(1.5, 1, 0.5), a(2, 3, 1), a(3, 4, 0.5), a(3.5, 2, 0.5)],
  ],
  bass: [[bs(0, 'r', 1.5), bs(2, '5', 1.5)], [bs(0, 'r', 1), bs(1.5, 'r', 0.5), bs(2, '5', 1), bs(3, 'o', 1)]],
  perc: [
    [p(0, 'tick', 0.4, 84), p(1, 'tick', 0.3, 77), p(2, 'tick', 0.4, 84), p(3, 'tick', 0.3, 77)],
    [
      p(0, 'kick', 0.4),
      p(0, 'tick', 0.45, 84), p(0.5, 'tick', 0.2, 89), p(1, 'tick', 0.35, 77), p(1.5, 'tick', 0.2, 89),
      p(2, 'tick', 0.45, 84), p(2.5, 'tick', 0.2, 89), p(3, 'tick', 0.35, 77), p(3.5, 'tick', 0.2, 89),
    ],
    [
      p(0, 'kick', 0.4),
      p(0, 'tick', 0.45, 84), p(1, 'tick', 0.35, 77), p(2, 'tick', 0.45, 84),
      p(3, 'tick', 0.35, 89), p(3.25, 'tick', 0.3, 89), p(3.5, 'tick', 0.35, 89), p(3.75, 'tick', 0.4, 89),
    ],
  ],
  freePerc: beats([0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75], 'hat', 0.25),
}

/** 캔디 팝: 글로켄 선율, 통통 튀는 신스 베이스, 핑거 스냅. D장조 116bpm. 라운드(free)는 반음 위 + 16분 하이햇 + 마림바 대선율. */
const CANDY: BgmStyle = {
  seed: 37,
  bpm: 116,
  swing: 0.1,
  humanize: 0.008,
  strum: 0,
  key: 62,
  scale: [0, 2, 4, 5, 7, 9, 11],
  progression: [
    'D', 'A', 'B:m', 'G', 'D', 'A', 'G', 'A:7',
    'D', 'F#:m', 'G', 'A', 'B:m', 'G', 'A:sus', 'A:7',
    'G', 'D', 'E:m', 'A', 'G', 'A', 'B:m', 'D',
    'E:m', 'A', 'D', 'B:m', 'G', 'A:7', 'D', 'A:sus',
  ],
  padLo: 57,
  keysLo: 62,
  arpLo: 69,
  bassLo: 38,
  freeArpShift: 5,
  freeTempo: 1.03,
  freeKeyShift: 1,
  lead: {
    lo: 74,
    hi: 91,
    rest: 0.15,
    cells: [
      [s(0, 0.5), s(0.5, 0.5), s(1, 0.5), s(1.75, 0.25), s(2, 1.5)],
      [s(0, 0.75), s(0.75, 0.25), s(1, 0.5), s(1.5, 0.5), s(2.5, 0.5), s(3, 0.5), s(3.5, 0.5)],
      [s(0.5, 0.5), s(1, 0.5), s(1.5, 0.5), s(2, 0.5), s(2.75, 0.25), s(3, 1)],
      [s(0, 1), s(1, 0.5), s(1.5, 0.5), s(2, 0.5), s(2.5, 0.5), s(3, 1)],
    ],
  },
  keys: [
    [s(0.5, 0.25, 0.55, 3), s(1.5, 0.25, 0.55, 3), s(2.5, 0.25, 0.55, 3), s(3.5, 0.25, 0.5, 3)],
    [s(0, 0.25, 0.6, 3), s(1.5, 0.25, 0.5, 3), s(2, 0.25, 0.55, 3), s(2.75, 0.25, 0.5, 3), s(3.5, 0.25, 0.5, 3)],
  ],
  arp: [
    [a(0, 2, 0.25, 0.55), a(0.5, 3, 0.25, 0.4), a(1, 4, 0.25, 0.5), a(1.5, 3, 0.25, 0.4), a(2, 2, 0.25, 0.55), a(2.5, 3, 0.25, 0.4), a(3, 4, 0.25, 0.5), a(3.5, 5, 0.25, 0.4)],
    [a(0, 0, 0.25, 0.55), a(0.75, 2, 0.25, 0.45), a(1.5, 3, 0.25, 0.45), a(2, 4, 0.25, 0.55), a(2.75, 3, 0.25, 0.45), a(3.5, 2, 0.25, 0.4)],
  ],
  bass: [
    [bs(0, 'r', 0.35), bs(0.5, 'o', 0.25), bs(1, 'r', 0.35), bs(1.75, '5', 0.25), bs(2, 'r', 0.35), bs(2.5, 'o', 0.25), bs(3, '5', 0.3), bs(3.5, 'a', 0.3)],
    [bs(0, 'r', 0.4), bs(0.75, 'o', 0.25), bs(1.5, 'r', 0.3), bs(2, '5', 0.4), bs(2.75, 'o', 0.25), bs(3.5, 'a', 0.3)],
  ],
  perc: [
    [p(0, 'kick', 0.45), p(2, 'kick', 0.4), ...beats([1, 3], 'snare', 0.5), ...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.25)],
    [
      p(0, 'kick', 0.5), p(1.75, 'kick', 0.35), p(2, 'kick', 0.45),
      ...beats([1, 3], 'snare', 0.55),
      ...beats([0.5, 1.5, 2.5, 3.5], 'shaker', 0.3),
    ],
    [
      p(0, 'kick', 0.5), p(2, 'kick', 0.45),
      ...beats([1, 3, 3.25, 3.5, 3.75], 'snare', 0.55),
      ...beats([0.5, 1.5, 2.5], 'shaker', 0.3),
    ],
  ],
  freePerc: beats([0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75, 0.5, 1.5, 2.5, 3.5, 0, 1, 2, 3], 'hat', 0.28),
  counter: {
    lo: 67,
    patterns: [
      [a(0.5, 2, 0.25, 0.6), a(1.25, 3, 0.25, 0.5), a(2.5, 4, 0.25, 0.6), a(3.25, 3, 0.25, 0.5)],
      [a(0.75, 3, 0.25, 0.55), a(1.5, 4, 0.25, 0.6), a(2.25, 2, 0.25, 0.5), a(3.5, 3, 0.25, 0.6)],
    ],
  },
}

export const BGM_STYLES: Record<SoundPreset, BgmStyle> = {
  bell: LOUNGE,
  fruit: TROPICAL,
  western: WESTERN,
  shrine: SHRINE,
  clockwork: CLOCKWORK,
  candy: CANDY,
}
