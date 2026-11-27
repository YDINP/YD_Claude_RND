import { Hono } from 'hono'
import type { BonusClaimResponse, LeaderboardLastWeek, LeaderboardResponse } from '@tgslot/shared'
import type { Repos } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import {
  LEADERBOARD_REWARDS,
  LEADERBOARD_TOP_N,
  LEDGER_REASONS,
  leaderboardRewardForRank,
} from '../economy/config.js'
import { isoWeekEnd, isoWeekKey, previousIsoWeekKey, systemClock } from '../economy/time.js'
import type { Clock } from '../economy/time.js'

export interface LeaderboardRouteDeps {
  repos: Repos
  jwt: JwtService
  /** 테스트가 시간을 앞당길 수 있도록 주입. 레포와 **같은** 시계를 써야 한다. */
  clock?: Clock
}

export function createLeaderboardRoute(deps: LeaderboardRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()
  const clock = deps.clock ?? systemClock

  /** 지난 주 순위·보상. 순위권(보상 대상) 밖이면 null. */
  async function lastWeekOf(userId: string, now: Date): Promise<LeaderboardLastWeek | null> {
    const week = previousIsoWeekKey(now)
    const snapshot = await deps.repos.getLeaderboard(week, LEADERBOARD_TOP_N, userId)
    const rank = snapshot.me?.rank
    if (rank === undefined) return null
    // 지난 주 당첨이 0이면 보상하지 않는다 — 참가자가 적은 초기에 한 판(꽝)만 돌려도 받는 구멍을 막는다.
    if ((snapshot.me?.totalWin ?? 0) <= 0) return null
    const reward = leaderboardRewardForRank(rank)
    if (reward <= 0) return null
    const claimed = await deps.repos.getLeaderboardRewardClaimed(userId, week)
    return { week, rank, reward, claimed }
  }

  route.get('/', authMiddleware(deps.jwt, deps.repos), async (c) => {
    const auth = c.get('auth')
    const now = clock()
    const week = isoWeekKey(now)

    const snapshot = await deps.repos.getLeaderboard(week, LEADERBOARD_TOP_N, auth.sub)

    const response: LeaderboardResponse = {
      week,
      entries: snapshot.entries,
      me: snapshot.me,
      endsAt: isoWeekEnd(now).toISOString(),
      rewards: LEADERBOARD_REWARDS.map((tier) => ({ ...tier })),
      lastWeek: await lastWeekOf(auth.sub, now),
    }
    return c.json(response, 200)
  })

  // 지난 ISO 주의 보상만 받을 수 있다. 그 전 주는 소멸한다.
  route.post('/claim', authMiddleware(deps.jwt, deps.repos), async (c) => {
    const auth = c.get('auth')
    const lastWeek = await lastWeekOf(auth.sub, clock())
    if (!lastWeek || lastWeek.claimed) {
      return c.json({ error: 'Leaderboard reward is not claimable', code: 'NOT_CLAIMABLE' }, 409)
    }

    const claimed = await deps.repos.claimLeaderboardReward({
      userId: auth.sub,
      week: lastWeek.week,
      amount: lastWeek.reward,
      reason: LEDGER_REASONS.leaderboardReward,
    })
    if (!claimed) {
      return c.json({ error: 'Leaderboard reward is not claimable', code: 'NOT_CLAIMABLE' }, 409)
    }

    console.log(
      JSON.stringify({ evt: 'leaderboard_claim', userId: auth.sub, week: lastWeek.week, amount: claimed.amount })
    )

    const response: BonusClaimResponse = { amount: claimed.amount, wallet: claimed.wallet }
    return c.json(response, 200)
  })

  return route
}
