/**
 * 코인 토스 연출의 "순수한 부분" — 단계 전이 스케줄, 공개 금액 계산, 파티클 배치.
 * 여기엔 React도 타이머도 DOM도 없다. `GambleModal`은 이 함수들이 계산해 준 결과를 재생만 한다
 * (부작용은 전부 컴포넌트 쪽 useEffect 하나씩에 몰아둔다).
 */
import type { GambleSide } from '@tgslot/shared'

/**
 * 코인 토스의 명시적 상태 머신.
 *
 *   idle ──픽──▶ tossing ──감속 끝──▶ nearMiss ──마지막 반 바퀴──▶ settling ──▶ revealed
 *
 * `tossing`은 두 구간을 함께 덮는다 — 서버 응답을 기다리는 무한 회전과, 응답이 온 뒤 착지
 * 애니메이션의 감속 구간이다. 둘 다 "결과를 알 수 없는 빠른 회전"이라 사용자에겐 한 동작이다.
 * `nearMiss`가 이 연출의 핵심으로, 코인이 *결과의 반대 면*을 보여준 채 거의 멈춰 있는 구간이다.
 */
export type GamblePhase = 'idle' | 'tossing' | 'nearMiss' | 'settling' | 'revealed'

export type GambleOutcome = 'win' | 'lose' | 'collected'

/**
 * 착지 단계별 지속시간(ms). 합(`LAND_MS`)이 코인이 도는 총 시간이고,
 * 각 경계는 `GambleModal.css`의 `hub-gamble-coin-land` 키프레임 %와 정확히 짝이 맞아야 한다
 * (1040/1400 = 74.3%, 1240/1400 = 88.6%).
 */
export const TOSS_DECEL_MS = 1040
export const NEAR_MISS_MS = 200
export const SETTLING_MS = 160
export const LAND_MS = TOSS_DECEL_MS + NEAR_MISS_MS + SETTLING_MS

/** 결과 공개 뒤 금액이 굴러가는 시간 — 이길 땐 여유 있게, 질 땐 짧게(벌주지 않는다). */
export const ROLLUP_WIN_MS = 600
export const ROLLUP_LOSE_MS = 320

/** 결과 공개 뒤 액션 버튼이 팝인해 다시 눌릴 수 있게 되기까지 (CSS `--pop`의 delay와 같은 값) */
export const ACTIONS_DELAY_MS = 620

export interface PhaseTransition {
  readonly phase: GamblePhase
  readonly delay: number
}

export interface PhaseSchedule {
  /** 지금 즉시 들어가야 할 단계 */
  readonly initial: GamblePhase
  /** `initial` 시점을 0으로 본 예약 전이들 (없으면 더 이상 변하지 않는다) */
  readonly transitions: readonly PhaseTransition[]
}

export interface TossInput {
  /** 서버 응답을 기다리는 중인가 */
  readonly flipping: boolean
  /** 서버가 준 판정 (없으면 아직 안 굴렸다) */
  readonly outcome: GambleOutcome | null
  /** 서버가 준 착지 면 — null이면 판정 자체가 없었다는 뜻이라 코인은 돌지 않는다 */
  readonly revealedSide: GambleSide | null
  readonly reducedMotion: boolean
}

/**
 * 지금 상태에서 밟아야 할 단계와 그 전이 시각을 계산한다.
 *
 * 결과가 이미 도착해 있어도 곧바로 `revealed`로 가지 않는 게 요점이다 — 착지가 끝날 때까지는
 * 결과를 눈으로 알 수 없어야 한다. 다만 두 경우엔 기다릴 이유가 없어 즉시 공개한다:
 * 모션 줄이기가 켜져 있거나(회전 자체를 안 한다), 서버가 판정 없이 회수해 착지할 면이 없을 때.
 */
export function tossSchedule({ flipping, outcome, revealedSide, reducedMotion }: TossInput): PhaseSchedule {
  if (outcome === null) {
    return { initial: flipping ? 'tossing' : 'idle', transitions: [] }
  }
  if (reducedMotion || revealedSide === null) {
    return { initial: 'revealed', transitions: [] }
  }
  return {
    initial: 'tossing',
    transitions: [
      { phase: 'nearMiss', delay: TOSS_DECEL_MS },
      { phase: 'settling', delay: TOSS_DECEL_MS + NEAR_MISS_MS },
      { phase: 'revealed', delay: LAND_MS },
    ],
  }
}

