/**
 * kraken-cove 전용 효과음(`deepsea` 프리셋). 바닷속 보물 동굴: 물방울·소나·금화·종.
 *
 * `audio.ts`가 가진 합성 재료(tone·noise·live·덕킹)를 `createDeepseaAudio(kit)`로 넘겨받는다.
 * 이 파일은 `audio.ts`를 값으로 import 하지 않으므로(타입만) 순환 의존이 없다.
 * 기본 레시피(`recipe`)는 다른 프리셋과 같은 표에 꽂히고, 코인 리스핀 전용 소리(`cues`)는 `audio.ts`가 위임으로 내보낸다.
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

/** D 장조 펜타토닉 2옥타브(D4~B5). 종·칼림바 계열 음계다. 캔디(G5~E7)보다 한 옥타브쯤 낮고 둥글다. */
export const DEEPSEA_SCALE = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880, 987.77] as const

/** 코인 고정음이 한 라운드 안에서 올라가는 최대 단계(반음 12단 = 한 옥타브). */
export const DEEPSEA_PIN_STEPS = 12

export type TreasureSize = 'small' | 'medium' | 'large'

/** 코인 리스핀 전용 소리. 모두 컨텍스트를 받아 그 자리에서 합성한다. */
export interface DeepseaCues {
  /** 진입 판의 코인 한 알이 «칭» 한다. `index`가 오를수록 반음씩 높아진다(7단 상한). */
  coinLand(c: AudioContext, index: number): void
  /** 빈 칸이 돌기 시작한다: 낮은 소나 «핑» + 메아리 두 번. */
  respinSonar(c: AudioContext): void
  /** 새 코인이 고정된다: «철컥» + «칭». `step`이 오를수록 반음씩 높아진다(12단 상한). */
  coinPin(c: AudioContext, step: number): void
  /** 남은 횟수가 다시 차올랐다: 소나 세 음 상행. */
  counterReset(c: AudioContext): void
  /** 마지막 한 번 남았다: 심장 박동 두 번. */
  lastRespin(c: AudioContext): void
  /** 촉수가 줄을 감는다(`start`) / 감긴 줄이 두 배로 확정된다(`end`). */
  tentacleWrap(c: AudioContext, phase: 'start' | 'end'): void
  /** 보물 코인이 합쳐진다. 크기마다 종 화음이 2/3/4음으로 쌓인다. */
  treasure(c: AudioContext, size: TreasureSize): void
  /** 정산 중 숫자 코인 한 알이 합계로 날아간다: 짧은 금화 «틱». `progress`(0..1)가 오를수록 높아진다. */
  settleTick(c: AudioContext, progress: number): void
  /** 15칸을 채워 최고 보물이 터진다: 짧은 팡파르. */
  topTreasure(c: AudioContext): void
}

export interface DeepseaAudio {
  recipe: Recipe
  cues: DeepseaCues
}

const semitone = (n: number): number => 2 ** (n / 12)

