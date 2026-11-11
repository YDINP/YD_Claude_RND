/**
 * 배경음악 악기. `bgm.ts`의 음(BgmNote)을 받아 그 자리에서 합성한다 — 녹음 파일은 없다.
 * 역할(pad/keys/arp/...)마다 버스 하나를 만들어 두고 재사용하며, 잔향은 계산으로 만든 임펄스 하나를 모두가 나눠 쓴다.
 * 줄 튕김(기타·고토)은 Karplus-Strong 버퍼를 음높이마다 한 번 만들어 캐시한다(24kHz, 개수 상한).
 * 실시간(AudioContext)과 오프라인 렌더(OfflineAudioContext) 둘 다에서 쓴다.
 */
import type { SoundPreset } from '@tgslot/renderer'
import type { BgmNote, BgmRole } from './bgm'

export interface BgmVoices {
  readonly output: GainNode
  play(note: BgmNote, time: number, secPerBeat: number): void
  setBright(on: boolean, time: number): void
  activeVoices(time: number): number
  dispose(): void
}

export const BGM_MAX_VOICES = 32
const KS_RATE = 24000
const KS_CACHE_LIMIT = 40
const PARTIAL_CEILING = 9000
const PAN: Partial<Record<BgmRole, number>> = { keys: -0.2, arp: 0.3, lead: 0.12, hat: 0.3, shaker: -0.35, wood: -0.15, tick: 0.2, snare: 0.1 }

const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12)

type Partial3 = readonly [ratio: number, amp: number, tau: number]

interface PluckSpec {
  bright: number
  decay: number
  pick: number
  seconds: number
}

interface Tools {
  c: BaseAudioContext
  noise: AudioBuffer
  track(end: number): void
  pluckBuffer(midi: number, spec: PluckSpec): { buffer: AudioBuffer; playbackRate: number }
}

type VoiceFn = (k: Tools, t: number, midi: number, vel: number, dur: number, out: AudioNode) => void

interface Kit {
  /** 프리셋끼리 음량을 맞추는 전체 배율. */
  gain: number
  /** 역할별 [버스 음량, 잔향 보냄]. */
  mix: Partial<Record<BgmRole, readonly [number, number]>>
  padCutoff: readonly [number, number]
  voices: Partial<Record<BgmRole, VoiceFn>>
}

// ── 공용 재료 ─────────────────────────────────────────────

const irCache = new WeakMap<BaseAudioContext, AudioBuffer>()
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

function roomImpulse(c: BaseAudioContext): AudioBuffer {
  const cached = irCache.get(c)
  if (cached) return cached
  const sr = c.sampleRate
  const len = Math.floor(sr * 1.8)
  const ir = c.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const tSec = i / sr
      lp += (0.5 - 0.38 * Math.min(1, tSec / 1.2)) * (Math.random() * 2 - 1 - lp)
      d[i] = tSec < 0.012 ? 0 : lp * Math.exp(-tSec / 0.42) * 0.5
    }
  }
  irCache.set(c, ir)
  return ir
}

function noiseBuffer(c: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(c)
  if (cached) return cached
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  noiseCache.set(c, buf)
  return buf
}

/** Karplus-Strong 한 음. 정수 지연으로 만들고 남은 음정 오차는 재생 속도로 맞춘다. */
export function karplusStrong(
  length: number,
  rate: number,
  freq: number,
  spec: Omit<PluckSpec, 'seconds'>,
  random: () => number = Math.random,
): { data: Float32Array; playbackRate: number } {
  const n = Math.max(2, Math.round(rate / freq))
  const data = new Float32Array(length)
  const pickAt = Math.max(1, Math.floor(n * spec.pick))
  const exc = new Float32Array(n)
  let lp = 0
  for (let i = 0; i < n; i++) {
    lp += spec.bright * (random() * 2 - 1 - lp)
    exc[i] = lp
  }
  let peak = 1e-6
  for (let i = 0; i < n; i++) {
    exc[i] = exc[i]! - (i >= pickAt ? exc[i - pickAt]! : 0)
    peak = Math.max(peak, Math.abs(exc[i]!))
  }
  for (let i = 0; i < n && i < length; i++) data[i] = exc[i]! / peak
  for (let i = n; i < length; i++) data[i] = spec.decay * 0.5 * (data[i - n]! + data[Math.max(0, i - n - 1)]!)
  const fade = Math.min(length, Math.floor(rate * 0.03))
  for (let i = 0; i < fade; i++) data[length - 1 - i] = data[length - 1 - i]! * (i / fade)
  return { data, playbackRate: freq / (rate / n) }
}

