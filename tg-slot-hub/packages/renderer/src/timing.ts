import {
  BASE_REVOLUTIONS,
  DEFAULT_SPIN_DURATION_MS,
  DEFAULT_STAGGER_MS,
  FAST_SPIN_FACTOR,
  LANDING_SETTLE_MAX_PORTION,
  LANDING_SETTLE_MS,
  PULL_UP_MS,
  REDUCED_SPIN_DURATION_MS,
  REDUCED_STAGGER_MS,
  REDUCED_TOTAL_CAP_MS,
  SKIP_STAGGER_MS,
  SKIP_TOTAL_MS,
} from './constants.js'

export interface SpinPlanInput {
  reels: number
  durationMs?: number
  stagger?: number
  reducedMotion?: boolean
  /** 프리스핀처럼 리듬을 당겨야 할 때. 회전 시간을 `FAST_SPIN_FACTOR`만큼 줄인다. */
  fast?: boolean
}

export interface ReelSpinPlan {
  reel: number
  /**
   * 이 릴이 아래로 돌기 시작하는 시각(ms, 스핀 시작 기준).
   * 뒤로 당기는 구간이 끝난 시점이라 모든 릴이 같은 값을 갖는다.
   */
  startMs: number
  /** 감속 전 등속 구간까지 포함한 회전 시간(ms). */
  spinMs: number
  /** 정지 직전 마무리 시간(ms). 튕김이 아니라 아주 짧게 자리를 잡는 구간이다. */
  settleMs: number
  /** 이 릴이 완전히 멈추는 시각(ms). */
  endMs: number
  /** 최소 회전 바퀴 수. 오른쪽 릴일수록 더 돈다. */
  revolutions: number
}

export interface SpinPlan {
  reels: ReelSpinPlan[]
  /** 모든 릴이 함께 뒤로 당기는 시간(ms). 모션 축소면 0이다. */
  pullUpMs: number
  /** 마지막 릴이 멈추는 시각(ms). 뒤로 당기는 시간을 포함한다. */
  totalMs: number
  /** 모션 축소가 적용됐는지. 파티클 생략 판단에 쓴다. */
  reduced: boolean
}

/**
 * 릴별 스핀 타이밍 계획.
 *
 * 모든 릴이 **함께 뒤로 당겼다가**(`pullUpMs`) 같이 출발해
 * 왼쪽부터 `stagger` 간격으로 멈춘다.
 * 계획은 순수 데이터라 애니메이션 엔진 없이 테스트할 수 있다.
 */
export function buildSpinPlan(input: SpinPlanInput): SpinPlan {
  const reels = Math.max(1, Math.floor(input.reels))
  const reduced = input.reducedMotion === true

  let duration = Math.max(1, input.durationMs ?? (reduced ? REDUCED_SPIN_DURATION_MS : DEFAULT_SPIN_DURATION_MS))
  if (input.fast === true) duration = Math.max(1, duration * FAST_SPIN_FACTOR)
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

  // 모션 축소에서는 반동도 마무리도 없다. 짧게 돌고 딱 멈춘다.
  const pullUpMs = reduced ? 0 : PULL_UP_MS

  const plans: ReelSpinPlan[] = []
  for (let reel = 0; reel < reels; reel += 1) {
    const spinTotal = duration + stagger * reel
    const settleMs = reduced ? 0 : Math.min(LANDING_SETTLE_MS, spinTotal * LANDING_SETTLE_MAX_PORTION)
    plans.push({
      reel,
      startMs: pullUpMs,
      spinMs: spinTotal - settleMs,
      settleMs,
      endMs: pullUpMs + spinTotal,
      revolutions: BASE_REVOLUTIONS + reel,
    })
  }

  const last = plans[plans.length - 1]
  return { reels: plans, pullUpMs, totalMs: last?.endMs ?? pullUpMs, reduced }
}

export interface SkipPlan {
  /** 릴별 정지 시각(ms, 스킵을 누른 순간 기준). */
  reels: { reel: number; durationMs: number }[]
  /** 마지막 릴이 멈추는 시각(ms). */
  totalMs: number
}

/**
 * 스킵했을 때의 감속 계획.
 *
 * 남은 회전을 버리고 곧장 정지 위치로 붙는다. 그래도 한꺼번에 툭 서지 않도록
 * 왼쪽부터 `SKIP_STAGGER_MS` 간격을 남겨 리듬은 지킨다.
 * 착지 좌표는 계획과 무관하게 `stops`로 다시 확정되므로 결정론은 깨지지 않는다.
 */
export function buildSkipPlan(reels: number, totalMs: number = SKIP_TOTAL_MS): SkipPlan {
  const count = Math.max(1, Math.floor(reels))
  const budget = Math.max(1, totalMs)
  // 간격을 다 합쳐도 예산을 넘지 않게 줄인다. 릴이 많으면 간격이 좁아진다.
  const stagger = count > 1 ? Math.min(SKIP_STAGGER_MS, budget / (2 * (count - 1))) : 0
  const first = budget - stagger * (count - 1)

  const plans = []
  for (let reel = 0; reel < count; reel += 1) {
    plans.push({ reel, durationMs: first + stagger * reel })
  }
  return { reels: plans, totalMs: budget }
}
