import { Hono } from 'hono'
import { AuthTelegramRequestSchema, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@tgslot/shared'
import type { AuthResponse, Locale } from '@tgslot/shared'
import type { ApiConfig } from '../config.js'
import type { Repos } from '../repos/types.js'
import type { JwtService } from '../auth/jwt.js'
import { validateInitData } from '../auth/initData.js'
import { tryDevMockAuth } from '../auth/devMock.js'

export interface AuthRouteDeps {
  config: Pick<ApiConfig, 'allowDevMock' | 'telegramBotToken'>
  repos: Repos
  jwt: JwtService
}

function resolveLocale(languageCode: string | undefined): Locale {
  if (languageCode && (SUPPORTED_LOCALES as readonly string[]).includes(languageCode)) {
    return languageCode as Locale
  }
  return DEFAULT_LOCALE
}

export function createAuthRoute(deps: AuthRouteDeps): Hono {
  const route = new Hono()

  route.post('/telegram', async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    const parsed = AuthTelegramRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, 400)
    }

    const { initData } = parsed.data

    // dev mock 경로를 먼저 시도하고, 통과 못 하면(=플래그 꺼짐 또는 mock: 접두사 없음) 실서명 검증으로 폴백한다.
    const authResult = tryDevMockAuth(initData, deps.config.allowDevMock) ?? validateInitData(initData, deps.config.telegramBotToken)

    if (!authResult.ok) {
      return c.json({ error: 'Invalid Telegram init data', code: 'INVALID_INIT_DATA' }, 401)
    }

    const locale = resolveLocale(authResult.user.languageCode)
    const { user, wallet } = await deps.repos.upsertFromTelegram(authResult.user, locale)
    const token = await deps.jwt.signToken({ sub: user.id, tid: user.telegramId })

    const response: AuthResponse = { token, user, wallet }
    return c.json(response, 200)
  })

  return route
}