// ── 소리 재료 ─────────────────────────────────────────────

/** 사인 배음 묶음(말렛·종·오르골). 배음마다 따로 감쇠한다. `bend`는 첫 40ms 동안 위에서 내려앉는 음정 비. */
function partials(k: Tools, t: number, f: number, vel: number, out: AudioNode, list: readonly Partial3[], attack = 0.002, bend = 1): void {
  let last = t
  for (const [ratio, amp, tau] of list) {
    const pf = f * ratio
    if (pf > PARTIAL_CEILING) continue
    const o = k.c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(pf * bend, t)
    if (bend !== 1) o.frequency.exponentialRampToValueAtTime(pf, t + 0.04)
    const g = k.c.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vel * amp, t + attack)
    g.gain.setTargetAtTime(0, t + attack, tau)
    const end = t + attack + tau * 6
    o.connect(g).connect(out)
    o.start(t)
    o.stop(end)
    last = Math.max(last, end)
  }
  k.track(last)
}

/** 2-연산자 FM. 로즈 피아노처럼 치는 순간 밝고 곧 둥글어진다. */
function fmKey(k: Tools, t: number, f: number, vel: number, dur: number, out: AudioNode, index: number, tau: number): void {
  const car = k.c.createOscillator()
  const mod = k.c.createOscillator()
  const modGain = k.c.createGain()
  car.frequency.value = f
  mod.frequency.value = f
  modGain.gain.setValueAtTime(f * index, t)
  modGain.gain.setTargetAtTime(f * index * 0.3, t, 0.25)
  mod.connect(modGain).connect(car.frequency)
  const g = k.c.createGain()
  const release = t + Math.max(0.3, dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vel, t + 0.004)
  g.gain.setTargetAtTime(0, t + 0.004, tau)
  g.gain.setTargetAtTime(0, release, 0.12)
  const end = Math.min(t + tau * 6, release + 0.6)
  car.connect(g).connect(out)
  car.start(t)
  mod.start(t)
  car.stop(end)
  mod.stop(end)
  k.track(end)
}

interface PadSpec {
  types: readonly OscillatorType[]
  detune: number
  attack: number
  release: number
  octave?: number
}

/** 천천히 차오르고 빠지는 패드. 살짝 어긋난 오실레이터 둘(또는 셋). */
function pad(k: Tools, t: number, f: number, vel: number, dur: number, out: AudioNode, spec: PadSpec): void {
  const g = k.c.createGain()
  const hold = t + Math.max(spec.attack, dur)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vel, t + spec.attack)
  g.gain.setValueAtTime(vel, hold)
  g.gain.setTargetAtTime(0, hold, spec.release / 3)
  const end = hold + spec.release * 2
  g.connect(out)
  spec.types.forEach((type, i) => {
    const o = k.c.createOscillator()
    o.type = type
    o.frequency.value = f * (i === 2 ? (spec.octave ?? 2) : 1)
    o.detune.value = i === 0 ? -spec.detune : i === 1 ? spec.detune : 0
    if (i === 2) {
      const og = k.c.createGain()
      og.gain.value = 0.3
      o.connect(og).connect(g)
    } else {
      o.connect(g)
    }
    o.start(t)
    o.stop(end)
  })
  k.track(end)
}

/** 숨이 섞인 관악(휘파람·퉁소). 비브라토는 음이 자리 잡은 뒤에 들어온다. */
function breathy(k: Tools, t: number, f: number, vel: number, dur: number, out: AudioNode, breath: number, vibHz: number, attack: number): void {
  const o = k.c.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(f * 0.985, t)
  o.frequency.exponentialRampToValueAtTime(f, t + attack)
  const lfo = k.c.createOscillator()
  lfo.frequency.value = vibHz
  const depth = k.c.createGain()
  depth.gain.setValueAtTime(0, t)
  depth.gain.linearRampToValueAtTime(0, t + Math.min(dur, 0.3))
  depth.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(dur, 0.3) + 0.4)
  lfo.connect(depth).connect(o.frequency)
  const g = k.c.createGain()
  const hold = t + Math.max(attack + 0.05, dur * 0.95)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vel, t + attack)
  g.gain.setValueAtTime(vel * 0.85, hold)
  g.gain.setTargetAtTime(0, hold, 0.08)
  const end = hold + 0.5
  o.connect(g).connect(out)
  const n = k.c.createBufferSource()
  n.buffer = k.noise
  n.loop = true
  const bp = k.c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = f * 2
  bp.Q.value = 1.5
  const ng = k.c.createGain()
  ng.gain.setValueAtTime(0, t)
  ng.gain.linearRampToValueAtTime(vel * breath, t + attack * 0.6)
  ng.gain.setTargetAtTime(vel * breath * 0.35, t + attack, 0.15)
  ng.gain.setTargetAtTime(0, hold, 0.06)
  n.connect(bp).connect(ng).connect(out)
  for (const node of [o, lfo]) {
    node.start(t)
    node.stop(end)
  }
  n.start(t, Math.random() * 0.5)
  n.stop(end)
  k.track(end)
}

