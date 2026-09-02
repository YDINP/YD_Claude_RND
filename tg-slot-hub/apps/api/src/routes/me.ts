import { Hono } from 'hono'
import type { MeResponse } from '@tgslot/shared'
import type { Repos } from '../repos/types.js'
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
    const [user, wallet] = await Promise.all([deps.repos.getById(auth.sub), deps.repos.getWallet(auth.sub)])

    if (!user || !wallet) {
      return c.json({ error: 'User not found', code: 'NOT_FOUND' }, 404)
    }

    const response: MeResponse = { user, wallet }
    return c.json(response, 200)
  })

  return route
}
