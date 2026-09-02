import { describe, expect, it } from 'vitest'
import { MeResponseSchema, STARTING_COINS } from '@tgslot/shared'
import type { MeResponse } from '@tgslot/shared'
import { randomUUID } from 'node:crypto'
import { createApp } from './app.js'
import { createJwtService } from './auth/jwt.js'
import { MemoryRepos } from './repos/memory.js'
import { buildInitData } from './auth/initData.js'
import type { ApiConfig } from './config.js'

const BOT_TOKEN = '123456:TEST-BOT-TOKEN-abcdefghijklmnopqrstuvwxyz'

function makeConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    telegramBotToken: BOT_TOKEN,
    jwtSecret: 'test-secret-at-least-32-characters-long',
    databaseUrl: undefined,
    port: 8787,
    allowDevMock: false,
    corsOrigin: '*',
    spinLockTimeoutMs: 15_000,
    ...overrides,
  }
}

function makeInitData(telegramId: number, firstName = 'Ada', languageCode = 'en'): string {
  const authDate = Math.floor(Date.now() / 1000)
  return buildInitData(
    {
      auth_date: String(authDate),
      user: JSON.stringify({ id: telegramId, first_name: firstName, language_code: languageCode }),
    },
    BOT_TOKEN
  )
}

async function login(app: ReturnType<typeof createApp>, telegramId: number, languageCode = 'en') {
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: makeInitData(telegramId, 'Ada', languageCode) }),
  })
  return (await res.json()) as { token: string; user: { id: string; locale: string } }
}

async function patchMe(app: ReturnType<typeof createApp>, token: string, body: unknown): Promise<Response> {
  return app.request('/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
}

async function loginAndGetToken(app: ReturnType<typeof createApp>, telegramId: number): Promise<string> {
  const res = await app.request('/auth/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: makeInitData(telegramId) }),
  })
  const body = (await res.json()) as { token: string }
  return body.token
}

describe('POST /auth/telegram', () => {
  it('creates a user and credits STARTING_COINS on first login', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })

    const res = await app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: makeInitData(1001) }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBeTypeOf('string')
    expect(body.wallet.coins).toBe(STARTING_COINS)
    expect(body.user.telegramId).toBe(1001)
  })

  it('does not re-credit STARTING_COINS on a second login for the same user', async () => {
    const repos = new MemoryRepos()
    const app = createApp({ config: makeConfig(), repos })

    const first = await app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: makeInitData(1002) }),
    })
    expect(first.status).toBe(200)

    const second = await app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: makeInitData(1002) }),
    })
    expect(second.status).toBe(200)
    const body = await second.json()
    expect(body.wallet.coins).toBe(STARTING_COINS)
  })

  it('rejects invalid initData with 401 INVALID_INIT_DATA', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })

    const res = await app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: 'not-a-valid-signature' }),
    })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('INVALID_INIT_DATA')
  })

  it('rejects a malformed request body with 400', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })

    const res = await app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })
})

describe('GET /me', () => {
  it('returns the current user and wallet with a valid token', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    const token = await loginAndGetToken(app, 2001)

    const res = await app.request('/me', { headers: { authorization: `Bearer ${token}` } })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.telegramId).toBe(2001)
    expect(body.wallet.coins).toBe(STARTING_COINS)
  })

  it('rejects a request with no Authorization header', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    const res = await app.request('/me')
    expect(res.status).toBe(401)
  })

  it('rejects a request with an invalid token', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    const res = await app.request('/me', { headers: { authorization: 'Bearer not-a-real-token' } })
    expect(res.status).toBe(401)
  })
})

/** 서명은 멀쩡한데 그 유저가 없는 토큰. 유저 삭제나 in-memory 레포 재시작 상황이다. */
async function tokenForMissingUser(): Promise<string> {
  const jwt = createJwtService(makeConfig().jwtSecret)
  return jwt.signToken({ sub: randomUUID(), tid: 999_999 })
}

