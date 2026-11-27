/**
 * aurora-ice-palace 전용 효과음(`frost` 프리셋). 극야의 얼음 궁전: 찬 바람·얼음 균열·비정수 배음 결정 소리.
 *
 * 얼굴 소리는 «쩌억»(얼림 시작의 균열)이다. 맑은 정수 배음 차임(글로켄·유리·종)을 피하고,
 * 비정수 배음 사인 묶음(결정)과 잡음 균열로 소리를 만든다.
 * `audio.ts`가 가진 합성 재료를 `createFrostAudio(kit)`로 넘겨받는다(값 import 없음 → 순환 의존 없음).
 * 기본 레시피(`recipe`)는 다른 프리셋과 같은 표에 꽂히고, 얼림 전용 소리(`cues`)는 `audio.ts`가 위임으로 내보낸다.
 */
import type { WinTier } from '@tgslot/renderer'
import type { Recipe, ToneOpts, Voice } from './audio'

interface NoiseOpts {
  at?: number
  dur: number
  vol: number
  filter: BiquadFilterType
  freq: number
  q?: number
  sweepTo?: number
}

export interface FrostKit {
  tone(c: AudioContext, o: ToneOpts): void
  noise(c: AudioContext, o: NoiseOpts): void
  live(): AudioContext | null
  duck(seconds: number): void
  /** 끊을 수 있는 반복 잡음(기대감 바람용). */
  noiseLoop(
    c: AudioContext,
    out: AudioNode,
    filter: BiquadFilterType,
    freq: number,
    q: number,
    vol: number,
  ): { src: AudioBufferSourceNode; f: BiquadFilterNode; g: GainNode } | null
}

/** E 도리안 한 옥타브 반(E4~F#5). 다른 프리셋보다 낮고 어둡다. */
export const FROST_SCALE = [329.63, 369.99, 392, 440, 493.88, 554.37, 587.33, 659.25, 739.99] as const

/** 새로 언 칸 «쩡»의 음높이가 오르는 단계 상한(3칸 → 19칸 = 16단). */
export const FROST_LAND_STEPS = 16

export type FrostBonusTier = 'low' | 'mid' | 'high'

export interface FrostCues {
  /** 대상이 얼음에 갇힌다: 얼음 균열 «쩌억». */
  freezeStart(c: AudioContext): void
  /** 새로 언 칸 «쩡». `count`(지금까지 언 칸 수)가 오를수록 반음씩 높아진다. */
  freezeLand(c: AudioContext, count: number): void
  /** 얼지 않은 칸이 돈다: 아주 작은 바람 틱(단계당 1회). */
  turnTick(c: AudioContext): void
  /** 눈금을 통과했다: 얼음 두 음 상행. */
  gauge(c: AudioContext): void
  /** 얼음 보너스 공개: 등급별 결정 화음(2/3/4음). */
  bonusReveal(c: AudioContext, tier: FrostBonusTier): void
  /** 오로라 단계가 오른다. */
  auroraRise(c: AudioContext): void
  /** 궁전 완성(19칸): 전체 결정 화음 + 부서지는 반짝임 + 배경음 덕킹. */
  palace(c: AudioContext): void
  /** 녹음: 아래로 부서지는 «사르르». */
  thaw(c: AudioContext): void
}

export interface FrostAudio {
  recipe: Recipe
  cues: FrostCues
}

const semitone = (n: number): number => 2 ** (n / 12)

/** 결정 소리를 이루는 비정수 배음 비(기음, 1.41, 2.24, 3.7). 정수 배음 종·글로켄과 갈린다. */
const CRYSTAL = [
  [1, 1, 0.55],
  [1.414, 0.62, 0.36],
  [2.236, 0.3, 0.18],
  [3.7, 0.12, 0.08],
] as const

