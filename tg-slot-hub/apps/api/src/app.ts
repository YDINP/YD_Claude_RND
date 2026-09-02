import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { ApiConfig } from './config.js'
import type { Repos } from './repos/types.js'
import { createJwtService } from './auth/jwt.js'
import type { JwtService } from './auth/jwt.js'
import { createAuthRoute } from './routes/auth.js'
import { createMeRoute } from './routes/me.js'
import { createGamesRoute } from './routes/games.js'

export interface AppDeps {
  config: ApiConfig
  repos: Repos
  /** 테스트에서 고정 jwt 서비스를 주입하고 싶을 때 사용. 없으면 config.jwtSecret으로 생성 */
  jwt?: JwtService
}

/** 테스트가 in-memory repos를 주입할 수 있도록 의존성을 명시적으로 받는 팩토리. */
export function createApp(deps: AppDeps): Hono {
  const jwt = deps.jwt ?? createJwtService(deps.config.jwtSecret)
  const app = new Hono()

  app.use('*', logger())
  app.use('*', cors({ origin: deps.config.corsOrigin }))

  app.get('/health', (c) => c.json({ ok: true }))

  app.route('/auth', createAuthRoute({ config: deps.config, repos: deps.repos, jwt }))
  app.route('/me', createMeRoute({ repos: deps.repos, jwt }))
  app.route('/games', createGamesRoute())

  // 라우트에서 못 잡은 예외(레포/DB/JWT 내부 에러 등)가 Hono 기본 HTML 에러 페이지로 새지 않도록
  // ApiErrorSchema 모양의 JSON 500으로 통일한다. 4xx는 각 라우트에서 이미 명시적으로 c.json(...)한다.
  app.onError((err, c) => {
    console.error('[api] unhandled error:', err)
    return c.json({ error: 'Internal server error', code: 'INTERNAL' }, 500)
  })

  return app
}
