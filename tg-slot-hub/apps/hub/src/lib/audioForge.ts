/**
 * volcano-forge 전용 효과음(`forge` 프리셋). 화산 대장간: 풀무 바람·쇠 «탁»·모루 «깡»·쇳물 «치익»·장작 «탁탁».
 *
 * `audio.ts`가 가진 합성 재료(tone·noise·live·덕킹)를 `createForgeAudio(kit)`로 넘겨받는다(`audioDeepsea.ts`와 같은 구조).
 * 이 파일은 `audio.ts`를 값으로 import 하지 않으므로(타입만) 순환 의존이 없다.
 * 기본 레시피(`recipe`)는 다른 프리셋과 같은 표에 꽂히고, 불씨·화로 가득·정산 같은 이 게임 전용 소리(`cues`)는 `audio.ts`가 위임으로 내보낸다.
 * 소리의 뼈대는 기획서 9-1이다: 공기(풀무)·짧은 금속(쇠 탁)·거친 비정수 금속(모루)이 다른 프리셋과 갈리는 점이다.
 */
import type { WinTier } from '@tgslot/renderer'
import type { Recipe, Voice } from './audio'
import type { SynthKit } from './audioDeepsea'

/** A 믹솔리디안 2옥타브 안쪽(A4~C#6). 배경음과 같은 조성이다. */
export const FORGE_SCALE = [440, 493.88, 554.37, 587.33, 659.25, 739.99, 783.99, 880, 987.77, 1108.73] as const

/** 불씨가 화로 칸 1~4에 닿을 때의 음(A 단조 펜타토닉 상행). */
export const FORGE_EMBER_NOTES = [440, 523.25, 587.33, 659.25] as const

/** 연쇄 단계마다 온음씩 높아지는 모루 «깡»의 최대 단계. */
export const FORGE_CLANG_STEPS = 6

/** 이 게임 전용 소리. 모두 컨텍스트를 받아 그 자리에서 합성한다. */
export interface ForgeCues {
  /** 연쇄 단계의 당첨 강조: 모루 «깡». `step`(0부터)이 오를수록 온음씩 높아진다(6단 상한). */
  highlight(c: AudioContext, step: number): void
  /** 칸이 터진다: 쇳물 «치익». */
  pop(c: AudioContext): void
  /** 위 칸이 아래로 떨어진다: 낮은 «쿵». */
  drop(c: AudioContext): void
  /** 불씨가 판에서 튀어 오른다: 장작 «탁탁». */
  emberSpark(c: AudioContext): void
  /** 불씨가 화로 칸에 닿는다. `slot`(0~3)이 오를수록 음이 한 단 높아진다. */
  emberLand(c: AudioContext, slot: number): void
  /** 화로 칸이 3개 켜졌다: 낮은 숨소리 웅웅(1.5Hz). */
  breath(c: AudioContext): void
  /** 화로가 가득 찬다: 풀무 두 번 → 불길 «화르륵» → 톱니 3화음 스탭. 게임의 얼굴 소리. */
  full(c: AudioContext): void
  /** 정산 `× N`: 망치 세 번 «깡깡깡» 상행. */
  settle(c: AudioContext): void
  /** 정산 숫자만 바뀔 때(망치 없이): 짧은 쇠 «틱». */
  settleTick(c: AudioContext): void
  /** 모루 칩이 켜졌다. `count`는 지금 모인 모루 수(2 또는 3). 3개면 낮은 북 두 번 + 용암 드론. */
  anvilTease(c: AudioContext, count: number): void
  /** 프리스핀이 더해졌다: 모루 «깡» 두 음 + 불길. */
  retrigger(c: AudioContext): void
}

export interface ForgeAudio {
  recipe: Recipe
  cues: ForgeCues
}

const semitone = (n: number): number => 2 ** (n / 12)

