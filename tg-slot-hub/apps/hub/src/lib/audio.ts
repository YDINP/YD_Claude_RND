/**
 * 슬롯 효과음. 에셋 파일 없이 Web Audio로 그 자리에서 합성한다.
 * 테마가 `sfx` URL을 주면(spin/stop/win/bigwin) 그 파일이 같은 키의 합성음을 대신한다.
 * 테마의 `sound.preset`은 합성 레시피 표를 통째로 갈아 끼운다(`setSoundPreset`) — 없으면 `bell`.
 *
 * AudioContext는 첫 사용자 제스처에서 만든다(iOS/텔레그램 웹뷰 자동재생 정책).
 * 그 전에 온 재생 요청은 조용히 버린다 — 스핀은 늘 버튼 탭으로 시작하므로 놓칠 일이 없다.
 */
import type { SoundPreset, WinTier } from '@tgslot/renderer'
import { BGM_STYLES, BgmSequencer, type BgmVariant } from './bgm'
import { createBgmVoices, type BgmVoices } from './bgmVoices'

type SfxKey = 'spin' | 'stop' | 'win' | 'bigwin'

let muted = false
let sfxVolume = 1
let ctx: AudioContext | null = null
let master: GainNode | null = null
let bgmBus: GainNode | null = null
let bgmDuck: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let spinLoop: { src: AudioBufferSourceNode; gain: GainNode } | null = null
let riser: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode; extra: AudioScheduledSourceNode[] } | null = null
let riserStep = 0
let lastStopAt = 0
let lastTickAt = 0
let overrideUrls: Partial<Record<SfxKey, string>> = {}
const overrideBuffers = new Map<string, Promise<AudioBuffer | null>>()

const MASTER_VOLUME = 0.55

function masterLevel(): number {
  return muted ? 0 : MASTER_VOLUME * sfxVolume
}

export function setAudioMuted(nextMuted: boolean): void {
  muted = nextMuted
  if (master && ctx) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02)
  applyBgmLevel()
  if (muted) {
    stopSpinLoop()
    stopAnticipation()
    stopBgmSession(0.15)
  } else {
    tryStartBgm()
  }
}

export function isAudioMuted(): boolean {
  return muted
}

/** 효과음 음량 0..100. 마스터 게인에 곱한다. 뮤트와 별개로 기억된다. */
export function setSfxVolume(percent: number): void {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 100
  sfxVolume = clamped / 100
  if (master && ctx) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.02)
}

export function getSfxVolume(): number {
  return Math.round(sfxVolume * 100)
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  if (!Ctor) return null
  ctx = new Ctor()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 4
  comp.connect(ctx.destination)
  master = ctx.createGain()
  master.gain.value = masterLevel()
  master.connect(comp)
  bgmBus = ctx.createGain()
  bgmBus.gain.value = bgmLevel()
  bgmDuck = ctx.createGain()
  bgmDuck.connect(bgmBus).connect(comp)
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return ctx
}

/** 첫 탭에서 컨텍스트를 만들고 깨운다. 앱 시작 때 한 번 부른다. */
export function installAudioUnlock(): void {
  if (typeof window === 'undefined') return
  const unlock = (): void => {
    const c = ensureContext()
    if (c && c.state === 'suspended') void c.resume().then(tryStartBgm)
    else tryStartBgm()
  }
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) {
      stopBgmSession(0)
      void ctx.suspend()
    } else {
      void ctx.resume().then(tryStartBgm)
    }
  })
}

function live(): AudioContext | null {
  if (muted || !ctx || !master || ctx.state !== 'running') return null
  return ctx
}

/** 테마의 sfx URL을 등록한다. 없는 키는 합성음을 쓴다. */
export function setSfxOverrides(urls: Partial<Record<SfxKey, string>> | undefined): void {
  overrideUrls = urls ?? {}
}

function playOverride(key: SfxKey, volume = 1): boolean {
  const url = overrideUrls[key]
  const c = live()
  if (!url || !c || !master) return Boolean(url)
  let pending = overrideBuffers.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .catch(() => null)
    overrideBuffers.set(url, pending)
  }
  void pending.then((buf) => {
    if (!buf || !master || muted) return
    const src = c.createBufferSource()
    const g = c.createGain()
    g.gain.value = volume
    src.buffer = buf
    src.connect(g).connect(master)
    src.start()
  })
  return true
}

// ── 합성 재료 ─────────────────────────────────────────────

interface ToneOpts {
  freq: number
  at?: number
  dur: number
  vol: number
  type?: OscillatorType
  attack?: number
  slideTo?: number
  /** 로우패스 시작 주파수. 줄 튕김·나무 소리처럼 밝게 시작해 어두워지는 소리용. */
  lp?: number
  lpTo?: number
  out?: AudioNode
}

function tone(c: AudioContext, o: ToneOpts): void {
  const t = c.currentTime + (o.at ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'triangle'
  osc.frequency.setValueAtTime(o.freq, t)
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + o.dur)
  const a = o.attack ?? 0.004
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  const out = o.out ?? master!
  if (o.lp) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(o.lp, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(60, o.lpTo ?? o.lp * 0.2), t + o.dur)
    osc.connect(f).connect(g).connect(out)
  } else {
    osc.connect(g).connect(out)
  }
  osc.start(t)
  osc.stop(t + o.dur + 0.02)
}

function noise(
  c: AudioContext,
  o: { at?: number; dur: number; vol: number; filter: BiquadFilterType; freq: number; q?: number; sweepTo?: number },
): void {
  if (!noiseBuffer) return
  const t = c.currentTime + (o.at ?? 0)
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  const f = c.createBiquadFilter()
  f.type = o.filter
  f.frequency.setValueAtTime(o.freq, t)
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur)
  f.Q.value = o.q ?? 1
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(f).connect(g).connect(master!)
  src.start(t, Math.random() * 0.5)
  src.stop(t + o.dur + 0.02)
}

// ── 목소리(음색) ──────────────────────────────────────────

