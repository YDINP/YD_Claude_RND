import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMe, spin, ApiClientError, registerReauthHandler } from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const meResponseBody = {
  user: { id: 'u1', telegramId: 1, firstName: 'Dev', locale: 'en', level: 1, xp: 0 },
  wallet: { coins: 1000, gems: 0 },
  levelInfo: { level: 1, xp: 0, nextLevelXp: 100, maxBet: 1000 },
  jackpot: 0,
}

const spinResponseBody = {
  roundId: 'r1',
  stops: [0, 0, 0],
  grid: [['seven', 'seven', 'seven']],
  wins: [],
  totalBet: 10,
  totalWin: 0,
  wallet: { coins: 990, gems: 0 },
  seedHash: 'hash',
  nonce: 1,
  jackpot: 0,
}

function authHeaderOf(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined
  const headers = init?.headers as Record<string, string> | undefined
  return headers?.Authorization
}

describe('authedFetch (via getMe/spin)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    // 다음 테스트 파일/케이스에 이전 핸들러가 새지 않게 기본값(재인증 불가)으로 되돌린다.
    registerReauthHandler(() => Promise.resolve(null))
    vi.clearAllMocks()
  })

  it('reauthenticates once after a 401 and retries with the new token', async () => {
    const reauth = vi.fn().mockResolvedValue('new-token')
    registerReauthHandler(reauth)

    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' }, 401))
      .mockResolvedValueOnce(jsonResponse(meResponseBody, 200))

    const result = await getMe('stale-token')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(reauth).toHaveBeenCalledTimes(1)
    expect(authHeaderOf(fetchSpy.mock.calls[0]!)).toBe('Bearer stale-token')
    expect(authHeaderOf(fetchSpy.mock.calls[1]!)).toBe('Bearer new-token')
    expect(result.user.id).toBe('u1')
  })

  it('reauthenticates once after a 404 USER_NOT_FOUND and retries with the new token', async () => {
    const reauth = vi.fn().mockResolvedValue('new-token')
    registerReauthHandler(reauth)

    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ error: 'User not found', code: 'USER_NOT_FOUND' }, 404))
      .mockResolvedValueOnce(jsonResponse(meResponseBody, 200))

    const result = await getMe('stale-token')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(reauth).toHaveBeenCalledTimes(1)
    expect(result.wallet.coins).toBe(1000)
  })

  it('does not treat an unrelated 404 code as a stale token', async () => {
    const reauth = vi.fn()
    registerReauthHandler(reauth)

    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'Game not found', code: 'GAME_NOT_FOUND' }, 404))

    await expect(getMe('token')).rejects.toBeInstanceOf(ApiClientError)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(reauth).not.toHaveBeenCalled()
  })

  it('propagates the original error when reauth fails', async () => {
    const reauth = vi.fn().mockResolvedValue(null)
    registerReauthHandler(reauth)

    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' }, 401))

    await expect(getMe('stale-token')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(reauth).toHaveBeenCalledTimes(1)
  })

  it('reuses the same request body (including idempotencyKey) on the reauth retry for spin', async () => {
    const reauth = vi.fn().mockResolvedValue('new-token')
    registerReauthHandler(reauth)

    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ error: 'User not found', code: 'USER_NOT_FOUND' }, 404))
      .mockResolvedValueOnce(jsonResponse(spinResponseBody, 200))

    const result = await spin('stale-token', 'classic-777', { totalBet: 10, idempotencyKey: 'key-1' })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const firstBody = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string)
    const secondBody = JSON.parse((fetchSpy.mock.calls[1]![1] as RequestInit).body as string)
    expect(firstBody).toEqual({ totalBet: 10, idempotencyKey: 'key-1' })
    expect(secondBody).toEqual({ totalBet: 10, idempotencyKey: 'key-1' })
    expect(authHeaderOf(fetchSpy.mock.calls[1]!)).toBe('Bearer new-token')
    expect(result.roundId).toBe('r1')
  })
})
