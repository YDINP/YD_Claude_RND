/**
 * 허브 경제 상수의 단일 소스.
 *
 * 튜닝 대상 숫자는 전부 여기 모아 둔다. 로직(레벨 계산, 보너스 판정, 미션 매칭)은
 * 옆 파일들이 갖고, 이 파일은 값만 갖는다. Phase 6 admin에서 이 값들을 DB로 옮길 때
 * 손댈 곳이 한 파일로 끝나게 하기 위해서다.
 */

// ---- 원장 사유 (ledger.reason) ----
export const LEDGER_REASONS = {
  dailyBonus: 'daily_bonus',
  timedBonus: 'timed_bonus',
  rescueBonus: 'rescue_bonus',
  jackpotWin: 'jackpot_win',
  missionReward: 'mission_reward',
  levelUp: 'level_up',
} as const

// ---- 데일리 로그인 보너스 ----
/** 연속 1일차..7일차 지급액. 8일차 이후는 마지막 값(3500)이 반복된다. */
export const DAILY_BONUS_BY_STREAK_DAY = [500, 800, 1200, 1600, 2000, 2500, 3500] as const
/** 이 일차를 넘어서면 지급액이 더 오르지 않는다 */
export const DAILY_STREAK_CAP_DAY = DAILY_BONUS_BY_STREAK_DAY.length

// ---- 4시간 보너스 ----
export const TIMED_BONUS_AMOUNT = 300
export const TIMED_BONUS_COOLDOWN_MS = 4 * 60 * 60 * 1000

// ---- 파산 구제 보너스 ----
export const RESCUE_BONUS_AMOUNT = 500
/** 이 코인 수 **미만**일 때만 구제 대상 */
export const RESCUE_BONUS_COIN_THRESHOLD = 10
export const RESCUE_BONUS_COOLDOWN_MS = 6 * 60 * 60 * 1000

// ---- 프로그레시브 잭팟 ----
/** 당첨 후 풀이 되돌아가는 시드 금액 */
export const JACKPOT_SEED = 50_000
/**
 * 스핀마다 `round(totalBet * RATE)`가 풀에 적립된다. 하우스 몫에서 나가고 베팅 차감은 그대로다.
 * `floor`가 아니라 `round`인 이유: floor면 10/20 베팅의 적립이 0인데도 당첨 확률은 붙어서
 * 최소 베팅만 돌리는 것이 지배 전략이 된다.
 */
export const JACKPOT_ACCRUAL_RATE = 0.01
/**
 * 당첨 판정의 분모. `rng.nextInt(DENOM) < accrual`이므로 확률은 **실제 적립액에 비례**한다.
 * 적립이 0인 베팅(10, 20)은 당첨 기회도 0이다. 100 베팅은 적립 1 → 5만분의 1.
 */
export const JACKPOT_ODDS_DENOMINATOR = 50_000

// ---- 주간 리더보드 ----
export const LEADERBOARD_TOP_N = 50

// ---- 레벨 ----
/** 레벨 n의 요구 xp = round(BASE * n^EXPONENT). 단 레벨 1은 0이다. */
export const LEVEL_XP_BASE = 2000
export const LEVEL_XP_EXPONENT = 1.6
/** 레벨업 보너스 = 이 값 × 도달 레벨 */
export const LEVEL_UP_BONUS_PER_LEVEL = 200
/** 레벨 구간별 해금 최대 베팅. `minLevel` 내림차순으로 평가한다. */
export const MAX_BET_TIERS = [
  { minLevel: 6, maxBet: 500 },
  { minLevel: 3, maxBet: 200 },
  { minLevel: 1, maxBet: 100 },
] as const

// ---- 데일리 미션 ----
/**
 * 미션 정의. `scope`가 진행도 증가 조건이다.
 * - `any-spin`: 모든 스핀
 * - `winning-spin`: 당첨(win > 0) 스핀
 * - `game`: `gameId`가 일치하는 스핀
 */
export const MISSION_DEFS = [
  {
    id: 'spin_50',
    name: { en: 'Spin 50 times', ko: '50회 스핀하기' },
    scope: { kind: 'any-spin' },
    target: 50,
    reward: 1000,
  },
  {
    id: 'win_3',
    name: { en: 'Win 3 spins', ko: '3회 당첨되기' },
    scope: { kind: 'winning-spin' },
    target: 3,
    reward: 500,
  },
  {
    id: 'classic_20',
    name: { en: 'Spin Classic 777 twenty times', ko: '클래식 777에서 20회 스핀' },
    scope: { kind: 'game', gameId: 'classic-777' },
    target: 20,
    reward: 500,
  },
] as const satisfies readonly MissionDef[]

export interface MissionDef {
  id: string
  name: { en: string; ko?: string }
  scope: { kind: 'any-spin' } | { kind: 'winning-spin' } | { kind: 'game'; gameId: string }
  target: number
  reward: number
}