type Voice = (c: AudioContext, freq: number, at: number, vol: number) => void

/** 종소리: 기음 + 비정수 배음 두 개(금속성). 순수 사인 한 줄보다 덜 기계적이다. */
function bell(c: AudioContext, freq: number, at: number, vol: number, dur = 0.9): void {
  tone(c, { freq, at, dur, vol, type: 'sine' })
  tone(c, { freq: freq * 2.76, at, dur: dur * 0.45, vol: vol * 0.35, type: 'sine' })
  tone(c, { freq: freq * 5.4, at, dur: dur * 0.2, vol: vol * 0.15, type: 'sine' })
  tone(c, { freq: freq * 2, at, dur: dur * 0.6, vol: vol * 0.25, type: 'triangle' })
}

/** 과일 팝: 아래에서 튀어 오르는 짧은 사인 + 높은 플링크. */
const popVoice: Voice = (c, f, at, vol) => {
  tone(c, { freq: f * 0.6, slideTo: f * 1.1, at, dur: 0.1, vol, type: 'sine', attack: 0.002 })
  tone(c, { freq: f * 2.4, at: at + 0.012, dur: 0.06, vol: vol * 0.3, type: 'sine', attack: 0.002 })
}

/** 서부 기타: 밝게 시작해 어두워지는 톱니파 + 몸통 삼각파, 끝이 살짝 처진다(트왱). */
function pluck(c: AudioContext, f: number, at: number, vol: number, ring: number): void {
  const t = c.currentTime + at
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(f, t)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.8
  lp.frequency.setValueAtTime(Math.min(9000, f * 10), t)
  lp.frequency.setTargetAtTime(f * 1.2, t + 0.004, 0.05)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol * 0.75, t + 0.002)
  g.gain.setTargetAtTime(0.0001, t + 0.002, ring)
  osc.connect(lp).connect(g).connect(master!)
  osc.start(t)
  osc.stop(t + ring * 5 + 0.05)
  tone(c, { freq: f * 2, at, dur: Math.min(0.3, ring * 1.4), vol: vol * 0.18, type: 'sine', attack: 0.002 })
  noise(c, { at, dur: 0.012, vol: vol * 0.35, filter: 'bandpass', freq: 3200, q: 1.2 })
}

const pluckVoice: Voice = (c, f, at, vol) => pluck(c, f, at, vol, 0.22)

/** 신사 종: 낮고 길게 울리는 종. 맥놀이 한 겹을 얹어 울림이 흔들린다. */
const templeVoice: Voice = (c, f, at, vol) => {
  tone(c, { freq: f, at, dur: 2.0, vol, type: 'sine', attack: 0.006 })
  tone(c, { freq: f * 1.006, at, dur: 1.8, vol: vol * 0.5, type: 'sine', attack: 0.006 })
  tone(c, { freq: f * 2.01, at, dur: 1.1, vol: vol * 0.35, type: 'sine' })
  tone(c, { freq: f * 2.97, at, dur: 0.7, vol: vol * 0.2, type: 'sine' })
  tone(c, { freq: f * 4.2, at, dur: 0.3, vol: vol * 0.1, type: 'sine' })
}

/** 시계 유리: 아주 짧은 어택, 정수에 가까운 높은 배음 하나. 차갑고 맑다. */
const glassVoice: Voice = (c, f, at, vol) => {
  tone(c, { freq: f, at, dur: 0.9, vol, type: 'sine', attack: 0.001 })
  tone(c, { freq: f * 3.01, at, dur: 0.35, vol: vol * 0.3, type: 'sine', attack: 0.001 })
  tone(c, { freq: f * 5.04, at, dur: 0.12, vol: vol * 0.12, type: 'sine', attack: 0.001 })
}

const bellVoice: Voice = (c, f, at, vol) => bell(c, f, at, vol, 0.8)

/** 나무 딱따기: 짧은 나무 울림 + 대역 잡음 한 번. */
function clack(c: AudioContext, freq: number, at: number, vol: number): void {
  tone(c, { freq, slideTo: freq * 0.55, at, dur: 0.06, vol, type: 'triangle', attack: 0.001 })
  noise(c, { at, dur: 0.035, vol: vol * 0.5, filter: 'bandpass', freq: 1900, q: 2 })
}

/** 총성 같은 딸깍: 짧은 잡음 폭발 + 낮은 쿵. 큰 당첨에서만 쓴다. */
function gunshot(c: AudioContext, at: number, vol: number): void {
  noise(c, { at, dur: 0.03, vol: vol * 1.2, filter: 'highpass', freq: 1200, q: 0.7 })
  noise(c, { at, dur: 0.35, vol, filter: 'lowpass', freq: 3000, sweepTo: 200, q: 0.7 })
  tone(c, { freq: 90, slideTo: 40, at, dur: 0.25, vol: vol * 0.9, type: 'sine', attack: 0.002 })
  noise(c, { at: at + 0.02, dur: 0.9, vol: vol * 0.15, filter: 'bandpass', freq: 900, q: 0.7 })
}

/** 톱니바퀴가 한 칸 넘어가는 소리. */
function gearTick(c: AudioContext, at: number, vol: number, pitch = 1): void {
  tone(c, { freq: 2600 * pitch, slideTo: 1500 * pitch, at, dur: 0.018, vol, type: 'square', attack: 0.001 })
  noise(c, { at, dur: 0.012, vol: vol * 0.6, filter: 'highpass', freq: 4500 })
}

interface SparkleOpts {
  dur: number
  density: number
  vol: number
  lo: number
  hi: number
  voice: 'coin' | 'bubble' | 'suzu' | 'glass'
}

