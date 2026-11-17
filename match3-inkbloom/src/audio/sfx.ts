import type { SfxName } from '../view/director'

const PENTA = [0, 2, 4, 7, 9]
const BASE_HZ = 262
const MAX_ARG = 10
const TAU = Math.PI * 2

type Mode = readonly [ratio: number, amp: number, decay: number]

const WOOD: readonly Mode[] = [[1, 1, 0.07], [2.4, 0.45, 0.04], [4.1, 0.18, 0.025]]
const BELL: readonly Mode[] = [[1, 1, 0.32], [2.01, 0.38, 0.2], [2.76, 0.22, 0.14], [4.2, 0.08, 0.07]]

function alloc(sr: number, dur: number): Float32Array<ArrayBuffer> {
  return new Float32Array(Math.ceil(sr * dur))
}

function addModes(out: Float32Array, sr: number, t0: number, f: number, modes: readonly Mode[], gain: number, slide = 0): void {
  const start = Math.floor(t0 * sr)
  for (const [ratio, amp, tau] of modes) {
    const fm = f * ratio
    if (fm > sr * 0.4) continue
    let ph = 0
    const n = Math.min(out.length - start, Math.floor(tau * 7 * sr))
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const a = Math.min(1, t / 0.003)
      const sm = a * a * (3 - 2 * a)
      ph += (TAU * fm * (1 + slide * Math.exp(-t / 0.05))) / sr
      out[start + i]! += Math.sin(ph) * amp * gain * sm * Math.exp(-t / tau)
    }
  }
}

function noise(n: number): Float32Array {
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = Math.random() * 2 - 1
  return x
}

function svfBand(x: Float32Array, sr: number, fc: (t: number) => number, q: number): Float32Array {
  const y = new Float32Array(x.length)
  let low = 0
  let band = 0
  const q1 = 1 / q
  for (let i = 0; i < x.length; i++) {
    const f1 = 2 * Math.sin((Math.PI * Math.min(fc(i / sr), sr / 6)) / sr)
    const high = x[i]! - low - q1 * band
    band += f1 * high
    low += f1 * band
    y[i] = band
  }
  return y
}

function lowpass(x: Float32Array, sr: number, fc: number): void {
  const a = 1 - Math.exp((-TAU * fc) / sr)
  let y = 0
  for (let i = 0; i < x.length; i++) {
    y += a * (x[i]! - y)
    x[i] = y
  }
}

function addNoise(out: Float32Array, sr: number, t0: number, dur: number, gain: number, fc: (t: number) => number, q: number, shape: (u: number) => number): void {
  const start = Math.floor(t0 * sr)
  const n = Math.min(out.length - start, Math.floor(dur * sr))
  if (n <= 0) return
  const b = svfBand(noise(n), sr, fc, q)
  const ramp = Math.floor(0.002 * sr)
  for (let i = 0; i < n; i++) out[start + i]! += b[i]! * gain * shape(i / n) * Math.min(1, i / ramp)
}

function echo(x: Float32Array, sr: number, ms: number, fb: number): void {
  const d = Math.floor((ms / 1000) * sr)
  for (let i = d; i < x.length; i++) x[i]! += x[i - d]! * fb
}

function finish(x: Float32Array<ArrayBuffer>, sr: number, peak: number): Float32Array<ArrayBuffer> {
  let m = 0
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]!))
  const g = m > 0 ? peak / m : 0
  const fade = Math.floor(0.008 * sr)
  for (let i = 0; i < x.length; i++) {
    const tail = x.length - i
    x[i]! *= g * (tail < fade ? tail / fade : 1)
  }
  return x
}

const swell = (u: number): number => Math.sin(Math.PI * u) ** 1.6
const decay = (u: number): number => (1 - u) ** 2

