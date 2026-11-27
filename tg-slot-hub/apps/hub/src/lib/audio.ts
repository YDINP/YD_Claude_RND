/**
 * 슬롯 효과음. 에셋 파일 없이 Web Audio로 그 자리에서 합성한다.
 * 테마가 `sfx` URL을 주면(spin/stop/win/bigwin) 그 파일이 같은 키의 합성음을 대신한다.
 * 테마의 `sound.preset`은 합성 레시피 표를 통째로 갈아 끼운다(`setSoundPreset`) — 없으면 `bell`.
 *
 * AudioContext는 첫 사용자 제스처에서 만든다(iOS/텔레그램 웹뷰 자동재생 정책).
 * 그 전에 온 재생 요청은 조용히 버린다 — 스핀은 늘 버튼 탭으로 시작하므로 놓칠 일이 없다.
 */
import type { WinTier } from '@tgslot/renderer'
import { BGM_STYLES, BgmSequencer, type AudioPreset, type BgmVariant } from './bgm'
import { createBgmVoices, type BgmVoices } from './bgmVoices'
import { createDeepseaAudio, type TreasureSize } from './audioDeepsea'
import { createForgeAudio } from './audioForge'
import { createGardenAudio, type BloomTier } from './audioGarden'

type SfxKey = 'spin' | 'stop' | 'win' | 'bigwin'

let muted = false
let sfxVolume = 1
let ctx: AudioContext | null = null
let master: GainNode | null = null
let bgmBus: GainNode | null = null
let bgmDuck: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null
let spinLoop: { src: AudioBufferSourceNode; gain: GainNode } | null = null
let riser: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null
let countUp: { bus: GainNode; timer: ReturnType<typeof setTimeout> } | null = null
let riserStep = 0
let riserExtraStop: (() => void) | null = null
let lastStopAt = 0
let lastTickAt = 0
/** 지금 소리를 몇 초 뒤로 예약할지. `playCountUp`처럼 한꺼번에 여러 소리를 미리 깔 때만 잠깐 0이 아니다. */
let sched = 0
/** 값이 있으면 `tone`/`noise`가 마스터 대신 이 노드로 보낸다(미리 깔아 둔 소리를 한 번에 끊기 위해). */
let busOverride: AudioNode | null = null
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
    stopCountUp()
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

export interface ToneOpts {
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
  const t = c.currentTime + sched + (o.at ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'triangle'
  osc.frequency.setValueAtTime(o.freq, t)
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + o.dur)
  const a = o.attack ?? 0.004
  // 자동화가 시작하기 전 한 샘플이 기본값 1로 새지 않게 먼저 0으로 눌러 둔다(사각파·잡음의 첫 샘플 클릭).
  g.gain.value = 0
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  const out = o.out ?? busOverride ?? master!
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
  const t = c.currentTime + sched + (o.at ?? 0)
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  const f = c.createBiquadFilter()
  f.type = o.filter
  f.frequency.setValueAtTime(o.freq, t)
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur)
  f.Q.value = o.q ?? 1
  const g = c.createGain()
  g.gain.value = 0
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
  src.connect(f).connect(g).connect(busOverride ?? master!)
  src.start(t, Math.random() * 0.5)
  src.stop(t + o.dur + 0.02)
}

// ── 목소리(음색) ──────────────────────────────────────────

export type Voice = (c: AudioContext, freq: number, at: number, vol: number) => void

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
  const t = c.currentTime + sched + at
  const osc = c.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(f, t)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.8
  lp.frequency.setValueAtTime(Math.min(9000, f * 10), t)
  lp.frequency.setTargetAtTime(f * 1.2, t + 0.004, 0.05)
  const g = c.createGain()
  g.gain.value = 0
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol * 0.75, t + 0.002)
  g.gain.setTargetAtTime(0.0001, t + 0.002, ring)
  osc.connect(lp).connect(g).connect(busOverride ?? master!)
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

// ── 총성 (서부) ───────────────────────────────────────────
// 녹음 샘플(`audioSamples.ts`, Freesound CC0)이 있으면 그것을 쓰고, 아직 못 불러왔거나 실패하면
// 계산으로 만든 합성 총성(1~3 ms 크랙 + 짧은 폭발 + 140→50 Hz 몸통 + 120/260 ms 반사음)으로 대신한다.

const GUNSHOT_SAMPLE_GAIN = 0.8
let gunLoad: Promise<void> | null = null
let gunSample: { data: Float32Array; rate: number } | null = null
let gunBuffer: { ctx: AudioContext; buffer: AudioBuffer; real: boolean } | null = null

/** western 프리셋이 걸리면 총성 녹음을 별도 청크로 풀어 둔다. 다른 프리셋으로 가면 `releaseGunshot`이 버린다. */
function warmGunshot(): void {
  if (gunLoad) return
  const load: Promise<void> = import('./audioSamples')
    .then((m) => {
      if (gunLoad === load) gunSample = m.decodeGunshot()
    })
    .catch(() => undefined)
  gunLoad = load
}

function releaseGunshot(): void {
  gunLoad = null
  gunSample = null
  gunBuffer = null
}

/** 총성 녹음이 풀려 있으면 true. western 프리셋에서만 그렇다(테스트·점검용). */
export function hasGunshotSample(): boolean {
  return gunSample !== null
}

/** 합성 총성 버퍼. 난수는 매번 달라도 되지만 한 번 만든 것을 재사용한다. */
function synthGunshotBuffer(c: AudioContext): AudioBuffer {
  const sr = c.sampleRate
  const len = Math.floor(sr * 0.9)
  const buf = c.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  const blast = new Float32Array(len)
  let lp = 0
  for (let i = 0; i < len; i++) {
    const t = i / sr
    const white = Math.random() * 2 - 1
    lp += 0.3 * (white - lp)
    const crack = white * Math.exp(-t / 0.0018)
    blast[i] = lp * Math.exp(-t / 0.028)
    const body = Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t / 0.05)) * t) * Math.exp(-t / 0.07)
    d[i] = crack * 0.9 + blast[i]! * 1.1 + body * 0.7
  }
  for (const [delay, level] of [[0.12, 0.3], [0.26, 0.16]] as const) {
    const off = Math.floor(sr * delay)
    for (let i = off; i < len; i++) d[i] = d[i]! + blast[i - off]! * level * 0.8
  }
  let tail = 0
  for (let i = 0; i < len; i++) {
    tail += 0.05 * (Math.random() * 2 - 1 - tail)
    d[i] = d[i]! + tail * Math.exp(-(i / sr) / 0.25) * 0.5
  }
  let peak = 1e-6
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]!))
  for (let i = 0; i < len; i++) d[i] = (d[i]! / peak) * 0.9
  return buf
}

function gunshotBuffer(c: AudioContext): AudioBuffer {
  if (gunBuffer && gunBuffer.ctx === c && (gunBuffer.real || !gunSample)) return gunBuffer.buffer
  if (gunSample) {
    const buffer = c.createBuffer(1, gunSample.data.length, gunSample.rate)
    buffer.getChannelData(0).set(gunSample.data)
    gunBuffer = { ctx: c, buffer, real: true }
  } else {
    gunBuffer = { ctx: c, buffer: synthGunshotBuffer(c), real: false }
  }
  return gunBuffer.buffer
}

/** 총성 한 발. `rate`로 음정을 살짝 바꿔 두 번째 발이 같은 소리로 겹치지 않게 한다. */
function gunshot(c: AudioContext, at: number, vol: number, rate = 1): void {
  const src = c.createBufferSource()
  src.buffer = gunshotBuffer(c)
  src.playbackRate.value = rate
  const g = c.createGain()
  g.gain.value = vol * GUNSHOT_SAMPLE_GAIN * 2
  src.connect(g).connect(busOverride ?? master!)
  src.start(c.currentTime + sched + at)
}

/** 톱니바퀴가 한 칸 넘어가는 소리. */
function gearTick(c: AudioContext, at: number, vol: number, pitch = 1): void {
  tone(c, { freq: 2600 * pitch, slideTo: 1500 * pitch, at, dur: 0.018, vol, type: 'square', attack: 0.001 })
  noise(c, { at, dur: 0.012, vol: vol * 0.6, filter: 'highpass', freq: 4500 })
}

/** 카드 뒤집기(미스터리 공개): 종이 쓸림 + 톡 + 시안빛 유리 반짝임. bell·royal 의 변형은 미스터리뿐이라 종류 구분이 없다. */
function revealFlip(c: AudioContext): void {
  noise(c, { dur: 0.1, vol: 0.2, filter: 'bandpass', freq: 1500, sweepTo: 6500, q: 1.1 })
  noise(c, { at: 0.09, dur: 0.014, vol: 0.22, filter: 'bandpass', freq: 3200, q: 2 })
  tone(c, { freq: 190, slideTo: 120, at: 0.09, dur: 0.06, vol: 0.2, type: 'triangle', attack: 0.002 })
  ;[3136, 3951, 4699].forEach((f, i) => glassVoice(c, f, 0.12 + i * 0.045, 0.07))
  noise(c, { at: 0.12, dur: 0.3, vol: 0.05, filter: 'highpass', freq: 7000 })
}

/** 브라스 한 방: 톱니 둘이 살짝 어긋나 열리며 울린다(혼 섹션 스탭). */
function brassHit(c: AudioContext, freq: number, at: number, vol: number, dur = 0.35): void {
  tone(c, { freq, at, dur, vol, type: 'sawtooth', attack: 0.02, lp: freq * 6, lpTo: freq * 2 })
  tone(c, { freq: freq * 1.006, at, dur: dur * 0.9, vol: vol * 0.7, type: 'sawtooth', attack: 0.025, lp: freq * 5, lpTo: freq * 1.8 })
}

/** 팀파니 한 방: 떨어지는 저음 사인 + 가죽 치는 짧은 잡음. */
function timpani(c: AudioContext, at: number, vol: number, freq = 98): void {
  tone(c, { freq: freq * 1.5, slideTo: freq, at, dur: 0.5, vol, type: 'sine', attack: 0.003 })
  noise(c, { at, dur: 0.04, vol: vol * 0.5, filter: 'lowpass', freq: 700, q: 0.8 })
}

/** 스네어 롤: 촘촘한 대역 잡음. 간격이 줄고 커진다. */
function snareRoll(c: AudioContext, at: number, dur: number, vol: number): void {
  let t = 0
  let gap = 0.07
  while (t < dur) {
    noise(c, { at: at + t, dur: 0.04, vol: vol * (0.5 + 0.5 * (t / dur)), filter: 'bandpass', freq: 1900, q: 0.9 })
    t += gap
    gap = Math.max(0.03, gap * 0.9)
  }
}

/** 심벌: 길게 번지는 고역 잡음. */
function cymbal(c: AudioContext, at: number, dur: number, vol: number): void {
  noise(c, { at, dur, vol, filter: 'highpass', freq: 6500, q: 0.7 })
  noise(c, { at, dur: dur * 0.6, vol: vol * 0.5, filter: 'bandpass', freq: 9500, q: 1.5 })
}

/** 금속 동전 한 닢: 비정수 배음 셋이 짧게 울린다. */
function coinPing(c: AudioContext, at: number, vol: number, base = 2600, ring = 0.2): void {
  tone(c, { freq: base, at, dur: ring, vol, type: 'sine', attack: 0.001 })
  tone(c, { freq: base * 1.52, at, dur: ring * 0.6, vol: vol * 0.55, type: 'sine', attack: 0.001 })
  tone(c, { freq: base * 2.43, at, dur: ring * 0.3, vol: vol * 0.3, type: 'sine', attack: 0.001 })
}

/** 톡톡 터지는 알갱이(팝핑 캔디). 고역 잡음 한 번이 짧게 흩어진다. */
function crackle(c: AudioContext, dur: number, density: number, vol: number, from = 0): void {
  const count = Math.min(70, Math.round(dur * density))
  for (let i = 0; i < count; i++) {
    noise(c, {
      at: from + Math.random() * dur,
      dur: 0.012,
      vol: vol * (0.4 + Math.random() * 0.6),
      filter: 'highpass',
      freq: 5200 + Math.random() * 3200,
      q: 0.7,
    })
  }
}

/** 이어지는 잡음 한 줄(필터 + 게인). 끊을 수 있는 긴 소리용이라 노드를 돌려준다. */
function noiseLoop(c: AudioContext, out: AudioNode, filter: BiquadFilterType, freq: number, q: number, vol: number) {
  if (!noiseBuffer) return null
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  f.Q.value = q
  const g = c.createGain()
  g.gain.value = vol
  src.connect(f).connect(g).connect(out)
  src.start(c.currentTime)
  return { src, f, g }
}

interface RiseOpts {
  type: OscillatorType
  from: number
  to: number
  vol: number
  lp?: number
  /** 위로 훑는 잡음 띠. */
  wash?: { filter: BiquadFilterType; f0: number; f1: number; q: number; vol: number }
}

