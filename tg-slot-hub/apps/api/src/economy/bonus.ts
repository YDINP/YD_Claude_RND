import type { BonusStatus } from '@tgslot/shared'
import {
  DAILY_BONUS_BY_STREAK_DAY,
  DAILY_STREAK_CAP_DAY,
  RESCUE_BONUS_AMOUNT,
  RESCUE_BONUS_COIN_THRESHOLD,
  RESCUE_BONUS_COOLDOWN_MS,
  TIMED_BONUS_AMOUNT,
  TIMED_BONUS_COOLDOWN_MS,
} from './config.js'
import { startOfNextUtcDay, utcDayNumber } from './time.js'

export type BonusKind = 'daily' | 'timed' | 'rescue'

export const BONUS_KINDS: readonly BonusKind[] = ['daily', 'timed', 'rescue']

/** 보너스 수령 기록 1건. `streakDay`는 데일리에만 의미가 있고 나머지는 1이다. */
export interface BonusClaim {
  kind: BonusKind
  claimedAt: Date
  streakDay: number
}

export type BonusClaims = Record<BonusKind, BonusClaim | null>

/** 수령이 성립할 때의 지급 내용. `null`을 돌려주면 수령 불가(409)다. */
export interface BonusGrant {
  amount: number
  streakDay: number
}

export function emptyBonusClaims(): BonusClaims {
  return { daily: null, timed: null, rescue: null }
}

/** 연속 n일차의 지급액. 8일차 이후는 7일차 금액이 계속 나온다. */
export function dailyAmountForStreakDay(streakDay: number): number {
  const table: readonly number[] = DAILY_BONUS_BY_STREAK_DAY
  const index = Math.min(Math.max(streakDay, 1), DAILY_STREAK_CAP_DAY) - 1
  const amount = table[index]
  if (amount === undefined) throw new Error(`[economy] 데일리 보너스 표에 ${streakDay}일차 항목이 없다`)
  return amount
}

/**
 * 다음 데일리 수령의 예상 내용. 상태 조회와 실제 수령이 같은 규칙을 쓰도록 한 곳에 둔다.
 *
 * - 오늘 아직 안 받았으면 지금 수령 가능하고, 어제 받았으면 연속 일차가 1 올라간다.
 * - 오늘 이미 받았으면 다음 기회는 내일 자정(UTC)이고, 그때 받으면 연속이 이어진다는 가정으로
 *   일차를 +1 해서 보여준다. 실제로 하루를 건너뛰면 수령 시점에 1일차로 리셋된다.
 */
export function projectDaily(
  last: BonusClaim | null,
  now: Date
): { claimable: boolean; streakDay: number; amount: number; nextAvailableAt: Date | null } {
  if (!last) {
    return { claimable: true, streakDay: 1, amount: dailyAmountForStreakDay(1), nextAvailableAt: null }
  }

  const daysSince = utcDayNumber(now) - utcDayNumber(last.claimedAt)

  if (daysSince <= 0) {
    const streakDay = last.streakDay + 1
    return {
      claimable: false,
      streakDay,
      amount: dailyAmountForStreakDay(streakDay),
      nextAvailableAt: startOfNextUtcDay(last.claimedAt),
    }
  }

  const streakDay = daysSince === 1 ? last.streakDay + 1 : 1
  return { claimable: true, streakDay, amount: dailyAmountForStreakDay(streakDay), nextAvailableAt: null }
}

export function decideDaily(last: BonusClaim | null, now: Date): BonusGrant | null {
  const projection = projectDaily(last, now)
  if (!projection.claimable) return null
  return { amount: projection.amount, streakDay: projection.streakDay }
}

export function projectTimed(
  last: BonusClaim | null,
  now: Date
): { claimable: boolean; amount: number; nextAvailableAt: Date | null } {
  if (!last) return { claimable: true, amount: TIMED_BONUS_AMOUNT, nextAvailableAt: null }

  const readyAt = new Date(last.claimedAt.getTime() + TIMED_BONUS_COOLDOWN_MS)
  if (now.getTime() < readyAt.getTime()) {
    return { claimable: false, amount: TIMED_BONUS_AMOUNT, nextAvailableAt: readyAt }
  }
  return { claimable: true, amount: TIMED_BONUS_AMOUNT, nextAvailableAt: null }
}

export function decideTimed(last: BonusClaim | null, now: Date): BonusGrant | null {
  return projectTimed(last, now).claimable ? { amount: TIMED_BONUS_AMOUNT, streakDay: 1 } : null
}

/** 파산 구제. 잔액이 문턱 **미만**이고 쿨다운이 지났을 때만. */
export function projectRescue(
  last: BonusClaim | null,
  coins: number,
  now: Date
): { claimable: boolean; amount: number } {
  if (coins >= RESCUE_BONUS_COIN_THRESHOLD) return { claimable: false, amount: RESCUE_BONUS_AMOUNT }
  if (last && now.getTime() - last.claimedAt.getTime() < RESCUE_BONUS_COOLDOWN_MS) {
    return { claimable: false, amount: RESCUE_BONUS_AMOUNT }
  }
  return { claimable: true, amount: RESCUE_BONUS_AMOUNT }
}

export function decideRescue(last: BonusClaim | null, coins: number, now: Date): BonusGrant | null {
  return projectRescue(last, coins, now).claimable ? { amount: RESCUE_BONUS_AMOUNT, streakDay: 1 } : null
}

/** `GET /bonus` 응답. 세 판정을 한 번에 굴린다. */
export function buildBonusStatus(claims: BonusClaims, coins: number, now: Date): BonusStatus {
  const daily = projectDaily(claims.daily, now)
  const timed = projectTimed(claims.timed, now)
  const rescue = projectRescue(claims.rescue, coins, now)

  return {
    daily: {
      claimable: daily.claimable,
      streakDay: daily.streakDay,
      nextAmount: daily.amount,
      nextAvailableAt: daily.nextAvailableAt ? daily.nextAvailableAt.toISOString() : null,
    },
    timed: {
      claimable: timed.claimable,
      amount: timed.amount,
      nextAvailableAt: timed.nextAvailableAt ? timed.nextAvailableAt.toISOString() : null,
    },
    rescue: { claimable: rescue.claimable, amount: rescue.amount },
  }
}