describe('유효한 토큰인데 유저가 없을 때', () => {
  it('GET /me는 401 USER_NOT_FOUND다', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    const token = await tokenForMissingUser()

    const res = await app.request('/me', { headers: { authorization: `Bearer ${token}` } })

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'User not found', code: 'USER_NOT_FOUND' })
  })

  it('다른 인증 라우트도 같은 401을 준다', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    const token = await tokenForMissingUser()
    const headers = { authorization: `Bearer ${token}` }

    for (const path of ['/bonus', '/missions', '/leaderboard']) {
      const res = await app.request(path, { headers })
      expect(res.status).toBe(401)
      expect(((await res.json()) as { code: string }).code).toBe('USER_NOT_FOUND')
    }
  })

  it('토큰 자체가 없거나 위조된 경우는 여전히 UNAUTHORIZED다', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })

    const missing = await app.request('/me')
    expect(missing.status).toBe(401)
    expect(((await missing.json()) as { code: string }).code).toBe('UNAUTHORIZED')

    const forged = await app.request('/me', { headers: { authorization: 'Bearer not-a-real-token' } })
    expect(((await forged.json()) as { code: string }).code).toBe('UNAUTHORIZED')
  })
})

describe('PATCH /me', () => {
  it('언어를 바꾸고 GET /me와 같은 모양을 돌려준다', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    const { token } = await login(app, 3001, 'en')

    const res = await patchMe(app, token, { locale: 'ko' })

    expect(res.status).toBe(200)
    const parsed = MeResponseSchema.safeParse(await res.json())
    expect(parsed.success).toBe(true)
    expect(parsed.data?.user.locale).toBe('ko')

    const me = (await (await app.request('/me', { headers: { authorization: `Bearer ${token}` } })).json()) as MeResponse
    expect(me.user.locale).toBe('ko')
  })

  it('직접 고른 언어는 다음 로그인의 language_code가 덮어쓰지 않는다', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    const { token } = await login(app, 3002, 'en')
    await patchMe(app, token, { locale: 'ko' })

    // 텔레그램 앱 언어가 en인 채로 다시 로그인해도 고른 값이 유지된다.
    const relogin = await login(app, 3002, 'en')
    expect(relogin.user.locale).toBe('ko')
  })

  it('직접 고르기 전이라면 로그인이 language_code를 반영한다', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    await login(app, 3003, 'en')

    const relogin = await login(app, 3003, 'ko')
    expect(relogin.user.locale).toBe('ko')
  })

  it('지원하지 않는 언어는 400 BAD_REQUEST다', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })
    const { token } = await login(app, 3004)

    for (const body of [{ locale: 'fr' }, { locale: 1 }, {}, null]) {
      const res = await patchMe(app, token, body)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { code: string }).code).toBe('BAD_REQUEST')
    }

    const me = (await (await app.request('/me', { headers: { authorization: `Bearer ${token}` } })).json()) as MeResponse
    expect(me.user.locale).toBe('en')
  })

  it('인증 없이는 401이다', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })

    const res = await app.request('/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: 'ko' }),
    })

    expect(res.status).toBe(401)
  })
})

describe('GET /games', () => {
  it('lists classic-777 first, sorted, with no hidden games', async () => {
    const app = createApp({ config: makeConfig(), repos: new MemoryRepos() })

    const res = await app.request('/games')

    expect(res.status).toBe(200)
    const body = (await res.json()) as { games: Array<{ id: string; status: string }> }
    expect(body.games[0]?.id).toBe('classic-777')
    expect(body.games.some((g) => g.status === 'hidden')).toBe(false)
  })
})

describe('dev mock auth', () => {
  it('rejects mock: initData when API_ALLOW_DEV_MOCK is false', async () => {
    const app = createApp({ config: makeConfig({ allowDevMock: false }), repos: new MemoryRepos() })

    const res = await app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: 'mock:5001:Test' }),
    })

    expect(res.status).toBe(401)
  })

  it('accepts mock: initData when API_ALLOW_DEV_MOCK is true', async () => {
    const app = createApp({ config: makeConfig({ allowDevMock: true }), repos: new MemoryRepos() })

    const res = await app.request('/auth/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: 'mock:5001:Test' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.telegramId).toBe(5001)
    expect(body.wallet.coins).toBe(STARTING_COINS)
  })
})