/** 기대감 소리가 "오르고 있다"로 읽히게 하는 가는 스윕 한 줄(+ 잡음 띠). 프리셋 고유 소리 밑에 깐다. */
function sweepRise(c: AudioContext, bus: AudioNode, lift: number, o: RiseOpts): AudioScheduledSourceNode[] {
  const t = c.currentTime
  const secs = 1.5
  const osc = c.createOscillator()
  osc.type = o.type
  osc.frequency.setValueAtTime(o.from * lift, t)
  osc.frequency.exponentialRampToValueAtTime(o.to * lift, t + secs)
  const g = c.createGain()
  g.gain.value = 0
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(o.vol, t + 0.35)
  if (o.lp) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.setValueAtTime(o.lp * 0.4, t)
    f.frequency.exponentialRampToValueAtTime(o.lp, t + secs)
    osc.connect(f).connect(g)
  } else {
    osc.connect(g)
  }
  g.connect(bus)
  osc.start(t)
  const nodes: AudioScheduledSourceNode[] = [osc]
  if (o.wash && noiseBuffer) {
    const src = c.createBufferSource()
    src.buffer = noiseBuffer
    src.loop = true
    const bp = c.createBiquadFilter()
    bp.type = o.wash.filter
    bp.Q.value = o.wash.q
    bp.frequency.setValueAtTime(o.wash.f0, t)
    bp.frequency.exponentialRampToValueAtTime(o.wash.f1, t + secs)
    const wg = c.createGain()
    wg.gain.value = 0
    wg.gain.setValueAtTime(0.0001, t)
    wg.gain.exponentialRampToValueAtTime(o.wash.vol, t + secs)
    src.connect(bp).connect(wg).connect(bus)
    src.start(t)
    nodes.push(src)
  }
  return nodes
}

interface SparkleOpts {
  dur: number
  density: number
  vol: number
  lo: number
  hi: number
  voice: 'coin' | 'bubble' | 'suzu' | 'glass' | 'spark'
  /** 흩뿌리기 시작을 몇 초 늦출지. 앞소리(총성 등)를 가리지 않으려고 쓴다. */
  from?: number
}

/** 당첨 동안 흩뿌리는 작은 소리들. 프리셋마다 동전/거품/방울/유리다. */
function sparkle(c: AudioContext, o: SparkleOpts): void {
  const count = Math.min(60, Math.round(o.dur * o.density))
  for (let i = 0; i < count; i++) {
    const at = (o.from ?? 0) + (i / count) * o.dur + Math.random() * 0.05
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
    } else if (o.voice === 'spark') {
      tone(c, { freq: f, at, dur: 0.06, vol: v * 0.7, type: 'square', attack: 0.001, lp: f * 2.2, lpTo: f * 0.8 })
    } else {
      tone(c, { freq: f, at, dur: 0.12, vol: v, type: 'sine' })
      tone(c, { freq: f * 1.5, at: at + 0.01, dur: 0.08, vol: v * 0.4, type: 'sine' })
    }
  }
}

/** 한 음계를 일정 간격으로 훑는다. */
function run(c: AudioContext, voice: Voice, scale: readonly number[], notes: readonly number[], step: number, vol: number, from = 0): void {
  notes.forEach((n, i) => voice(c, scale[n]!, from + i * step, vol))
}

/** 화음을 `strum`초 간격으로 쓸어내린다(기타) 또는 동시에 친다(strum=0). */
function chord(c: AudioContext, voice: Voice, freqs: readonly number[], at: number, vol: number, strum = 0): void {
  freqs.forEach((f, i) => voice(c, f, at + i * strum, vol))
}

// ── 레시피 표 ─────────────────────────────────────────────

export interface LoopSpec {
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

export interface RiserSpec {
  wave: OscillatorType
  from: number
  to: number
  /** 떨림(펄스) 속도. 긴장감을 만든다. */
  pulseHz: number
  lp: number
  vol: number
}

/** 심볼 변형 종류. `playMutation`이 프리셋 레시피에 알려 준다(없으면 기본 소리). */
export type MutationKind = 'mystery' | 'expandWild' | 'upgrade' | 'randomWild'

export interface Recipe {
  loop: LoopSpec
  riser: RiserSpec
  scale: readonly number[]
  /**
   * 기대감을 단순한 소리 스윕(`riser`) 말고 프리셋 고유 소리로 낸다. `bus`로 보내고, 끊을 수 있는 긴 소리 노드를 돌려준다.
   * 이 함수 안에서 `tone`/`noise`로 깐 짧은 소리는 `bus`째로 끊긴다(`busOverride`).
   */
  anticipate?(c: AudioContext, lift: number, bus: GainNode): AudioScheduledSourceNode[]
  spinStart(c: AudioContext): void
  reelStop(c: AudioContext, lift: number): void
  winSmall(c: AudioContext, rollup: number): void
  winBig(c: AudioContext, tier: Exclude<WinTier, 'none'>, rollup: number): void
  feature(c: AudioContext): void
  mutation(c: AudioContext, kind?: MutationKind): void
  /** 롤업 중 틱. `progress`는 0..1. */
  tick(c: AudioContext, progress: number): void
  tickEnd(c: AudioContext, tier: WinTier): void
  /** 더블업: 동전을 던진다 / 맞혔다 / 틀렸다. */
  gambleToss(c: AudioContext): void
  gambleWin(c: AudioContext): void
  gambleLose(c: AudioContext): void
  /** 기대감 상승음에 한 겹 더 얹는다(예: 징 저음). 돌려준 소스는 기대감이 끝날 때 함께 멈춘다. `out`은 상승음 공용 게인이다. */
  riserLayer?(c: AudioContext, t: number, out: AudioNode): AudioScheduledSourceNode[]
  /** 기대감 상승음에 겹치는 소리. 돌려주는 함수가 기대감이 끝날 때 불려 남은 소리를 거둔다. */
  riserExtra?(c: AudioContext): () => void
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
    revealFlip(c)
  },
  tick(c, progress) {
    tone(c, { freq: 1500 + progress * 1100, dur: 0.03, vol: 0.05, type: 'square', attack: 0.001 })
  },
  tickEnd(c, tier) {
    bell(c, PENTA[tier === 'none' ? 3 : 5]!, 0, 0.12, 0.6)
    bell(c, PENTA[tier === 'none' ? 5 : 7]!, 0.07, 0.1, 0.7)
  },
  gambleToss(c) {
    noise(c, { dur: 0.05, vol: 0.15, filter: 'bandpass', freq: 2500, q: 2 })
    coinPing(c, 0.02, 0.16, 2800, 0.5)
    tone(c, { freq: 1200, slideTo: 3000, at: 0.03, dur: 0.3, vol: 0.05, type: 'sine', attack: 0.01 })
  },
  gambleWin(c) {
    bell(c, PENTA[5]!, 0, 0.2, 0.7)
    bell(c, PENTA[8]!, 0.1, 0.22, 0.9)
    sparkle(c, { dur: 0.5, density: 14, vol: 0.05, lo: 2400, hi: 4200, voice: 'coin' })
  },
  gambleLose(c) {
    bell(c, 196, 0, 0.18, 0.5)
    tone(c, { freq: 130, slideTo: 82, dur: 0.3, vol: 0.28, type: 'triangle', attack: 0.004, lp: 700, lpTo: 200 })
  },
}

const FRUIT_RECIPE: Recipe = {
  loop: { hz: 1500, ticks: 12, tonal: 0.9, alt: 0.25, len: 0.022, vol: 0.14 },
  riser: { wave: 'triangle', from: 330, to: 1320, pulseHz: 11, lp: 3200, vol: 0.1 },
  scale: FRUIT_SCALE,
  anticipate(c, lift, bus) {
    // 거품 사다리: 간격이 좁아지며 음이 올라가는 방울들 + 가는 사인 스윕
    let at = 0
    let gap = 0.2
    let f = 420 * lift
    while (at < 3.4) {
      tone(c, { freq: f * 0.7, slideTo: f * 1.25, at, dur: 0.07, vol: 0.17 + Math.min(0.12, at * 0.05), type: 'sine', attack: 0.002 })
      at += gap
      gap = Math.max(0.06, gap * 0.9)
      f = Math.min(2400, f * 1.07)
    }
    return sweepRise(c, bus, lift, {
      type: 'triangle',
      from: 330,
      to: 1320,
      vol: 0.08,
      lp: 3200,
      wash: { filter: 'bandpass', f0: 500, f1: 3500, q: 1.2, vol: 0.09 },
    })
  },
  spinStart(c) {
    tone(c, { freq: 260, slideTo: 620, dur: 0.16, vol: 0.32, type: 'sine', attack: 0.004 })
    noise(c, { dur: 0.14, vol: 0.18, filter: 'bandpass', freq: 900, sweepTo: 2600, q: 1.2 })
  },
  reelStop(c, lift) {
    popVoice(c, 420 * lift, 0, 0.5)
    tone(c, { freq: 1500 * lift, at: 0.02, dur: 0.05, vol: 0.1, type: 'sine', attack: 0.002 })
  },
  winSmall(c, rollup) {
    run(c, popVoice, FRUIT_SCALE, [0, 2, 4], 0.08, 0.7)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 11, vol: 0.13, lo: 900, hi: 1900, voice: 'bubble' })
  },
  winBig(c, tier, rollup) {
    const steps = { big: 6, mega: 8, epic: 9, max: 9 }[tier]
    for (let i = 0; i < steps; i++) popVoice(c, FRUIT_SCALE[i]!, i * 0.065, 0.45)
    const at = steps * 0.065 + 0.05
    chord(c, (cc, f, a, v) => tone(cc, { freq: f, at: a, dur: 0.9, vol: v, type: 'sine', attack: 0.01 }), [523.25, 659.25, 783.99, 1046.5], at, 0.21)
    tone(c, { freq: 180, slideTo: 520, at, dur: 0.18, vol: 0.32, type: 'sine' })
    sparkle(c, { dur: rollup, density: tier === 'big' ? 16 : 24, vol: 0.08, lo: 800, hi: 2300, voice: 'bubble' })
  },
  feature(c) {
    noise(c, { dur: 0.8, vol: 0.18, filter: 'bandpass', freq: 500, sweepTo: 5000, q: 2 })
    tone(c, { freq: 260, dur: 0.8, vol: 0.26, type: 'sine', slideTo: 1040, attack: 0.04 })
    run(c, popVoice, FRUIT_SCALE, [3, 4, 5, 6, 7, 8], 0.07, 0.4)
  },
  mutation(c) {
    run(c, popVoice, FRUIT_SCALE, [4, 6, 8], 0.05, 0.3)
    sparkle(c, { dur: 0.3, density: 14, vol: 0.08, lo: 1200, hi: 2400, voice: 'bubble' })
  },
  tick(c, progress) {
    tone(c, { freq: 900 + progress * 800, slideTo: 1400 + progress * 900, dur: 0.045, vol: 0.07, type: 'sine', attack: 0.002 })
    noise(c, { dur: 0.012, vol: 0.05, filter: 'highpass', freq: 5000 })
  },
  tickEnd(c, tier) {
    run(c, popVoice, FRUIT_SCALE, tier === 'none' ? [2, 4] : [4, 6, 8], 0.06, 0.26)
  },
  gambleToss(c) {
    popVoice(c, 520, 0, 0.35)
    popVoice(c, 860, 0.07, 0.3)
    coinPing(c, 0.12, 0.06, 3200, 0.3)
  },
  gambleWin(c) {
    run(c, popVoice, FRUIT_SCALE, [3, 5, 7], 0.07, 0.4)
    sparkle(c, { dur: 0.5, density: 14, vol: 0.08, lo: 900, hi: 2300, voice: 'bubble' })
  },
  gambleLose(c) {
    tone(c, { freq: 520, slideTo: 150, dur: 0.28, vol: 0.4, type: 'sine', attack: 0.004 })
    popVoice(c, 200, 0.2, 0.25)
  },
}

/** 캔디: 장조 펜타토닉 2옥타브(G5~E7). 연쇄 팝이 한 단계마다 한 칸씩 오른다. */
const CANDY_SCALE = [783.99, 880, 987.77, 1174.66, 1318.51, 1567.98, 1760, 1975.53, 2349.32, 2637.02]

/** 사탕 팝: fruit 보다 짧고 높은 사인 한 방울. 위로 튀는 글라이드 + 아주 짧은 반짝임. */
const candyPopVoice: Voice = (c, f, at, vol) => {
  tone(c, { freq: f * 0.85, slideTo: f * 1.12, at, dur: 0.055, vol, type: 'sine', attack: 0.001 })
  tone(c, { freq: f * 2.01, at: at + 0.006, dur: 0.03, vol: vol * 0.25, type: 'sine', attack: 0.001 })
  noise(c, { at, dur: 0.01, vol: vol * 0.12, filter: 'bandpass', freq: 5200, q: 1.5 })
}

/** 글로켄슈필: 금속 막대. 비정수 배음 두 개가 빠르게 사라진다. */
const glockVoice: Voice = (c, f, at, vol) => {
  tone(c, { freq: f, at, dur: 0.55, vol, type: 'sine', attack: 0.001 })
  tone(c, { freq: f * 2.76, at, dur: 0.18, vol: vol * 0.4, type: 'sine', attack: 0.001 })
  tone(c, { freq: f * 5.4, at, dur: 0.07, vol: vol * 0.2, type: 'sine', attack: 0.001 })
}

/** 마림바: 둥근 나무 울림 + 4배쯤의 짧은 배음 + 채 한 번. */
const marimbaVoice: Voice = (c, f, at, vol) => {
  tone(c, { freq: f, at, dur: 0.22, vol, type: 'sine', attack: 0.001 })
  tone(c, { freq: f * 3.93, at, dur: 0.05, vol: vol * 0.3, type: 'sine', attack: 0.001 })
  noise(c, { at, dur: 0.012, vol: vol * 0.25, filter: 'bandpass', freq: 2400, q: 1.2 })
}

/** 사탕 신스 플럭: 톱니+사각이 살짝 어긋나고 필터가 빠르게 닫힌다. 말렛·종과 다른 전자 알갱이 소리. */
const candyPluckVoice: Voice = (c, f, at, vol) => {
  tone(c, { freq: f, at, dur: 0.2, vol: vol * 0.7, type: 'sawtooth', attack: 0.002, lp: Math.min(6000, f * 7), lpTo: f * 1.4 })
  tone(c, { freq: f * 1.005, at, dur: 0.14, vol: vol * 0.45, type: 'square', attack: 0.002, lp: Math.min(5000, f * 5), lpTo: f * 1.3 })
}