function pluck(k: Tools, t: number, midi: number, vel: number, dur: number, out: AudioNode, spec: PluckSpec): void {
  const { buffer, playbackRate } = k.pluckBuffer(midi, spec)
  const src = k.c.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = playbackRate
  const g = k.c.createGain()
  const natural = t + buffer.duration / playbackRate
  const end = Math.min(natural, t + Math.max(0.25, dur) + 0.35)
  g.gain.setValueAtTime(vel, t)
  g.gain.setValueAtTime(vel, Math.max(t, end - 0.2))
  g.gain.linearRampToValueAtTime(0, end)
  src.connect(g).connect(out)
  src.start(t)
  src.stop(end + 0.01)
  k.track(end)
}

interface NoiseSpec {
  type: BiquadFilterType
  freq: number
  q: number
  attack: number
  tau: number
}

function hiss(k: Tools, t: number, vel: number, out: AudioNode, spec: NoiseSpec): void {
  const src = k.c.createBufferSource()
  src.buffer = k.noise
  src.loop = true
  const f = k.c.createBiquadFilter()
  f.type = spec.type
  f.frequency.value = spec.freq
  f.Q.value = spec.q
  const g = k.c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vel, t + spec.attack)
  g.gain.setTargetAtTime(0, t + spec.attack, spec.tau)
  const end = t + spec.attack + spec.tau * 6
  src.connect(f).connect(g).connect(out)
  src.start(t, Math.random() * 0.8)
  src.stop(end)
  k.track(end)
}

/** 음정이 떨어지는 북(킥·콩가·목탁·태고). */
function drum(k: Tools, t: number, from: number, to: number, vel: number, out: AudioNode, tau: number, type: OscillatorType = 'sine'): void {
  const o = k.c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + tau * 1.5)
  const g = k.c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vel, t + 0.003)
  g.gain.setTargetAtTime(0, t + 0.003, tau)
  const end = t + tau * 6
  o.connect(g).connect(out)
  o.start(t)
  o.stop(end)
  k.track(end)
}

// ── 프리셋별 악기 ─────────────────────────────────────────

const VIBES: readonly Partial3[] = [[1, 1, 0.9], [4, 0.25, 0.2], [3.01, 0.08, 0.4]]
const MARIMBA: readonly Partial3[] = [[1, 1, 0.2], [3.93, 0.32, 0.04], [9.2, 0.08, 0.015]]
const STEEL: readonly Partial3[] = [[1, 1, 0.45], [2, 0.42, 0.32], [3, 0.16, 0.18], [2.01, 0.12, 0.5]]
const MUSIC_BOX: readonly Partial3[] = [[1, 1, 0.75], [2.01, 0.12, 0.3], [5.4, 0.08, 0.08]]
const CELESTA: readonly Partial3[] = [[1, 1, 0.6], [2, 0.18, 0.25], [4, 0.06, 0.08]]
const SHO: PadSpec = { types: ['sine', 'sine', 'triangle'], detune: 5, attack: 1.4, release: 1.6, octave: 2 }

const GUITAR: PluckSpec = { bright: 0.55, decay: 0.997, pick: 0.18, seconds: 1.4 }
const GUITAR_BASS: PluckSpec = { bright: 0.25, decay: 0.986, pick: 0.25, seconds: 0.9 }
const KOTO: PluckSpec = { bright: 0.85, decay: 0.993, pick: 0.11, seconds: 1.2 }
const KOTO_LOW: PluckSpec = { bright: 0.4, decay: 0.991, pick: 0.2, seconds: 1.2 }

