import type { TransitionClip } from '@tgslot/game-sdk'
import { MODE_CLIP_MIN_COVERED_MS } from './constants.js'
import type { ModeTarget } from './transition.js'
import type { SpinSpeed } from './timing.js'
import type { Theme } from './types.js'

/**
 * 모드 전환 커튼 위에 얹는 클립의 재생 계획 — **순수 계산만** 한다.
 * 실제 `<img>` 엘리먼트는 `pixi/transitionClip.ts`가 만든다.
 *
 * 클립은 **애니메이션 WebP**다. `<video>`와 달리 탐색도 배속도 없다 — 브라우저가 자기
 * 속도로 처음부터 끝까지 돌린다. 그래서 «클립 안에서 정점을 찾아 차폐 구간에 맞춘다»는
 * 예전 전략이 성립하지 않고, 반대로 **클립이 덮기 구간의 길이를 정한다.**
 * 화면 교체는 클립이 화면을 완전히 가리는 순간(`opaqueMs`)에 일어난다.
 */
export interface TransitionClipPlan {
  /** 재생할 클립 URL. `theme.transitions`가 이미 절대 경로로 풀어 준 값이다. */
  url: string
  /**
   * 클립이 화면을 완전히 덮는 시각(ms, 컷 시작 기준).
   * 이 값이 그대로 전환의 덮기 구간 길이가 되고, 그 끝에서 배경·모드가 갈린다.
   */
  opaqueMs: number
  /**
   * 클립 전체 길이(ms). 모르면 undefined — 그때는 전환이 자기 길이대로 끝난다.
   * 알면 전환이 클립을 끝까지 재생할 만큼 늘어난다.
   */
  durationMs?: number
}

export interface TransitionClipInputs {
  /** 이 방향에 걸린 클립. 없으면 재생하지 않는다. */
  clip?: TransitionClip | undefined
  /** 모션 축소면 무조건 틀지 않는다. */
  reducedMotion?: boolean | undefined
  /** 지금 걸린 스핀 속도. 터보에서는 차폐 구간이 너무 짧아 클립을 접는다. */
  speed?: SpinSpeed | undefined
  /** 기본 덮기 길이(ms). 클립이 `opaqueMs`를 주지 않았을 때 쓴다. */
  defaultOpaqueMs: number
  /** 이 속도에서의 배너(완전 차폐) 길이(ms). 클립을 틀 값어치가 있는지 가른다. */
  bannerMs: number
}

/** 이 전환 방향에 걸린 클립. 없으면 undefined — 호출 측은 단색 커튼으로 남는다. */
export function transitionClipFor(
  theme: Pick<Theme, 'transitions'>,
  to: ModeTarget,
): TransitionClip | undefined {
  const clip = to === 'freeSpins' ? theme.transitions?.freeSpinsEnter : theme.transitions?.freeSpinsExit
  if (clip === undefined) return undefined
  if (typeof clip.src !== 'string' || clip.src.trim() === '') return undefined
  return clip
}

/**
 * 클립을 틀지 **않은** 이유. 조용한 폴백이 원인 진단을 가리지 않도록 개발 모드에서 한 줄 남긴다.
 * - `noClip`: 테마에 이 방향의 클립이 없다.
 * - `reducedMotion`: 모션 축소가 켜져 있다.
 * - `coveredTooShort`: 차폐 구간이 `MODE_CLIP_MIN_COVERED_MS`보다 짧다(터보 등).
 * - `invalidOpaque`: 불투명 시각이 말이 안 된다.
 */
export type TransitionClipSkip = 'noClip' | 'reducedMotion' | 'coveredTooShort' | 'invalidOpaque'

/** 클립을 접는다면 그 이유. 틀 수 있으면 null. `planTransitionClip`과 같은 판단을 쓴다. */
export function transitionClipSkipReason(inputs: TransitionClipInputs): TransitionClipSkip | null {
  const clip = inputs.clip
  if (clip === undefined || typeof clip.src !== 'string' || clip.src.trim() === '') return 'noClip'
  if (inputs.reducedMotion === true) return 'reducedMotion'
  if (inputs.bannerMs < MODE_CLIP_MIN_COVERED_MS) return 'coveredTooShort'
  const opaqueMs = clip.opaqueMs ?? inputs.defaultOpaqueMs
  // 0은 «첫 프레임부터 덮는다»는 정상값이다. 거부할 것은 음수와 NaN뿐이다.
  if (!Number.isFinite(opaqueMs) || opaqueMs < 0) return 'invalidOpaque'
  return null
}

/**
 * 클립을 틀지 말지, 튼다면 언제 화면을 갈아 끼울지.
 *
 * **클립을 잘라 쓰지 않는다.** 애니메이션 WebP는 탐색이 없으니 언제나 처음부터 돈다.
 * 대신 전환의 덮기 구간을 클립의 불투명 시점까지 늘려, 화면이 갈리는 순간이 확실히
 * 클립에 가려지게 한다. 차폐 구간이 애초에 짧으면(터보·모션 축소) 접고 단색 커튼으로 남는다.
 */
export function planTransitionClip(inputs: TransitionClipInputs): TransitionClipPlan | null {
  // 접을지 말지는 한 곳에서만 판단한다 — 진단 로그와 실제 동작이 갈리면
  // "로그는 재생이라는데 화면은 단색"인 상황을 만든다.
  if (transitionClipSkipReason(inputs) !== null) return null
  const clip = inputs.clip
  if (clip === undefined) return null
  return {
    url: clip.src,
    opaqueMs: clip.opaqueMs ?? inputs.defaultOpaqueMs,
    ...(clip.durationMs === undefined ? {} : { durationMs: clip.durationMs }),
  }
}

/** 진단 한 줄을 실제로 내보내는 곳. 콘솔이든 테스트의 배열이든 상관없다. */
export type TransitionClipSink = (message: string, detail?: unknown) => void

/**
 * 전환 클립 진단 로거 — **무엇을 남길지**만 정하고, 어디에 남길지는 `sink`가 안다.
 *
 * 폴백은 예상 가능한 상태다(클립 없는 방향, 터보, 모션 축소). 전환마다 같은 줄을 찍으면
 * 콘솔이 잠겨 정작 봐야 할 실패가 묻힌다. 그래서 그런 것은 사유별로 한 번만 남기고,
 * 진짜 실패(로드·디코드)는 매번 남긴다. 세는 범위는 로거 하나의 수명이다
 * (렌더러 인스턴스 = 게임 화면 하나).
 */
export interface TransitionClipLogger {
  /** 언제나 남긴다. 실제 실패용. */
  always(message: string, detail?: unknown): void
  /** 같은 `key`로는 한 번만 남긴다. 예상 가능한 폴백·진행 상황용. */
  once(key: string, message: string, detail?: unknown): void
}

export function createTransitionClipLogger(sink: TransitionClipSink): TransitionClipLogger {
  const seen = new Set<string>()
  return {
    always: (message, detail) => {
      sink(message, detail)
    },
    once: (key, message, detail) => {
      if (seen.has(key)) return
      seen.add(key)
      sink(message, detail)
    },
  }
}