const CANDY_RECIPE: Recipe = {
  loop: { hz: 2600, ticks: 14, tonal: 0.3, alt: 0.45, len: 0.011, vol: 0.12 },
  riser: { wave: 'triangle', from: 392, to: 1568, pulseHz: 13, lp: 3800, vol: 0.09 },
  scale: CANDY_SCALE,
  anticipate(c, lift, bus) {
    // 사탕 계단: 펜타토닉을 한 칸씩 오르는 플럭. 간격이 좁아지고 꼭대기에서 두 음이 번갈아 뛴다.
    let at = 0
    let gap = 0.17
    let i = 0
    while (at < 3.4) {
      const n = i < 9 ? i : 8 + (i % 2)
      candyPluckVoice(c, CANDY_SCALE[n]! * 0.5 * lift, at, 0.07 + Math.min(0.06, i * 0.006))
      at += gap
      gap = Math.max(0.08, gap * 0.93)
      i++
    }
    crackle(c, 3.2, 9, 0.03)
    return sweepRise(c, bus, lift, {
      type: 'square',
      from: 262,
      to: 1046,
      vol: 0.07,
      lp: 3000,
      wash: { filter: 'highpass', f0: 2500, f1: 9000, q: 0.7, vol: 0.09 },
    })
  },
  spinStart(c) {
    // 뽑기 손잡이: 짧은 삐 소리 세 번이 올라가고 반짝임이 흩어진다.
    ;[700, 940, 1250].forEach((f, i) => tone(c, { freq: f, at: i * 0.045, dur: 0.03, vol: 0.1, type: 'square', attack: 0.001, lp: 4200, lpTo: 2200 }))
    noise(c, { at: 0.02, dur: 0.1, vol: 0.12, filter: 'highpass', freq: 5000 })
  },
  reelStop(c, lift) {
    marimbaVoice(c, 330 * lift, 0, 0.55)
    noise(c, { dur: 0.02, vol: 0.2, filter: 'bandpass', freq: 1800, q: 1.2 })
  },
  winSmall(c, rollup) {
    run(c, candyPluckVoice, CANDY_SCALE, [2, 4, 6, 8], 0.055, 0.3)
    crackle(c, Math.min(rollup, 1.2), 14, 0.14, 0.08)
  },
  winBig(c, tier, rollup) {
    const steps = { big: 6, mega: 8, epic: 9, max: 9 }[tier]
    for (let i = 0; i < steps; i++) candyPluckVoice(c, CANDY_SCALE[i]!, i * 0.05, 0.3)
    const at = steps * 0.05 + 0.05
    for (const f of [392, 493.88, 587.33, 783.99]) {
      tone(c, { freq: f, at, dur: 1.1, vol: 0.12, type: 'sawtooth', attack: 0.02, lp: 2400, lpTo: 900 })
      tone(c, { freq: f * 1.006, at, dur: 1.1, vol: 0.09, type: 'square', attack: 0.02, lp: 2000, lpTo: 800 })
    }
    tone(c, { freq: 200, slideTo: 640, at, dur: 0.18, vol: 0.28, type: 'sine' })
    crackle(c, rollup, tier === 'big' ? 22 : 34, 0.13, at)
  },
  feature(c) {
    noise(c, { dur: 0.8, vol: 0.24, filter: 'bandpass', freq: 600, sweepTo: 5600, q: 2 })
    tone(c, { freq: 300, dur: 0.8, vol: 0.26, type: 'sawtooth', slideTo: 1200, attack: 0.04, lp: 2600, lpTo: 4200 })
    run(c, candyPluckVoice, CANDY_SCALE, [3, 4, 5, 6, 7, 8], 0.07, 0.34, 0.5)
    crackle(c, 0.8, 24, 0.12, 0.5)
  },
  mutation(c) {
    run(c, marimbaVoice, CANDY_SCALE, [6, 8], 0.05, 0.28)
  },
  tick(c, progress) {
    tone(c, { freq: 3000 + progress * 1500, dur: 0.012, vol: 0.05, type: 'square', attack: 0.001, lp: 6000 })
    noise(c, { dur: 0.01, vol: 0.08, filter: 'highpass', freq: 6500 })
  },
  tickEnd(c, tier) {
    run(c, candyPopVoice, CANDY_SCALE, tier === 'none' ? [4, 6] : [5, 7, 9], 0.06, 0.4)
  },
  gambleToss(c) {
    candyPopVoice(c, 1200, 0, 0.55)
    noise(c, { at: 0.02, dur: 0.25, vol: 0.1, filter: 'bandpass', freq: 2500, sweepTo: 6000, q: 1.5 })
    crackle(c, 0.3, 20, 0.08, 0.05)
  },
  gambleWin(c) {
    run(c, candyPluckVoice, CANDY_SCALE, [4, 7], 0.09, 0.34)
    crackle(c, 0.5, 20, 0.12, 0.05)
  },
  gambleLose(c) {
    tone(c, { freq: 700, slideTo: 220, dur: 0.3, vol: 0.3, type: 'square', attack: 0.004, lp: 1800, lpTo: 300 })
  },
}

/** kraken-cove: 물방울·소나·금화·종. 합성 재료만 넘기고 레시피와 리스핀 전용 소리는 `audioDeepsea.ts`에 있다. */
const deepsea = createDeepseaAudio({ tone, noise, live, duck: (seconds) => duckBgmFor(seconds) })

/** volcano-forge: 풀무·쇠 탁·모루 깡·쇳물 치익. 레시피와 불씨·화로 가득·정산 전용 소리는 `audioForge.ts`에 있다. */
const forge = createForgeAudio({ tone, noise, live, duck: (seconds) => duckBgmFor(seconds) })

/** greenhouse-garden: 나무 칼림바·대나무 윈드차임·하프·잎 바스락. 레시피와 정원 전용 소리는 `audioGarden.ts`에 있다. */
const garden = createGardenAudio({ tone, noise, live, duck: (seconds) => duckBgmFor(seconds) })
// ── 한복 야시장 (hanbok-night-market) ─────────────────────
// 평조 오음(G A B D E) 한 옥타브 반. 가야금(명주실 줄)·해금(활)·대금(숨)·장구·꽹과리·징으로 만든다.
// shrine 의 고토는 미야코부시 음계의 날카로운 뜯는 현이었다 — 여기는 장조 오음의 부드러운 현이고,
// 금속성은 꽹과리(비조화 놋쇠)와 징(낮게 부푸는 울림)에서만 나온다.

const HANBOK_SCALE = [392, 440, 493.88, 587.33, 659.25, 783.99, 880, 987.77, 1174.66, 1318.51] as const

/** 사인 한 줄. `bend`가 있으면 그 비율만큼 위에서 시작해 50ms 안에 제 음으로 내려앉는다(농현). */
function hbSine(c: AudioContext, f: number, at: number, dur: number, vol: number, o: { bend?: number; attack?: number } = {}): void {
  const t = c.currentTime + at
  const osc = c.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(f * (o.bend ?? 1), t)
  if (o.bend !== undefined && o.bend !== 1) osc.frequency.exponentialRampToValueAtTime(f, t + 0.05)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.002))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(master!)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

/** 가야금: 명주실 줄. 정수배음이 부드럽게 줄고, 뜯은 직후 음이 살짝 올라갔다 자리 잡는다. */
const gayageumVoice: Voice = (c, f, at, vol) => {
  hbSine(c, f, at, 1.1, vol, { bend: 1.012 })
  hbSine(c, f * 2, at, 0.6, vol * 0.36, { bend: 1.012 })
  hbSine(c, f * 3, at, 0.34, vol * 0.18)
  hbSine(c, f * 4.01, at, 0.18, vol * 0.08)
  noise(c, { at, dur: 0.02, vol: vol * 0.25, filter: 'bandpass', freq: 1700, q: 1.4 })
}

/** 가야금 하모닉 «팅»: 줄 가운데를 살짝 짚고 뜯은 높은 소리. */
function gayageumHarmonic(c: AudioContext, f: number, at: number, vol: number): void {
  hbSine(c, f * 2, at, 0.3, vol, { attack: 0.001 })
  hbSine(c, f * 4.03, at, 0.08, vol * 0.18, { attack: 0.001 })
}

interface BowOpts {
  /** 첫 음이 시작하는 높이(제 음 대비). 해금은 아래에서 미끄러져 올라온다. */
  slide?: number
  /** 콧소리 대역통과의 시작·끝 주파수. */
  from?: number
  to?: number
  /** false 면 콧소리 대역을 빼서 기음이 가장 크게 남는다(상행 슬라이드용). */
  nasal?: boolean
  attack?: number
}

/** 해금: 톱니파 + 콧소리 대역통과 + 늦게 들어오는 5.5Hz 비브라토. 활을 긋는 거친 숨이 첫머리에 붙는다. */
function haegeum(c: AudioContext, f: number, at: number, dur: number, vol: number, o: BowOpts = {}): void {
  const t = c.currentTime + at
  const osc = c.createOscillator()
  osc.type = o.nasal === false ? 'triangle' : 'sawtooth'
  osc.frequency.setValueAtTime(f * (o.slide ?? 0.96), t)
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.08)
  const lfo = c.createOscillator()
  lfo.frequency.value = 5.5
  const depth = c.createGain()
  depth.gain.setValueAtTime(0, t)
  depth.gain.setValueAtTime(0, t + 0.12)
  depth.gain.linearRampToValueAtTime(f * 0.011, t + 0.12 + Math.min(0.35, dur * 0.5))
  lfo.connect(depth).connect(osc.frequency)
  const body = c.createBiquadFilter()
  body.type = 'lowpass'
  body.frequency.value = Math.min(4200, f * 3.2)
  body.Q.value = 0.5
  const attack = o.attack ?? 0.05
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.75))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(body).connect(g)
  if (o.nasal !== false) {
    const nasal = c.createBiquadFilter()
    nasal.type = 'bandpass'
    nasal.Q.value = 1.3
    nasal.frequency.setValueAtTime(o.from ?? 1250, t)
    if (o.to) nasal.frequency.exponentialRampToValueAtTime(o.to, t + dur)
    const nasalGain = c.createGain()
    nasalGain.gain.value = 1.1
    osc.connect(nasal).connect(nasalGain).connect(g)
  }
  g.connect(master!)
  osc.start(t)
  lfo.start(t)
  osc.stop(t + dur + 0.05)
  lfo.stop(t + dur + 0.05)
  noise(c, { at, dur: Math.min(0.2, dur), vol: vol * 0.3, filter: 'bandpass', freq: 3000, q: 1 })
}

/** 대금: 숨이 섞인 사인 + 대역 잡음 + 청(갈대 막) 울림의 높은 숨. */
function daegeum(c: AudioContext, f: number, at: number, dur: number, vol: number): void {
  hbSine(c, f, at, dur, vol, { attack: 0.04 })
  hbSine(c, f * 2, at, dur * 0.7, vol * 0.12, { attack: 0.05 })
  noise(c, { at, dur, vol: vol * 0.4, filter: 'bandpass', freq: f * 2, q: 1.6 })
  noise(c, { at, dur: dur * 0.8, vol: vol * 0.1, filter: 'highpass', freq: 4500 })
}

/** 장구 궁편: 낮은 가죽 «쿵». */
function gungpyeon(c: AudioContext, at: number, vol: number): void {
  tone(c, { freq: 135, slideTo: 78, at, dur: 0.22, vol, type: 'sine', attack: 0.003 })
  tone(c, { freq: 270, slideTo: 170, at, dur: 0.07, vol: vol * 0.25, type: 'triangle', attack: 0.002 })
  noise(c, { at, dur: 0.03, vol: vol * 0.25, filter: 'lowpass', freq: 600, q: 0.7 })
}

/** 장구 채편: 얇은 가죽 «덕». 2.5kHz 대역 잡음 + 400Hz 몸통. `lift`가 크면 조금 높다. */
function chaepyeon(c: AudioContext, at: number, vol: number, lift = 1): void {
  noise(c, { at, dur: 0.06, vol: vol * 0.9, filter: 'bandpass', freq: 2500 * lift, q: 2.2 })
  tone(c, { freq: 420 * lift, slideTo: 330 * lift, at, dur: 0.05, vol: vol * 0.5, type: 'triangle', attack: 0.001 })
}

/** 꽹과리 «갱»: 놋쇠. 정수배가 아닌 배음이 한꺼번에 울고 기음 곁에 맥놀이가 붙는다. */
function kkwaeng(c: AudioContext, at: number, vol: number, f = 1180, ring = 0.32): void {
  const partials: readonly (readonly [number, number, number])[] = [
    [1, 1, 1],
    [1.47, 0.65, 0.8],
    [2.12, 0.5, 0.6],
    [2.91, 0.36, 0.45],
    [3.76, 0.3, 0.3],
    [5.1, 0.2, 0.2],
    [6.4, 0.12, 0.14],
  ]
  for (const [ratio, amp, decay] of partials) hbSine(c, f * ratio, at, ring * decay, vol * amp * 0.55, { attack: 0.001 })
  hbSine(c, f * 1.012, at, ring * 0.9, vol * 0.25, { attack: 0.001 })
  noise(c, { at, dur: 0.05, vol: vol * 0.3, filter: 'bandpass', freq: 4200, q: 0.8 })
}

/** 징: 낮게 부풀어 오르는 울림. 두 줄이 살짝 어긋나 맥놀이가 난다. */
function jing(c: AudioContext, at: number, vol: number, dur = 2.2, swell = 0.28): void {
  tone(c, { freq: 100, slideTo: 94, at, dur, vol, type: 'sine', attack: swell })
  tone(c, { freq: 100.8, slideTo: 94.8, at, dur: dur * 0.9, vol: vol * 0.7, type: 'sine', attack: swell })
  tone(c, { freq: 232, at, dur: dur * 0.5, vol: vol * 0.22, type: 'sine', attack: swell * 1.2 })
  tone(c, { freq: 311, at, dur: dur * 0.35, vol: vol * 0.12, type: 'sine', attack: swell * 1.4 })
  noise(c, { at, dur: 0.08, vol: vol * 0.15, filter: 'lowpass', freq: 900 })
}

