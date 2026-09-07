import type { TelegramUser } from './initData.js'

export interface DevMockResult {
  ok: true
  user: TelegramUser
  authDate: number
}

const MOCK_PREFIX = 'mock:'

/**
 * `API_ALLOW_DEV_AUTH=true`일 때만 `mock:<telegramId>:<firstName>` 형태의
 * initData를 서명 검증 없이 통과시킨다. 플래그가 꺼져 있으면 절대 통과하지 않는다.
 *
 * 스핀 결과 강제(`API_ALLOW_DEBUG_SPIN`)와는 **다른 플래그**다. 둘을 한 스위치로 묶으면
 * 한쪽만 쓰려다 다른 쪽까지 열리고, 그 조합이 곧 "임의 유저로 로그인해 원하는 결과를 뽑기"다.
 */
export function tryDevMockAuth(initData: string, allowDevAuth: boolean): DevMockResult | null {
  if (!allowDevAuth) return null
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
