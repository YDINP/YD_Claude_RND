/**
 * greenhouse-garden 전용 효과음(`garden` 프리셋). 유리 온실의 흙·잎·물: 나무 칼림바, 대나무 윈드차임, 하프 글리산도, 잎 바스락.
 *
 * `audio.ts`가 가진 합성 재료(tone·noise·live·덕킹)를 `createGardenAudio(kit)`로 넘겨받는다.
 * 이 파일은 `audio.ts`를 값으로 import 하지 않으므로(타입만) 순환 의존이 없다.
 * 기본 레시피(`recipe`)는 다른 프리셋과 같은 표에 꽂히고, 정원 전용 소리(`cues`)는 `audio.ts`가 위임으로 내보낸다.
 * 음색 성격: 종·금속(bell·deepsea)이 아니라 «나무 혀와 대나무 관, 마른 잎 소리». 모든 소리는 짧게 끊기고 잔향이 거의 없다.
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

/** `audio.ts`가 넘겨주는 합성 재료. */
export interface SynthKit {
  tone(c: AudioContext, o: ToneOpts): void
  noise(c: AudioContext, o: NoiseOpts): void
  /** 소리를 내도 되는 컨텍스트(잠금·음소거 중이면 null). */
  live(): AudioContext | null
  /** 배경음을 잠깐 낮춘다. */
  duck(seconds: number): void
}

/** F 장조 펜타토닉(F4~C6). 서양 기타(E)·신사 고토와 다른 조, 종·마림바보다 낮고 따뜻하다. */
export const GARDEN_SCALE = [349.23, 392, 440, 523.25, 587.33, 698.46, 783.99, 880, 1046.5] as const

/** 팝 음이 단계마다 오르는 칸 수(0부터 8까지, 그 뒤는 맨 위 음). */
export const GARDEN_POP_STEPS = GARDEN_SCALE.length

/** 씨앗 개화 등급: 배율이 클수록 음역이 높고 길다. */
export type BloomTier = 'sprout' | 'bud' | 'bloom'

/** 정원 전용 소리. 모두 컨텍스트를 받아 그 자리에서 합성한다. */
export interface GardenCues {
  /** 클러스터가 터진다: 칼림바 한 음 + 잎 바스락. `step`이 오를수록 음계가 한 칸 위. */
  pop(c: AudioContext, step: number): void
  /** 위 칸이 흙 위로 떨어진다: 낮고 작은 «톡». */
  drop(c: AudioContext): void
  /** 판이 한 겹 자란다: 대나무 윈드차임 상행 4음 + 흙 터짐 저역 + 덮개 나무 톡(최대 6번). `size`가 클수록 시작음이 위. */
  grow(c: AudioContext, size: number, newCells: number): void
  /** 씨앗이 피며 배율이 곱해진다: 하프 글리산도 + 맑은 한 음. */
  bloom(c: AudioContext, tier: BloomTier): void
  /** 프리스핀 햇살: 따뜻한 패드 스웰 + 높은 칼림바 트릴. `grown`이 있으면 씨앗 등급 오름 두 음이 먼저 난다. */
  sun(c: AudioContext, grown: number): void
  /** 물방울 «퐁» 두 겹. */
  waterDrop(c: AudioContext): void
}

export interface GardenAudio {
  recipe: Recipe
  cues: GardenCues
}

/** 가장 큰 씨앗 배율 → 개화 등급. */
export function bloomTierOf(multiplier: number): BloomTier {
  if (multiplier >= 10) return 'bloom'
  if (multiplier >= 4) return 'bud'
  return 'sprout'
}