export function createDeepseaAudio(kit: SynthKit): DeepseaAudio {
  const { tone, noise } = kit
  const S = DEEPSEA_SCALE

  // ── 음색 ────────────────────────────────────────────────

  /** 물방울 «똑»: 위에서 아래로 떨어지는 사인 + 아주 짧은 고역 잡음. */
  const drop: Voice = (c, f, at, vol) => {
    tone(c, { freq: f, slideTo: f * 0.35, at, dur: 0.045, vol, type: 'sine', attack: 0.002 })
    noise(c, { at, dur: 0.012, vol: vol * 0.22, filter: 'highpass', freq: 5500 })
  }

  /** 기포 «뽀글»: 아래에서 위로 올라가는 사인. */
  const bubble: Voice = (c, f, at, vol) => {
    tone(c, { freq: f * 0.7, slideTo: f * 1.5, at, dur: 0.06, vol, type: 'sine', attack: 0.002 })
  }

  /** 둥근 종(핸드팬·행드럼 결): 기음이 길게 울고 두 배음이 받치며, 살짝 어긋난 기음이 느리게 일렁인다. 글로켄·마림바와 다른 정수 배음 계열. */
  const hang: Voice = (c, f, at, vol) => {
    tone(c, { freq: f, at, dur: 0.95, vol, type: 'sine', attack: 0.004 })
    tone(c, { freq: f * 1.005, at, dur: 0.7, vol: vol * 0.5, type: 'sine', attack: 0.004 })
    tone(c, { freq: f * 2, at, dur: 0.45, vol: vol * 0.38, type: 'sine', attack: 0.003 })
    tone(c, { freq: f * 3.02, at, dur: 0.16, vol: vol * 0.14, type: 'sine', attack: 0.002 })
  }

  /** 금화 «칭»: 비정수 배음 셋이 80ms 안에 사라지는 금속 소리(기준 2.1kHz·3.3kHz). */
  const coin: Voice = (c, f, at, vol) => {
    tone(c, { freq: f, at, dur: 0.085, vol, type: 'sine', attack: 0.001 })
    tone(c, { freq: f * 1.571, at, dur: 0.07, vol: vol * 0.6, type: 'sine', attack: 0.001 })
    tone(c, { freq: f * 2.9, at, dur: 0.03, vol: vol * 0.22, type: 'sine', attack: 0.001 })
    noise(c, { at, dur: 0.008, vol: vol * 0.18, filter: 'bandpass', freq: 6500, q: 1.5 })
  }

  /** 소나 «핑»: 부드럽게 열리는 사인 + 점점 작아지는 메아리 두 번. */
  const sonar: Voice = (c, f, at, vol) => {
    tone(c, { freq: f, at, dur: 0.5, vol, type: 'sine', attack: 0.012 })
    tone(c, { freq: f, at: at + 0.24, dur: 0.4, vol: vol * 0.42, type: 'sine', attack: 0.012, lp: 1800 })
    tone(c, { freq: f, at: at + 0.48, dur: 0.32, vol: vol * 0.18, type: 'sine', attack: 0.012, lp: 1400 })
  }

  /** 금관풍 화음 한 줄: 톱니파가 열렸다 닫힌다. 팡파르용. */
  const brass = (c: AudioContext, freqs: readonly number[], at: number, dur: number, vol: number): void => {
    for (const f of freqs) tone(c, { freq: f, at, dur, vol, type: 'sawtooth', attack: 0.02, lp: 2600, lpTo: 700 })
  }

  const run = (c: AudioContext, voice: Voice, notes: readonly number[], step: number, vol: number, from = 0): void => {
    notes.forEach((n, i) => voice(c, S[n]!, from + i * step, vol))
  }

  /** 기간 동안 흩뿌리는 기포·금화 소리. */
  const sparkle = (c: AudioContext, kind: 'bubble' | 'coin', dur: number, density: number, vol: number, lo: number, hi: number, from = 0): void => {
    const count = Math.min(48, Math.round(dur * density))
    for (let i = 0; i < count; i += 1) {
      const at = from + (i / count) * dur + Math.random() * 0.05
      const f = lo + Math.random() * (hi - lo)
      const v = vol * (0.6 + Math.random() * 0.4)
      if (kind === 'bubble') bubble(c, f, at, v)
      else coin(c, f, at, v)
    }
  }

  // ── 기본 레시피(다른 프리셋과 같은 표) ─────────────────────

  const recipe: Recipe = {
    loop: { hz: 760, ticks: 10, tonal: 0.5, alt: 0.45, len: 0.022, vol: 0.12 },
    riser: { wave: 'triangle', from: 87, to: 290, pulseHz: 2, lp: 900, vol: 0.15 },
    scale: S,
    spinStart(c) {
      noise(c, { dur: 0.36, vol: 0.14, filter: 'bandpass', freq: 450, sweepTo: 2600, q: 1.1 })
      ;[0.04, 0.1, 0.17, 0.25].forEach((at, i) => bubble(c, 520 + i * 90, at, 0.2))
    },
    reelStop(c, lift) {
      tone(c, { freq: 360 * lift, slideTo: 700 * lift, dur: 0.07, vol: 0.55, type: 'sine', attack: 0.003 })
      noise(c, { dur: 0.01, vol: 0.12, filter: 'highpass', freq: 5000 })
      tone(c, { freq: 2100 * lift, at: 0.045, dur: 0.02, vol: 0.12, type: 'sine', attack: 0.001 })
    },
    winSmall(c, rollup) {
      run(c, hang, [2, 4, 6], 0.075, 0.2)
      ;[0.28, 0.34, 0.41].forEach((at, i) => drop(c, 1500 + i * 260, at, 0.12))
      sparkle(c, 'bubble', Math.min(rollup, 1.2), 10, 0.07, 700, 1900)
    },
    winBig(c, tier: Exclude<WinTier, 'none'>, rollup) {
      // 파도가 차올라 마루에서 부서지고, 금화가 쏟아진다. 등급이 오를수록 화음이 두꺼워지고 금화가 촘촘해진다.
      const crest = 0.5
      const notes = { big: 3, mega: 4, epic: 5, max: 5 }[tier]
      noise(c, { dur: crest + 0.05, vol: 0.24, filter: 'lowpass', freq: 250, sweepTo: 2600, q: 0.8 })
      tone(c, { freq: 70, slideTo: 200, dur: crest + 0.05, vol: 0.26, type: 'sine', attack: 0.3 })
      noise(c, { at: crest, dur: 0.25, vol: 0.14, filter: 'bandpass', freq: 1800, sweepTo: 6000, q: 0.9 })
      ;[S[0]!, S[2]!, S[3]!, S[5]!, S[7]!].slice(0, notes + 1).forEach((f, i) => hang(c, f, crest + i * 0.04, 0.27))
      sparkle(c, 'coin', rollup, tier === 'big' ? 14 : 22, 0.15, 1700, 3000, crest + 0.1)
      sparkle(c, 'bubble', rollup, tier === 'big' ? 6 : 10, 0.07, 700, 1900, crest + 0.1)
    },
    feature(c) {
      noise(c, { dur: 0.85, vol: 0.12, filter: 'bandpass', freq: 300, sweepTo: 3600, q: 1.6 })
      tone(c, { freq: 150, slideTo: 600, dur: 0.85, vol: 0.16, type: 'sine', attack: 0.06 })
      ;[0.1, 0.25, 0.4, 0.55].forEach((at, i) => bubble(c, 600 + i * 140, at, 0.18))
      run(c, hang, [3, 4, 5, 6, 7, 8], 0.075, 0.2, 0.25)
    },
    mutation(c) {
      bubble(c, 900, 0, 0.2)
      hang(c, S[7]!, 0.04, 0.22)
      hang(c, S[9]!, 0.1, 0.16)
    },
    tick(c, progress) {
      const f = 2100 + progress * 900
      tone(c, { freq: f, dur: 0.05, vol: 0.05, type: 'sine', attack: 0.001 })
      tone(c, { freq: f * 1.571, dur: 0.03, vol: 0.03, type: 'sine', attack: 0.001 })
    },
    tickEnd(c, tier) {
      run(c, hang, tier === 'none' ? [3, 5] : [4, 6, 8], 0.06, 0.2)
      drop(c, 1700, 0.2, 0.12)
    },
  }

  // ── 코인 리스핀 전용 소리 ───────────────────────────────

  const cues: DeepseaCues = {
    coinLand(c, index) {
      const n = Math.min(Math.max(0, Math.floor(index)), 7)
      coin(c, 2100 * semitone(n), 0, 0.3)
    },
    respinSonar(c) {
      sonar(c, 880, 0, 0.48)
    },
    coinPin(c, step) {
      const n = Math.min(Math.max(0, Math.floor(step)), DEEPSEA_PIN_STEPS)
      tone(c, { freq: 110, slideTo: 72, dur: 0.05, vol: 0.65, type: 'triangle', attack: 0.002 })
      noise(c, { dur: 0.018, vol: 0.4, filter: 'bandpass', freq: 1700, q: 2 })
      noise(c, { at: 0.022, dur: 0.01, vol: 0.2, filter: 'highpass', freq: 4000 })
      coin(c, 1800 * semitone(n), 0.026, 0.55)
    },
    counterReset(c) {
      ;[523.25, 659.25, 783.99].forEach((f, i) => {
        tone(c, { freq: f, at: i * 0.1, dur: 0.32, vol: 0.22, type: 'sine', attack: 0.008 })
        tone(c, { freq: f, at: i * 0.1 + 0.18, dur: 0.26, vol: 0.09, type: 'sine', attack: 0.008, lp: 1800 })
      })
    },
    lastRespin(c) {
      ;[0, 0.2].forEach((at) => {
        tone(c, { freq: 62, slideTo: 42, at, dur: 0.18, vol: 0.55, type: 'sine', attack: 0.004 })
        tone(c, { freq: 124, slideTo: 84, at, dur: 0.12, vol: 0.22, type: 'triangle', attack: 0.004 })
      })
    },
    tentacleWrap(c, phase) {
      if (phase === 'start') {
        tone(c, { freq: 80, slideTo: 160, dur: 0.7, vol: 0.5, type: 'sawtooth', attack: 0.08, lp: 300, lpTo: 900 })
        noise(c, { at: 0.3, dur: 0.35, vol: 0.26, filter: 'bandpass', freq: 700, sweepTo: 200, q: 1 })
        ;[0.35, 0.4, 0.46, 0.52].forEach((at, i) => bubble(c, 520 + i * 110, at, 0.2))
        return
      }
      hang(c, 1046.5, 0, 0.22)
      hang(c, 1568, 0.1, 0.24)
      coin(c, 3300, 0.1, 0.14)
    },
    treasure(c, size) {
      const chord = { small: [3, 5], medium: [3, 5, 7], large: [2, 4, 6, 8] }[size]
      chord.forEach((n, i) => hang(c, S[n]!, i * 0.05, 0.2))
      const ornament = { small: [3000], medium: [3000, 3900], large: [3000, 3900, 4800] }[size]
      ornament.forEach((f, i) => coin(c, f, 0.12 + i * 0.06, 0.16))
      if (size === 'large') tone(c, { freq: 110, slideTo: 220, dur: 0.3, vol: 0.2, type: 'sine', attack: 0.03 })
    },
    settleTick(c, progress) {
      coin(c, 2100 + Math.min(1, Math.max(0, progress)) * 1100, 0, 0.3)
    },
    topTreasure(c) {
      kit.duck(2.2)
      brass(c, [293.66, 369.99, 440], 0, 0.3, 0.16)
      brass(c, [392, 493.88, 587.33], 0.18, 0.3, 0.16)
      brass(c, [440, 554.37, 659.25], 0.36, 0.3, 0.16)
      brass(c, [587.33, 739.99, 880], 0.54, 0.8, 0.2)
      noise(c, { at: 0.54, dur: 0.7, vol: 0.2, filter: 'highpass', freq: 6500 })
      ;[S[5]!, S[7]!, S[9]!].forEach((f, i) => hang(c, f, 0.54 + i * 0.04, 0.12))
    },
  }

  return { recipe, cues }
}
