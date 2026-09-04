import {
  MODE_BANNER_MS,
  MODE_COVER_IN_MS,
  MODE_COVER_OUT_MS,
  MODE_TRANSITION_SPEED_SCALE,
  REDUCED_MODE_BANNER_MS,
  REDUCED_MODE_COVER_IN_MS,
  REDUCED_MODE_COVER_OUT_MS,
} from './constants.js'
import type { RendererMode } from './features.js'
import type { SpinSpeed } from './timing.js'

/** 전환이 향하는 곳. */
export type ModeTarget = 'freeSpins' | 'base'

/** 프리스핀이 켜져 있는 상태인지. `left`가 몇이든 상관없다. */
export function isFreeSpinsActive(mode: RendererMode): boolean {
  return mode.freeSpins !== null && mode.freeSpins !== undefined
}

/**
 * 두 상태 사이에 전환이 필요한지, 필요하다면 어디로 가는지.
 *
 * **켜짐과 꺼짐의 경계에서만** 전환한다.
 * 남은 횟수나 배수가 바뀌었다고 다시 연출하면 매 스핀마다 화면이 번쩍인다.
 */
export function modeTransitionTarget(previous: RendererMode, next: RendererMode): ModeTarget | null {
  const before = isFreeSpinsActive(previous)
  const after = isFreeSpinsActive(next)
  if (before === after) return null
  return after ? 'freeSpins' : 'base'
}

export interface TransitionPlan {
  to: ModeTarget
  /** 커튼이 캔버스 전체를 완전히 덮는 구간(ms). 알파 0→1. */
  coverInMs: number
  /** 완전히 가려진 채로 배경/모드를 갈아 끼우고 그 상태를 붙드는 구간(ms). */
  bannerMs: number
  /** 커튼이 걷히는 구간(ms). 알파 1→0. */
  coverOutMs: number
  /** 커튼이 완전히 덮이는 시각(ms) = coverInMs. 배경/모드 교체는 이 시각에 일어난다. */
  swapAtMs: number
  /** 커튼이 걷히기 시작하는 시각(ms) = coverInMs + bannerMs. */
  coverOutStartMs: number
  /** 세 구간을 더한 전체 길이(ms). */
  totalMs: number
  /**
   * 두 번째 배경 이미지 없이 금빛 틴트로 대신하는지.
   * `theme.backgroundFreeSpins`가 없으면 true다.
   */
  useTint: boolean
}

export interface TransitionOptions {
  /** `theme.backgroundFreeSpins`가 있는지. */
  hasFreeSpinsBackground: boolean
  reducedMotion?: boolean
  /** 지금 걸린 스핀 속도. quick/turbo는 전환도 같은 비율로 빨라진다. 기본 `normal`. */
  speed?: SpinSpeed
}

/**
 * 프리스핀 진입/이탈 전환의 타이밍 — 덮기 → 배너(완전 차폐) → 걷기 3단계.
 *
 * 화면이 **완전히 가려지는 구간**(coverInMs가 끝난 시점부터 coverOutStartMs까지)이 반드시
 * 있어야 한다 — 배경/모드 교체는 이 구간 안(`swapAtMs`)에서 일어나 그 순간을 감춘다.
 * 반투명 와이프로 스치듯 지나가면 배경이 바뀌는 게 그대로 비친다.
 *
 * 모션 축소에서는 스핀 속도와 무관하게 고정된 짧은 길이를 쓴다(총 400ms 이내) — 애니메이션은
 * 최소로 줄이고 배너만 짧게 유지한다. 순수 데이터라 타이머 없이 구간과 길이를 그대로 검증할 수 있다.
 */
export function buildModeTransition(to: ModeTarget, options: TransitionOptions): TransitionPlan {
  const useTint = !options.hasFreeSpinsBackground

  if (options.reducedMotion === true) {
    return buildPlan(
      to,
      REDUCED_MODE_COVER_IN_MS,
      REDUCED_MODE_BANNER_MS,
      REDUCED_MODE_COVER_OUT_MS,
      useTint,
    )
  }

  const scale = MODE_TRANSITION_SPEED_SCALE[options.speed ?? 'normal'] ?? 1
  return buildPlan(
    to,
    MODE_COVER_IN_MS * scale,
    MODE_BANNER_MS * scale,
    MODE_COVER_OUT_MS * scale,
    useTint,
  )
}

function buildPlan(
  to: ModeTarget,
  coverInMs: number,
  bannerMs: number,
  coverOutMs: number,
  useTint: boolean,
): TransitionPlan {
  return {
    to,
    coverInMs,
    bannerMs,
    coverOutMs,
    swapAtMs: coverInMs,
    coverOutStartMs: coverInMs + bannerMs,
    totalMs: coverInMs + bannerMs + coverOutMs,
    useTint,
  }
}

/**
 * 그 시각(ms)의 커튼 알파 — 순수 함수라 애니메이션을 실제로 돌리지 않고도 "완전히 가려지는
 * 구간"이 정말로 있는지(중간에 알파가 1.0에 닿는지) 검증할 수 있다.
 * 덮기 동안 0→1로 선형 보간하고, 배너 구간에는 1로 붙들며, 걷기 동안 1→0으로 되돌아간다.
 */
export function coverAlphaAt(plan: TransitionPlan, tMs: number): number {
  if (tMs <= 0) return 0
  if (tMs < plan.swapAtMs) return plan.coverInMs === 0 ? 1 : tMs / plan.coverInMs
  if (tMs < plan.coverOutStartMs) return 1
  const intoCoverOut = tMs - plan.coverOutStartMs
  if (intoCoverOut >= plan.coverOutMs) return 0
  return plan.coverOutMs === 0 ? 0 : 1 - intoCoverOut / plan.coverOutMs
}