/** 당첨 동안 흩뿌리는 작은 소리들. 프리셋마다 동전/거품/방울/유리다. */
function sparkle(c: AudioContext, o: SparkleOpts): void {
  const count = Math.min(60, Math.round(o.dur * o.density))
  for (let i = 0; i < count; i++) {
    const at = (i / count) * o.dur + Math.random() * 0.05
    const f = o.lo + Math.random() * (o.hi - o.lo)
    const v = o.vol * (0.6 + Math.random() * 0.4)
    if (o.voice === 'bubble') {
      tone(c, { freq: f * 0.7, slideTo: f * 1.3, at, dur: 0.07, vol: v, type: 'sine', attack: 0.002 })
    } else if (o.voice === 'suzu') {
      tone(c, { freq: f, at, dur: 0.16, vol: v * 0.8, type: 'sine', attack: 0.001 })
      tone(c, { freq: f * 1.01, at, dur: 0.14, vol: v * 0.6, type: 'sine', attack: 0.001 })
    } else if (o.voice === 'glass') {
      tone(c, { freq: f, at, dur: 0.14, vol: v * 0.9, type: 'sine', attack: 0.001 })
      tone(c, { freq: f * 3.01, at, dur: 0.05, vol: v * 0.3, type: 'sine', attack: 0.001 })
    } else {
      tone(c, { freq: f, at, dur: 0.12, vol: v, type: 'sine' })
      tone(c, { freq: f * 1.5, at: at + 0.01, dur: 0.08, vol: v * 0.4, type: 'sine' })
    }
  }
}

/** 한 음계를 일정 간격으로 훑는다. */
function run(c: AudioContext, voice: Voice, scale: readonly number[], notes: readonly number[], step: number, vol: number): void {
  notes.forEach((n, i) => voice(c, scale[n]!, i * step, vol))
}

/** 화음을 `strum`초 간격으로 쓸어내린다(기타) 또는 동시에 친다(strum=0). */
function chord(c: AudioContext, voice: Voice, freqs: readonly number[], at: number, vol: number, strum = 0): void {
  freqs.forEach((f, i) => voice(c, f, at + i * strum, vol))
}

// ── 레시피 표 ─────────────────────────────────────────────

interface LoopSpec {
  /** 딸깍 하나의 울림 주파수(Hz). */
  hz: number
  ticks: number
  /** 울림(사인) 대 잡음 비율. 1이면 순음. */
  tonal: number
  /** 짝수/홀수 딸깍의 음높이 차. */
  alt: number
  /** 딸깍 길이(초). */
  len: number
  vol: number
}

interface RiserSpec {
  wave: OscillatorType
  from: number
  to: number
  /** 떨림(펄스) 속도. 긴장감을 만든다. */
  pulseHz: number
  lp: number
  vol: number
}

interface Recipe {
  loop: LoopSpec
  riser: RiserSpec
  scale: readonly number[]
  spinStart(c: AudioContext): void
  reelStop(c: AudioContext, lift: number): void
  winSmall(c: AudioContext, rollup: number): void
  winBig(c: AudioContext, tier: Exclude<WinTier, 'none'>, rollup: number): void
  feature(c: AudioContext): void
  mutation(c: AudioContext): void
  /** 롤업 중 틱. `progress`는 0..1. */
  tick(c: AudioContext, progress: number): void
  tickEnd(c: AudioContext, tier: WinTier): void
}

const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98]
const FRUIT_SCALE = [659.25, 739.99, 830.61, 987.77, 1108.73, 1318.51, 1479.98, 1661.22, 1975.53]
const WESTERN_SCALE = [329.63, 392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77]
const SHRINE_SCALE = [659.25, 698.46, 880, 987.77, 1046.5, 1318.51, 1396.91, 1760, 1975.53]
const CLOCK_SCALE = [1046.5, 1174.66, 1318.51, 1479.98, 1567.98, 1760, 1975.53, 2093, 2349.32]

const BELL_RECIPE: Recipe = {
  loop: { hz: 2100, ticks: 16, tonal: 0.6, alt: 0.15, len: 0.018, vol: 0.18 },
  riser: { wave: 'sawtooth', from: 220, to: 880, pulseHz: 9, lp: 2400, vol: 0.09 },
  scale: PENTA,
  spinStart(c) {
    noise(c, { dur: 0.22, vol: 0.35, filter: 'bandpass', freq: 600, sweepTo: 3200, q: 1.4 })
    tone(c, { freq: 140, dur: 0.12, vol: 0.4, type: 'triangle', slideTo: 70 })
  },
  reelStop(c, lift) {
    tone(c, { freq: 330 * lift, dur: 0.07, vol: 0.75, type: 'triangle', slideTo: 200 * lift, attack: 0.001, lp: 2600, lpTo: 500 })
    tone(c, { freq: 120 * lift, dur: 0.06, vol: 0.35, type: 'sine', attack: 0.001 })
    noise(c, { dur: 0.03, vol: 0.5, filter: 'bandpass', freq: 2200, q: 1.5 })
    tone(c, { freq: 880 * lift, dur: 0.04, vol: 0.08, type: 'square' })
  },
  winSmall(c, rollup) {
    run(c, (cc, f, at, v) => bell(cc, f, at, v, 0.7), PENTA, [0, 2, 4], 0.08, 0.22)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 10, vol: 0.05, lo: 2200, hi: 4000, voice: 'coin' })
  },
  winBig(c, tier, rollup) {
    const steps = { big: 6, mega: 8, epic: 9, max: 9 }[tier]
    for (let i = 0; i < steps; i++) bell(c, PENTA[i]!, i * 0.07, 0.24, 0.8)
    const chordAt = steps * 0.07 + 0.05
    const root = tier === 'big' ? 261.63 : tier === 'mega' ? 293.66 : 329.63
    for (const ratio of [1, 1.25, 1.5, 2]) {
      tone(c, { freq: root * ratio, at: chordAt, dur: 1.6, vol: 0.12, type: 'sawtooth', attack: 0.03 })
      tone(c, { freq: root * ratio * 1.004, at: chordAt, dur: 1.6, vol: 0.1, type: 'triangle', attack: 0.03 })
    }
    noise(c, { at: chordAt, dur: 0.9, vol: 0.12, filter: 'highpass', freq: 6000 })
    sparkle(c, { dur: rollup, density: tier === 'big' ? 14 : 22, vol: 0.06, lo: 2200, hi: 4000, voice: 'coin' })
  },
  feature(c) {
    noise(c, { dur: 0.9, vol: 0.25, filter: 'bandpass', freq: 400, sweepTo: 7000, q: 2 })
    tone(c, { freq: 220, dur: 0.9, vol: 0.2, type: 'sawtooth', slideTo: 880, attack: 0.05 })
    ;[4, 5, 6, 7, 8].forEach((n, i) => bell(c, PENTA[n]!, 0.6 + i * 0.06, 0.18, 1.1))
  },
  mutation(c) {
    noise(c, { dur: 0.35, vol: 0.12, filter: 'highpass', freq: 5000 })
    ;[6, 8].forEach((n, i) => bell(c, PENTA[n]!, i * 0.05, 0.14, 0.5))
  },
  tick(c, progress) {
    tone(c, { freq: 1500 + progress * 1100, dur: 0.03, vol: 0.05, type: 'square', attack: 0.001 })
  },
  tickEnd(c, tier) {
    bell(c, PENTA[tier === 'none' ? 3 : 5]!, 0, 0.12, 0.6)
    bell(c, PENTA[tier === 'none' ? 5 : 7]!, 0.07, 0.1, 0.7)
  },
}