/** 휙: 잡음의 대역이 올라가며 소리가 서서히 차올랐다 빠진다. 시작이 단번에 터지면 «탁»(타격)으로 들린다. */
function swish(c: AudioContext, at: number, dur: number, vol: number, from: number, to: number): void {
  if (!noiseBuffer) return
  const t = c.currentTime + at
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.Q.value = 1.1
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.55)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(master!)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.02)
}

/** 엽전 한 닢 «짤랑»: 짧은 고역 배음 네 개를 순서대로, 고정 패턴. */
function yeopjeon(c: AudioContext, at: number, vol: number, partials = 4, pitch = 1): void {
  const list: readonly (readonly [number, number, number, number])[] = [
    [3150, 0, 0.16, 1],
    [4230, 0.016, 0.13, 0.85],
    [5360, 0.031, 0.1, 0.7],
    [6580, 0.047, 0.08, 0.5],
  ]
  for (const [f, d, dur, amp] of list.slice(0, partials)) hbSine(c, f * pitch, at + d, dur, vol * amp, { attack: 0.001 })
  if (partials > 3) hbSine(c, 1580 * pitch, at, 0.07, vol * 0.4, { attack: 0.001 })
}

/** 당첨 동안 엽전이 흩어져 떨어진다. 간격·음높이·세기가 들쭉날쭉하지만 고정된 수열이라 매번 같은 소리다. */
function yeopjeonShower(c: AudioContext, dur: number, density: number, vol: number): void {
  const count = Math.min(30, Math.round(dur * density))
  let seed = 7
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < count; i++) {
    const at = ((i + next() * 0.9) / count) * dur
    yeopjeon(c, at, vol * (0.45 + next() * 0.55), 3, 0.86 + next() * 0.3)
  }
}

/** 꽹과리 «갱 갱 갱개갱». */
function kkwaengPhrase(c: AudioContext, at: number, vol: number): void {
  ;[0, 0.2, 0.4].forEach((d) => kkwaeng(c, at + d, vol))
  kkwaeng(c, at + 0.58, vol * 0.7, 1230, 0.2)
  kkwaeng(c, at + 0.68, vol)
}

const HANBOK_RECIPE: Recipe = {
  loop: { hz: 640, ticks: 12, tonal: 0.45, alt: 0.55, len: 0.03, vol: 0.12 },
  riser: { wave: 'sawtooth', from: 196, to: 392, pulseHz: 4, lp: 1000, vol: 0.065 },
  scale: HANBOK_SCALE,
  spinStart(c) {
    run(c, gayageumVoice, HANBOK_SCALE, [0, 1, 2, 3, 4], 0.04, 0.08)
  },
  reelStop(c, lift) {
    // 릴이 뒤로 갈수록 lift 가 0.06 씩 오른다. 마지막(다섯째) 릴만 궁편 «쿵»이 같이 울린다.
    const reel = Math.round((lift - 1) / 0.06)
    chaepyeon(c, 0, 0.95, lift)
    if (reel >= 4) gungpyeon(c, 0.01, 0.95)
  },
  winSmall(c, rollup) {
    gungpyeon(c, 0, 0.3)
    chaepyeon(c, 0, 0.3)
    run(c, gayageumVoice, HANBOK_SCALE, [0, 3, 5], 0.1, 0.3)
    yeopjeonShower(c, Math.min(rollup, 1.2), 7, 0.03)
  },
  winBig(c, tier, rollup) {
    const strokes = { big: 1, mega: 2, epic: 3, max: 3 }[tier]
    const stroke = [0, 3, 5]
    for (let i = 0; i < strokes; i++) haegeum(c, HANBOK_SCALE[stroke[i]!]!, i * 0.55, 1.0, 0.24, { from: 900, to: 1500, attack: 0.28 })
    for (let i = 0; i < strokes; i++) kkwaeng(c, 0.4 + i * 0.55, 0.42)
    run(c, (cc, f, a, v) => gayageumVoice(cc, f, a + 0.45, v), HANBOK_SCALE, tier === 'big' ? [3, 5, 7] : [0, 2, 3, 5, 7], 0.07, 0.25)
    if (tier === 'epic' || tier === 'max') jing(c, strokes * 0.55, 0.4)
    if (tier === 'max') kkwaengPhrase(c, strokes * 0.55 + 0.1, 0.4)
    yeopjeonShower(c, rollup, tier === 'big' ? 5 : 8, 0.03)
  },
  feature(c) {
    kkwaengPhrase(c, 0, 0.5)
    jing(c, 0, 0.5, 2.0, 0.5)
    noise(c, { at: 0.2, dur: 1.0, vol: 0.12, filter: 'bandpass', freq: 500, sweepTo: 4200, q: 1.4 })
  },
  mutation(c) {
    ;[7, 9].forEach((n, i) => gayageumHarmonic(c, HANBOK_SCALE[n]! / 2, i * 0.06, 0.12))
  },
  tick(c, progress) {
    // 롤업이 오를수록 오음계를 한 칸씩 올라가는 «팅»
    gayageumHarmonic(c, HANBOK_SCALE[5 + Math.min(4, Math.floor(progress * 5))]!, 0, 0.1)
  },
  tickEnd(c, tier) {
    jing(c, 0, tier === 'none' ? 0.26 : 0.34, 0.6, 0.04)
    if (tier !== 'none') kkwaeng(c, 0.02, 0.22)
  },
  // 두 배 도전(병합 때 공용 Recipe에 생긴 칸). hanbok-night-market은 두 배 도전이 없어 지금은 불리지 않는다.
  gambleToss(c) {
    chaepyeon(c, 0, 0.3)
    gayageumHarmonic(c, HANBOK_SCALE[7]!, 0.05, 0.12)
  },
  gambleWin(c) {
    gungpyeon(c, 0, 0.35)
    chord(c, gayageumVoice, [HANBOK_SCALE[2]!, HANBOK_SCALE[4]!, HANBOK_SCALE[7]!], 0.02, 0.2, 0.03)
  },
  gambleLose(c) {
    jing(c, 0, 0.22, 0.9, 0.04)
  },
  riserLayer(c, t, out) {
    // 징 저음이 서서히 부푼다. 두 줄이 어긋나 맥놀이가 난다.
    const drone = (f: number, amp: number): OscillatorNode => {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(f, t)
      o.frequency.linearRampToValueAtTime(f * 1.06, t + 1.4)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(amp, t + 1.3)
      o.connect(g).connect(out)
      o.start(t)
      return o
    }
    return [drone(98, 3), drone(99.6, 2.2)]
  },
}

const WESTERN_RECIPE: Recipe = {
  loop: { hz: 950, ticks: 12, tonal: 0.35, alt: 0.2, len: 0.026, vol: 0.2 },
  riser: { wave: 'sawtooth', from: 110, to: 440, pulseHz: 7, lp: 1500, vol: 0.1 },
  scale: WESTERN_SCALE,
  anticipate(c, lift, bus) {
    // 방울뱀 꼬리: 점점 빨라지는 딸랑임 + 낮은 현이 서서히 오른다
    const t = c.currentTime
    const nodes: AudioScheduledSourceNode[] = []
    const rattle = noiseLoop(c, bus, 'bandpass', 5200, 1.4, 0.06)
    if (rattle) {
      const lfo = c.createOscillator()
      lfo.type = 'square'
      lfo.frequency.setValueAtTime(9, t)
      lfo.frequency.exponentialRampToValueAtTime(26, t + 1.6)
      const depth = c.createGain()
      depth.gain.value = 0.06
      lfo.connect(depth).connect(rattle.g.gain)
      lfo.start(t)
      nodes.push(rattle.src, lfo)
    }
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 520
    const gain = c.createGain()
    gain.gain.value = 0
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.4)
    lp.connect(gain).connect(bus)
    for (const ratio of [1, 1.5]) {
      const o = c.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(98 * lift * ratio, t)
      o.frequency.exponentialRampToValueAtTime(131 * lift * ratio, t + 1.4)
      o.connect(lp)
      o.start(t)
      nodes.push(o)
    }
    return nodes
  },
  spinStart(c) {
    // 권총 약실이 돌아가는 철커덕 + 낮은 현 한 번
    ;[0, 0.045, 0.09].forEach((at, i) => gearTick(c, at, 0.2, 0.55 + i * 0.05))
    pluckVoice(c, 110, 0.02, 0.4)
  },
  reelStop(c, lift) {
    // 부츠 뒤꿈치가 마룻바닥에 닿는 쿵 + 가죽 스침 + 박차 짤랑 한 번
    tone(c, { freq: 125 * lift, slideTo: 58 * lift, dur: 0.12, vol: 0.6, type: 'sine', attack: 0.001 })
    noise(c, { dur: 0.05, vol: 0.28, filter: 'lowpass', freq: 900, sweepTo: 300, q: 0.8 })
    tone(c, { freq: 700 * lift, slideTo: 430 * lift, at: 0.003, dur: 0.04, vol: 0.2, type: 'triangle', attack: 0.001 })
    coinPing(c, 0.015, 0.08, 3300, 0.12)
  },
  winSmall(c, rollup) {
    run(c, pluckVoice, WESTERN_SCALE, [0, 2, 3], 0.09, 0.3)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 9, vol: 0.05, lo: 1800, hi: 3200, voice: 'coin' })
  },
  winBig(c, tier, rollup) {
    // 총성 한 발이 먼저 울리고 그 여운 뒤에 기타가 쓸어내린다
    gunshot(c, 0, 0.5)
    const steps = { big: 5, mega: 7, epic: 8, max: 9 }[tier]
    const from = 0.34
    for (let i = 0; i < steps; i++) pluckVoice(c, WESTERN_SCALE[i]!, from + i * 0.07, 0.3)
    const at = from + steps * 0.07 + 0.05
    chord(c, pluckVoice, [164.81, 246.94, 329.63, 415.3, 493.88], at, 0.28, 0.035)
    if (tier !== 'big') gunshot(c, at + 0.2, 0.4, 1.08)
    sparkle(c, { dur: rollup, density: tier === 'big' ? 12 : 18, vol: 0.06, lo: 1800, hi: 3400, voice: 'coin', from: from })
  },
  feature(c) {
    gunshot(c, 0, 0.45)
    tone(c, { freq: 110, at: 0.3, dur: 0.9, vol: 0.2, type: 'sawtooth', slideTo: 440, attack: 0.05, lp: 1800, lpTo: 600 })
    run(c, pluckVoice, WESTERN_SCALE, [4, 5, 6, 7, 8], 0.07, 0.3, 0.34)
  },
  mutation(c) {
    // 확장 와일드: 금속 슬램 — 쇠판을 치는 짧은 충격 + 막대처럼 비정수로 울리는 금속 배음 + 저역 몸통
    noise(c, { dur: 0.09, vol: 0.3, filter: 'lowpass', freq: 5200, sweepTo: 600, q: 0.7 })
    noise(c, { dur: 0.05, vol: 0.22, filter: 'highpass', freq: 3000, q: 0.7 })
    ;[1, 1.43, 2.07, 2.76, 3.42, 4.9, 6.6].forEach((r, i) => {
      tone(c, { freq: 620 * r, dur: 0.4 / (1 + i * 0.35), vol: 0.09 / (1 + i * 0.3), type: 'sine', attack: 0.001 })
      tone(c, { freq: 620 * r * 1.007, dur: 0.34 / (1 + i * 0.35), vol: 0.055 / (1 + i * 0.3), type: 'sine', attack: 0.001 })
    })
    tone(c, { freq: 110, slideTo: 50, dur: 0.22, vol: 0.32, type: 'sine', attack: 0.002 })
  },
  tick(c, progress) {
    clack(c, 520 + progress * 360, 0, 0.1)
  },
  tickEnd(c, tier) {
    pluckVoice(c, WESTERN_SCALE[tier === 'none' ? 1 : 2]!, 0, 0.3)
    pluckVoice(c, WESTERN_SCALE[tier === 'none' ? 3 : 5]!, 0.08, 0.3)
  },
  gambleToss(c) {
    // 동전 튕김: 엄지로 튕기는 금속 핑 + 날아오르는 바람결 + 공중에서 도는 떨림
    coinPing(c, 0, 0.14, 2400, 0.4)
    noise(c, { at: 0.03, dur: 0.25, vol: 0.05, filter: 'bandpass', freq: 2000, sweepTo: 5200, q: 1.2 })
    tone(c, { freq: 3500, at: 0.05, dur: 0.6, vol: 0.04, type: 'sine', attack: 0.02 })
    tone(c, { freq: 3514, at: 0.05, dur: 0.6, vol: 0.04, type: 'sine', attack: 0.02 })
  },
  gambleWin(c) {
    run(c, pluckVoice, WESTERN_SCALE, [3, 6], 0.1, 0.3)
    coinPing(c, 0.12, 0.1, 3000, 0.25)
    sparkle(c, { dur: 0.5, density: 12, vol: 0.05, lo: 1800, hi: 3200, voice: 'coin' })
  },
  gambleLose(c) {
    // 낮은 나무 퉁 + 맨 아래 현 한 번
    tone(c, { freq: 160, slideTo: 90, dur: 0.14, vol: 0.5, type: 'triangle', attack: 0.002, lp: 900, lpTo: 250 })
    noise(c, { dur: 0.05, vol: 0.2, filter: 'lowpass', freq: 700, q: 0.8 })
    pluckVoice(c, 82.41, 0.04, 0.4)
  },
}

