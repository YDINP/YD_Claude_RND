import {
  BASE_REVOLUTIONS,
  BOUNCE_PORTION,
  DEFAULT_SPIN_DURATION_MS,
  DEFAULT_STAGGER_MS,
  REDUCED_SPIN_DURATION_MS,
  REDUCED_STAGGER_MS,
  REDUCED_TOTAL_CAP_MS,
} from './constants.js'

export interface SpinPlanInput {
  reels: number
  durationMs?: number
  stagger?: number
  reducedMotion?: boolean
}

export interface ReelSpinPlan {
  reel: number
  /** 이 릴이 돌기 시작하는 시각(ms, 스핀 시작 기준). 모든 릴이 동시에 출발한다. */
  startMs: number
  /** 감속 전 등속 구간까지 포함한 회전 시간(ms). */
  spinMs: number
  /** 정지 직전 바운스 시간(ms). */
  bounceMs: number
  /** 이 릴이 완전히 멈추는 시각(ms). */
  endMs: number
  /** 최소 회전 바퀴 수. 오른쪽 릴일수록 더 돈다. */
  revolutions: number
}

export interface SpinPlan {
  reels: ReelSpinPlan[]
  /** 마지막 릴이 멈추는 시각(ms). */
  totalMs: number
  /** 모션 축소가 적용됐는지. 파티클 생략 판단에 쓴다. */
  reduced: boolean
}

/**
 * 릴별 스핀 타이밍 계획. 모든 릴이 같이 출발해 왼쪽부터 `stagger` 간격으로 멈춘다.
 * 계획은 순수 데이터라 애니메이션 엔진 없이 테스트할 수 있다.
 */
export function buildSpinPlan(input: SpinPlanInput): SpinPlan {
  const reels = Math.max(1, Math.floor(input.reels))
  const reduced = input.reducedMotion === true

  let duration = Math.max(1, input.durationMs ?? (reduced ? REDUCED_SPIN_DURATION_MS : DEFAULT_SPIN_DURATION_MS))
  let stagger = Math.max(0, input.stagger ?? (reduced ? REDUCED_STAGGER_MS : DEFAULT_STAGGER_MS))

  if (reduced) {
    duration = Math.min(duration, REDUCED_SPIN_DURATION_MS)
    stagger = Math.min(stagger, REDUCED_STAGGER_MS)
    // 마지막 릴까지 포함한 전체 길이가 상한을 넘지 않도록 간격을 줄인다.
    const overflow = duration + stagger * (reels - 1) - REDUCED_TOTAL_CAP_MS
    if (overflow > 0 && reels > 1) {
      stagger = Math.max(0, stagger - overflow / (reels - 1))
    }
    duration = Math.min(duration, REDUCED_TOTAL_CAP_MS - stagger * (reels - 1))
  }

  const plans: ReelSpinPlan[] = []
  for (let reel = 0; reel < reels; reel += 1) {
    const total = duration + stagger * reel
    const bounceMs = total * BOUNCE_PORTION
    plans.push({
      reel,
      startMs: 0,
      spinMs: total - bounceMs,
      bounceMs,
      endMs: total,
      revolutions: BASE_REVOLUTIONS + reel,
    })
  }

  const last = plans[plans.length - 1]
  return { reels: plans, totalMs: last?.endMs ?? 0, reduced }
}