const FRUIT_RECIPE: Recipe = {
  loop: { hz: 1500, ticks: 12, tonal: 0.9, alt: 0.25, len: 0.022, vol: 0.14 },
  riser: { wave: 'triangle', from: 330, to: 1320, pulseHz: 11, lp: 3200, vol: 0.1 },
  scale: FRUIT_SCALE,
  spinStart(c) {
    tone(c, { freq: 260, slideTo: 620, dur: 0.16, vol: 0.32, type: 'sine', attack: 0.004 })
    noise(c, { dur: 0.14, vol: 0.18, filter: 'bandpass', freq: 900, sweepTo: 2600, q: 1.2 })
  },
  reelStop(c, lift) {
    popVoice(c, 420 * lift, 0, 0.5)
    tone(c, { freq: 1500 * lift, at: 0.02, dur: 0.05, vol: 0.1, type: 'sine', attack: 0.002 })
  },
  winSmall(c, rollup) {
    run(c, popVoice, FRUIT_SCALE, [0, 2, 4], 0.08, 0.5)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 11, vol: 0.1, lo: 900, hi: 1900, voice: 'bubble' })
  },
  winBig(c, tier, rollup) {
    const steps = { big: 6, mega: 8, epic: 9, max: 9 }[tier]
    for (let i = 0; i < steps; i++) popVoice(c, FRUIT_SCALE[i]!, i * 0.065, 0.32)
    const at = steps * 0.065 + 0.05
    chord(c, (cc, f, a, v) => tone(cc, { freq: f, at: a, dur: 0.9, vol: v, type: 'sine', attack: 0.01 }), [523.25, 659.25, 783.99, 1046.5], at, 0.15)
    tone(c, { freq: 180, slideTo: 520, at, dur: 0.18, vol: 0.25, type: 'sine' })
    sparkle(c, { dur: rollup, density: tier === 'big' ? 16 : 24, vol: 0.08, lo: 800, hi: 2300, voice: 'bubble' })
  },
  feature(c) {
    noise(c, { dur: 0.8, vol: 0.18, filter: 'bandpass', freq: 500, sweepTo: 5000, q: 2 })
    tone(c, { freq: 260, dur: 0.8, vol: 0.2, type: 'sine', slideTo: 1040, attack: 0.04 })
    run(c, popVoice, FRUIT_SCALE, [3, 4, 5, 6, 7, 8], 0.07, 0.3)
  },
  mutation(c) {
    run(c, popVoice, FRUIT_SCALE, [6, 8], 0.05, 0.22)
  },
  tick(c, progress) {
    tone(c, { freq: 900 + progress * 800, slideTo: 1400 + progress * 900, dur: 0.045, vol: 0.07, type: 'sine', attack: 0.002 })
  },
  tickEnd(c, tier) {
    run(c, popVoice, FRUIT_SCALE, tier === 'none' ? [2, 4] : [4, 6, 8], 0.06, 0.26)
  },
}

const WESTERN_RECIPE: Recipe = {
  loop: { hz: 950, ticks: 12, tonal: 0.35, alt: 0.2, len: 0.026, vol: 0.2 },
  riser: { wave: 'sawtooth', from: 110, to: 440, pulseHz: 7, lp: 1500, vol: 0.1 },
  scale: WESTERN_SCALE,
  spinStart(c) {
    // 권총 약실이 돌아가는 철커덕 + 낮은 현 한 번
    ;[0, 0.045, 0.09].forEach((at, i) => gearTick(c, at, 0.2, 0.55 + i * 0.05))
    pluckVoice(c, 110, 0.02, 0.4)
  },
  reelStop(c, lift) {
    clack(c, 820 * lift, 0, 0.5)
    tone(c, { freq: 260 * lift, slideTo: 170 * lift, dur: 0.07, vol: 0.4, type: 'triangle', attack: 0.001, lp: 1800, lpTo: 400 })
  },
  winSmall(c, rollup) {
    run(c, pluckVoice, WESTERN_SCALE, [0, 2, 3], 0.09, 0.3)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 9, vol: 0.05, lo: 1800, hi: 3200, voice: 'coin' })
  },
  winBig(c, tier, rollup) {
    gunshot(c, 0, 0.5)
    const steps = { big: 5, mega: 7, epic: 8, max: 9 }[tier]
    for (let i = 0; i < steps; i++) pluckVoice(c, WESTERN_SCALE[i]!, 0.2 + i * 0.07, 0.3)
    const at = 0.2 + steps * 0.07 + 0.05
    chord(c, pluckVoice, [164.81, 246.94, 329.63, 415.3, 493.88], at, 0.28, 0.035)
    if (tier !== 'big') gunshot(c, at + 0.2, 0.4)
    sparkle(c, { dur: rollup, density: tier === 'big' ? 12 : 18, vol: 0.06, lo: 1800, hi: 3400, voice: 'coin' })
  },
  feature(c) {
    gunshot(c, 0, 0.45)
    tone(c, { freq: 110, dur: 0.9, vol: 0.2, type: 'sawtooth', slideTo: 440, attack: 0.05, lp: 1800, lpTo: 600 })
    run(c, pluckVoice, WESTERN_SCALE, [4, 5, 6, 7, 8], 0.07, 0.3)
  },
  mutation(c) {
    ;[0, 0.04, 0.08].forEach((at, i) => bell(c, 2200 + i * 260, at, 0.07, 0.25))
  },
  tick(c, progress) {
    clack(c, 520 + progress * 360, 0, 0.1)
  },
  tickEnd(c, tier) {
    pluckVoice(c, WESTERN_SCALE[tier === 'none' ? 1 : 2]!, 0, 0.3)
    pluckVoice(c, WESTERN_SCALE[tier === 'none' ? 3 : 5]!, 0.08, 0.3)
  },
}

