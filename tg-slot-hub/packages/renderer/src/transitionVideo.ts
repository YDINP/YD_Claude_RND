import {
  MODE_VIDEO_LEAD_IN_MS,
  MODE_VIDEO_MAX_RATE,
  MODE_VIDEO_MIN_COVERED_MS,
  MODE_VIDEO_PEAK_MS,
  MODE_VIDEO_PEAK_POSITION,
} from './constants.js'
import type { ModeTarget, TransitionPlan } from './transition.js'
import type { Theme } from './types.js'

/**
 * 모드 전환 커튼 위에 얹는 영상 클립의 재생 계획 — **순수 계산만** 한다.
 * 실제 `<video>`와 Pixi 텍스처는 `pixi/transitionVideo.ts`가 만든다.
 */
export interface TransitionVideoPlan {
  /** 재생할 클립 URL. `theme.transitions`가 이미 절대 경로로 풀어 준 값이다. */
  url: string
  /** 재생을 시작할 **클립 안쪽** 시각(초). `video.currentTime`에 그대로 넣는다. */
  startAtSec: number
  /** 재생 배속. `video.playbackRate`에 그대로 넣는다. */
  playbackRate: number
  /** 재생을 시작하는 **전환 기준** 시각(ms). 커튼이 완전히 덮이는 순간과 같다. */
  startAtMs: number
  /** 연출의 정점이 화면에 오는 **전환 기준** 시각(ms). 반드시 차폐 구간 안이다. */
  peakAtMs: number
}

export interface TransitionVideoInputs {
  /** 이 방향에 걸린 클립 URL. 없으면 재생하지 않는다. */
  url?: string | undefined
  /** 모션 축소면 무조건 틀지 않는다. */
  reducedMotion?: boolean | undefined
  /** 클립 안에서 연출이 정점을 찍는 시각(ms). 기본 `MODE_VIDEO_PEAK_MS`. */
  peakMs?: number | undefined
}

/** 이 전환 방향에 걸린 클립 URL. 없으면 undefined — 호출 측은 단색 커튼으로 남는다. */
export function transitionClipUrl(theme: Pick<Theme, 'transitions'>, to: ModeTarget): string | undefined {
  const clip = to === 'freeSpins' ? theme.transitions?.freeSpinsEnter : theme.transitions?.freeSpinsExit
  if (typeof clip !== 'string' || clip.trim() === '') return undefined
  return clip
}

/**
 * 클립을 틀지 **않은** 이유. 조용한 폴백이 원인 진단을 가리지 않도록 개발 모드에서 한 줄 남긴다.
 * - `noClip`: 테마에 이 방향의 클립이 없다.
 * - `reducedMotion`: 모션 축소가 켜져 있다.
 * - `coveredTooShort`: 차폐 구간이 `MODE_VIDEO_MIN_COVERED_MS`보다 짧다(터보 등).
 * - `invalidPeak`: 정점 시각이 말이 안 된다.
 */
export type TransitionVideoSkip = 'noClip' | 'reducedMotion' | 'coveredTooShort' | 'invalidPeak'

/** 클립을 접는다면 그 이유. 틀 수 있으면 null. `planTransitionVideo`와 같은 판단을 쓴다. */
export function transitionVideoSkipReason(
  plan: TransitionPlan,
  inputs: TransitionVideoInputs,
): TransitionVideoSkip | null {
  const url = inputs.url
  if (typeof url !== 'string' || url.trim() === '') return 'noClip'
  if (inputs.reducedMotion === true) return 'reducedMotion'
  if (plan.bannerMs < MODE_VIDEO_MIN_COVERED_MS) return 'coveredTooShort'
  const peakMs = inputs.peakMs ?? MODE_VIDEO_PEAK_MS
  if (Number.isFinite(peakMs) === false || peakMs <= 0) return 'invalidPeak'
  if (plan.bannerMs * MODE_VIDEO_PEAK_POSITION <= 0) return 'coveredTooShort'
  return null
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isFinite(value) === false) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * 클립을 틀지 말지, 튼다면 어디서부터 몇 배속으로 틀지.
 *
 * 전환 길이는 **손대지 않는다.** 클립은 이미 있는 차폐 구간을 채울 뿐이라, 구간이 짧으면
 * (터보·모션 축소) null을 돌려주고 지금까지의 단색 커튼으로 남는다. 구간이 충분하면
 * 정점(`peakMs`)이 차폐 구간의 `MODE_VIDEO_PEAK_POSITION` 지점에 오도록 앞을 잘라 들어가고
 * 배속을 올린다 — 클립을 늘여 붙이지 않는다.
 */