export function createFrostAudio(kit: FrostKit): FrostAudio {
  const { tone, noise } = kit
  const S = FROST_SCALE

  // ── 음색 ────────────────────────────────────────────────

  /** 얼음 «팅»: 비정수 배음 사인 묶음이 빠르게 사라진다. `ring`이 길수록 오래 울린다. */
  const ping = (c: AudioContext, f: number, at: number, vol: number, ring = 0.5): void => {
    for (const [ratio, amp, dur] of CRYSTAL) {
      const pf = f * ratio
      if (pf > 9000) continue
      tone(c, { freq: pf, at, dur: dur * ring * 2, vol: vol * amp, type: 'sine', attack: 0.001 })
    }
    noise(c, { at, dur: 0.01, vol: vol * 0.18, filter: 'highpass', freq: 6500 })
  }

  const crystal: Voice = (c, f, at, vol) => ping(c, f, at, vol, 0.9)

  /** 얼음 균열: 대역 잡음이 아래로 쓸리고 낮은 쿵이 받치며 잔금 클릭이 흩어진다. */
  const crack = (c: AudioContext, at: number, vol: number, size = 1): void => {
    // 가늘고 긴 «지지직» 쓸림 + 아래로 떨어지는 잔금 클릭 무더기 + 낮은 울림(작게).
    noise(c, { at, dur: 0.34 * size, vol: 0.3 * vol, filter: 'bandpass', freq: 4200, sweepTo: 700, q: 3 })
    noise(c, { at, dur: 0.012, vol: 0.45 * vol, filter: 'highpass', freq: 4500 })
    tone(c, { freq: 70, slideTo: 44, at: at + 0.02, dur: 0.26 * size, vol: 0.22 * vol, type: 'sine', attack: 0.01 })
    const clicks = size > 0.7 ? 11 : 4
    for (let i = 0; i < clicks; i += 1) {
      const when = at + 0.02 + (i / clicks) ** 1.4 * 0.3 * size + Math.random() * 0.015
      noise(c, { at: when, dur: 0.006, vol: (0.2 - i * 0.008) * vol, filter: 'bandpass', freq: 5200 - i * 280 + Math.random() * 900, q: 3 })
    }
  }

  /** 눈 밟는 «뽀득». */
  const crunch = (c: AudioContext, at: number, vol: number): void => {
    noise(c, { at, dur: 0.05, vol: 0.22 * vol, filter: 'lowpass', freq: 1400, sweepTo: 500, q: 0.9 })
    noise(c, { at: at + 0.006, dur: 0.02, vol: 0.14 * vol, filter: 'bandpass', freq: 2600, q: 1.6 })
  }

  /** 찬 바람 한 줄기. */
  const wind = (c: AudioContext, at: number, dur: number, vol: number, from = 600, to = 3200): void => {
    noise(c, { at, dur, vol, filter: 'bandpass', freq: from, sweepTo: to, q: 0.8 })
  }

  /** 오로라 패드: 디튠 톱니가 로우패스를 열며 부푼다. */
  const swell = (c: AudioContext, freqs: readonly number[], at: number, dur: number, vol: number): void => {
    for (const f of freqs) {
      tone(c, { freq: f, at, dur, vol, type: 'sawtooth', attack: dur * 0.6, lp: 300, lpTo: 2200 })
      tone(c, { freq: f * 1.007, at, dur, vol: vol * 0.8, type: 'sawtooth', attack: dur * 0.6, lp: 300, lpTo: 2200 })
    }
  }

  const run = (c: AudioContext, voice: Voice, notes: readonly number[], step: number, vol: number, from = 0): void => {
    notes.forEach((n, i) => voice(c, S[n]!, from + i * step, vol))
  }

  /** 기간 동안 흩뿌리는 눈 반짝임(고역 짧은 핑). */
  const glitter = (c: AudioContext, dur: number, density: number, vol: number, lo: number, hi: number, from = 0): void => {
    const count = Math.min(40, Math.round(dur * density))
    for (let i = 0; i < count; i += 1) {
      const at = from + (i / count) * dur + Math.random() * 0.05
      const f = lo + Math.random() * (hi - lo)
      ping(c, f, at, vol * (0.6 + Math.random() * 0.4), 0.3)
    }
  }

  // ── 기본 레시피(다른 프리셋과 같은 표) ─────────────────────

  const recipe: Recipe = {
    loop: { hz: 1500, ticks: 11, tonal: 0.25, alt: 0.3, len: 0.016, vol: 0.14 },
    riser: { wave: 'triangle', from: 130, to: 520, pulseHz: 0.8, lp: 1200, vol: 0.11 },
    scale: S,
    anticipate(c, lift, bus) {
      // 낮은 바람 울음: 대역 잡음이 0.8Hz로 부풀었다 잦아들며 서서히 높아진다.
      const t = c.currentTime
      const nodes: AudioScheduledSourceNode[] = []
      const howl = kit.noiseLoop(c, bus, 'bandpass', 520 * lift, 0.9, 0.16)
      if (howl) {
        howl.f.frequency.setValueAtTime(520 * lift, t)
        howl.f.frequency.exponentialRampToValueAtTime(1150 * lift, t + 1.8)
        const lfo = c.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = 0.8
        const depth = c.createGain()
        depth.gain.value = 0.1
        lfo.connect(depth).connect(howl.g.gain)
        lfo.start(t)
        nodes.push(howl.src, lfo)
      }
      const drone = c.createOscillator()
      drone.type = 'sine'
      drone.frequency.setValueAtTime(82.4 * lift, t)
      const dg = c.createGain()
      dg.gain.value = 0
      dg.gain.setValueAtTime(0.0001, t)
      dg.gain.exponentialRampToValueAtTime(0.14, t + 0.6)
      drone.connect(dg).connect(bus)
      drone.start(t)
      nodes.push(drone)
      return nodes
    },
    spinStart(c) {
      wind(c, 0, 0.4, 0.5, 600, 3200)
      crunch(c, 0.08, 2)
      crunch(c, 0.2, 1.6)
    },
    reelStop(c, lift) {
      // 얼음 «똑»: 짧은 잡음 클릭 + 2.4kHz 비정수 핑. 가운데 → 안쪽 → 바깥으로 갈수록 `lift`가 반음씩 올라간다.
      noise(c, { dur: 0.012, vol: 0.34, filter: 'bandpass', freq: 3000 * lift, q: 1.8 })
      tone(c, { freq: 150 * lift, slideTo: 95 * lift, dur: 0.05, vol: 0.32, type: 'sine', attack: 0.002 })
      ping(c, 2400 * lift, 0.006, 0.2, 0.3)
    },
    winSmall(c, rollup) {
      // 낮은 균열 한 번 + 바람결 + 느리게 울리는 낮은 결정 두 음. 높은 팅 2음(글로켄·유리 계열)과 갈린다.
      crack(c, 0, 0.55, 0.45)
      wind(c, 0.05, 0.4, 0.22, 900, 2600)
      ping(c, S[1]!, 0.1, 0.4, 1.4)
      ping(c, S[3]! * 1.414, 0.2, 0.34, 1.4)
      glitter(c, Math.min(rollup, 1), 5, 0.07, 1800, 3800, 0.3)
    },
    winBig(c, tier: Exclude<WinTier, 'none'>, rollup) {
      // 오로라 합창 패드가 길게 부풀고, 마루에서 얼음이 갈라지며 결정 화음이 내려앉는다. 등급이 오를수록 화음이 두꺼워진다.
      const crest = 0.7
      const notes = { big: 3, mega: 4, epic: 5, max: 5 }[tier]
      swell(c, [82.41, 123.47, 164.81, 246.94], 0, crest + 0.3, 0.09)
      crack(c, crest, 1, 1.3)
      tone(c, { freq: 62, slideTo: 38, at: crest, dur: 0.9, vol: 0.4, type: 'sine', attack: 0.004 })
      noise(c, { at: crest, dur: 0.8, vol: 0.12, filter: 'lowpass', freq: 700, sweepTo: 180, q: 0.7 })
      ;[S[7]!, S[5]!, S[3]!, S[1]!, S[0]!].slice(0, notes).forEach((f, i) => crystal(c, f, crest + 0.04 + i * 0.07, 0.34))
      if (tier !== 'big') crystal(c, S[4]! * 1.414, crest + 0.4, 0.22)
      glitter(c, rollup, tier === 'big' ? 4 : 7, 0.06, 1800, 4200, crest + 0.3)
    },
    feature(c) {
      // 서리가 번진다: 잔금 클릭이 점점 촘촘해지고 패드가 부풀며, 결정 화음이 한꺼번에 울린다.
      for (let i = 0; i < 16; i += 1) {
        const at = 0.7 * (i / 16) ** 0.7
        noise(c, { at, dur: 0.008, vol: 0.12 + i * 0.01, filter: 'bandpass', freq: 2400 + i * 260, q: 2.2 })
      }
      noise(c, { dur: 0.9, vol: 0.1, filter: 'highpass', freq: 2200, sweepTo: 6500, q: 0.7 })
      swell(c, [123.47, 185, 246.94], 0, 0.95, 0.07)
      ;[S[0]!, S[2]!, S[4]!, S[7]!].forEach((f, i) => crystal(c, f, 0.75 + i * 0.03, 0.28))
      crack(c, 0.72, 0.6, 0.7)
    },
    mutation(c) {
      crack(c, 0, 0.4, 0.4)
      ping(c, S[6]!, 0.05, 0.3, 1.2)
    },
    tick(c, progress) {
      // 짧은 얼음 클릭: 대역 잡음 + 낮은 사인 «톡». 높이는 진행률.
      noise(c, { dur: 0.012, vol: 0.12, filter: 'bandpass', freq: 2600 + progress * 1800, q: 2 })
      tone(c, { freq: 900 + progress * 500, dur: 0.02, vol: 0.05, type: 'triangle', attack: 0.001 })
    },
    tickEnd(c, tier) {
      const chord = tier === 'none' ? [2, 4] : [1, 3, 5]
      chord.forEach((n, i) => crystal(c, S[n]!, i * 0.025, 0.24))
      crack(c, 0, 0.3, 0.35)
    },
    gambleToss(c) {
      wind(c, 0, 0.3, 0.12, 900, 4000)
      ping(c, 2800, 0.02, 0.2, 0.4)
    },
    gambleWin(c) {
      run(c, crystal, [3, 5, 7], 0.07, 0.2)
      glitter(c, 0.5, 18, 0.07, 3000, 6000)
    },
    gambleLose(c) {
      tone(c, { freq: 200, slideTo: 80, dur: 0.28, vol: 0.3, type: 'sine', attack: 0.004 })
      noise(c, { dur: 0.2, vol: 0.12, filter: 'lowpass', freq: 1400, sweepTo: 300 })
    },
  }

  // ── 얼림 전용 소리 ──────────────────────────────────────

  const cues: FrostCues = {
    freezeStart(c) {
      crack(c, 0, 1, 1)
      ping(c, S[2]! / 2, 0.12, 0.2, 0.9)
    },
    freezeLand(c, count) {
      const n = Math.min(Math.max(0, Math.floor(count) - 3), FROST_LAND_STEPS)
      crack(c, 0, 0.5, 0.45)
      ping(c, 1500 * semitone(n), 0.02, 0.3, 0.45)
    },
    turnTick(c) {
      noise(c, { dur: 0.05, vol: 0.06, filter: 'bandpass', freq: 1200, sweepTo: 1800, q: 1 })
    },
    gauge(c) {
      ping(c, S[5]!, 0, 0.26, 0.6)
      ping(c, S[7]!, 0.09, 0.28, 0.7)
    },
    bonusReveal(c, tier) {
      const chord = { low: [3, 5], mid: [2, 4, 6], high: [0, 2, 4, 7] }[tier]
      chord.forEach((n, i) => crystal(c, S[n]!, i * 0.06, 0.24))
      if (tier === 'high') swell(c, [82.41, 123.47], 0, 0.7, 0.05)
    },
    auroraRise(c) {
      swell(c, [123.47, 185, 246.94], 0, 0.9, 0.05)
      glitter(c, 0.8, 12, 0.08, 3000, 6500, 0.35)
    },
    palace(c) {
      kit.duck(2)
      swell(c, [82.41, 123.47, 164.81, 246.94], 0, 0.8, 0.06)
      ;[0, 2, 4, 6, 7, 8].forEach((n, i) => crystal(c, S[n]!, 0.5 + i * 0.045, 0.26))
      ping(c, S[8]! * 2.236, 0.78, 0.14, 0.9)
      glitter(c, 1.3, 22, 0.09, 2800, 7000, 0.6)
      crack(c, 0.5, 0.5, 1)
    },
    thaw(c) {
      noise(c, { dur: 0.7, vol: 0.16, filter: 'highpass', freq: 5800, sweepTo: 1300, q: 0.7 })
      tone(c, { freq: 1100, slideTo: 330, dur: 0.6, vol: 0.06, type: 'sine', attack: 0.02 })
    },
  }

  return { recipe, cues }
}