const BRUSH: NoiseSpec = { type: 'bandpass', freq: 2600, q: 0.6, attack: 0.008, tau: 0.06 }
const RIDE: NoiseSpec = { type: 'highpass', freq: 7000, q: 0.7, attack: 0.001, tau: 0.045 }
const SHAKER: NoiseSpec = { type: 'bandpass', freq: 6200, q: 1.1, attack: 0.012, tau: 0.025 }

function marimba(k: Tools, t: number, m: number, v: number, out: AudioNode): void {
  partials(k, t, mtof(m), v, out, MARIMBA, 0.0015)
  hiss(k, t, v * 0.25, out, { type: 'bandpass', freq: 2400, q: 1.2, attack: 0.0008, tau: 0.004 })
}

const bassPartials =
  (list: readonly Partial3[]): VoiceFn =>
  (k, t, m, v, _d, out) =>
    partials(k, t, mtof(m), v, out, list, 0.008)

const BASE_KITS: Record<Exclude<SoundPreset, 'candy'>, Kit> = {
  bell: {
    gain: 1.07,
    mix: {
      pad: [0.05, 0.35],
      keys: [0.24, 0.25],
      arp: [0.15, 0.35],
      lead: [0.17, 0.35],
      bass: [0.16, 0.05],
      kick: [0.28, 0.02],
      snare: [0.08, 0.2],
      hat: [0.06, 0.15],
      shaker: [0.04, 0.1],
    },
    padCutoff: [900, 1800],
    voices: {
      pad: (k, t, m, v, d, out) => pad(k, t, mtof(m), v, d, out, { types: ['sawtooth', 'sawtooth'], detune: 7, attack: 0.9, release: 1.2 }),
      keys: (k, t, m, v, d, out) => fmKey(k, t, mtof(m), v, d, out, 1.6, 0.9),
      arp: (k, t, m, v, _d, out) => partials(k, t, mtof(m), v, out, VIBES),
      lead: (k, t, m, v, _d, out) => partials(k, t, mtof(m), v, out, VIBES),
      bass: bassPartials([[1, 1, 0.45], [2, 0.35, 0.15], [3, 0.1, 0.07]]),
      kick: (k, t, _m, v, _d, out) => drum(k, t, 90, 45, v, out, 0.09),
      snare: (k, t, _m, v, _d, out) => hiss(k, t, v, out, BRUSH),
      hat: (k, t, _m, v, _d, out) => hiss(k, t, v, out, RIDE),
      shaker: (k, t, _m, v, _d, out) => hiss(k, t, v, out, SHAKER),
    },
  },
  fruit: {
    gain: 1.03,
    mix: {
      pad: [0.015, 0.2],
      keys: [0.16, 0.08],
      arp: [0.32, 0.08],
      lead: [0.24, 0.15],
      bass: [0.2, 0.02],
      kick: [0.32, 0.02],
      wood: [0.3, 0.06],
      hat: [0.07, 0.05],
      shaker: [0.13, 0.05],
    },
    padCutoff: [1400, 2600],
    voices: {
      pad: (k, t, m, v, d, out) => pad(k, t, mtof(m), v, d, out, { types: ['triangle', 'triangle'], detune: 9, attack: 0.6, release: 0.9 }),
      keys: (k, t, m, v, _d, out) => marimba(k, t, m, v, out),
      arp: (k, t, m, v, _d, out) => marimba(k, t, m, v, out),
      lead: (k, t, m, v, _d, out) => partials(k, t, mtof(m), v, out, STEEL, 0.006, 1.012),
      bass: bassPartials([[1, 1, 0.32], [2, 0.25, 0.1]]),
      kick: (k, t, _m, v, _d, out) => drum(k, t, 120, 52, v, out, 0.08),
      wood: (k, t, m, v, _d, out) => {
        const f = mtof(m) * 0.75
        drum(k, t, f * 1.35, f, v, out, 0.07)
        hiss(k, t, v * 0.25, out, { type: 'bandpass', freq: 3200, q: 1.5, attack: 0.001, tau: 0.008 })
      },
      hat: (k, t, _m, v, _d, out) => hiss(k, t, v, out, RIDE),
      shaker: (k, t, _m, v, _d, out) => hiss(k, t, v, out, SHAKER),
    },
  },
  western: {
    gain: 2.0,
    mix: {
      pad: [0.03, 0.3],
      keys: [0.22, 0.3],
      arp: [0.26, 0.3],
      lead: [0.07, 0.45],
      bass: [0.2, 0.1],
      kick: [0.24, 0.05],
      snare: [0.07, 0.25],
      wood: [0.09, 0.2],
      shaker: [0.04, 0.15],
    },
    padCutoff: [1000, 1800],
    voices: {
      pad: (k, t, m, v, d, out) => pad(k, t, mtof(m), v, d, out, { types: ['triangle', 'sine'], detune: 4, attack: 1.2, release: 1.4 }),
      keys: (k, t, m, v, d, out) => pluck(k, t, m, v, d, out, GUITAR),
      arp: (k, t, m, v, d, out) => pluck(k, t, m, v, d, out, GUITAR),
      lead: (k, t, m, v, d, out) => breathy(k, t, mtof(m), v, d, out, 0.12, 5.6, 0.06),
      bass: (k, t, m, v, d, out) => pluck(k, t, m, v, d, out, GUITAR_BASS),
      kick: (k, t, _m, v, _d, out) => drum(k, t, 80, 44, v, out, 0.1),
      snare: (k, t, _m, v, _d, out) => hiss(k, t, v, out, BRUSH),
      wood: (k, t, m, v, _d, out) => {
        drum(k, t, mtof(m) * 1.1, mtof(m), v, out, 0.025, 'triangle')
        hiss(k, t, v * 0.4, out, { type: 'bandpass', freq: 1800, q: 2, attack: 0.001, tau: 0.01 })
      },
      shaker: (k, t, _m, v, _d, out) => hiss(k, t, v, out, { ...SHAKER, freq: 4800, tau: 0.035 }),
    },
  },
  shrine: {
    gain: 2.57,
    mix: {
      pad: [0.025, 0.45],
      keys: [0.22, 0.35],
      arp: [0.28, 0.4],
      lead: [0.08, 0.5],
      bass: [0.15, 0.2],
      kick: [0.3, 0.15],
      wood: [0.14, 0.25],
      hat: [0.03, 0.3],
    },
    padCutoff: [1600, 3000],
    voices: {
      pad: (k, t, m, v, d, out) => pad(k, t, mtof(m), v, d, out, SHO),
      keys: (k, t, m, v, d, out) => pluck(k, t, m, v, d, out, KOTO),
      arp: (k, t, m, v, d, out) => pluck(k, t, m, v, d, out, KOTO),
      lead: (k, t, m, v, d, out) => breathy(k, t, mtof(m), v, d, out, 0.3, 4.6, 0.14),
      bass: (k, t, m, v, d, out) => pluck(k, t, m, v, d, out, KOTO_LOW),
      kick: (k, t, _m, v, _d, out) => drum(k, t, 72, 50, v, out, 0.16),
      wood: (k, t, m, v, _d, out) => {
        drum(k, t, mtof(m) * 1.06, mtof(m), v, out, 0.05)
        hiss(k, t, v * 0.2, out, { type: 'bandpass', freq: 1400, q: 2.5, attack: 0.001, tau: 0.012 })
      },
      hat: (k, t, _m, v, _d, out) => {
        partials(k, t, 4200, v, out, [[1, 0.5, 0.07], [1.09, 0.4, 0.06]], 0.001)
        hiss(k, t, v * 0.5, out, { type: 'bandpass', freq: 7000, q: 3, attack: 0.002, tau: 0.04 })
      },
    },
  },
  clockwork: {
    gain: 1.2,
    mix: {
      pad: [0.04, 0.4],
      keys: [0.11, 0.35],
      arp: [0.15, 0.35],
      lead: [0.1, 0.4],
      bass: [0.12, 0.1],
      kick: [0.2, 0.05],
      tick: [0.06, 0.15],
      hat: [0.025, 0.1],
    },
    padCutoff: [1200, 2400],
    voices: {
      pad: (k, t, m, v, d, out) => pad(k, t, mtof(m), v, d, out, { types: ['triangle', 'triangle'], detune: 6, attack: 0.9, release: 1.2 }),
      keys: (k, t, m, v, _d, out) => partials(k, t, mtof(m), v, out, CELESTA, 0.0015),
      arp: (k, t, m, v, _d, out) => partials(k, t, mtof(m), v, out, MUSIC_BOX, 0.001),
      lead: (k, t, m, v, _d, out) => partials(k, t, mtof(m), v, out, MUSIC_BOX, 0.001),
      bass: bassPartials([[1, 1, 0.4], [2, 0.2, 0.1]]),
      kick: (k, t, _m, v, _d, out) => drum(k, t, 70, 45, v, out, 0.08),
      tick: (k, t, m, v, _d, out) => {
        partials(k, t, mtof(m), v, out, [[1, 0.6, 0.012], [2.7, 0.3, 0.006]], 0.0005)
        hiss(k, t, v * 0.5, out, { type: 'highpass', freq: 3500, q: 0.7, attack: 0.0005, tau: 0.005 })
      },
      hat: (k, t, _m, v, _d, out) => hiss(k, t, v, out, { type: 'highpass', freq: 8000, q: 0.7, attack: 0.001, tau: 0.012 }),
    },
  },
}

