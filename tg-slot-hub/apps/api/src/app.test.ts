import { describe, expect, it } from 'vitest'
import { STARTING_COINS } from '@tgslot/shared'
import { createApp } from './app.js'
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
    ...overrides,
  }
}

function makeInitData(telegramId: number, firstName = 'Ada'): string {
  const authDate = Math.floor(Date.now() / 1000)
  return buildInitData(
    {
      auth_date: String(authDate),
      user: JSON.stringify({ id: telegramId, first_name: firstName, language_code: 'en' }),
    },
    BOT_TOKEN
  )
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