const SHRINE_RECIPE: Recipe = {
  loop: { hz: 1250, ticks: 10, tonal: 0.45, alt: 0.12, len: 0.03, vol: 0.18 },
  riser: { wave: 'sine', from: 160, to: 640, pulseHz: 5, lp: 1800, vol: 0.11 },
  scale: SHRINE_SCALE,
  spinStart(c) {
    clack(c, 900, 0, 0.35)
    clack(c, 1100, 0.07, 0.3)
    tone(c, { freq: 196, at: 0.02, dur: 0.5, vol: 0.14, type: 'sine', attack: 0.01 })
  },
  reelStop(c, lift) {
    tone(c, { freq: 1250 * lift, dur: 0.12, vol: 0.45, type: 'sine', attack: 0.001 })
    tone(c, { freq: 3400 * lift, dur: 0.05, vol: 0.14, type: 'sine', attack: 0.001 })
    noise(c, { dur: 0.02, vol: 0.4, filter: 'bandpass', freq: 2500, q: 3 })
    tone(c, { freq: 420 * lift, slideTo: 330 * lift, at: 0, dur: 0.05, vol: 0.28, type: 'triangle', attack: 0.001 })
  },
  winSmall(c, rollup) {
    templeVoice(c, SHRINE_SCALE[0]! / 2, 0, 0.28)
    run(c, (cc, f, at, v) => bell(cc, f, at, v, 0.6), SHRINE_SCALE, [2, 4], 0.12, 0.14)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 8, vol: 0.05, lo: 3000, hi: 4600, voice: 'suzu' })
  },
  winBig(c, tier, rollup) {
    const strikes = { big: 2, mega: 3, epic: 4, max: 5 }[tier]
    for (let i = 0; i < strikes; i++) templeVoice(c, SHRINE_SCALE[i % 3]! / 2, i * 0.28, 0.3)
    const at = strikes * 0.28
    ;[0, 0.06, 0.12, 0.2].forEach((d) => clack(c, 1000, at + d, 0.3))
    run(c, bellVoice, SHRINE_SCALE, [2, 3, 4, 5, 7, 8], 0.07, 0.16)
    sparkle(c, { dur: rollup, density: tier === 'big' ? 12 : 18, vol: 0.06, lo: 3000, hi: 4800, voice: 'suzu' })
  },
  feature(c) {
    templeVoice(c, SHRINE_SCALE[0]! / 2, 0, 0.36)
    noise(c, { dur: 1.0, vol: 0.14, filter: 'bandpass', freq: 600, sweepTo: 6500, q: 2 })
    sparkle(c, { dur: 1.0, density: 22, vol: 0.07, lo: 3000, hi: 4800, voice: 'suzu' })
    run(c, bellVoice, SHRINE_SCALE, [4, 5, 7, 8], 0.12, 0.16)
  },
  mutation(c) {
    sparkle(c, { dur: 0.3, density: 24, vol: 0.07, lo: 3200, hi: 5000, voice: 'suzu' })
  },
  tick(c, progress) {
    clack(c, 1100 + progress * 500, 0, 0.09)
  },
  tickEnd(c, tier) {
    templeVoice(c, SHRINE_SCALE[tier === 'none' ? 2 : 0]! / (tier === 'none' ? 1 : 2), 0, 0.22)
  },
}

const CLOCK_RECIPE: Recipe = {
  loop: { hz: 3200, ticks: 20, tonal: 0.5, alt: 0.3, len: 0.012, vol: 0.14 },
  riser: { wave: 'square', from: 520, to: 2080, pulseHz: 14, lp: 3600, vol: 0.05 },
  scale: CLOCK_SCALE,
  spinStart(c) {
    for (let i = 0; i < 6; i++) gearTick(c, i * 0.03, 0.14, 0.8 + i * 0.07)
    tone(c, { freq: 330, slideTo: 990, at: 0.02, dur: 0.18, vol: 0.14, type: 'triangle', lp: 2400 })
  },
  reelStop(c, lift) {
    tone(c, { freq: 150 * lift, slideTo: 70, dur: 0.1, vol: 0.45, type: 'square', lp: 900, lpTo: 200 })
    gearTick(c, 0, 0.22, lift)
    glassVoice(c, CLOCK_SCALE[1]! * lift, 0.03, 0.12)
  },
  winSmall(c, rollup) {
    run(c, glassVoice, CLOCK_SCALE, [0, 2, 4], 0.08, 0.2)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 12, vol: 0.05, lo: 3000, hi: 5200, voice: 'glass' })
  },
  winBig(c, tier, rollup) {
    const steps = { big: 6, mega: 8, epic: 9, max: 9 }[tier]
    for (let i = 0; i < steps; i++) glassVoice(c, CLOCK_SCALE[i]!, i * 0.065, 0.2)
    const at = steps * 0.065 + 0.05
    chord(c, glassVoice, [CLOCK_SCALE[0]! / 2, CLOCK_SCALE[2]! / 2, CLOCK_SCALE[4]! / 2, CLOCK_SCALE[0]!], at, 0.18, 0.02)
    for (let i = 0; i < 8; i++) gearTick(c, at + i * 0.035, 0.12, 1 + i * 0.05)
    sparkle(c, { dur: rollup, density: tier === 'big' ? 16 : 24, vol: 0.06, lo: 3000, hi: 5600, voice: 'glass' })
  },
  feature(c) {
    for (let i = 0; i < 16; i++) gearTick(c, i * 0.045, 0.14, 0.7 + i * 0.045)
    tone(c, { freq: 260, dur: 0.9, vol: 0.14, type: 'triangle', slideTo: 1040, attack: 0.05, lp: 3000 })
    run(c, glassVoice, CLOCK_SCALE, [4, 5, 6, 7, 8], 0.07, 0.2)
  },
  mutation(c) {
    gearTick(c, 0, 0.16)
    run(c, glassVoice, CLOCK_SCALE, [6, 8], 0.05, 0.13)
  },
  tick(c, progress) {
    gearTick(c, 0, 0.09, 0.9 + progress * 0.5)
  },
  tickEnd(c, tier) {
    glassVoice(c, CLOCK_SCALE[tier === 'none' ? 3 : 5]!, 0, 0.16)
    glassVoice(c, CLOCK_SCALE[tier === 'none' ? 5 : 8]!, 0.07, 0.14)
  },
}

