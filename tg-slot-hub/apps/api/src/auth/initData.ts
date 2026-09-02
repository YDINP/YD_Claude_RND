import { createHmac, timingSafeEqual } from 'node:crypto'
import { INIT_DATA_MAX_AGE_SEC } from '@tgslot/shared'

/** Telegram initData의 `user` 필드를 파싱한 결과 */
export interface TelegramUser {
  id: number
  firstName: string
  lastName?: string
  username?: string
  languageCode?: string
}

export interface InitDataOk {
  ok: true
  user: TelegramUser
  authDate: number
  startParam?: string
}

export interface InitDataFail {
  ok: false
  reason: string
}

export type InitDataResult = InitDataOk | InitDataFail

export interface ValidateInitDataOptions {
  /** 테스트용 현재 시각 오버라이드 (epoch seconds) */
  now?: number
  maxAgeSec?: number
  /** auth_date가 서버 시각보다 이만큼(초) 넘게 미래면 거부. 기본 300초 (시계 오차 허용치) */
  futureToleranceSec?: number
}

/** Telegram Mini App initData 서명에 쓰이는 고정 HMAC 키 문자열 */
const WEBAPP_DATA_SECRET_KEY = 'WebAppData'

/** auth_date가 서버 시각보다 이 값(초)을 넘게 미래인 경우 위조로 간주해 거부한다 */
const DEFAULT_FUTURE_TOLERANCE_SEC = 300

/**
 * Telegram 공식 initData 검증 알고리즘.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(
  initData: string,
  botToken: string,
  opts: ValidateInitDataOptions = {}
): InitDataResult {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(initData)
  } catch {
    return { ok: false, reason: 'malformed_init_data' }
  }

  const hash = params.get('hash')
  if (!hash) {
    return { ok: false, reason: 'missing_hash' }
  }
  params.delete('hash')

  const dataCheckString = buildDataCheckString(params)
  const computedHash = computeHash(dataCheckString, botToken)

  if (!hashesMatch(hash, computedHash)) {
    return { ok: false, reason: 'invalid_signature' }
  }

  const authDateRaw = params.get('auth_date')
  if (!authDateRaw) {
    return { ok: false, reason: 'missing_auth_date' }
  }
  const authDate = Number(authDateRaw)
  if (!Number.isFinite(authDate)) {
    return { ok: false, reason: 'invalid_auth_date' }
  }

  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const maxAgeSec = opts.maxAgeSec ?? INIT_DATA_MAX_AGE_SEC
  const futureToleranceSec = opts.futureToleranceSec ?? DEFAULT_FUTURE_TOLERANCE_SEC

  if (authDate - now > futureToleranceSec) {
    return { ok: false, reason: 'auth_date_in_future' }
  }
  if (now - authDate > maxAgeSec) {
    return { ok: false, reason: 'expired' }
  }

  const userRaw = params.get('user')
  if (!userRaw) {
    return { ok: false, reason: 'missing_user' }
  }

  let userJson: unknown
  try {
    userJson = JSON.parse(userRaw)
  } catch {
    return { ok: false, reason: 'invalid_user_json' }
  }

  const user = parseTelegramUser(userJson)
  if (!user) {
    return { ok: false, reason: 'invalid_user_shape' }
  }

  const startParam = params.get('start_param') ?? undefined

  return { ok: true, user, authDate, startParam }
}

/**
 * 테스트/개발용 initData 서명 생성 헬퍼. 실제 Telegram 클라이언트가 만드는 것과
 * 동일한 알고리즘으로 hash를 계산해 붙인다.
 */
export function buildInitData(params: Record<string, string>, botToken: string): string {
  const entries = Object.entries(params).filter(([key]) => key !== 'hash')
  const searchParams = new URLSearchParams(entries)
  const dataCheckString = buildDataCheckString(searchParams)
  const hash = computeHash(dataCheckString, botToken)
  searchParams.set('hash', hash)
  return searchParams.toString()
}

function buildDataCheckString(params: URLSearchParams): string {
  const keys = Array.from(new Set(params.keys())).sort()
  const pairs: string[] = []
  for (const key of keys) {
    const value = params.get(key)
    if (value === null) continue
    pairs.push(`${key}=${value}`)
  }
  return pairs.join('\n')
}

function computeHash(dataCheckString: string, botToken: string): string {
  const secretKey = createHmac('sha256', WEBAPP_DATA_SECRET_KEY).update(botToken).digest()
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
}

function hashesMatch(receivedHex: string, computedHex: string): boolean {
  if (!/^[0-9a-f]+$/i.test(receivedHex)) return false
  const received = Buffer.from(receivedHex, 'hex')
  const computed = Buffer.from(computedHex, 'hex')
  if (received.length !== computed.length) return false
  return timingSafeEqual(received, computed)
}

function parseTelegramUser(value: unknown): TelegramUser | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'number' || typeof record.first_name !== 'string') return null

  return {
    id: record.id,
    firstName: record.first_name,
    lastName: typeof record.last_name === 'string' ? record.last_name : undefined,
    username: typeof record.username === 'string' ? record.username : undefined,
    languageCode: typeof record.language_code === 'string' ? record.language_code : undefined,
  }
}