/** 코인이 아직 공중에 있는(결과를 감춰야 하는) 단계인지 */
export function isAirborne(phase: GamblePhase): boolean {
  return phase === 'tossing' || phase === 'nearMiss' || phase === 'settling'
}

export interface AmountInput {
  readonly outcome: GambleOutcome
  /** 픽을 누른 순간 얼려둔 판돈 */
  readonly stake: number
  /** 서버 응답 이후의 세션 금액 (세션이 끝났으면 0이 온다) */
  readonly pendingWin: number
  readonly payout: number
}

/**
 * 공개 시점에 보여줄 최종 금액.
 *
 * 이겼을 때 서버의 `pendingWin`을 그대로 쓸 수 없는 경우가 있다 — 상한(단계/금액)에 닿아 즉시
 * 회수되면 세션이 사라져 `pendingWin`이 0으로 내려온다. 그때는 판돈×배당으로 되돌려 계산한다.
 * 'collected'는 판정 없이 회수된 것이므로 판돈이 그대로 최종 금액이다.
 */
export function targetAmount({ outcome, stake, pendingWin, payout }: AmountInput): number {
  if (outcome === 'lose') return 0
  if (outcome === 'collected') return stake
  return pendingWin > stake ? pendingWin : Math.round(stake * payout)
}

export function rollupDuration(outcome: GambleOutcome): number {
  return outcome === 'win' ? ROLLUP_WIN_MS : ROLLUP_LOSE_MS
}

/**
 * 롤업 중간값. 이길 땐 감속(ease-out cubic)해서 "차오르는" 느낌을 주고,
 * 질 땐 선형으로 뚝 떨어뜨려 미련 없이 끝낸다.
 */
export function rollupAmount(from: number, to: number, progress: number, outcome: GambleOutcome): number {
  const p = Math.min(1, Math.max(0, progress))
  const eased = outcome === 'win' ? 1 - Math.pow(1 - p, 3) : p
  return Math.round(from + (to - from) * eased)
}

export interface BurstParticle {
  readonly angle: number
  readonly distance: number
  readonly delay: number
}

/** 연승 단계별 파티클 수 — 단계가 오를수록 촘촘해진다(색은 CSS의 `--step-N`이 맡는다). */
export const BURST_COUNT_BY_STEP = [12, 16, 20] as const
export const MAX_WIN_STEP = BURST_COUNT_BY_STEP.length

/**
 * 황금각(137.508°)으로 배치한다 — 앞에서부터 몇 개를 잘라 써도 고르게 퍼지므로,
 * 단계마다 파티클을 새로 만들 필요 없이 하나의 배열을 접두사로 나눠 쓸 수 있다.
 */
const GOLDEN_ANGLE = 137.508

const ALL_BURST_PARTICLES: readonly BurstParticle[] = Array.from(
  { length: BURST_COUNT_BY_STEP[MAX_WIN_STEP - 1] ?? 20 },
  (_, i) => ({
    angle: Number(((i * GOLDEN_ANGLE) % 360).toFixed(1)),
    distance: 44 + (i % 3) * 15,
    delay: (i % 4) * 24,
  }),
)

/** 단계별 접두사를 모듈 로드 시 한 번만 만들어 둔다 — 렌더마다 새 배열을 만들지 않는다. */
const BURST_BY_STEP: readonly (readonly BurstParticle[])[] = BURST_COUNT_BY_STEP.map((count) =>
  ALL_BURST_PARTICLES.slice(0, count),
)

/** 연승 단계(1부터)에 해당하는 파티클 배열. 범위를 벗어나면 양 끝으로 잘라낸다. */
export function burstParticles(step: number): readonly BurstParticle[] {
  const index = Math.min(Math.max(step, 1), MAX_WIN_STEP) - 1
  return BURST_BY_STEP[index] ?? ALL_BURST_PARTICLES
}