const SHRINE_RECIPE: Recipe = {
  loop: { hz: 1250, ticks: 10, tonal: 0.45, alt: 0.12, len: 0.03, vol: 0.18 },
  riser: { wave: 'sine', from: 160, to: 640, pulseHz: 5, lp: 1800, vol: 0.11 },
  scale: SHRINE_SCALE,
  anticipate(c, lift, bus) {
    // 태고 연타: 간격이 좁아지며 커지는 북 + 쇼 같은 가는 음이 천천히 오른다
    let at = 0
    let gap = 0.26
    while (at < 3.4) {
      const v = 0.14 + Math.min(0.2, at * 0.1)
      tone(c, { freq: 130 * lift, slideTo: 62, at, dur: 0.14, vol: v, type: 'sine', attack: 0.002 })
      noise(c, { at, dur: 0.03, vol: v * 0.45, filter: 'bandpass', freq: 900, q: 1.5 })
      at += gap
      gap = Math.max(0.07, gap * 0.88)
    }
    const t = c.currentTime
    const nodes: AudioScheduledSourceNode[] = []
    const g = c.createGain()
    g.gain.value = 0
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.8)
    g.connect(bus)
    for (const [type, ratio] of [['sine', 1], ['triangle', 1.5]] as const) {
      const o = c.createOscillator()
      o.type = type
      o.frequency.setValueAtTime(164 * lift * ratio, t)
      o.frequency.exponentialRampToValueAtTime(330 * lift * ratio, t + 2.4)
      o.connect(g)
      o.start(t)
      nodes.push(o)
    }
    return nodes
  },
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
    sparkle(c, { dur: 0.3, density: 24, vol: 0.11, lo: 3200, hi: 5000, voice: 'suzu' })
    coinPing(c, 0, 0.05, 3800, 0.2)
  },
  tick(c, progress) {
    clack(c, 1100 + progress * 500, 0, 0.09)
  },
  tickEnd(c, tier) {
    templeVoice(c, SHRINE_SCALE[tier === 'none' ? 2 : 0]! / (tier === 'none' ? 1 : 2), 0, 0.22)
  },
  gambleToss(c) {
    sparkle(c, { dur: 0.35, density: 22, vol: 0.08, lo: 3000, hi: 5000, voice: 'suzu' })
    coinPing(c, 0.02, 0.1, 3600, 0.4)
  },
  gambleWin(c) {
    templeVoice(c, SHRINE_SCALE[2]! / 2, 0, 0.22)
    sparkle(c, { dur: 0.5, density: 26, vol: 0.09, lo: 3000, hi: 4800, voice: 'suzu' })
  },
  gambleLose(c) {
    clack(c, 380, 0, 0.5)
    templeVoice(c, SHRINE_SCALE[0]! / 4, 0.02, 0.14)
  },
}

const CLOCK_RECIPE: Recipe = {
  loop: { hz: 3200, ticks: 20, tonal: 0.5, alt: 0.3, len: 0.012, vol: 0.14 },
  riser: { wave: 'square', from: 520, to: 2080, pulseHz: 14, lp: 3600, vol: 0.05 },
  scale: CLOCK_SCALE,
  anticipate(c, lift, bus) {
    // 톱니바퀴가 점점 빨리 돈다 + 유리 같은 소리가 위로 올라간다
    let at = 0
    let gap = 0.17
    let k = 0
    while (at < 3.4) {
      gearTick(c, at, 0.15 + Math.min(0.1, at * 0.05), (0.8 + k * 0.03) * lift)
      at += gap
      gap = Math.max(0.035, gap * 0.9)
      k++
    }
    return sweepRise(c, bus, lift, {
      type: 'sawtooth',
      from: 200,
      to: 800,
      vol: 0.07,
      lp: 2600,
      wash: { filter: 'bandpass', f0: 900, f1: 5000, q: 3, vol: 0.04 },
    })
  },
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
  mutation(c, kind) {
    if (kind === 'expandWild') {
      // 빛 기둥: 유리 소리가 아래에서 위로 쭉 올라가고, 꼭대기에서 화음이 한꺼번에 켜진다
      tone(c, { freq: 700, slideTo: 2800, dur: 0.5, vol: 0.12, type: 'sine', attack: 0.04, lp: 4000 })
      noise(c, { dur: 0.5, vol: 0.06, filter: 'bandpass', freq: 1200, sweepTo: 6000, q: 1.5 })
      chord(c, glassVoice, [CLOCK_SCALE[0]!, CLOCK_SCALE[2]!, CLOCK_SCALE[4]!, CLOCK_SCALE[7]!], 0.42, 0.14, 0.02)
      return
    }
    if (kind === 'upgrade') {
      // 승급: 래칫이 한 칸 걸리는 철컥 + 맑은 두 음이 한 단계 올라간다
      tone(c, { freq: 1300, slideTo: 760, dur: 0.03, vol: 0.2, type: 'square', attack: 0.001 })
      noise(c, { dur: 0.015, vol: 0.14, filter: 'highpass', freq: 3500 })
      glassVoice(c, CLOCK_SCALE[2]!, 0.1, 0.16)
      glassVoice(c, CLOCK_SCALE[5]!, 0.2, 0.18)
      bell(c, 2093, 0.2, 0.05, 0.4)
      return
    }
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
  gambleToss(c) {
    // 래칫이 빨라지는 튕김 + 유리 핑
    ;[0, 0.03, 0.055, 0.075].forEach((at, i) => gearTick(c, at, 0.14, 1 + i * 0.12))
    glassVoice(c, CLOCK_SCALE[6]!, 0.1, 0.1)
  },
  gambleWin(c) {
    run(c, glassVoice, CLOCK_SCALE, [4, 7], 0.09, 0.2)
  },
  gambleLose(c) {
    // 태엽이 풀리듯 간격이 벌어지는 틱 + 낮게 떨어지는 사인
    ;[0, 0.06, 0.15, 0.28].forEach((at, i) => gearTick(c, at, 0.2, 0.9 - i * 0.12))
    tone(c, { freq: 420, slideTo: 140, at: 0.05, dur: 0.4, vol: 0.22, type: 'sine', attack: 0.01 })
  },
}

/** 로열: 5음 장조(C6~G7). 다이아몬드가 부딪히는 높고 맑은 음계. */
const GEM_SCALE = [1046.5, 1174.66, 1318.51, 1568, 1760, 2093, 2349.32, 2637.02, 3136]
/** 로열 브라스 음(B♭3~B♭5 근처). */
const BRASS_NOTES = [233.08, 293.66, 349.23, 466.16, 587.33, 698.46]

const ROYAL_RECIPE: Recipe = {
  loop: { hz: 1700, ticks: 14, tonal: 0.5, alt: 0.2, len: 0.02, vol: 0.16 },
  riser: { wave: 'sawtooth', from: 180, to: 540, pulseHz: 8, lp: 2000, vol: 0.08 },
  scale: GEM_SCALE,
  anticipate(c, lift, bus) {
    // 스네어 롤이 점점 촘촘해지고 금관 스웰이 올라간다
    let at = 0
    let gap = 0.14
    while (at < 3.4) {
      noise(c, { at, dur: 0.05, vol: 0.2 + Math.min(0.2, at * 0.1), filter: 'bandpass', freq: 1900, q: 0.9 })
      at += gap
      gap = Math.max(0.045, gap * 0.93)
    }
    return sweepRise(c, bus, lift, {
      type: 'sawtooth',
      from: 180,
      to: 540,
      vol: 0.08,
      lp: 1600,
      wash: { filter: 'highpass', f0: 3000, f1: 8000, q: 0.7, vol: 0.05 },
    })
  },
  spinStart(c) {
    // 칩 더미가 쓸리는 소리: 짧은 도자기 칩 부딪힘이 빠르게 여섯 번 + 낮은 쿵
    ;[1900, 2500, 2100, 2900, 2300, 3100].forEach((f, i) => {
      coinPing(c, i * 0.028, 0.09, f, 0.05)
      noise(c, { at: i * 0.028, dur: 0.012, vol: 0.12, filter: 'bandpass', freq: 3800, q: 2 })
    })
    tone(c, { freq: 140, slideTo: 80, dur: 0.12, vol: 0.28, type: 'triangle' })
  },
  reelStop(c, lift) {
    // 림샷 같은 딱 + 부드러운 브러시 + 짧은 혼 한 점
    tone(c, { freq: 210 * lift, slideTo: 110 * lift, dur: 0.09, vol: 0.7, type: 'triangle', attack: 0.001, lp: 1500, lpTo: 300 })
    noise(c, { dur: 0.012, vol: 0.55, filter: 'bandpass', freq: 3000, q: 1.5 })
    noise(c, { at: 0.01, dur: 0.07, vol: 0.2, filter: 'bandpass', freq: 2400, q: 0.7 })
    brassHit(c, BRASS_NOTES[0]! * lift, 0.005, 0.14, 0.1)
  },
  winSmall(c, rollup) {
    brassHit(c, BRASS_NOTES[0]!, 0, 0.18, 0.28)
    brassHit(c, BRASS_NOTES[2]!, 0.09, 0.16, 0.3)
    run(c, glassVoice, GEM_SCALE, [2, 4, 6], 0.07, 0.14, 0.12)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 10, vol: 0.05, lo: 2600, hi: 5000, voice: 'glass' })
  },
  winBig(c, tier, rollup) {
    // 빅밴드 팡파르: 올라가는 혼 스탭 + 마지막 화음 + 심벌 + 다이아 소나기
    const stabs = { big: 4, mega: 5, epic: 6, max: 6 }[tier]
    timpani(c, 0, 0.5)
    snareRoll(c, 0.05, 0.3, 0.18)
    const from = 0.38
    for (let i = 0; i < stabs; i++) brassHit(c, BRASS_NOTES[i]!, from + i * 0.11, 0.28, 0.3)
    const at = from + stabs * 0.11 + 0.04
    for (const f of [BRASS_NOTES[0]!, BRASS_NOTES[2]!, BRASS_NOTES[3]!]) brassHit(c, f, at, 0.2, 0.9)
    timpani(c, at, 0.45, 116)
    cymbal(c, at, 1.4, 0.18)
    sparkle(c, { dur: rollup, density: tier === 'big' ? 16 : 24, vol: 0.06, lo: 2600, hi: 5200, voice: 'glass' })
  },
  feature(c) {
    // 팀파니 롤 + 올라가는 혼 스탭 + 심벌 스웰
    ;[0, 0.12, 0.22, 0.3, 0.37, 0.43].forEach((at, i) => timpani(c, at, 0.25 + i * 0.05, 90 + i * 4))
    run(c, (cc, f, at, v) => brassHit(cc, f, at, v, 0.35), BRASS_NOTES, [0, 1, 2, 3, 4, 5], 0.09, 0.2, 0.45)
    cymbal(c, 0.9, 1.0, 0.16)
    run(c, glassVoice, GEM_SCALE, [5, 6, 7, 8], 0.07, 0.14, 0.95)
  },
  mutation(c) {
    revealFlip(c)
    brassHit(c, BRASS_NOTES[2]!, 0.1, 0.12, 0.25)
    timpani(c, 0.1, 0.25, 110)
    cymbal(c, 0.14, 0.5, 0.08)
  },
  tick(c, progress) {
    tone(c, { freq: 1800 + progress * 900, dur: 0.02, vol: 0.05, type: 'triangle', attack: 0.001 })
    noise(c, { dur: 0.008, vol: 0.06, filter: 'bandpass', freq: 3000, q: 2 })
  },
  tickEnd(c, tier) {
    brassHit(c, BRASS_NOTES[tier === 'none' ? 2 : 3]!, 0, 0.12, 0.22)
    glassVoice(c, GEM_SCALE[tier === 'none' ? 4 : 6]!, 0.05, 0.14)
  },
  gambleToss(c) {
    // 카드 튕기기: 종이 쓸림 + 다이아 핑
    noise(c, { dur: 0.1, vol: 0.25, filter: 'bandpass', freq: 1500, sweepTo: 5000, q: 1.1 })
    glassVoice(c, GEM_SCALE[5]!, 0.08, 0.14)
  },
  gambleWin(c) {
    brassHit(c, BRASS_NOTES[2]!, 0, 0.18, 0.28)
    brassHit(c, BRASS_NOTES[3]!, 0.1, 0.2, 0.4)
    run(c, glassVoice, GEM_SCALE, [5, 7], 0.08, 0.12, 0.12)
  },
  gambleLose(c) {
    // 약음기 트럼펫이 와와 하며 내려앉는다
    tone(c, { freq: 233, slideTo: 155, dur: 0.4, vol: 0.2, type: 'sawtooth', attack: 0.03, lp: 1400, lpTo: 350 })
    tone(c, { freq: 233.5, slideTo: 155.5, dur: 0.36, vol: 0.12, type: 'sawtooth', attack: 0.03, lp: 900, lpTo: 300 })
  },
}

// ── idol-stage-live ───────────────────────────────────────
// 신스팝 콘서트: 손뼉·신스 브라스·4박 킥이 주역이다. 말렛·글로켄·종(다른 프리셋의 주역)은 쓰지 않는다.

/** 아이돌: A 장조 펜타토닉 2옥타브(A4~F#6). 브라스 팡파르가 앉는 밝은 중음역이다. */
const IDOL_SCALE = [440, 493.88, 554.37, 659.25, 739.99, 880, 987.77, 1108.73, 1318.51, 1479.98]
/** 코드 스탭: A · F#m · D · E (A 장조 팝 진행). */
const IDOL_CHORDS: readonly (readonly number[])[] = [
  [440, 554.37, 659.25],
  [369.99, 440, 554.37],
  [293.66, 440, 587.33],
  [329.63, 493.88, 659.25],
]
const IDOL_BEAT = 60 / 128
/** 오프비트 베이스 음(A · F#m · D · E 뿌리음, 2옥타브 아래). */
const IDOL_BASS = [110, 92.5, 73.42, 82.41]