const RECIPES: Record<SoundPreset, Recipe> = {
  bell: BELL_RECIPE,
  fruit: FRUIT_RECIPE,
  western: WESTERN_RECIPE,
  shrine: SHRINE_RECIPE,
  clockwork: CLOCK_RECIPE,
  // candy-cluster-pop: 사운드 레인이 전용 레시피로 바꾼다. 그때까지 fruit를 빌려 쓴다.
  candy: FRUIT_RECIPE,
}

let preset: SoundPreset = 'bell'
let recipe: Recipe = BELL_RECIPE
const spinLoopBuffers = new Map<SoundPreset, AudioBuffer>()

/** 게임의 소리 세트를 바꾼다. 모르는 값이나 undefined면 기본 `bell`. */
export function setSoundPreset(next: SoundPreset | undefined): void {
  const key: SoundPreset = next !== undefined && next in RECIPES ? next : 'bell'
  if (key === preset) return
  stopSpinLoop()
  stopAnticipation()
  preset = key
  recipe = RECIPES[key]
  if (bgm) tryStartBgm()
}

export function getSoundPreset(): SoundPreset {
  return preset
}

/** 릴 회전 루프용 버퍼: 칸이 지나가는 딸깍 소리를 일정 간격으로 찍은 1초짜리 클립. */
function buildSpinLoopBuffer(c: AudioContext, spec: LoopSpec): AudioBuffer {
  const sr = c.sampleRate
  const buf = c.createBuffer(1, sr, sr)
  const d = buf.getChannelData(0)
  for (let k = 0; k < spec.ticks; k++) {
    const start = Math.floor((k / spec.ticks) * sr)
    const len = Math.floor(sr * spec.len)
    const pitch = 1 + (k % 2) * spec.alt
    for (let i = 0; i < len && start + i < d.length; i++) {
      const env = Math.exp(-i / (len * 0.18))
      const ring = Math.sin((2 * Math.PI * spec.hz * pitch * i) / sr)
      d[start + i] = (ring * spec.tonal + (Math.random() * 2 - 1) * (1 - spec.tonal)) * env * 0.5
    }
  }
  return buf
}

// ── 공개 효과음 ───────────────────────────────────────────

/** 스핀 시작: 레버 당김 + 회전 루프 시작. */
export function playSpinStart(): void {
  riserStep = 0
  if (playOverride('spin')) return
  const c = live()
  if (!c) return
  recipe.spinStart(c)
  startSpinLoop()
}

function startSpinLoop(): void {
  const c = live()
  if (!c || spinLoop) return
  let buffer = spinLoopBuffers.get(preset)
  if (!buffer) {
    buffer = buildSpinLoopBuffer(c, recipe.loop)
    spinLoopBuffers.set(preset, buffer)
  }
  const src = c.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const g = c.createGain()
  const t = c.currentTime
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(recipe.loop.vol, t + 0.12)
  src.connect(g).connect(master!)
  src.start(t + 0.05)
  spinLoop = { src, gain: g }
}

export function stopSpinLoop(): void {
  if (!spinLoop || !ctx) return
  const { src, gain } = spinLoop
  spinLoop = null
  const t = ctx.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setTargetAtTime(0.0001, t, 0.04)
  src.stop(t + 0.25)
}

/** 릴 하나 정지. 릴이 뒤로 갈수록 조금씩 높아진다. 동시 정지(스킵)는 한 번만. */
export function playReelStop(reel: number): void {
  const now = performance.now()
  if (now - lastStopAt < 30) return
  lastStopAt = now
  if (playOverride('stop', 0.8)) return
  const c = live()
  if (!c) return
  recipe.reelStop(c, 1 + reel * 0.06)
}

/**
 * 당첨. 등급이 오를수록 길고 굵어진다.
 * `durationMs`는 렌더러가 알려 준 롤업 길이 — 흩뿌리는 소리를 그 길이에 맞춘다.
 */
export function playWin(tier: WinTier, durationMs: number): void {
  const big = tier !== 'none'
  if (big) duckBgmFor(Math.min(8, durationMs / 1000) + 1)
  if (playOverride(big ? 'bigwin' : 'win')) return
  const c = live()
  if (!c) return
  const rollup = Math.min(6, Math.max(0.4, durationMs / 1000))
  if (tier === 'none') recipe.winSmall(c, rollup)
  else recipe.winBig(c, tier, rollup)
}

/** 프리스핀 등 피처 발동. */
export function playFeature(): void {
  const c = live()
  if (!c) return
  duckBgmFor(1.6)
  recipe.feature(c)
}

/** 심볼 변형(미스터리 공개·확장 와일드 등): 짧은 반짝임. */
export function playMutation(): void {
  const c = live()
  if (!c) return
  recipe.mutation(c)
}

