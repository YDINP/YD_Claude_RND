import type { MiddlewareHandler } from 'hono'
import type { JwtService, VerifiedToken } from '../auth/jwt.js'

export interface AuthVariables {
  auth: VerifiedToken
}

/** `Authorization: Bearer <jwt>`를 검증해 컨텍스트에 `auth`를 심는다. 실패 시 401. */
export function authMiddleware(jwt: JwtService): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ')) {
      return c.json({ error: 'Missing bearer token', code: 'UNAUTHORIZED' }, 401)
    }

    const token = header.slice('Bearer '.length).trim()
    const verified = await jwt.verifyToken(token)
    if (!verified) {
      return c.json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' }, 401)
    }

    c.set('auth', verified)
    await next()
  }
}