export function renderSfx(name: SfxName, arg: number, sr: number): Float32Array<ArrayBuffer> {
  const a = Math.min(MAX_ARG, Math.max(1, Math.floor(arg)))
  const step = PENTA[(a - 1) % PENTA.length]! + 12 * Math.floor((a - 1) / PENTA.length)
  const hz = BASE_HZ * 2 ** (step / 12)
  switch (name) {
    case 'swap': {
      const o = alloc(sr, 0.11)
      addModes(o, sr, 0, 330, WOOD, 0.6)
      addNoise(o, sr, 0, 0.08, 0.5, (t) => 1400 + 3000 * t, 1.2, decay)
      return finish(o, sr, 0.16)
    }
    case 'bad': {
      const o = alloc(sr, 0.2)
      addModes(o, sr, 0, 150, [[1, 1, 0.06], [1.6, 0.4, 0.04]], 0.8, 0.15)
      addNoise(o, sr, 0, 0.05, 0.25, () => 300, 1, decay)
      lowpass(o, sr, 900)
      return finish(o, sr, 0.2)
    }
    case 'pop': {
      const o = alloc(sr, 0.55)
      addModes(o, sr, 0, hz * 1.5, [[1, 1, 0.09]], 0.5, -0.35)
      addModes(o, sr, 0.005, hz, WOOD, 0.8)
      addModes(o, sr, 0.012, hz * 2, BELL, 0.28)
      addNoise(o, sr, 0, 0.1, 0.35, (t) => 1800 - 8000 * t, 0.9, decay)
      addNoise(o, sr, 0.04, 0.3, 0.1, () => 700, 0.8, swell)
      echo(o, sr, 38, 0.25)
      return finish(o, sr, 0.3)
    }
    case 'brush': {
      const o = alloc(sr, 0.85)
      addNoise(o, sr, 0, 0.5, 1, (t) => 380 + 1500 * (t / 0.5) ** 1.3, 1.6, swell)
      addNoise(o, sr, 0.02, 0.45, 0.4, (t) => 900 + 900 * t, 3, (u) => swell(u) * (0.6 + 0.4 * Math.sin(u * 90)))
      lowpass(o, sr, 3000)
      addModes(o, sr, 0.34, hz * 1.5, BELL, 0.35)
      addModes(o, sr, 0.03, hz * 0.5, [[1, 1, 0.18]], 0.25)
      echo(o, sr, 52, 0.3)
      return finish(o, sr, 0.34)
    }
    case 'shuffle': {
      const o = alloc(sr, 0.5)
      for (let k = 0; k < 7; k++) {
        const t0 = 0.02 + k * 0.05 + Math.random() * 0.02
        const f0 = 700 + Math.random() * 1400
        addNoise(o, sr, t0, 0.07, 0.7 - k * 0.04, () => f0, 3, decay)
      }
      addNoise(o, sr, 0, 0.42, 0.25, () => 900, 1.5, swell)
      lowpass(o, sr, 2200)
      return finish(o, sr, 0.18)
    }
    case 'win': {
      const o = alloc(sr, 2.2)
      const run = [...PENTA, 12]
      run.forEach((s, i) => addModes(o, sr, i * 0.12, BASE_HZ * 2 * 2 ** (s / 12), BELL, 0.5 + i * 0.05))
      addModes(o, sr, 0.62, BASE_HZ * 4 * 2 ** (4 / 12), BELL, 0.3)
      echo(o, sr, 90, 0.35)
      echo(o, sr, 143, 0.25)
      return finish(o, sr, 0.3)
    }
    case 'lose': {
      const o = alloc(sr, 1.3)
      ;[0, 3, 7].forEach((s, i) => addModes(o, sr, i * 0.18, BASE_HZ * 0.5 * 2 ** (-s / 12), [[1, 1, 0.14], [2.3, 0.3, 0.06]], 0.8, -0.05))
      lowpass(o, sr, 1200)
      echo(o, sr, 80, 0.3)
      return finish(o, sr, 0.22)
    }
  }
}

export class Sfx {
  private ac: AudioContext | null = null
  private cache = new Map<string, AudioBuffer>()
  muted = false

  unlock(): void {
    if (!this.ac) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ac = new Ctor()
    }
    if (this.ac.state === 'suspended') void this.ac.resume()
  }

  private buffer(ac: AudioContext, name: SfxName, arg: number): AudioBuffer {
    const key = name === 'pop' || name === 'brush' ? `${name}:${Math.min(MAX_ARG, Math.max(1, Math.floor(arg)))}` : name
    let buf = this.cache.get(key)
    if (!buf) {
      const data = renderSfx(name, arg, ac.sampleRate)
      buf = ac.createBuffer(1, data.length, ac.sampleRate)
      buf.copyToChannel(data, 0)
      this.cache.set(key, buf)
    }
    return buf
  }

  play(name: SfxName, arg = 1): void {
    const ac = this.ac
    if (!ac || this.muted) return
    const src = ac.createBufferSource()
    src.buffer = this.buffer(ac, name, arg)
    src.connect(ac.destination)
    src.onended = () => src.disconnect()
    src.start()
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    return this.muted
  }
}
