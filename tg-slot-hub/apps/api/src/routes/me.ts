import { Hono } from 'hono'
import type { MeResponse } from '@tgslot/shared'
import type { Repos } from '../repos/types.js'
import { toLevelState } from '../economy/level.js'
import type { JwtService } from '../auth/jwt.js'
import { authMiddleware } from '../middleware/auth.js'
import type { AuthVariables } from '../middleware/auth.js'

export interface MeRouteDeps {
  repos: Repos
  jwt: JwtService
}

export function createMeRoute(deps: MeRouteDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>()

  route.get('/', authMiddleware(deps.jwt), async (c) => {
    const auth = c.get('auth')
    const [user, wallet, jackpot] = await Promise.all([
      deps.repos.getById(auth.sub),
      deps.repos.getWallet(auth.sub),
      deps.repos.getJackpot(),
    ])

    if (!user || !wallet) {
      return c.json({ error: 'User not found', code: 'NOT_FOUND' }, 404)
    }

    // level은 xp에서 파생되므로 저장 값이 아니라 계산 값을 응답에 싣는다.
    const levelInfo = toLevelState(user.xp)
    const response: MeResponse = {
      user: { ...user, level: levelInfo.level },
      wallet,
      levelInfo,
      jackpot: jackpot.pool,
    }
    return c.json(response, 200)
  })

  return route
}
