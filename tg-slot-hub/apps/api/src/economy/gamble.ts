import type { GambleSide, GambleState, GambleStep } from '@tgslot/shared'
import type { GambleConfig, Rng } from '@tgslot/slot-engine'

/**
 * 더블업 설정은 **엔진이 소유한다** (`math.json`의 `gamble` 블록, `GambleConfigSchema`).
 * 엔진이 형식과 기대값(`chance x payout <= 1`)까지 검증하므로 API는 그 값을 그대로 쓴다.
 * 이 모듈은 추첨과 세션 회계만 담당한다.
 */
export type { GambleConfig }

/** 확률 판정의 분모. 정수 비교로 바꿔 부동소수 비교를 피한다. */
const CHANCE_DENOMINATOR = 1_000_000

/**
 * 잠긴 판돈의 수명. 지나면 자동 회수한다.
 *
 * 프리스핀(7일)보다 훨씬 짧다. 더블업은 결과 화면에서 즉시 누르는 것이고,
 * 그 사이 돈이 지갑 밖에 잠겨 있기 때문이다.
 */
export const GAMBLE_TTL_MS = 10 * 60 * 1000

export interface GambleDraw {
  side: GambleSide
  won: boolean
}

/** 라운드 시드에서 이 단계의 RNG 입력을 만든다. 검증 문서와 코드가 어긋나지 않게 한 곳에 둔다. */
export function gambleSeedInput(seed: string, nonce: number, step: number): string {
  return `${seed}:${nonce}:gamble:${step}`
}

/** 원장 참조 id. 어느 라운드의 몇 번째 단계인지 한눈에 보이게 한다. */
export function gambleRefId(roundId: string, step: number): string {
  return `${roundId}:g${step}`
}

/**
 * 최초 잠금(에스크로)의 참조 id. 0단계 회수와 구분되어야 원장만 보고도
 * "잠근 것"과 "돌려준 것"을 짝지을 수 있다.
 */
export function gambleEscrowRefId(roundId: string): string {
  return `${roundId}:g0:escrow`
}

export function otherSide(side: GambleSide): GambleSide {
  return side === 'heads' ? 'tails' : 'heads'
}

/**
 * 한 단계 판정.
 *
 * 승패를 먼저 뽑고 보여 줄 면은 거기서 따라온다 (이기면 고른 면, 지면 반대 면).
 * 면을 먼저 뽑고 맞히는 방식으로 하면 확률이 항상 1/2로 고정되어 `chance` 설정이 죽는다.
 * 이 방식은 `chance`가 0.5가 아니어도 그대로 지켜지고, 시드·단계·고른 면만 알면 재현된다.
 */
export function drawGamble(rng: Rng, pick: GambleSide, chance: number): GambleDraw {
  const won = rng.nextInt(CHANCE_DENOMINATOR) < Math.round(chance * CHANCE_DENOMINATOR)
  return { won, side: won ? pick : otherSide(pick) }
}

/** 성공 시 다음 단계의 판돈. 정수로 내린다. */
export function gamblePayout(pendingWin: number, payout: number): number {
  return Math.floor(pendingWin * payout)
}

/**
 * 이 라운드로 더블업을 열 수 있는지.
 * 유료 스핀의 당첨만 대상이다. 프리스핀 당첨까지 열어 주면 공짜로 얻은 돈을 무한히 굴릴 수 있다.
 */
export function isGambleEligible(input: { isFreeSpin: boolean; totalWin: number; config?: GambleConfig }): boolean {
  return input.config !== undefined && !input.isFreeSpin && input.totalWin > 0
}

/** 더 도전할 수 있는 횟수. 상한에 닿았거나 판돈이 0이면 0이다. */
export function stepsLeft(state: GambleState | null): number {
  if (!state || state.pendingWin <= 0) return 0
  return Math.max(0, state.maxSteps - state.steps.length)
}

/** 만료됐는지. `expiresAt`이 없는 옛 상태는 만료되지 않은 것으로 본다. */
export function isGambleExpired(state: GambleState | null, now: Date): boolean {
  if (!state || state.expiresAt === undefined) return false
  return new Date(state.expiresAt).getTime() <= now.getTime()
}

/** 지금 도전할 수 있는 상태인지. 만료됐거나 단계를 다 썼으면 아니다. */
export function isGambleActive(state: GambleState | null, now: Date): boolean {
  return state !== null && !isGambleExpired(state, now) && stepsLeft(state) > 0
}

/**
 * 성공 후에도 계속 걸 수 있는지. 단계 상한과 금액 상한에 걸리면 자동 회수한다.
 * 금액 상한은 **총 베팅액의 배수**라서 라운드 베팅액이 필요하다.
 */
export function shouldAutoCollect(state: GambleState, config: GambleConfig, totalBet: number): boolean {
  if (state.steps.length >= state.maxSteps) return true
  if (config.maxWinCap === undefined) return false
  return state.pendingWin >= config.maxWinCap * totalBet
}

/**
 * 같은 멱등키로 이미 처리한 단계. 있으면 그 결과를 그대로 돌려주면 된다.
 *
 * **라운드에 남은 기록**을 본다. 세션이 닫힌 뒤(패배·자동 회수)에는 상태가 비어 있어서
 * 상태만 보면 재전송을 알아보지 못하고 409를 주게 된다. 라운드 기록은 계속 남는다.
 */
export function findStepByKey(steps: readonly GambleStep[], idempotencyKey: string): GambleStep | undefined {
  return steps.find((step) => step.idempotencyKey === idempotencyKey)
}

/** 잠금 만료 시각. 단계를 진행할 때마다 새로 민다. */
export function gambleExpiresAt(now: Date): string {
  return new Date(now.getTime() + GAMBLE_TTL_MS).toISOString()
}
