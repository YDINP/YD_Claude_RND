import {
  MODE_FLASH_PORTION,
  MODE_TRANSITION_MS,
  MODE_WIPE_PORTION,
  REDUCED_MODE_TRANSITION_MS,
} from './constants.js'
import type { RendererMode } from './features.js'

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
  /** 금빛 섬광 구간(ms). 시선을 한 번 끊어 배경이 바뀌는 것을 감춘다. */
  flashMs: number
  /** 방사형 와이프로 배경을 교차시키는 구간(ms). */
  wipeMs: number
  /** 와이프가 시작되는 시각(ms). 섬광이 정점을 지난 뒤다. */
  wipeStartMs: number
  /** 릴 창 테두리 광채가 차오르는 구간(ms). 와이프와 함께 끝난다. */
  glowMs: number
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
}

/**
 * 프리스핀 진입/이탈 전환의 타이밍.
 *
 * 섬광 → 와이프 → 정착 순서다. 광채는 섬광이 끝나는 지점부터 차오른다.
 * 순수 데이터라 타이머 없이 구간과 길이를 그대로 검증할 수 있다.
 */
export function buildModeTransition(to: ModeTarget, options: TransitionOptions): TransitionPlan {
  const totalMs = options.reducedMotion === true ? REDUCED_MODE_TRANSITION_MS : MODE_TRANSITION_MS
  const flashMs = totalMs * MODE_FLASH_PORTION
  const wipeMs = totalMs * MODE_WIPE_PORTION
  // 섬광이 정점을 찍고 사그라들기 시작할 때 배경을 바꾼다. 교체 순간이 가려진다.
  const wipeStartMs = flashMs / 2

  return {
    to,
    flashMs,
    wipeMs,
    wipeStartMs,
    glowMs: wipeStartMs + wipeMs,
    totalMs,
    useTint: !options.hasFreeSpinsBackground,
  }
}
