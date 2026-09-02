import type { TelegramUser } from './initData.js'

export interface DevMockResult {
  ok: true
  user: TelegramUser
  authDate: number
}

const MOCK_PREFIX = 'mock:'

/**
 * `API_ALLOW_DEV_MOCK=true`일 때만 `mock:<telegramId>:<firstName>` 형태의
 * initData를 서명 검증 없이 통과시킨다. 플래그가 꺼져 있으면 절대 통과하지 않는다.
 */
export function tryDevMockAuth(initData: string, allowDevMock: boolean): DevMockResult | null {
  if (!allowDevMock) return null
  if (!initData.startsWith(MOCK_PREFIX)) return null

  const rest = initData.slice(MOCK_PREFIX.length)
  const [telegramIdRaw, ...nameParts] = rest.split(':')
  if (!telegramIdRaw) return null

  const telegramId = Number(telegramIdRaw)
  if (!Number.isFinite(telegramId)) return null

  const firstName = nameParts.join(':') || `MockUser${telegramIdRaw}`

  return {
    ok: true,
    user: { id: telegramId, firstName },
    authDate: Math.floor(Date.now() / 1000),
  }
}
