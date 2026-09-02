import type { MiddlewareHandler } from 'hono'
import type { JwtService, VerifiedToken } from '../auth/jwt.js'
import type { AppUser, UserRepo } from '../repos/types.js'

export interface AuthVariables {
  auth: VerifiedToken
  /** 토큰 주인의 현재 유저 행. 미들웨어가 이미 읽어 뒀으므로 라우트는 다시 조회하지 않는다. */
  user: AppUser
}

/**
 * `Authorization: Bearer <jwt>`를 검증하고 토큰 주인을 컨텍스트에 심는다.
 *
 * - 토큰이 없거나 위조/만료 → 401 `UNAUTHORIZED`
 * - 토큰은 유효한데 그 유저가 더 이상 없음 → 401 `USER_NOT_FOUND`
 *
 * 두 번째 경우가 따로 있는 이유: JWT는 7일짜리라 유저가 지워지거나 in-memory 레포로 뜬 서버가
 * 재시작된 뒤에도 서명은 여전히 통과한다. 그때 라우트마다 제각각 404를 내면 클라이언트가
 * "다시 로그인하라"는 신호로 읽지 못한다. 인증 실패로 통일해 재로그인을 유도한다.
 */
export function authMiddleware(
  jwt: JwtService,
  repos: UserRepo
): MiddlewareHandler<{ Variables: AuthVariables }> {
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

    const user = await repos.getById(verified.sub)
    if (!user) {
      return c.json({ error: 'User not found', code: 'USER_NOT_FOUND' }, 401)
    }

    c.set('auth', verified)
    c.set('user', user)
    await next()
  }
}