/** 신스 브라스: 톱니 두 줄(±9센트)이 필터를 빠르게 열었다 천천히 닫는다. «팡파르» 음색. */
function synthBrass(c: AudioContext, f: number, at: number, vol: number, dur = 0.34): void {
  const t = c.currentTime + at
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 1.2
  lp.frequency.setValueAtTime(f * 1.4, t)
  lp.frequency.linearRampToValueAtTime(Math.min(9000, f * 8), t + 0.07)
  lp.frequency.setTargetAtTime(f * 2.4, t + 0.07, 0.12)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012)
  g.gain.setTargetAtTime(0.0001, t + dur * 0.55, dur * 0.22)
  lp.connect(g).connect(master!)
  for (const detune of [-9, 9]) {
    const osc = c.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = f
    osc.detune.value = detune
    osc.connect(lp)
    osc.start(t)
    osc.stop(t + dur * 2.1)
  }
}

const idolBrassVoice: Voice = (c, f, at, vol) => synthBrass(c, f, at, vol, 0.3)

/** 코드를 브라스로 한 번에 친다. */
function brassChord(c: AudioContext, freqs: readonly number[], at: number, vol: number, dur = 0.3): void {
  for (const f of freqs) synthBrass(c, f, at, vol, dur)
}

/**
 * 손뼉: 대역 잡음 세 겹(8·9ms 어긋남)과 짧은 꼬리, 3kHz 핑 하나. 킥으로 읽히지 않게 저역은 일부러 비운다.
 * `lift`는 릴이 뒤로 갈수록 대역을 조금씩 올리는 비율.
 */
function clap(c: AudioContext, at: number, vol: number, lift = 1): void {
  noise(c, { at, dur: 0.028, vol, filter: 'bandpass', freq: 1700 * lift, q: 1.1 })
  noise(c, { at: at + 0.008, dur: 0.026, vol: vol * 0.9, filter: 'bandpass', freq: 2100 * lift, q: 1.3 })
  noise(c, { at: at + 0.017, dur: 0.03, vol: vol * 0.7, filter: 'bandpass', freq: 1900 * lift, q: 1.0 })
  noise(c, { at: at + 0.026, dur: 0.11, vol: vol * 0.42, filter: 'bandpass', freq: 1500 * lift, q: 0.8 })
  tone(c, { freq: 3000 * lift, at, dur: 0.02, vol: vol * 0.14, type: 'sine', attack: 0.001 })
}

/** EDM 킥: 160→46Hz 사인 + 아주 짧은 딱. */
function idolKick(c: AudioContext, at: number, vol: number): void {
  tone(c, { freq: 160, slideTo: 46, at, dur: 0.17, vol, type: 'sine', attack: 0.002 })
  noise(c, { at, dur: 0.012, vol: vol * 0.3, filter: 'lowpass', freq: 3000 })
}

/** 탐: 위에서 내려앉는 사인 + 가죽 닿는 소리. */
function tom(c: AudioContext, f: number, at: number, vol: number): void {
  tone(c, { freq: f * 1.5, slideTo: f, at, dur: 0.22, vol, type: 'sine', attack: 0.002 })
  noise(c, { at, dur: 0.02, vol: vol * 0.25, filter: 'bandpass', freq: 1500, q: 1 })
}

/** 심벌 크래시: 고역 잡음이 길게 번진다. */
function crash(c: AudioContext, at: number, vol: number): void {
  noise(c, { at, dur: 1.1, vol, filter: 'highpass', freq: 5500, q: 0.6 })
  noise(c, { at, dur: 0.5, vol: vol * 0.5, filter: 'bandpass', freq: 3200, q: 0.7 })
}

/** 오르는 소리: 잡음 대역과 톱니가 함께 올라 끝에서 가장 크다(드롭 직전). */
function riseSweep(c: AudioContext, at: number, dur: number, vol: number): void {
  if (!noiseBuffer || !master) return
  const t = c.currentTime + at
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 1.6
  bp.frequency.setValueAtTime(500, t)
  bp.frequency.exponentialRampToValueAtTime(6500, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.92)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04)
  src.connect(bp).connect(g).connect(master)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.06)
  tone(c, { freq: 200, slideTo: 1000, at, dur, vol: vol * 0.55, type: 'sawtooth', attack: dur * 0.92, lp: 700, lpTo: 6500 })
}

/**
 * 손뼉 롤: 간격이 줄어들며 점점 커진다(`n`번). 합성 함성은 earshot에서 바람·휙 소리나 풍선 소리로 읽혀
 * (SOUND_CHECK 참고) 함성 자리를 이 손뼉 롤이 맡는다.
 */
function clapRoll(c: AudioContext, at: number, n: number, gap0: number, gapMin: number, vol: number): void {
  let x = 0
  let gap = gap0
  for (let i = 0; i < n; i++) {
    clap(c, at + x, vol * (0.6 + 0.4 * (i / Math.max(1, n - 1))))
    x += gap
    gap = Math.max(gapMin, gap * 0.82)
  }
}

/** 코인 차임: 짧은 사각파 한 음 뒤에 5도 위의 긴 한 음(레트로 «띠링»). */
function coinChime(c: AudioContext, at: number, vol: number): void {
  tone(c, { freq: 1318.51, at, dur: 0.07, vol: vol * 0.55, type: 'square', attack: 0.001, lp: 4000, lpTo: 1800 })
  tone(c, { freq: 1975.53, at: at + 0.065, dur: 0.42, vol: vol * 0.45, type: 'square', attack: 0.001, lp: 5000, lpTo: 1900 })
  tone(c, { freq: 1975.53, at: at + 0.065, dur: 0.5, vol: vol * 0.55, type: 'sine', attack: 0.001 })
  tone(c, { freq: 3951, at: at + 0.065, dur: 0.18, vol: vol * 0.18, type: 'sine', attack: 0.001 })
}

const IDOL_RECIPE: Recipe = {
  loop: { hz: 3000, ticks: 14, tonal: 0.55, alt: 0.1, len: 0.014, vol: 0.12 },
  riser: { wave: 'triangle', from: 262, to: 1046, pulseHz: 6, lp: 4200, vol: 0.08 },
  scale: IDOL_SCALE,
  spinStart(c) {
    tone(c, { freq: 180, slideTo: 760, dur: 0.26, vol: 0.2, type: 'sawtooth', attack: 0.05, lp: 450, lpTo: 6500 })
    noise(c, { dur: 0.2, vol: 0.12, filter: 'bandpass', freq: 700, sweepTo: 4600, q: 1.3 })
  },
  reelStop(c, lift) {
    clap(c, 0, 1.4, lift)
  },
  winSmall(c, rollup) {
    run(c, idolBrassVoice, IDOL_SCALE, [5, 7, 8], 0.075, 0.13)
    sparkle(c, { dur: Math.min(rollup, 1.2), density: 11, vol: 0.05, lo: 2800, hi: 5200, voice: 'spark' })
  },
  winBig(c, tier, rollup) {
    const beats = { big: 4, mega: 6, epic: 8, max: 8 }[tier]
    const drop = 0.52
    riseSweep(c, 0, drop - 0.02, 0.2)
    crash(c, drop, 0.2)
    tone(c, { freq: 62, slideTo: 40, at: drop, dur: 0.9, vol: 0.45, type: 'sine', attack: 0.004 })
    for (let i = 0; i < beats; i++) {
      const at = drop + i * IDOL_BEAT
      idolKick(c, at, 0.7)
      noise(c, { at: at + IDOL_BEAT / 2, dur: 0.07, vol: 0.12, filter: 'highpass', freq: 7000 })
      tone(c, { freq: IDOL_BASS[Math.floor(i / 2) % IDOL_BASS.length]!, at: at + IDOL_BEAT / 2, dur: 0.2, vol: 0.22, type: 'sawtooth', attack: 0.005, lp: 700, lpTo: 200 })
      if (i % 2 === 1) clap(c, at, 0.5)
      brassChord(c, IDOL_CHORDS[Math.floor(i / 2) % IDOL_CHORDS.length]!, at + IDOL_BEAT / 2, 0.09, 0.22)
    }
    const end = drop + beats * IDOL_BEAT
    brassChord(c, [220, 440, 554.37, 659.25, 880], end, 0.11, 0.9)
    crash(c, end, 0.18)
    sparkle(c, { dur: rollup, density: tier === 'big' ? 6 : 10, vol: 0.04, lo: 2800, hi: 5600, voice: 'spark' })
  },
  feature(c) {
    // 박수 롤이 빨라지고 상승 스윕이 차올라 0.9초에 드롭: 킥 + 크래시 + 코드.
    riseSweep(c, 0, 0.86, 0.11)
    clapRoll(c, 0, 9, 0.22, 0.05, 0.42)
    idolKick(c, 0.88, 0.5)
    crash(c, 0.88, 0.16)
    brassChord(c, IDOL_CHORDS[0]!, 0.9, 0.12, 0.5)
    brassChord(c, [880, 1108.73, 1318.51], 1.05, 0.08, 0.4)
  },
  mutation(c) {
    run(c, (cc, f, at, v) => tone(cc, { freq: f, at, dur: 0.07, vol: v, type: 'square', attack: 0.001, lp: f * 2.2, lpTo: f }), IDOL_SCALE, [7, 9], 0.05, 0.16)
    noise(c, { dur: 0.25, vol: 0.09, filter: 'highpass', freq: 6500 })
  },
  tick(c, progress) {
    noise(c, { dur: 0.02, vol: 0.08, filter: 'highpass', freq: 5000 + progress * 2500 })
    tone(c, { freq: 1900 + progress * 1200, dur: 0.028, vol: 0.04, type: 'triangle', attack: 0.001 })
  },
  tickEnd(c, tier) {
    run(c, idolBrassVoice, IDOL_SCALE, tier === 'none' ? [3, 5] : [5, 7, 8], 0.07, 0.11)
  },
  // 두 배 도전(병합 때 공용 Recipe에 생긴 칸). idol-stage-live는 두 배 도전이 없어 지금은 불리지 않는다.
  gambleToss(c) {
    clap(c, 0, 0.5)
    coinChime(c, 0.04, 0.18)
  },
  gambleWin(c) {
    clap(c, 0, 0.5)
    brassChord(c, IDOL_CHORDS[0]!, 0.04, 0.1, 0.4)
  },
  gambleLose(c) {
    synthBrass(c, 220, 0, 0.08, 0.4)
    synthBrass(c, 207.65, 0.18, 0.07, 0.5)
  },
  riserExtra(c) {
    // 손뼉 롤: 간격이 0.34초에서 0.1초로 줄어들며 점점 커진다.
    const gaps = [0, 0.34, 0.28, 0.23, 0.19, 0.15, 0.12, 0.1]
    const timers: ReturnType<typeof setTimeout>[] = []
    let elapsed = 0
    gaps.forEach((gap, i) => {
      elapsed += gap
      timers.push(
        setTimeout(() => {
          if (live()) clap(c, 0, 0.16 + i * 0.03)
        }, elapsed * 1000),
      )
    })
    return () => {
      for (const id of timers) clearTimeout(id)
    }
  },
}

const RECIPES: Record<AudioPreset, Recipe> = {
  bell: BELL_RECIPE,
  fruit: FRUIT_RECIPE,
  western: WESTERN_RECIPE,
  shrine: SHRINE_RECIPE,
  clockwork: CLOCK_RECIPE,
  candy: CANDY_RECIPE,
  royal: ROYAL_RECIPE,
  deepsea: deepsea.recipe,
  garden: garden.recipe,
  hanbok: HANBOK_RECIPE,
  idol: IDOL_RECIPE,
  forge: forge.recipe,
}

let preset: AudioPreset = 'bell'
let recipe: Recipe = BELL_RECIPE
const spinLoopBuffers = new Map<AudioPreset, AudioBuffer>()

/** 게임의 소리 세트를 바꾼다. 모르는 값이나 undefined면 기본 `bell`. */
export function setSoundPreset(next: AudioPreset | undefined): void {
  const key: AudioPreset = next !== undefined && next in RECIPES ? next : 'bell'
  if (key === preset) return
  stopSpinLoop()
  stopAnticipation()
  preset = key
  recipe = RECIPES[key]
  if (key === 'western') warmGunshot()
  else releaseGunshot()
  if (bgm) tryStartBgm()
}