export function createForgeAudio(kit: SynthKit): ForgeAudio {
  const { tone, noise } = kit
  const S = FORGE_SCALE

  // ── 음색 ────────────────────────────────────────────────

  /** 모루 «깡»: 배음비 1 : 2.76 : 5.40 : 8.93 비정수 금속 울림. 맑은 차임과 갈리는 거친 금속. */
  const clang: Voice = (c, f, at, vol) => {
    // 모루는 종보다 거칠다: 어긋난 비정수 배음 묶음이 짧게 울고, 때리는 순간의 쇳소리(대역 잡음)가 크다.
    tone(c, { freq: f, at, dur: 0.38, vol, type: 'sine', attack: 0.001 })
    tone(c, { freq: f * 2.32, at, dur: 0.22, vol: vol * 0.7, type: 'sine', attack: 0.001 })
    tone(c, { freq: f * 3.74, at, dur: 0.14, vol: vol * 0.5, type: 'sine', attack: 0.001 })
    tone(c, { freq: f * 5.12, at, dur: 0.09, vol: vol * 0.34, type: 'sine', attack: 0.001 })
    tone(c, { freq: f * 1.51, at, dur: 0.1, vol: vol * 0.3, type: 'square', attack: 0.001, lp: 2200 })
    noise(c, { at, dur: 0.05, vol: vol * 1.1, filter: 'bandpass', freq: 3100, q: 2.2 })
    noise(c, { at, dur: 0.02, vol: vol * 0.7, filter: 'highpass', freq: 5200, q: 0.7 })
  }

  /** 쇠 «탁»: 90Hz 몸통 40ms + 1.3kHz 비정수 배음 짧은 울림. 종·나무 딱따기와 다른 짧은 금속. */
  const ironTap = (c: AudioContext, lift: number, at: number, vol: number): void => {
    tone(c, { freq: 78 * lift, slideTo: 52 * lift, at, dur: 0.08, vol: vol * 1.1, type: 'sine', attack: 0.001 })
    tone(c, { freq: 2200 * lift, at, dur: 0.05, vol: vol * 0.22, type: 'sine', attack: 0.001 })
    tone(c, { freq: 2200 * lift * 2.76, at, dur: 0.03, vol: vol * 0.14, type: 'sine', attack: 0.001 })
    noise(c, { at, dur: 0.016, vol: vol * 0.5, filter: 'highpass', freq: 3600, q: 0.7 })
  }

  /** 풀무 바람: 대역 잡음이 부풀었다 빠진다. 팝·딸깍·기포가 아닌 «공기». */
  const bellows = (c: AudioContext, at: number, dur: number, vol: number): void => {
    noise(c, { at, dur, vol, filter: 'bandpass', freq: 180, sweepTo: 900, q: 0.8 })
    tone(c, { freq: 62, slideTo: 90, at, dur, vol: vol * 0.7, type: 'sine', attack: dur * 0.4 })
  }

  /** 쇳물 «치익»: 고역 대역 잡음이 빠르게 감쇠한다. */
  const sizzle = (c: AudioContext, at: number, vol: number, dur = 0.12): void => {
    noise(c, { at, dur, vol, filter: 'highpass', freq: 6000, q: 0.7 })
    noise(c, { at, dur: dur * 0.5, vol: vol * 0.5, filter: 'bandpass', freq: 3400, q: 0.9 })
  }

  /** 장작 «탁탁»: 아주 짧은 대역 잡음 알갱이 몇 개. */
  const crackle = (c: AudioContext, at: number, grains: number, vol: number): void => {
    for (let i = 0; i < grains; i += 1) {
      noise(c, { at: at + i * 0.045 + Math.random() * 0.02, dur: 0.014, vol: vol * (0.6 + Math.random() * 0.4), filter: 'bandpass', freq: 1500 + Math.random() * 2400, q: 1.6 })
    }
  }

  /** 낮은 «쿵». */
  const thump = (c: AudioContext, at: number, vol: number, f = 70): void => {
    tone(c, { freq: f, slideTo: f * 0.62, at, dur: 0.06, vol, type: 'sine', attack: 0.002 })
  }

  /** 불길 «화르륵»: 로우패스가 열리는 잡음이 올라간다. */
  const flame = (c: AudioContext, at: number, dur: number, vol: number): void => {
    noise(c, { at, dur, vol, filter: 'lowpass', freq: 400, sweepTo: 5200, q: 0.7 })
    tone(c, { freq: 90, slideTo: 260, at, dur, vol: vol * 0.5, type: 'sawtooth', attack: dur * 0.5, lp: 500, lpTo: 1500 })
  }

  /** 금관풍 화음 한 줄: 톱니파가 열렸다 닫힌다. */
  const brass = (c: AudioContext, freqs: readonly number[], at: number, dur: number, vol: number): void => {
    for (const f of freqs) tone(c, { freq: f, at, dur, vol, type: 'sawtooth', attack: 0.02, lp: 2400, lpTo: 600 })
  }

  const run = (c: AudioContext, voice: Voice, notes: readonly number[], step: number, vol: number, from = 0): void => {
    notes.forEach((n, i) => voice(c, S[n]!, from + i * step, vol))
  }

  /** 기간 동안 흩뿌리는 불꽃 튐(장작 알갱이 + 쇳물 치익). */
  const embers = (c: AudioContext, dur: number, density: number, vol: number, from = 0): void => {
    const count = Math.min(40, Math.round(dur * density))
    for (let i = 0; i < count; i += 1) {
      const at = from + (i / count) * dur + Math.random() * 0.05
      if (i % 3 === 0) sizzle(c, at, vol * 0.8, 0.07)
      else crackle(c, at, 1, vol)
    }
  }

  // ── 기본 레시피(다른 프리셋과 같은 표) ─────────────────────

  const recipe: Recipe = {
    loop: { hz: 640, ticks: 7, tonal: 0.3, alt: 0.35, len: 0.028, vol: 0.12 },
    riser: { wave: 'sawtooth', from: 55, to: 210, pulseHz: 3, lp: 650, vol: 0.16 },
    scale: S,
    spinStart(c) {
      bellows(c, 0, 0.36, 0.2)
      thump(c, 0.05, 0.28, 90)
    },
    reelStop(c, lift) {
      ironTap(c, lift, 0, 0.7)
    },
    winSmall(c, rollup) {
      // 베팅 미만이면 이 소리도 짧게(손실 위장 금지): «탁» 하나 + 작은 모루.
      ironTap(c, 1.4, 0, 0.5)
      clang(c, S[2]!, 0.05, 0.27)
      clang(c, S[4]!, 0.13, 0.2)
      embers(c, Math.min(rollup, 1), 8, 0.1)
    },
    winBig(c, tier: Exclude<WinTier, 'none'>, rollup) {
      // 풀무가 차오르고 화로가 터진다. 망치가 모루를 세 번 치고, 등급이 오를수록 화음이 두꺼워진다.
      const crest = 0.55
      const hits = { big: 3, mega: 4, epic: 5, max: 5 }[tier]
      flame(c, 0, crest + 0.05, 0.26)
      tone(c, { freq: 62, slideTo: 150, dur: crest + 0.05, vol: 0.28, type: 'sine', attack: 0.3 })
      for (let i = 0; i < hits; i += 1) clang(c, S[i * 2 > 8 ? 8 : i * 2]! * 0.5, crest + i * 0.12, 0.3)
      brass(c, [220, 277.18, 329.63], crest + hits * 0.12, 0.7, 0.13)
      noise(c, { at: crest, dur: 0.3, vol: 0.14, filter: 'highpass', freq: 5500 })
      embers(c, rollup, tier === 'big' ? 16 : 26, 0.16, crest + 0.1)
    },
    feature(c) {
      // 프리스핀 진입: 풀무 두 번 → 불길 → 톱니 화음 스탭.
      bellows(c, 0, 0.34, 0.2)
      bellows(c, 0.36, 0.34, 0.22)
      flame(c, 0.7, 0.7, 0.2)
      brass(c, [220, 277.18, 329.63], 1.0, 0.25, 0.14)
      brass(c, [246.94, 311.13, 369.99], 1.15, 0.25, 0.14)
      brass(c, [293.66, 369.99, 440], 1.3, 0.8, 0.17)
      clang(c, 880, 1.3, 0.2)
    },
    mutation(c) {
      ironTap(c, 1.3, 0, 0.4)
      clang(c, S[3]! * 0.5, 0.03, 0.24)
      crackle(c, 0.08, 3, 0.16)
    },
    tick(c, progress) {
      // 쇠 망치 «틱»: 낮은 몸통 + 대역 잡음. 오를수록 조금 높아진다.
      const f = 180 + progress * 140
      tone(c, { freq: f, slideTo: f * 0.7, dur: 0.03, vol: 0.2, type: 'triangle', attack: 0.001 })
      noise(c, { dur: 0.01, vol: 0.12, filter: 'bandpass', freq: 2400 + progress * 900, q: 1.6 })
    },
    tickEnd(c, tier) {
      // 마감: 망치 «탁» + 모루 한 번(등급이 오르면 두 번).
      ironTap(c, 1.1, 0, 0.45)
      clang(c, S[tier === 'none' ? 2 : 3]! * 0.5, 0.06, 0.26)
      if (tier !== 'none') clang(c, S[5]! * 0.5, 0.2, 0.26)
      sizzle(c, 0.12, 0.12, 0.1)
    },
    gambleToss(c) {
      ironTap(c, 1.2, 0, 0.4)
      crackle(c, 0.04, 4, 0.12)
    },
    gambleWin(c) {
      run(c, clang, [3, 5, 7], 0.07, 0.2)
      embers(c, 0.4, 20, 0.1, 0.1)
    },
    gambleLose(c) {
      thump(c, 0, 0.5, 80)
      tone(c, { freq: 150, slideTo: 60, at: 0.04, dur: 0.4, vol: 0.14, type: 'sawtooth', attack: 0.01, lp: 400 })
    },
    riserExtra(c) {
      // 기대감(모루가 모일 때): 낮은 북 두 번이 반복된다. 기대감이 끝나면 함께 멈춘다.
      const timers: ReturnType<typeof setTimeout>[] = []
      const beat = (at: number): void => {
        timers.push(
          setTimeout(() => {
            if (kit.live()) {
              thump(c, 0, 0.32, 60)
              thump(c, 0.16, 0.26, 60)
            }
          }, at * 1000),
        )
      }
      for (let i = 0; i < 12; i += 1) beat(i * 0.62)
      return () => {
        for (const id of timers) clearTimeout(id)
      }
    },
  }

  // ── 이 게임 전용 소리 ───────────────────────────────────

  const cues: ForgeCues = {
    highlight(c, step) {
      const n = Math.min(Math.max(0, Math.floor(step)), FORGE_CLANG_STEPS - 1)
      clang(c, 523.25 * semitone(n * 2), 0, 0.45)
    },
    pop(c) {
      sizzle(c, 0, 0.4, 0.14)
    },
    drop(c) {
      thump(c, 0, 0.85, 75)
      noise(c, { at: 0.005, dur: 0.03, vol: 0.2, filter: 'lowpass', freq: 600, q: 0.7 })
    },
    emberSpark(c) {
      crackle(c, 0, 4, 1)
    },
    emberLand(c, slot) {
      const f = FORGE_EMBER_NOTES[Math.min(Math.max(0, Math.floor(slot)), FORGE_EMBER_NOTES.length - 1)]!
      noise(c, { dur: 0.12, vol: 0.5, filter: 'lowpass', freq: 500, sweepTo: 3200, q: 0.8 })
      tone(c, { freq: f, at: 0.03, dur: 0.26, vol: 0.7, type: 'triangle', attack: 0.004, lp: 2400, lpTo: 800 })
      tone(c, { freq: f * 2, at: 0.03, dur: 0.12, vol: 0.16, type: 'sine', attack: 0.003 })
    },
    breath(c) {
      // 1.5Hz로 부풀었다 빠지는 낮은 웅웅. 아주 작게.
      for (let i = 0; i < 3; i += 1) tone(c, { freq: 62, at: i * 0.667, dur: 0.6, vol: 0.4, type: 'sine', attack: 0.25 })
    },
    full(c) {
      kit.duck(2.4)
      bellows(c, 0, 0.3, 0.22)
      bellows(c, 0.34, 0.3, 0.24)
      flame(c, 0.66, 0.8, 0.26)
      brass(c, [220, 277.18, 329.63], 1.2, 0.22, 0.15)
      brass(c, [277.18, 329.63, 415.3], 1.34, 0.22, 0.15)
      brass(c, [329.63, 415.3, 493.88], 1.48, 0.9, 0.19)
      clang(c, 659.25, 1.48, 0.22)
      noise(c, { at: 1.48, dur: 0.5, vol: 0.16, filter: 'highpass', freq: 6000 })
    },
    settle(c) {
      kit.duck(0.9)
      ;[0, 0.14, 0.28].forEach((at, i) => {
        thump(c, at, 0.4, 80)
        clang(c, 440 * semitone(i * 3), at, 0.28)
      })
      sizzle(c, 0.3, 0.16, 0.14)
    },
    settleTick(c) {
      ironTap(c, 1.6, 0, 0.6)
    },
    anvilTease(c, count) {
      if (count < 3) {
        thump(c, 0, 0.7, 64)
        return
      }
      thump(c, 0, 0.95, 60)
      thump(c, 0.18, 0.85, 60)
      tone(c, { freq: 55, slideTo: 80, at: 0.05, dur: 1.1, vol: 0.3, type: 'sawtooth', attack: 0.3, lp: 300, lpTo: 650 })
    },
    retrigger(c) {
      kit.duck(1.2)
      clang(c, 587.33, 0, 0.26)
      clang(c, 880, 0.16, 0.26)
      flame(c, 0.12, 0.5, 0.18)
    },
  }

  return { recipe, cues }
}