// candy-cluster-pop 전용 악기 구성이 나오기 전까지 fruit를 빌려 쓴다.
const KITS: Record<SoundPreset, Kit> = { ...BASE_KITS, candy: BASE_KITS.fruit }

// ── 조립 ──────────────────────────────────────────────────

export function createBgmVoices(c: BaseAudioContext, preset: SoundPreset, dest: AudioNode): BgmVoices {
  const kit = KITS[preset]
  const output = c.createGain()
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 9000
  tone.Q.value = 0.5
  const lowCut = c.createBiquadFilter()
  lowCut.type = 'highpass'
  lowCut.frequency.value = 35
  tone.connect(lowCut).connect(output).connect(dest)
  const reverb = c.createConvolver()
  reverb.buffer = roomImpulse(c)
  reverb.connect(tone)
  const padFilter = c.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = kit.padCutoff[0]
  padFilter.Q.value = 0.4
  padFilter.connect(tone)
  const buses = new Map<BgmRole, GainNode>()
  const plucks = new Map<string, { buffer: AudioBuffer; playbackRate: number }>()
  let ends: number[] = []

  const tools: Tools = {
    c,
    noise: noiseBuffer(c),
    track(end) {
      ends.push(end)
    },
    pluckBuffer(midi, spec) {
      const key = `${spec.bright}:${spec.decay}:${spec.pick}:${midi}`
      let entry = plucks.get(key)
      if (entry) return entry
      const length = Math.floor(KS_RATE * spec.seconds)
      const { data, playbackRate } = karplusStrong(length, KS_RATE, mtof(midi), spec)
      const buffer = c.createBuffer(1, length, KS_RATE)
      buffer.getChannelData(0).set(data)
      entry = { buffer, playbackRate }
      if (plucks.size >= KS_CACHE_LIMIT) plucks.delete(plucks.keys().next().value!)
      plucks.set(key, entry)
      return entry
    },
  }

  function bus(role: BgmRole): GainNode {
    let g = buses.get(role)
    if (g) return g
    const [level, send] = kit.mix[role] ?? [0.1, 0.2]
    g = c.createGain()
    g.gain.value = level * kit.gain
    const dry = role === 'pad' ? padFilter : tone
    const pan = PAN[role]
    if (pan !== undefined && typeof c.createStereoPanner === 'function') {
      const panner = c.createStereoPanner()
      panner.pan.value = pan
      g.connect(panner).connect(dry)
    } else {
      g.connect(dry)
    }
    const sendGain = c.createGain()
    sendGain.gain.value = send
    g.connect(sendGain).connect(reverb)
    buses.set(role, g)
    return g
  }

  return {
    output,
    play(note, time, spb) {
      const voice = kit.voices[note.role]
      if (!voice) return
      ends = ends.filter((e) => e > time)
      const essential = note.role === 'pad' || note.role === 'bass' || note.role === 'kick'
      if (!essential && ends.length >= BGM_MAX_VOICES) return
      voice(tools, time, note.midi, note.vel ** 1.4, note.dur * spb, bus(note.role))
    },
    setBright(on, time) {
      padFilter.frequency.setTargetAtTime(kit.padCutoff[on ? 1 : 0], time, 0.6)
      tone.frequency.setTargetAtTime(on ? 12000 : 9000, time, 0.6)
    },
    activeVoices(time) {
      return ends.filter((e) => e > time).length
    },
    dispose() {
      output.disconnect()
      plucks.clear()
      buses.clear()
      ends = []
    },
  }
}