export function getSoundPreset(): AudioPreset {
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

/** 짧은 오름 음. 프리셋 음계(`recipe.scale`)의 칸 번호를 `step`초 간격으로 부드러운 삼각파로 친다. */
function bandSting(c: AudioContext, notes: readonly number[], vol = 0.1): void {
  const scale = recipe.scale
  notes.forEach((n, i) => {
    const f = scale[Math.min(n, scale.length - 1)]
    if (f !== undefined) tone(c, { freq: f, at: i * 0.08, dur: 0.22, vol, type: 'triangle', attack: 0.006 })
  })
}

/**
 * 베팅 대비 단계(`winBands`)별 당첨 소리. 새 레시피 키 없이 기존 `winSmall`·`scale`·`tickEnd`만 조합한다.
 *
 * - `under`·`none`: 소리 없음(베팅 미만 당첨은 축하하지 않는다. 릴 정지음만 난다)
 * - `small`: 기존 작은 당첨음(`winSmall` 0.5초 안팎)
 * - `good`: `winSmall` 0.9초 + 3음 오름
 * - `great`: `winSmall` 1.4초 + 5음 오름 + 마감음(`tickEnd`)
 * - `big`: 이 함수를 쓰지 않는다(`playWin(tier)`)
 */
export function playWinBand(band: 'none' | 'under' | 'small' | 'good' | 'great' | 'big', durationMs: number): void {
  if (band === 'none' || band === 'under' || band === 'big') return
  if (band === 'small') {
    playWin('none', durationMs)
    return
  }
  if (playOverride('win')) return
  const c = live()
  if (!c) return
  if (band === 'good') {
    recipe.winSmall(c, 0.9)
    bandSting(c, [0, 2, 4])
    return
  }
  recipe.winSmall(c, 1.4)
  bandSting(c, [0, 2, 4, 5, 7], 0.11)
  sched = 0.4
  try {
    recipe.tickEnd(c, 'none')
  } finally {
    sched = 0
  }
}

/** 프리스핀 등 피처 발동. */
export function playFeature(): void {
  const c = live()
  if (!c) return
  duckBgmFor(1.6)
  recipe.feature(c)
}

/**
 * 심볼 변형(미스터리 공개·확장 와일드·승급·랜덤 와일드). `kind`를 주면 프리셋이 종류별로 다른 소리를 낸다.
 * 안 주면 그 프리셋의 기본 변형음.
 */
export function playMutation(kind?: MutationKind): void {
  const c = live()
  if (!c) return
  recipe.mutation(c, kind)
}

// ── 더블업 ────────────────────────────────────────────────

/** 더블업에서 빨강/검정을 골라 동전이 날아오른다. */
export function playGambleToss(): void {
  const c = live()
  if (!c) return
  recipe.gambleToss(c)
}

/** 더블업 적중. 배당이 두 배가 된다. */
export function playGambleWin(): void {
  const c = live()
  if (!c) return
  duckBgmFor(1)
  recipe.gambleWin(c)
}

/** 더블업 실패. 걸린 금액을 잃는다. */
export function playGambleLose(): void {
  const c = live()
  if (!c) return
  recipe.gambleLose(c)
}

// ── 연쇄·주문 카드 (candy-cluster-pop) ─────────────────────
// 음색은 CANDY_RECIPE와 같은 재료(사탕 팝·글로켄·마림바)다. 이 소리들은 캔디 게임에서만 불린다.

/** 연쇄 단계마다의 팝. `step`이 오를수록 음계가 한 칸씩 오른다(0부터). */
export function playCascadePop(step: number): void {
  const c = live()
  if (!c) return
  if (preset === 'forge') {
    forge.cues.highlight(c, step)
    forge.cues.pop(c)
    return
  }
  const f = CANDY_SCALE[Math.min(Math.max(0, Math.floor(step)), CANDY_SCALE.length - 1)]!
  candyPopVoice(c, f, 0, 0.5)
  candyPopVoice(c, f * 1.26, 0.04, 0.3)
  candyPopVoice(c, f * 1.5, 0.075, 0.2)
}

/** 사다리 배수가 한 칸 올랐다. `index`는 사다리 칸(0부터). */
export function playLadderUp(index: number): void {
  const c = live()
  if (!c) return
  const n = Math.min(Math.max(0, Math.floor(index)) + 2, CANDY_SCALE.length - 1)
  marimbaVoice(c, CANDY_SCALE[n]! * 0.5, 0.02, 0.32)
  glockVoice(c, CANDY_SCALE[n]!, 0.06, 0.2)
}

/** 지운 칸 위로 사탕이 떨어진다. */
export function playCascadeDrop(): void {
  const c = live()
  if (!c) return
  if (preset === 'forge') {
    forge.cues.drop(c)
    return
  }
  tone(c, { freq: 900, slideTo: 300, dur: 0.16, vol: 0.12, type: 'sine', attack: 0.004, lp: 3000, lpTo: 600 })
  noise(c, { at: 0.15, dur: 0.035, vol: 0.12, filter: 'bandpass', freq: 900, q: 1 })
  tone(c, { freq: 220, slideTo: 130, at: 0.15, dur: 0.07, vol: 0.14, type: 'sine', attack: 0.002 })
}

/** 토큰이 주문 카드에 닿았다. 단계당 1회로 묶어 부른다. 마림바 두 알 굴림. */
export function playOrderTick(): void {
  const c = live()
  if (!c) return
  marimbaVoice(c, 659.25, 0, 0.3)
  marimbaVoice(c, 783.99, 0.04, 0.28)
  tone(c, { freq: 3200, at: 0.04, dur: 0.012, vol: 0.05, type: 'sine', attack: 0.001 })
}

/** 주문 카드 완료 도장: 쿵 하는 도장 + 글로켄 3음 상행. */
export function playOrderComplete(): void {
  const c = live()
  if (!c) return
  duckBgmFor(0.8)
  tone(c, { freq: 140, slideTo: 50, dur: 0.16, vol: 0.6, type: 'sine', attack: 0.002 })
  noise(c, { dur: 0.05, vol: 0.3, filter: 'lowpass', freq: 500, sweepTo: 150, q: 0.7 })
  run(c, (cc, f, at, v) => glockVoice(cc, f, at + 0.12, v), CANDY_SCALE, [2, 4, 6], 0.09, 0.32)
}

/** 주문 카드가 새로 깔린다. 스윽 훑는 소리 + 작은 마림바 한 알. */
export function playOrderDeal(): void {
  const c = live()
  if (!c) return
  noise(c, { dur: 0.14, vol: 0.1, filter: 'bandpass', freq: 800, sweepTo: 3200, q: 1.2 })
  marimbaVoice(c, 880, 0.1, 0.16)
}

// ── 코인 리스핀 (kraken-cove) ──────────────────────────────
// 음색은 `audioDeepsea.ts`의 deepsea 프리셋이다. 이 소리들은 코인 리스핀 게임에서만 불린다.

/** 진입 판의 코인 한 알이 «칭». `index`가 오를수록 반음씩 높아진다. */
export function playCoinLand(index: number): void {
  const c = live()
  if (c) deepsea.cues.coinLand(c, index)
}

/** 빈 칸이 돌기 시작한다(소나). */
export function playRespinSonar(): void {
  const c = live()
  if (c) deepsea.cues.respinSonar(c)
}

/** 새 코인이 고정된다. `step`이 오를수록 반음씩 높아진다(12단 상한). */
export function playCoinPin(step: number): void {
  const c = live()
  if (c) deepsea.cues.coinPin(c, step)
}

/** 남은 횟수가 다시 찼다. */
export function playCounterReset(): void {
  const c = live()
  if (c) deepsea.cues.counterReset(c)
}

/** 마지막 한 번 남았다(심장 박동). */
export function playLastRespin(): void {
  const c = live()
  if (c) deepsea.cues.lastRespin(c)
}

/** 촉수가 줄을 감는다 / 두 배로 확정된다. */
export function playTentacleWrap(phase: 'start' | 'end'): void {
  const c = live()
  if (c) deepsea.cues.tentacleWrap(c, phase)
}

/** 보물 코인. 크기마다 종 화음이 2/3/4음으로 쌓인다. */
export function playTreasure(size: TreasureSize): void {
  const c = live()
  if (c) deepsea.cues.treasure(c, size)
}

/** 정산 중 숫자 코인 한 알이 합계로 날아간다. `progress`(0..1)가 오를수록 높아진다. */
export function playSettleTick(progress: number): void {
  const c = live()
  if (c) deepsea.cues.settleTick(c, progress)
}

/** 최고 보물(15칸 채움) 팡파르. */
export function playTopTreasure(): void {
  const c = live()
  if (c) deepsea.cues.topTreasure(c)
}

// ── 화산 대장간 (volcano-forge) ────────────────────────────
// 음색은 `audioForge.ts`의 forge 프리셋이다. 이 소리들은 화로 줄이 있는 게임에서만 불린다.
// 연쇄 팝·낙하는 `playCascadePop`·`playCascadeDrop`이 프리셋이 forge일 때 같은 자리에서 대신 낸다.

/** 불씨가 판에서 튀어 오른다: 장작 «탁탁». */
export function playForgeEmberSpark(): void {
  const c = live()
  if (c) forge.cues.emberSpark(c)
}

/** 불씨가 화로 칸에 닿았다. `slot`은 켜진 칸(0부터, 4단 상한). */
export function playForgeEmberLand(slot: number): void {
  const c = live()
  if (c) forge.cues.emberLand(c, slot)
}

/** 화로 칸이 3개 켜졌다: 낮은 숨소리. */
export function playForgeBreath(): void {
  const c = live()
  if (c) forge.cues.breath(c)
}

/** 화로 가득: 합계가 두 배가 된다. 게임의 얼굴 소리. */
export function playForgeFull(): void {
  const c = live()
  if (c) forge.cues.full(c)
}

/** 정산 `× N`: 망치 세 번. */
export function playForgeSettle(): void {
  const c = live()
  if (c) forge.cues.settle(c)
}

/** 정산 숫자만 바뀐다: 짧은 쇠 «틱». */
export function playForgeSettleTick(): void {
  const c = live()
  if (c) forge.cues.settleTick(c)
}

/** 모루 칩이 켜졌다. `count`는 모인 모루 수(3이면 기대감 북). */
export function playForgeAnvilTease(count: number): void {
  const c = live()
  if (c) forge.cues.anvilTease(c, count)
}

/** 프리스핀이 더해졌다. */
export function playForgeRetrigger(): void {
  const c = live()
  if (c) forge.cues.retrigger(c)
}

// ── 자라는 정원 (greenhouse-garden) ────────────────────────
// 음색은 `audioGarden.ts`의 garden 프리셋이다. 이 소리들은 정원 게임에서만 불린다.

/** 클러스터 팝. `step`이 오를수록 음계가 한 칸 위로 간다(0부터). */
export function playGardenPop(step: number): void {
  const c = live()
  if (c) garden.cues.pop(c, step)
}

/** 위 칸이 흙 위로 떨어진다. */
export function playGardenDrop(): void {
  const c = live()
  if (c) garden.cues.drop(c)
}

/** 판이 한 겹 자란다. `size`는 새 한 변, `newCells`는 새로 열린 칸 수. */
export function playGardenGrow(size: number, newCells: number): void {
  const c = live()
  if (!c) return
  duckBgmFor(0.5)
  garden.cues.grow(c, size, newCells)
}

/** 씨앗이 피며 배율이 곱해진다. */
export function playSeedBloom(tier: BloomTier): void {
  const c = live()
  if (c) garden.cues.bloom(c, tier)
}

/** 프리스핀 햇살. `grown`은 한 등급 오른 씨앗 수. */
export function playGardenSun(grown: number): void {
  const c = live()
  if (c) garden.cues.sun(c, grown)
}

/** 물방울 «퐁». */
export function playGardenWaterDrop(): void {
  const c = live()
  if (c) garden.cues.waterDrop(c)
}

// ── 무대 룰렛 (idol-stage-live) ────────────────────────────
// 음색은 IDOL_RECIPE와 같은 재료(손뼉·브라스·킥·코인 차임)다. 이 소리들은 무대 룰렛에서만 불린다 —
// 어떤 사건에 어떤 소리를 낼지는 `rouletteSfx.ts`가 정한다.

export type RouletteLandKind = 'coin' | 'stepUp' | 'encore' | 'grand'

/**
 * 포인터가 칸 경계를 지났다. `speed` 1(빠름)→0(멈추기 직전).
 * 느려질수록 조금 낮고 커진다 — «걸리나 안 걸리나»가 귀에도 들리게.
 */
export function playRouletteTick(speed: number): void {
  const c = live()
  if (!c) return
  const s = Math.min(1, Math.max(0, speed))
  // 회전 동안 음악을 낮춰 둔다(틱마다 다시 걸지 않고 꺼지기 직전에만 연장).
  if (c.currentTime >= duckUntil - 0.15) duckBgmFor(0.6)
  tone(c, { freq: 2800 - (1 - s) * 450, dur: 0.008, vol: 0.17 + (1 - s) * 0.12, type: 'square', attack: 0.001 })
  noise(c, { dur: 0.008, vol: 0.08, filter: 'highpass', freq: 5000 })
}

/** 룰렛이 선 칸의 종류별 소리. `lit`은 불 켜진 코인 칸(2배)이다. */
export function playRouletteLand(kind: RouletteLandKind, lit: boolean): void {
  const c = live()
  if (!c) return
  switch (kind) {
    case 'coin':
      coinChime(c, 0, 0.26)
      if (lit) run(c, (cc, f, at, v) => tone(cc, { freq: f, at, dur: 0.09, vol: v, type: 'square', attack: 0.001, lp: f * 2.4, lpTo: f }), IDOL_SCALE, [7, 9], 0.06, 0.1)
      break
    case 'stepUp':
      // 신스 상승 스윕과 탐 필 네 타(약 0.9초).
      riseSweep(c, 0, 0.8, 0.14)
      ;[190, 165, 140, 115].forEach((f, i) => tom(c, f, 0.12 + i * 0.14, 0.4))
      crash(c, 0.72, 0.1)
      break
    case 'encore':
      // «앙코르!» 박수: 다섯 번이 점점 빨라진다.
      clapRoll(c, 0.02, 5, 0.17, 0.08, 1.2)
      break
    case 'grand':
      duckBgmDeepFor(2.2)
      crash(c, 0, 0.22)
      idolKick(c, 0, 0.55)
      brassChord(c, [220, 440, 554.37, 659.25, 880], 0.02, 0.12, 1.1)
      brassChord(c, IDOL_CHORDS[3]!, 0.5, 0.1, 0.9)
      clapRoll(c, 0.3, 10, 0.2, 0.06, 0.4)
      sparkle(c, { dur: 1.6, density: 14, vol: 0.05, lo: 2800, hi: 5600, voice: 'spark' })
      break
  }
}

/** 응원봉 불빛 토큰이 칸을 켠다. 점등마다 반음씩 오른다(`index` 0부터). */
export function playRouletteLight(index: number): void {
  const c = live()
  if (!c) return
  const f = 1500 * 2 ** (Math.min(Math.max(0, Math.floor(index)), 11) / 12)
  tone(c, { freq: f * 0.85, slideTo: f * 1.25, dur: 0.12, vol: 0.26, type: 'sine', attack: 0.004 })
  tone(c, { freq: f * 2.01, at: 0.01, dur: 0.07, vol: 0.1, type: 'sine', attack: 0.002 })
}

/** 한 단계 위로 — 판이 줌인한다. 낮게 «웅» 하고 눌린다. */
export function playRouletteZoom(): void {
  const c = live()
  if (!c) return
  tone(c, { freq: 130, slideTo: 55, dur: 0.3, vol: 0.3, type: 'sine', attack: 0.004 })
  noise(c, { dur: 0.3, vol: 0.1, filter: 'lowpass', freq: 1800, sweepTo: 200, q: 0.8 })
}

/** 요약 카드가 뜬다. 큰 판이면 팡파르, 아니면 손뼉과 코인 차임. */
export function playRouletteSummary(big: boolean): void {
  const c = live()
  if (!c) return
  if (big) {
    duckBgmFor(2.2)
    idolKick(c, 0, 0.5)
    brassChord(c, IDOL_CHORDS[0]!, 0.02, 0.12, 0.8)
    brassChord(c, IDOL_CHORDS[3]!, 0.4, 0.1, 0.8)
    clapRoll(c, 0.1, 6, 0.14, 0.06, 0.4)
    crash(c, 0.02, 0.16)
  } else {
    ;[0, 0.16].forEach((at) => clap(c, at, 0.4))
    coinChime(c, 0.3, 0.22)
  }
}

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
  if (recipe.anticipate) {
    const bus = c.createGain()
    bus.connect(master)
    busOverride = bus
    let nodes: AudioScheduledSourceNode[] = []
    try {
      nodes = recipe.anticipate(c, lift, bus)
    } finally {
      busOverride = null
    }
    riser = { gain: bus, nodes }
    anticipating = true
    refreshDuck()
    return
  }
  const osc = c.createOscillator()
  osc.type = spec.wave
  osc.frequency.setValueAtTime(spec.from * lift, t)
  osc.frequency.exponentialRampToValueAtTime(spec.to * lift, t + 1.4)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(spec.lp * 0.4, t)
  lp.frequency.exponentialRampToValueAtTime(spec.lp, t + 1.4)
  const gain = c.createGain()
  gain.gain.value = 0
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
  if (recipe.riserLayer) extra.push(...recipe.riserLayer(c, t, gain))
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
    washGain.gain.value = 0
    washGain.gain.setValueAtTime(0.0001, t)
    washGain.gain.exponentialRampToValueAtTime(1.2, t + 1.4)
    wash.connect(bp).connect(washGain).connect(gain)
    wash.start(t)
    extra.push(wash)
  }
  osc.start(t)
  fifth.start(t)
  lfo.start(t)
  riser = { gain, nodes: [osc, lfo, ...extra] }
  riserExtraStop = recipe.riserExtra?.(c) ?? null
  anticipating = true
  refreshDuck()
}

