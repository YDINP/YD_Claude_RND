/**
 * 말판 전용 효과음 창구.
 *
 * 합성 효과음은 `lib/audio.ts`(사운드 담당)가 만든다. 말판 화면은 «무슨 일이 일어났을 때 어떤 소리를 낼지»만
 * 알고 소리 자체는 모른다 — 이 파일이 그 짝을 맞춘다. 소리가 어떤 이유로든 던져도 말판 재생은 계속된다.
 */
import {
  playFeature,
  playFork,
  playGoal,
  playBoardSummary,
  playTileCoin,
  playTileMult,
  playTileTrap,
  playTokenHop,
  playUiSound,
  playYutCall,
  playYutLand,
  playYutToss,
} from '../../../lib/audio'

export interface BoardSfx {
  /** 윷가락을 던진다(휙). */
  toss(): void
  /** 윷가락이 떨어진다(딱딱딱딱). */
  land(steps: number): void
  /** 결과를 부른다(도→모로 갈수록 음이 오른다). */
  call(steps: number): void
  /** 말이 한 칸 건넌다. `index`는 이번 이동의 몇 번째 칸인지. */
  hop(index: number): void
  coin(): void
  mult(level: number): void
  trap(): void
  fork(): void
  goal(): void
  summary(): void
  /** 말판에 들어갈 때(초롱 3개) 한 번. */
  feature(): void
  /** ⏩ 압축 재생에서 던지기마다 한 번 내는 짧은 틱. */
  tick(): void
}

/** 소리 하나를 안전하게 낸다 — 어떤 이유로든 소리가 던져도 말판 재생은 계속된다. */
function safely(fn: () => void): void {
  try {
    fn()
  } catch {
    /* 소리는 연출일 뿐이다 */
  }
}

export const boardSfx: BoardSfx = {
  toss: () => safely(playYutToss),
  land: (steps) => safely(() => playYutLand(steps)),
  call: (steps) => safely(() => playYutCall(steps)),
  hop: (index) => safely(() => playTokenHop(index)),
  coin: () => safely(playTileCoin),
  mult: (level) => safely(() => playTileMult(level)),
  trap: () => safely(playTileTrap),
  fork: () => safely(playFork),
  goal: () => safely(playGoal),
  summary: () => safely(playBoardSummary),
  feature: () => safely(playFeature),
  tick: () => safely(() => playUiSound('tap')),
}