// ── 연쇄·주문 카드 (candy-cluster-pop) ─────────────────────
// 계약만 먼저 고정한 빈 함수다. 소리는 사운드 레인이 채운다(PLAN_candy-cluster-pop.md H10).

/** 연쇄 단계마다의 팝. `step`이 오를수록 음계가 한 칸씩 오른다(0부터). */
export function playCascadePop(_step: number): void {}

/** 사다리 배수가 한 칸 올랐다. `index`는 사다리 칸(0부터). */
export function playLadderUp(_index: number): void {}

/** 지운 칸 위로 사탕이 떨어진다. */
export function playCascadeDrop(): void {}

/** 토큰이 주문 카드에 닿았다. 단계당 1회로 묶어 부른다. */
export function playOrderTick(): void {}

/** 주문 카드 완료 도장. */
export function playOrderComplete(): void {}

/** 주문 카드가 새로 깔린다. */
export function playOrderDeal(): void {}

// ── 기대감 ────────────────────────────────────────────────

/**
 * 기대감 시작: 천천히 오르는 긴장음. 연속된 기대감 릴에서는 끝나자마자 다시 시작되며
 * 시작음이 한 단계씩 높아진다. 스핀 루프는 잠깐 낮춘다.
 */
export function startAnticipation(): void {
  const c = live()
  if (!c || !master) return
  stopAnticipation()
  const spec = recipe.riser
  const lift = 1 + riserStep * 0.18
  riserStep += 1
  const t = c.currentTime
  const osc = c.createOscillator()
  osc.type = spec.wave
  osc.frequency.setValueAtTime(spec.from * lift, t)
  osc.frequency.exponentialRampToValueAtTime(spec.to * lift, t + 1.4)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(spec.lp * 0.4, t)
  lp.frequency.exponentialRampToValueAtTime(spec.lp, t + 1.4)
  const gain = c.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(spec.vol, t + 0.25)
  const lfo = c.createOscillator()
  lfo.frequency.value = spec.pulseHz
  const depth = c.createGain()
  depth.gain.value = spec.vol * 0.45
  lfo.connect(depth).connect(gain.gain)
  osc.connect(lp).connect(gain).connect(master)
  const fifth = c.createOscillator()
  fifth.type = spec.wave
  fifth.frequency.setValueAtTime(spec.from * lift * 1.5, t)
  fifth.frequency.exponentialRampToValueAtTime(spec.to * lift * 1.5, t + 1.4)
  const fifthGain = c.createGain()
  fifthGain.gain.value = 0.4
  fifth.connect(fifthGain).connect(lp)
  const extra: AudioScheduledSourceNode[] = [fifth]
  if (noiseBuffer) {
    const wash = c.createBufferSource()
    wash.buffer = noiseBuffer
    wash.loop = true
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.2
    bp.frequency.setValueAtTime(spec.lp * 0.5, t)
    bp.frequency.exponentialRampToValueAtTime(spec.lp * 2.5, t + 1.4)
    const washGain = c.createGain()
    washGain.gain.setValueAtTime(0.0001, t)
    washGain.gain.exponentialRampToValueAtTime(1.2, t + 1.4)
    wash.connect(bp).connect(washGain).connect(gain)
    wash.start(t)
    extra.push(wash)
  }
  osc.start(t)
  fifth.start(t)
  lfo.start(t)
  riser = { osc, gain, lfo, extra }
  anticipating = true
  refreshDuck()
}

export function stopAnticipation(): void {
  if (anticipating) {
    anticipating = false
    refreshDuck()
  }
  if (!riser || !ctx) return
  const { osc, gain, lfo, extra } = riser
  riser = null
  const t = ctx.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setTargetAtTime(0.0001, t, 0.03)
  osc.stop(t + 0.15)
  lfo.stop(t + 0.15)
  for (const n of extra) n.stop(t + 0.15)
}

// ── 롤업 틱 ───────────────────────────────────────────────

/** 당첨 금액이 올라가는 동안 짧은 틱. 너무 촘촘하지 않게 60ms 이내 재호출은 버린다. */
export function playRollupTick(progress: number): void {
  const now = performance.now()
  if (now - lastTickAt < 60) return
  lastTickAt = now
  const c = live()
  if (!c) return
  recipe.tick(c, Math.min(1, Math.max(0, progress)))
}

/** 롤업이 끝날 때(스킵 포함) 마감음. */
export function playRollupEnd(tier: WinTier): void {
  const c = live()
  if (!c) return
  recipe.tickEnd(c, tier)
}

// ── 버튼음 ────────────────────────────────────────────────

export type UiSoundKind = 'tap' | 'up' | 'down' | 'toggle' | 'open' | 'close'

/** 버튼 클릭. 프리셋과 무관한 아주 작은 UI 소리. */
export function playUiSound(kind: UiSoundKind = 'tap'): void {
  const c = live()
  if (!c) return
  switch (kind) {
    case 'up':
      tone(c, { freq: 880, dur: 0.045, vol: 0.09, type: 'sine', attack: 0.002 })
      tone(c, { freq: 1320, at: 0.03, dur: 0.05, vol: 0.07, type: 'sine', attack: 0.002 })
      break
    case 'down':
      tone(c, { freq: 1320, dur: 0.045, vol: 0.09, type: 'sine', attack: 0.002 })
      tone(c, { freq: 880, at: 0.03, dur: 0.05, vol: 0.07, type: 'sine', attack: 0.002 })
      break
    case 'toggle':
      tone(c, { freq: 1100, dur: 0.04, vol: 0.09, type: 'triangle', attack: 0.002 })
      noise(c, { dur: 0.015, vol: 0.05, filter: 'highpass', freq: 5000 })
      break
    case 'open':
      tone(c, { freq: 520, slideTo: 780, dur: 0.09, vol: 0.08, type: 'sine', attack: 0.004 })
      break
    case 'close':
      tone(c, { freq: 780, slideTo: 520, dur: 0.08, vol: 0.07, type: 'sine', attack: 0.004 })
      break
    default:
      tone(c, { freq: 1000, dur: 0.035, vol: 0.08, type: 'triangle', attack: 0.002 })
      noise(c, { dur: 0.012, vol: 0.04, filter: 'highpass', freq: 4500 })
  }
}