export function planTransitionVideo(
  plan: TransitionPlan,
  inputs: TransitionVideoInputs,
): TransitionVideoPlan | null {
  // 접을지 말지는 한 곳(`transitionVideoSkipReason`)에서만 판단한다 — 진단 로그와 실제 동작이
  // 갈리면 "로그는 재생이라는데 화면은 단색"인 상황을 만든다.
  if (transitionVideoSkipReason(plan, inputs) !== null) return null

  const url = inputs.url ?? ''
  const peakMs = inputs.peakMs ?? MODE_VIDEO_PEAK_MS
  // 정점을 어디에 놓을지부터 정한다. 차폐 구간 안이어야 하므로 배너 길이의 분수로 잡는다.
  const targetToPeakMs = plan.bannerMs * MODE_VIDEO_PEAK_POSITION

  // 그 시간 안에 `MODE_VIDEO_LEAD_IN_MS`만큼의 클립을 밀어 넣으려면 몇 배속이어야 하는지.
  // 1배속 아래로는 내리지 않는다 — 느리게 트는 것보다 앞을 더 잘라 들어가는 편이 낫다.
  const playbackRate = clamp(MODE_VIDEO_LEAD_IN_MS / targetToPeakMs, 1, MODE_VIDEO_MAX_RATE)
  // 실제로 보여줄 앞부분 길이(클립 시간). 클립 앞을 넘어설 수는 없다.
  const leadMs = Math.min(targetToPeakMs * playbackRate, peakMs)

  return {
    url,
    startAtSec: (peakMs - leadMs) / 1000,
    playbackRate,
    startAtMs: plan.swapAtMs,
    peakAtMs: plan.swapAtMs + leadMs / playbackRate,
  }
}

/** 클립이 캔버스 안에 놓이는 자리. 좌표는 캔버스 기준 px다. */
export interface CoverRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * `cover` 맞춤 — 캔버스를 **꽉 채우고** 넘치는 쪽을 잘라낸다. 레터박스(검은 띠)는 만들지 않는다.
 * 세로 클립(540x960)을 가로가 넓은 캔버스에 얹으면 위아래가, 반대면 좌우가 잘린다.
 */
export function coverFit(
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
): CoverRect {
  const fallback = { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
  if (canvasWidth <= 0 || canvasHeight <= 0) return fallback
  if (sourceWidth <= 0 || sourceHeight <= 0) return fallback

  const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  return { x: (canvasWidth - width) / 2, y: (canvasHeight - height) / 2, width, height }
}

/** 진단 한 줄을 실제로 내보내는 곳. 콘솔이든 테스트의 배열이든 상관없다. */
export type TransitionVideoSink = (message: string, detail?: unknown) => void

/**
 * 전환 클립 진단 로거 — **무엇을 남길지**만 정하고, 어디에 남길지는 `sink`가 안다.
 *
 * 폴백은 예상 가능한 상태다(클립 없는 방향, 터보, 모션 축소). 전환마다 같은 줄을 찍으면
 * 콘솔이 잠겨 정작 봐야 할 실패가 묻힌다. 그래서 그런 것은 사유별로 한 번만 남기고,
 * 진짜 실패(로드·디코드·재생 거부)는 매번 남긴다. 세는 범위는 로거 하나의 수명이다
 * (렌더러 인스턴스 = 게임 화면 하나).
 */
export interface TransitionVideoLogger {
  /** 언제나 남긴다. 실제 실패용. */
  always(message: string, detail?: unknown): void
  /** 같은 `key`로는 한 번만 남긴다. 예상 가능한 폴백·진행 상황용. */
  once(key: string, message: string, detail?: unknown): void
}

export function createTransitionVideoLogger(sink: TransitionVideoSink): TransitionVideoLogger {
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