export function createGardenAudio(kit: SynthKit): GardenAudio {
  const { tone, noise } = kit
  const S = GARDEN_SCALE

  // ── 음색 ────────────────────────────────────────────────

  /** 나무 칼림바: 기음이 짧게 울고(0.3s) 비정수 금속 혀 배음(x5.4)이 톡 튄다. 엄지 튕김은 작은 저대역 잡음. */
  const kalimba: Voice = (c, f, at, vol) => {
    tone(c, { freq: f, at, dur: 0.34, vol, type: 'sine', attack: 0.002 })
    tone(c, { freq: f * 2.003, at, dur: 0.13, vol: vol * 0.22, type: 'sine', attack: 0.002 })
    tone(c, { freq: f * 5.4, at, dur: 0.045, vol: vol * 0.1, type: 'sine', attack: 0.001 })
    noise(c, { at, dur: 0.012, vol: vol * 0.14, filter: 'bandpass', freq: 1400, q: 1.4 })
  }

  /** 대나무 관 윈드차임: 삼각파 기음이 빠르게 닫히는 필터를 지나 «또로롱» 마른 소리가 난다. 종과 달리 배음이 거의 없다. */
  const bamboo: Voice = (c, f, at, vol) => {
    tone(c, { freq: f, at, dur: 0.22, vol, type: 'triangle', attack: 0.002, lp: 3200, lpTo: 600 })
    noise(c, { at, dur: 0.01, vol: vol * 0.12, filter: 'bandpass', freq: 2200, q: 2 })
  }

  /** 잎 바스락: 마른 잎이 스치는 2~6kHz 대역 잡음. */
  const rustle = (c: AudioContext, at: number, vol: number, dur = 0.045): void => {
    noise(c, { at, dur, vol, filter: 'bandpass', freq: 2800, sweepTo: 5600, q: 0.8 })
  }

  /** 흙 «톡»: 낮은 사인이 떨어지고 잡음 한 톨. */
  const soil = (c: AudioContext, at: number, vol: number, f = 110): void => {
    tone(c, { freq: f, slideTo: f * 0.6, at, dur: 0.07, vol, type: 'sine', attack: 0.002 })
    noise(c, { at, dur: 0.02, vol: vol * 0.45, filter: 'lowpass', freq: 600, q: 0.7 })
  }

  /** 맑은 나무 피리 한 음: 사인 + 숨 잡음, 느린 열림. 승리 화음의 윗선율. */
  const flute: Voice = (c, f, at, vol) => {
    tone(c, { freq: f, at, dur: 0.5, vol, type: 'sine', attack: 0.06 })
    noise(c, { at, dur: 0.4, vol: vol * 0.16, filter: 'bandpass', freq: f * 2, q: 1.6 })
  }

  /** 하프 글리산도: 음계를 빠르게 쓸어 올린다. */
  const glissando = (c: AudioContext, from: number, to: number, gap: number, vol: number, at = 0): void => {
    for (let n = from; n <= to; n += 1) {
      const t = at + (n - from) * gap
      tone(c, { freq: S[n]!, at: t, dur: 0.38, vol, type: 'sine', attack: 0.002 })
      tone(c, { freq: S[n]! * 2, at: t, dur: 0.14, vol: vol * 0.2, type: 'sine', attack: 0.002 })
    }
  }

  const run = (c: AudioContext, voice: Voice, notes: readonly number[], step: number, vol: number, from = 0): void => {
    notes.forEach((n, i) => voice(c, S[n]!, from + i * step, vol))
  }

  /** 기간 동안 흩뿌리는 잎·칼림바 낱알. */
  const scatter = (c: AudioContext, dur: number, density: number, vol: number, from = 0): void => {
    const count = Math.min(40, Math.round(dur * density))
    for (let i = 0; i < count; i += 1) {
      const at = from + (i / count) * dur + Math.random() * 0.05
      const v = vol * (0.6 + Math.random() * 0.4)
      if (i % 3 === 0) rustle(c, at, v * 0.9, 0.03)
      else kalimba(c, S[Math.floor(Math.random() * S.length)]! * 2, at, v)
    }
  }

  /** 레인스틱: 짧은 낱알 잡음이 높은 대역에서 낮은 대역으로 쏟아진다. */
  const rainstick = (c: AudioContext, dur: number, vol: number, at = 0): void => {
    const count = Math.min(30, Math.round(dur * 36))
    for (let i = 0; i < count; i += 1) {
      const t = at + (i / count) * dur + Math.random() * 0.02
      noise(c, { at: t, dur: 0.02, vol: vol * (0.5 + Math.random() * 0.5), filter: 'bandpass', freq: 5200 - (i / count) * 2600, q: 3 })
    }
  }

  // ── 기본 레시피(다른 프리셋과 같은 표) ─────────────────────

  const recipe: Recipe = {
    loop: { hz: 1250, ticks: 12, tonal: 0.35, alt: 0.3, len: 0.02, vol: 0.1 },
    riser: { wave: 'triangle', from: 196, to: 523, pulseHz: 3, lp: 1400, vol: 0.12 },
    scale: S,
    anticipate(c, lift, bus) {
      // 물방울이 점점 빨라지며 음계를 타고 오른다(칼림바 낱알) + 아래서 부풀어 오르는 흙의 웅웅거림.
      let at = 0
      let gap = 0.22
      let k = 0
      while (at < 3.4) {
        kalimba(c, S[Math.min(S.length - 1, Math.floor(k / 2))]! * 2 * lift, at, 0.12 + Math.min(0.1, at * 0.04))
        if (k % 2 === 1) rustle(c, at, 0.05, 0.03)
        at += gap
        gap = Math.max(0.05, gap * 0.9)
        k += 1
      }
      const t0 = c.currentTime
      const hum = c.createOscillator()
      hum.type = 'sine'
      hum.frequency.setValueAtTime(98 * lift, t0)
      hum.frequency.exponentialRampToValueAtTime(247 * lift, t0 + 3.4)
      const g = c.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 2.4)
      hum.connect(g).connect(bus)
      hum.start(t0)
      hum.stop(t0 + 4)
      return [hum]
    },
    spinStart(c) {
      rustle(c, 0, 0.16, 0.3)
      ;[0.03, 0.09, 0.15, 0.22].forEach((at, i) => bamboo(c, S[i]! * 1.5, at, 0.16))
    },
    reelStop(c, lift) {
      tone(c, { freq: 180 * lift, slideTo: 100 * lift, dur: 0.07, vol: 0.5, type: 'sine', attack: 0.003 })
      noise(c, { dur: 0.018, vol: 0.14, filter: 'bandpass', freq: 1500, q: 1.2 })
      tone(c, { freq: 1180 * lift, at: 0.03, dur: 0.05, vol: 0.1, type: 'triangle', attack: 0.002, lp: 2400, lpTo: 500 })
    },
    winSmall(c, rollup) {
      run(c, kalimba, [3, 5, 7], 0.085, 0.55)
      rustle(c, 0.1, 0.14, 0.08)
      scatter(c, Math.min(rollup, 1.1), 8, 0.12)
    },
    winBig(c, tier: Exclude<WinTier, 'none'>, rollup) {
      // 비가 그치며 꽃이 피듯: 레인스틱 → 하프 글리산도 → 피리 화음. 등급이 오를수록 글리산도가 길고 피리가 많다.
      const crest = 0.5
      const top = { big: 5, mega: 6, epic: 7, max: 8 }[tier]
      rainstick(c, crest, 0.2)
      tone(c, { freq: 80, slideTo: 180, dur: crest + 0.05, vol: 0.4, type: 'sine', attack: 0.3 })
      glissando(c, 0, top, 0.045, 0.42, crest - 0.05)
      const chord = [S[3]!, S[5]!, S[7]!, S[8]! * 1.25].slice(0, tier === 'big' ? 3 : 4)
      chord.forEach((f, i) => flute(c, f, crest + top * 0.045 + i * 0.05, 0.4))
      scatter(c, rollup, tier === 'big' ? 12 : 20, 0.22, crest + 0.2)
    },
    feature(c) {
      // 흙이 부풀고 대나무 윈드차임이 올라간 뒤 하프가 쓸어 올린다.
      rainstick(c, 0.7, 0.16)
      tone(c, { freq: 100, slideTo: 330, dur: 0.85, vol: 0.3, type: 'sine', attack: 0.08 })
      run(c, bamboo, [0, 1, 2, 3, 4, 5], 0.075, 0.38, 0.1)
      glissando(c, 3, 8, 0.05, 0.3, 0.6)
    },
    mutation(c) {
      // 꽃잎이 흩날리듯 대나무 음이 빠르게 내려온다.
      rainstick(c, 0.16, 0.14)
      ;[7, 5, 3].forEach((n, i) => bamboo(c, S[n]! * 2, 0.02 + i * 0.045, 0.3))
    },
    tick(c, progress) {
      // 나무 «톡»: 굴러가는 열매 소리. 높이는 진행률.
      const f = 520 + progress * 260
      tone(c, { freq: f * 1.7, slideTo: f, dur: 0.03, vol: 0.2, type: 'triangle', attack: 0.001, lp: 1800, lpTo: 500 })
      noise(c, { dur: 0.008, vol: 0.05, filter: 'bandpass', freq: 1200, q: 2 })
    },
    tickEnd(c, tier) {
      run(c, kalimba, tier === 'none' ? [4, 6] : [4, 6, 8], 0.065, 0.45)
      rustle(c, 0.18, 0.1, 0.06)
    },
    // 두 배 도전(병합 때 공용 Recipe에 생긴 칸). greenhouse-garden은 두 배 도전이 없어 지금은 불리지 않는다.
    gambleToss(c) {
      scatter(c, 0.35, 20, 0.07)
      kalimba(c, 2093, 0.02, 0.24)
    },
    gambleWin(c) {
      run(c, kalimba, [4, 6, 8], 0.06, 0.22)
      glissando(c, 5, 8, 0.04, 0.12, 0.2)
    },
    gambleLose(c) {
      soil(c, 0, 0.3, 140)
      tone(c, { freq: 233, slideTo: 175, at: 0.05, dur: 0.3, vol: 0.14, type: 'sine', attack: 0.01 })
    },
  }

  // ── 정원 전용 소리 ──────────────────────────────────────

  const cues: GardenCues = {
    pop(c, step) {
      const n = Math.min(Math.max(0, Math.floor(step)), GARDEN_POP_STEPS - 1)
      kalimba(c, S[n]! * 2, 0, 0.42)
      rustle(c, 0.005, 0.1)
    },
    drop(c) {
      soil(c, 0, 0.16, 90)
    },
    grow(c, size, newCells) {
      const base = Math.min(Math.max(0, Math.floor(size) - 5), 3)
      ;[0, 1, 2, 3].forEach((i) => bamboo(c, S[base + i]! * 2, 0.12 + i * 0.075, 0.2))
      soil(c, 0, 0.5, 70)
      noise(c, { dur: 0.16, vol: 0.2, filter: 'lowpass', freq: 500, sweepTo: 140, q: 0.8 })
      // 덮개 나무 톡: 칸 수만큼이 아니라 한 성장에 최대 6번으로 묶는다.
      const taps = Math.min(6, Math.max(2, Math.ceil(newCells / 6)))
      for (let i = 0; i < taps; i += 1) {
        tone(c, { freq: 520 + i * 40, slideTo: 330, at: 0.18 + i * 0.055, dur: 0.03, vol: 0.12, type: 'triangle', attack: 0.001, lp: 1800, lpTo: 500 })
      }
    },
    bloom(c, tier) {
      const top = { sprout: 5, bud: 6, bloom: 8 }[tier]
      const len = { sprout: 0.38, bud: 0.55, bloom: 0.8 }[tier]
      glissando(c, 1, top, 0.04, 0.2)
      const f = S[top]! * 2
      tone(c, { freq: f, at: (top - 1) * 0.04, dur: len, vol: 0.2, type: 'sine', attack: 0.004 })
      tone(c, { freq: f * 3.01, at: (top - 1) * 0.04, dur: len * 0.25, vol: 0.05, type: 'sine', attack: 0.002 })
      if (tier === 'bloom') {
        kit.duck(0.9)
        flute(c, S[5]!, 0.1, 0.12)
        flute(c, S[7]!, 0.14, 0.1)
      }
    },
    sun(c, grown) {
      kit.duck(1.2)
      const lead = grown > 0 ? 0.26 : 0
      if (grown > 0) {
        kalimba(c, S[3]! * 2, 0, 0.26)
        kalimba(c, S[5]! * 2, 0.11, 0.26)
      }
      // 따뜻한 패드 스웰(F·A·C 사인).
      ;[349.23, 440, 523.25].forEach((f) => tone(c, { freq: f, at: lead, dur: 0.75, vol: 0.09, type: 'sine', attack: 0.4, lp: 1600, lpTo: 900 }))
      // 높은 칼림바 트릴.
      for (let i = 0; i < 6; i += 1) kalimba(c, (i % 2 === 0 ? S[7]! : S[8]!) * 2, lead + 0.3 + i * 0.065, 0.14)
    },
    waterDrop(c) {
      tone(c, { freq: 880, slideTo: 484, dur: 0.09, vol: 0.26, type: 'sine', attack: 0.003 })
      tone(c, { freq: 1320, slideTo: 748, at: 0.045, dur: 0.07, vol: 0.14, type: 'sine', attack: 0.003 })
    },
  }

  return { recipe, cues }
}