// ── 배경음악 ──────────────────────────────────────────────

/**
 * 게임 화면에서만 도는 배경음악. 효과음 아래 자기 버스(bgmDuck → bgmBus → 컴프레서)로 흐른다.
 * 큰 당첨·피처·기대감 동안은 6dB 낮추고(덕킹), 프리스핀 전환 커튼 동안은 더 낮췄다가 프리스핀이면 밝은 변주로 돌아온다.
 * 컨텍스트가 아직 잠겨 있으면 원하는 상태만 적어 두고 첫 제스처에서 시작한다.
 */

const BGM_GAIN = 0.5
const BGM_DUCK = 0.5
const BGM_DIP = 0.2
const BGM_TICK_MS = 50
const BGM_LOOKAHEAD = 0.3

let bgmEnabled = true
let bgmVolume = 0.4
let bgmWanted = false
let bgmVariant: BgmVariant = 'base'
let bgm: { preset: SoundPreset; voices: BgmVoices; seq: BgmSequencer; timer: ReturnType<typeof setInterval> } | null = null
let anticipating = false
let curtain = false
let duckUntil = 0
let duckTimer: ReturnType<typeof setTimeout> | null = null

function bgmLevel(): number {
  return muted || !bgmEnabled ? 0 : BGM_GAIN * bgmVolume
}

function applyBgmLevel(): void {
  if (bgmBus && ctx) bgmBus.gain.setTargetAtTime(bgmLevel(), ctx.currentTime, 0.05)
}

export function setBgmEnabled(on: boolean): void {
  bgmEnabled = on
  applyBgmLevel()
  if (on) tryStartBgm()
  else stopBgmSession(0.4)
}

export function isBgmEnabled(): boolean {
  return bgmEnabled
}

/** 배경음악 음량 0..100. 효과음 음량과 따로 기억된다. */
export function setBgmVolume(percent: number): void {
  const clamped = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 40
  bgmVolume = clamped / 100
  applyBgmLevel()
}

export function getBgmVolume(): number {
  return Math.round(bgmVolume * 100)
}

/** 게임 화면이 열리면 부른다. 지금 프리셋의 곡을 튼다(아직 잠겨 있으면 풀리는 대로). */
export function startBgm(): void {
  bgmWanted = true
  tryStartBgm()
}

/** 게임을 떠날 때. 로비는 조용하다. */
export function stopBgm(): void {
  bgmWanted = false
  bgmVariant = 'base'
  curtain = false
  refreshDuck()
  stopBgmSession(0.6)
}

export function isBgmPlaying(): boolean {
  return bgm !== null
}

/** 기본 게임 / 프리스핀. 프리스핀은 같은 곡의 밝은 변주(조금 빠르고, 아르페지오가 높고, 타악이 하나 더). 다음 마디부터 바뀐다. */
export function setBgmMode(mode: 'base' | 'freeSpins'): void {
  bgmVariant = mode === 'freeSpins' ? 'free' : 'base'
  if (!bgm || !ctx) return
  bgm.seq.setVariant(bgmVariant)
  bgm.voices.setBright(bgmVariant === 'free', ctx.currentTime)
}

/** 모드 전환 커튼: 시작하면 음악을 깊게 낮추고, 끝나면 도착한 모드의 변주로 되살린다. */
export function bgmModeTransition(to: 'base' | 'freeSpins', phase: 'start' | 'end'): void {
  curtain = phase === 'start'
  if (phase === 'end') setBgmMode(to)
  refreshDuck()
}

function tryStartBgm(): void {
  if (!bgmWanted || !bgmEnabled || muted || !ctx || !bgmDuck || ctx.state !== 'running') return
  if (typeof document !== 'undefined' && document.hidden) return
  if (bgm && bgm.preset === preset) return
  stopBgmSession(0.5)
  const c = ctx
  const t = c.currentTime
  const voices = createBgmVoices(c, preset, bgmDuck)
  voices.output.gain.setValueAtTime(0, t)
  voices.output.gain.linearRampToValueAtTime(1, t + 2)
  voices.setBright(bgmVariant === 'free', t)
  const seq = new BgmSequencer(BGM_STYLES[preset], {
    lookahead: BGM_LOOKAHEAD,
    onNote: (note, time, spb) => voices.play(note, time, spb),
  })
  seq.setVariant(bgmVariant)
  seq.start(t + 0.1)
  seq.pump(t)
  const timer = setInterval(() => seq.pump(c.currentTime), BGM_TICK_MS)
  bgm = { preset, voices, seq, timer }
}

function stopBgmSession(fade: number): void {
  if (!bgm) return
  const { voices, timer } = bgm
  bgm = null
  clearInterval(timer)
  if (!ctx || fade <= 0) {
    voices.dispose()
    return
  }
  const t = ctx.currentTime
  voices.output.gain.cancelScheduledValues(t)
  voices.output.gain.setTargetAtTime(0, t, fade / 4)
  setTimeout(() => voices.dispose(), fade * 1000 + 200)
}

function duckBgmFor(seconds: number): void {
  if (!ctx) return
  duckUntil = Math.max(duckUntil, ctx.currentTime + seconds)
  refreshDuck()
}

function refreshDuck(): void {
  if (!ctx || !bgmDuck) return
  const now = ctx.currentTime
  const target = curtain ? BGM_DIP : anticipating || now < duckUntil ? BGM_DUCK : 1
  const g = bgmDuck.gain
  g.cancelScheduledValues(now)
  g.setTargetAtTime(target, now, target < g.value ? 0.06 : 0.5)
  if (duckTimer !== null) clearTimeout(duckTimer)
  duckTimer = now < duckUntil ? setTimeout(refreshDuck, (duckUntil - now) * 1000 + 20) : null
}
