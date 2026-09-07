import {
  CLIP_FADE_MS,
  CURTAIN_RETIRE_MS,
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
  /**
   * 클립이 화면을 완전히 덮는 시각(ms). 주면 **덮기 구간이 이 길이가 된다.**
   * `0`이면 덮기 구간 자체가 없다 — 클립이 첫 프레임부터 덮고 있으므로 곧바로 갈아 끼운다.
   *
   * 애니메이션 WebP는 탐색도 배속도 없어 언제나 처음부터 자기 속도로 돈다. 그래서 클립에
   * 전환을 맞추는 수밖에 없다 — 화면이 갈리는 순간(`swapAtMs`)이 클립이 아직 다 덮지
   * 못한 때에 오면 교체가 그대로 비친다. 배너와 걷기는 손대지 않는다.
   */
  clipOpaqueMs?: number
  /**
   * 클립 전체 길이(ms). 주면 **전환이 클립을 끝까지 재생할 만큼 늘어난다.**
   *
   * 늘어나는 것은 걷기 구간뿐이다 — 덮기는 클립이 화면을 가리는 시각이 정하고, 배너는
   * 허브가 그 위에 얹는 구간이라 둘 다 손대면 안 된다. 클립이 짧으면 아무것도 늘리지 않는다.
   */
  clipDurationMs?: number
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
  // 클립이 있으면 덮기는 클립이 정한다. 속도 배율은 배너와 걷기에만 걸린다 —
  // 클립을 빨리 돌릴 방법이 없으므로 덮기만 줄이면 교체가 클립 밖으로 새어 나온다.
  const coverInMs =
    options.clipOpaqueMs !== undefined && Number.isFinite(options.clipOpaqueMs) && options.clipOpaqueMs >= 0
      ? options.clipOpaqueMs
      : MODE_COVER_IN_MS * scale
  const bannerMs = MODE_BANNER_MS * scale
  const coverOutMs = clipCoverOutMs(MODE_COVER_OUT_MS * scale, coverInMs, bannerMs, options.clipDurationMs)
  return buildPlan(to, coverInMs, bannerMs, coverOutMs, useTint)
}

/**
 * 걷기 구간의 길이. 클립을 끝까지 보여 줄 만큼만 늘리고, 그보다 짧은 클립에는 손대지 않는다.
 * 클립이 없거나 길이를 모르면 지금까지의 값 그대로다.
 */
function clipCoverOutMs(
  baseMs: number,
  coverInMs: number,
  bannerMs: number,
  clipDurationMs: number | undefined,
): number {
  if (clipDurationMs === undefined || !Number.isFinite(clipDurationMs) || clipDurationMs <= 0) return baseMs
  return Math.max(baseMs, clipDurationMs - coverInMs - bannerMs)
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

/** gsap `sine.inOut`을 순수 계산으로 옮긴 것. 곡선이 갈리면 화면이 실제로 달라진다. */
function easeInOut(progress: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, progress)))
}

/**
 * 단색 커튼의 알파.
 *
 * 커튼은 **클립이 화면을 가리기 전까지의 안전망**이다. 클립이 실제로 떠 있으면 교체 시점에
 * 물러난다 — 그 뒤로 화면을 관장하는 것은 클립이고, 커튼이 남아 있으면 클립이 제 그림으로
 * 걷혀도 뒤에서 검정만 드러난다(복귀 클립이 통째로 묻히던 자리가 여기다).
 *
 * 클립이 없거나 못 떴으면 지금까지의 3단 곡선 그대로다.
 */
export function curtainAlphaAt(plan: TransitionPlan, tMs: number, clipShowing: boolean): number {
  if (!clipShowing) return coverAlphaAt(plan, tMs)
  if (tMs <= 0) return 0
  if (tMs < plan.swapAtMs) return plan.coverInMs === 0 ? 1 : easeInOut(tMs / plan.coverInMs)
  // 교체가 끝나면 짧게 물러난다. 그동안은 클립이 덮고 있어 이 하강 자체는 보이지 않는다.
  const intoRetire = tMs - plan.swapAtMs
  if (intoRetire >= CURTAIN_RETIRE_MS) return 0
  return 1 - easeInOut(intoRetire / CURTAIN_RETIRE_MS)
}

/**
 * 클립의 알파. 재생 내내 1이고 **마지막 걷기 구간에서만** 사라진다.
 *
 * 클립이 불투명하게 끝나는 종류(진입 — 총구가 화면을 가린 채 끝난다)도 이 페이드 덕분에
 * 툭 끊기지 않는다. 이미 제 그림으로 걷힌 클립(복귀)에는 이 페이드가 무해하다.
 */
export function clipAlphaAt(plan: TransitionPlan, tMs: number): number {
  // 페이드는 **끝의 짧은 구간**에만 건다. 걷기가 클립 길이만큼 늘어났다고 알파까지 그만큼
  // 길게 내리면, 제 그림으로 걷히는 클립 위에 반투명이 겹쳐 뒤가 미리 비친다.
  const fadeMs = Math.min(plan.coverOutMs, CLIP_FADE_MS)
  const startMs = plan.totalMs - fadeMs
  if (tMs < startMs) return 1
  const intoFade = tMs - startMs
  if (intoFade >= fadeMs) return 0
  return fadeMs === 0 ? 0 : 1 - easeInOut(intoFade / fadeMs)
}
