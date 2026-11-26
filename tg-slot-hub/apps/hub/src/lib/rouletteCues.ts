/**
 * 무대 룰렛이 내는 소리 신호. 연출 코드는 «무슨 일이 일어났나»만 알리고(`playRouletteCue`), 어떤 소리로 들릴지는
 * 싱크(`RouletteCueSink`)가 정한다. 기본 싱크는 `idol` 프리셋의 룰렛 소리(`rouletteSfx.ts`)다 —
 * 테스트나 다른 소리 세트는 `setRouletteCueSink`로 갈아 끼운다.
 */
import type { RouletteKind } from './rouletteShow'
import { idolRouletteSink } from './rouletteSfx'

export type RouletteCue =
  /** 진입: 초대권이 강조되고 룰렛이 열린다. */
  | { kind: 'entry' }
  /** 응원봉 불빛 토큰이 칸을 켠다. `index`는 0부터 오르는 순번(점등마다 한 단계씩 높아진다). */
  | { kind: 'light'; index: number }
  /** 포인터가 칸 경계를 지났다. `speed`는 1(빠름)→0(멈추기 직전). */
  | { kind: 'tick'; speed: number }
  /** 회전이 멈췄다. */
  | { kind: 'land'; result: RouletteKind; lit: boolean }
  /** 한 단계 위로 — 고리가 바뀌며 줌인한다. */
  | { kind: 'zoom'; ring: number }
  /** 요약 카드가 뜬다. `big`은 룰렛 합이 큰 판(등급 배수) 여부. */
  | { kind: 'summary'; big: boolean }
  /** 룰렛이 닫힌다(퇴장 클립 시작). */
  | { kind: 'exit' }

export type RouletteCueSink = (cue: RouletteCue) => void

let sink: RouletteCueSink = idolRouletteSink

/** 소리 싱크를 바꾼다. null이면 기본으로 되돌린다. */
export function setRouletteCueSink(next: RouletteCueSink | null): void {
  sink = next ?? idolRouletteSink
}

export function playRouletteCue(cue: RouletteCue): void {
  try {
    sink(cue)
  } catch (error) {
    // 소리가 연출을 멈추게 하지 않는다.
    console.error('[roulette] cue failed', cue.kind, error)
  }
}
