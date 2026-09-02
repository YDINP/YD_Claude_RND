import { Hono } from 'hono'
import type { LeaderboardResponse } from '@tgslot/shared'
import type { Repos } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'
import { LEADERBOARD_TOP_N } from '../economy/config.js'
import { isoWeekEnd, isoWeekKey, systemClock } from '../economy/time.js'
import type { Clock } from '../economy/time.js'

export interface LeaderboardRouteDeps {
  repos: Repos
  jwt: JwtService
  clock?: Clock
}

export function createLeaderboardRoute(deps: LeaderboardRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()
  const clock = deps.clock ?? systemClock

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
    }
    return c.json(response, 200)
  })

  return route
}
