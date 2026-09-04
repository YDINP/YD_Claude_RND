import {
  BASE_REVOLUTIONS,
  DEFAULT_SPIN_SPEED,
  FAST_SPIN_FACTOR,
  LANDING_SETTLE_MAX_PORTION,
  REDUCED_SPIN_DURATION_MS,
  REDUCED_STAGGER_MS,
  REDUCED_TOTAL_CAP_MS,
  SKIP_SETTLE_MS,
  SKIP_STAGGER_MS,
  SPIN_SPEED_PROFILES,
  WIN_START_DELAY_MS,
} from './constants.js'

/**
 * 스핀 속도 프로파일 이름.
 *
 * - `normal`: 기본 리듬.
 * - `quick`: 회전과 정지 간격이 55%로 줄어든다.
 * - `turbo`: 최소. 당김이 없고 릴이 거의 동시에 선다.
 */
export type SpinSpeed = keyof typeof SPIN_SPEED_PROFILES

/** 이름에 해당하는 타이밍 표. 모르는 이름이 오면 기본 프로파일로 되돌린다. */
export function spinSpeedProfile(speed?: SpinSpeed): (typeof SPIN_SPEED_PROFILES)[SpinSpeed] {
  return SPIN_SPEED_PROFILES[speed ?? DEFAULT_SPIN_SPEED] ?? SPIN_SPEED_PROFILES[DEFAULT_SPIN_SPEED]
}

/**
 * 마지막 릴이 완전히 멈춘(정착 트윈까지 끝난) 시각과 당첨 연출(강조/fx/시트/배너)이 시작되는
 * 시각 사이에 둘 최소 여백(ms). "멈췄다"와 "터진다"가 겹쳐 보이지 않게 하는 숨 고르기 구간이다
 * (사용자 피드백: "각 연출은 릴스탑이 끝나고 나올 것"). 터보처럼 스핀 리듬 자체가 짧으면 이
 * 여백도 `winStartDelayScale`만큼 비례해 줄어든다. 모션 축소에서는 연출 자체를 최소화하는
 * 기존 방침을 그대로 따라 0을 돌려준다 — 축소 모드에 굳이 인위적인 대기를 더하지 않는다.
 * 순수 함수라 타이머 없이 스케일이 그대로 반영됐는지 검증할 수 있다.
 */
export function winStartDelayMs(speed?: SpinSpeed, reducedMotion?: boolean): number {
  if (reducedMotion === true) return 0
  return Math.round(WIN_START_DELAY_MS * spinSpeedProfile(speed).winStartDelayScale)
}

export interface SpinPlanInput {
  reels: number
  durationMs?: number
  stagger?: number
  reducedMotion?: boolean
  /** 프리스핀처럼 리듬을 당겨야 할 때. 회전 시간을 `FAST_SPIN_FACTOR`만큼 줄인다. */
  fast?: boolean
  /**
   * 스핀 속도 프로파일. 기본 `normal`.
   * `durationMs`/`stagger`를 직접 주면 그쪽이 이긴다. 모션 축소는 언제나 이 위에 얹힌다.
   */
  speed?: SpinSpeed
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
  /** 모든 릴이 함께 뒤로 당기는 시간(ms). 모션 축소와 터보에서는 0이다. */
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
  const profile = spinSpeedProfile(input.speed)

  let duration = Math.max(1, input.durationMs ?? (reduced ? REDUCED_SPIN_DURATION_MS : profile.durationMs))
  if (input.fast === true) duration = Math.max(1, duration * FAST_SPIN_FACTOR)
  let stagger = Math.max(0, input.stagger ?? (reduced ? REDUCED_STAGGER_MS : profile.staggerMs))

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
  // 터보는 프로파일이 당김을 0으로 두어 같은 자리에서 생략된다.
  const pullUpMs = reduced ? 0 : profile.pullUpMs

  const plans: ReelSpinPlan[] = []
  for (let reel = 0; reel < reels; reel += 1) {
    const spinTotal = duration + stagger * reel
    const settleMs = reduced ? 0 : Math.min(profile.settleMs, spinTotal * LANDING_SETTLE_MAX_PORTION)
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
  /** 릴별 정착 시간(ms). 남은 회전은 없고 이 시간 동안 정지 위치로 내려앉기만 한다. */
  reels: { reel: number; durationMs: number }[]
  /** 마지막 릴이 자리를 잡는 시각(ms). */
  totalMs: number
}

/**
 * 스킵했을 때의 착지 계획.
 *
 * 남은 회전은 **없다.** 릴은 곧장 정지 위치 바로 위에 붙고, 여기서 정한 시간 안에 내려앉는다.
 * `durationMs`는 그 정착 시간이지 남은 거리를 훑는 시간이 아니다 — 예전처럼 거리를 몰아 지나가면
 * 스트립이 긴 게임에서 "다시 한 바퀴 돌다 멈춘다"로 보인다.
 * 한꺼번에 툭 서지 않도록 왼쪽부터 `SKIP_STAGGER_MS` 간격을 남겨 리듬은 지킨다.
 * 착지 좌표는 계획과 무관하게 `stops`로 다시 확정되므로 결정론은 깨지지 않는다.
 */
export function buildSkipPlan(reels: number, totalMs: number = SKIP_SETTLE_MS): SkipPlan {
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