export function stopAnticipation(): void {
  if (riserExtraStop) {
    riserExtraStop()
    riserExtraStop = null
  }
  if (anticipating) {
    anticipating = false
    refreshDuck()
  }
  if (!riser || !ctx) return
  const { gain, nodes } = riser
  riser = null
  const t = ctx.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setTargetAtTime(0.0001, t, 0.03)
  for (const n of nodes) n.stop(t + 0.15)
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

/**
 * 렌더러 `winTotal` 경로가 아닌 곳(빅윈 오버레이·프리스핀 결과 팝업)의 숫자 올라가기 소리.
 * 시작할 때 한 번 부르면 `durationMs` 동안의 틱과 마감음을 오디오 시계에 미리 깔아 두므로 rAF 틱에 기대지 않는다.
 * 건너뛰기를 누르거나 팝업이 닫히면 `stopCountUp()`으로 끊고, 마감음은 `playRollupEnd`로 따로 낸다.
 */
export function playCountUp(durationMs: number, tier: WinTier): void {
  const c = live()
  if (!c || !master) return
  stopCountUp()
  const dur = Math.min(8, Math.max(0.3, durationMs / 1000))
  const gap = Math.min(0.14, Math.max(0.07, dur / 36))
  const n = Math.max(2, Math.floor(dur / gap))
  const bus = c.createGain()
  bus.connect(master)
  busOverride = bus
  try {
    for (let i = 0; i < n; i++) {
      sched = i * gap
      recipe.tick(c, i / (n - 1))
    }
    sched = dur
    recipe.tickEnd(c, tier)
  } finally {
    sched = 0
    busOverride = null
  }
  // 끝까지 다 울렸으면 노드는 저절로 사라진다 — 참조만 놓는다.
  countUp = {
    bus,
    timer: setTimeout(() => {
      if (countUp?.bus === bus) countUp = null
    }, (dur + 2) * 1000),
  }
}

/** `playCountUp`이 미리 깔아 둔 틱을 끊는다. 깔린 게 없으면 아무 일도 없다. */
export function stopCountUp(): void {
  if (!countUp) return
  const { bus, timer } = countUp
  countUp = null
  clearTimeout(timer)
  if (ctx) {
    const t = ctx.currentTime
    bus.gain.cancelScheduledValues(t)
    bus.gain.setTargetAtTime(0.0001, t, 0.02)
  }
  setTimeout(() => bus.disconnect(), 200)
}

// ── 말판 보너스 (hanbok-night-market) ─────────────────────
// 음색은 HANBOK_RECIPE 와 같은 재료(가야금·해금·대금·장구·꽹과리·징)다. 이 소리들은 말판 화면에서만 불린다.
// 결과는 서버가 이미 정했고 소리는 그 결과를 한 번씩 보여 줄 뿐이다 — 입력으로 달라지는 소리는 없다.

/** 윷가락을 던진다: 막대가 공기를 가르는 «휙». 250ms 동안 잡음의 고역이 올라간다. */
export function playYutToss(): void {
  const c = live()
  if (!c) return
  swish(c, 0, 0.26, 0.7, 700, 4600)
}

/**
 * 윷가락 넷이 떨어진다: 나무 막대 «딱딱딱딱». 가락마다 음높이와 간격(25~60ms)이 다르다.
 * 납작한 면이 위로 나온 가락은 밝고 짧게, 둥근 면은 둔하고 길게 울린다. `steps`는 1(도)~5(모) — 모는 납작한 면이 하나도 없다.
 */
export function playYutLand(steps: number): void {
  const c = live()
  if (!c) return
  const flat = steps >= 5 ? 0 : Math.min(4, Math.max(0, Math.round(steps)))
  const at = [0, 0.034, 0.07, 0.124]
  const pitch = [1, 1.13, 0.93, 1.22]
  for (let i = 0; i < 4; i++) {
    const p = pitch[i]!
    // 막대가 바닥에 닿아 울리는 나무 몸통
    tone(c, { freq: 380 * p, at: at[i]!, dur: 0.12, vol: 0.14, type: 'sine', attack: 0.002 })
    if (i < flat) {
      tone(c, { freq: 1100 * p, slideTo: 600 * p, at: at[i]!, dur: 0.07, vol: 0.5, type: 'triangle', attack: 0.001 })
      noise(c, { at: at[i]!, dur: 0.04, vol: 0.4, filter: 'bandpass', freq: 1900, q: 1.5 })
    } else {
      tone(c, { freq: 560 * p, slideTo: 320 * p, at: at[i]!, dur: 0.09, vol: 0.55, type: 'triangle', attack: 0.001, lp: 2000, lpTo: 450 })
      noise(c, { at: at[i]!, dur: 0.045, vol: 0.3, filter: 'bandpass', freq: 850, q: 1.4 })
    }
  }
}

/**
 * 결과를 부른다: 도(1)→모(5)로 갈수록 오음계를 한 칸씩 올라간다. 윷(4)·모(5)는 꽹과리 장식과 «한 번 더» 반짝이 붙는다.
 * 가장 큰 소리는 늘 제 음 하나라서 스펙트럼 피크가 단계마다 오른다.
 */
export function playYutCall(steps: number): void {
  const c = live()
  if (!c) return
  const n = Math.min(5, Math.max(1, Math.round(steps)))
  gayageumVoice(c, HANBOK_SCALE[n - 1]!, 0.06, 0.34)
  if (n >= 2) gayageumVoice(c, HANBOK_SCALE[n - 2]!, 0, 0.08)
  if (n >= 4) {
    kkwaeng(c, 0.08, 0.14)
    hbSine(c, 1568, 0.3, 0.14, 0.05, { attack: 0.001 })
    hbSine(c, 2349.3, 0.36, 0.14, 0.05, { attack: 0.001 })
  }
}

/** 말이 한 칸 건넌다: 부드러운 나무 «톡». 칸마다 반음씩 올라간다(한 번 이동은 12칸까지만 오른다). */
export function playTokenHop(index: number): void {
  const c = live()
  if (!c) return
  const f = 520 * 2 ** (Math.min(12, Math.max(0, Math.floor(index))) / 12)
  tone(c, { freq: f, slideTo: f * 0.78, dur: 0.06, vol: 0.55, type: 'sine', attack: 0.002 })
  tone(c, { freq: f * 2.4, dur: 0.025, vol: 0.1, type: 'sine', attack: 0.001 })
  noise(c, { dur: 0.015, vol: 0.15, filter: 'bandpass', freq: 1500, q: 1.5 })
}

/** 엽전 칸: 짤랑. */
export function playTileCoin(): void {
  const c = live()
  if (!c) return
  yeopjeon(c, 0, 0.18)
}

/** 배수 칸: 해금이 짧게 올라 미끄러진다. `level`이 오를 때마다 오음계로 한 음 위다. */
export function playTileMult(level: number): void {
  const c = live()
  if (!c) return
  const n = Math.min(HANBOK_SCALE.length - 1, Math.max(0, Math.floor(level)) + 2)
  haegeum(c, HANBOK_SCALE[n]!, 0, 0.3, 0.16, { slide: 0.8, nasal: false, attack: 0.02 })
  gayageumHarmonic(c, HANBOK_SCALE[n]!, 0.12, 0.12)
}

/** 함정 칸: 바람 «쉬익», 등불이 꺼지는 «훅», 장구 «쿵»이 가라앉는다. */
export function playTileTrap(): void {
  const c = live()
  if (!c) return
  noise(c, { dur: 0.5, vol: 0.3, filter: 'lowpass', freq: 3500, sweepTo: 300, q: 0.8 })
  noise(c, { at: 0.18, dur: 0.12, vol: 0.18, filter: 'bandpass', freq: 700, q: 1.2 })
  gungpyeon(c, 0.3, 0.55)
  tone(c, { freq: 180, slideTo: 60, at: 0.3, dur: 0.3, vol: 0.2, type: 'sine', attack: 0.004 })
}

/** 지름길이 열렸다: 대금의 숨이 섞인 세 음이 올라간다. */
export function playFork(): void {
  const c = live()
  if (!c) return
  ;[3, 4, 5].forEach((n, i) => daegeum(c, HANBOK_SCALE[n]!, i * 0.13, 0.22, 0.3))
}

/** 결승: 징이 부풀고, 꽹과리가 몰아치고, 가야금이 끝까지 올라간다. */
export function playGoal(): void {
  const c = live()
  if (!c) return
  duckBgmFor(2.6)
  jing(c, 0, 0.4, 2.4, 0.05)
  let at = 0.05
  for (let i = 0; i < 10; i++) {
    kkwaeng(c, at, 0.24, i % 2 ? 1230 : 1180, 0.18)
    at += 0.12 - i * 0.007
  }
  run(c, (cc, f, a, v) => gayageumVoice(cc, f, a + 0.55, v), HANBOK_SCALE, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0.05, 0.22)
  jing(c, 1.2, 0.28, 1.6, 0.04)
}

/** 말판 요약 카드: 장구 «덩»(궁편+채편)과 가야금 화음. */
export function playBoardSummary(): void {
  const c = live()
  if (!c) return
  duckBgmFor(1.4)
  gungpyeon(c, 0, 0.45)
  chaepyeon(c, 0, 0.4)
  chord(c, gayageumVoice, [HANBOK_SCALE[0]!, HANBOK_SCALE[2]!, HANBOK_SCALE[3]!, HANBOK_SCALE[5]!, HANBOK_SCALE[7]!], 0.04, 0.22, 0.03)
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
let bgm: { preset: AudioPreset; voices: BgmVoices; seq: BgmSequencer; timer: ReturnType<typeof setInterval> } | null = null
let anticipating = false
let curtain = false
let duckUntil = 0
let deepDuckUntil = 0
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

/** 가장 큰 순간(룰렛 대상 등)에만 음악을 깊게(커튼 수준) 낮춘다. */
function duckBgmDeepFor(seconds: number): void {
  if (!ctx) return
  deepDuckUntil = Math.max(deepDuckUntil, ctx.currentTime + seconds)
  refreshDuck()
}

function refreshDuck(): void {
  if (!ctx || !bgmDuck) return
  const now = ctx.currentTime
  const target = curtain || now < deepDuckUntil ? BGM_DIP : anticipating || now < duckUntil ? BGM_DUCK : 1
  const g = bgmDuck.gain
  g.cancelScheduledValues(now)
  g.setTargetAtTime(target, now, target < g.value ? 0.06 : 0.5)
  if (duckTimer !== null) clearTimeout(duckTimer)
  const until = Math.max(duckUntil, deepDuckUntil)
  duckTimer = now < until ? setTimeout(refreshDuck, (until - now) * 1000 + 20) : null
}
